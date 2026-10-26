# v0.5.36 release acceptance

[中文](README.zh-CN.md) | [Validation record](validation.json)

Verified on **2026-10-26 (Asia/Shanghai)** from main `0538fb0fdb81ef6d748c02b9bd9bee9d227a4afa` plus the release version and metadata changes, using Node 22.22.0, pnpm 10.13.1, macOS arm64 and the real DSH WebUI. All homes, workspaces and memories were disposable fixtures. No model credentials or private user data were used, and the user's Desktop profile was not changed.

The three candidate packages are Starter **0.5.36**, Skills **0.5.3** and OpenViking **0.5.10**. The other sixteen components install at their unchanged pinned npm versions. The [structured record](validation.json) includes SHA-256, SHA-512 integrity, the full nineteen-package composition and every result. All six installations matched all nineteen versions and all **104 files** from the three candidate tarballs byte for byte. Starter size is **2,171,049 unpacked bytes**, 86.8% of the unchanged 2,500,000-byte ceiling.

## Fresh installation and update

The existing [acceptance server](../../../scripts/serve-release-acceptance.mjs) runs unmodified published DSH with isolated homes. A loopback registry overlays only the three candidates on real npm metadata. The test-only version-check preload and old fixture publication dates let the existing UI discover unpublished candidates; production release-age behavior is unchanged.

For DSH **0.2.0-rc.2**, **0.2.1-rc.2** and **0.2.1-rc.3**:

1. Used **Plugins → Add plugin** with `dsh-mnemon@0.5.36`, confirmed the exact installed version, clicked **Enable now**, then opened Memory System. Status reported **dsh-mnemon 0.5.36 / System nominal**, with all five tabs.
2. In a second isolated profile, installed actual npm **0.5.35** and opened **Check versions**. It offered **0.5.36** and two component updates. Clicked **Update** and read back **dsh-mnemon updated / restart required**.
3. Restarted the host and reconnected. Status reported the running **0.5.36 / System nominal**, with the expected installed composition and exact candidate bytes.

| Host | Fresh install | Fresh status | Update offered | Update completed | Status after restart |
| --- | --- | --- | --- | --- | --- |
| 0.2.0-rc.2 | [Install](fresh020-install.png) | [Status](fresh020-status.png) | [Offered](upgrade020-offered.png) | [Updated](upgrade020-updated.png) | [Running](upgrade020-status.png) |
| 0.2.1-rc.2 | [Install](fresh021-install.png) | [Status](fresh021-status.png) | [Offered](upgrade021-offered.png) | [Updated](upgrade021-updated.png) | [Running](upgrade021-status.png) |
| 0.2.1-rc.3 | [Install](freshrc3-install.png) | [Status](freshrc3-status.png) | [Offered](upgraderc3-offered.png) | [Updated](upgraderc3-updated.png) | [Running](upgraderc3-status.png) |

Before the rc.3 upgrade, added one synthetic project fact through Runtime's **Add memory** dialog. After updating and restarting, [the memory remains visible](upgraderc3-memory-preserved.png); all three Runtime file hashes remain unchanged. This is a bounded retention check, not a claim about every possible historical database.

Reproduction: build and pack the three selected candidates, then run `node scripts/serve-release-acceptance.mjs --dsh <official-dsh>/lib/bin.js --artifacts <candidate-directory> --state <empty-disposable-directory> --port <port>`. Add `--previous dsh-mnemon@0.5.35` for an upgrade profile. Read the connection URL from its private metadata and send SIGUSR2 to the fixture process after Update to restart DSH.

## Verification and limits

- `pnpm run verify`: passed documentation, types, deterministic builds, **2,236 root tests** (7 conditional skips), **696 plugin tests** (3 conditional skips), Headless activation and package checks.
- Installed DSH **0.2.0-rc.2**: **2,233 passed / 10 conditional or host-specific skips**. Installed **0.2.1-rc.3**: **2,236 passed / 7 conditional skips**.
- `pnpm run verify:plugins --skip-build`: passed **18 independent repositories / 19 artifacts**, external SDK consumer, optional Strategy composition and a real packed upgrade from **0.5.29**.
- The published rc.3 API-key adapter with a simulated **3,600 ms** HTTP response populates the model directory on its first call in **3,607 ms**, with zero real network requests. This rechecks the combined release's timeout fix.
- `pnpm run release:check`: stable `latest`, three selected version advances and no pending changesets. No new SDK export is required by the changed components, so their existing runtime peer floors remain valid.
- The [directory-picker record](../storage-directory-picker/README.md) documents actual WebUI gating, manual input, failure recovery, saved settings and data-preservation checks. **Actual native OS-dialog selection/cancel was not manually completed**, including Windows/Linux dialogs. Automated tests cover success/cancel return values and stale asynchronous results. This limitation is retained in the release notes.

The [suggestion-control record](../issue-496-suggestion-switches/README.md) and [model-directory record](../rc3-model-directory/README.md) document feature-specific checks. Publication separately freezes main, verifies npm bytes, performs a clean Registry installation and upgrade, and creates the GitHub Release last.

## Release verification scheduling

The first publication workflow stopped before any npm write because the unchanged Memory Spaces client integration test exceeded its existing five-second timeout. The PR CI had shown the same failure and passed on an unchanged rerun. To remove nested CPU oversubscription, standalone verification now runs one Vitest worker per package inside the existing four-package pool. The complete local 18-repository / 19-artifact suite and 20 release tests passed with that bound; no assertions or timeouts were relaxed, and this script-only change does not alter the accepted packages. [Stopped publication](https://github.com/omdsh-dev/dsh-mnemon/actions/runs/40342572010).
