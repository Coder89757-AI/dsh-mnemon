# 空闲审查与任务 Agent 的统一叫法

[English](./README.md)

界面里同一个功能有三种叫法。设置项叫**空闲审查**，失败后状态页的提示却是**后台审查失败**。分层策略页面的**后台任务**卡片把干活的 Agent 叫任务 Agent（**任务 Agent 模型**），存入记忆和记忆页面上的**任务 Agent 就绪**标签也这样叫，而紧挨着的审查设置却说“子代理”，并提供**受限子代理审查**。Agent Teams 的默认选项仍写作**暂停审查（兼容旧版）**，这是受限审查出现之前留下的标注。本改动让它们都采用界面其他地方的叫法。其余不变：已保存的设置（`idleReview.provider`、`idleReview.agentTeams: pause | scoped`）的值与含义都保持原样。

测试版本：分支 `claude/idle-review-wording`，基于 [#386](https://github.com/omdsh-dev/dsh-mnemon/pull/386)（`9a09c89e`）。2026-10-17 在 DSH 0.2.1-rc.1 上的 e2e 夹具中截取，headless Chrome，zh-CN，浅色。

| 改动前 | 改动后 |
|---|---|
| ![审查设置：说明写“子代理”，Agent Teams 菜单提供“暂停审查（兼容旧版）”与“受限子代理审查”](./review-before.jpg) | ![同一设置：说明写“任务 Agent”，菜单提供“暂停审查”与“受限任务 Agent 审查”](./review-after.jpg) |
| ![状态页提示标题为“后台审查失败”](./status-before.jpg) | ![状态页提示标题为“空闲审查失败”](./status-after.jpg) |

| 位置 | 改动前 | 改动后 |
|---|---|---|
| 状态页提示标题 | 后台审查失败 / Background review failed | 空闲审查失败 / Idle review failed |
| 审查方式的说明 | 子代理只读取有界的检查点 / A child reads a bounded checkpoint；子代理带着完整的父上下文 / A child with the full parent context | 任务 Agent 只读取有界的检查点 / The task Agent reads a bounded checkpoint；任务 Agent 带着完整的父上下文 / The task Agent has the full parent context |
| Agent Teams 选项 | 暂停审查（兼容旧版）/ Pause review (legacy compatible)；受限子代理审查 / Scoped child review，在受限子代理中审查，不用 Teams 工具 / Reviews in a scoped child without Teams tools | 暂停审查 / Pause review；受限任务 Agent 审查 / Scoped task Agent review，由受限的任务 Agent 审查，不用 Teams 工具 / A scoped task Agent reviews, without Teams tools |
| Teams 暂停审查时的状态说明 | 提到“受限子代理审查 / Scoped child review” | 提到“受限任务 Agent 审查 / Scoped task Agent review” |
| fork 审查失败后的上下文窗口提示 | 任务模型 / a task model | 任务 Agent 模型 / a task Agent model，即设置项本身的名称 |

两种语言的文档在原先写“后台审查”“空闲复盘”（英文 background review）的地方都改为“空闲审查”（idle review），并引用新的选项名。发布说明与早期记录保留当时的叫法。

## 检查

- `tests/client-settings.spec.tsx` 与 `tests/client.spec.tsx` 选择并读取改名后的选项和提示；`tests/client-presentation.spec.ts` 记录新的文案指纹（每种语言 1,346 个键）。
- DSH 0.2.1-rc.1 上的 `review-card` 与 `idle-review` WebUI 场景读取了上图中的菜单与提示，浏览器控制台没有错误。
- `pnpm run verify:docs`：所有链接与锚点都能解析；没有改动被其他页面链接的标题。
