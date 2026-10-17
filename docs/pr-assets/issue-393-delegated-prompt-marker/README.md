# A stable first line for every delegated task — issue #393

[简体中文](./README.zh-CN.md) | [Verification record](./verification.json) | [Persisted sessions](./persisted-sessions.json)

Issue #393 runs dsh-mnemon beside a work-log plugin that collects every session in a working directory. Eight of one day's 41 records were the idle review's delegated children: their first user message is the review checkpoint, up to 24,000 characters, recorded with `source.kind: "user"` in a session that keeps the parent's working directory. They filled 65.5% of that day's material, and the work log refused to summarize the day. The issue asked for a stable, machine-readable way to tell such a message from work the user asked for.

Baseline: main `4feee034`. Fix: `12b433a2` and, after review, `c09e2b9a`; the run used a build of `0ffa0651`, whose code is the same, before one reference sentence was worded more precisely. The runs took place on 2026-10-16 (Asia/Shanghai):
- macOS 15.6 arm64 and Node 24.19.0;
- headless Chrome at 1280×800, zh-CN, light;
- DSH 0.2.1-alpha.2 (npm `alpha`) through `scripts/serve-e2e.mjs`.

## Cause

dsh-mnemon gives a child Agent its task as the child's prompt, and DSH records a prompt as a message from a person. The child's session header does say `origin: "subagent"` and names `parentSession`, but so does every subagent that does the user's own work, such as one an Agent team starts. Only the text of the checkpoint told the two apart, and the issue rightly would not rely on copy that can change.

## Fix

Every task dsh-mnemon delegates now starts with one line of its own, `[dsh-mnemon:delegated <operation>]`: `review` for idle review, `write` for writes and Save to memory, and `answer`, `placement`, `migration`, `compaction`, `document-archive`, `metadata-maintenance` or `reconcile` for the others. All of them start in one place in the coordinator, so the line cannot be left out of one. The reference documents the line as a stable contract, with the pattern `^\[dsh-mnemon:delegated [a-z-]+\]$` for a user message's first line.

The issue also asked whether a child must keep the parent's working directory. dsh-mnemon relies on it: with a per-workspace storage scope, a child that is no longer bound to its parent's runtime, such as one resumed after a restart, finds its workspace's memory through its working directory. So the working directory stays as it is, and the line carries the distinction.

Review found that the contract read per message, while a consumer such as a work log stores whole sessions: a review child's own turns, and a forked child's copy of its parent's, came along with the task. The reference now treats the whole session as dsh-mnemon's work, names the header fields that go with the line, asks readers to match the pattern rather than a list of operations, and says that sessions recorded before the line have none. `DELEGATED_OPERATIONS` and `DELEGATED_TASK_LINE` pin the operation names and the documented pattern, and the host spec runs unadapted on the installed DSH 0.2.1-alpha.2 and 0.2.0-rc.2.

## Method

`pnpm e2e:serve --idle-review` runs a real idle review: two substantive turns, then the review child, whose model decisions are scripted. After it ran, the fixture's DSH session directory was copied and each `session.v4.jsonl.zstd` decompressed with `zstd -dc` (DSH appends one frame per write). The first message from a person in each session is in [persisted-sessions.json](./persisted-sessions.json). The baseline ran the same build with `src/host/subagent.ts` from main.

## Before and after

| Session | main | Fix |
|---|---|---|
| root, `origin` absent | 请检查这个一次性测试项目的 SQLite 使用情况… | the same |
| review child, `origin: "subagent"` | `Bounded completed checkpoint (untrusted evidence; some context may be omitted; skip candidates needing missing evidence):` | `[dsh-mnemon:delegated review]`, then the same checkpoint |

Both children's first message is an `agent/inbox/spliced` event with `source.kind: "user"`; the line adds 30 characters to it (793 against 823). The root session is unchanged.

## Automated checks

- `tests/delegated-task-marker-host.spec.ts` runs DSH's real agent loop, session store, JSONL persistence and its fork and spawn subagent providers. For each provider, the idle review's child receives exactly one message from a person that starts with the line, followed by the task; a spawned child has only that one, and a forked child has its parent's turns before it. Both tests fail on main.
- `tests/subagent.spec.ts` expects the forked review's prompt with the line.
- The subagent, review, continuation and fixture suites pass unchanged: their scripted models look for the task's text, which the line does not alter.

## Limits

- Sessions written before this release keep their old first message. A reader can also recognise those by the checkpoint's first line, as the issue did, but that text is not part of the contract.
- The line names what the child does, not why it was started; a reader that needs more uses the session's `parentSession`.
