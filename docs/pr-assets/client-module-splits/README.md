# Client modules split along their seams

[简体中文](./README.zh-CN.md)

Three client modules had grown to 953, 823 and 1,774 lines: the Memory System workbench (`src/client/MnemonWorkbench.tsx`), the Git sync section (`src/client/MnemonSyncSection.tsx`) and Memory Spaces' pages (`plugins/dsh-mnemon-source-memory-spaces/src/client/pages.tsx`). This change, from item M6 of the technical-debt audit, splits each along the seams it already had: every page, section and dialog that lived in one of them now has a module of its own, and the workbench keeps its status, its Source catalog and its navigation in three hooks. Nothing users or the model see changes. The code moved verbatim: the markup, class names, copy keys and RPC calls are the same, the effects run in the same order, and the public entries export the same names. The built bundles hold the same statements, apart from the workbench's body and the three hooks it now calls, which are made of the old body's statements.

Baseline: main `03dd40a4`, the merge of #423, whose tree is that of `a214dd07`. Change: `e5cae8e1` (Memory Spaces pages), `f91f39d8` (sync section), `b5bb4d49` (Status and Source management pages), `33a3f10c` (workspace hooks), on 2026-10-17 (Asia/Shanghai), macOS 15.6 arm64, Node 24.19.0, pnpm 10.13.1, the pinned DSH 0.2.1-rc.2; the root tests also ran against an installed DSH 0.2.0-rc.2.

## What moved where

| Module | Lines before | Holds now | Lines after |
|---|---:|---|---:|
| `src/client/MnemonWorkbench.tsx` | 953 | The workbench: its header, tabs, the pages of a switched-off or stopped layer, the restart reminder and `MnemonWorkspace`, which calls the three hooks below (404 lines before, 271 now) | 449 |
| `src/client/StatusPage.tsx` | new | `StatusPage`, `ProviderHealth` with the Mnemon Native row, `StorageDomains`, and the component card, the layer state and the storage scope label the workbench also uses | 196 |
| `src/client/SourceManagementPage.tsx` | new | `SourceManagementPage`, the descriptor-driven management page | 119 |
| `src/client/use-workspace-status.ts` | new | `useWorkspaceStatus`: the status of one view context and its two-step read | 48 |
| `src/client/use-source-catalog.ts` | new | `useSourceCatalog`: the running Source instances, a management client bound to each, and the pages and management tabs they give | 76 |
| `src/client/use-workspace-navigation.ts` | new | `useWorkspaceNavigation`: the open page, the tabs, anchors and a page following its layer, with the page id helpers | 162 |
| `src/client/is-record.ts` | 4 | Also `jsonRecord`, which the workbench and the management page share | 10 |
| `src/client/MnemonSyncSection.tsx` | 823 | The section, the repository's state line, the editor and its address form | 412 |
| `src/client/sync-repository-editor.ts` | new | The props the repository editor and the GitHub sign-in it opens take (`9482d145`) | 22 |
| `src/client/MnemonSyncGitHubConnect.tsx` | new | The GitHub sign-in through the device flow | 156 |
| `src/client/MnemonSyncRepositoryPicker.tsx` | new | The repository picker | 99 |
| `src/client/MnemonSyncAdvancedSettings.tsx` | new | This computer's name, the branch, the directory and the commit author | 160 |
| `src/client/sync-feedback.tsx` | new | The feedback line the section and the advanced settings share | 10 |
| Memory Spaces `src/client/pages.tsx` | 1,774 | The module `src/client.ts` exports, re-exporting the same names | 8 |
| Memory Spaces `src/client/widgets.tsx` | new | What more than one page uses: the Provider helpers and fields, category labels, the read-source panel and the memory card, and the deprecated `nativeBodyProvider` | 180 |
| Memory Spaces `src/client/memory-graph.tsx` | new | The Overview graph: its layout, the space and entity nodes it adds, and the SVG | 443 |
| Memory Spaces `src/client/overview-page.tsx` | new | `OverviewPage`, its full-text preview and the dismissed rediscovery it remembers | 496 |
| Memory Spaces `src/client/explore-page.tsx` | new | `ExplorePage` and `MemorySpacesPageStatus` | 130 |
| Memory Spaces `src/client/entities-page.tsx` | new | `EntitiesPage` with its page sizes, placeholders and the related-memories preference | 311 |
| Memory Spaces `src/client/persistence-strategy-dialog.tsx` | new | `PersistenceStrategyDialog` and its two settings types | 137 |
| Memory Spaces `src/client/remember-page.tsx` | new | `RememberPage` | 81 |
| Memory Spaces `src/client/list-page.tsx` | new | `ListPage` | 48 |

How the code moved:

- Each new module holds blocks of its old file in their old order, with their comments. A declaration that a sibling module now imports gained `export`; nothing else in those lines changed.
- Each new module imports only what its code uses, and only modules the file it came from had already loaded, so both bundles still load every existing module in the same order, and a new module loads before the module it came from. Imports a file no longer needs are gone from it.
- Memory Spaces' `pages.tsx` re-exports each name by name, not with `export *`, so the helpers the pages share stay internal while `src/client.ts` goes on exporting `*` from it.
- One test changed, and only in the files it reads: `tests/client-modal-css.spec.ts` checks every dialog footer in the client sources, and now reads every client source of the Starter and the shipped Sources instead of a hand-kept list, so a dialog in a new module is checked too; it finds the same twelve footers (`9482d145`, after the review).

## The workspace hooks

React runs a component's effects in the order its hooks are called, and in each commit every layout effect before any passive one; a custom hook's own hooks run where the hook is called. So each hook takes the stretch of the old body that holds its state, and the workbench calls it where that stretch stood:

| Order | Phase | Effect | Where it is now |
|---:|---|---|---|
| 1 | layout | Reset the canvas scroll when the page or the view context changes | `useWorkspaceNavigation` |
| 2 | layout | Clear an anchor's input when the view context changes | `useWorkspaceNavigation` |
| 1-4 | passive | Subscribe to the configuration action, component changes, the settings and the Source page directory | `MnemonWorkspace`, unchanged |
| 5 | passive | Read the Source catalog (`sourceManagementCatalog`) | `useSourceCatalog` |
| 6 | passive | Read the component names (`viewDashboard`) | `MnemonWorkspace`, unchanged |
| 7 | passive | Move a page to its layer's stopped page when the layer's Source stops, and back when it runs again | `useWorkspaceNavigation` |
| 8 | passive | Apply a held anchor and subscribe to new ones | `useWorkspaceNavigation` |
| 9 | passive | Read the status (`statusSummary`, then `status` when needed) | `MnemonWorkspace`, after the navigation hook |
| 10-12 | passive | Refresh when the Sidebar reopens, a component switches or the settings change | `MnemonWorkspace`, unchanged |

The stopped layers are worked out from the status before the navigation hook needs them, so `useWorkspaceStatus` is called early and returns its read, `loadStatus`; the effect that runs the read stays in the workbench after the navigation hook, and a comment there says why. Hooks that run no effect, such as the open page's state, now come later than they did, in the hook that owns them, and the navigation hook reads the translation context once more; neither runs anything in another order.

## Equivalence

**Source.** [`harness/moved-lines.mjs`](./harness/moved-lines.mjs) compares the code lines of each file on main with the modules it became, as multisets, leaving out imports and blank lines:

| Split | Code lines before | After | Gained `export` | Only before | Only after |
|---|---:|---:|---:|---:|---:|
| Memory Spaces `pages.tsx` | 1,655 | 1,656 | 17 | 0 | 1, the comment over the re-exports |
| `MnemonSyncSection.tsx` | 750 | 750 | 6 | 0 | 0 |
| `MnemonWorkbench.tsx` and `is-record.ts`, page moves (`b5bb4d49`) | 865 | 865 | 6 | 0 | 0 |
| `MnemonWorkbench.tsx`, hooks (`b5bb4d49` to `33a3f10c`), indentation ignored | 578 | 639 | 5 | 0 | 61 |

The 61 lines only after are the three hooks' signatures, return types, docs and returns, the destructuring of the navigation hook's options, its translation read, the three calls in the workbench and the comment at the status read.

**Built bundles.** Main and this change were built the same way, in the same directory (`pnpm run build`, `pnpm --workspace-concurrency=4 -r build`, `pnpm run build`); the comparisons below came out the same against a build of main in a checkout of its own, run one package at a time. [`harness/bundle-compare.mjs`](./harness/bundle-compare.mjs) reads each client bundle's factory, leaves out the `//#region` comments that mark modules, and compares the top-level statements as multisets; statements that run code when the bundle loads must also keep their order, and each style sheet's region, the injected sheet and the class map the code reads, must be identical:

| Bundle | Bytes before | Bytes after | Statements before / after | Only before / after | Load-time effects, same order | Style sheets identical | Module regions before / after |
|---|---:|---:|---:|---:|---|---|---:|
| `dsh-mnemon` `lib/client.js` | 945,626 (gzip 203.86 kB) | 948,368 (gzip 204.21 kB) | 590 / 593 | 1 / 4 | 85, yes | 14 of 14 | 91 / 100 |
| `dsh-mnemon-source-memory-spaces` `lib/client.js` | 362,230 (gzip 74.52 kB) | 362,632 (gzip 74.58 kB) | 167 / 167 | 0 / 0 | 28, yes | 2 of 2 | 14 / 21 |

The Memory Spaces bundle holds the same statements; only its module regions changed. In the Starter's bundle the one statement only before is the old `MnemonWorkspace`, and the four only after are the new one and the three hooks. [`harness/hooks-compare.mjs`](./harness/hooks-compare.mjs) compares them: every statement of the old body is in one of the four, except four the build now returns inline from a hook (`loadStatus`, `sourceManagementClients`, `visibleSourcePages`, `managedSourceTypes`), each the very expression it was; the 8 statements only after are the three calls, the three returns, the options destructuring and the translation read. Expanding each hook where it is called, the 2 layout effects and the 12 passive effects run in the same order as on main. The Starter's bundle never held the Memory Spaces pages, and still does not. The 2,742 bytes it gained are its nine new module regions and the hooks' signatures, calls and returns; Memory Spaces' 402 are its seven new regions.

Every other built file is the same, compared across both builds of each package: the Host bundle `lib/index.js`, the Starter's published declarations, and every other plugin's `lib`. Two other differences come from the build, not from this change. The Runtime and Documents client bundles name the absolute path of each style sheet in a region comment, so a checkout in another directory differs there and nowhere else. And `dsh-mnemon-provider-byterover/lib/index.d.ts` declares its definition as `any` after the first build of a fresh checkout, and with its real types after any later one: the workspace build orders ByteRover before Memory Spaces, whose `provider-sdk` declarations do not exist yet the first time. That holds on main as on this change; see the note under Not in this change.

**Public names.** [`harness/public-names.mjs`](./harness/public-names.mjs) lists the 772 names that every package entry exposes through TypeScript, with their kinds; the lists before and after are identical. [`harness/bundle-exports.mjs`](./harness/bundle-exports.mjs) loads both client bundles as DSH does: `dsh-mnemon` exports the same 50 names and Memory Spaces the same 16. Memory Spaces' published declarations gain one file per new module, and `lib/types/client/pages.d.ts` re-exports them, so its `./client` entry resolves to the same names and types. The Starter's published declarations do not change.

## Not in this change

- The other large components the audit lists, `CompositionBoard`, `MnemonSaveAction`, `MnemonDialog` and `MnemonReviewSection`, stay as they are. Most of each is one component body of 214 to 255 lines, so splitting them means new sub-components or hooks inside a component rather than moving code.
- `src/client/locales.ts` keeps its dictionaries: moving them to JSON changes how `MnemonKey` is typed and the copy fingerprint.
- The audit's other M6 items, Memory Spaces' service and Source and the Host modules, are separate changes; the Host's `subagent.ts` and `tools.ts` are item H2.
- The ByteRover Provider's declarations found above: the published `dsh-mnemon-provider-byterover` 0.5.5 also declares its definition and module as `any`, as a release built from a fresh checkout would. Its types resolve once Memory Spaces' declarations exist when ByteRover builds; ordering the build that way is a build change, so it is only reported here.

## Compatibility

- **Interface.** Same markup and class names: every style sheet and class map in both bundles is identical. No copy key changes, so the copy fingerprint stays.
- **Behavior.** The same RPC requests go out in the same order, and the browser storage keys the moved pages use, `dsh-mnemon.memory-spaces.rediscovery-seen` and `dsh-mnemon.memory-spaces.entities.related`, moved with their code.
- **Public SDK.** No export is added, removed or renamed on any public entry.
- **Version skew.** Neither package uses anything new from the other, and the Starter's bundle takes the same Memory Spaces code as before, so no peer floor moves and any pair of versions a profile holds works as it did.
- **Persisted data and wire.** Unchanged.
- **DSH releases.** The root tests pass on the pinned DSH 0.2.1-rc.2 and on an installed 0.2.0-rc.2.

## Commands and results

Every command ran through Node 24.19.0 and pnpm 10.13.1 on `33a3f10c`, after `pnpm install --frozen-lockfile` and the builds above; main's counts come from the same commands on `03dd40a4`. `pnpm run verify:docs` ran again after this record was written: 4,694 links, 353 anchors.

| Command | Result |
|---|---|
| `pnpm run verify` | Passed: documentation (4,680 links, 353 anchors, before this record), types, deterministic build (55 files), every plugin's types and tests (Memory Spaces 291 passed, 2 skipped), 2,098 root tests passed and 7 skipped in 149 files, Headless activation, package contents (65 files, 476,038 bytes packed), public entries (15 entries, 34 public type dependencies, 21 browser-side client declarations, as on main), `publint` and `attw` |
| `MNEMON_CLI_PATH=/nonexistent/mnemon MNEMON_PLUGIN_VERIFY_CONCURRENCY=1 pnpm run verify:plugins` | Passed: 17 independent plugin repositories and 18 packed artifacts, public SDK-only composition and Client tests; in a real DSH, the packed Starter installed alone with its plugins activated, and three optional packed Strategy plugins activated together |
| `DSH_HOST_ROOT=<DSH 0.2.0-rc.2> pnpm run test:installed-dsh` | 2,095 passed, 10 skipped in 149 files, as on main |
| `pnpm run test:root` and `test:installed-dsh` on main | 2,098 passed and 7 skipped in 149 files; on the installed DSH 0.2.0-rc.2, 2,095 passed and 10 skipped: the same as on this change |
| `pnpm exec vitest run tests/client-` | 396 passed in 32 files, the WebUI presentation, platform-boundary and client tests, as on main |
| `pnpm --filter dsh-mnemon-source-memory-spaces run test` | 291 passed, 2 skipped, as on main |
| `pnpm exec tsc -p tsconfig.json --noEmit --noUnusedLocals`, and the same in Memory Spaces | No unused import or local in any client module |
| `node docs/pr-assets/client-module-splits/harness/moved-lines.mjs` on the four splits, from the repository root | The table under Equivalence |
| `node docs/pr-assets/client-module-splits/harness/bundle-compare.mjs . <main>/lib/client.js lib/client.js`, and the same for Memory Spaces | The bundle table under Equivalence |
| `node docs/pr-assets/client-module-splits/harness/hooks-compare.mjs . <main>/lib/client.js lib/client.js` | Four statements returned inline with the same expressions, 8 new ones, the 2 layout and 12 passive effects in the same order |
| `node docs/pr-assets/client-module-splits/harness/bundle-exports.mjs . lib/client.js plugins/dsh-mnemon-source-memory-spaces/lib/client.js`, on main and on this change | 50 and 16 names, the same on both |
| `node docs/pr-assets/client-module-splits/harness/public-names.mjs .`, on main and on this change | 772 names, the same on both |
| `CHANGESET_BASE_REVISION=03dd40a4 CHANGESET_REVISION=HEAD pnpm run release:intent` | Changeset coverage verified for `dsh-mnemon` and `dsh-mnemon-source-memory-spaces` |

Changeset: `client-module-splits` (`dsh-mnemon` and `dsh-mnemon-source-memory-spaces`, patch).
