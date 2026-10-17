# Provider namespaces created after the settings were saved — issue #373

[简体中文](./README.zh-CN.md) | [Verification record](./verification.json)

Issue #373 reports a Hindsight bank of 2,100 memories that stayed out of recall for 13 days. The bank was created on the Hindsight side after the Provider's settings had been saved in DSH. Restarts did not help: dsh-mnemon looked for a Provider's namespaces only when its settings were saved.

Baseline: main `20e4ab67`. Fix: `71d0cb4f`; the WebUI ran on a build of `33f5b1bf`, whose code is the same, before the presentation test baseline was updated. The runs took place on 2026-10-14 (Asia/Shanghai):
- macOS 15.6 arm64 and Node 24.19.0;
- headless Chrome at 1280×900, zh-CN, light;
- DSH 0.2.1-alpha.2 (npm `alpha`) through `scripts/serve-e2e.mjs`;
- OpenViking 0.4.20 in `api_key` mode with a local root key, so DSH lists the users of account `default` through the admin API, with Ollama `nomic-embed-text` embeddings.

## Cause

Saving a Provider's settings asks it for its namespaces and mounts each one as a Memory Space. Nothing asked again afterwards. A namespace created on the Provider side later had no way into the directory, short of saving the settings once more.

## Fix

The Memory Spaces Source asks every enabled Provider again on request. It mounts only the namespaces that nothing in its directory reads yet:
- A new space starts inactive, so recall reads it only once someone switches it on, and per-turn cost does not grow by itself.
- Mounted spaces keep their activation, names, descriptions and settings.
- A space made by hand counts as the namespace it names: the same bank, workspace, user, tag, memory URI or folder, whatever its other settings, such as a recall budget or a single peer.
- A namespace someone disconnected, whether discovered or made by hand, stays disconnected until the Provider's settings are saved again. These disconnects live in `state/memory-provider-disconnects.json`, next to the registry. A build that predates them rewrites the registry and would drop anything it does not know.
- Providers are asked side by side, each for at most 30 seconds. One that fails or times out keeps its spaces, and the page says why.

The Host asks once per data directory in each process, ten seconds after a runtime it serves starts. If the Source cannot be reached yet, it tries again a little later. It never asks for a read-only runtime, or while the Memory Spaces layer is off or its `maintenance` participation is not `automatic`.

On **记忆系统 → 记忆空间 → 概览** (Memory System → Memory Spaces → Overview):
- **重新发现** (Rediscover) asks on demand.
- A line above the cards says what a pass found, until someone dismisses it.
- New spaces carry **新发现** (New).
- A page that opens while the Host is asking shows the result when the Host is done.

## Method

The user `alice` of OpenViking account `default` stands in for a bank that exists when the settings are saved. Two more users stand in for banks created later. Each run serves a new WebUI fixture against the same OpenViking 0.4.20 server, once on main and once on the fix:

1. Before the run, the server holds only `alice`.
2. Under **插件 → 可组合记忆 → 记忆空间** (Plugins → Composable memory → Memory Spaces), switch OpenViking on. Give it the server address, the root key and account `default`, and leave the key-bound user empty, so discovery lists the account's users. Click **保存并启用** (Save and enable). `alice` is mounted, active.
3. Create the user `research` through the OpenViking admin API. Open **记忆系统 → 记忆空间 → 概览**.
4. On the fix only:
   1. Click **重新发现**.
   2. Disconnect `research` from its card with **断开 → 确认断开** (Disconnect → Confirm).
5. Create the user `ops`. Restart DSH with the fixture's restart signal, which keeps its data. Open the same page a little more than ten seconds later.

## Before and after

| | main | Fix |
|---|---|---|
| `research` created on the Provider side | ![Only alice, 1 / 1 已激活; no 重新发现 button](./before.jpg) | ![After 重新发现: 发现 1 个新空间，尚未加入召回，打开开关即可启用。 alice active; research 未激活, 新发现](./after-rediscover.jpg) |
| `ops` created, DSH restarted | The same page as above: only `alice` | ![After the restart: 发现 1 个新空间… and 1 个断开过的空间保持断开；重新保存对应 Provider 的设置可以恢复。 alice active; ops 未激活, 新发现](./after-restart.jpg) |

On main, the page stayed the same after both steps; the two screenshots are identical pixel for pixel. Only `alice` is listed (1 / 1 已激活). There is no way to look again short of saving the settings, and the restart changes nothing.

With the fix:
- **重新发现** mounted `research`, switched off and marked **新发现**, and the line above the cards said so.
- After the restart, the Host's own pass mounted `ops` the same way, with no click.
- `research`, disconnected before the restart, stayed disconnected, and the page said so.
- `alice` stayed active throughout.

## Automated checks

The Source and its page — `plugins/dsh-mnemon-source-memory-spaces/tests/provider-rediscovery.spec.ts` and `rediscovery-page.spec.tsx`, 19 tests:
- what is mounted and left alone;
- spaces made by hand for Hindsight, Honcho and Mem0;
- disconnects, including ones made by hand and ones an earlier build rewrites around;
- namespaces that share one connection;
- side-by-side Providers, a timeout, and joining or leaving a running pass;
- read-only deployments and the management mutation;
- the page: its notice, a pass that started elsewhere, and a page opened while the Host is asking, whose switches still work afterwards.

The Host — `tests/provider-rediscovery-host.spec.ts`, 7 tests:
- once per data directory;
- read-only runtimes, a layer that is off, and `maintenance` that is `manual` or `off`;
- retries while the Source cannot be reached, and their limit;
- a pass cut short when a runtime is replaced;
- an older Source;
- the start-up pass on a real composition.

On main, 18 of the 19 Source and page tests fail; the read-only page test passes, since there is no button there either. The Host spec does not run on main, which has no start-up pass.

A review of the first version, `ca57972d`, found six problems to fix:
- duplicate spaces for ones made by hand;
- forgotten disconnects of spaces made by hand;
- disconnects an earlier build would drop;
- a start-up pass that ignored participation;
- a page stuck on 正在发现… (Rediscovering…);
- failure text that blamed the Provider for not answering when it had answered with an error.

On `ca57972d`, 11 of the 19 Source and page tests fail. So do the Host tests for participation and retries.

## Limits

- Honcho and OpenViking list their first 100 namespaces, as when the settings are saved.
- OpenViking's discovery sets the agent peer to `dsh`. A space made by hand for the same user with another agent peer does not count as that user's namespace, so the namespace is mounted beside it, inactive.
- A start-up failure shows again after every restart while a Provider stays down. That keeps a broken Provider visible; dismissing the line hides that pass only.
- The pass runs ten seconds after a runtime starts serving a data directory, not on a schedule. A namespace created while DSH runs appears after **重新发现** or the next start.
- The **快照可观察范围** (Snapshot scope) card shows 连接不可用 (connection unavailable) for `alice` on main and on the fix alike. That has nothing to do with this change.
