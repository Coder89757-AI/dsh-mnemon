# Small cleanups: one owner for repeated names and rules

[简体中文](./README.zh-CN.md)

The technical-debt audit after v0.5.31 listed small items that each kept one fact in several places, or kept code with no written reason to exist. This change takes up five of them (L3, L6, L7, L8 and M5(a)) and the rule copies that [Sources own their storage formats](../source-owned-formats/README.md) (#416) left in the Host. The maintainer rule for the batch: nothing users or the model see changes. Where an item would need such a change, or would collide with work in flight, it is left and said so below.

Tested revision: branch `claude/small-cleanups`, written on main `f41a121f` (#416), merged with main `d0cf29c0` (#417, #418), then `ca94e889` (#419, and #420, which moves development to DSH 0.2.1-rc.2), then `8e052c22` (#421, which moves Memory Spaces' settings into its own client) and `1fd64eaf` (#422, documentation only), 2026-10-17 (Asia/Shanghai), Node 24.19.0 and pnpm 10.13.1, against the pinned DSH 0.2.1-rc.2; the root tests also ran against an installed DSH 0.2.0-rc.2. The checks below passed on the final merge. `verify`, `verify:plugins`, the installed DSH, Git sync and `serve-e2e.mjs` also passed after the `ca94e889` merge, and on the two states before it on DSH 0.2.1-rc.1. The first three bundle comparisons are between `f41a121f` and this branch before the merges, and the runs on the base's modules use `f41a121f`'s modules; the client constants, which waited for #421, are compared with `8e052c22`.

## What changed

| Item | Before | Now |
|---|---|---|
| L3: the `toolviews` preference | `conversationInteraction.toolviews` was parsed, defaulted, imported, refused on write and never read. It drew in-conversation tool cards in 0.1.1 and 0.1.2; nothing has read it since 0.1.3 | The resolved config and its protocol type leave it out. The schema still declares it with its default, which keeps the form DSH generates from the schema as it was; stored values would validate either way, since undeclared keys pass through, and a test pins the declaration. The legacy import still accepts and carries it; both settings namespaces still refuse writes to it. `Config.conversationInteraction.toolviews` is marked deprecated |
| L6: Memory Space names | The Host imported the deprecated `MemoryBody*` aliases (`subagent.ts`, `rpc.ts`, `protocol.ts`, five test files) and named helpers after bodies | The canonical `MemorySpace*` types; `eligibleMemorySpaceContext`, `receiptMemorySpaceIds` and the coordinator's `scopeRelatedMemorySpace`. Wire and stored names stay: tool names, the `bodies` and `body-*` operations, `memoryBodyId` fields, the `memory-bodies` storage kind, `.dsh-memory-bodies.json`, the page client's methods |
| L6: the main Strategy id | Read as `memoryTopology.strategyId` in three places after plugin management wrote the plugin choice `memoryView.strategyTypeId` into it | `src/host/main-strategy.ts`: `withMainStrategy` applies the choice wherever plugin management resolves the config (the runtime graph and each View request), and `mainStrategyTypeId` reads the result for composition, idle review and the View dashboard. The status RPC still sends the whole topology, of which the client reads only the layers, and plugin restore resubmits the stored choice only to fill its request |
| L7: the shipped components | Listed six times: the client's shipped check and component rows, the Host's install suggestions, `verify-headless-profile.mjs`, `serve-e2e.mjs`, `verify-sync-git.mjs` | `src/host/starter-components.ts`: the rows in patch order, the enhancements in suggestion order, and the packages with their own bundle patch. The client takes it through `protocol.ts`; the scripts import it directly, since it has no imports and only erasable types and Node runs it as TypeScript. `src/client/starter-rows.ts` is gone |
| L8: compatibility code | No written reason or removal condition | [Compatibility register](../../en/development/compatibility-register.md) ([中文](../../zh-CN/development/compatibility-register.md)): 17 rows, linked from the development guide and Compatibility and upgrades |
| M5(a): the Native Provider id | `'mnemon-native'` about a dozen times in the Memory Spaces Source, half as `(provider.typeId ?? provider.id) === 'mnemon-native'`, and seven times in the clients: five in Memory Spaces' pages and settings (two of them in the Starter's `component-settings.tsx` until #421), one each in the Starter's Save action and Status page | Memory Spaces `./contracts` exports `NATIVE_PROVIDER_ID` and `isNativeProvider()`; the registry, service, catalog, persistence-strategy defaults and forget explanation use them, and Memory Spaces' pages and settings import the constant from `../contracts.ts`. Its `./client` entry exports `NATIVE_PROVIDER_ID` too, and the Starter's Save action and Status page take it from `src/client/memory-spaces-client.ts`, the gateway through which the Starter's client takes Memory Spaces' client code since #421. The service's own check by Provider id is renamed `isNativeProviderId` |
| Rule copies after #416 | The 100/1,000-character name and description limits in the registry parser, in each registry write, in the Source's create and update request parsers and in the `maxLength` of the page's name and description inputs; the space id regex in `src/host/config.ts` and Memory Spaces `config.ts`; USER.md/MEMORY.md in `src/host/subagent.ts` | `MEMORY_SPACE_NAME_MAX_LENGTH` and `MEMORY_SPACE_DESCRIPTION_MAX_LENGTH` (new), `MEMORY_SPACE_ID_PATTERN` and `RUNTIME_PROJECTION_FILES`; messages unchanged |

### Left as it is

- **Copy keys and style selectors.** Memory Spaces' `presentation/locales.json` keeps `mnemon-native` inside two copy keys: `readSources.model.*`, which the pages build from a Provider's id, and `overview.providerSummary.*`, which the Native descriptor names as its `summaryI18nKey`. Its `presentation/page.module.css` matches `[data-provider="mnemon-native"]` to color Native's badges, cards, labels and graph nodes. Both are presentation resources keyed by the id, which a JSON file or a stylesheet cannot import, not other definitions of it.
- **The Save action's check** still compares `typeId ?? id` with the id, now `NATIVE_PROVIDER_ID`, instead of calling `isNativeProvider()`: that would add a second export to Memory Spaces' `./client` and a function to the Starter's bundle for one call.
- **Prompt text.** `subagent.ts` still writes USER.md and MEMORY.md into persona strings and messages, and truncates names and Provider labels for prompts with literal bounds (100, 100, 300). Those are prompt wording and budgets, not copies of a Source rule, and the model must see the same text.
- **`CUSTOM_PACK_ID`** in `src/host/config.ts` has the same pattern as a space id but is a different rule: a custom Pack's id.
- **The restore placeholder.** `restore()` in `plugin-management.ts` sends `strategyTypeId: saved ?? 'default-three-tier'` only because the request shape needs one; the value is checked for its form and selects nothing.
- **Fixture patches** under `scripts/fixtures/` write the enhancement rows into profile YAML for their own scenarios.
- **An observation, not changed:** `verify-headless-profile.mjs` leaves only the three enhancements out of its linked packages, while `serve-e2e.mjs` and `verify-sync-git.mjs` also leave out the General strategy, which carries its own bundle patch too. The scripts keep their behavior.

## Equivalence

- **Browser bundle.** `lib/client.js` built from `f41a121f` and from this branch before the merges differs in two places only: the component rows moved from the `src/client/starter-rows.ts` region to `src/host/starter-components.ts` with the same eight entries, and `SHIPPED_PACKAGES` is built from those rows instead of a literal with the same eight names (931,923 to 931,666 bytes).
- **Host bundle.** `lib/index.js` differs only where the items say: the `toolviews` line of `resolveConfig`, the store check calling `MEMORY_SPACE_ID_PATTERN.test`, the two `main-strategy.ts` functions and their three calls, the renamed helpers, the enhancement list used for the suggestions, `RUNTIME_PROJECTION_FILES[target]` in the snapshot header, and the order of one import.
- **Memory Spaces.** Its `lib/provider-sdk.js` is byte-identical, and so was its `lib/client.js` before the client constants; `lib/contracts.js` adds the four exports, and the other chunks call them where they compared the literal.
- **The client constants.** Built the same way from `8e052c22` and from this branch, the Starter's `lib/client.js` changes only where a literal became a reference: the Native row of the Memory Spaces settings it falls back to (two places) and of the Status page (one) read `NATIVE_PROVIDER_ID`, 3 bytes more each, and the constant's declaration, with its doc comment and a region comment for Memory Spaces' contracts, adds 330 (945,217 to 945,556 bytes, +339). Memory Spaces' `lib/client.js` changes at the create form's default Provider, the two description inputs and the settings' Native row (two places), and adds the declarations of `NATIVE_PROVIDER_ID` and `MEMORY_SPACE_DESCRIPTION_MAX_LENGTH` with their doc comments and the export of the first (361,733 to 362,220 bytes, +487); its `lib/types/client.d.ts` adds that export. The other sites come out byte-identical: rolldown 1.2.4, which tsdown uses, inlines an imported constant by default inside `??` and `||` and for short values such as `100`, so the Save action's check, the persistence strategy dialog's two defaults and the two name inputs keep their literals in the bundles. Every other file in the two packages' `lib/` directories is unchanged.
- **New tests on the previous code.** The shipped-component test passes with main's `component-copy.ts`, and the new settings and live-config tests with main's Host modules: writes to `toolviews` were already refused and stored profiles already validated. The config and legacy-import tests differ from main only where the resolved config no longer carries `toolviews`. The prompt test pins the header text main wrote, and the tests added after the review (the dashboard's main Strategy, the schema's declaration, and the limits in the registry's create and in the Source's request parsers) pass on the base's modules too.
- **Scripts.** All three load `src/host/starter-components.ts` without a build: checked by import on Node 24.19 and 25.1, by `pnpm run verify:headless` inside `verify`, by `verify:plugins` (which runs `verify-headless-profile.mjs` twice), by the Git sync end-to-end run and by starting `serve-e2e.mjs` until it served the WebUI. Node runs `.ts` files without flags from 22.18, development needs 22.19 or later, and where CI runs one of these scripts (`verify:plugins` and the publish workflow) it uses Node 24.

New and extended tests:

| Where | What it shows |
|---|---|
| `tests/config.spec.ts` | A stored `toolviews` is accepted and left out of the resolved config; the schema still declares it, so the generated form keeps its three switches; the store hint takes exactly a space id, with the same message |
| `tests/live-config.spec.ts` | DSH's live Config validates a stored profile that holds `toolviews` |
| `tests/settings.spec.ts` | Writes to `toolviews` are refused from both namespaces while the legacy interaction paths stay writable |
| `tests/legacy-settings-import.spec.ts` | A retained file with `toolviews` still imports, and the resolved config leaves it out |
| `tests/main-strategy.spec.ts` | The plugin choice wins over the topology id; without a choice the config object is returned unchanged |
| `tests/view-management.spec.ts` | The View dashboard reports the main Strategy the profile chose, else the default one |
| `tests/plugin-metadata.spec.ts` | The component rows equal the bundle patch (as before) and the components package.json pins, each to one exact version (a prerelease included, never a range); the enhancements are the shipped Strategy extensions and ship switched off; the self-registering packages are those whose manifest declares a bundle patch; the shipped check; the Starter installs Mnemon Native under `NATIVE_PROVIDER_ID` |
| Memory Spaces `tests/contracts.spec.ts` | `NATIVE_PROVIDER_ID` is the id the Native Provider package gives its descriptor, manifest and driver; `isNativeProvider` by type and by id; the name and description limits in the registry's create and update, with their messages, and in the parser |
| Memory Spaces `tests/source.spec.ts` | The same limits, with the same messages, in the `body-create` and `body-update` operations and the model's `manage-spaces` Action |
| Memory Spaces `tests/config.spec.ts` | The store hint takes exactly a space id |
| `tests/subagent.spec.ts` | The compaction prompt's snapshot header, byte for byte |

## Compatibility

- **Version skew.** The Starter pins Memory Spaces and Runtime exactly. Its new value imports, `MEMORY_SPACE_ID_PATTERN` and `RUNTIME_PROJECTION_FILES`, came with #416 and are released with it (`source-owned-formats` changeset); the `MemorySpace*` names exist since Memory Spaces 0.5.4 and are type-only. The new Memory Spaces exports are used inside Memory Spaces, by tests, and by the Starter's client through the gateway, which the Starter's build bundles from source (#421): the Starter's `lib/client.js` carries the value itself, so a Profile that keeps another Memory Spaces is unaffected. No plugin uses anything new in the Starter, so no peer floor moves. The Native Provider package is unchanged; a test keeps its id equal to the Source's.
- **Public SDK.** Additions only: four exports in Memory Spaces `./contracts`, and `NATIVE_PROVIDER_ID` in its `./client` entry. `ResolvedConfig` is not exported by name from any entry, and `STARTER_COMPONENT_ROWS`, now re-exported by `protocol.ts`, was never a public export; `src/client/starter-rows.ts` was internal. The `MemoryBody*` aliases stay published, and `scripts/fixtures/plugin-consumer` still compiles against them.
- **Persisted data.** Unchanged: the schema, the legacy import's output and every stored name are the same.
- **UI and the model.** Unchanged: the client bundle differs only as described, tool names and descriptions are untouched, and prompt text is byte-identical.

## Commands and results

```sh
pnpm install --frozen-lockfile
pnpm run verify
MNEMON_CLI_PATH=/nonexistent/mnemon MNEMON_PLUGIN_VERIFY_CONCURRENCY=1 pnpm run verify:plugins
DSH_HOST_ROOT=<prefix>/lib/node_modules/@deepseek-ai/dsh pnpm run test:installed-dsh   # DSH 0.2.0-rc.2
CHANGESET_BASE_REVISION=$(git rev-parse origin/main) CHANGESET_REVISION=$(git rev-parse HEAD) pnpm run release:intent
node scripts/verify-sync-git.mjs
node scripts/serve-e2e.mjs   # stopped with Ctrl-C once it printed the WebUI address

# The bundle comparison: build main and this branch the same way, then compare.
pnpm run build && pnpm --workspace-concurrency=4 -r build && pnpm run build
diff <main checkout>/lib/client.js lib/client.js
diff <main checkout>/lib/index.js lib/index.js
diff <main checkout>/plugins/dsh-mnemon-source-memory-spaces/lib/client.js plugins/dsh-mnemon-source-memory-spaces/lib/client.js

# The new tests on the base's Host modules: swap them in, run, restore.
for file in settings config live-config protocol legacy-settings-import; do git show f41a121f:src/host/$file.ts > src/host/$file.ts; done
pnpm exec vitest run tests/settings.spec.ts tests/live-config.spec.ts tests/config.spec.ts tests/legacy-settings-import.spec.ts
git checkout -- src/host
```

| Check | Result |
|---|---|
| Lockfile | `pnpm install --frozen-lockfile --lockfile-only` leaves `pnpm-lock.yaml` unchanged; no manifest changes |
| `pnpm run verify` | Passed on the final merge: documentation links and anchors (4,680 local links, 353 anchors), type check, deterministic output for 55 files, every plugin's type check and tests (591 passed, 3 skipped in 17 packages; Memory Spaces 291 and 2 skipped), root tests (2,098 passed, 7 skipped, 149 files), real Headless activation (38 tools, 8 of them Mnemon's) with the legacy settings import and the disabled Starter, package contents (65 files), 15 Node entries imported with 34 public type dependencies, publint and attw. After the `ca94e889` merge: 2,075 root tests passed and 7 skipped (146 files), 578 plugin tests; before the merges: 2,051 and 6 (141 files), 577 |
| Test counts | Root: 12 new (2,041 on `f41a121f`). Memory Spaces: 4 new (274 to 278) |
| `verify:plugins` | Passed: 17 standalone plugin repositories (install, type check, tests and build each), 18 packed artifacts, the external consumer (build, type check, tests), real DSH installing only the packed Starter over an upgrade from 0.5.29, and the three optional Strategy plugins activated together |
| Root tests on installed DSH 0.2.0-rc.2 | 2,095 passed, 10 skipped (149 files) on the final merge: the 3 more skips are the DSH 0.2.1-only real-host probes; 2,072 and 10 after the `ca94e889` merge, 2,051 and 6 before the merges |
| Git sync end to end | 64 of 64 checks passed on DSH 0.2.1-rc.2, and earlier on 0.2.1-rc.1: two real DSH Web instances publish to and pull from a real bare repository |
| `serve-e2e.mjs` | Installed the profile as before (the Starter and 13 component packages, leaving out the four that carry their own bundle patch), started the WebUI, which printed its address and answered 401 without its launch token, and removed the fixture on Ctrl-C |
| New tests on the base's Host modules | With `f41a121f`'s `settings.ts`, `config.ts`, `live-config.ts`, `protocol.ts` and `legacy-settings-import.ts`, 102 of the 104 tests in the four touched files pass; the two that fail assert that the resolved config leaves `toolviews` out |
| `release:intent` | Changeset coverage verified for `dsh-mnemon` and `dsh-mnemon-source-memory-spaces` |
