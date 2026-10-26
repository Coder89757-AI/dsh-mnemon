# v0.5.31 release acceptance

[中文](README.zh-CN.md) | [Validation record](validation.json)

Verified on 2026-10-17 (Asia/Shanghai). The packages under test are the two that 0.5.31 changes, as `pnpm release:version` builds them from `main` `af602afc`, which includes #394, #354, #386 and #410 to #412: `dsh-mnemon@0.5.31` and `dsh-mnemon-source-memory-spaces@0.5.21`. The other 16 component packages come from npm at the Starter's pinned versions, which 0.5.31 does not change.

Each host is unmodified npm DSH, run with Node `24.19.0` and a fresh home, DSH home and pnpm store: `0.2.1-rc.1` (npm `next`) and `0.2.0-rc.2` (npm `latest`), the two releases this version supports. A loopback registry answered with npm's real metadata plus the two new versions. Every step passed on both hosts.

## A fresh installation from the official WebUI

1. Started the host without Mnemon installed and opened **Plugins → Add plugin**. On DSH 0.2.1-rc.1 a new user without a model first sees a dialog that offers to sign in or add an API key; closing it leaves the rest of the WebUI as usual.
2. Installed `dsh-mnemon`. DSH chose the install source itself; its speed check picked the mainland China mirror. The profile then held the two new versions, with every other component at its pinned npm version.
3. Clicked **Enable now**; the Memory System appeared without a host restart. Status reports **dsh-mnemon 0.5.31 / System nominal**, and Mnemon Native names **Mnemon 0.2.10**: [0.2.0-rc.2](status.jpg), [0.2.1-rc.1](status-rc1.jpg).
4. Added a Runtime memory entry and read it back after reloading the page: [Runtime](runtime.jpg).
5. Created a Mnemon Native space in the WebUI and activated it on its card: [Memory Spaces](spaces.jpg). Wrote a fact with Mnemon CLI `0.2.10`, recalled it with the CLI, then found the same fact with the WebUI's **Direct search**: [Recall](recall.jpg).
6. Wrote three more memories with the CLI that carry the entity `Atlas`, and one that only mentions Atlas. On **Entities**, `Atlas` counts 3 and lists exactly those three; **Find related memories** found the one that only mentions it: [Entities](entities.jpg), [Related memories](entities-related.jpg).
7. Opened **Check versions**. dsh-mnemon lists 0.5.31 as installed. Before publication npm's latest is still 0.5.30, so the dialog marks 0.5.31 as a local version and offers no update.

## An update from v0.5.30

1. Installed `dsh-mnemon@0.5.30` from npm before starting the WebUI. Status reported **dsh-mnemon 0.5.30 / System nominal**, and Check versions called it up to date.
2. Updated from the command line: `dsh plugin --profile web add dsh-mnemon@0.5.31`. On DSH 0.2.1-rc.1 this is the documented path, because **Check versions → Update** in 0.5.30 stops there with `already-installed`. On DSH 0.2.0-rc.2 Check versions cannot offer the candidates before publication, because it asks npm for the latest version.
3. Restarted DSH. Status reports **dsh-mnemon 0.5.31 / System nominal**, with Runtime memory, Project Documents and Memory Spaces in place: [Status after the update](update-status.jpg). The profile holds the two new versions and the other 16 pinned ones, as after a fresh installation. Neither start logged an activation warning.

![Status after the update from v0.5.30 on DSH 0.2.0-rc.2: dsh-mnemon 0.5.31, System nominal](update-status.jpg)

Neither host logged a console error. [validation.json](validation.json) has the package digests and the results. Profiles and memories are synthetic.

## Git sync on both hosts

This release changes Git sync's payload checks (#394) and the subagent that reconciles a sync on DSH 0.2.1 (#386), so `pnpm run e2e:sync` ran from the built release branch against each installed DSH: two real Web hosts, a temporary bare repository and the same envelopes the browser sends. It passed **64 of 64** checks on DSH 0.2.0-rc.2 and **64 of 64** on DSH 0.2.1-rc.1.

## The changes in this release

- [dsh-mnemon on DSH 0.2.1-rc.1 and 0.2.0-rc.2](../dsh-021-rc1/README.md) (#386), building on [the DSH 0.2.1-alpha.3 work](../dsh-021-alpha3/README.md) in the same pull request
- [Task Agents that can follow their conversation](../background-tasks-card/README.md) (#354)
- [One name for idle review and its task Agent](../idle-review-wording/README.md) (#410)
- [Removing code nothing uses](../remove-dead-code/README.md) (#411) and [documentation navigation](../docs-navigation/README.md) (#412)
- #394 carries its tests in the pull request: a Documents payload whose index disagrees with its bodies is refused wherever it is published or imported.

## Validation and release boundary

The six pull requests were merged in order. The merged `main` `af602afc` passed the full verification locally: `pnpm run verify` (2,035 root tests, every plugin suite, the deterministic build, Headless and package checks), `pnpm run verify:plugins`, and the same root tests against an installed DSH 0.2.0-rc.2 (`pnpm run test:installed-dsh`). Its CI passed, as it did on `c00e6d7a` (#394) and `7b7efa49` (#354); the runs for the merges in between were cancelled by the next push. The final head of each pull request except #394 passed CI before its merge; #394's branch, from a contributor's fork, ran only the contribution check, and main's CI ran on its merge.

`pnpm run release:check` confirms the Starter 0.5.31 on the `latest` tag with its one new pin, and `pnpm run release:intent` matches the consumed changesets to the two packages. No peer floor moves: Memory Spaces keeps `dsh-mnemon ^0.5.19`, since it uses no new export. The version bump changes two specifier lines in the lockfile, and pnpm 10.13.1, the CI version, accepts it with `--frozen-lockfile`. pnpm 11 does not install the DSH 0.2.1-rc.1 development dependencies until they are a day old, so the repository's builds and tests ran with pnpm 10.13.1, as CI does; inside the DSH hosts, DSH's plugin installs used pnpm 11.25. With the versions stamped, `pnpm run verify` passes again (2,035 root tests; 2,036 with the test this pull request adds), as do `pnpm run verify:plugins` without a Mnemon CLI (17 plugin repositories, 18 packed artifacts) and the root tests against the installed DSH 0.2.0-rc.2. The package measures 59 files and 1,993,128 unpacked bytes, under the 2,500,000-byte ceiling.

The publication workflow's last check before the GitHub release upgrades a Headless profile from an earlier release on the registry. It started from 0.5.16, which declares DSH 0.1 only, so the pinned DSH 0.2.1-rc.1 refuses to install it and the check would have failed after npm had the new versions. This pull request starts it from 0.5.29, the release `verify:plugins` already upgrades from, and a test keeps the two the same. Run locally the way the workflow runs it, with 0.5.31 served from the accepted candidates, the old check stops where DSH refuses 0.5.16 as incompatible with 0.2.1-rc.1, and the new one upgrades 0.5.29 to 0.5.31 without changing the Runtime Memory bytes.

The release pull request and the publication workflow run the complete workspace and packed-plugin verification. Publication then checks the complete pinned composition, a registry installation and a real upgrade before it creates the GitHub release.
