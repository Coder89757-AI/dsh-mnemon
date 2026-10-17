# A memory saved into the Memory Space mnemon_remember names — issue #387

[简体中文](./README.zh-CN.md) | [Verification record](./verification.json)

Issue #387 called `mnemon_remember` with `memoryBodyId: "default"` for a memory that mentioned "工具实测批次 3". The memory went into a test space whose description held those words, and that space, switched off before, came back on; the receipt only mentioned it in passing. A second memory that matched no description went into `default`. The issue expected a named space to win over any routing, and a write to a switched-off space to fail or ask for confirmation rather than switch it back on.

Baseline: main `4feee034`. Fix: `3849ec82` and, after review, `b91d4ba9`; the e2e fixture is in `232530dd` and `6c0ca215`, the installed-DSH run of the host spec in `9c79a8c9`. The runs took place on 2026-10-17 (Asia/Shanghai):
- macOS 15.6 arm64, Node 24.19.0, Mnemon CLI 0.2.10;
- headless Chrome at 1280×800, zh-CN, light;
- DSH 0.2.1-alpha.2 (npm `alpha`) through `scripts/serve-e2e.mjs`.

## Cause

`mnemon_remember` hands the write to a writer child Agent. The request the child got showed the caller's `memoryBodyId` as a "Preferred Memory Space ID", and its persona told it to choose the narrowest suitable space and that "a write may target an inactive space and activates it". The strategy the issue names, Active capture, only adds a recording instruction; the choice was the writer's. The Memory Spaces Source does honour an exact id, and switches on the space a committed write or link goes to, which is how a space created in the same run becomes active.

## Fix

Before the writer starts, the Host reads the Memory Space directory and checks a named space:
- An unknown id, a space whose Provider is off or takes no writes, and a switched-off space fail at once with the reason, and no writer runs.
- A model that wants a switched-off space back switches it on first with `mnemon_memory_body_update`; the refusal says so. A space the user picks in the Memory Spaces page's dialog still comes back on with the write, and the result lists it in `activatedMemoryBodyIds`.
- A directory that cannot be read saves nothing and says why.

The writer then runs under a DSH tool guard, attached when DSH publishes the child and before it can run, the same mechanism idle review already uses (generalised as `startGuardedChild`):
- With a named space, the guard refuses `mnemon_remember` or `mnemon_link` into any other space, and any creation or change of spaces.
- Without one, it refuses a write or a link into a space that was switched off when the run started, and switching such a space on. A space the writer creates in the run takes its first write as before. Save to memory, which never names a space, follows the same rule.
- Saving a memory never merges spaces: a merge switches its target on and its sources off, and is a request of its own.
- A delegated child is refused memory tools once its run has ended. DSH 0.2.1 resumes a finished child from its saved state when another Agent sends it a message, without the guard its run held; this covers the idle review child as well.

What the result reports comes from the Source receipts, not the writer:
- `memoryBodyIds` are the spaces a write receipt put the memory in, including a write inside a Code Mode program that failed afterwards. A writer that reports a write no receipt shows ends as `unknown`. This covers item 11 of issue #390.
- The prompt labels a named space "Target Memory Space ID (write only here)", and explicit requests label theirs "Memory Space ID" instead of "Preferred".

A DSH without Agent ownership or scoped tool guards, or a provider that runs no local child, runs the writer unguarded, as before. A guardable child that DSH published out of the guard's sight fails the write.

## Method

`pnpm e2e:serve --remember-target` seeds the Chinese Lumen demo: Lumen 项目 (`default`) and 团队约定 active, 调研归档 (concluded research) switched off with two memories.
1. After `remember-target-check` the scripted root Agent lists the spaces and calls `mnemon_remember` with Lumen 项目's id for a research conclusion about TimescaleDB. The scripted writer first tries 调研归档, which describes the memory better, then Lumen 项目.
2. In a new conversation, after `remember-archive-check`, the root Agent names 调研归档 itself and replies with what `mnemon_remember` answered.

Only the model decisions are scripted; DSH, the child Agent, the guard, the tools and the Mnemon Native writes are real. The baseline ran the same build with `src/host/subagent.ts`, `src/host/review-tools.ts`, `src/host/tools.ts` and `src/host/lifecycle.ts` from main; its second step ran on a fresh fixture, where 调研归档 was still off.

## Before and after

| | main | Fix |
|---|---|---|
| Step 1: the reply | ![The receipt names 调研归档's id as the space written](./before-conversation.jpg) | ![The receipt names default](./after-conversation.jpg) |
| Step 1: **记忆系统 → 记忆空间** (Memory System → Memory Spaces) | ![3 / 3 active: 调研归档 switched on, 3 memories](./before-spaces.jpg) | ![2 / 3 active: 调研归档 still off, 2 memories](./after-spaces.jpg) |
| Step 2: the root Agent names 调研归档 | ![The receipt names 调研归档's id; it was switched on](./before-archive.jpg) | ![写入被拒绝: the space is switched off, switch it on first](./after-archive.jpg) |

In step 1 on main the writer's first attempt went through: the conclusion landed in 调研归档, which came back on with three memories, and the receipt named that space although the caller had asked for `default`. With the fix the guard refused the first attempt with `This write was requested for Memory Space "default"…`, the writer wrote into Lumen 项目, the receipt names `default`, and 调研归档 stayed off with its two memories.

In step 2 on main the write landed in 调研归档 and switched it on. With the fix the Host refused the space before any writer ran: `Memory Space "…" (调研归档) is switched off, and a write would switch it back on. If the user wants it back, switch it on first with mnemon_memory_body_update (active: true); otherwise name an active space.` 调研归档 stayed off.

## Automated checks

`tests/remember-target-host.spec.ts` runs DSH's real agent loop and spawn provider over two Holographic spaces, one switched off and better described. It passes on DSH 0.1.7-rc.2 (the repository's pin), 0.2.0-rc.2 and 0.2.1-alpha.2 through the installed-DSH harness:
- a write that names the active space is refused the other one and lands where it was asked; the switched-off space stays off;
- a write that names no space is refused the switched-off one and lands in the active one; `memoryBodyIds` come from the receipt, not the writer's report;
- a switched-off space a model names is refused before any writer runs;
- a switched-off space the user picked takes the write, comes back on and is listed in `activatedMemoryBodyIds`;
- a finished writer that another Agent sends a message cannot write: on 0.2.1-alpha.2 DSH resumes it, and it reads the refusal; earlier DSH does not resume it.

`tests/subagent.spec.ts` adds:
- the guard's decisions for `mnemon_remember`, `mnemon_link`, space changes and merges, with and without a named space;
- the checks on a named space, unknown, Provider off, no writes and switched off, with no writer started, and the user's `activateTarget`;
- a directory that cannot be read saves nothing;
- `memoryBodyIds` from a write inside a failed Code Mode program, and a write the writer claims without a receipt reported as `unknown`.

`tests/review-tools.spec.ts` adds the optional guard's rules: a published child is guarded, a child that cannot be guarded runs as before, and a guardable child published out of sight fails.

14 of these 15 tests fail on main. The resume case passes there on the pinned DSH, which never resumes a finished child; on 0.2.1-alpha.2 it fails once the new guard is taken out. The review, subagent, command and continuation suites pass, including the idle review's guard, which now uses the generalised starter.

## Limits

- The guard holds the writer to a space; it does not judge whether the memory belongs there. A caller that names an active space is trusted to have chosen it.
- With every space switched off, `/mnemon remember` and Save to memory save nothing unless the writer creates a space.
- The writer's own summary is still model-written; the structured fields carry what happened.
- On a DSH without Agent ownership or scoped tool guards the writer runs as before, with only the persona to hold it to the named space.
- The list of finished children lives in the Host process, at most 1,000 of them: a child DSH resumes after the Host restarts is not refused.
- A Team member or other child that calls `mnemon_remember` itself writes through the Source directly, which still switches on the space it names.
