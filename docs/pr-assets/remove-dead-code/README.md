# Removing code nothing uses

[简体中文](./README.zh-CN.md)

A technical-debt review of the repository found declarations that nothing calls, and two client helpers whose product callers were replaced while their tests kept them alive. This change removes them. Nothing user-visible changes, and no public package entry loses a name.

Tested revision: the branch `claude/remove-dead-code`, on top of [#386](https://github.com/omdsh-dev/dsh-mnemon/pull/386) (`9a09c89e`), on 2026-10-17 with Node 24.19.0 and pnpm 10.13.1 against the pinned DSH 0.2.1-rc.1.

## What is removed

| Where | What | Why it was unused |
|---|---|---|
| `src/client/ui-icons.ts` | `IconDataOutline16` | No page draws it; the public `IconChevronLeftOutline14` beside it stays |
| `src/host/access.ts` | `DEFAULT_PARTICIPATION` | The configuration resolves each layer's participation with the same defaults (`src/host/config.ts`) |
| `src/host/activity-presentation.ts` | `MnemonActivityMeta` | A union alias nothing names; its two members stay |
| `src/host/protocol.ts` | `MemoryTopologyDefinition`, `MnemonSyncGitHubFlowStatus` | Neither Host nor client names them |
| `src/host/storage-scope.ts` | `validateCustomStorageRoot` | The configuration validates a custom data directory (`src/host/config.ts`) |
| `src/host/subagent.ts` | `DelegatedRecallResult` | A v0.3 pre-release alias of `RecallResult`; recall no longer delegates |
| Memory Spaces `providers/catalog.ts`, `providers/registry.ts` | `isMemoryProviderId`, `MemoryProviderAdapterFactory` | The registry class and `testing` are typed by `MemoryAdapterFactory` and `MemoryProviderAdapterFactoryContext`; nothing names these two |
| `src/client/component-feedback.ts` and `locales.ts` | `describePending` and the five `feedback.pending*` keys in each language | The configuration page names a change once it lands; only the helper's own test called it |
| `src/client/workspace-mount.tsx` | `mountMnemonSidebarLauncher` | Replaced in the product by `mountMnemonSidebarNavigation`, whose fallback entry is the same row and panel coordination |
| `src/client/MnemonSettingsCard.module.css` | `.boardRowCopy` in the reduced-motion rule | No element has the class |

One declaration is moved rather than removed. The result of the `supervise` RPC was declared twice in the Host (`DelegatedWriteResult` in `subagent.ts`, `SupervisedWritebackResult` in `lifecycle.ts`) and again inline, narrower, in the client's `supervise()`. Both now live in `src/host/protocol.ts`, where CONTRIBUTING keeps wire types, and the Host modules and the client use them; the Host modules still export the names.

## How it was checked

- [`harness/public-exports.mjs`](./harness/public-exports.mjs) asks TypeScript which declarations each public entry of the root package and of every plugin exposes, through any chain of re-exports. Before the removal, none of the names above was exposed; `memoryPageStyles` and `IconChevronLeftOutline14`, which `dsh-mnemon/client` exposes, were found, so the check sees public names.
- The 13 sidebar tests that drove the retired launcher now drive `mountMnemonSidebarNavigation` in a shell that declares no native panel seat, the path the product takes there. They pass unchanged otherwise.
- Type check passed. Root tests: 2,035 passed, 6 skipped (140 files); the one fewer is the removed helper's test. Memory Spaces: type check and 250 tests passed. `pnpm run verify:package`: 59 files, 14 Node entries imported, 31 public type dependencies verified, publint and attw clean. The copy fingerprint now counts 1,341 keys in each language.

Run the check yourself with the names to look up:

```sh
node docs/pr-assets/remove-dead-code/harness/public-exports.mjs "$PWD" memoryPageStyles IconChevronLeftOutline14
```
