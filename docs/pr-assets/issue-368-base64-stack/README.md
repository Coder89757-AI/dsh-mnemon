# Git sync of a Mnemon Pack past 4.5 MB of base64 — issue #368

[简体中文](./README.zh-CN.md) | [Issue #368](https://github.com/omdsh-dev/dsh-mnemon/issues/368) | [Verification record](./verification.json)

Issue #368 reports that Git sync fails with `Maximum call stack size exceeded` once the Mnemon Pack's base64 passes about 4.4 MB, every time. `decodeArchive` checked the payload with a pattern that repeats a four-character group, and V8 keeps a backtracking entry for each repetition.

Baseline: main `20e4ab67`. Fix: `1358ba7e`. The runs took place on 2026-10-13 (Asia/Shanghai):
- macOS 15.6 arm64 and Node 24.19.0 (V8 13.6);
- headless Chrome at 1280×900, zh-CN, light;
- DSH 0.2.1-alpha.2 (npm `alpha`) through `scripts/serve-e2e.mjs`, with the real Mnemon CLI 0.2.10;
- a local bare repository standing in for `https://git.example.com/demo/memory.git` through Git's `url.<base>.insteadOf`.

## Cause

`/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u` overflows the stack at 4,473,916 base64 characters, a ZIP of about 3.4 MB. Push compares against the remote, pull and the status check each decode the remote payload, so once a sync published such a Pack, every later sync and every ZIP import of it failed.

## Fix

The check is the length being a whole number of groups plus one character class with at most two `=` at the end: `/^[A-Za-z0-9+/]*={0,2}$/`, without the `u` flag. Under that flag, V8 13 (Node 24) still recurses per character on a string that holds a character above U+00FF. The check accepts and refuses the same strings as the old pattern.

## Method

1. Serve the WebUI with `MNEMON_CLI_PATH=<mnemon> pnpm e2e:serve`, once on the baseline and once on the fix, with `GIT_CONFIG_GLOBAL` mapping the demo address to a fresh bare repository.
2. Open **插件 → 可组合记忆 (dsh-mnemon)** and switch **Git 同步** on.
3. Create the space: `node harness/big-space.mjs <storage root> routing 路由笔记 2000`. This writes a Mnemon 0.2.10 space of 2,000 memories, each with a 768-dimension embedding, and registers it. The embeddings do not compress, so the database is 8.1 MiB and the Pack's base64 passes the threshold. The Memory Spaces page lists it as 2000 条记忆, 8.5 MB, 存储正常.
4. Choose **仓库地址**, enter `https://git.example.com/demo/memory.git` and connect.
5. Click **立即同步** twice. The first sync publishes the Pack; the second reads it back from the remote.

## Before and after

| | main | Fix |
|---|---|---|
| The second sync | ![同步失败：Maximum call stack size exceeded](./before-sync.jpg) | ![已是最新，仓库与本机一致。](./after-sync.jpg) |

The space both runs synced:

![路由笔记: Mnemon Native, 存储正常, 2000 条记忆, 8.5 MB](./space.jpg)

## The check on its own

[`harness/base64-check.mjs`](./harness/base64-check.mjs) runs the old pattern, the same check with the `u` flag, and the final check on the same strings, on Node 24.19.0:

| Input | Old pattern | With `u` | Final check |
|---|---|---|---|
| 4 MB of base64 | ok | ok | ok (2 ms) |
| 4.5 MB | `RangeError` | ok | ok (3 ms) |
| 6 MB | `RangeError` | ok | ok (4 ms) |
| 64 MB, the transport limit | `RangeError` | ok | ok (42 ms) |
| 9 Mi characters ending in `中` | `RangeError` | `RangeError` | refused as not base64 (13 ms) |
| 64 Mi characters ending in `中` | `RangeError` | `RangeError` | refused as not base64 (99 ms) |

The old pattern and the final check accept or refuse 14 edge cases identically: `AA==`, `AAA=`, `AAAA`, `A===`, `====`, `AAAAA===`, `AA=A`, `AAA`, a newline, `AAAAAA==`, `AB==`, a leading `中`, a trailing NUL and the empty string.

## Automated checks

`tests/pack.spec.ts` exports a Memory Space of 5 MB of incompressible data, then inspects and imports it on a second machine. It also checks:
- padding in the middle and a broken group length are refused;
- the largest payload the transport allows passes the check;
- a string holding `中` is refused as base64.

The test fails on main with `RangeError: Maximum call stack size exceeded`, and its two-byte assertion also fails on the check with the `u` flag.

## Limits

- Every machine that syncs the branch needs the fix to read such a Pack; older versions still fail on it.
- Only macOS was run; the report came from Windows on Node 24.21. The threshold is the same on Node 24, Node 25 and DSH Desktop's Electron 44, and the fix depends on none of them.
