# Test tooling out of PR records

[简体中文](./README.zh-CN.md)

Some evidence records carried tooling that later work needs again: two probes of DSH 0.2.1 behavior that ran only from their records, three fake embedding services (two of them Python), and a copy of the e2e fixture's model stub made to log each request's model. This change moves what is still needed into `tests/` and `scripts/`, where it runs with the rest and is kept working. The records stay as they were, and nothing in the published packages changes.

Tested revision: the branch `claude/test-tooling-from-records`, started on main `4996a796` and, after an independent review, merged with main `33b336c9` (#416, #417), on 2026-10-17 (Asia/Shanghai): macOS 15.6 arm64, Node 24.19.0, pnpm 10.13.1, the pinned DSH 0.2.1-rc.1 and DSH 0.2.0-rc.2 installed from npm, Mnemon CLI 0.2.10, headless Chrome.

## What moved

| In the records | Now | Why |
|---|---|---|
| [`dsh-021-alpha2/harness/task-agent-cwd-host.probe.ts`](../dsh-021-alpha2/harness/task-agent-cwd-host.probe.ts) | `tests/task-agent-cwd-host.spec.ts` | It ran only from its record, and stopped running on DSH 0.2.1-alpha.3, which exports the JSONL persistence differently |
| [`dsh-021-alpha3/harness/resumed-memory-task-host.probe.ts`](../dsh-021-alpha3/harness/resumed-memory-task-host.probe.ts) | `tests/resumed-memory-task-host.spec.ts` | It printed what a resumed memory task ran with. [#387](https://github.com/omdsh-dev/dsh-mnemon/issues/387) has since refused such a task its memory tools, which nothing checked for this task |
| `fake-embeddings.py`, byte-identical in [issue-391](../issue-391-space-merge-edges/harness/fake-embeddings.py) and [issue-392](../issue-392-embedding-coverage/harness/fake-embeddings.py); [issue-392's `fake-ollama.py`](../issue-392-embedding-coverage/harness/fake-ollama.py); `slowEmbeddingServer` in `scripts/fixtures/archive-copies.mjs` | `scripts/fixtures/fake-embeddings.mjs` | Three fakes of one service, two of them needing Python |
| [`background-tasks-card/harness/stub.mjs`](../background-tasks-card/harness/stub.mjs) | `pnpm e2e:serve --log-model-requests` (`scripts/fixtures/model-request-log.mjs`) | A copy of the fixture's model stub that added one log line per request |

The [development guide](../../en/development/README.md#fixture-options) and [scripts/README.md](../../../scripts/README.md) describe the new tooling; no current page pointed at the record copies.

## The two DSH 0.2.1 specs

Both run DSH's real agent loop, subagent runtime, working-directory service and spawn provider with Mnemon's lifecycle; only the model is scripted. Both skip on DSH 0.2.0 through `dsh021` from `tests/helpers/installed-dsh.ts`.

### What was covered already

- **The task directory.** `tests/lifecycle.spec.ts` decides it against a stand-in working-directory service: a task for a deleted workspace folder keeps that folder as its cwd and asks the service to work from the first existing registered workspace or the Host's directory, and a DSH without the service is asked nothing. Nothing ran a task against DSH's own service, which checks the directory before each step, or a child under such a task.
- **A resumed memory task.** `tests/runtime-compaction-host.spec.ts` checks the probe's own assertion: the USER.md compaction child's request offers `mnemon_subagent_result` alone, and its scripted model needs Mnemon's completion protocol. `tests/remember-target-host.spec.ts` (#387) checks that a finished writer resumed by another Agent cannot write. Nothing resumed the compaction child, which a conversation's own write starts.

### What each spec checks

`tests/task-agent-cwd-host.spec.ts` runs Runtime maintenance through `runRuntimeMaintenanceTask` for a workspace folder that does not exist, then starts a child under that task as Mnemon starts one:

| Case | The task | Its child |
|---|---|---|
| DSH's workspace registry lists a moved folder, then an existing workspace | keeps the deleted folder as its cwd, works from the existing workspace, and its step gets the model's reply | the same cwd and working directory; it completes with the model's reply |
| No registry, as in Headless | keeps the deleted folder, works from the directory DSH started in | the same; it completes |

`tests/resumed-memory-task-host.spec.ts`: a conversation writes three USER.md facts with a 120-byte limit. The third finds USER.md full and starts the compaction child, which runs with `mnemon_subagent_result` alone and Mnemon's instructions, and settles. The conversation then sends the settled child a message with `subagents.sendMessage`, as a model, or a person from the conversation's subagent list, can. DSH 0.2.1 resumes the child with the conversation's tools, memory tools included, and without Mnemon's instructions. The resumed child calls `mnemon_runtime_memory` to add a fact and reads `This Mnemon task has finished, so it no longer reads or changes memory. Reply without memory tools.`; USER.md keeps the revision and entries the compaction left.

### Each fails without what it checks

Each spec ran once with the behavior it checks taken out of `src/host`, which was then restored:

| Taken out | Result |
|---|---|
| The `workingDirectory.set` call in the task Agent's setup (`src/host/lifecycle.ts`) | Both cases fail: `working-directory: directory does not exist: "<…>/deleted-project"` |
| The guard a finished child gets when DSH publishes it again (`src/host/subagent.ts`) | The spec fails: the resumed child's write answers `Entry added.`, and USER.md gains `User prefers answers in English.` |

### On DSH 0.2.0-rc.2

Both skip there. Run without the gate as scratch tests before the specs were written, the task-directory scenario passes on 0.2.0-rc.2 as well, since that DSH checks no directory and has no working-directory service, and the finished child cannot be resumed: `subagent "<id>" has no supported continuation state and cannot be resumed; choose a different target`.

## One fake embedding service

`scripts/fixtures/fake-embeddings.mjs` exports `fakeEmbeddingServer()` and, run with `node`, serves on loopback. It speaks the two protocols the Mnemon CLI uses: Ollama's at the server root (`GET /api/tags`, `POST /api/embed`) and the OpenAI-compatible one under a prefix such as `/v1` (`GET /v1/models`, `POST /v1/embeddings`).

| | `fake-embeddings.py` | `fake-ollama.py` | `slowEmbeddingServer` | `fake-embeddings.mjs` |
|---|---|---|---|---|
| Protocol | Ollama | Ollama | OpenAI-compatible | Both |
| Vector | 8 dimensions, one per hashed word | The same, starting at 0.01 | 256 dimensions from a hash of the whole text | 8 dimensions by default, one per hashed word, starting at 0.01; a request may ask for its own `dimensions` |
| Several inputs | Not handled: a string only | One vector for the joined text | One vector each | One vector each |
| Delay | — | `slow`, per request | `delayMs`, per request | `delayMs` / `--delay-ms` for each embedding answer, not the listing; a client that hangs up ends the wait |
| Missing model | — | `missing`: the model listed, `POST` answers 404 | — | `missingModel` / `--missing-model`: no model listed, each embedding request answers 404 in its protocol's error shape |
| Requests seen | — | Counted in `<port file>.count` | `report` callback | `report` callback; a `Fake embeddings:` line each, run with `node` |
| Port | Written to a port file | Written to a port file | The caller listens | The caller listens; `--port`, `--port-file` |

`--archive-copies` uses it with the model `fixture-embed` and the same delay, 12 seconds unless `MNEMON_E2E_EMBEDDING_DELAY_MS` says otherwise. The profile gets the same endpoint (`http://127.0.0.1:<port>/v1`), model and protocol as before, and the fixture prints the same `Archive copies:` line per embedding request. Two things differ. A route other than the model list and the embeddings now answers 404; the Mnemon CLI requests none. And a vector has 8 dimensions, one per hashed word, instead of 256 from a hash of the whole text; vectors reach the CLI only when the delay is set shorter than the 10 seconds Mnemon allows a CLI call.

Run through a linked path, such as `/tmp/...` on macOS, the command now starts. Node runs a script it reaches through a link from its real path, and the entry check compared that with the link, so the script exited without starting. `scripts/fixtures/openviking-protocol.mjs` had the same check and gets the same fix.

Checked:

- `tests/fake-embeddings-fixture.spec.mjs`: both protocols, one vector per input, word overlap and an empty text, a request's own dimensions, the missing model in both protocols, the delay held for embeddings but not for the listing, and refused routes and bodies. It also runs the script as a command through a linked path, with `--port-file` and `--delay-ms 60000`: after a client hangs up mid-delay, SIGTERM ends the process within 10 seconds. Without the hang-up handling it is still running then, and with the old entry check it never starts. With `MNEMON_NATIVE_TEST_CLI` set the spec also runs the Mnemon CLI against the service.
- The Mnemon CLI 0.2.10 in a scratch data directory, three memories remembered while no service answered:

| Service | `embed --status` before | `embed --all` | Requests seen |
|---|---|---|---|
| Ollama, `http://127.0.0.1:<port>` | available, `protocol: ollama`, 0 of 3 | 3 succeeded; `recall "rollback script for migrations"` then ranks the migration memory first | 4 (3 vectors and the recall) |
| OpenAI-compatible, `http://127.0.0.1:<port>/v1` | available, `protocol: openai`, 0 of 3 | 3 succeeded; the same recall | 4 |
| `--missing-model` | available, 0 of 3 | 0 succeeded, 3 failed; still 0 of 3 | 3 |
| `--delay-ms 400` | available | 3 succeeded in 1.3 s | 3 |

- `pnpm e2e:serve --archive-copies` with `MNEMON_CLI_PATH` and a 300 ms delay on DSH 0.2.1-rc.1: the fixture seeds, the profile's embedding settings are `endpoint: http://127.0.0.1:<port>/v1`, `model: fixture-embed`, `protocol: openai`, the service lists `fixture-embed`, the CLI embeds a memory through that endpoint (`protocol: openai`, 1 of 1), and the fixture prints `Archive copies: {"event":"embedding-request","request":1,"delayMs":300}`.

## Model requests in the e2e fixture

`pnpm e2e:serve --log-model-requests` adds to each `Fixture model request:` line, as JSON, the model the request names, what sent it, its tool count, and its thinking mode and reasoning effort where the request sets them. A request is a `memory task` when its system text carries Mnemon's completion protocol, which only a delegated memory child gets; a `title` when it is DSH's session-title request; and `conversation` otherwise. With `--live-model`, which replaces the stub, the fixture refuses to start: `--log-model-requests logs the loopback model stub's requests, and --live-model replaces the stub`. Without the option nothing changes: the line stays `Fixture model request: <n>`.

Save to memory with `--save-action` (send `我们的发布流程是什么？`, then **存入记忆 → 交给任务 Agent**), each run in a fresh fixture through headless Chrome:

| Run | The stub's lines |
|---|---|
| DSH 0.2.1-rc.1, `--log-model-requests` | `1 {"model":"deepseek-flash","kind":"conversation","tools":18,"thinking":"enabled","effort":"high"}`, `2 {"model":"deepseek-flash","kind":"title","tools":0,"thinking":"disabled"}`, then `3` to `6` `{"model":"deepseek-flash","kind":"memory task","tools":9,"thinking":"enabled","effort":"high"}`, with the writer's `Save action:` lines between them |
| DSH 0.2.1-rc.1, without it | `Fixture model request: 1` to `6` and the same `Save action:` lines, as on main |
| DSH 0.2.0-rc.2, `--log-model-requests` | As on 0.2.1-rc.1, with 17 conversation tools |

Each save ended `已存入` (saved) with no browser console error. The [record of PR #354](../background-tasks-card/README.md) read the model of each request from its copy of the stub; with the option, the fixture's own stub prints it. That copy also gave each conversation a title of its own for its screenshots, which stays in that record.

## Independent review

A review of the first version found two gaps, both fixed on this branch:

- The fake service's hang-up test closed the service in-process, which passes without the hang-up handling: `closeAllConnections()` lets `server.close()` finish while a held answer's timer still runs. Run as a command, such a build stayed up for the rest of the delay after SIGTERM. The test now runs the script as a command, as described above.
- When the resumed compaction child settles, DSH's notice of it wakes the conversation for a fifth model request, which could start after the spec's last wait and overlap its teardown. The spec now waits for that request.

It also asked for the request body to be parsed once with `--log-model-requests`, for the first task-directory case to match DSH's subagent result rather than pin it, for the entry check that a linked path defeated (in `openviking-protocol.mjs` too), for exact wording in this record, and for the name the other pages give the Mnemon Native embedding settings.

## Compatibility

- Tests, test fixtures, scripts and documentation only. No published file changes, so there is no changeset, and the product behaves as before.
- `scripts/serve-e2e.mjs` without `--log-model-requests` prints and does what it did; `--archive-copies` configures and logs its embedding service as before.
- `scripts/fixtures/archive-copies.mjs` no longer exports `slowEmbeddingServer`; only `serve-e2e.mjs` imported it, and no package ships `scripts/`.
- Every record, its harness included, is unchanged.

## Verification

From the worktree, through Node 24.19 and pnpm 10.13.1:

```sh
pnpm exec vitest run tests/task-agent-cwd-host.spec.ts tests/resumed-memory-task-host.spec.ts tests/fake-embeddings-fixture.spec.mjs tests/model-request-log.spec.mjs
DSH_HOST_ROOT=<DSH 0.2.1-rc.2 installation>/lib/node_modules/@deepseek-ai/dsh pnpm exec vitest run --config scripts/installed-dsh.config.ts <the same files>
MNEMON_NATIVE_TEST_CLI=/opt/homebrew/bin/mnemon pnpm exec vitest run tests/fake-embeddings-fixture.spec.mjs
pnpm run typecheck
pnpm run verify
MNEMON_CLI_PATH=/nonexistent/mnemon MNEMON_PLUGIN_VERIFY_CONCURRENCY=1 pnpm run verify:plugins
DSH_HOST_ROOT=<DSH 0.2.0-rc.2 installation>/lib/node_modules/@deepseek-ai/dsh pnpm run test:installed-dsh
```

Results, on the branch merged with main `33b336c9`:

- The four new spec files on DSH 0.2.1-rc.1, and on DSH 0.2.1-rc.2 installed from npm: 3 real-host tests, 7 fixture tests and 4 logging tests passed; the real-CLI case skipped, and passed with `MNEMON_NATIVE_TEST_CLI` (8 of 8).
- `pnpm run verify`: the documentation links, the typecheck, the deterministic build (49 files), every plugin's build, typecheck and tests, root tests 2,055 passed and 7 skipped (144 files, the four new ones included), Headless, and the package checks (59 files, 1,980,706 unpacked bytes, publint and attw).
- `pnpm run verify:plugins` without a Mnemon CLI: 17 independent plugin repositories and 18 packed artifacts, the packed Starter and the three optional Strategies in real DSH.
- `pnpm run test:installed-dsh` against DSH 0.2.0-rc.2: 2,052 passed and 10 skipped (144 files); the two real-host spec files skip there (3 tests).
- `pnpm run release:intent` against the merge base: no published package inputs changed, so no release intent is required.
