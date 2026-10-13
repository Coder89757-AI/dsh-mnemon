# OpenViking search when the server lists a file it no longer holds

[简体中文](./README.zh-CN.md) | [Verification record](./verification.json)

This turned up while checking the fix for issue #353 against a real OpenViking server. A probe had written two memories, and one of their files was later gone from the server's workspace. The server's index still listed that file. From then on, every search of that Memory Space failed with `File not found`, and the space looked unreachable.

Baseline: main `20e4ab67`. Fix: `b49954b7`. The runs took place on 2026-10-13 (Asia/Shanghai):
- macOS 15.6 arm64 and Node 24.19.0;
- headless Chrome at 1280×900, zh-CN, light;
- DSH 0.2.1-alpha.2 (npm `alpha`) through `scripts/serve-e2e.mjs`;
- OpenViking 0.4.20 in dev mode, with Ollama `nomic-embed-text` embeddings.

## Cause

A search asks OpenViking for the matching memories, then reads the content of each match. The driver waited for all the reads together, so one read that failed rejected the whole search, and the readable matches were lost with it. Browsing a space on the **内容** (Contents) page lists the files and reads them in the same way.

## Fix

Each read settles on its own:
- a memory that cannot be read is left out;
- a search says how many memories were left out, and why;
- when no memory can be read at all, the first failure is reported as before, so a server that cannot be reached never looks like an empty space;
- a cancelled search still stops.

## Method

1. Write two memories to `viking://user/default/memories` with the OpenViking Provider:
   - "Release gate: the canary stays green for two hours before a release ships."
   - "Release gate: a red canary rolls the release back without a vote."
2. Remove the second memory's file from the server's workspace. The server's index still lists it.
3. Serve the WebUI once on main and once on the fix. Under **插件 → 可组合记忆 → 记忆空间** (Plugins → Composable memory → Memory Spaces), switch OpenViking on and connect it. The server runs in dev mode, so a key bound to the user `default` is enough.
4. Open **记忆系统 → 记忆空间 → 检索** (Memory System → Memory Spaces → Search). Search for `release gate canary` with **直接检索** (Direct search).

## Before and after

| | main | Fix |
|---|---|---|
| Direct search | ![default · OpenViking · 连接不可用, 没有命中](./before-search.jpg) | ![default · OpenViking · 1 条可观察, one result: Release gate: the canary stays green for two hours before a release ships.](./after-search.jpg) |

On main, the space's card says 连接不可用 (connection unavailable). Its tooltip reads `File not found: viking://user/default/memories/entities/…-release-gate-a-red-canary-rolls-the-release-back-….md`.

With the fix, the card says 1 条可观察 (1 result) and the readable memory appears. The tooltip reads: "1 OpenViking result could not be read and was left out; the server's index can list a file it no longer holds."

## Automated checks

`plugins/dsh-mnemon-provider-openviking/tests/driver.spec.ts` has two new tests:
- "leaves out a memory the server lists but can no longer read, and says so" covers search and browsing.
- "reports why when no listed memory can be read, and stops a cancelled read".

Before the WebUI runs, a probe against the same OpenViking 0.4.20 server returned the readable memory and the hint with the fix. On main, it failed with `File not found`.

## Limits

- The hint is in English and shows only as the card's tooltip, like other Provider hints.
- The stale entry stays in OpenViking's index. The fix only keeps it from hiding the memories that can still be read.
- Only search was run in the WebUI. Browsing on the **内容** page takes the same path and is covered by the tests.
