# 文档结构整理

[English](./README.md)

2026-10-17（Asia/Shanghai）基于 `main` `3b33e07e`（v0.5.31 发布版本）完成。改动只涉及文档，外加 13 个脚本各一行头部注释；代码、设置、格式与模型可见的文本都没有变化。另外按维护者的要求补了一处：备份与 Git 同步两节写明它们涵盖哪些 Source。

## 为什么

一份写于 #386、#410 与 #412 之前的文档审计指出了三类问题：

- **循环。** 入门指南一开头就是命令行安装、开发检出、云端访问与 Headless；安装与启动又把命令行读者送回那里，两页互相重复对方的命令。
- **重复。** Git 同步、任务 Agent 模型、存储范围、安装与升级命令、pnpm 的 24 小时规则以及检查版本，各在三到八个地方出现，内容随之各自走样。
- **读者混杂。** 运维指南把 Host 内部机制和用户操作放在一起；兼容性页面把升级步骤放在宿主说明与证据之后；开发指南按每个选项一段文字罗列测试夹具，还有七个选项只在记录里出现。

每一项审计意见都先对照了当前代码树。#386 已经让兼容性页面成为受支持 DSH 版本的唯一说明处，#410 统一了空闲审查的叫法，#412 补全了各个索引并修好 README 与 SECURITY 的链接；这些不在此重复。

## 内容移到了哪里

| 原位置 | 新位置 | 原处保留 |
|---|---|---|
| 入门指南第 1 节：前提、安装 DSH、Web profile、开发检出、Headless、更新与卸载、云端访问 | 安装与启动的[第 7 节 命令行与 Headless](../../zh-CN/guides/installation.md#7-命令行与-headless)，含“Headless”“更新与卸载”“云端访问”三个小节 | 入门指南开头的一句话；其余步骤重新编号为 1 到 5 |
| 入门指南第 1 节的“任务 Agent 如何启动” | [Provider 要求](../../zh-CN/reference/configuration.md#provider-要求)，并补上它唯一缺少的事实：固定的 `mnemon_subagent_result` 工具与为每个子 Agent 签发的 `requestId` | 第 7 节前提中的链接 |
| 兼容性页面的“首次安装时的宿主行为” | 安装与启动第 3 步（安装源的选择、英文的卡片简介）与常见问题（24 小时规则） | 页面开头的一句指引 |
| 兼容性页面的“升级默认安装”与“升级顺序” | 页面顶部，紧接受支持的版本之后 | — |
| 兼容性页面的证据段落与“其他记录” | 页末新的[验证与证据](../../zh-CN/reference/compatibility.md#验证与证据)一节 | — |
| 运维指南的“进程”“文件”“Web 与模型” | [架构设计的安全边界](../../zh-CN/development/architecture.md#安全边界) | 简短概述、“不是秘密扫描器”的提醒与“安全问题报告” |
| 运维指南的“文档归档恢复”与“运行时归档恢复” | [生命周期与流程](../../zh-CN/reference/workflows.md)中各自所属的归档流程之下 | 带链接的“归档失败时” |
| 运维指南的“停用完整 Starter”（原在云端 WebUI 之下） | 独立一节，位于云端 WebUI 之前 | — |
| 运维指南的“旧会话恢复”（原为第二节） | 故障排查之后 | — |
| 运维指南中关于整理的段落，以及界面指南中关于整理的三条 | 新的[记忆整理](../../zh-CN/guides/operations.md#记忆整理)小节，改为列表 | 界面指南中的一条 |
| 开发指南中每个 `serve-e2e` 选项一段文字 | [夹具选项表格](../../zh-CN/development/README.md#夹具选项)：选项、准备了什么与要发送的消息、Issue、记录 | 完整步骤与修复前后的结果，见各自的记录 |

此前只在记录中说明的七个选项现在都在表格里：`--better-sidebar`、`--document-protection`、`--result-tool-cache`、`--review-failure`、`--review-layers`、`--runtime-archive` 与 `--runtime-routing`，每一个都对照了 `scripts/serve-e2e.mjs` 及其夹具。表格前的说明写明同一时间只运行一个脚本化模型：同时给出多个时以 `serve-e2e.mjs` 中排在最前的为准，`--live-model` 会关闭它们；也写明哪些选项会在回环地址上启动后端替身。新增的 [scripts/README.md](../../../scripts/README.md) 与其他工具 README 一样只有英文，列出每个脚本与夹具的用途、运行方式、选项与环境变量。开发指南链接了它、[Provider Lab](../../../provider-lab/README.md) 与[升级夹具](../../../tests/fixtures/upgrade/README.md)；两个文档中心各新增一行，链接贡献指南、scripts/README.md 与设计计划。

## 每个主题的唯一归处

| 主题 | 归处 | 其他地方（现为概述加链接） |
|---|---|---|
| 安装、更新与卸载命令 | [安装与启动第 7 节](../../zh-CN/guides/installation.md#7-命令行与-headless) | 兼容性页面的升级步骤、入门指南 |
| pnpm 的 24 小时规则 | [安装与启动的常见问题](../../zh-CN/guides/installation.md#常见问题) | 第 7 节“更新与卸载”、兼容性页面 |
| 检查版本 → 更新 | [运维指南的版本检查与更新](../../zh-CN/guides/operations.md#版本检查与更新) | 安装与启动第 6、7 节，界面指南，兼容性页面（DSH 0.2.1 上的路径） |
| 换用另一个 DSH 版本 | 步骤见[兼容性页面的升级顺序](../../zh-CN/reference/compatibility.md#升级顺序)，各较早宿主应保留的版本见[更早的 DSH](../../zh-CN/reference/compatibility.md#更早的-dsh) | 安装与启动的“升级 DSH” |
| Git 同步 | 使用方法在[运维指南](../../zh-CN/guides/operations.md#git-仓库同步)；凭据顺序、字段与网络回退在[同步通道](../../zh-CN/reference/interfaces.md#同步通道) | README（两句话）、界面指南（卡片的组成部分） |
| 任务 Agent 模型 | [配置参考](../../zh-CN/reference/configuration.md#后台任务-agent-的模型路由)；选项表只保留一行，完整示例写出了 `followConversation` | 界面指南、能力地图 |
| 存储范围 | [配置参考](../../zh-CN/reference/configuration.md#存储范围) | 存储模型、能力地图、入门指南、界面指南 |
| 子 Agent 的 Provider 要求 | [配置参考](../../zh-CN/reference/configuration.md#provider-要求) | 安装与启动第 7 节 |

## 备份与 Git 同步的范围

ZIP 备份与 Git 同步有意只携带 dsh-mnemon 随附的 Source：运行时记忆、项目档案与记忆空间。[备份](../../zh-CN/guides/operations.md#推荐插件页-zip)与 [Git 同步](../../zh-CN/guides/operations.md#git-仓库同步)两节现已用两种语言写明：从其他插件包安装的 Source 既不会备份也不会同步，它的数据由它自己保存。

## 术语与一致性

- 凡是指运行时记忆 Source 的“热记忆”（hot memory），都改为“运行时记忆”（runtime memory）：配置参考、接口参考、存储模型、生命周期与流程、运维指南与 SECURITY.md 的中文部分；README 中的“本地热存储”改为“本地存储”。模型可见的工具描述与界面文案保持原样，它们不属于文档。
- 分层策略的包 README 写明它就是分层策略（Layered strategy），以及它的 type id `default-three-tier`；轻量上下文的 README 把 hot context 改为 runtime memory。
- 备份与 Git 同步两节在指已安装的 Source 时，使用界面上的名称“记忆来源”（memory sources）。
- 每个页面都以“文档中心”/“Documentation”链接文档中心，语言切换统一为简体中文在前，与中文页面和贡献指南原有的顺序一致。插件开发页面是例外：另一个分支会在 `extensions.md` 中加入写给 Source 作者的说明，因此本次不改动它，它仍保留旧的文档中心名称和一处“热记忆”（英文为 hot context）。
- 中文的入门页面改名为“入门指南”，不再与 README 自己的“快速开始”一节同名。
- README 列出全部四种存储范围：全局、按工作区、集中存储以及你指定的目录。
- 中文开发指南统一称“空闲审查”，两种语言对激活测试的 18 个包的计数也一致了。
- `docs/README.md` 只给出一条入门路径：先看安装与启动，再看入门指南。
- 兼容性表格中 Node.js 版本范围里的竖线已转义，GitHub 不再把那一格截断在 `^22.19.0` 处。
- 贡献指南的文档检查清单加入安装与启动和兼容性页面。`.changeset/README.md` 改为指向发布流程的简短说明；发布流程补上空 changeset 的规则，并新增“发布 PR”一节，说明 `.github/release-notes/vX.Y.Z.md`、两份 `docs/*/releases/vX.Y.Z.md` 发布说明、安装与启动中发布当天的示例，以及 `docs/pr-assets/release-vX.Y.Z` 验收记录。
- 验收证据索引要求把可复用工具放进 `scripts/` 或 `tests/`，由记录链接过去。当前的说明已经不再指向记录中的 `installed-dsh*.vitest.config.mjs` 或 `adapt-host-specs.mjs`，对应的工具是 `pnpm run test:installed-dsh`。

## 保留的锚点

来自发布说明、记录、GitHub 与旧页面的链接继续有效。改动过的页面在 `3b33e07e` 时的每一个锚点现在都还在：一个脚本比较了每个改动页面前后的锚点。新增的 `<a id>` 占位：

| 页面 | 占位 |
|---|---|
| 入门指南 | `1-install-and-upgrade-from-the-command-line`、`2-open-the-memory-system`、`3-store-your-first-memories`、`4-use-memory-in-a-conversation`、`5-choose-how-memory-is-composed`、`6-next-steps`；中文：`快速开始`、`1-命令行安装与升级`、`2-打开记忆系统`、`3-保存第一批记忆`、`4-在对话中使用记忆`、`5-选择记忆的组合方式`、`6-下一步` |
| 运维指南 | `process`、`files`、`web-and-model`、`document-archive-recovery`、`runtime-archive-recovery`；中文：`进程`、`文件`、`web-与模型`、`文档归档恢复`、`运行时归档恢复` |
| 兼容性与升级 | `host-behavior-on-a-first-install`、`other-records`；中文：`首次安装时的宿主行为`、`其他记录` |

移动过的标题保持原文，因此 `升级顺序`、`升级默认安装`、`停用完整-starter` 与旧会话恢复的锚点随各自的章节移动。`installation#常见问题` 不变。更早 DSH 版本的表格有了自己的锚点 `更早的-dsh`（英文为 `older-dsh-releases`），原来指向页面标题的链接现在改用它。

## 兼容性

- **发布的文件。** README.md、README.zh-CN.md 与 SECURITY.md 随 `dsh-mnemon` 发布，两份插件 README 分别随 `dsh-mnemon-strategy-default-three-tier` 与 `dsh-mnemon-strategy-light-context` 发布，因此 `.changeset/docs-restructure.md` 为三者各记一个 patch 版本。它们的链接仍是绝对地址，图片不变。
- **脚本。** 13 个脚本各加一行头部注释，它们都不进入 npm 包。作为发布输入的 `scripts/link-bundle-declarations.mjs` 本来就有说明，没有改动。
- **其余都不变**：代码、设置键、持久化格式、RPC 名称、工具名称、模型可见的描述与界面文案都没有改动，不存在版本错位需要处理。
- **记录与发布说明**的内容和路径不变；只有验收证据索引加了一行，并改了关于工具的那一句。

## 验证

使用 CI 的版本 Node 24.19 与 pnpm 10.13.1 运行：

| 命令 | 结果 |
|---|---|
| `pnpm run verify:docs` | 通过：4,511 个本地链接、320 个 Markdown 锚点、双语路径与官方插件覆盖 |
| 把每个改动页面的锚点与 `3b33e07e` 比较 | 没有丢失任何锚点 |
| `git diff --check` | 无问题 |
| `pnpm run typecheck` | 通过 |
| `pnpm exec vitest run tests/docs.spec.mjs tests/release.spec.mjs tests/changesets.spec.mjs tests/package-locales.spec.mjs`（加载改动脚本的测试） | 4 个文件、59 项测试通过 |
| 对改动的 12 个 `.mjs` 脚本运行 `node --check`；`vitest list --config scripts/benchmark-algorithms.config.ts` | 全部可以解析；基准测试配置仍能列出其测量 |
| `node scripts/release.mjs --check` | 通过 |
| `pnpm build` 后运行 `node scripts/verify-package-contents.mjs` | 59 个文件，解包后 1,992,964 字节，低于 2,500,000 字节上限 |
| `pnpm run verify:build`（会运行一个改动过的脚本） | 49 个文件的输出确定一致 |
| 以 base 与 head revision 运行 `pnpm run release:intent` | 已确认 `dsh-mnemon` 与 `dsh-mnemon-strategy-default-three-tier` 的 changeset 覆盖 |

## 没有做的事

- 文档中心的“最新变化”仍由人工撰写：由发布 PR 更新，发布流程现已写明。
- 没有为旧版宿主单独建页：它们在兼容性页面中保留各自的章节。
- 旧会话恢复仍在运维指南中，移到了故障排查之后。
- 开发指南中需要显式启用的测试套件仍是文字段落，因为每一个都需要自己的环境与命令。
- 重新采集图集、验收证据索引的分组，以及记录中重复的模拟服务，属于其他工作。
- 两种语言的插件开发页面 `extensions.md` 都未改动，原因见上文。
- 插件 README 仍只有英文，记录的内容未作改动。
