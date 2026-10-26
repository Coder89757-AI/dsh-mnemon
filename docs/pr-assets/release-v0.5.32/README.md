# v0.5.32 release acceptance

[中文](README.zh-CN.md) | [Validation record](validation.json)

Verified on 2026-10-18 (Asia/Shanghai). The packages under test are the six that 0.5.32 changes, as `pnpm release:version` builds them from `main` `244d8985`, which includes #414 to #430: `dsh-mnemon@0.5.32`, `dsh-mnemon-source-runtime@0.5.15`, `dsh-mnemon-source-documents@0.5.11`, `dsh-mnemon-source-memory-spaces@0.5.22`, `dsh-mnemon-strategy-default-three-tier@0.5.10` and `dsh-mnemon-strategy-light-context@0.5.6`. The other 12 component packages come from npm at the Starter's pinned versions, which 0.5.32 does not change.

Each host is unmodified npm DSH, run with Node `24.19.0` and a fresh home, DSH home and pnpm store: `0.2.1-rc.2` (npm `next`) and `0.2.0-rc.2` (npm `latest`). A loopback registry answered with npm's real metadata plus the six new versions. dsh-mnemon's version check asks npm with its own request rather than through pnpm, so the harness sent that request to the same registry, and **Check versions** offered the candidates the way it will once npm has them. Every step passed on each host it ran on; the update from v0.5.30 ran on DSH 0.2.1-rc.2, the only host where the release notes give that path.

## A fresh installation from the official WebUI

1. Started the host without Mnemon installed and opened **Plugins → Add plugin**. On DSH 0.2.1-rc.2 a new user without a model first sees a dialog that offers to sign in or add an API key; closing it leaves the rest of the WebUI as usual.
2. Installed `dsh-mnemon`. DSH chose the install source itself; its speed check picked the mainland China mirror. The profile then held the six new versions, with every other component at its pinned npm version.
3. Clicked **Enable now**; the Memory System appeared without a host restart. Status reports **dsh-mnemon 0.5.32 / System nominal**, and Mnemon Native names **Mnemon 0.2.10**: [0.2.1-rc.2](status.jpg), [0.2.0-rc.2](status-020.jpg).
4. Added a Runtime memory entry and read it back after reloading the page: [Runtime](runtime.jpg).
5. Created a Mnemon Native space in the WebUI and activated it on its card: [Memory Spaces](spaces.jpg). Wrote a fact with Mnemon CLI `0.2.10`, recalled it with the CLI, then found the same fact with the WebUI's **Direct search**: [Recall](recall.jpg).
6. Wrote three more memories with the CLI that carry the entity `Atlas`, and one that only mentions Atlas. On **Entities**, `Atlas` counts 3 and lists exactly those three; **Find related memories** found the one that only mentions it: [Entities](entities.jpg), [Related memories](entities-related.jpg).
7. Opened **Check versions**. dsh-mnemon lists 0.5.32 as installed and current.

## An update from v0.5.31 through Check versions

1. Installed `dsh-mnemon@0.5.31` from npm before starting the WebUI. Status reported **dsh-mnemon 0.5.31 / System nominal**, and **Check versions** offered 0.5.32.
2. Clicked **Update** on dsh-mnemon. On both hosts the dialog reported **dsh-mnemon updated** and asked for a DSH restart: [Check versions after the update](update-versions.jpg). On DSH 0.2.1 this is the update 0.5.31 made work there; 0.5.30 and earlier stop with `already-installed`.
3. Restarted DSH. Status reports **dsh-mnemon 0.5.32 / System nominal**, the same page a fresh installation shows (the two screenshots are identical), and Check versions calls 0.5.32 current: [Status after the update](update-status.jpg). The profile holds all 17 components at the Starter's pins, the five new versions included, as after a fresh installation. Neither start logged an activation warning.

![Check versions after the update from v0.5.31 on DSH 0.2.1-rc.2: dsh-mnemon updated, 0.5.32, restart needed](update-versions.jpg)

## An update from v0.5.30 on DSH 0.2.1-rc.2

The release notes give older installations on DSH 0.2.1 one exact install instead, and this pass followed them:

1. Installed `dsh-mnemon@0.5.30` from npm before starting the WebUI. **Check versions** offered 0.5.32, and its **Update** stopped with `DSH could not install dsh-mnemon@0.5.32: already-installed`, as the notes say.
2. Ran `dsh plugin --profile web add dsh-mnemon@0.5.32`, then restarted DSH. Status reports **dsh-mnemon 0.5.32 / System nominal**, the profile holds the same 17 pinned components as a fresh installation, and neither start logged an activation warning.

Neither host logged a console error. [validation.json](validation.json) has the package digests and the results. Profiles and memories are synthetic.

## Git sync on both hosts

This release takes the files Git sync and backups copy from each Source's own contracts (#416) and gives the sync checks one owner (#426), so `pnpm run e2e:sync` ran from the built release branch against each installed DSH: two real Web hosts, a temporary bare repository and the same envelopes the browser sends. It passed **64 of 64** checks on DSH 0.2.0-rc.2 and **64 of 64** on DSH 0.2.1-rc.2.

## The changes in this release

- [A neutral note for a save without a vector](../neutral-vector-note/README.md) (#427), the one change users see
- [Memory Spaces owns its settings and its copy](../spaces-owns-settings/README.md) (#421)
- [dsh-mnemon on DSH 0.2.1-rc.2](../dsh-021-rc2/README.md) (#420)
- [Strategies declare the background work they drive](../strategy-workflows/README.md) (#414), [Sources own their storage formats](../source-owned-formats/README.md) (#416), [one owner for shared values, wire types and sync checks](../contracts-one-owner/README.md) (#426)
- [Host module splits](../host-module-splits/README.md) (#428), [client module splits](../client-module-splits/README.md) (#425), [one table of memory tools](../memory-tool-table/README.md) (#418), [small cleanups](../small-cleanups/README.md) (#423), [test tooling out of pull request records](../test-tooling-from-records/README.md) (#419)
- Documentation: [the restructure](../docs-restructure/README.md) (#415), [the v0.5.32 WebUI gallery](../webui-gallery-v0532/README.md) (#424) and [its capture with an embedding service](../webui-gallery-embedding/README.md) (#429), and the roadmap and design plan: [the review's gaps](../roadmap-review-gaps/README.md) (#417), [two terms and two more items](../extensions-terms-roadmap/README.md) (#422) and [five more gaps](../plan-more-gaps/README.md) (#430)

## Validation and release boundary

The 17 pull requests were merged in order, and CI passed on every merge, the last on `main` `244d8985` (#430).

`pnpm run release:check` confirms the Starter 0.5.32 on the `latest` tag with its five new pins, and `pnpm run release:intent` matches the 12 consumed changesets to the six packages. No peer floor moves. #421's record proposed raising Memory Spaces' to this release, but Memory Spaces draws its settings with the client components #421 added only after detecting them, and beside an older Starter leaves them to that Starter, so it keeps `dsh-mnemon ^0.5.19`, as #427's record also concludes for the receipt; no other plugin uses a new export. The version bump changes only specifier lines in the lockfile, and pnpm 10.13.1, the CI version, accepts it with `--frozen-lockfile`. pnpm 11 does not install the DSH 0.2.1-rc.2 development dependencies until they are a day old, so the repository's builds and tests ran with pnpm 10.13.1, as CI does; inside the DSH hosts, DSH's plugin installs used pnpm 11.25. With the versions stamped, `pnpm run verify` passes (2,122 root tests, every plugin suite, the deterministic build, Headless and package checks), as do `pnpm run verify:plugins` without a Mnemon CLI (17 plugin repositories, 18 packed artifacts) and the root tests against the installed DSH 0.2.0-rc.2. The package measures 66 files and 2,035,598 unpacked bytes, under the 2,500,000-byte ceiling.

The publication workflow's last check before the GitHub release upgrades a Headless profile from 0.5.29 on the registry. Run locally the way the workflow runs it, on the pinned DSH 0.2.1-rc.2 with 0.5.32 served from the accepted candidates, it upgrades 0.5.29 to 0.5.32 without changing the Runtime Memory bytes, and checks the legacy settings import, the disable gate and the three optional Strategies.

The release pull request and the publication workflow run the complete workspace and packed-plugin verification. Publication then checks the complete pinned composition, a registry installation and a real upgrade before it creates the GitHub release.
