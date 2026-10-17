# The first Git sync after an update from 0.5.28 — issue #385

[简体中文](./README.zh-CN.md) | [Verification record](./verification.json)

Issue #385, on dsh-mnemon 0.5.28, edited a Project Document twice between two syncs. The second sync imported the branch's older revision as a new document: two active records with the same title, the copy under a file name with a second id. v0.5.29 fixed that with PR #381: after every merge and publish, a machine records each document's version as it and the branch then agree on it (`state/sync/base.json`), and a document only this machine changed since is published as an edit. The reporter planned to verify on 0.5.29. Their machine, however, had synced last on 0.5.28, which kept no such record, so on the first sync after the update the merge still had nothing to compare with, and a document edited since the last sync came back as a copy once more.

Baseline: main `4feee034`, v0.5.29. Fix: `2c271089` and, after review, `74bdcf82`. The runs took place on 2026-10-16 (Asia/Shanghai):
- macOS 15.6 arm64, Node 24.19.0 and Git 2.50.1;
- headless Chrome at 1280×800, zh-CN, light;
- DSH 0.2.1-alpha.2 (npm `alpha`) through `scripts/serve-e2e.mjs --docs-demo`;
- a local bare repository as the sync remote.

## Cause

The agreement exists only once a 0.5.29 merge or publish has written it. Without it, a merge keeps a copy of every document whose text differs, which is the safe choice between two unrelated histories. After an update from 0.5.28 the histories are not unrelated: 0.5.28 already remembered the commit of its last sync in `state/sync/last-run.json`, and at that commit this machine and the branch held the same documents, since the machine had just published that payload or taken it in.

## Fix

With no agreement on record, the merge reads the documents index at the last sync's commit, `git show <commit>:<directory>/payload/documents/index.json` in the mirror, and uses its versions as the agreement, as long as the branch at the merge still descends from that commit. A recorded agreement is used or refused exactly as before, including one for another repository, branch or directory, or for a commit the branch has left behind. Nothing else changes for a machine that already synced on 0.5.29.

Every version read this way is in the branch's own history, so it can only make the merge replace a document that equals one the branch published earlier, never text that was not published.

Review found two ways the fallback to the last run could drop the other machine's version where main kept a copy: a pull that merged runtime memory only is recorded as a run though no document came in, and the last run survived a change of branch or directory. A version this machine agreed on is one it held, so an agreed version above this machine's own revision is now ignored and the document merges as without an agreement, keeping a copy; changing the branch or directory forgets the last run; the fallback reads the old index through `git show`, treats a failure to read it as no agreement, and is skipped by a pull that takes no documents.

## Method

`pnpm e2e:serve --docs-demo` seeds six Project Documents, five active.
1. Under **插件 → 可组合记忆** (Plugins → Composable memory), switch **Git 同步** (Git sync) on, connect it to the bare repository by **仓库地址** (Repository address), and click **立即同步** (Sync now).
2. Delete `state/sync/base.json` from the storage root. That leaves it as dsh-mnemon 0.5.28 leaves it: `state/sync` holds `last-run.json` and the mirror, and no agreement.
3. On **记忆系统 → 项目档案** (Memory System → Project Documents), open 发布检查清单 (Release checklist), click **编辑** (Edit), add a line and click **保存修订** (Save revision). Do it twice, so the document reaches revision 3.
4. Click **立即同步** again.

The baseline ran the same build with `src/host/git-sync.ts` from main.

## Before and after

| main | Fix |
|---|---|
| ![Six active documents: 发布检查清单 twice, 821 B at revision 3 and 685 B](./before.jpg) | ![Five active documents: 发布检查清单 once, at revision 3](./after.jpg) |

On main the sync kept revision 1 of 发布检查清单 beside revision 3 as a new active document, `document-33c33d35-cb5532c7.md`, and published both. With the fix the storage root and the branch each hold one 发布检查清单, at revision 3, and five active documents.

## Automated checks

`tests/git-sync.spec.ts`, against real bare repositories:
- after an update from 0.5.28 whose last run was a push, an edit made before the first sync travels as an edit, and the branch holds one document at the latest revision;
- after an update from 0.5.28 whose last run was a merge, the branch's newer version replaces the one this machine took in, and both machines end alike;
- after an update from 0.5.28 when the branch was deleted and published again from another history, the merge keeps a copy, as before.

The first two fail on main; the third passes on main and on the fix. The existing case that simulates a machine on a build before 0.5.28 now removes `last-run.json` as well, which such a build never wrote.

## Limits

- A machine updated from a build before 0.5.28 has no `last-run.json`, so its first sync still keeps a copy of each document whose text differs from the branch's, as before.
- If the sync directory changed since the last sync, the index is read from the new directory at that commit, and is not used when that directory did not exist there.
