# Memory Spaces read and written on two machines through Git sync — issue #370

[简体中文](./README.zh-CN.md) | [Issue #370](https://github.com/omdsh-dev/dsh-mnemon/issues/370) | [Verification record](./verification.json)

Issue #370 reports that every Git sync round doubled the Memory Spaces: 6, 13, then 30 spaces, 22 of them copies. A merge compared whole `mnemon.db` digests, and Mnemon rewrites a space whenever it is read.

Baseline: main `20e4ab67`. Fix: `fee03752`. The runs took place on 2026-10-13 (Asia/Shanghai):
- macOS 15.6 arm64 and Node 24.19.0;
- headless Chrome at 1280×900, zh-CN, light;
- DSH 0.2.1-alpha.2 (npm `alpha`) through `scripts/serve-e2e.mjs`, with the real Mnemon CLI 0.2.10;
- a local bare repository standing in for `https://git.example.com/demo/memory.git` through Git's `url.<base>.insteadOf`.

## Cause

- A recall, search or show raises `access_count`, stamps `last_accessed_at` and logs the read in `oplog`. Two machines that only read a space never hold the same bytes, so every sync kept the other machine's version as a new space under a random id, on both machines.
- A memory added on one machine had the same effect: the older version coming back from the other machine was kept as a copy too.

## Fix

- Spaces are compared by what they hold: every table, column and row, the edges included, except the usage columns, the read log and the derived embedding and effective importance. Columns are compared by name.
- Two versions of one space merge. The rows only the incoming version holds are added to this machine's database; this machine's rows, read counts, read log and schema stay as they are. One writer and one reader, or two writers, keep one space.
- A memory edited or forgotten on one side refuses the merge. The other version is then kept as one copy, which its later versions move on, and a space that already holds it is not copied again.
- A database with a virtual table, one past 500,000 rows (2,000,000 per merge), or one that cannot be read is compared by its bytes, as before.

## Method

1. Serve two WebUIs, **Studio** and **MacBook**, each with `MNEMON_CLI_PATH=<mnemon> pnpm e2e:serve`, and the same bare repository behind the demo address.
2. On Studio, the Mnemon CLI creates the store `gateway` with three memories, registered as **AI Gateway routing**.
3. On both, open **插件 → 可组合记忆 (dsh-mnemon)**, switch **Git 同步** on, choose **仓库地址**, enter the demo address and connect. Studio syncs first, then MacBook.
4. Each round, MacBook recalls every space with `mnemon recall routing` and clicks **立即同步**, then Studio does the same.
5. After three rounds, open **记忆系统 → 记忆空间**. On the fix, two more rounds follow in which each machine remembers one thing with the CLI before MacBook, Studio and MacBook sync.

## Before and after

On main, after three rounds of recalls:

| Studio | MacBook |
|---|---|
| ![21 / 21 已激活: cards of AI Gateway routing, each with the same 3 memories](./before-studio.jpg) | ![13 spaces of AI Gateway routing](./before-macbook.jpg) |

With the fix, after the same three rounds and two rounds in which both machines wrote:

| Studio | MacBook |
|---|---|
| ![1 / 1 已激活: AI Gateway routing, 7 条记忆, 44 条连接](./after-writes-studio.jpg) | ![1 / 1 已激活: AI Gateway routing, 7 条记忆, 44 条连接](./after-writes-macbook.jpg) |

![The space's content on Studio: what Studio and MacBook each learned, side by side](./after-writes-content.jpg)

Spaces held after each round in these runs:

| | start | round 1 | round 2 | round 3 |
|---|---|---|---|---|
| main | Studio 1, MacBook 1 | 3, 2 | 8, 5 | 21, 13 |
| Fix | 1, 1 | 1, 1 | 1, 1 | 1, 1 |

On the fix the two write rounds left each machine with one space, holding 5 and then 7 memories.

## Four patterns with the real CLI

[`harness/real-cli-sync.probe.ts`](./harness/real-cli-sync.probe.ts) drives the Git sync channel directly on two data roots with the real Mnemon CLI and a bare repository. Spaces held after the last round, Studio and MacBook:

| Pattern | main | Fix |
|---|---|---|
| Both recall, 3 rounds | 21, 13 | 1, 1 |
| One writes, the other recalls, 4 rounds | 46, 31 | 1, 1 |
| Both write, 4 rounds | 46, 31 | 1, 1, with 10 memories each |
| One forgets once, then writes; the other recalls, 4 rounds | 46, 31 | 2, 2 |

The forget pattern keeps one copy on each machine from the round of the forget on, and no more. Two earlier versions of this fix were measured the same way. Comparing spaces without merging them still added one space a round to both machines while one of them wrote (5 and 5). Moving a space forward to a version that only added to it still grew when both wrote (8 and 5) or after a forget (2 and 4).

## Automated checks

- `tests/space-identity.spec.ts`, 13 tests: reads leave the identity alone; containment; columns compared by name, including a column a newer Mnemon added; types kept apart; the byte fallbacks and row limits; virtual tables; merges that keep this machine's counts, log and schema; merges of two writers; merges refused for an edited or forgotten memory; cleanup.
- `tests/pack.spec.ts`, five tests over several rounds on Mnemon 0.2.10's schema: reads only, one writer, two writers, a forgotten memory, held and renamed copies. All five fail on main; twelve of the new tests fail on the variant that moved spaces forward.

## Limits

- A memory edited or forgotten on one side keeps the other version as a copy. The copy is active, so a forgotten memory can still be recalled from it. Carrying the edit or the forget across needs a rule for which version wins, which the issue proposes as the newer `updated_at`; this change leaves that to a separate fix.
- Copies earlier versions made stay; nothing merges or deletes them.
- After a sync merges memories in, an open Memory System page shows the old counts until it is refreshed.
- Node before 22.13 or 23.4 keeps the byte comparison. Node 25 prints one `ExperimentalWarning` per process when `node:sqlite` is first loaded.
- Only macOS was run; the report came from Windows.
