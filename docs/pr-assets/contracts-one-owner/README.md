# One owner for shared values, wire types and sync checks

[简体中文](./README.zh-CN.md)

The technical-debt audit after v0.5.31 found values the Starter's Host copied from the Sources, wire result types declared outside the browser-safe protocol, RPC endpoint names spelled freely on both sides, and a settings form that re-implemented the Host's Git sync checks (items M2 and M3). This change gives each of them one owner. The maintainer's rule for the batch holds: nothing users or the model see changes, and every stored configuration validates exactly as before, the timeout bounds included ([plan item 4](../../plans/review-gaps-2026-10.md#4-one-timeout-range-for-mnemon-calls) aligns those later).

Tested revision: branch `claude/contracts-one-owner`, written on main `03dd40a4` (#423) and merged with main `7a7e1ae1` (#424, #425), 2026-10-17 to 2026-10-18 (Asia/Shanghai), Node 24.19.0 and pnpm 10.13.1, against the pinned DSH 0.2.1-rc.2; the root tests also ran against an installed DSH 0.2.0-rc.2. The checks below passed on the merge; `verify`, `verify:plugins`, the installed DSH and Git sync also passed before it. The fixes after the review were checked as the table's last row says. #425 split the sync settings section into modules that import the form's checks from `sync-view.ts` under the same names, so it needed no change.

## What changed

| Item | Before | Now |
|---|---|---|
| Memory Spaces' lists and embedding defaults | `src/host/protocol.ts` declared copies of `CATEGORIES`, `SOURCES`, `EDGE_TYPES`, `INTENTS` and the embedding endpoint, model, protocol and protocol list from Memory Spaces' `./contracts`. The named tools built their `category`, `source`, `edge` and `type` enums from the copy, and `config-values.ts` re-exported the embedding values from it. Since #421 no client code reads them | protocol.ts no longer declares them. `src/host/tools.ts` imports the three lists from `dsh-mnemon-source-memory-spaces/contracts`, and `config-values.ts` re-exports the embedding defaults from there, as the Host takes a space id's rule and the Sources' file names since #416. The client needs none of them, so nothing joins the client build's bundled list, and the Starter's client still takes Memory Spaces' code only through its one gateway module (`tests/plugin-repository-boundary.spec.ts`). Memory Spaces' Source also builds its category, source, intent and edge checks from those lists |
| Runtime limits | `config-values.ts` restated 10 KiB, 4 KiB and 1 MiB | The defaults come from `RUNTIME_MEMORY_LIMITS`, and the ceiling from `RUNTIME_MEMORY_LIMIT_MAX_BYTES`, a new export of `dsh-mnemon-source-runtime/contracts` with the value its configuration and controller already apply |
| Placement capabilities | Listed three times: in the Host's settings schema (`src/host/config.ts`), in Memory Spaces' `MemoryPlacementCapability` type and in its configuration's check. The labels Memory Spaces' placement gives each, a record keyed by the type, are kept complete by the compiler and stay | Memory Spaces' `./contracts` exports `MEMORY_PLACEMENT_CAPABILITIES` and derives the type from it; both schemas take the list |
| Timeout bounds | The Host takes 100–120,000 ms for `timeoutMs`, Memory Spaces 1–600,000 ms | Unchanged. A comment at each names the other range and that aligning them is on the roadmap |
| The Starter patch's defaults | `cordis.patch.yml` restates twelve settings of the `mnemon` Entry, embedding, recall quality and the timeout among them | Unchanged, with a test that every value it writes is the code's default: the schema's, which DSH's generated form shows, and `resolveConfig`'s |
| Wire result types | `src/host/subagent.ts` declared three results that cross the RPC boundary: `DelegatedAnswerResult` (what `agent-search` adds to the recalled results), `CoordinatedDocumentResult` (Document writes and archives) and `CoordinatedRuntimeMemoryResult` (runtime memory writes, as the value of a management result) | In protocol.ts; subagent.ts re-exports them, as it has re-exported `DelegatedWriteResult` since #411 |
| RPC endpoint names | Free strings: the client's `MnemonClient`, its settings scope and the operations a page lends components on one side, the Host's switches on the other | `MNEMON_RPC_ENDPOINTS` in protocol.ts lists every endpoint the Host serves on each of its nine channels, 75 in all, under the same names. `callMnemonRpc`, `MnemonClient`'s calls and the operations a page lends a component are typed against it, a component operation by its mode. A misspelled name no longer compiles, nor does a name sent on a channel or in a mode that does not serve it where the call names that channel or mode itself; a call that picks one at run time, as `assistSource` and the page's lent operations do, takes any name one of its channels serves. The View handler reads its names from the list instead of its own literals, and the API Gateway's settings guard keeps what a remote page needs for each settings endpoint in a map typed against it, so a settings endpoint added later does not compile until it is given one; it looks up only a string, so a malformed name gets the unknown-endpoint answer as before |
| Git sync checks | `src/client/sync-view.ts` re-implemented, "as the Host checks it", the Host's checks of a repository address, a branch, a directory and an author address (`sync-config.ts`), of a machine name (`machine-identity.ts`) and of a GitHub repository name (`github-auth.ts`) | `src/host/sync-rules.ts`, which imports nothing and which protocol.ts re-exports, holds the rules and `MNEMON_MACHINE_LABEL_MAX`. Both sides call them; every message stays where it was, word for word |
| Interfaces reference (a documentation error) | The channel table said remote pages may read `/dsh-mnemon-review` and need the trusted-host grant only for `reconcile` and `apply` | The row says they need `remoteAccess: trusted-host`, as `MnemonRemoteService.review` and the paragraph below the table do; a test pins the refusal of each review endpoint |

### Where the form and the Host differ

The shared rules keep each side's verdicts. Where the two disagreed, each still does what it did:

- **A local repository path.** The form cannot know which platform the Host runs on, so it takes `portableAbsolutePath`: a POSIX path, a Windows path on a drive, or a UNC share. The Host passes Node's `path.isAbsolute` for its own platform, so the same paths validate on each platform as before. They differ in three cases, which `tests/sync-rules.spec.ts` pins: on a POSIX Host the form takes `C:\repo` and `\\server\share`, which the Host refuses on save, and on a Windows Host the Host takes a path from the root of the current drive, `\repo`, for which the form shows its format hint.
- **A NUL byte** in a repository address or in the directory inside the branch: only the Host refuses it, as before.
- **The rest were one rule already.** The branch checks only the Host spelled out (no `\`, no leading `/`, not `@`) follow from the pattern both use, and an empty author address keeps meaning this machine's Git identity on the Host, which the form offers as a choice of its own.

Changing either difference changes what users see or what validates, so both are findings for the roadmap, not part of this batch.

### Left as it is

- **Endpoints only other callers use.** The Host serves 28 endpoints the shipped client no longer calls: the direct paths the workbench used before its pages moved to Source management and Host assistance (859d8df8, September 2026), the single-turn `turn-activity` read that the turn bar's `turn-activities` replaced in August, the activation channel's `body` endpoint, and the View channels' `preview`, `inspect-plugin` and `install-plugin`. The [Interfaces reference](../../en/reference/interfaces.md#rpc-channels) still lists them, and `scripts/verify-sync-git.mjs` writes through the direct `runtime-memory` endpoint. The endpoint test names all 28, so that removing one, or the client calling one again, is a decision; removing them changes the Host's interface and is not part of this batch.
- **The Host's defaults for what it forwards.** `timeoutMs` (10,000 ms) and `defaultRecallLimit` (10) are the Host's own settings: the first also bounds the Core's Source calls, the second the `/mnemon recall` command. Memory Spaces' equal defaults apply only to an instance the Starter does not configure, such as one mounted on its own. The patch test checks the patch against the Host's.
- **The named tools' other literal enums** (recall modes, runtime actions, targets and importance, Document actions) restate Source operation shapes that the Sources do not export as lists. What the tool schemas tell the model is audit item M4 and plan item 6.
- **`RecallResult`** stays in subagent.ts: it is what `mnemon_recall` and `mnemon_related` return to the model and what `/mnemon recall` prints, not an RPC answer.
- **Memory Spaces' page client** declares the shape of its `supervise` answer itself: a plugin can import only the public `dsh-mnemon` entries, and the protocol is not one of them.

## Equivalence

- **Browser bundle.** `lib/client.js` built from main `7a7e1ae1` and from this branch in the same way (the root, every plugin, the root again) differs in two places only: the region of `src/host/sync-rules.ts`, ten patterns and seven functions with their doc comments, which the form's checks in `sync-view.ts` now call, shrinking to one line each; and the operations a page lends a component, which take the endpoint they found (`names.find`) where they checked `names.includes` (948,312 to 950,182 bytes, +1,870). The endpoint list, the moved types and the removed constants never reach the client bundle: rolldown leaves out what the client does not read. Memory Spaces' and Runtime's `lib/client.js` and Memory Spaces' `lib/provider-sdk.js` are byte-identical.
- **Host bundle.** `lib/index.js` differs where the items say (686,227 to 689,453 bytes): the imports of the Memory Spaces and Runtime values with the copies gone, the runtime limit constants reading `RUNTIME_MEMORY_LIMITS` and `RUNTIME_MEMORY_LIMIT_MAX_BYTES`, the shared sync rules and the calls to them, the endpoint list with the View handler that reads it, and the remote settings map. The named tools' code is byte-identical, since the names they use are now imported under the same spelling.
- **Memory Spaces and Runtime.** Memory Spaces' `lib/contracts.js` adds `MEMORY_PLACEMENT_CAPABILITIES` (5,871 to 6,136 bytes), and its `lib/index.js` builds its checks from the contract lists (202,293 to 202,009). Runtime's contracts chunk adds `RUNTIME_MEMORY_LIMIT_MAX_BYTES` (4,018 to 4,203), which renames the chunk.
- **What the model sees.** `tests/memory-tools.spec.ts` compares every tool's name, description, input and output schema with `tests/fixtures/model-tools.json`, which this change leaves untouched; it passes.
- **Package.** `verify:package` counts 66 files instead of 65 (the new `sync-rules.d.ts`), 479,524 packed bytes instead of 476,306 and 2,030,924 unpacked instead of 2,021,100, and 35 public type dependencies (declaration files) instead of 34, the new one `sync-rules.d.ts`; the client's 21 declarations are unchanged.
- **The sync checks, verdict for verdict.** [`harness/sync-rules-equivalence.mts`](./harness/sync-rules-equivalence.mts) runs the form's six checks and the Host's six, a GitHub repository creation included, over 4,650 inputs: every string of up to three characters from 16 characters the rules treat specially (NUL, `\`, `/`, `:`, `@`, `{`, a space, a line break, U+2028 and others), values at each length limit, and repository addresses from 17 prefixes and 12 bodies. It records each verdict, each value the Host returns and each message it throws. With main's `sync-view.ts`, `sync-config.ts`, `machine-identity.ts`, `github-auth.ts` and `protocol.ts` swapped in, the output is the same file (`2f36fd57d8669c36a9374b248d7f7d83f591232dce1e0923f8e1e68df5fb0460`). With the form's path rule changed to take a single leading backslash, the form's digest changes.
- **The new tests describe what main already did.** With main's modules swapped in, the new and touched tests pass: the endpoint, API Gateway, View, client transport and component host tests on main's `src/client/api.ts`, `component-host.ts` and `remote-rpc.ts` and `src/host/view-rpc.ts` and `remote-rpc.ts` (57 tests in 5 files); the configuration and tool tests on main's `config.ts`, `config-values.ts`, `protocol.ts` and `tools.ts` (49 in 3); the sync tests on main's four sync modules (87 in 5).
- **The tests catch a drift.** An endpoint added to the list that the Host does not serve fails both endpoint tests, on the View channels too, where such a name passes the guard and meets `Unknown View operation`; `turn-activity` left out of the list fails both, the Host test because it also probes every word the handler modules spell; the patch's `timeoutMs` changed to 9,999 fails the patch test; a misspelled client endpoint, `status` sent on the Pack channel, a lent write operation named after a read endpoint, or a read component operation that names `embedding-fill` fails the type check.

New and extended tests:

| Where | What it shows |
|---|---|
| `tests/rpc-endpoints.spec.ts` | The Host registers the nine listed channels, and each handler serves exactly its listed endpoints, probed with every listed name and every word its module spells. The client, from each method of `MnemonClient` (the test fails when a method is added without it), from its settings scope and from the operations a page lends components, calls only listed endpoints; the listed endpoints it never calls are exactly the 28 kept for other callers |
| `tests/sync-rules.spec.ts` | The form and the Host take the same branches, directories, author addresses, machine names and GitHub repository names (the last through GitHub sign-in's own `create`), and the same repository addresses apart from local paths, where it pins the form's rule beside Node's POSIX and Windows rules; only the Host refuses a NUL byte, with its own messages |
| `tests/client-platform-boundary.spec.ts` | protocol.ts and the five modules it takes values from import nothing from Node; before, the test read protocol.ts alone |
| `tests/config.spec.ts` | The patch writes only code defaults into the `mnemon` Entry; the Host defaults and bounds the runtime limits as the Runtime Source does, at 10,240, 4,096 and 1,048,576 bytes; both schemas take exactly the listed placement capabilities; each with the schema's message |
| `tests/remote-rpc.spec.ts` | The API Gateway reaches exactly the listed settings endpoints, `mutate` only with the trusted-host grant, and refuses any other name, `constructor` and `__proto__` among them, with its message; a name that is not a string, such as `["get"]`, gets that answer without the settings handler being asked; every review endpoint needs the grant |
| Runtime `tests/contracts.spec.ts` | `RUNTIME_MEMORY_LIMITS` and `RUNTIME_MEMORY_LIMIT_MAX_BYTES` are what its configuration and controller apply, with the controller's message |
| Memory Spaces `tests/config.spec.ts`, `tests/provider-placement.spec.ts` | The persistence strategy takes exactly `MEMORY_PLACEMENT_CAPABILITIES`, refusing others with its message, and placement can check a Provider for each |

## Compatibility

- **Version skew.** The Starter's Host now imports two new exports, `MEMORY_PLACEMENT_CAPABILITIES` from Memory Spaces and `RUNTIME_MEMORY_LIMIT_MAX_BYTES` from Runtime, so both Sources are released with this Starter and the release PR keeps the exact pins. As with #416, Node resolves the Starter's imports from its own dependencies, so a Profile that keeps another copy of a Source changes which Source runs, not what the Starter imports. The other values it now imports exist in the pinned versions. An older Starter beside these Sources keeps its own copies, of the same values. A Starter run beside a Memory Spaces or Runtime without these exports would fail to load, which the exact pins rule out, as for #416's imports. No Source uses anything new in the Starter, so no peer floor moves. The wire is unchanged, so a page still open from the previous version talks to this Host as before.
- **Public SDK.** Additions only: the two exports above, which the two packages' READMEs now name, and `MemoryPlacementCapability` keeps its members, now derived from the list. The constants protocol.ts stops declaring were never a package export (`protocol.ts` is internal, and `dsh-mnemon/client` re-exports none of them), and the moved types keep their names in subagent.ts.
- **Persisted data and settings.** Unchanged: the schemas' bounds and defaults have the same values (the patch test and the existing configuration tests), the sync settings file validates the same values (the harness, run on POSIX; on Windows both versions call the same `path.isAbsolute`), and nothing is written differently.
- **UI and the model.** Unchanged: the browser bundle differs only as described, the form's checks give the same verdicts and the Host the same messages (the harness), and the tools match the fixture.
- **Node 20.** `sync-rules.ts` uses only the regular expressions and string methods the form already used.

## Commands and results

```sh
pnpm install --frozen-lockfile
pnpm run verify
MNEMON_CLI_PATH=/nonexistent/mnemon MNEMON_PLUGIN_VERIFY_CONCURRENCY=1 pnpm run verify:plugins
DSH_HOST_ROOT=<prefix>/lib/node_modules/@deepseek-ai/dsh pnpm run test:installed-dsh   # DSH 0.2.0-rc.2
CHANGESET_BASE_REVISION=$(git rev-parse origin/main) CHANGESET_REVISION=$(git rev-parse HEAD) pnpm run release:intent
node scripts/verify-sync-git.mjs
MNEMON_E2E_DSH=<prefix>/lib/node_modules/@deepseek-ai/dsh/lib/bin.js node scripts/verify-sync-git.mjs   # DSH 0.2.0-rc.2

# The bundle comparison: build main and this branch the same way, then compare.
pnpm run build && pnpm --workspace-concurrency=4 -r build && pnpm run build && pnpm run verify:package
diff <main build>/lib/client.js lib/client.js
diff <main build>/lib/index.js lib/index.js

# The sync checks, once on this branch and once with main's modules swapped in.
node --experimental-transform-types --no-warnings docs/pr-assets/contracts-one-owner/harness/sync-rules-equivalence.mts "$PWD" "$TMPDIR/branch.json"
for file in src/client/sync-view.ts src/host/sync-config.ts src/host/machine-identity.ts src/host/github-auth.ts src/host/protocol.ts; do git show origin/main:$file > $file; done
node --experimental-transform-types --no-warnings docs/pr-assets/contracts-one-owner/harness/sync-rules-equivalence.mts "$PWD" "$TMPDIR/main.json"
git checkout -- src
cmp "$TMPDIR/branch.json" "$TMPDIR/main.json"
```

| Check | Result |
|---|---|
| Lockfile | No manifest or lockfile change; `pnpm install --frozen-lockfile` |
| `pnpm run verify` | Passed: documentation links and anchors (4,816 local links, 368 anchors), type check, deterministic output for 56 files, every plugin's type check and tests (593 passed, 3 skipped in 17 packages; Runtime 81, Memory Spaces 292 and 2 skipped), root tests (2,108 passed, 7 skipped, 151 files), real Headless activation (38 tools, 8 of them Mnemon's) with the legacy settings import and the disabled Starter, package contents (66 files), 15 Node entries imported with 35 public type dependencies, publint and attw |
| Test counts | Root: 11 new (2,098 on `7a7e1ae1`), 6 in the two new files, 3 in `tests/config.spec.ts` and 2 in `tests/remote-rpc.spec.ts`, and two extended. Runtime: 1 new (80 to 81). Memory Spaces: 1 new (291 to 292) and one extended |
| `verify:plugins` | Passed: 17 standalone plugin repositories (install, type check, tests and build each), 18 packed artifacts, the external consumer (build, type check, tests), real DSH installing only the packed Starter and activating its plugins, and the three optional Strategy plugins activated together |
| Root tests on installed DSH 0.2.0-rc.2 | 2,105 passed, 10 skipped (151 files): the 3 more skips are the DSH 0.2.1-only real-host probes |
| Git sync end to end | 64 of 64 checks passed on DSH 0.2.1-rc.2 and on 0.2.0-rc.2: two real DSH Web instances configure a local bare repository through the shared checks, publish to it and pull from it |
| Sync checks harness | 4,650 inputs through 12 checks; the same output on main's modules and this branch's |
| New tests on main's modules | 57 tests in 5 files (endpoints), 49 in 3 (configuration and tools), 87 in 5 (sync) |
| Bundles | `lib/client.js` +1,870 bytes, only the shared sync rules and the lent operations' lookup; Memory Spaces' and Runtime's client bundles byte-identical |
| `release:intent` | Changeset coverage verified for `dsh-mnemon`, `dsh-mnemon-source-memory-spaces` and `dsh-mnemon-source-runtime` |
| After the review: `1928b1ab`, `b2cbe87d`, `36fd588a` and this record | Root build and `pnpm run typecheck`; the affected specs, `tests/remote-rpc.spec.ts` among them, whose new test fails without the string check and passes with main's `remote-rpc.ts`, with the endpoint, configuration, sync rule and two boundary specs (78 tests in 7 files); `pnpm run test:root` (2,109 passed, 7 skipped, 151 files); `node scripts/verify-docs.mjs` (4,816 local links, 368 anchors); `release:intent` for the same three packages |
