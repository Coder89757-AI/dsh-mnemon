# 不再读成「什么都没有」的工具回答 — issue #390

[English](./README.md) | [验证记录](./verification.json)

issue #390 列出了在一台机器上测得的十一处工具回答：它们不会报错，却会让人得出错误的结论，或者工具与 Mnemon CLI 的说法不一致。本修改处理其中属于 dsh-mnemon 工具的部分：

| 条目 | issue 观察到的情况 | 在哪里修复 |
|---|---|---|
| 1 | 同一回合的第二次项目档案搜索返回 `notRun` 和空列表 | #389 的修改（`budgetExhausted`） |
| 2 | 写错的 View id 与缺失的 Route 或 Offer 报同样的错，完整 id 的格式只出现在注入的信封里 | 本修改 |
| 3 | `mnemon_related` 返回的大多是时间边和实体边的关联记忆 | 本修改，部分处理：工具说明在 Mnemon Native 中每个关联记忆都标明边的类型，以及如何只沿一种边查找 |
| 4 | `mnemon_forget` 对 View 之外的空间给出笼统的拒绝，而 CLI 直接删除了 | 本修改 |
| 5 | 不带 `--store` 的 CLI 只读取它的默认 Store | Mnemon CLI |
| 6 | `mnemon_memory_bodies` 没有数量 | 不修改：面向模型的目录有意不含统计数据，这些在 WebUI 上 |
| 7 | 项目档案和记忆由不同的工具搜索，两者都没有说明 | 本修改 |
| 8 | `mnemon_document_create` 返回了全部项目档案 | 本修改 |
| 9 | `mnemon_status` 没有说明它的合计包含哪些空间 | 本修改 |
| 10 | 没有工具与 CLI 命令的对照表 | 本修改 |
| 11 | 写入没有结构化的落点 | #387 的修改（来自回执的 `memoryBodyIds`） |

基线：main `4feee034`。修复：`34c0f5e6`，审查后为 `2647d5da`。运行于 2026-10-17（Asia/Shanghai），macOS 15.6 arm64，Node 24.19.0。

## 修复

- **View id（2）。** `mnemon_view_route` 与 `mnemon_view_action` 拒绝 View 未提供的 id 时，只说出模型的信封里展示的内容。在默认产品中，每个 Route 和 Offer 都绑定到一个具名工具，不出现在 `MNEMON VIEW ROUTES` 中，所以它们的简写会指向那个工具（`this View offers it as mnemon_remember, so call that tool`）。信封列出的 id 的简写会给出完整 id。其他情况会列出信封展示的 id（与简写相同的排在前面），或说明没有按 id 提供的操作。没有传入 id 的调用会说明这一点。核心层保持 main 的报错，由知道绑定关系的 Host 区分这些情况。
- **遗忘（4）。** 指定了本回合 View 不读取的空间时，遗忘会说出是哪个空间以及原因。空间未激活：是否激活由用户在记忆空间页面决定，激活后从下一回合起才能在其中遗忘。空间的 Provider 已关闭，或 Native 空间没有安装 CLI，也会说明。在本回合开始之后才激活的空间，从下一回合起可以遗忘。不存在的空间会被说明不存在。笼统的拒绝只在确实有未激活的空间时才列出它们。
- **检索（3、7）。** `mnemon_recall` 与 `mnemon_document_search` 各自说明搜索什么、对方的条目由哪个工具查找；召回还说明，对于冷归档的档案，它只能找到归档时留在空间里的索引记忆。对于 Mnemon Native，`mnemon_related` 说明每个关联记忆标明了 `edgeType`，时间边和实体边由系统自动添加、数量远多于其他边，可以用 `edge` 只沿一种边查找。其他 Provider 不标明边的类型，也不按 `edge` 筛选，工具也写明了这一点。
- **项目档案写入（8）。** 原来的回执带着全部项目档案的快照，包括摘录和绝对路径，随档案层增长。现在写入项目档案后，返回给模型的是它写入的那份档案（带 `contentHash`，不含刚发送的正文，也不含路径），以及 `documents` 中该层的合计。经由 `mnemon_view_action` 的写入也做同样的精简。WebUI 仍从控制面读取完整目录。
- **状态（9）。** 合计带有 `scope` 与 `spaces`：它只合计已激活、正常且 Provider 提供统计数据的空间，并给出空间数；`totalInsights` 统计未遗忘的记忆，`deletedInsights` 统计 Provider 保留下来的已遗忘记忆（Mnemon Native 会保留）。
- **能力（10）。** 接口参考新增模型工具与 Mnemon CLI 命令的对照表，说明各自作用的对象。它说明 CLI 的 `--store`、`--data-dir` 与 `MNEMON_DATA_DIR` 如何访问 dsh-mnemon 的记忆；在那里用 `mnemon store create` 建的 Store 会显示为未激活的空间；用 `mnemon store remove` 删除的 Store，会在 dsh-mnemon 下一次检查状态时以空 Store 的形式回来。

## 方法

[harness/probe390.probe.ts](./harness/probe390.probe.ts) 在组合夹具上运行已注册的工具：一个 Holographic 空间、四份项目档案和一个固定的 View。它通过 `mnemon_document_create` 创建一份档案，用简写 `search` 和一个 View 从未提供的 id 调用 `mnemon_view_route`，用简写 `remember` 调用 `mnemon_view_action`，并读取 `mnemon_status`。对每一条拒绝，它都检查消息是否说出了模型信封里没有展示的 id。

[harness/archive-fixture.probe.ts](./harness/archive-fixture.probe.ts) 把模型读到的回执交给 `pnpm e2e:serve --document-archive` 的脚本模型。创建与更新经由 `mnemon_document_manage` 在真实的项目档案层上运行；归档使用真实的项目档案归档，并带上 Host 构建的 lineage，因为 Host 的索引需要模型。脚本模型断言 lineage 的摘要就是它写入的那份档案的内容哈希。

两个探针分别在修复后、main 和第一版 `34c0f5e6` 上运行，`src/host/tools.ts`、`src/host/view-presentation.ts`、`src/core/composition.ts` 以及记忆空间的 view model 与 Source 都取自对应版本。

## 修复前后

| 情况 | main | 第一版 | 修复后 |
|---|---|---|---|
| 5 份档案时的 `mnemon_document_create` | 4,832 字节：正文、全部档案的 `snapshot`、绝对路径 | 458 字节：没有正文和绝对路径，有存储根目录下的 `relativePath`，没有 `contentHash` | 480 字节：没有正文和路径，有 `contentHash` |
| 用 `search` 调用 `mnemon_view_route` | `memory View Route is unavailable: search` | 说出 `"source:mnemon-source-documents/search"`，一个信封隐藏的 id | `…; this View offers it as mnemon_document_search, so call that tool` |
| 用 `source:nowhere/undeclared` 调用 `mnemon_view_route` | `memory View Route is unavailable: source:nowhere/undeclared` | 列出四个 Route id，全都是隐藏的 | `…; MNEMON VIEW ROUTES offers none by id this turn, only the named tools in MNEMON VIEW TOOLS` |
| 用 `remember` 调用 `mnemon_view_action` | `memory ActionOffer is unavailable: remember` | 说出隐藏的 `"source:mnemon-source-memory-spaces/remember"` | `…; this View offers it as mnemon_remember, so call that tool` |
| `mnemon_status` 的合计 | 只有数量 | `scope`：已激活且正常的空间 | `scope`：已激活、正常且 Provider 提供统计数据的空间，`spaces: 1` |
| `--document-archive` 脚本模型 | `tool-archive-completed` | 失败：lineage 的摘要没有可比对的 `contentHash` | `tool-archive-completed` |

遗忘的拒绝信息由下面的记忆空间 Source 测试展示，经由一个基于 Provider 夹具的真实 View。

## 自动化检查

- `tests/default-three-tier-host.spec.ts`，在带有一个外部 Source 的 View 上经由已注册的工具：
  - 绑定的 Route 或 Offer 的简写指向对应工具，外部 Route 的简写给出完整 id，未知 id 列出信封展示的内容，所有 Offer 都已绑定时说明没有按 id 提供的 Action，没有传入 id 的调用会说明这一点；所有消息都不会说出隐藏的 id；
  - 两个 Source 的 Route 结尾相同时，简写可能指向的 id 排在所列十二个的最前面；
  - 经由 `mnemon_view_action` 写入项目档案时，返回精简的结果。
- `tests/document-protection.spec.ts`：
  - Source Action 路径与根 Agent 路径都返回精简的回执，带 `contentHash`，没有正文，也没有工作区或存储根目录下的路径；
  - 归档保留它的 lineage，其摘要就是交给模型的 `contentHash`；
  - 完整的档案仍被保存并可读取。
- `plugins/dsh-mnemon-source-memory-spaces/tests/source.spec.ts`，在一个基于 Provider 夹具的真实 View 上：
  - 没有未激活的空间时，笼统的拒绝不列出任何空间；
  - 空间取消激活后，指定它的遗忘会说明是否激活由用户决定、从下一回合起生效，笼统的拒绝也会列出它；
  - 在回合中重新激活后，它仍在固定的 View 之外，下一回合的遗忘可以成功；
  - 不存在的空间会被说明不存在。
- `plugins/dsh-mnemon-source-memory-spaces/tests/view-model.spec.ts`：合计带有它的范围，只计入有统计数据的空间；没有统计数据的 Provider 计为正常，但不增加合计。

全部八个新增或修改的测试，在使用 main 的源码时都失败；使用第一版的源码时有七个失败，Source Action 创建的精简回执在第一版上也通过。

## 审查

独立审查发现第一版有以下问题：
- 精简回执去掉了 `contentHash`，导致 `--document-archive` 的 e2e 脚本模型失败；
- 拒绝信息说出了信封藏在具名工具后面的 id，模型照着做就会绕过写入任务 Agent 直接写入；
- 让模型先激活空间再遗忘的建议在同一回合内无效，还会永久改变用户的设置；
- `mnemon_related` 声称所有 Provider 都标明边的类型；
- CLI 对照表有三处错误；
- 合计的范围忽略了没有统计数据的 Provider。

`2647d5da` 修复了全部问题。

## 限制

- 条目 5 属于 Mnemon CLI，条目 6 是对面向模型目录的有意限制；能力对照表说明了两者。
- 不传 `edge` 时，`mnemon_related` 仍会遍历所有类型的边；只修改了它的说明。
- 信封隐藏的完整 id 仍可以经由通用工具运行，与 main 相同；拒绝信息不再透露这样的 id。
- 没有重新在浏览器中运行 `pnpm e2e:serve --document-archive`；改为让它的脚本模型读取工具的回执。
- 对话中项目档案写入的活动行仍用标题指代这次写入，与之前相同。
