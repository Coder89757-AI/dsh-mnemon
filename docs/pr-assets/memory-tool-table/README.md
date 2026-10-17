# One table of memory tools

[简体中文](./README.zh-CN.md) | [Verification record](./verification.json)

Six Host and WebUI modules each kept their own copy of facts about the memory tools: the Source operation a named tool runs, the turn counter a call adds to, the named tools the View binds to each Source operation, the turn memory bar's labels and pages, and the tool names in the delegated children's tool lists and in the idle review's layers. Nothing kept the copies in step. This change, from item M4 of the technical-debt audit, puts the shared facts in one browser-safe table that the Host modules and the WebUI read, and types the children's lists and the review layers against it. Nothing changes for users or the model: tests pin what each of them sees to main, and the tests pass with main's modules too. The record also compares the named tools' schemas with the Source operations they run, as findings for later changes.

Baseline: main `f41a121f`, merged into the branch in `78025c4c`; the change was first written on `4996a796`. Change: `c89ab542`, with the review's follow-ups in `17be6818` and `6f297d40`, on 2026-10-17 (Asia/Shanghai), macOS 15.6 arm64, Node 24.19.0, pnpm 10.13.1, the pinned DSH 0.2.1-rc.1; the root tests also ran against an installed DSH 0.2.0-rc.2.

## What changed

`src/host/memory-tools.ts`, which the browser-safe `src/host/protocol.ts` re-exports, has one row per memory tool: the Source type and the Route or Action a named tool runs, whether the tool reads, inspects or writes, the page its chip opens in the turn memory bar, and its label key. The two generic View tools, `mnemon_view_route` and `mnemon_view_action`, run whichever Route or Action a call names, so their rows name no Source and no page. The delegated children's result tool, `mnemon_subagent_result`, runs no Source operation and has no row.

| Module | Before | Now |
|---|---|---|
| `src/host/tools.ts`, `src/host/activity-presentation.ts` | Each named tool restated its Source and operation for the activity its result records | `namedToolPresentation(name)` takes them from the tool's row, and accepts only the tools that read or write: an inspection records no activity |
| `src/host/activity.ts` | Three name sets and a case for Documents search picked the counter a call adds to | The row's kind and Source pick it; the generic View tools and tools without a row add to none, as before |
| `src/host/view-presentation.ts` | Two literal maps from a Source operation to the named tools bound to it | Built from the rows; tools that run the same operation are listed together, in table order |
| `src/client/MnemonTurnTail.tsx` | Its own label map and page function | The row's label and page; as before, a tool without a row shows its own name, and a tool without a page opens Memory Spaces |
| `src/host/subagent.ts` | The delegated children's tool lists, and six comparisons with a tool's name, as plain strings | The same lists, typed as rows of the table, and the comparisons through a helper that takes only names of rows |
| `src/host/review-tools.ts` | The two writes an idle review can make, as string literals | The same two names, typed as rows of the table |

The children's tool lists and the review layers stay explicit. Which tools a child may call is a policy, so a new row never reaches a child by itself, while renaming or removing a row now fails the type check where a list names it.

Two differences no one can see. The maps from a Source operation to its named tools now fill in the order memory-spaces, documents, runtime instead of runtime, documents, memory-spaces; every reader looks a Route or Action up by its id, so the View's text and its refusals are identical. And main's label map looked a name up on a plain object, so a name such as `constructor` or `__proto__` found a property of `Object.prototype`, where the table shows such a name as it is; no session can record one, because the turn activity keeps only names that start with `mnemon_`.

## Equivalence with main

Each test below pins what main produces. For the [equivalence run](./verification.json), the seven modules above were replaced by their versions on main (`f41a121f`), and the four test files that hold the new tests and the existing activity and review tests ran: 68 tests passed, as on this change. Each change that an independent review found passing every test of the first version now fails one check: [`harness/review-mutations.mjs`](./harness/review-mutations.mjs) alters the two output schemas, moves two tools to other counters, renames a tool in the space write guard, gives an inspection activity, and changes the page type on either side, and all seven fail a test or the type check.

| Test | Pins |
|---|---|
| `tests/memory-tools.spec.ts`, consistency | Every registered memory tool has a row and every row is registered, in registration order |
| `tests/memory-tools.spec.ts`, model-visible text | What DSH shows the model of all 17 tools, the result tool included: the name, the description, the input schema, the output schema that the TypeScript declarations of Code Mode type each result with, and `deferLoading`, which none sets; byte for byte against `tests/fixtures/model-tools.json`, generated with main's modules, whatever the checkout's line endings |
| `tests/memory-tools.spec.ts`, types | The table's page type equals the turn memory bar's anchor page type, and `namedToolPresentation` accepts exactly the 12 tools that read or write (type checks) |
| `tests/memory-tools.spec.ts`, activity | The kind, Source and operation each tool's activity records: the generic tools record `view-route` and `view-action` without a Source, and inspections record none |
| `tests/memory-tools.spec.ts`, every binding | The `MNEMON VIEW TOOLS` line of a View that offers every Source operation a named tool runs, and the exact offer of a second runtime instance, which stays in `MNEMON VIEW ROUTES` |
| `tests/memory-tools.spec.ts`, default View | The same line for the real default composition with a Memory Space |
| `tests/memory-tools.spec.ts`, counters | With each tool in a turn of its own, the counter each of the 16 rows adds to, and none for the result tool and another `mnemon_` tool |
| `tests/client-interaction-surfaces.spec.tsx`, every chip | The label and page of every chip in the turn memory bar, and a tool without a row showing its own name and opening Memory Spaces |

## Named tools against the Source operations they run

These are findings only; this change leaves every schema as it is. DSH checks a tool's arguments against its schema only for tools built with its `defineTool`. dsh-mnemon registers plain definitions, so a named tool's arguments reach the Host as the model sent them. Core then checks the input of a Route or Action against the Source's schema (types, enums, required and undeclared properties), and the Source validates the rest. [`harness/schema-findings.probe.ts`](./harness/schema-findings.probe.ts) made the calls quoted below, with the same outcomes on this change and with main's modules.

| Finding | Tools | Effect today | Possible fix |
|---|---|---|---|
| The tool's schema leaves undeclared properties open, and the TypeScript declarations DSH writes for Code Mode add `& Record<string, JsonValue>` to it; the Source's schema is closed | `mnemon_recall`, `mnemon_document_search`; a delegated writer's `mnemon_remember`, `mnemon_link`, `mnemon_forget`, `mnemon_memory_body_update` and `mnemon_memory_body_merge` | Refused: `memory Route input contains unsupported property: scope` for Recall, likewise `sort` for Documents search; `memory Action input contains unsupported property: confidence` for a delegated remember, likewise `reason` for a delegated Memory Space update | Hand the Source only the properties the tool or the bound Route or Action declares, so the filters the Recall Route offers, such as `category`, still reach it under the General strategy |
| `limit` is an integer in both schemas, and the Recall Route refuses one outside 1 to 20 | `mnemon_recall` | Under the General strategy a limit of 50 is refused: `value must be an integer within 1..20`. The Layered strategy caps the limit at 6 first, so there only a limit below 1, such as 0, is refused | Clamp the limit in the Route, as the Documents Route does |
| `importance` is an integer in the tool and a number in the remember Action's schema, and the Action accepts only an integer from 1 to 5 | `mnemon_remember`; the remember Action through `mnemon_view_action` | `value must be an integer within 1..5` for 3.6, which the Action's schema offers, and for 9 | Round a fraction on that scale, or declare an integer from 1 to 5 in the Action's schema, which is model-visible |
| Enums in the tool, plain strings in the Source: `category`, `source`, link `type`, related `edge` | `mnemon_remember`, `mnemon_link`, `mnemon_related` | The Sources refuse other values with a message; through the generic tools the model learns the values only from that refusal | Declare them in the Source schemas, which is model-visible |
| String items in the tool, untyped arrays in the Source: `tags`, `entities`, `memoryBodyIds`, `sourcePaths`, `branches`, `sourceMemoryBodyIds` | several | The Sources refuse anything but strings | As above |
| Ranges stated only in descriptions: `depth` 1 to 5, `weight` 0 to 1, at most 20 tags and 50 entities, 1 to 20 merge sources | `mnemon_related`, `mnemon_link`, `mnemon_remember`, `mnemon_memory_body_merge` | The Sources enforce them as the descriptions say | None needed |
| Bounds neither schema states: a Document title of 160 and a description of 600 characters, a Memory Space name of 100 and a description of 1,000, a memory of 8 KiB, a recall query of 2,000, a link reason of 1,000, tags without commas | several | Longer input is refused with a message | State them where the model reads them, which is model-visible |
| `old_text` in the tool, `oldText` in the Action | `mnemon_runtime_memory` | The Host maps it | None needed |
| Fields the Host supplies or keeps: `sessionIds`, a remember `source` of `agent`, the Document `archive` workflow, a placement `selection` | Documents and Memory Spaces tools | By design | None needed |
| Filters the Recall Route offers and the tool does not: `category`, `source`, `intent` | `mnemon_recall` | The Layered strategy drops them as brittle | None needed |
| Caps the tools state that only the Layered strategy applies: 6 recall results, 4 Documents | `mnemon_recall`, `mnemon_document_search` | Under the General strategy a Documents search with limit 10 returned all 6 matching Documents, under the Layered strategy 4; Recall returns up to 20 | Apply them in the Host, or say that they depend on the strategy |

## Not in this change

The turn memory bar still opens Memory Spaces for every chip and item of `mnemon_view_route` and `mnemon_view_action`, whichever Source served the call, because the activity those calls record names no Source. Recording the Source and routing by it would change where those items open, so it is left for a later change; for the same reason the generic rows of the table name no page. The named tools' execute paths also still name their Source and operation literally, so nothing ties a row's operation to what its tool runs, as on main. None of the findings above changes here either. Both changes are planned on the [roadmap](../../en/roadmap.md#next-gaps-from-the-october-2026-review), with details in items 5 and 6 of the [plan](../../plans/review-gaps-2026-10.md).

## Compatibility

- **Model-visible text.** Tool names, descriptions, and input and output schemas are byte-identical to main, and so are the View's named tool bindings.
- **Persisted data.** The activity metadata saved with a session is the same as main writes, for every tool; no stored setting changes.
- **Wire.** No DTO or RPC name changes. `protocol.ts` gains `MEMORY_TOOLS`, `memoryTool`, `memoryTools` and their types; they are browser-safe and on no public entry, which the [public-exports check](../remove-dead-code/harness/public-exports.mjs) confirms.
- **Public SDK.** No export is removed or renamed.
- **Interface.** The turn memory bar shows the same labels and opens the same pages. No locale key changes, so the copy fingerprint stays.
- **Version skew.** Only the Starter changes, and its Host and WebUI ship together; no plugin uses a new export, so no peer floor moves.
- **DSH releases.** The root tests pass on DSH 0.2.1-rc.1 and on an installed 0.2.0-rc.2.

## Commands and results

Every command ran through Node 24.19.0 and pnpm 10.13.1 on the final code, the merge `78025c4c`. `pnpm run verify:docs` ran again after these results were written into the record: 4,547 links, 326 anchors.

| Command | Result |
|---|---|
| `pnpm run verify` | Passed: documentation (4,545 links, 326 anchors), types, deterministic build (50 files), every plugin's types and tests (Memory Spaces 274 passed, 2 skipped), 2,049 root tests passed and 6 skipped in 139 files, Headless activation, package contents (60 files, 466,525 bytes packed) |
| `MNEMON_CLI_PATH=/nonexistent/mnemon MNEMON_PLUGIN_VERIFY_CONCURRENCY=1 pnpm run verify:plugins` | Passed: 17 independent plugin repositories and 18 packed artifacts, public SDK-only composition and Client tests; in a real DSH, the packed Starter installed alone with its plugins activated, and three optional packed Strategy plugins activated together |
| `DSH_HOST_ROOT=<DSH 0.2.0-rc.2> pnpm run test:installed-dsh` | 2,049 passed, 6 skipped in 139 files |
| `CHANGESET_BASE_REVISION=f41a121f CHANGESET_REVISION=HEAD pnpm run release:intent` | Changeset coverage verified for `dsh-mnemon` |
| `pnpm exec vitest run tests/memory-tools.spec.ts tests/client-interaction-surfaces.spec.tsx tests/activity.spec.ts tests/review-tools.spec.ts` with main's seven modules in place, then with this change's restored | 68 passed with main's modules and 68 on this change |
| `node docs/pr-assets/memory-tool-table/harness/review-mutations.mjs .` | All 7 changes fail a check: the first three a test, the other four the type check |
| [`harness/schema-findings.probe.ts`](./harness/schema-findings.probe.ts), copied into `tests/` and run with vitest, on this change and with main's seven modules | 12 calls with the same outcomes on both, quoted above and listed in the [verification record](./verification.json) |
| `node docs/pr-assets/remove-dead-code/harness/public-exports.mjs "$PWD" MEMORY_TOOLS memoryTool memoryTools MemoryToolEntry MemoryToolName MemoryToolLabel MemoryToolPage namedToolPresentation memoryPageStyles` | None of the new names is public; the control, `memoryPageStyles`, is found on `dsh-mnemon/client` |

Changeset: `memory-tool-table` (`dsh-mnemon` patch). No plugin's code or exports change.
