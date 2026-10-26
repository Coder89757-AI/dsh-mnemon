# PR 355: choose a directory without moving existing data

[中文](./README.zh-CN.md) · [Evidence index](../README.md)

Verified on 2026-10-26 against current main `600072a85863d3c16a04aea335696e60b3d5e4a4` plus the narrowed PR, with Node 22.22.0 and pnpm 10.13.1. The contributor's three commits ending at `ecef09f793a7c40827257e2e547b548e65c1885c` remain in the branch history. [Structured results](./verification.json).

## Result and compatibility boundary

The custom-path field gains **Choose directory** only when the local DSH composition supplies a native Host picker and the public client action. The choice fills the draft; **Apply** uses the existing settings mutation. Cancel, Discard changes, read-only views and errors retain their existing settings. Late answers cannot overwrite a newer draft, scope, workspace or saved configuration. A failed chooser gives a short recovery message and leaves manual input available. Browse-only, remote, absent and older capabilities keep manual entry.

The automatic migration, deletion and relocation RPCs from the original PR are removed. Global/default, global/custom, Workspace and Centralized keep their current semantics; ZIP import remains merge-only. No persistence schema, storage initialization or existing data handling changes. The Pack target response adds only an optional capability boolean. No DSH source or private desktop bridge is used.

Disposable probes of the original contributor head reproduced omitted symlinks/empty directories, a symlink alias defeating the nested-target check, ignored `remove:false` on rename, and a profile-write failure after the source had already moved. These operations are excluded from the final change; this record does not claim a repaired automatic migration.

## Verification

- `pnpm run verify`: passed. Root 2,220 passed / 7 conditional skips; plugins 689 passed / 3 conditional skips; types, deterministic builds, documentation, Headless and packed public entries pass.
- Installed DSH 0.2.1-rc.3: 2,220 passed / 7 conditional skips. Installed 0.2.0-rc.2: 2,217 passed / 10 conditional or host-specific skips. On macOS, `DSH_HOST_ROOT` was the canonical `/private/tmp/...` path so the installed-host resolver could identify its imports.
- Twenty-eight new regressions cover capability fallback, local versus remote, successful selection, cancellation, duplicates, save refusal/retry, scope preservation, read-only views, obsolete async results, and refusal of the removed migration endpoints. The existing RPC test still verifies that a requested ZIP replacement imports by merge instead.
- Real rc.2 WebUI with the published native picker: the button appears, calls DSH and starts its macOS picker process. Terminating only this disposable chooser verifies recovery without a raw command dump. Manual entry saves, Discard restores, and a cold Host restart retains the saved path. Returning to Default unsets the global custom path. A synthetic file's SHA-256, a symbolic link and an empty directory remain in the source throughout; none is automatically copied.
- Real 0.2.0-rc.2 browse-only WebUI: no native button; a manual central root saves with `storageScope: workspaces` and the workspace-hash subdirectory. Returning to Default keeps `workspaces` and saves an empty custom root.

**Uncompleted manual check:** the automation tool cannot target the standalone macOS `osascript` window. A real OS-dialog selection and cancel were therefore not completed; their return values are covered by component tests. Windows/Linux native dialogs were not manually exercised. The screenshots show real settings save/fallback/error recovery, not a completed OS selection.

Reproduce the UI fixtures with the [committed harness](../../../scripts/serve-e2e.mjs):

```sh
pnpm run build
MNEMON_E2E_PORT=43355 node scripts/serve-e2e.mjs --native-directory-picker
MNEMON_E2E_DSH=/path/to/installed/0.2.0-rc.2/lib/bin.js MNEMON_E2E_PORT=43356 node scripts/serve-e2e.mjs
```

Open Plugins → Composable Memory → Storage. On the native fixture select Custom, exercise the chooser, cancel or select a disposable directory, and apply/discard. In the browse fixture confirm manual entry and the Centralized scope. Do not select personal storage for these tests.

![Native-capable rc.2 with a saved custom directory](./native-saved-zh.jpg)

![Native failure recovery keeps the path editable](./native-error-recovery-zh.jpg)

![Browse-only 0.2.0 keeps the centralized workspace layout](./browse-020-central-zh.jpg)
