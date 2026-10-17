# Host modules split along their seams

[简体中文](./README.zh-CN.md)

Two Host modules had grown past what one review can hold: `src/host/subagent.ts`, 2,378 lines and 147 KB, in which the memory task coordinator `MnemonSubagentCoordinator` alone took 1,467 lines, and `src/host/tools.ts`, whose `registerTools` was one 439-line function that registered all sixteen memory tools. This change, item H2 of the technical-debt audit, splits them along the seams they already had: the delegated children's personas, result schemas and task text, the DSH output-schema check, receipt recovery, the runtime-capacity workflow and the Document archive workflow each move to a module of their own, and the memory tools register one family at a time. Nothing users or the model see changes. The code moved verbatim, the methods that left the coordinator take what they used of it as a parameter, `subagent.ts` exports the same names, and the built Host bundle holds the same statements apart from the coordinator class, the thirteen functions its methods became and the tool registration functions, which are made of the old code.

Baseline: main `bd70979f`, the merge of #426 (M2 and M3), whose branch head `a8c40265` this change started from; the four commits main added after it touch neither module. Change: `0236a9e0` (the pins), `5a5c16c2` (`subagent.ts`) and `4b4de316` (`tools.ts`), merged with main in `bad852aa`, and `ea19a2ec`, which extends the pins after the review, on 2026-10-18 (Asia/Shanghai), macOS 15.6 arm64, Node 24.19.0, pnpm 10.13.1 and the pinned DSH 0.2.1-rc.2; the root tests also ran against an installed DSH 0.2.0-rc.2, and the real-host specs against an installed 0.2.1-rc.2.

## What moved where

| Module | Lines before | Holds now | Lines after |
|---|---:|---|---:|
| `src/host/subagent.ts` | 2,378 | The facade, the delegated task line, the tools each kind of child may call, the guard that holds a write to the space its caller named (#387), the hint for a memory saved without a vector (#388), and `MnemonSubagentCoordinator` (1,467 lines and 60 members before, 836 and 48 now): the result tool, Recall, placement, metadata, writes, reviews, reconciliation and `delegate`, which starts every child | 1,068 |
| `src/host/subagent-prompts.ts` | new | Every delegated child's persona, the schema its result must match, and the helpers that write a run's data into its task: the request brief, the evidence, the metadata samples, the runtime memory snapshot and the eligible Memory Spaces | 278 |
| `src/host/subagent-output-schema.ts` | new | The JSON Schema subset DSH structured-output tools compile, `assertDshOutputSchema`, which `subagent.ts` re-exports, and the check of a captured result against a schema | 84 |
| `src/host/subagent-receipts.ts` | new | Reading back what a child returned: its structured result, the memory tool receipts that stand in for a result it did not record, the receipts a failed idle review keeps, and the bounded detail of a failure | 154 |
| `src/host/archive-destinations.ts` | new | What the two archive workflows share: which Memory Spaces can take an archive, in this Memory Spaces Source or another one (#336), and the lineage a Provider's receipt proves | 110 |
| `src/host/runtime-capacity.ts` | new | The runtime-capacity workflow: `runtimeLocked`, `compactUserAndCommit`, `archiveRuntimeEntry`, `archiveRuntimeLocally` and `runtimeArchiveSource`, the routing excerpts and batches, and the write context the coordinator builds for it | 508 |
| `src/host/document-archive.ts` | new | The Document workflow: archiving before a write that does not fit (`documentLocked`), indexing a Document in a Memory Space and archiving it (`archiveDocumentLocked`), the local archive, the archive task and the cold path | 276 |
| `src/host/tools.ts` | 502 | `registerTools` (439 lines before, 8 now), the helpers every tool shares (`toolHelpers`, 32), and one function per tool family: the View tools (57), Memory Spaces' reads (84), the Documents tools (84), the runtime memory tool (36) and Memory Spaces' writes (152) | 534 |

How the code moved:

- Each new module holds blocks of `subagent.ts` in their old order, with their comments. A declaration a sibling module imports gained `export`; nothing else in those lines changed.
- Thirteen private methods left the coordinator and became functions of the modules above. Each takes what it used of the coordinator as its first parameter, and its body differs from the method's only where it reads that parameter instead of `this`:
  - `counters`: `runtimeLocked`, `archiveRuntimeLocally` and `archiveDocumentLocally`;
  - `runtimeSource`: `runtimeArchiveSource`, which reads `runtimeSource.config.writeEnabled` where it read `this.runtimeSource.config.writeEnabled`;
  - `host`, a `DocumentWorkflowHost`: `documentLocked`, `archiveDocumentLocked`, `documentCommit`, `documentIndexSpaces` and `assertAutomaticMemoryWrite`. The Document workflow uses the coordinator's `runtimeSource`, `counters`, `turnAuthority`, `sourceFor`, `writableSourceFor` and `delegate`, which all stay private; the coordinator's `documentWorkflow()` hands the workflow those, bound to the coordinator, each time it runs a Document request;
  - nothing: `compactUserAndCommit`, `archiveRuntimeEntry`, `archivableElsewhere` and `noArchivableMemorySpace` used nothing of the coordinator and keep their parameters.
- `archive-destinations.ts` exists because both workflows use the same destination checks and lineage helpers; in either workflow's module they would make one workflow depend on the other.
- Memory Spaces' tools register in two functions: the model is given its read tools before the Documents tools and its write tools after the runtime memory tool, and `tests/fixtures/model-tools.json` pins that order. The helpers are built once, as before, and the `config` the View, Documents and runtime memory tools read is still the one taken when the tools register.
- Each new module imports only what its code uses, and only modules `subagent.ts` had already loaded; `subagent.ts` imports them after its existing imports, so every existing module still loads in the same order and the new ones load just before `subagent.ts`. Imports `subagent.ts` no longer needs are gone from it.

## Equivalence

**Pins first.** Before anything moved, `0236a9e0` added two tests on the baseline:

- "What delegated children read" in `tests/subagent.spec.ts` starts every kind of delegated child through the coordinator, with a provider that takes the child's persona in its start request, as DSH 0.2.0's do: the eight write operations, the evidence answer, the Provider placement, metadata maintenance, idle review through spawn and through fork with and without runtime memory, both batches of a MEMORY.md archive routing (with an entry longer than a routing excerpt and one with a branch), the USER.md compaction, the document archive, and the reconciliation of merged memory, which runs through the maintenance task runner over another installation's entry, branches, documents, the sync branch's side and a reviewer's opinion. For each of the 20 children it pins the label and the SHA-256 of the persona, of the completion protocol after it, which carries the result schema, with the run's random requestId left out, and of the task. They are 14 distinct personas, 8 distinct completion protocols and 18 distinct tasks. The tasks' lists have two elements where a separator joins them (a request's tags, a routed entry's branches, a document's source paths) and one request field is an object, so the separators are pinned as well. Adding one space to a persona or to a task's text fails the test, and so does a one-character change to any of those separators.
- `tests/tool-cards.spec.ts` pins the call and result cards every memory tool shows in the conversation, in registration order.

Both passed on the baseline and pass unchanged after each move. After the review, `ea19a2ec` added the reconciliation child and the lists and object above; the extended pins pass on the code before the move, `a8c40265`, as they do after it. `tests/memory-tools.spec.ts` and `tests/fixtures/model-tools.json`, which pin each tool's name, description, input and output schema and the registration order, are unchanged and pass.

**Source.** [`harness/split-subagent.py`](./harness/split-subagent.py) and [`harness/split-tools.py`](./harness/split-tools.py) made the two moves. They slice the baseline files by line number, take two spaces of indentation off the methods that left the class (not off the lines inside their template literals, which are model text), and apply only the substitutions they list, each checked to occur as often as expected. Run on `a8c40265`, or on main `bd70979f`, whose two files are the same, they write the eight files of `4b4de316` byte for byte. [`moved-lines.mjs`](../client-module-splits/harness/moved-lines.mjs), from the client splits, compares the code lines before and after as multisets, leaving out imports and blank lines; it runs from the repository root:

| Split | Code lines before | After | Gained `export` | Only before | Only after |
|---|---:|---:|---:|---:|---:|
| `subagent.ts` into seven modules, indentation ignored | 2,195 | 2,237 | 49 | 64 | 106 |
| `tools.ts` | 469 | 499 | 0 | 1 | 31 |

For `subagent.ts`, the 64 lines only before are the thirteen method signatures, the 45 lines of the moved methods that read the coordinator through `this` and the 6 lines of the coordinator that called a moved method; the 106 only after are the new signatures, those lines reading the new parameter or calling the function, the module comments, `DocumentWorkflowHost` and `documentWorkflow()`. For `tools.ts`, the line only before is the one-line doc comment of `registerTools`, now three lines, and the 31 only after are the new function signatures, comments and closing braces, the six calls in `registerTools`, the return of `toolHelpers` and its type. Indentation is not ignored there: every tool registration is the same lines at the same indentation.

**Built bundle.** Main and the merged branch were built the same way (`pnpm run build`, `pnpm --workspace-concurrency=4 -r build`, `pnpm run build`), main in a plain copy of its tree. [`harness/host-bundle-compare.mjs`](./harness/host-bundle-compare.mjs) reads the Host bundle `lib/index.js`, one ES module whose top-level statements are those of every Host module, and compares its imports as names per module and its top-level statements as multisets; statements that run code when the bundle loads are also compared in order:

| | Main `bd70979f` | Merged change `bad852aa` |
|---|---:|---:|
| Bytes of `lib/index.js` | 689,485 | 692,411 |
| Imports | 29 modules | the same names from the same 29 |
| Top-level statements | 764 | 783 |
| Only on one side | 2: the coordinator class and `registerTools` | 21: the class, its 13 former methods, `registerTools` and its 6 new functions |
| Load-time effects | 45 | 45, of which 43 keep their order |
| Module regions | 56 | 62: the six new modules just before `subagent.ts`, the other 56 in the same order |

- The class: 66 members before, 54 after (the bundle declares the constructor's six parameter properties as fields). The thirteen methods left; the six that called them (`runtime`, `enqueueRuntime`, `viewAction`, `manageSource`, `document` and `archiveDocument`) differ in that call, one line each; `documentWorkflow()` is new.
- The thirteen functions: each has the method's parameters, behind the coordinator state it takes first, and its body is the method's once `this.` is dropped from the method and the new first parameter is dropped from the function, from the calls that pass it on and from `host.`.
- `registerTools`: its 22 body statements, the six helpers and the sixteen registrations, are the body statements of `toolHelpers` and the five family functions; the 7 only after are the call to `toolHelpers`, the five family calls and the helpers' return. The sixteen `ctx.tools.register(...)` calls are identical and run in the same order.
- The load-time effects: three statements of `subagent.ts` built constant values when the bundle loaded: `AUTONOMOUS_WRITE_TOOLS`, a filter over a constant array of tool names, and `WRITE_ACTION_SET` and `DSH_OUTPUT_SCHEMA_KEYS`, Sets of string literals. The last two now load with their modules before `subagent.ts`, so the three run in another order relative to each other. Each builds its value from constants defined before it, and none is read until a function runs, so the order cannot be observed. Every other load-time statement runs in the same order.
- The same comparison of `a8c40265` and `4b4de316`, both built in this checkout before the merge, gives the same report apart from the sizes, 689,453 and 692,379 bytes.
- Every other file the root build writes is the same. Built in this checkout, `a8c40265` and `4b4de316` wrote the same client bundle, other entries and chunks, and published declarations under `lib/types`; main's client bundle, built in another directory, differs from the merged branch's only in the checkout path its style sheets' region comments name. No package entry reaches the new modules, so they add no declaration file.

## Compatibility

- **What the model and users see.** Every delegated child reads the same persona, result schema and task (the pins); the model is given the same tools with the same descriptions and schemas in the same order (the fixture); the tools show the same cards.
- **Behavior.** The moved code runs the same statements in the same order and throws the same errors; the class and the functions differ only as above. The counters, the two queues and the order of side effects are unchanged: the Document workflow's host is built inside the queued call, where the method was called, and reads the coordinator's own state.
- **Public SDK.** No package entry changes: `src/host/subagent.ts` and `src/host/tools.ts` are internal modules, and the published declarations are identical. `subagent.ts` exports the same names to the Host and the tests.
- **Version skew.** Nothing crosses a package boundary: no plugin changes, and no peer floor moves.
- **Persisted data and wire.** Unchanged: the archive index text, its cold path and the lineage references moved verbatim with their workflows.
- **DSH releases.** The root tests pass on the pinned DSH 0.2.1-rc.2 and on an installed 0.2.0-rc.2, and the real-host specs on an installed 0.2.1-rc.2.

## Not in this change

- `delegate` (208 lines) stays one method of the coordinator. It owns the result capability, the tool result observer, the receipts and the child's start and disposal; splitting it means designing new pieces rather than moving code.
- `write` and the guard and hint around it stay in `subagent.ts`, and `review` and `reconcile` in the coordinator; reconciliation's prompt and persona already live in `reconcile.ts`. The task text the placement, answer and write methods build inline stays in those methods, since moving it would mean new functions.

## Commands and results

Every command ran through Node 24.19.0 and pnpm 10.13.1 on the merge `bad852aa` with this record on top, which adds only the record and the changeset, after `pnpm install --frozen-lockfile` and the builds above, unless the row names another revision; main's counts come from the same commands on `bd70979f`.

| Command | Result |
|---|---|
| `pnpm run verify` | Passed: documentation (4,828 local links, 368 anchors), type check, deterministic output for 56 files, every plugin's type check and tests (593 passed, 3 skipped in 17 packages; Runtime 81, Memory Spaces 292 and 2 skipped), root tests (2,111 passed, 7 skipped in 152 files), real Headless activation (38 tools, 8 of them Mnemon's) with the legacy settings import and the disabled Starter, package contents (66 files, 480,083 bytes packed), 15 Node entries with 35 public type dependencies and 21 browser-side client declarations, `publint` and `attw` |
| `MNEMON_CLI_PATH=/nonexistent/mnemon MNEMON_PLUGIN_VERIFY_CONCURRENCY=1 pnpm run verify:plugins` | Passed: 17 independent plugin repositories and 18 packed artifacts, public SDK-only composition and Client tests; in a real DSH, the packed Starter installed alone with its plugins activated, and three optional packed Strategy plugins activated together |
| `DSH_HOST_ROOT=<DSH 0.2.0-rc.2> pnpm run test:installed-dsh` | 2,108 passed, 10 skipped in 152 files; the 3 more skips are the DSH 0.2.1-only real-host probes |
| `DSH_HOST_ROOT=<DSH 0.2.1-rc.2> pnpm exec vitest run --config scripts/installed-dsh.config.ts` | 2,111 passed, 7 skipped in 152 files, the real-host specs among them, as on the pinned DSH |
| `node scripts/verify-sync-git.mjs` | 64 of 64 checks passed on the pinned DSH 0.2.1-rc.2: two real DSH Web instances configure a local bare repository, publish to it and pull from it |
| `pnpm exec vitest run tests/subagent.spec.ts tests/tool-cards.spec.ts tests/memory-tools.spec.ts`, after each of `0236a9e0`, `5a5c16c2` and `4b4de316` | 149, 1 and 7 passed each time |
| `pnpm exec vitest run tests/subagent.spec.ts` with the pins of `ea19a2ec`, on `ea19a2ec` and on the files of `a8c40265` | 149 passed on both |
| `pnpm exec tsc -p tsconfig.json --noEmit --noUnusedLocals` | No unused import or local in the eight modules |
| `python3 docs/pr-assets/host-module-splits/harness/split-subagent.py . a8c40265 <dir>` and `split-tools.py . a8c40265 <dir>` | The eight files of `4b4de316`, byte for byte |
| `node docs/pr-assets/client-module-splits/harness/moved-lines.mjs [--indent] --before a8c40265:<file> --after 4b4de316:<files>` | The source table under Equivalence |
| `node docs/pr-assets/host-module-splits/harness/host-bundle-compare.mjs . <baseline>/lib/index.js lib/index.js` | The bundle table under Equivalence |
| `node docs/pr-assets/host-module-splits/harness/spans.mjs . a8c40265:src/host/subagent.ts a8c40265:src/host/tools.ts src/host/<file>...` | The line counts under What moved where |
| `pnpm run test:root` and `DSH_HOST_ROOT=<DSH 0.2.0-rc.2> pnpm run test:installed-dsh` on main `bd70979f` | 2,109 passed and 7 skipped in 151 files; on the installed DSH 0.2.0-rc.2, 2,106 passed and 10 skipped. This change adds the two pinning tests, one in a new file |
| `CHANGESET_BASE_REVISION=bd70979f CHANGESET_REVISION=HEAD pnpm run release:intent` | Changeset coverage verified for `dsh-mnemon` |

Changeset: `host-module-splits` (`dsh-mnemon`, patch).
