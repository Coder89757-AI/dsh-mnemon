# The Memory System after a sync or an import on the Plugins page

[简体中文](./README.zh-CN.md) | [Verification record](./verification.json)

This turned up while checking the fix for issue #370. A screen of the Memory System, taken after a Git sync, still listed the Memory Spaces from before the sync. The sync had brought a space in, and the page showed it only after **刷新** (Refresh).

Baseline: main `20e4ab67`. Fix: `4cfd979b`. The runs took place on 2026-10-13 (Asia/Shanghai):
- macOS 15.6 arm64 and Node 24.19.0;
- headless Chrome at 1280×900, zh-CN, light;
- DSH 0.2.1-alpha.2 (npm `alpha`) through `scripts/serve-e2e.mjs`, with the real Mnemon CLI 0.2.10;
- a local bare repository standing in for `https://git.example.com/demo/memory.git` through Git's `url.<base>.insteadOf`.

## Cause

The Memory System stays mounted while DSH shows the Plugins page. Coming back to it reads the header status again, but not the open page: reloading that page asks every Provider again. The open page reloads only on **刷新**, or when the change signal it shares with the configuration moves.

Until now only a component switched on DSH's list moved that signal. Four actions write memory from the Plugins page, and none of them moved it:
- a sync;
- a merge from **检查远端** (Check remote);
- a ZIP import;
- applying a **记忆整理** (Memory reconciliation) plan.

## Fix

These four now move the same signal, so the Memory System reloads its open page as soon as one finishes, even while it is hidden.

A sync, an import and a plan move the signal even when they report a failure, because each can write before it fails:
- a sync merges the branch in before it publishes anything;
- a plan keeps the operations that ran before the one that failed;
- an import reads Memory Spaces again after it writes, and that read can fail on its own.

Checking the remote or a ZIP writes nothing, so it moves nothing.

The configuration page also reads its own data again. It keeps showing the old data while it does, so the line that says what the sync did stays on screen.

## Method

1. On the machine named MacBook, serve the WebUI on main and switch **Git 同步** on. Use the real CLI to create a Mnemon space, **Release checklist**, with three memories. Connect `https://git.example.com/demo/memory.git` and click **立即同步** (Sync now). Then copy the bare repository, so both runs below start from the same remote.
2. On the machine named Studio, run the following once on main and once on the fix:
   1. Open **记忆系统 → 记忆空间** (Memory System → Memory Spaces). It shows 0 / 0 已激活 (active).
   2. Open the configuration with the gear and switch **Git 同步** on.
   3. Connect the same address and click **立即同步**.
3. Click **记忆系统** in the sidebar, the way a person comes back, without switching tabs or clicking **刷新**.
4. Click **刷新** in the Memory System header.

## Before and after

| | main | Fix |
|---|---|---|
| Back in the Memory System after the sync | ![0 / 0 已激活, 还没有记忆空间](./before-return.jpg) | ![1 / 1 已激活, Release checklist, 3 条记忆](./after-return.jpg) |

On main, the space appears only after **刷新**:

![1 / 1 已激活 after 刷新 on main](./before-refresh.jpg)

The sync row looks the same in both runs. With the fix, it keeps its line after the configuration page reads its data again:

![已同步，推送了 d5b3fb36。](./synced.jpg)

## Automated checks

`tests/client-sync.spec.tsx`, "Memory this page changed", checks that:
- a sync and a merge from **检查远端** tell the Memory System, but reading the comparison does not;
- a sync whose push was refused, and one that failed, tell it too;
- a sync started inside the comparison tells it once;
- applying a plan tells it, also when the plan stops partway, but accepting the plan does not;
- through the real configuration page, a sync and an applied plan each move the signal, and the sync's line stays.

`tests/client-settings.spec.tsx` checks that:
- checking a ZIP leaves the signal where it was;
- importing it moves the signal once, and the page keeps saying what the import did;
- an import that reports a failure still moves it.

All eight tests fail on main. `tests/client.spec.tsx` already checks that the Memory System reloads its open page when the signal moves while it is hidden.

## Limits

- An automatic sync runs on the Host in the background, and the page does not hear about it. **刷新** still shows what it brought.
- The signal stays within one page. Another browser tab or window on the same Host does not see it until it is refreshed.
