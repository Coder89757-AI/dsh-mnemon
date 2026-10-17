# dsh-mnemon on DSH 0.2.1-rc.2

[简体中文](./README.zh-CN.md)

DSH 0.2.1-rc.2 became npm `next` on 2026-10-17 at 08:36 UTC; DSH 0.2.0-rc.2 stays npm `latest`. This change moves development from 0.2.1-rc.1 to 0.2.1-rc.2. The supported range, `>=0.2.0-rc.2 <0.2.1-0 || >=0.2.1-rc.1 <0.3.0-0`, already admits rc.2 and stays as it is, so DSH 0.2.1-rc.1 keeps working. Nothing in dsh-mnemon's code changes.

Tested on 2026-10-17 (Asia/Shanghai): macOS 15.6 arm64, Node 24.19.0, pnpm 10.13.1 (the CI version), headless Chrome in zh-CN and light mode, DSH 0.2.1-rc.2 and 0.2.0-rc.2 each in an isolated npm prefix, Mnemon CLI 0.2.10.

## What DSH 0.2.1-rc.2 changes

Compared with 0.2.1-rc.1, two packages are new, six change code, one changes a document and two change only the build commit they record; every other package changes only its version.

| DSH 0.2.1-rc.2 | For dsh-mnemon |
|---|---|
| `dsh-client-ui-deepseek-model-label-1017` shows a temporary `1017` badge beside DeepSeek-V4.1-Flash in the composer's model selector; the slot catalog in `dsh-cordis-client-runner` lists it as that slot's occupant | dsh-mnemon does not use that slot |
| `dsh-web-deepseek-api` adds DeepSeek Search and Fetch API providers for web search; `dsh-web`, `dsh-web-search-deepseek` and the Web search settings card change with it | dsh-mnemon does not use web search |
| `dsh-base`, the core layer Headless shares, mounts `dsh-web-deepseek-api`, and `dsh-web-app` mounts the model label; `dsh-agent-preset`'s package reference lists both; `dsh-client-modules` and `dsh-client-ui-sidebar` change only the build commit they record | The Plugins page lists the Starter's components as on rc.1 |
| DSH's own sidebar, sessions, subagents, plugin manager and slots are unchanged apart from their version | No adaptation needed |

## What changes

- **Pins.** The 33 DSH development dependencies of the root package, the 4 of each of the Runtime, Documents and Memory Spaces Sources, and the 4 of the external consumer fixture move to 0.2.1-rc.2. Development dependencies are not part of a published release.
- **Lockfile.** Regenerated with pnpm 10.13.1. Only `@deepseek-ai` packages change, and the two new packages arrive as DSH's own dependencies. A plain re-resolution kept 24 DSH packages that pnpm installs to satisfy other packages' peers at 0.2.1-rc.1, with unmet-peer warnings; `tests/plugin.spec.ts` caught it, since it expects every locked DSH package at the baseline. Those entries were dropped and resolved again: every locked DSH package is now 0.2.1-rc.2, pnpm reports no peer warning, and `pnpm install --frozen-lockfile` passes.
- **Tests.** `tests/dsh-host-compatibility.spec.ts` checks 0.2.1-rc.2 as a supported runtime beside 0.2.1-rc.1.
- **Documentation.** The README, Install and start, the development guide and Compatibility and upgrades name 0.2.1-rc.2 as npm `next` and the development baseline; Compatibility notes that the range still admits 0.2.1-rc.1. A changeset releases the README with the next dsh-mnemon.

## Results

| Check | Result |
|---|---|
| `pnpm run verify` on the pinned 0.2.1-rc.2: build, typecheck, every root test, Headless, package contents | passed; root tests 2,041 passed, 6 skipped (140 files) |
| `pnpm run verify:plugins`: 17 plugin repositories, 18 packed artifacts, the packed Starter upgraded from 0.5.29 in a real DSH | passed |
| Every root test against an installed DSH 0.2.0-rc.2 (`pnpm run test:installed-dsh`) | 2,041 passed, 6 skipped (140 files) |
| Headless on an installed 0.2.1-rc.2, with the default composition and with the three optional Strategies | passed |
| Starter activation contracts on 0.2.1-rc.2: cold start, isolated, another bundle stopped since startup, and `--check-declared-rows` | passed; 18 packages, 9 components |
| Git sync end to end on 0.2.1-rc.2 | 64 checks passed |
| The 14 WebUI scenarios of the [0.2.1-rc.1 record](../dsh-021-rc1/README.md#results) on 0.2.1-rc.2 | 14 of 14 passed, no browser console errors |
| Plugins page | 9 components, “共 9 个 · 5 运行中 · 4 已停用”, as on 0.2.1-rc.1 |
| The published 0.5.31, installed by exact version through Add plugin on a fresh 0.2.1-rc.2 home | Status nominal with Mnemon CLI 0.2.10; a runtime memory written and read; a Native space recalled the same way from the CLI and the WebUI; Entities (Atlas 3, related 1); Check versions current; no browser console errors |

Only development pins move, so the 0.2.0-rc.2 checks of the [0.2.1-rc.1 record](../dsh-021-rc1/README.md#results) beyond the root tests still describe this code.

On the day rc.2 was published, a plain **Add plugin** installed dsh-mnemon 0.5.29: pnpm skips a release for its first 24 hours, and 0.5.30 and 0.5.31 were both published that day. 0.5.29 runs on DSH 0.2.1, but its memory subagents and **Check versions → Update** do not. Installing `dsh-mnemon@0.5.31` by exact version, as [Install and start](../../en/guides/installation.md) describes, avoids it; from a day after the release, a plain install picks 0.5.31.

| Plugins page, DSH 0.2.1-rc.2, during the component scenario | Status, the published 0.5.31 on DSH 0.2.1-rc.2 |
|---|---|
| ![The dsh-mnemon page on DSH 0.2.1-rc.2: the Layered strategy, three memory sources running, and the enhancements with Light context switched on by the component scenario](./components-021-rc2.jpg) | ![The Memory System's Status page: dsh-mnemon 0.5.31 running normally, Mnemon Native ready with Mnemon 0.2.10](./status-0531-rc2.jpg) |

## Limits

- pnpm 11 does not pick a version published less than 24 hours ago, which covers every DSH 0.2.1-rc.2 package until 2026-10-18 08:36 UTC: before then, `pnpm install --frozen-lockfile` with pnpm 11 refuses this lockfile. Install this repository with pnpm 10, as CI does, until then.
- The runs used DSH's web profile. DSH Desktop 0.2.1-rc.2 was not tried.
- The scenarios that need an embedding service (vector recall and Save to memory with embeddings, embedding coverage) were not rerun; nothing in them depends on the DSH release.
