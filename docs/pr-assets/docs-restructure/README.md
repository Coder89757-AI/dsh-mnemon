# Documentation restructure

[简体中文](./README.zh-CN.md)

Prepared on 2026-10-17 (Asia/Shanghai) on `main` `3b33e07e`, the v0.5.31 release. The change is documentation, plus one header comment in each of 13 scripts; no code, setting, format or model-visible text changes. It also carries one addition the maintainer asked for: the backup and Git sync sections say which Sources they cover.

## Why

A documentation audit, written before #386, #410 and #412, found three kinds of problems:

- **A loop.** Getting started opened with command-line installation, development checkouts, cloud access and Headless; Install and start sent command-line readers back there; and the two pages repeated each other's commands.
- **Repeats.** Git sync, the Task Agent model, storage scopes, install and upgrade commands, the pnpm 24-hour rule and Check versions were each described in three to eight places, which then drifted apart.
- **Mixed audiences.** Operations put Host internals beside user steps; the compatibility page put its upgrade steps after the host notes and evidence; the development guide catalogued its test fixtures as one paragraph per option, and seven options appeared only in records.

Each audit item was checked against the current tree first. #386 had already made the compatibility page the one home of the supported DSH releases, #410 had aligned the idle review names, and #412 had completed the indexes and fixed the README and SECURITY links; those items are not repeated here.

## What moved where

| From | To | Left behind |
|---|---|---|
| Getting started §1: requirements, DSH install, Web profile, development checkout, Headless, update and uninstall, cloud access | Install and start, [§7 Command line and Headless](../../en/guides/installation.md#7-command-line-and-headless), with *Headless*, *Update and uninstall* and *Cloud access* subsections | One sentence at the top of Getting started; its steps are renumbered 1 to 5 |
| Getting started §1, *How task Agents are started* | [Provider requirements](../../en/reference/configuration.md#provider-requirements), which gains the one fact it lacked, the stable `mnemon_subagent_result` tool and its per-child `requestId` | A link in the §7 requirements |
| Compatibility, *Host behavior on a first install* | Install and start, step 3 (registry choice, the English card description) and Common problems (the 24-hour rule) | A pointer in the page's introduction |
| Compatibility, *Upgrade the default installation* and *Upgrade order* | The top of the page, right after the supported releases | — |
| Compatibility, the evidence paragraphs and *Other records* | A closing [Verification and evidence](../../en/reference/compatibility.md#verification-and-evidence) section | — |
| Operations, *Process*, *Files* and *Web and model* | [Architecture, Security boundaries](../../en/development/architecture.md#security-boundaries) | A short summary, the secret-scanner warning and *Security reporting* |
| Operations, *Document archive recovery* and *Runtime archive recovery* | [Workflows](../../en/reference/workflows.md), under the archiving workflow each belongs to | *When an archive fails*, with links |
| Operations, *Disable the complete Starter* (under Cloud-hosted WebUI) | Its own section, before Cloud-hosted WebUI | — |
| Operations, *Legacy Session recovery* (second section) | After Troubleshooting | — |
| Operations, the reconciliation paragraph, and the UI guide's three reconciliation bullets | A new [Memory reconciliation](../../en/guides/operations.md#memory-reconciliation) subsection, as a list | One bullet in the UI guide |
| Development guide, one paragraph per `serve-e2e` option | A [fixture option table](../../en/development/README.md#fixture-options): option, what it sets up and the message to send, issue, record | The complete steps and the before and after results, in each record |

The seven options that only records described are in the table now: `--better-sidebar`, `--document-protection`, `--result-tool-cache`, `--review-failure`, `--review-layers`, `--runtime-archive` and `--runtime-routing`. Each was checked against `scripts/serve-e2e.mjs` and its fixture. The table's introduction says that one scripted model runs at a time, the first in `serve-e2e.mjs` winning if several are given and `--live-model` turning them off, and which options start loopback stand-ins for a backend. [scripts/README.md](../../../scripts/README.md) is new, in English like the other tooling READMEs: every script and fixture with its purpose, how it runs, its options and its environment variables. The development guide links it, [Provider Lab](../../../provider-lab/README.md) and [the upgrade fixture](../../../tests/fixtures/upgrade/README.md), and both documentation hubs gain a row that links CONTRIBUTING, scripts/README.md and the design plans.

## Single homes

| Topic | Home | Elsewhere, now a summary and a link |
|---|---|---|
| Install, update and uninstall commands | [Install and start §7](../../en/guides/installation.md#7-command-line-and-headless) | Compatibility (upgrade steps), Getting started |
| pnpm's 24-hour rule | [Install and start, Common problems](../../en/guides/installation.md#common-problems) | §7 *Update and uninstall*, compatibility |
| Check versions → Update | [Operations, Version checks and updates](../../en/guides/operations.md#version-checks-and-updates) | Install and start §6 and §7, the UI guide, compatibility (its DSH 0.2.1 path) |
| Moving to another DSH release | [Compatibility, Upgrade order](../../en/reference/compatibility.md#upgrade-order) for the steps, [Older DSH releases](../../en/reference/compatibility.md#older-dsh-releases) for the release each older host keeps | Install and start, *Upgrading DSH* |
| Git sync | [Operations](../../en/guides/operations.md#git-repository-sync) for using it; the [sync channel](../../en/reference/interfaces.md#sync-channel) for the credential order, the fields and the network fallback | The README (two sentences), the UI guide (the card's parts) |
| Task Agent model | [Configuration](../../en/reference/configuration.md#background-task-agent-model-route); the options table keeps one line, and the complete example shows `followConversation` | The UI guide, the capability map |
| Storage scopes | [Configuration](../../en/reference/configuration.md#storage-scopes) | The storage model, the capability map, Getting started, the UI guide |
| Subagent provider requirements | [Configuration](../../en/reference/configuration.md#provider-requirements) | Install and start §7 |

## Backup and Git sync coverage

The ZIP backup and Git sync deliberately carry only the Sources dsh-mnemon ships: runtime memory, Project Documents and Memory Spaces. The [backup](../../en/guides/operations.md#recommended-zip-from-the-plugin-page) and [Git sync](../../en/guides/operations.md#git-repository-sync) sections now say so in both languages: a Source installed from another plugin package is neither backed up nor synced and keeps its own data.

## Terms and consistency

- "Hot memory" (热记忆) becomes runtime memory (运行时记忆) wherever it meant the Runtime Source: configuration, interfaces, the storage model, workflows, operations and the Chinese part of SECURITY.md; the README's "local hot storage" becomes "local storage". Model-visible tool descriptions and UI copy keep their words; they are not documentation.
- The Layered strategy's package README names it the Layered strategy (分层策略) and its type id, `default-three-tier`, and the Light context README says runtime memory where it said hot context.
- Where the backup and Git sync sections mean installed Sources, they use the interface's name for them, memory sources (记忆来源).
- Every page links the hub as **Documentation** / **文档中心** and puts the language switch in one order, 简体中文 first, as the Chinese pages and CONTRIBUTING already did. The plugin guide is the exception: another branch adds a note for Source authors to `extensions.md`, so this change leaves it alone, with its old hub name and one "hot context" (热记忆 in Chinese).
- The Chinese Getting started is titled 入门指南, so it no longer shares 快速开始 with the README's own section.
- The README names all four storage scopes: global, per workspace, centralized and a directory you choose.
- The Chinese development guide calls idle review 空闲审查, and both languages count the activation test's 18 packages the same way.
- `docs/README.md` gives one start path: Install and start, then Getting started.
- The Node.js range in the compatibility table escapes its pipes, so GitHub no longer cuts that cell short at `^22.19.0`.
- CONTRIBUTING's documentation checklist names installation and compatibility. `.changeset/README.md` is a pointer to the release guide, which gains the empty-changeset rule and a *Release pull request* section on `.github/release-notes/vX.Y.Z.md`, the two `docs/*/releases/vX.Y.Z.md` notes, the release-day example in Install and start, and the `docs/pr-assets/release-vX.Y.Z` record.
- The evidence index asks for reusable tooling in `scripts/` or `tests/`, where records link it. No current instruction pointed at a record's `installed-dsh*.vitest.config.mjs` or `adapt-host-specs.mjs` any more; `pnpm run test:installed-dsh` is the tool.

## Anchors kept

Links from release notes, records, GitHub and older pages keep working. Every anchor the changed pages had at `3b33e07e` still exists, which a script checked by comparing the anchors of each changed page before and after. New `<a id>` stubs:

| Page | Stubs |
|---|---|
| Getting started | `1-install-and-upgrade-from-the-command-line`, `2-open-the-memory-system`, `3-store-your-first-memories`, `4-use-memory-in-a-conversation`, `5-choose-how-memory-is-composed`, `6-next-steps`; Chinese: `快速开始`, `1-命令行安装与升级`, `2-打开记忆系统`, `3-保存第一批记忆`, `4-在对话中使用记忆`, `5-选择记忆的组合方式`, `6-下一步` |
| Operations | `process`, `files`, `web-and-model`, `document-archive-recovery`, `runtime-archive-recovery`; Chinese: `进程`, `文件`, `web-与模型`, `文档归档恢复`, `运行时归档恢复` |
| Compatibility | `host-behavior-on-a-first-install`, `other-records`; Chinese: `首次安装时的宿主行为`, `其他记录` |

Moved headings keep their text, so `upgrade-order`, `upgrade-the-default-installation`, `disable-the-complete-starter` and the legacy Session anchors move with their sections. `installation#common-problems` is unchanged. The table of older DSH releases gains its own anchor, `older-dsh-releases` (Chinese `更早的-dsh`), which the links that used to point at the page title now use.

## Compatibility

- **Published files.** README.md, README.zh-CN.md and SECURITY.md ship in `dsh-mnemon`, and the plugin READMEs ship in `dsh-mnemon-strategy-default-three-tier` and `dsh-mnemon-strategy-light-context`, so `.changeset/docs-restructure.md` gives all three a patch release. Their links stay absolute and their images unchanged.
- **Scripts.** Thirteen scripts gain one header comment line each; none of them ships in a package. `scripts/link-bundle-declarations.mjs`, a publication input, already explains itself and is unchanged.
- **Nothing else changes**: no code, setting key, persisted format, RPC name, tool name, model-visible description or UI copy. There is no version skew to handle.
- **Records and release notes** keep their contents and paths; only the evidence index gains its row and the tooling sentence.

## Verification

Run with Node 24.19 and pnpm 10.13.1, the CI versions:

| Command | Result |
|---|---|
| `pnpm run verify:docs` | Passed: 4,511 local links, 320 Markdown anchors, bilingual paths and official plugin coverage |
| Anchor comparison of every changed page against `3b33e07e` | No anchor lost |
| `git diff --check` | Clean |
| `pnpm run typecheck` | Passed |
| `pnpm exec vitest run tests/docs.spec.mjs tests/release.spec.mjs tests/changesets.spec.mjs tests/package-locales.spec.mjs`, the tests that load the edited scripts | 4 files, 59 tests passed |
| `node --check` on the 12 edited `.mjs` scripts; `vitest list --config scripts/benchmark-algorithms.config.ts` | All parse; the benchmark configuration still lists its measure |
| `node scripts/release.mjs --check` | Passed |
| `pnpm build`, then `node scripts/verify-package-contents.mjs` | 59 files, 1,992,964 unpacked bytes, under the 2,500,000-byte ceiling |
| `pnpm run verify:build`, which runs one of the edited scripts | Deterministic output for 49 files |
| `pnpm run release:intent` with the base and head revisions | Changeset coverage verified for `dsh-mnemon` and `dsh-mnemon-strategy-default-three-tier` |

## Not done

- The documentation hub's **What is new** stays hand-written: the release pull request updates it, as the release guide now says.
- No separate page for older hosts: they keep their sections in the compatibility page.
- Legacy Session recovery stays in Operations, moved after Troubleshooting.
- The opt-in suites in the development guide stay prose, since each needs its own environment and command.
- The gallery recapture, the evidence index's grouping and the record harnesses that duplicate fake services are separate work.
- The plugin guide, `extensions.md` in both languages, is untouched, as described above.
- Plugin READMEs stay in English, and record contents are untouched.
