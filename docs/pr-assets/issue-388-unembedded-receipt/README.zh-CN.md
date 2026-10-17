# 没有生成向量的记忆会在回执中说明 — issue #388

[English](./README.md) | [验证记录](./verification.json)

issue #388 在嵌入服务（Ollama）没有运行时写入记忆。每次写入都返回成功、已提交、已新增，与服务正常时完全一样，但记忆没有向量，语义召回会一直漏掉它，直到 `mnemon embed --all` 补齐。只有事后的 `mnemon embed --status` 才暴露问题：第一次统计 48 条中只有 17 条有向量，第二次是 52 条中 51 条。issue 希望写入回执本身就能说明某条记忆暂时没有向量。

基线：main `4feee034`。修复：`d05ad398`（写入结果与 `/mnemon remember`）、`c554f75c`（「存入记忆」的回执），以及审查后的 `46759447`（下一步与措辞）。运行于 2026-10-17（Asia/Shanghai）：
- macOS 15.6 arm64，Node 24.19.0，Mnemon CLI 0.2.10，本机没有嵌入服务；
- 无头 Chrome，1280×800，zh-CN，浅色；
- DSH 0.2.1-alpha.2（npm `alpha`），通过 `scripts/serve-e2e.mjs` 运行，`MNEMON_CLI_PATH` 指向真实 CLI。

## 原因

Mnemon Native 本来就会说明：嵌入调用失败（服务不可用或缺少模型）的 `remember` 仍会保存记忆，并在回执中带上 `embedded: false`。dsh-mnemon 在把写入结果交给用户和 Agent 的路上丢掉了这个字段：
- `mnemon_remember` 和「存入记忆」把写入交给一个写入子 Agent，它的结果只包含动作、空间和写入子 Agent 自己的摘要；
- `/mnemon remember` 打印的就是这个结果；
- 对话中和记忆空间页上「存入记忆」的回执只显示结果和摘要，直接写入某个空间时也是如此，尽管 Provider 的回执里有这个字段。

用真实 CLI 做的探针（[harness/remember-without-vector.py](./harness/remember-without-vector.py)）把嵌入地址指向一个没有服务监听的端口：`remember` 返回 `added` 和 `embedded: false`，关键词召回仍能找到这条记忆（keyword 1，similarity 0），`embed --status` 报告 1 条中 0 条已嵌入。

## 修复

- 经由任务 Agent 的写入，会在 `unembedded` 中列出 Provider 回执报告为 `embedded: false` 的每条记忆，并附上 `hint`：补齐向量之前，它不参与语义匹配，关键词、关联与时间召回仍能找到它；嵌入服务可用后，可在 Mnemon Native 嵌入设置的「测试状态」中补齐。补齐使用 DSH 的存储根目录和嵌入设置，在终端运行的 `mnemon` 命令两者都未必一致。根 Agent 在 `mnemon_remember` 的结果中能读到这两项。
- `/mnemon remember` 加一行：未生成向量：嵌入没有成功，这条记忆暂时不参与语义匹配。嵌入服务可用后，可在 Mnemon Native 嵌入设置的「测试状态」中补齐。
- 「存入记忆」的回执以提醒色加上同样一行，对话中和记忆空间页上都是，无论记忆由任务 Agent 写入，还是直接写入某个空间。
- 只有写入确实存入了记忆时才显示这一行：以重复而跳过结束的运行不会提到向量。

审查改动了第一版的三处。它的提示建议执行 `mnemon --store <id> embed --all`，这条命令除非用 `--data-dir` 指明 DSH 的存储根目录，否则作用于默认数据目录，也不带 DSH 管理的嵌入设置：对着另一个目录运行时，它回答所有记忆都已有向量，还额外创建了一个空 Store。它的那一行说嵌入服务没有响应，而缺少模型时回执也一样。写入子 Agent 的人设还要求摘要重复这一行已经说过的内容。之后对 #392 改动的审查发现，「只有关键词召回能找到」把损失说重了：Mnemon 的召回还能经由关联和时间找到这条记忆，缺少的只是语义匹配。`5a371060` 在这一行和提示中改为这样说，下面的截图也在它上面重新拍摄。

下一步所指的「测试状态」下的 **补齐**，随 issue #392 的改动一起提供；那项改动在那里列出每个空间的向量。

## 方法

1. `pnpm e2e:serve --exact-id`：发送一条消息后，执行 `/mnemon remember 预发集群的 Grafana 在 3300 端口，排查监控问题时先看它。`，并展开命令所在的行。脚本化的写入子 Agent 列出空间，调用一次 `mnemon_remember`。
2. `pnpm e2e:serve --save-action`：在助手回复上点 **存入记忆**，再点 **交给任务 Agent**。脚本化的任务 Agent 新建一个空间 Release notes，把回复写进去。随后再次打开对话框，把内容改成 `Release approvals need two maintainers.`，**保存到** 选 Release notes，点 **保存**：直接写入这个空间，不经过 Agent。

只有模型决策是脚本化的；DSH、子 Agent、对话框以及经真实 CLI 完成的每次 Mnemon Native 写入都是真实运行。基线使用同一构建，只把 `src/host/subagent.ts`、`src/host/commands.ts`、本次改动涉及的客户端文件和记忆空间页的客户端文件换成 main 的版本。

## 修复前后

| | main | 修复后 |
|---|---|---|
| `/mnemon remember` | ![命令所在的行：added、空间 default 和写入子 Agent 的摘要](./before-command.jpg) | ![同一行下面多了「未生成向量」一行](./after-command.jpg) |
| 经任务 Agent **存入记忆** | ![已存入和任务 Agent 的摘要](./before-save-agent.jpg) | ![同样的回执下面多了「未生成向量」一行](./after-save-agent.jpg) |
| 直接 **存入记忆** 到某个空间 | ![已存入记忆空间“Release notes”](./before-save-direct.jpg) | ![同样的回执下面多了「未生成向量」一行](./after-save-direct.jpg) |

main 上，每个回执读起来都像已经有了向量的写入。修复后，每个回执都说明这条记忆暂时没有向量、这对召回意味着什么，以及在哪里补齐。这一行以较小的字号和提醒色放在回执行下面，结果和查看记忆的入口仍在原处。

## 自动化检查

- `tests/subagent.spec.ts`：回执为 `embedded: false` 的写入，在 `unembedded` 中列出这条记忆并附上提示，提示指向「测试状态」而不是终端命令；`embedded: true` 的写入两个字段都没有；回执混杂且含有重复跳过的运行，只列出没有向量的那条记忆。
- `tests/commands.spec.ts`：`/mnemon remember` 对已存入的写入加上这一行，对跳过的写入不加。
- `tests/client-interaction-surfaces.spec.tsx`：对话中的「存入记忆」，对任务 Agent 的结果和直接写入 Mnemon Native 空间都显示这一行；有向量的记忆不显示，结果为跳过时也不显示。
- `tests/client.spec.tsx`：记忆空间页的对话框，对任务 Agent 的结果和按约束写入都显示这一行，有向量的记忆不显示。
- `tests/client-presentation.spec.ts`：加上新的一行后，文案基线仍是每种语言 1,323 个键。

八个新测试中有五个在 main 上失败；在 main 上通过的三个，守护的是不该出现这一行的地方不会出现。

## 限制

- issue 的第二项要求，在 `mnemon embed --status` 中列出缺少向量的记忆，属于 Mnemon CLI：它的状态只报告数量。设置页显示的覆盖率由 issue #392 处理。
- dsh-mnemon 不会自动补齐向量：回执说明了在哪里补齐，服务可用后由用户点 **补齐**。
- Mnemon Native 之外的 Provider 不报告 `embedded` 字段，它们的回执与以前相同。
- 把 MEMORY.md 条目归档到空间（`mnemon import`）时不报告 `embedded` 字段，View Action 写入只返回 Mnemon 自己的 `embedded: false`、不带提示；它们的覆盖率可以在「测试状态」中查看。
