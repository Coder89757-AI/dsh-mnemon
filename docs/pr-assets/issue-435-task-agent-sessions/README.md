# Task Agent sessions out of the conversation lists — issue #435

[简体中文](./README.zh-CN.md) | [Verification record](./verification.json)

Issue #435: every runtime capacity maintenance left new rows under **Ungrouped** in the DSH sidebar, each named **Untitled** and empty when opened, and they never went away. The reporter counted five per maintenance run, 15 after three, on DSH 0.2.1-rc.2 with dsh-mnemon 0.5.32.

Baseline: main `2143a1ed` (v0.5.32). Fix: `94d28a02`. The runs took place on 2026-10-19 (Asia/Shanghai):
- macOS 15.6 arm64, Node 24.19.0, pnpm 10.13.1;
- headless Chrome 155 at 1280×800, light, English and Chinese;
- DSH 0.2.1-rc.2 (npm `latest` and `next`) and 0.2.0-rc.2, each in its own npm prefix, through `scripts/serve-e2e.mjs --save-action`, with Mnemon CLI 0.2.11.

## Cause

Every memory task dsh-mnemon runs outside a conversation runs under a fresh top-level DSH Agent: Save to memory (in a conversation or on the Memory Spaces page), Ask Agent, Document archive and the Document write that makes room, the Provider choice for a new Memory Space, Tidy names and descriptions, runtime memory capacity maintenance (a task Agent for each MEMORY.md routing batch, and one to condense USER.md, including before Save to memory adds to a full user profile) and memory reconciliation. `runTaskAgent()` creates it with `taskAgentCreation()`, whose session metadata held `cwd` and the Agent preset only. DSH persists that session like any other.

DSH's sidebar decides with `sessionVisible()` in `dsh-client-ui-workspace`: a session whose header has `origin: "subagent"` is hidden first; otherwise a session counted as blank is hidden unless it is the current one. A task Agent never starts a turn, so its live session is blank. A cold one is blank only while DSH's projection cache holds a record of it: `summarizeCold()` in `dsh-api-session-controller` serves `blank: metadata?.blank ?? false`, and its source says "A large, metadata-less, or inaccessible cache miss remains unknown and visible". With no record, the session is listed; it belongs to no workspace's `sessionIds`, so it lands under Ungrouped, and with no title it reads Untitled. The reporter's host had no record for these sessions, nor for 601 of its 606 subagent sessions; those stayed hidden because DSH's own subagents carry `origin: "subagent"`.

On this machine DSH writes a record when a session is created and when it is disposed, so with that record in place main showed no row on either release. The row appears where the record is missing. DSH's ACP agent lists the session either way: its `session/list` leaves out only subagent and forked sessions, blank ones included.

## What DSH does with `origin: "subagent"`

`CreateAgentOptions.meta.origin?: 'subagent'` is part of `agents.create` on both supported releases ("the coarse `origin` classification"), and `childSessionMeta()` in `dsh-subagent` writes it, with `parentSession` and `delegationDepth`, for every child DSH starts. The session header takes no other origin value and no other key: DSH 0.2.x has no hidden, internal or unpersisted session, and no API that deletes one.

Every runtime file in both installs that branches on a session's `origin` (the same 17 in each; the older session formats' header checks only accept the value), and what it means for a task Agent session, which carries the origin but no `parentSession` and no `delegationDepth`:

| Package | What it does with the origin | For a task Agent session | Release |
|---|---|---|---|
| `dsh-client-ui-workspace` | `sessionVisible()` hides the session before its blank and archive rules | Never listed in the sidebar, cache record or not: the fix | both |
| `dsh-acp` | `session/list` skips it, as it skips forks; `session/resume` refuses it | ACP editors no longer list or resume it | both |
| `dsh-api-session-controller` (Host) | `hasApiSessionSubagentOwner()`: generic Session routing refuses to resolve, resume, reuse, cancel or edit the queue of the session (`session/agent-busy`); `validateAddress()` refuses its history through a session address | Nothing opens a task Agent session through the Session API: dsh-mnemon creates, drives and disposes it through `ctx.agents` | both |
| `dsh-api-session-controller` (Host) | `underArchivedSession()` and `forkWorkspace()` follow `parentSession` from a subagent session | No `parentSession`: the same result as a root session | both |
| `dsh-api-session-controller` (client) | `subagentAddress()` builds an address only with a parent; `handleSessionRemoved()` keeps a subagent row as not running instead of dropping it | No address; the kept row is one the sidebar hides | address 0.2.1, row both |
| `dsh-client-ui-conversation` | breadcrumbs walk from a subagent session to its parent | One crumb, if someone opens the session | both |
| `dsh-client-ui-subagent` | no descendant count in a subagent session's header; the lineage switcher needs a parent | Neither shows, if someone opens the session | count both, switcher 0.2.1 |
| `dsh-client-ui-reference` | an `@` candidate is a child of the conversation only when its `parentId` is that conversation | Stays among Sessions, as before; `@` candidates list every stored session either way | both |
| `dsh-client-file-upload` | refuses uploads to a subagent session | A task Agent receives none | both |
| `dsh-headless` | will not adopt a subagent or forked session | `dsh headless` cannot continue one; with an Agent preset it could not before either | both |
| `dsh-experimental-auto-review` | finds a child's parent instruction through `parentSession` | As for a root; the task Agent runs no turn of its own | both |
| `dsh-tool-subagent` | a child inherits its parent's model-selection policy through `parentSession` | The fresh-session rule, as for a root; the task Agent calls no tool | both |
| `dsh-workspace-changes` | takes no git change snapshots of a subagent session's turns | The task Agent runs no turn | both |
| `dsh-subagent` | writes the origin for its children; `runningDescendants()` (archive activity and stop) needs both the origin and `parentSession`; `delegationDepthOf()` reads only `delegationDepth` | Nobody's descendant; its own children stay its descendants, at depth 1, within the `maxDepth: 1` Mnemon starts them with | both |
| `dsh-session`, `dsh-session-persistence-jsonl` (index and worker), `dsh-session-format-v3-to-v4` | headers accept `origin` only as `"subagent"`; the catalog migration of an older-format parent collects children by origin and `parentSession`, and refuses a subagent header without a parent | A valid header, never collected as anyone's child; both releases write format 4, so no migration reads it | both |

Nothing throws on the task's own path, no work is attributed to a conversation, no page breaks, and cleanup is unchanged: the task Agent is disposed as before, and its children settle under it.

In dsh-mnemon itself, `install()` still skips a task Agent by its id before it looks at the origin, `forAgent()` resolves its workspace from its `cwd` because it has no `parentSession`, and the `isSubagent()` checks guard tool executions, which a task Agent never makes.

## Fix

`taskAgentCreation()` gives every task Agent `origin: "subagent"`, in the one `meta` both of its returns use, so every task above gets it. It sets no `parentSession` and no `delegationDepth`: the task belongs to no conversation, and its children stay one level deep. `CreateHostAgentOptions.meta` in `src/host/dsh.ts` declares the field.

Rejected:
- **A parent and a depth.** Page tasks have no conversation. Under one, archiving that conversation would stop the task and cancel its children, the conversation's model-selection policy would pass to them, and a depth of 1 would put the children at 2, past the `maxDepth: 1` Mnemon starts them with.
- **Deleting the session after `dispose()`.** DSH 0.2.x offers no delete, only archive, and the JSONL store has no delete either. It would mean editing DSH's store by hand, under children whose `parentSession` points at it.
- **Archiving it.** Archived sessions still show under the sidebar's archive filters, untitled, and archiving one while its task runs would stop its children, since DSH's archive gate follows their lineage.
- **Relying on blank.** Blank comes from DSH's projection cache, which dsh-mnemon cannot make hold a record, and ACP lists blank sessions anyway.
- **Running the work under the conversation's Agent.** The coordinator's `parent` fallback would put memory work into the conversation's subagent list, and page tasks have no conversation; maintenance runs apart from conversations on purpose.

## Method

`pnpm e2e:serve --save-action` with `MNEMON_CLI_PATH`, and `MNEMON_E2E_DSH` naming each release's `lib/bin.js`. In a Mnemon E2E conversation, send `What is our release process?` (`我们的发布流程是什么？`), choose **Save to memory** on the reply, keep **Let the Agent decide**, choose **Send to task Agent** and wait for the receipt. Then:
1. read the sidebar while DSH holds the record it wrote for the task's session;
2. run DSH's ACP agent (`dsh acp`) on the fixture's `DSH_HOME` and call `initialize` and `session/list` over stdio;
3. remove the task's record from `session_projcache` in `DSH_HOME`, as on the reporter's host, restart the WebUI on the same data (`SIGUSR2`), open **Ungrouped** if it shows and read the sidebar; reload the page and read it again.

Only the model's decisions are scripted; DSH, the task Agent, its writer and the Mnemon Native write are real. The baseline ran the same build with `src/host/lifecycle.ts` and `src/host/dsh.ts` from main.

## Before and after

The sidebar after the restart, with no record of the task's session:

| DSH | main | Fix |
|---|---|---|
| 0.2.1-rc.2, English | ![Untitled under Ungrouped](./before-0.2.1-en.png) | ![Only the conversation](./after-0.2.1-en.png) |
| 0.2.1-rc.2, Chinese | ![未分组下的未命名](./before-0.2.1-zh.png) | ![只有对话](./after-0.2.1-zh.png) |
| 0.2.0-rc.2, English | ![Untitled under Ungrouped](./before-0.2.0-en.png) | ![Only the conversation](./after-0.2.0-en.png) |
| 0.2.0-rc.2, Chinese | ![未分组下的未命名](./before-0.2.0-zh.png) | ![只有对话](./after-0.2.0-zh.png) |

In all eight runs:

| | main | Fix |
|---|---|---|
| Sidebar while DSH holds the record | no Ungrouped group | no Ungrouped group |
| ACP `session/list` | 2 sessions, one of them the task Agent | 1 session, the conversation |
| Sidebar after the restart without the record | Ungrouped, 1 Untitled row | no Ungrouped group |
| The same after a page reload | Ungrouped, 1 Untitled row | no Ungrouped group |
| Task Agent session header | no origin, no parent, depth 0 | `origin: "subagent"`, no parent, depth 0 |
| Its writer's session header | `origin: "subagent"`, parent the task Agent, depth 1 | the same |
| Save to memory receipt | added | added |
| Browser console errors | 0 | 0 |

With the fix, Save to memory saves as before:

| English | Chinese |
|---|---|
| ![Saved in Release notes](./saved-0.2.1-en.jpg) | ![已存入 Release notes](./saved-0.2.1-zh.jpg) |

## Sessions earlier releases left

The fix marks new task Agents; sessions earlier releases stored keep their header, since DSH never rewrites one. As the reporter found, such a session has a bare UUID as its id (conversations the WebUI starts have `session-` in front), no `origin` in its header, a handful of events and no user message, and its only subagent is a Mnemon task, such as `Route runtime memory archive batch 1/5` or `Mnemon supervised-writeback`. dsh-mnemon does not touch them: their headers carry nothing that tells them apart from a conversation for certain, and they are the user's DSH data. **Archive session** on such a row hides it and keeps its log; on main, on both releases, the Ungrouped group was gone after one archive, and the session's file stayed. The operations guide's troubleshooting table says so.

## The `runtimeModel()` branch

The report is right that `parent !== undefined → run(parent)` in `runtimeModel()` never runs in the shipped composition: `src/host/plugin.ts` always gives the coordinator its maintenance task runner, so Runtime capacity maintenance always runs under a task Agent. That has been the design since `583842c2` ("run model-dependent maintenance independently of user conversations"); the fallback serves a coordinator built without a runner, as several tests build it. With the origin, the task Agents no longer show, so the branch is not part of this bug and stays as it is.

## Automated checks

- `tests/lifecycle.spec.ts`: each of the seven ways the Host starts a task Agent (the maintenance runner, which also serves memory reconciliation and condensing the user profile, and six page actions) creates its Agent with `{ cwd, origin: 'subagent', agentPreset }` and no lineage (7 new cases); the six tests that pinned the task Agent's exact `meta` or header now include the origin. On main, those 13 fail; with the fix all 84 pass.
- `tests/task-agent-session-host.spec.ts` (new) composes real DSH packages with JSONL persistence, Session query and DSH's own ACP agent, which takes an in-memory message stream from its config as its own tests give it one, plus a conversation, Mnemon's lifecycle and DSH's spawn provider. As a control, `plain` is a finished session created as main created a task Agent's, through `agents.create` with only a cwd; ACP lists it, and leaves out the conversation, which is still attached. After Save to memory from the page, with a real writer, and after a Runtime maintenance task with a real child, ACP's `session/list` still offers only `plain`; Session query shows the task's header with the origin and no parent, its child with the task as parent at depth 1, and the save in its Memory Space. On main both fail with `expected [ 'plain', '<task id>' ] to deeply equal [ 'plain' ]`. Both pass on the pinned DSH 0.2.1-rc.2 and on an installed 0.2.0-rc.2. The sidebar's own rule lives in DSH's client bundle, which exports no such helper, so the WebUI runs above cover it.

Commands and results:

| Command | Result |
|---|---|
| `pnpm exec vitest run tests/lifecycle.spec.ts tests/task-agent-session-host.spec.ts tests/task-agent-cwd-host.spec.ts` | 3 files, 88 tests passed |
| `DSH_HOST_ROOT=<0.2.0-rc.2>/lib/node_modules/@deepseek-ai/dsh pnpm run test:installed-dsh tests/task-agent-session-host.spec.ts tests/lifecycle.spec.ts tests/task-agent-cwd-host.spec.ts` | 86 passed, 2 skipped (the 0.2.1-only working-directory cases) |
| `pnpm run typecheck` | passed |
| `pnpm run verify` | passed in 119 s: documentation, types, deterministic build (56 files), every plugin suite, root tests (152 files passed and 2 skipped; 2,131 tests passed and 7 skipped), Headless (38 tools, 8 of them Mnemon's), package contents and entries |
| `MNEMON_CLI_PATH=/nonexistent/mnemon MNEMON_PLUGIN_VERIFY_CONCURRENCY=1 pnpm run verify:plugins` | passed in 211 s: 17 plugin repositories and 18 packed artifacts, the external consumer, the packed Starter in real DSH |
| `DSH_HOST_ROOT=<0.2.0-rc.2>/lib/node_modules/@deepseek-ai/dsh pnpm run test:installed-dsh` | every root test on an installed 0.2.0-rc.2: 150 files passed and 4 skipped, 2,128 tests passed and 10 skipped (the 0.2.1-only working-directory and resumed-task specs, and the two opt-in live suites) |
| `pnpm run verify:docs`, again after the record's last edit | 5,035 local links and 373 anchors verified |
| WebUI | 8 runs before and after (2 releases, 2 languages) and 2 archive checks, in [verification.json](./verification.json) |

## Compatibility

- Starter only: `src/host/lifecycle.ts` and the Host's own type in `src/host/dsh.ts`; no plugin package changes, so no version skew. A Profile that keeps an older or newer copy of a plugin is unaffected.
- No public export, RPC, tool or setting changes. The origin is DSH's documented creation metadata, accepted by `agents.create` and the session header on DSH 0.2.0-rc.2 and 0.2.1-rc.2 alike, and DSH's own subagents carry it.
- One thing changes for plugins that read session logs: a task Agent session's header now has `origin: "subagent"` and still no `parentSession` or `delegationDepth`, so a reader that groups subagents under their parent finds none for it. Its child is unchanged and carries the delegated line. [Delegated child sessions](../../en/reference/workflows.md#delegated-child-sessions) in the workflows reference now says so; it had described the task's session as a top-level one.
- dsh-mnemon's own memory data is untouched; sessions earlier releases stored keep their header.

## Limits

- The reporter's host had no projection-cache record for most short-lived sessions, which this record does not explain; here the record is removed by hand to reach that state. The sidebar rule and the ACP list do not depend on it.
- A task Agent session is still stored, so DSH's `@` session mentions can still offer it, as they offer DSH's own subagent sessions.
- Rows that earlier releases left stay until archived.
- After the fix a task Agent session cannot be opened by any route: DSH's session API refuses it with `session/agent-busy` (`validateAddress()`), and `subagentAddress()` builds no address without a parent, so its children can be reached only through a direct link. On main, a host with no projection-cache record let a user open the Untitled row and inspect a failed writer's transcript from it.
