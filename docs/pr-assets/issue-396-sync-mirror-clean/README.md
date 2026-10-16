# Files Git does not track in the sync mirror — issue #396

[简体中文](./README.zh-CN.md) | [Verification record](./verification.json)

Issue #396 found `mnemon.db-shm` and `mnemon.db-wal` in the Git sync mirror, under `state/sync/git/mnemon/payload/data/default/`. From then on every sync, and every automatic backup, failed with `the remote Mnemon payload holds an unchecksummed file: payload/data/default/mnemon.db-shm`, although the branch itself was clean. Deleting the two files by hand made sync work again.

Baseline: main `4feee034`. Fix: `61f0e1ba` and, after review, `d6c0651f`. The runs took place on 2026-10-16 (Asia/Shanghai):
- macOS 15.6 arm64, Node 24.19.0 and Git 2.50.1;
- headless Chrome at 1280×800, zh-CN, light;
- DSH 0.2.1-alpha.3 (npm `alpha`) through `scripts/serve-e2e.mjs`;
- a local bare repository as the sync remote.

## Cause

Git sync reads the branch's payload from the mirror's work tree. Before reading, it brought the mirror to the branch with `git fetch` and `git reset --hard`, and a reset leaves files Git does not track where they are. A stray file in the sync directory was therefore read as part of the payload, which the checksum inventory does not list, and the sync stopped there. The next sync found the same file and stopped again. `git clean` ran only when the remote branch did not exist yet.

## Fix

After the reset, the sync also runs `git clean -fdxq` on its own directory in the mirror, given as a literal path. The directory then holds exactly what the branch holds before anything reads it. Files elsewhere in the mirror are left as they are. The issue could not say what created the two files; whatever does, they no longer stop a sync.

Review found that the clean turned an older silent fault into a sync that fails every time: `git add` obeys ignore rules, a global `*.db` exclude for one, so a Memory Space database was never committed although `checksums.json` listed it, and once the clean removed the ignored copy every later sync reported a missing checksummed file. The sync now stages its directory with `git add --all --force`, since after the clean that directory holds exactly the branch's payload and what the sync just wrote, and the Git environment drops the pathspec variables that would make the clean a silent no-op.

## Method

1. Under **插件 → 可组合记忆** (Plugins → Composable memory), switch **Git 同步** (Git sync) on, choose **仓库地址** (Repository address), enter the bare repository's path and click **连接** (Connect).
2. Click **立即同步** (Sync now). The first sync publishes the payload.
3. Write `mnemon.db-shm` and `mnemon.db-wal` into `state/sync/git/mnemon/payload/data/default/` in the fixture's storage root. `git status` in the mirror now lists that directory as untracked.
4. Click **立即同步** again.

The baseline ran the same build with `src/host/git-sync.ts` from main.

## Before and after

| main | Fix |
|---|---|
| ![同步失败：the remote Mnemon payload holds an unchecksummed file: payload/data/default/mnemon.db-shm](./before.jpg) | ![已是最新，仓库与本机一致。](./after.jpg) |

On main the second sync failed with the error from the issue, and the two files stayed in the mirror for the next one. With the fix it reported 已是最新，仓库与本机一致。 (Up to date: the repository matches this computer.), the mirror's `git status` was empty afterwards, and the branch holds no `-shm` or `-wal` file in either run.

## Automated checks

`tests/git-sync.spec.ts` adds one case against a real bare repository: after a first push, it writes `mnemon.db-shm` and `mnemon.db-wal` and a stray directory into the mirror's sync directory, then previews and pushes. Both succeed, the stray files are gone, the mirror is clean and the branch holds none of them. On main the preview fails with `unchecksummed file: payload/data/default/mnemon.db-shm`.

`pnpm e2e:sync` (`scripts/verify-sync-git.mjs`) passed all 64 checks on the fix against DSH 0.2.1-alpha.2: two DSH Web instances over real HTTP and a real bare repository. Against 0.2.1-alpha.3 it stops at its reconciliation section, which needs the subagent compatibility of PR #386, unrelated to this change.

## Limits

- A process that keeps a database in the mirror open can write its `-shm` again after the clean. The sync then still stops on it until that process closes the database. dsh-mnemon itself never opens a database in the mirror: it reads and merges spaces through private copies.
- `git clean -x` also removes files the repository's `.gitignore` names, inside the sync directory only. Nothing of dsh-mnemon's own lives there between syncs.
