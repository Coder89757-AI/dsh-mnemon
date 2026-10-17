# 把测试工具移出 PR 记录

[English](./README.md)

一些验收记录里带着后续工作还要用到的工具：两个只能从记录中运行的 DSH 0.2.1 行为探针，三个假的嵌入服务（其中两个是 Python），以及一份为给每个请求记下模型而复制的 e2e 夹具模型桩。本次改动把仍然需要的部分移到 `tests/` 与 `scripts/`，随其余测试一起运行并持续维护。各记录保持原样，已发布的包没有任何变化。

测试版本：分支 `claude/test-tooling-from-records`，从 main `4996a796` 开始，经独立审查后合并了 main `33b336c9`（#416、#417），2026-10-17（Asia/Shanghai）：macOS 15.6 arm64、Node 24.19.0、pnpm 10.13.1，锁定的 DSH 0.2.1-rc.1 与从 npm 安装的 DSH 0.2.0-rc.2，Mnemon CLI 0.2.10，无界面 Chrome。

## 移动了什么

| 记录中的位置 | 现在 | 原因 |
|---|---|---|
| [`dsh-021-alpha2/harness/task-agent-cwd-host.probe.ts`](../dsh-021-alpha2/harness/task-agent-cwd-host.probe.ts) | `tests/task-agent-cwd-host.spec.ts` | 只能从记录中运行，并且在 DSH 0.2.1-alpha.3 上已无法运行，因为后者导出 JSONL 持久化的方式不同 |
| [`dsh-021-alpha3/harness/resumed-memory-task-host.probe.ts`](../dsh-021-alpha3/harness/resumed-memory-task-host.probe.ts) | `tests/resumed-memory-task-host.spec.ts` | 它只打印续接后的记忆任务带着什么运行。此后 [#387](https://github.com/omdsh-dev/dsh-mnemon/issues/387) 拒绝这样的任务使用记忆工具，但对这类任务没有任何检查 |
| `fake-embeddings.py`（[issue-391](../issue-391-space-merge-edges/harness/fake-embeddings.py) 与 [issue-392](../issue-392-embedding-coverage/harness/fake-embeddings.py) 中逐字节相同）；[issue-392 的 `fake-ollama.py`](../issue-392-embedding-coverage/harness/fake-ollama.py)；`scripts/fixtures/archive-copies.mjs` 中的 `slowEmbeddingServer` | `scripts/fixtures/fake-embeddings.mjs` | 同一服务的三个替身，其中两个需要 Python |
| [`background-tasks-card/harness/stub.mjs`](../background-tasks-card/harness/stub.mjs) | `pnpm e2e:serve --log-model-requests`（`scripts/fixtures/model-request-log.mjs`） | 夹具模型桩的副本，为每个请求多记一行日志 |

[开发指南](../../zh-CN/development/README.md#夹具选项)与 [scripts/README.md](../../../scripts/README.md)（英文）介绍新工具；当前没有任何页面指向记录中的副本。

## 两个 DSH 0.2.1 测试

两者都以 Mnemon 的生命周期运行 DSH 真实的 agent loop、子 Agent 运行时、工作目录服务与 spawn provider，只有模型是脚本化的。两者都通过 `tests/helpers/installed-dsh.ts` 的 `dsh021` 在 DSH 0.2.0 上跳过。

### 原先已覆盖的部分

- **任务目录。** `tests/lifecycle.spec.ts` 用一个替身工作目录服务做判断：工作区文件夹已被删除的任务仍以该文件夹为 cwd，并请服务改从第一个仍存在的已登记工作区或 Host 的目录工作；没有该服务的 DSH 则不会被请求。没有任何测试让任务对着 DSH 自己的服务运行（它在每一步之前检查目录），也没有检查这类任务下的子 Agent。
- **续接的记忆任务。** `tests/runtime-compaction-host.spec.ts` 检查探针自己的断言：USER.md 压缩子 Agent 的请求只提供 `mnemon_subagent_result`，它的脚本化模型也需要 Mnemon 的完成协议。`tests/remember-target-host.spec.ts`（#387）检查被其他 Agent 续接的已结束写入任务不能写入。没有测试续接压缩子 Agent，而它是由对话自己的写入启动的。

### 各测试检查什么

`tests/task-agent-cwd-host.spec.ts` 通过 `runRuntimeMaintenanceTask` 为一个不存在的工作区文件夹运行运行时记忆维护，再像 Mnemon 那样在该任务下启动一个子 Agent：

| 情形 | 任务 | 它的子 Agent |
|---|---|---|
| DSH 的工作区登记表先列出一个已移走的文件夹，再列出一个存在的工作区 | 仍以已删除的文件夹为 cwd，从存在的工作区工作，这一步得到模型的回复 | cwd 与工作目录相同；以模型的回复完成 |
| 没有登记表，与 Headless 一样 | 仍以已删除的文件夹为 cwd，从 DSH 启动时的目录工作 | 相同；正常完成 |

`tests/resumed-memory-task-host.spec.ts`：USER.md 上限为 120 字节，对话写入三条用户画像。第三条发现 USER.md 已满，启动压缩子 Agent；它只带 `mnemon_subagent_result` 与 Mnemon 的指令运行，然后结束。随后对话用 `subagents.sendMessage` 给这个已结束的子 Agent 发消息，就像模型或用户在对话的子 Agent 列表中所能做的那样。DSH 0.2.1 带着对话的工具（包括记忆工具）、不带 Mnemon 的指令续接它。续接后的子 Agent 调用 `mnemon_runtime_memory` 添加一条事实，读到的是 `This Mnemon task has finished, so it no longer reads or changes memory. Reply without memory tools.`；USER.md 保持压缩留下的 revision 与条目。

### 去掉所检查的行为后都会失败

每个测试都在把它所检查的行为从 `src/host` 中去掉后运行一次，之后恢复：

| 去掉的内容 | 结果 |
|---|---|
| 任务 Agent 设置中的 `workingDirectory.set` 调用（`src/host/lifecycle.ts`） | 两种情形都失败：`working-directory: directory does not exist: "<…>/deleted-project"` |
| DSH 再次发布已结束的子 Agent 时它得到的守卫（`src/host/subagent.ts`） | 测试失败：续接后的子 Agent 写入返回 `Entry added.`，USER.md 多出 `User prefers answers in English.` |

### 在 DSH 0.2.0-rc.2 上

两者都跳过。在写成测试之前，曾以不带版本条件的临时测试运行：任务目录场景在 0.2.0-rc.2 上同样通过，因为该版本不检查目录，也没有工作目录服务；已结束的子 Agent 则无法续接：`subagent "<id>" has no supported continuation state and cannot be resumed; choose a different target`。

## 一个假的嵌入服务

`scripts/fixtures/fake-embeddings.mjs` 导出 `fakeEmbeddingServer()`，用 `node` 运行时在回环地址上提供服务。它支持 Mnemon CLI 使用的两种协议：服务根路径上的 Ollama 协议（`GET /api/tags`、`POST /api/embed`），以及某个前缀（如 `/v1`）下的 OpenAI 兼容协议（`GET /v1/models`、`POST /v1/embeddings`）。

| | `fake-embeddings.py` | `fake-ollama.py` | `slowEmbeddingServer` | `fake-embeddings.mjs` |
|---|---|---|---|---|
| 协议 | Ollama | Ollama | OpenAI 兼容 | 两者都支持 |
| 向量 | 8 维，每个词按哈希落到一维 | 同左，第一维从 0.01 起 | 256 维，由整段文本的哈希生成 | 默认 8 维，每个词按哈希落到一维，第一维从 0.01 起；请求可以指定自己的 `dimensions` |
| 多个输入 | 不支持：只接受字符串 | 拼接后一个向量 | 每个输入一个 | 每个输入一个 |
| 延迟 | — | `slow`，按请求 | `delayMs`，按请求 | `delayMs` / `--delay-ms` 作用于每个嵌入响应，模型列表不受影响；客户端断开即停止等待 |
| 缺少模型 | — | `missing`：列出模型，`POST` 返回 404 | — | `missingModel` / `--missing-model`：不列出任何模型，每个嵌入请求以对应协议的错误格式返回 404 |
| 请求记录 | — | 计数写入 `<端口文件>.count` | `report` 回调 | `report` 回调；用 `node` 运行时每个请求输出一行 `Fake embeddings:` |
| 端口 | 写入端口文件 | 写入端口文件 | 由调用方监听 | 由调用方监听；`--port`、`--port-file` |

`--archive-copies` 使用它，模型为 `fixture-embed`，延迟不变（默认 12 秒，可用 `MNEMON_E2E_EMBEDDING_DELAY_MS` 修改）。profile 中的 Endpoint（`http://127.0.0.1:<端口>/v1`）、模型与协议与之前相同，夹具也照旧为每个嵌入请求输出一行 `Archive copies:`。有两处不同。模型列表与嵌入之外的路径现在返回 404，Mnemon CLI 不会请求这些路径。向量为 8 维、每个词按哈希落到一维，而不是由整段文本的哈希生成的 256 维；只有当延迟被设得短于 Mnemon 给一次 CLI 调用的 10 秒时，向量才会到达 CLI。

通过链接路径运行时（例如 macOS 上的 `/tmp/...`），这个命令现在能够启动。Node 从真实路径运行通过链接找到的脚本，而入口检查拿它与链接路径比较，于是脚本没有启动就退出了。`scripts/fixtures/openviking-protocol.mjs` 有同样的检查，也做了同样的修正。

检查结果：

- `tests/fake-embeddings-fixture.spec.mjs`：两种协议、每个输入一个向量、词语重叠与空文本、请求自定的维度、两种协议下的缺少模型、嵌入响应延迟而模型列表不延迟，以及被拒绝的路径与请求体。它还通过链接路径以命令方式运行脚本（`--port-file` 与 `--delay-ms 60000`）：客户端在延迟中途断开后，SIGTERM 在 10 秒内结束进程。去掉断开处理时，进程那时仍在运行；沿用旧的入口检查时，它根本不会启动。设置 `MNEMON_NATIVE_TEST_CLI` 时，这个测试还会让 Mnemon CLI 对着该服务运行。
- 在临时数据目录中运行 Mnemon CLI 0.2.10，三条记忆在没有嵌入服务应答时写入：

| 服务 | 之前的 `embed --status` | `embed --all` | 收到的请求 |
|---|---|---|---|
| Ollama，`http://127.0.0.1:<端口>` | 可用，`protocol: ollama`，3 条中 0 条 | 3 条成功；之后 `recall "rollback script for migrations"` 把迁移那条排在第一 | 4（3 个向量与这次召回） |
| OpenAI 兼容，`http://127.0.0.1:<端口>/v1` | 可用，`protocol: openai`，3 条中 0 条 | 3 条成功；召回结果相同 | 4 |
| `--missing-model` | 可用，3 条中 0 条 | 0 条成功，3 条失败；仍是 3 条中 0 条 | 3 |
| `--delay-ms 400` | 可用 | 3 条成功，用时 1.3 秒 | 3 |

- 在 DSH 0.2.1-rc.1 上以 `MNEMON_CLI_PATH` 与 300 毫秒延迟运行 `pnpm e2e:serve --archive-copies`：夹具完成预置；profile 的嵌入设置为 `endpoint: http://127.0.0.1:<端口>/v1`、`model: fixture-embed`、`protocol: openai`；服务列出 `fixture-embed`；CLI 通过该 Endpoint 为一条记忆生成向量（`protocol: openai`，1 条中 1 条）；夹具输出 `Archive copies: {"event":"embedding-request","request":1,"delayMs":300}`。

## e2e 夹具中的模型请求

`pnpm e2e:serve --log-model-requests` 在每行 `Fixture model request:` 后以 JSON 追加：请求所用的模型、由谁发出、工具数量，以及请求设定时的思考模式与推理强度。系统提示中带有 Mnemon 完成协议的请求记为 `memory task`（只有委派的记忆子 Agent 会有），DSH 的会话标题请求记为 `title`，其余记为 `conversation`。与替换模型桩的 `--live-model` 同用时，夹具拒绝启动：`--log-model-requests logs the loopback model stub's requests, and --live-model replaces the stub`。不加这个选项时一切照旧：这一行仍是 `Fixture model request: <n>`。

用 `--save-action` 运行存入记忆（发送 `我们的发布流程是什么？`，再点击 **存入记忆 → 交给任务 Agent**），每次都在新的夹具中通过无界面 Chrome 进行：

| 运行 | 模型桩输出的行 |
|---|---|
| DSH 0.2.1-rc.1，`--log-model-requests` | `1 {"model":"deepseek-flash","kind":"conversation","tools":18,"thinking":"enabled","effort":"high"}`、`2 {"model":"deepseek-flash","kind":"title","tools":0,"thinking":"disabled"}`，然后 `3` 到 `6` 为 `{"model":"deepseek-flash","kind":"memory task","tools":9,"thinking":"enabled","effort":"high"}`，中间穿插写入任务的 `Save action:` 行 |
| DSH 0.2.1-rc.1，不加该选项 | `Fixture model request: 1` 到 `6` 以及相同的 `Save action:` 行，与 main 相同 |
| DSH 0.2.0-rc.2，`--log-model-requests` | 与 0.2.1-rc.1 相同，对话请求带 17 个工具 |

每次保存都以 `已存入` 结束，浏览器控制台没有错误。[PR #354 的记录](../background-tasks-card/README.zh-CN.md)是从它复制的模型桩中读取每个请求的模型；有了这个选项，夹具自己的模型桩就会输出。那份副本还为截图给每个对话起了不同的标题，这一点留在那份记录中。

## 独立审查

对第一版的审查发现两处不足，都已在本分支修正：

- 假嵌入服务的断开测试在进程内关闭服务，即使没有断开处理也能通过：`closeAllConnections()` 让 `server.close()` 完成，而被延迟的响应的计时器仍在运行。以命令方式运行时，这样的版本在收到 SIGTERM 后会一直运行到延迟结束。现在的测试以命令方式运行脚本，见上文。
- 续接的压缩子 Agent 结束时，DSH 发出的通知会唤醒对话，产生第五个模型请求；这个请求可能在测试最后一次等待之后才开始，与清理过程重叠。现在测试会等待这个请求。

审查还要求：`--log-model-requests` 只解析一次请求体；第一个任务目录用例匹配而不是钉死 DSH 的子 Agent 结果；修正被链接路径绕过的入口检查（`openviking-protocol.mjs` 同样如此）；本记录的措辞更准确；以及沿用其他页面对 Mnemon Native 嵌入设置的称呼。

## 兼容性

- 只改动测试、测试夹具、脚本与文档。没有已发布的文件变化，因此不需要 changeset，产品行为不变。
- 不加 `--log-model-requests` 时，`scripts/serve-e2e.mjs` 的输出与行为都与之前相同；`--archive-copies` 对嵌入服务的配置与日志也与之前相同。
- `scripts/fixtures/archive-copies.mjs` 不再导出 `slowEmbeddingServer`；只有 `serve-e2e.mjs` 导入过它，而且任何包都不发布 `scripts/`。
- 所有记录（包括其中的 harness）保持不变。

## 验证

在工作树中通过 Node 24.19 与 pnpm 10.13.1 运行：

```sh
pnpm exec vitest run tests/task-agent-cwd-host.spec.ts tests/resumed-memory-task-host.spec.ts tests/fake-embeddings-fixture.spec.mjs tests/model-request-log.spec.mjs
DSH_HOST_ROOT=<DSH 0.2.1-rc.2 安装目录>/lib/node_modules/@deepseek-ai/dsh pnpm exec vitest run --config scripts/installed-dsh.config.ts <同样的文件>
MNEMON_NATIVE_TEST_CLI=/opt/homebrew/bin/mnemon pnpm exec vitest run tests/fake-embeddings-fixture.spec.mjs
pnpm run typecheck
pnpm run verify
MNEMON_CLI_PATH=/nonexistent/mnemon MNEMON_PLUGIN_VERIFY_CONCURRENCY=1 pnpm run verify:plugins
DSH_HOST_ROOT=<DSH 0.2.0-rc.2 安装目录>/lib/node_modules/@deepseek-ai/dsh pnpm run test:installed-dsh
```

结果（合并 main `33b336c9` 之后的分支）：

- DSH 0.2.1-rc.1 以及从 npm 安装的 DSH 0.2.1-rc.2 上的四个新测试文件：3 个真实宿主测试、7 个夹具测试与 4 个日志测试通过；真实 CLI 用例默认跳过，设置 `MNEMON_NATIVE_TEST_CLI` 后通过（8 个中 8 个）。
- `pnpm run verify`：文档链接、类型检查、确定性构建（49 个文件）、每个插件的构建、类型检查与测试，根测试 2,055 个通过、7 个跳过（144 个文件，含四个新文件），Headless，以及包检查（59 个文件，解包 1,980,706 字节，publint 与 attw）。
- 不提供 Mnemon CLI 的 `pnpm run verify:plugins`：17 个独立插件仓库与 18 个打包制品，以及真实 DSH 中的打包 Starter 与三个可选策略。
- 对 DSH 0.2.0-rc.2 运行 `pnpm run test:installed-dsh`：2,052 个通过、10 个跳过（144 个文件）；两个真实宿主测试文件在那里跳过（3 个测试）。
- 以合并基点运行 `pnpm run release:intent`：没有已发布包的输入发生变化，不需要发布意图。
