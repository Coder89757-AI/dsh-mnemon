# v0.5.30 release acceptance

[中文](README.zh-CN.md) | [Validation record](validation.json)

Verified on 2026-10-17 (Asia/Shanghai). The packages under test are the three that 0.5.30 changes, as `pnpm release:version` builds them from `main` `3358c270`, which includes #398 to #407: `dsh-mnemon@0.5.30`, `dsh-mnemon-source-memory-spaces@0.5.20` and `dsh-mnemon-strategy-default-three-tier@0.5.9`. The other 15 component packages come from npm at the Starter's pinned versions, which 0.5.30 does not change.

Each host is unmodified npm DSH, run with Node `24.19.0` and a fresh home, DSH home and pnpm store: `0.2.0-rc.2` (npm `latest` and `next`) and `0.2.1-alpha.2`. A loopback registry answered with npm's real metadata plus the three new versions. Every step passed on both hosts.

## A fresh installation from the official WebUI

1. Started the host without Mnemon installed and opened **Plugins → Add plugin**.
2. Installed `dsh-mnemon`. DSH chose the install source itself; its speed check picked the mainland China mirror. The profile then held the three new versions, with every other component at its pinned npm version.
3. Clicked **Enable now**; the Memory System appeared without a host restart. Status reports **dsh-mnemon 0.5.30 / System nominal**, and Mnemon Native names **Mnemon 0.2.10**: [0.2.0-rc.2](status.jpg), [0.2.1-alpha.2](status-alpha.jpg).
4. Added a Runtime memory entry and read it back after reloading the page: [Runtime](runtime.jpg).
5. Created a Mnemon Native space in the WebUI and activated it on its card: [Memory Spaces](spaces.jpg). Wrote a fact with Mnemon CLI `0.2.10`, recalled it with the CLI, then found the same fact with the WebUI's **Direct search**: [Recall](recall.jpg).
6. Wrote three more memories with the CLI that carry the entity `Atlas`, and one that only mentions Atlas. On **Entities**, `Atlas` counts 3 and lists exactly those three; **Find related memories** found the one that only mentions it: [Entities](entities.jpg), [Related memories](entities-related.jpg).
7. Opened **Check versions**. dsh-mnemon lists 0.5.30 as installed. Before publication npm's latest is still 0.5.29, so the dialog marks 0.5.30 as a local version and offers no update.

## An update from v0.5.29

1. Installed `dsh-mnemon@0.5.29` from npm before starting the WebUI. Status reported **dsh-mnemon 0.5.29 / System nominal**, and Check versions called it up to date.
2. Updated from the command line, as the release notes say for a host without pnpm on its PATH: `dsh plugin --profile web add dsh-mnemon@0.5.30`. Check versions cannot offer the candidates before publication, because it asks npm for the latest version.
3. Restarted DSH. Status reports **dsh-mnemon 0.5.30 / System nominal**, with Runtime memory, Project Documents and Memory Spaces in place: [Status after the update](update-status.jpg). The profile holds the three new versions and the other 15 pinned ones, as after a fresh installation. Neither start logged an activation warning.

![Status after the update from v0.5.29 on DSH 0.2.0-rc.2: dsh-mnemon 0.5.30, System nominal](update-status.jpg)

Neither host logged a console error. [validation.json](validation.json) has the package digests and the results. Profiles and memories are synthetic.

## Git sync on both hosts

Three changes in this release touch Git sync, so `pnpm run e2e:sync` ran from the built release branch against each installed DSH: two real Web hosts, a temporary bare repository and the same envelopes the browser sends. It passed **64 of 64** checks on DSH 0.2.0-rc.2 and **64 of 64** on DSH 0.2.1-alpha.2.

## The changes in this release

Each change has its own before-and-after record:
- [Writes into the named Memory Space](../issue-387-explicit-space-target/README.md) (#405) and [a memory saved without a vector](../issue-388-unembedded-receipt/README.md) (#406)
- [Vector coverage for every Memory Space](../issue-392-embedding-coverage/README.md) (#399)
- [Memory Space copies after a merge](../issue-391-space-merge-edges/README.md) (#398), [untracked files in the sync mirror](../issue-396-sync-mirror-clean/README.md) (#401) and [the first sync after updating from 0.5.28](../issue-385-document-agreement-upgrade/README.md) (#404)
- [Recall past the turn budget](../issue-389-recall-budget/README.md) (#402) and [tool answers](../issue-390-tool-consistency/README.md) (#407)
- [A second runtime Source](../issue-397-default-runtime-instance/README.md) (#400) and [the first line of a delegated task](../issue-393-delegated-prompt-marker/README.md) (#403)

## Validation and release boundary

The ten pull requests were merged one by one after the same combination had passed the full verification locally (`pnpm run verify`: 2,000 root tests, every plugin suite, the deterministic build, Headless and package checks). The merged `main` has exactly the tree that passed, and its CI passed on `3358c270`. Each pull request's CI passed before its merge; one Windows job on #402 failed once on an unrelated temporary-file cleanup and passed when run again.

`pnpm run release:check` confirms the Starter 0.5.30 on the `latest` tag with its two new pins, and `pnpm run release:intent` matches the consumed changesets to the three packages. No peer floor moves: Memory Spaces keeps `dsh-mnemon ^0.5.19` and the Layered strategy `dsh-mnemon ^0.5.17`, since neither uses a new export. The version bump changes four specifier lines in the lockfile, and pnpm 10.13.1, the CI version, accepts it with `--frozen-lockfile`. With the versions stamped, `pnpm run verify` passes again (2,000 root tests) and the package measures 59 files and 1,972,633 unpacked bytes, under the 2,500,000-byte ceiling.

The release pull request and the publication workflow run the complete workspace and packed-plugin verification. Publication then checks the complete pinned composition, a registry installation and a real upgrade before it creates the GitHub release.
