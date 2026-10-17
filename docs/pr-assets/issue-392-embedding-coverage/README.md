# Vector coverage for every Memory Space — issue #392

[简体中文](./README.zh-CN.md) | [Verification record](./verification.json)

Issue #392 ran `mnemon embed --status`, read `"coverage": "100%"` with 94 of 94 memories embedded, and took the memory as healthy. The memories it kept writing went to another store, where 31 of 64 had no vector, and `mnemon embed --all` answered that every memory already had one: both commands look at one Store, and neither says which. The issue asked for that scope to be visible, so that a full count for one store never reads as the health of all of them.

dsh-mnemon shows the same count. Settings → the Memory Spaces page → Mnemon Native → **测试状态** (Test status) ran `mnemon embed --status` once, for Mnemon's own Store, while every Mnemon Native space is a Store of its own. The CLI's output itself belongs to the Mnemon CLI and is left to it.

Baseline: main `4feee034`. The branch is built on #391 (`2c625b4d`): a fill rewrites each memory's update time, and without #391 the next Git sync keeps a copy of the space. Fix: `2cb1b847`, `0a033fc8` and `b083b95b`, then `28fe25f9` after review. The runs took place on 2026-10-17 (Asia/Shanghai):
- macOS 15.6 arm64, Node 24.19.0 and Mnemon CLI 0.2.10;
- headless Chrome at 1280×800, zh-CN, light;
- DSH 0.2.1-alpha.2 (npm `alpha`) through `scripts/serve-e2e.mjs --docs-demo` with the real CLI;
- [harness/fake-embeddings.py](./harness/fake-embeddings.py), a stand-in for Ollama on 127.0.0.1, as the embedding service of the WebUI run, and [harness/fake-ollama.py](./harness/fake-ollama.py) for the CLI probes: one that answers, one that lacks the model, and one that takes 0.75 s per vector.

## Cause

[harness/status-scope.sh](./harness/status-scope.sh) makes two Stores with the real CLI, two memories in `default` and three in `other`, none with a vector. `mnemon embed --status` counts two memories; `--store other` counts three. A `--store` for a Store that does not exist creates it: after `mnemon --store nosuch embed --status` the data directory holds `default`, `nosuch` and `other`.

## Fix

- **Test status** counts every Mnemon Native space whose database exists, each with `--store <id>`. The total covers all of them, and a list under it names each space with its count, an inactive space included. A space that lacks vectors is marked. One that cannot be counted shows Mnemon's reason without its usage text and stays out of the total, which a line under the list says. Rows floor their percent as the total does.
- No count creates a Store. A space whose database is missing is not read, and the check runs again once the call holds the storage lock, so a space removed while the call waited is skipped. With no space to count, the embedding runtime is asked in a scratch data directory.
- A space that lacks vectors gets **补齐** (Fill in) while the embedding service answers. The Host runs `embed --all` for that space with its own storage root and, when DSH manages the embedding, its endpoint, model and key; a terminal `mnemon embed --all` may reach neither. Mnemon fills at most 100 vectors a call, so a fill goes in steps, each no longer than one Mnemon call (`timeoutMs`, at most ten seconds), until none is missing, a step writes none, or a minute is up. Other memory work takes the storage lock between the steps. [harness/embed-all-timeout.sh](./harness/embed-all-timeout.sh) stops `embed --all` after 1.5 s against the 0.3 s service: the 4 vectors written before stay, so a stopped step loses nothing.
- A line under the list says what the fill did: how many vectors it filled in; how many are still missing, in which case **补齐** goes on; or that the service returned none, which reads as a failure and names the model.
- The hint says what a missing vector costs, semantic matching, and promises a fill only where the page can make one. The **补齐** and **测试状态** labels stay on one line, the inactive marker sits beside the name instead of shortening with it, a narrow row moves its count to a line of its own, and **测试状态** waits for a running fill.

## Method

1. `pnpm e2e:serve --docs-demo` seeds three Mnemon Native spaces with the real CLI and no embedding service answering, so no memory has a vector: Lumen 项目 (`default`, 10 memories), 团队约定 (5) and 调研归档 (2, inactive).
2. The real CLI fills in Lumen 项目 only: `mnemon --data-dir <storage root> --store default embed --all` with the fake service, as a user who ran it for Mnemon's default Store would.
3. Under **插件 → 可组合记忆** (Plugins → Composable memory) the gear of **记忆空间** opens its page. Mnemon Native is expanded, **由 DSH 管理嵌入配置** (Manage embedding settings in DSH) is switched on, the endpoint is set to the fake service and applied, and **测试状态** is clicked.
4. On the fix, **补齐** on 团队约定's row is clicked.

The baseline ran the same build with the Memory Spaces service, contracts, runner and Source, `src/client/component-settings.tsx`, its stylesheet, `src/client/locales.ts`, `src/client/api.ts` and `src/host/rpc.ts` from main.

[harness/real-cli-fill.probe.ts](./harness/real-cli-fill.probe.ts) runs the Memory Spaces service on the real CLI against the three probe services, and [harness/fill-then-sync.probe.ts](./harness/fill-then-sync.probe.ts) merges a space published before a fill into the space after it, as the next Git sync does.

## Before and after

| main | Fix |
|---|---|
| ![嵌入服务可用 · 已嵌入 10/10（100%）, and nothing else](./before-status.jpg) | ![已嵌入 10/17（58%）, then Lumen 项目 10/10, 团队约定 0/5 and 调研归档 未激活 0/2, each with 补齐](./after-status.jpg) |

On main the status reads 已嵌入 10/10（100%）: Lumen 项目's count, which the CLI had just filled in, while 7 memories in the two other spaces have no vector. With the fix the total reads 10/17（58%）, and the list shows where the gap is. After **补齐** on 团队约定 the counts are read again, and the line under the list says 已为「团队约定」补齐 5 条向量。:

![已嵌入 15/17（88%）: 团队约定 5/5（100%）, 调研归档 未激活 still 0/2 with 补齐, and the fill's line](./after-filled.jpg)

## Real CLI

- **Status:** Default (3 memories), Work (2 of 3 with a vector), Notes (inactive, 1), Broken (not a database) and Gone (registered, no database), with the active file naming a Store that does not exist. Work reads 66%, as the total floors; Broken reads `open database: migrate: file is not a database (26)` and stays out of the total, 2 of 7 (28%). The data directory holds the same four Stores before and after.
- **No database:** a registry whose only space has no database reads 0/0 with no rows, and the data directory gains no Store.
- **130 missing:** one fill wrote all 130 vectors, in two calls of Mnemon's 100.
- **Model missing:** the service that answers the probe but not the vectors gave `filled: 0, remaining: 4, stopped: "refused"`.
- **Service down:** the fill failed with Mnemon's reason alone, `Ollama embedding provider not available at http://127.0.0.1:9 — install with: brew install ollama && ollama pull nomic-embed-text`.
- **Slow service, 0.75 s per vector:** the fill stopped after 51 s with 65 of 130 written and `stopped: "time"`. A search on another space, asked for one second in, waited 9.8 s for the step in progress. Before the review the same search waited 59.8 s.
- **Sync after a fill:** after `embed --all` rewrote the update times, merging the Pack published before it left one space. With `src/host/space-identity.ts` from main the merge kept a second "AI Gateway routing", which is why the branch is built on #391.

A copy of the list's rules rendered at 360 px wide: the **补齐** label keeps its line; a row of "Customer research notes", 未激活, 已嵌入 1203/2950（40%） and **补齐** shows the whole name with the count and button on a second line; a space that cannot be read shows its name, with the reason on the line below. At 560 px every row keeps one line.

## Automated checks

- `plugins/dsh-mnemon-source-memory-spaces/tests/service.spec.ts`:
  - the status counts each registered space with a call of its own: an inactive space, a space whose database is missing (never read, no Store created) and one whose count fails, shown with Mnemon's reason and left out of the total; rows floor their percent;
  - with no space to count, the runtime is asked in a scratch data directory that goes again;
  - a space removed while its calls waited for the lock is neither counted nor filled, and no Store is created;
  - a fill writes 130 vectors in two steps, a recall asked for during the first step runs before the second, and each step is bounded by one configured call;
  - a step stopped at its time keeps its vectors, a longer configured time does not lengthen a step, and the fill stops once its minute is up;
  - a service that returns no vector gives `refused`, a service that is down fails with Mnemon's reason, and a space with nothing missing runs nothing;
  - a space without a database and a read-only deployment are refused before the CLI runs.
- `tests/client-settings.spec.tsx`: the list, the inactive marker beside the name, the marks, the hint and the unread note; **补齐** is busy and **测试状态** waits during a fill, then the counts are read again and the line says what it did; a fill that stopped early, one that the service refused and one that failed each have their line; a status that finds the service down offers no **补齐**, and a read-only Host promises none.
- `tests/rpc.spec.ts`: `embedding-fill` goes through the write channel to the Source, and the read channel refuses it.
- `tests/client-presentation.spec.ts`: the copy baseline moves to 1,338 keys per language.

All twelve new or changed tests fail with the sources from main. With the sources of the first version, `b083b95b`, ten fail: the read-only refusal and the RPC channel pass on both.

## Review

An independent review of the first version reproduced, with the real CLI:
- a fill that wrote nothing still read as success when the service lacked the model;
- one fill embedded at most 100 vectors;
- a fill held the storage lock for up to a minute, so a recall waited 59.8 s;
- a stopped fill read as a failure though it kept its vectors;
- a count error carried Mnemon's whole usage text;
- the first count could still create a Store when the active file named one without a database.

It also found that a fill without #391 makes the next sync keep a copy of the space, and listed copy, layout and accessibility nits. `28fe25f9` fixes all of them, and the branch now builds on #391.

## Limits

- `mnemon embed --status` and `embed --all` in a terminal still count and fill one Store without naming it; that output belongs to the Mnemon CLI.
- A fill runs for at most a minute; a large space or a slow service may need more than one press. Each step can hold the storage lock for up to ten seconds.
- The refused line names the model, the usual cause, but cannot tell it from other reasons a service returns no vector.
- Only Mnemon Native spaces have vectors here; other Providers keep their own indexes and are not listed.
- Test status reaches every Native space's Store once per click, and each count asks the embedding service whether it answers.
