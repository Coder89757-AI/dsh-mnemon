# A failed Merge here only in Check remote

[简体中文](./README.zh-CN.md) | [Verification record](./verification.json)

This turned up while testing how the Memory System follows a sync made on the Plugins page. When **只合并到本机** (Merge here only) failed in **检查远端** (Check remote), the dialog said nothing. It showed the same comparison as before the click, so the button looked as if it had done nothing.

Baseline: main `20e4ab67`. Fix: `af15e43f`. The runs took place on 2026-10-13 (Asia/Shanghai):
- macOS 15.6 arm64 and Node 24.19.0;
- headless Chrome at 1280×900, zh-CN, light;
- DSH 0.2.1-alpha.2 (npm `alpha`) through `scripts/serve-e2e.mjs`, with the real Mnemon CLI 0.2.10;
- a local bare repository standing in for `https://git.example.com/demo/memory.git` through Git's `url.<base>.insteadOf`.

## Cause

After a merge, the dialog reads the comparison again, so it shows what is left to merge. That read begins by clearing the dialog's line, and the merge had already put its failure on that line. A sync started from the dialog already set its failure after the read. A merge did not.

## Fix

The merge keeps its failure and sets it after the comparison is read again.

The sync section also reads its state again after a failed merge, not only after one that finished. The Host writes first and then reads Memory Spaces again, and that read can fail on its own.

## Method

1. On the machine named MacBook, publish a Mnemon space, **Release checklist**, with three memories to the bare repository.
2. On the machine named Studio, run the following once on main and once on the fix:
   1. Switch **Git 同步** (Git sync) on and connect the same address.
   2. Make the storage root's `data` directory, which holds Memory Spaces, mode 555. macOS then refuses to move it, but still lets programs read it and write inside its subdirectories. Exporting and comparing still work, and only the merge's last step fails: it moves the old `data` directory aside before putting the merged one in place.
   3. Click **检查远端**. Memory Spaces shows 有差异 (different), and runtime memory and Project Documents show 一致 (the same).
   4. Click **只合并到本机** and wait for the comparison to be read again.
3. Make the directory writable again before stopping the fixture.

## Before and after

Before the click, the comparison is the same in both runs:

![运行时记忆 一致, 项目档案 一致, 记忆空间 有差异](./compare.jpg)

| After **只合并到本机** | |
|---|---|
| main | ![The same comparison, with no line about the merge](./before-merge.jpg) |
| Fix | ![EACCES: permission denied, rename '…/data/data' -> '…/.dsh-pack-backup-…/data', above the same comparison](./after-merge.jpg) |

In both runs, Memory Spaces still shows 有差异 after the click, so the merge did not run on main either. Only the fix says why.

## Automated checks

`tests/client-sync.spec.tsx` has a new test, "says inside the comparison why a merge did not finish". Its Host refuses the merge. The test checks that:
- the comparison is read again;
- the reason stays in the dialog;
- no merged notice appears;
- the section reads its state again.

On main, the test fails because it cannot find the reason. The test "compares with the remote without writing, and merges only when asked" still passes.

## Limits

- The dialog shows a failure it cannot name in the Host's own words, as other sync failures already do. Here those words are an `EACCES` message with the temporary paths of the fixture.
- Only macOS was run. Linux refuses to move a directory with mode 555 for the same reason. Windows has no mode 555 and was not tried.
