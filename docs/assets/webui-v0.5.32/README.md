# v0.5.32 Light WebUI, live model / v0.5.32 浅色界面，真实模型

Captured on **2026-10-17 (Asia/Shanghai)** from a real local DSH 0.2.1-rc.2 WebUI in **light** appearance, in English and Chinese, with the **live DeepSeek model** answering. [English guide](../../en/guides/ui-guide.md) · [中文指南](../../zh-CN/guides/ui-guide.md) · [Media index](../README.md) · [Manifest](./manifest.json)

本组素材于 **2026-10-17（Asia/Shanghai）**从真实本地 DSH 0.2.1-rc.2 WebUI 采集，中英文均为**浅色**界面，由**真实的 DeepSeek 模型**作答。

![A question answered from working memory, Project Documents and Memory Spaces; the turn memory bar opens the document it read](./en/recall.gif)

## Recordings / 录制

| Flow / 流程 | English | 简体中文 |
|---|---|---|
| Recall: an answer that uses memory, and one click to what it read / 召回：用到记忆的回答，一键打开读到的内容 | [recall.mp4](./en/recall.mp4) · [GIF](./en/recall.gif) · 17 s | [recall.mp4](./zh-CN/recall.mp4) · [GIF](./zh-CN/recall.gif) · 15 秒 |
| Save to memory: edit the candidate, see where it can go, the task Agent writes, the receipt leads to the result / 存入记忆：编辑候选内容，查看可以存到哪里，任务 Agent 写入，回执直达结果 | [save.mp4](./en/save.mp4) · [GIF](./en/save.gif) · 39 s | [save.mp4](./zh-CN/save.mp4) · [GIF](./zh-CN/save.gif) · 35 秒 |
| Correct: a correction replaces the runtime entry, and its item opens it / 纠正：替换运行时记忆，点击条目直达 | [correct.mp4](./en/correct.mp4) · 14 s | [correct.mp4](./zh-CN/correct.mp4) · 13 秒 |
| Memory System: the four pages, the graph and an Agent answer with citations / 记忆系统：四个页面、图谱与带引用的 Agent 回答 | [memory.mp4](./en/memory.mp4) · [GIF](./en/memory.gif) · 29 s | [memory.mp4](./zh-CN/memory.mp4) · [GIF](./zh-CN/memory.gif) · 28 秒 |
| Plugins: DSH's Plugins page, then composition, component pages and storage / 插件：DSH 的插件页，再到记忆组合、组件页与存储 | [plugins.mp4](./en/plugins.mp4) · [GIF](./en/plugins.gif) · 25 s | [plugins.mp4](./zh-CN/plugins.mp4) · [GIF](./zh-CN/plugins.gif) · 25 秒 |

Frames are Chrome screencast frames played at their own timestamps (H.264, 30 fps, no audio); the GIFs are 880 px at 8 fps. Waits for the model play faster, with a badge in the lower right corner: 4x for chat replies, 6x for the task Agent and the Agent answer. The save recording joins four consecutive segments; the pauses between them, while its screenshots were taken, are left out. A drawn cursor ring shows where each click lands; there is no composited UI.

画面来自 Chrome 屏幕录制，按原始时间戳播放（H.264，30 fps，无音轨）；GIF 为 880 像素、8 fps。等待模型的片段加速播放，右下角有标记：对话回复 4 倍速，任务 Agent 与 Agent 查询 6 倍速。存入记忆的录制由四段连续操作拼接而成，只去掉了中间截图时的停顿。画面中绘制的光标圆环指示点击位置，没有拼接的界面。

## What changed since v0.5.19 / 与 v0.5.19 相比的变化

The [v0.5.19 gallery](../webui-v0.5.19/README.md) was captured on DSH 0.1.7-rc.2 and stays as a dated record. This one keeps its flows and screen names and adds two screens.

[v0.5.19 图集](../webui-v0.5.19/README.md)采集于 DSH 0.1.7-rc.2，作为带日期的记录保留。本图集保留它的流程与截图名称，并新增两张截图。

- **Sidebar.** Settings moved under **More**, and DSH added **Automation tasks**. / **侧边栏**：设置移到**更多**中，DSH 新增了**自动化任务**。
- **Plugins page.** DSH 0.2.1 groups plugins into built-in plugin settings, experimental plugins and **Installed plugins**, where dsh-mnemon is listed (new screen `plugins-list`). / **插件页**：DSH 0.2.1 把插件分为内置插件配置、实验性插件与**已安装插件**，可组合记忆列在已安装插件中（新增截图 `plugins-list`）。
- **dsh-mnemon's page.** The breadcrumb reads **Plugins**; Storage has a **Git sync** row; DSH 0.2.1's component list has nine rows, without the Starter's readiness and group rows. / **可组合记忆页面**：面包屑为**插件**；存储中新增 **Git 同步**一行；DSH 0.2.1 的组件列表共九行，不再有 Starter 的就绪条目与分组条目。
- **Layered strategy's page.** **Write runtime memory** is new, and **Task Agent model** offers **Follow global**. / **分层策略页面**：新增**写入运行时记忆**，**任务 Agent 模型**提供**跟随全局**。
- **Save to memory.** The dialog has **Save to**: the task Agent decides by default, or working memory, the user profile or an active Memory Space (new screen `chat-save-target`). / **存入记忆**：对话框新增**保存到**：默认由任务 Agent 决定，也可以选工作记忆、用户画像或某个已激活的记忆空间（新增截图 `chat-save-target`）。
- **Receipts and model.** A save reports when the memory has no vector yet; the model shows as DeepSeek-V4.1-Flash. / **回执与模型**：记忆暂时没有向量时，存入的回执会写明；模型显示为 DeepSeek-V4.1-Flash。

## Environment and data / 环境与数据

| Item / 项目 | Capture environment / 采集环境 |
|---|---|
| Product / 产品 | dsh-mnemon at `64933532`, the source of 0.5.32; the Plugins page shows the package version 0.5.31 it had when captured / 即将发布为 0.5.32 的源码，插件页显示采集时的包版本 0.5.31 |
| Host / 宿主 | Published DSH 0.2.1-rc.2 (npm `next`); no Host source modifications / 正式 DSH 包（npm `next`），未修改宿主源码 |
| Model / 模型 | DeepSeek API, `deepseek-flash` (DeepSeek-V4.1-Flash in the WebUI), for the conversation, the task Agent and the Agent answer / 对话、任务 Agent 与 Agent 查询均使用 |
| Runtime / 运行环境 | macOS 15.6, Node.js 24.19.0, Mnemon CLI 0.2.10 |
| Browser / 浏览器 | Headless Google Chrome 155 over the DevTools protocol, light color scheme / 通过 DevTools 协议驱动的无头 Chrome 155，浅色 |
| Desktop / 桌面 | 1280 × 800 at 2x, stored 1920 px wide; 24 screens per locale; the Plugins page at 1280 × 858 so the whole page fits / 2 倍像素采集，保存为 1920 像素宽；每种语言 24 张；插件页以 1280 × 858 截取，整页可见 |
| Phone / 窄屏 | 390 × 844 at 2x; 3 screens per locale / 2 倍像素；每种语言 3 张 |
| Data / 数据 | A fictional project, Lumen: 3 profile and 5 working-memory entries, 5 active and 1 archived document, 3 native memory spaces (2 active) with 17 memories / 虚构项目 Lumen：3 条用户画像与 5 条工作记忆，5 份活跃档案与 1 份归档，3 个原生记忆空间（2 个激活）共 17 条记忆 |
| Embedding / 嵌入 | Off, as a default install has it, with no embedding service; see below / 与默认安装一样关闭，也没有嵌入服务；见下文 |

Each locale is one pass over a fresh fixture: `node scripts/serve-e2e.mjs --docs-demo --live-model` (Chinese) or `--docs-demo=en --live-model` (English) seeds a disposable Profile through the Sources' own management operations, then the WebUI talks to the DeepSeek API with a key read from `DEEPSEEK_API_KEY`. The questions are typed; the model decides which memory tools to call, the task Agent performs Save to memory and the Agent answer, and every reply, write and receipt is the model's own. Another run words things differently and may read other documents. Embedding is off in this capture, so each save reports that the memory has no vector yet; semantic matching needs an embedding service, set up in the Mnemon Native embedding settings on [Memory Spaces' page](../../en/guides/ui-guide.md#memory-spaces-page). No personal memory or credentials appear, and the storage path shown is the fixture's temporary directory.

每种语言都在全新的夹具上完整走一遍：`node scripts/serve-e2e.mjs --docs-demo --live-model`（中文）或 `--docs-demo=en --live-model`（英文）先通过各 Source 自己的管理操作预置一次性 Profile，再由 WebUI 通过 `DEEPSEEK_API_KEY` 中的密钥调用 DeepSeek API。问题是逐字输入的；模型自己决定调用哪些记忆工具，任务 Agent 完成存入记忆与 Agent 查询，每条回复、写入与回执都由模型生成。再次运行时措辞会不同，读到的档案也可能不同。本次采集未开启嵌入，因此每次存入都会提示这条记忆暂时没有向量；语义匹配需要嵌入服务，可在[记忆空间页面](../../zh-CN/guides/ui-guide.md#memory-spaces-page)的 Mnemon Native 嵌入设置中配置。素材中没有个人记忆或凭据，界面中显示的存储路径是夹具的临时目录。

## Screens / 截图

| Surface / 场景 | English | 简体中文 |
|---|---|---|
| Answer with the turn memory bar's items / 回合记忆栏列出读到的内容 | [chat-recall](./en/chat-recall.jpg) | [chat-recall](./zh-CN/chat-recall.jpg) |
| Save to memory: the candidate / 存入记忆：候选内容 | [chat-save](./en/chat-save.jpg) | [chat-save](./zh-CN/chat-save.jpg) |
| Save to memory: where it can go (new) / 存入记忆：可以存到哪里（新增） | [chat-save-target](./en/chat-save-target.jpg) | [chat-save-target](./zh-CN/chat-save-target.jpg) |
| Save to memory: the task Agent's receipt / 存入记忆：任务 Agent 的回执 | [chat-save-receipt](./en/chat-save-receipt.jpg) | [chat-save-receipt](./zh-CN/chat-save-receipt.jpg) |
| A correction and its writes / 纠正及其写入 | [chat-correction](./en/chat-correction.jpg) | [chat-correction](./zh-CN/chat-correction.jpg) |
| Status / 状态 | [memory-status](./en/memory-status.jpg) | [memory-status](./zh-CN/memory-status.jpg) |
| Runtime memory, opened from a turn / 从回合打开的运行时记忆 | [memory-runtime](./en/memory-runtime.jpg) | [memory-runtime](./zh-CN/memory-runtime.jpg) |
| Project Documents, opened from a turn / 从回合打开的项目档案 | [memory-documents](./en/memory-documents.jpg) | [memory-documents](./zh-CN/memory-documents.jpg) |
| Memory Spaces / 记忆空间 | [memory-spaces](./en/memory-spaces.jpg) | [memory-spaces](./zh-CN/memory-spaces.jpg) |
| Graph with an entity selected / 选中实体的图谱 | [memory-graph](./en/memory-graph.jpg) | [memory-graph](./zh-CN/memory-graph.jpg) |
| Direct search / 直接检索 | [memory-recall](./en/memory-recall.jpg) | [memory-recall](./zh-CN/memory-recall.jpg) |
| Agent answer with citations / 带引用的 Agent 回答 | [memory-agent](./en/memory-agent.jpg) | [memory-agent](./zh-CN/memory-agent.jpg) |
| Content with the saved memory / 内容中新存入的记忆 | [memory-content](./en/memory-content.jpg) | [memory-content](./zh-CN/memory-content.jpg) |
| Entities / 实体 | [memory-entities](./en/memory-entities.jpg) | [memory-entities](./zh-CN/memory-entities.jpg) |
| Save to memory on Memory Spaces / 记忆空间中的存入记忆 | [memory-remember](./en/memory-remember.jpg) | [memory-remember](./zh-CN/memory-remember.jpg) |
| DSH's Plugins page, dsh-mnemon under Installed plugins (new; 1280 × 858) / DSH 的插件页，可组合记忆位于“已安装插件”（新增；1280 × 858） | [plugins-list](./en/plugins-list.jpg) | [plugins-list](./zh-CN/plugins-list.jpg) |
| dsh-mnemon's page: Memory composition / 可组合记忆页面：记忆组合 | [plugin-composition](./en/plugin-composition.jpg) | [plugin-composition](./zh-CN/plugin-composition.jpg) |
| Main strategy selector / 主策略选择器 | [plugin-strategy-menu](./en/plugin-strategy-menu.jpg) | [plugin-strategy-menu](./zh-CN/plugin-strategy-menu.jpg) |
| Layered strategy's page / 分层策略页面 | [plugin-layered](./en/plugin-layered.jpg) | [plugin-layered](./zh-CN/plugin-layered.jpg) |
| Memory Spaces' page: Providers / 记忆空间页面：Provider | [plugin-spaces](./en/plugin-spaces.jpg) | [plugin-spaces](./zh-CN/plugin-spaces.jpg) |
| Storage and Interface / 存储与界面 | [plugin-storage](./en/plugin-storage.jpg) | [plugin-storage](./zh-CN/plugin-storage.jpg) |
| Backup import preview / 备份导入预览 | [plugin-backup-preview](./en/plugin-backup-preview.jpg) | [plugin-backup-preview](./zh-CN/plugin-backup-preview.jpg) |
| DSH's component list / DSH 组件列表 | [plugin-rows](./en/plugin-rows.jpg) | [plugin-rows](./zh-CN/plugin-rows.jpg) |
| DSH's page for a component / DSH 组件页面 | [plugin-row-page](./en/plugin-row-page.jpg) | [plugin-row-page](./zh-CN/plugin-row-page.jpg) |
| Phone: conversation / 窄屏：对话 | [narrow-chat](./en/narrow-chat.jpg) | [narrow-chat](./zh-CN/narrow-chat.jpg) |
| Phone: Memory Spaces / 窄屏：记忆空间 | [narrow-spaces](./en/narrow-spaces.jpg) | [narrow-spaces](./zh-CN/narrow-spaces.jpg) |
| Phone: composition / 窄屏：记忆组合 | [narrow-plugin](./en/narrow-plugin.jpg) | [narrow-plugin](./zh-CN/narrow-plugin.jpg) |

## Validation / 校验

Both locales were captured with no browser console errors, and each screen, recording, reply, receipt and Agent answer was checked by eye for the intended state. The manifest records every file's viewport, dimensions, duration, size and SHA-256, and what each turn read or wrote. The gallery holds 72 media files, 21.8 MB. In the Chinese pass, Ask Agent's recall returned four of the five memories that mention ClickHouse and left out the September 12 incident, so the answer says its evidence records no incident; the English pass cites it. The manifest notes this with the run. The capture reflects the stated revision, model and environment only; it does not measure model accuracy, cover live third-party Providers or DSH 0.2.0, or establish complete phone support.

两种语言采集过程中浏览器控制台均无错误，每张截图、每段录制，以及每条回复、回执与 Agent 回答都经过人工检查。manifest 记录了每个文件的视口、尺寸、时长、大小与 SHA-256，以及每一轮读到和写入的内容。本图集共 72 个媒体文件，21.8 MB。中文这一遍里，Agent 查询召回了提到 ClickHouse 的五条记忆中的四条，没有包括 9 月 12 日的事故，因此回答说证据中没有事故记录；英文这一遍引用了它。manifest 在这一遍的记录中注明了这一点。本组素材只代表上述版本、模型与环境，不衡量模型准确率，不涉及在线第三方 Provider 或 DSH 0.2.0，也不代表完整的手机端支持。
