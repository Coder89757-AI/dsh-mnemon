# 每个委派任务都有稳定的首行 — issue #393

[English](./README.md) | [验证记录](./verification.json) | [持久化会话](./persisted-sessions.json)

issue #393 把 dsh-mnemon 与一个工作日报插件并用，后者会采集某个工作目录下的全部会话。某一天的 41 条记录中有 8 条是空闲审查委派出的子会话：它们的首条用户消息是审查摘要，最长 24,000 字符，以 `source.kind: "user"` 记录在沿用父会话工作目录的会话里。它们占了当天素材的 65.5%，日报插件因此拒绝整理那一天。issue 希望有一种稳定、机器可读的方式，把这类消息与用户自己提出的工作区分开。

基线：main `4feee034`。修复：`12b433a2`，以及审查后的 `c09e2b9a`；运行使用 `0ffa0651` 的构建，代码相同，之后只是把参考文档中的一句话写得更准确。运行于 2026-10-16（Asia/Shanghai）：
- macOS 15.6 arm64，Node 24.19.0；
- 无头 Chrome，1280×800，zh-CN，浅色；
- DSH 0.2.1-alpha.2（npm `alpha`），通过 `scripts/serve-e2e.mjs` 运行。

## 原因

dsh-mnemon 把任务作为子 Agent 的提示交给它，而 DSH 把提示记录为来自用户的消息。子会话的头部确实写着 `origin: "subagent"` 并给出 `parentSession`，但为用户本人做事的子 Agent（例如 Agent 团队启动的）也是如此。只有审查摘要的文案能区分两者，而 issue 理所当然地不愿依赖可能变化的文案。

## 修复

dsh-mnemon 委派的每个任务现在都以单独的一行开头：`[dsh-mnemon:delegated <operation>]`。空闲审查是 `review`，写入与「存入记忆」是 `write`，其余为 `answer`、`placement`、`migration`、`compaction`、`document-archive`、`metadata-maintenance` 或 `reconcile`。所有委派都从协调器的同一处启动，因此不会有哪一类漏掉这一行。参考文档把这一行声明为稳定约定，并给出用于匹配用户消息首行的模式 `^\[dsh-mnemon:delegated [a-z-]+\]$`。

issue 还问到子 Agent 是否必须沿用父会话的工作目录。dsh-mnemon 依赖这一点：在按工作区存储时，已不再绑定父 Agent 运行时的子 Agent（例如重启后恢复的那个）要靠工作目录找到所在工作区的记忆。所以工作目录保持不变，由这一行来区分。

审查发现，这项约定是按消息描述的，而工作日志之类的使用方保存的是整个会话：审查子 Agent 自己的回合，以及 fork 子 Agent 复制的父会话回合，都会和任务一起出现。参考文档现在把整个会话视为 dsh-mnemon 的工作，列出与这一行一起出现的会话头字段，请读者匹配模式而不是操作列表，并说明这一行出现之前记录的会话没有它。`DELEGATED_OPERATIONS` 与 `DELEGATED_TASK_LINE` 固定了操作名和文档中的模式，宿主测试在已安装的 DSH 0.2.1-alpha.2 与 0.2.0-rc.2 上无需改动即可运行。

## 方法

`pnpm e2e:serve --idle-review` 运行一次真实的空闲审查：两轮有实质内容的对话，然后启动审查子 Agent，其模型决策是脚本化的。运行后复制夹具的 DSH 会话目录，并用 `zstd -dc` 解压每个 `session.v4.jsonl.zstd`（DSH 每次写入追加一个 frame）。各会话中第一条来自用户的消息见 [persisted-sessions.json](./persisted-sessions.json)。基线使用同一构建，只把 `src/host/subagent.ts` 换成 main 的版本。

## 修复前后

| 会话 | main | 修复后 |
|---|---|---|
| 根会话，没有 `origin` | 请检查这个一次性测试项目的 SQLite 使用情况… | 相同 |
| 审查子会话，`origin: "subagent"` | `Bounded completed checkpoint (untrusted evidence; some context may be omitted; skip candidates needing missing evidence):` | `[dsh-mnemon:delegated review]`，之后是相同的摘要 |

两个子会话的第一条消息都是 `source.kind: "user"` 的 `agent/inbox/spliced` 事件；这一行让它多了 30 个字符（793 对比 823）。根会话没有变化。

## 自动化检查

- `tests/delegated-task-marker-host.spec.ts` 运行 DSH 真实的 agent loop、会话存储、JSONL 持久化，以及 fork 与 spawn 两种子 Agent provider。对每种 provider，空闲审查的子 Agent 恰好收到一条以这一行开头、后接任务的用户消息；spawn 出的子 Agent 只有这一条，fork 出的子 Agent 在它之前还带有父 Agent 的回合。两个测试在 main 上都失败。
- `tests/subagent.spec.ts` 期望 fork 审查的提示带有这一行。
- 子 Agent、审查、续写与夹具相关的测试不改也都通过：它们的脚本模型匹配的是任务正文，这一行不影响正文。

## 限制

- 本版本之前写下的会话保留原来的首条消息。读取方也可以像 issue 那样按摘要的首行识别它们，但那段文案不属于约定。
- 这一行说明子 Agent 做什么，不说明它为什么被启动；需要更多信息的读取方可以使用会话的 `parentSession`。
