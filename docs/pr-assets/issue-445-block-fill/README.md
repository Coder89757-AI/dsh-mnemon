# Informational block skin hook — issue 445

[简体中文](./README.zh-CN.md)

Checked against this branch on published DSH 0.2.1-rc.2, using the real WebUI and disposable synthetic state. A local test skin sets the documented root selector to `--mn-surface: transparent; --mn-block-fill: transparent`. Its two fixture buttons enable or remove that scoped rule; it does not target hashed classes. No live model was used. The paths visible in the screenshots belong only to the disposable fixture.

| Default light theme | Scoped transparent blocks |
| --- | --- |
| ![Default](./light-default.png) | ![Transparent](./light-glass.png) |

![Dark theme with transparent blocks](./glass.png)

![Memory Spaces empty directory](./empty-glass.png)

The computed styles in [default.json](./default.json), [glass.json](./glass.json), [light-glass.json](./light-glass.json) and [empty.json](./empty.json) confirm that informational blocks become transparent while the storage badge retains its original fill in both themes. Turning the skin off restores default fills. Memory Spaces' separately bundled empty-directory page inherits the hook.

`pnpm run verify` covers the scoped-root tests, updated reviewed CSS fingerprint, types, builds, Source packages and real Headless activation. The fingerprint changes only for the reviewed background variable and its six informational-block consumers; class names and rule counts remain unchanged. Runtime read-only notices use the same inherited fallback; no read/write permission logic changes. This evidence does not claim a Windows desktop or third-party wallpaper-plugin run.
