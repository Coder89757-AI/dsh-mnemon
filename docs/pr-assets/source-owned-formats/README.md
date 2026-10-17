# Sources own their storage formats

[简体中文](./README.zh-CN.md)

The development guide says the root package owns the Host and the Starter, "not Source storage implementations", and the architecture says Sources own their formats. Yet the Starter Host read the Sources' private files with its own copies of their rules, in four places: the Mnemon Pack (`src/host/pack.ts`), the Mnemon store identity (`src/host/space-identity.ts`), the storage inventory on the Status page (`src/host/storage-scope.ts`) and Git sync (`src/host/git-sync.ts`). A change to a Source's files or lock name would have broken backup, sync and the Status page without a failing test, and a Mnemon schema change would have broken the Host.

This change is items (a) and (b) of audit item H1: each Source states its own files and rules in its contracts, and the Host uses them. Nothing a user sees or stores changes.

Item (c), Sources declaring their part in a Pack, is dropped by the maintainer's decision: Mnemon Pack backups and Git sync deliberately cover only the official components (Runtime, Documents, Memory Spaces). dsh-mnemon does not back up or sync an installed third-party Source, which handles its own data. [Building Memory Plugins](../../en/development/extensions.md#open-operations-bounded-execution) says so to Source authors, and [Backup and recovery](../../en/guides/operations.md#backup-and-recovery) says it to users.

Tested revision: branch `claude/source-owned-formats` on main `4996a796` (v0.5.31, [#414](https://github.com/omdsh-dev/dsh-mnemon/pull/414) and [#415](https://github.com/omdsh-dev/dsh-mnemon/pull/415)), 2026-10-17 (Asia/Shanghai), Node 24.19.0 and pnpm 10.13.1, against the pinned DSH 0.2.1-rc.1; the root tests also ran against an installed DSH 0.2.0-rc.2.

## What moved where

| Knowledge | Was in | Now in |
|---|---|---|
| The USER.md/MEMORY.md projection and its byte count | `pack.ts`, a copy of the Runtime controller's | `dsh-mnemon-source-runtime/contracts`: `runtimeProjection`, `runtimeBytes`; the controller and the Pack both use them |
| Runtime directory, files, lock and its stale rule, local archive, entry size limit | `pack.ts`, `storage-scope.ts`, the controller | `RUNTIME_DIRECTORY`, `RUNTIME_MEMORIES_FILE`, `RUNTIME_PROJECTION_FILES`, `RUNTIME_LOCK_FILE`, `RUNTIME_LOCK_STALE_MS`, `RUNTIME_ARCHIVE_DIRECTORY`, `RUNTIME_ENTRY_MAX_BYTES` |
| Counting memories.json for the inventory | `storage-scope.ts` | `summarizeRuntimeMemories` |
| The Documents index as a backup carries it | `pack.ts` | `dsh-mnemon-source-documents/contracts`: `parseDocumentIndex`, `DocumentIndex`, `DOCUMENT_FILENAME_PATTERN` |
| Documents directory, index, lock and its stale rule | `pack.ts`, `storage-scope.ts`, the controller | `DOCUMENTS_DIRECTORY`, `DOCUMENTS_INDEX_FILE`, `DOCUMENTS_LOCK_FILE`, `DOCUMENTS_LOCK_STALE_MS` |
| Counting index.json | `storage-scope.ts` | `summarizeDocumentIndex` |
| The Native registry as a backup carries it | `pack.ts` | `dsh-mnemon-source-memory-spaces/contracts`: `parseMemorySpaceRegistry`, `MemorySpaceRegistryEntry`, `MemorySpaceRegistryFile` |
| Store layout: data directory, registry, `mnemon.db`, space id rule, Mnemon's `active` file, Provider registry | `pack.ts`, `storage-scope.ts`, the registry, the Mnemon runner | `MEMORY_SPACES_DIRECTORY`, `MEMORY_SPACE_REGISTRY_FILE`, `MEMORY_SPACE_DATABASE_FILE`, `MEMORY_SPACE_ID_PATTERN`, `MNEMON_ACTIVE_STORE_FILE`, `MEMORY_PROVIDER_REGISTRY_FILE` |
| Counting the registry and the Provider registry | `storage-scope.ts` | `summarizeMemorySpaceRegistry`, `summarizeMemoryProviderRegistry` |
| The Mnemon schema: comparing and merging two copies of a store ([#370](https://github.com/omdsh-dev/dsh-mnemon/issues/370), [#391](https://github.com/omdsh-dev/dsh-mnemon/issues/391)) | `src/host/space-identity.ts` | `dsh-mnemon-source-memory-spaces/space-identity`, a new Node-only entry built and typed like `./native-cli`. It exports one class, made from the directory its copies go in, with `of`, `contains`, `merge` and `dispose`; the implementation, its row limits and its test hooks stay in an internal module. Its 17 tests and the Mnemon schema fixture moved with it, and one more test pins the entry's surface |
| The Pack's payload layout, repeated by sync | `git-sync.ts` | `pack.ts` exports `payloadPrefix` and `DOCUMENTS_INDEX_PATH` |

The contracts helpers are pure and import nothing from Node, since the browser bundle loads contracts too. The four `summarize*` helpers share one shape: they never throw, and return `valid` with their counts; the messages the Status page shows stay in the Host, unchanged. `runtimeBytes` counts with `TextEncoder`, which gives the same count as the `Buffer.byteLength` the controller used, unpaired surrogates included; a test computes it with `Buffer` hidden.

The Host keeps what is its own: the Pack format (manifest, checksums, the entry list, merges, tombstones), the Pack's own lock `.dsh-pack.lock`, and how long it waits for any lock (5 seconds). It now takes over a Source's lock only under that Source's stale rule (30 seconds for both today, as before) and still takes the runtime lock before the documents lock, whatever order a manifest lists its components in.

### Left in the Host on purpose

- `parseRuntime` in `pack.ts` is the Pack's check of an incoming memories.json and differs from the controller's reader on purpose: it drops a profile entry's branch scope instead of refusing the file, and enforces the size limits. One shared parser would change one of them.
- A document's Markdown front matter (its `id:` line and body) is still read by `pack.ts` when it checks a payload's content hash, and rewritten when a merge keeps a divergent copy under a new id. Both hash with `node:crypto`, and the copy is a merge decision of the Pack; moving them needs a Node entry in Documents.
- The Pack's own safety checks when it copies a store: the SQLite file header, and the refusal of a store whose write-ahead log is not checkpointed.
- `src/host/subagent.ts` checks a compaction's byte budget with its own `Buffer.byteLength`; that file is audit item H2.
- `MNEMON_PACK_COMPONENTS` still fixes a Pack to the three official components, by design (see above).

### Follow-ups found on the way

- A Pack carries six fields of each Native space, so a replace or merge import rewrites the local registry without a space's `placement` and `metadataSource`. This predates this change, which keeps the behavior and documents it at `parseMemorySpaceRegistry`.
- Smaller copies of Source rules remain in the Host: the 100- and 1,000-character limits on a space's name and description, the space id rule in `src/host/config.ts`, and the USER.md/MEMORY.md names in `src/host/subagent.ts`.

## Equivalence

- **Byte for byte.** [`harness/pack-equivalence.mts`](./harness/pack-equivalence.mts) drives the real Pack and inventory over synthetic directories: a full and a Runtime-only export, a preview, a replace import into an empty directory, a merge into a populated one with real SQLite stores (so the Memory Space merge rule runs and writes a merged store), an export of the merged result, a two-component replace, and the inventory of four directories. It records every produced byte as a SHA-256 digest. Run once with main's `src/host` and once with this branch's, both outputs are the same file (`3ffd2ecc6c3773cd6078029b5f7c9b85429789eb9c0ab02eafb95f0561e8c833`); the full archive is `e908aad7181b319838d77e810754eccba2edf76e2ce8a500fca096fb5e69665f` both times.
- **The new root tests describe what main already did.** With main's `pack.ts`, `storage-scope.ts`, `git-sync.ts` and `space-identity.ts` swapped in, `tests/pack.spec.ts`, `pack-compat-0.5.24.spec.ts`, `pack-tombstones.spec.ts`, `storage-scope.spec.ts` and `documents-index-integrity.spec.ts` pass: 67 tests, the four new ones included.
- **The lock test catches a wrong lock.** With the Pack pointed at another runtime lock name, the new lock test fails.

New tests:

| Where | What it shows |
|---|---|
| `plugins/dsh-mnemon-source-runtime/tests/contracts.spec.ts` | The names are the controller's paths; `runtimeProjection` equals the USER.md/MEMORY.md bytes the controller writes and `runtimeBytes` the usage it reports; the count equals `Buffer.byteLength` without `Buffer`; the entry limit; the inventory count |
| `plugins/dsh-mnemon-source-documents/tests/contracts.spec.ts` | The names are the controller's paths; the parser reads the index the controller writes unchanged, normalizes a legacy `.mnemon/` path, keeps and drops fields as before, and refuses each broken rule with its message; the inventory count |
| `plugins/dsh-mnemon-source-memory-spaces/tests/contracts.spec.ts` | The names are the registry's and the runner's; the id rule equals `validateMemorySpaceId`; the parser reads the registry the Source writes; refusals; the registry and Provider registry counts |
| `tests/pack.spec.ts` | A Pack carries and lands USER.md and MEMORY.md as the bytes the Runtime Source writes; a Source lock is taken over only when stale by its Source's rule, and a live one is waited for (a worker thread holds it) |
| `tests/pack-compat-0.5.24.spec.ts` | The entry names, now built from the Sources' names, are exactly the ones 0.5.24 accepts |
| `tests/storage-scope.spec.ts` | Loose and damaged areas (unknown targets, a missing projection, a version 2 registry, broken JSON) give the same statuses, counts and messages |

## Compatibility

- **Version skew.** The Starter pins the three Sources exactly and imports the new exports from its own pinned copies, as it already imports `parseRuntimeBranches` and `RUNTIME_ENTRY_DELIMITER`. A Profile that keeps its own older or newer copy of a Source changes which Source runs, not what the Starter imports: Node resolves the Starter's imports from its own dependencies, and npm and pnpm install the pinned version there when the Profile holds another. An older Starter with these Sources keeps its own copies and works unchanged, because no name, value or stored byte changed. No Source uses anything new in the Starter, so no peer floor changes. One limit stays as it was: the Host reads a Source's files with the rules of the version the Starter pins, so a Profile running another version of that Source is read with the pinned version's rules, as it was read with the Host's own copies before. Letting the running Source decide would need a runtime contract, which the maintainer ruled out with item (c).
- **Release.** The Starter now uses new exports of `dsh-mnemon-source-runtime`, `dsh-mnemon-source-documents` and `dsh-mnemon-source-memory-spaces` (including the new `./space-identity` entry), so those three must be released with it; the release PR keeps the exact pins. No peer floor is needed for the Sources, since the Starter depends on them, not the reverse.
- **Public SDK.** Only additions. No export of any package is removed or renamed, and the new types are also visible through each Source's root entry, which re-exports its contract types. `./space-identity` exposes one class whose constructor takes only a directory, so its limits and test hooks can change freely.
- **Persisted data.** Unchanged, as the harness shows: the same archive bytes, the same imported files and permissions.
- **UI.** Unchanged. The Status page's counts, statuses and messages are the same (`tests/storage-scope.spec.ts`).
- **Node 20.** The contracts are plain functions. `./space-identity` loads `node:sqlite` only when it compares, as before, and its published declarations no longer name `node:sqlite` types, so they compile against older Node types.

## Commands and results

```sh
pnpm install --frozen-lockfile
pnpm run verify
MNEMON_CLI_PATH=/nonexistent/mnemon MNEMON_PLUGIN_VERIFY_CONCURRENCY=1 pnpm run verify:plugins
DSH_HOST_ROOT=<prefix>/lib/node_modules/@deepseek-ai/dsh pnpm run test:installed-dsh   # DSH 0.2.0-rc.2
CHANGESET_BASE_REVISION=$(git rev-parse origin/main) CHANGESET_REVISION=$(git rev-parse HEAD) pnpm run release:intent
node scripts/verify-sync-git.mjs
MNEMON_E2E_DSH=<prefix>/lib/node_modules/@deepseek-ai/dsh/lib/bin.js node scripts/verify-sync-git.mjs   # DSH 0.2.0-rc.2

# The byte-for-byte comparison: once on this branch, once with main's Host modules checked out.
node --experimental-transform-types --no-warnings docs/pr-assets/source-owned-formats/harness/pack-equivalence.mts "$PWD" "$TMPDIR/branch.json"
for file in pack storage-scope git-sync space-identity; do git show origin/main:src/host/$file.ts > src/host/$file.ts; done
node --experimental-transform-types --no-warnings docs/pr-assets/source-owned-formats/harness/pack-equivalence.mts "$PWD" "$TMPDIR/main.json"
git checkout -- src/host && rm src/host/space-identity.ts
cmp "$TMPDIR/branch.json" "$TMPDIR/main.json"
```

| Check | Result |
|---|---|
| Lockfile | `pnpm install --frozen-lockfile --lockfile-only` leaves `pnpm-lock.yaml` unchanged |
| `pnpm run verify` | Passed: documentation links and anchors, type check, deterministic output for 49 files, every plugin's type check and tests (574 passed, 3 skipped in 17 packages: Runtime 80, Documents 47, Memory Spaces 274 and 2 skipped), root tests (2,041 passed, 6 skipped, 140 files), real Headless activation (38 tools, 8 of them Mnemon's), package contents (59 files), 15 Node entries imported with 32 public type dependencies, publint and attw |
| Test counts against main | Root: 17 fewer (the identity tests moved into Memory Spaces) and 4 new. Runtime and Documents: 6 new each. Memory Spaces: 17 moved in and 7 new |
| Byte-for-byte harness | Identical outputs on main and on this branch (see Equivalence) |
| New root tests on main's Host | 67 passed in 5 files |
| Browser bundles | Each Source's `lib/client.js`, built from main's sources and from this branch's, is byte-identical |
| `verify:plugins` | Passed: 17 standalone plugin repositories (install, type check, tests and build each), 18 packed artifacts, the external consumer (build, type check, tests; it imports every declared Node entry, `./space-identity` included), real DSH installing only the packed Starter over an upgrade from 0.5.29, and the three optional Strategy plugins activated together |
| Root tests on installed DSH 0.2.0-rc.2 | 2,041 passed, 6 skipped (140 files), as on the pinned host |
| Git sync end to end | 64 of 64 checks passed on DSH 0.2.1-rc.1 and on 0.2.0-rc.2: two real DSH Web instances publish to and pull from a real bare repository |
| `release:intent` | Changeset coverage verified for `dsh-mnemon` and the three Sources |
