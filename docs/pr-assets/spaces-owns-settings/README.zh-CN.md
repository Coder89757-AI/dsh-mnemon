# 记忆空间拥有自己的设置与文案

[English](./README.md)

记忆空间的设置原本由 Starter 代为绘制：Provider 列表、只有 Mnemon Native 读取的嵌入设置和 Mnemon Native 这一行都在 `src/client` 中，记忆空间的 122 条文案也在那里，因此记忆空间要改自己的设置，必须等 dsh-mnemon 发布。`ProviderIcon` 与 Provider 标签辅助函数各有两份，同一个 Provider 描述还生成了两套字段表单。本改动把设置与文案交还记忆空间，所有 Provider 字段改由同一个组件绘制，并且无论 profile 运行的是这两个包的哪个版本，都只有一套设置。用户看到和能做的都没有变化：设置、记忆空间的对话框和它的来源列表与 `main` 的渲染结果逐像素、逐元素一致。审计发现的三处差异保持原样，留待以后处理（见[留待以后](#留待以后)）。

测试版本：分支 `claude/spaces-owns-settings`，基于 `main`（`3b33e07e`，v0.5.31），2026-10-17，Node 24.19.0、pnpm 10.13.1，针对锁定的 DSH 0.2.1-rc.1 与已安装的 0.2.0-rc.2。

## 改了什么

**文案。** 122 个键从 `src/client/locales.ts` 移入记忆空间的 `presentation/locales.json`，文字不变：40 个只有它的页面使用（11 个 `common.*` 键、`card.*` 与 `readSources.*`），82 个只有它的设置使用（`config.provider*`、`config.embedding*`、`config.native*`、`spaces.offNote`、`common.inactive` 等）。Starter 照旧把这个文件合并进自己的词典，因此 `MnemonKey` 和两种语言的词典都保留全部键：`tests/fixtures/presentation-baseline.json` 中的文案指纹不变（每种语言 1,341 个键，SHA-256 相同），因为指纹取自合并后的词典。记忆空间先读自己的文案，再读 dsh-mnemon 的，插值方式相同，所以每条文字（包括缺失的）都与以前一致。移过去的设置键中有三个在 `main` 上就已无人使用（`config.providersSpacesOn`、`config.providersSpacesOffTitle`、`config.providersSpacesOffDetail`，是早先设置布局留下的）；它们仍然保留，因为公开的键类型不能少键。

**设置。** Provider 列表、嵌入设置与 Mnemon Native 这一行移入记忆空间的客户端（`src/client/settings.tsx`、`provider-settings.tsx`），唯一留下的 `ProviderIcon` 与 Provider 标签辅助函数一并移入。记忆空间在自己的 `apply()` 中用 `installMemoryComponentUI` 注册它们，与安装的组件注册设置的方式相同。它们读取同样的配置键、调用同样的 Host 操作，RPC 名称与载荷都不变，只是改为通过页面借给它们的 `host`（见下文）。

**一个字段组件。** `ProviderField`（`src/client/provider-field.tsx`）绘制所有 Provider 字段，包括配置页上的服务字段和记忆空间对话框中空间的字段，取代原先根据描述生成的两套表单。它共用标签、选项标签与输入框属性，并按各处原来的样子绘制：配置页保留它的类名、标签在旁的复选框、显示所输入内容的按钮，以及已保存凭据的掩码；对话框保留它们的类名、上方的标签、“留空即保留已保存凭据”的提示和清除凭据的选项。两处对已保存凭据的处理不同，统一成一条规则会改变其中一处的显示，所以各自保留。

**页面借出的内容。** 需要 dsh-mnemon 配置或 Host 操作的设置会收到 `host`，只有 dsh-mnemon 服务的组件才有，目前是记忆空间。`host.configuration` 读取借给该组件的键（`embedding`、`storageScope`、`writeEnabled`），并通过页面带修订栅栏的设置写入，只写它拥有的 `embedding`。`host.operations.read`/`write` 在页面所属的对话与工作区中调用为它提供的五个操作（`status-summary`、`embedding-status`、`provider-services`、`embedding-fill`、`provider-service-update`），拒绝其他操作。`host.changed()` 让记忆系统重新读取它的页面。与 Source 页面的 `management` 客户端一样，设置服务和传输层都不会交出；每个组件在每个对话与工作区只有一个 host，所以设置中的副作用和 Provider 列表的缓存看到的是同一个对象。

**面向插件作者。** `dsh-mnemon/client` 为 `installMemoryComponentUI` 增加 `fallback`，新增 `MNEMON_COMPONENT_FALLBACK_PRIORITY`、`host` 的类型，以及随附设置所用的控件与样式：`SettingRow`、`SelectRow`、`ToggleRow`、`SettingSelect`、`useLive`、`useStaged`、`PanelActions`、`WriteFailure`、`Callout`、`Reveal`、`GlobalLocationSetting` 与 `memorySettingsStyles`。没有移除或重命名任何导出。[扩展开发](../../zh-CN/development/extensions.md#组件自己的设置与状态卡片)说明了它们。

**客户端类型声明只留在浏览器一侧。** 导出设置控件后，`dsh-mnemon/client` 的类型声明一度通过内部 hook `useScope` 的参数类型连到 Host 协议，进而连到 SDK 对 cordis `Context` 的扩充。在插件的独立安装中，这使 `Context` 分裂成两个类型，`verify:plugins` 中文档 Source 的独立类型检查因测试里的 `Context` 错误而失败，而 `main` 通过。现在 `useScope` 按它读取的结构定义类型，客户端类型声明重新只包含浏览器一侧的文件（21 个，`main` 上 17 个，新增的四个就是导出的控件），`scripts/verify-public-entries.mjs`（属于 `verify:package`）会在它们再次连到 `src/host/` 或 `src/sdk/` 时失败。

## 无论运行哪个版本，都只有一套设置

profile 可以自行保留一份记忆空间，比 Starter 固定的版本更旧或更新。DSH 在按键注册的区域中，每个键只渲染一个条目，并拒绝同一个键在同一优先级上的第二次注册；不同优先级的条目中，它渲染数值最低的那个（`@deepseek-ai/dsh-client-ui-slots`，0.2.0-rc.2 与 0.2.1-rc.1 相同；DSH 的 `renderSlot` 与 `renderComponentRegion` 选取条目的方式也相同）。因此：

- Starter 以 `fallback: true` 注册记忆空间的设置，优先级为 `MNEMON_COMPONENT_FALLBACK_PRIORITY`（100）。记忆空间以默认优先级注册自己的设置后，只要仍在注册，就会替代后备注册；它注销后，后备注册重新出现。
- 记忆空间只在 `dsh-mnemon/client` 导出 `MNEMON_COMPONENT_FALLBACK_PRIORITY` 时注册自己的设置。它的客户端包是通过 DSH 模块加载器加载的 CommonJS，读取已加载的 dsh-mnemon 缺少的导出时得到 `undefined`。dsh-mnemon 0.5.31 以默认优先级注册内置设置，在那里注册会被拒绝，而且它不借出 `host`。

后备注册很小：只注册一次 `MemorySpacesSettings`，由 Starter 从记忆空间的公开客户端入口 `dsh-mnemon-source-memory-spaces/client` 取得，即它所固定版本中的实现。Starter 的客户端构建会打包所有导入，因此通过仓库的 TypeScript 路径把这个入口解析到固定版本的源码（`tsdown.config.ts` 在 `alwaysBundle` 中列出它）。只有一个模块 `src/client/memory-spaces-client.ts` 导入组件的实现；它还为“状态”页提供记忆空间的 `ProviderIcon`，那里的 Provider 列表仍由 Starter 绘制。`tests/plugin-repository-boundary.spec.ts` 只允许这一个模块。若改为在 Starter 中保留一份副本，本改动删除的重复文件就会留下。后备设置只会出现在 0.5.21 及更早的记忆空间旁边，所以在 Starter 保留它期间，记忆空间带来的设置必须能与这些版本配合；它们使用的五个操作这些版本都能应答。

| Starter | 记忆空间 | 为记忆空间注册的设置 | 显示 | WebUI，DSH 0.2.1-rc.1 与 0.2.0-rc.2 |
|---|---|---|---|---|
| 本分支 | 本分支 | 它自己的（优先级 0）与 Starter 的后备（100） | 它自己的 | 1 套设置，无控制台错误 |
| 本分支 | 0.5.21 | Starter 的后备 | 后备，由固定版本记忆空间的代码绘制 | 1 套设置，无控制台错误 |
| 0.5.31 | 本分支 | 0.5.31 的内置设置；记忆空间不注册 | 0.5.31 的内置设置 | 1 套设置，无控制台错误 |
| 0.5.31 | 0.5.21 | 0.5.31 的内置设置 | 与以前相同 | 1 套设置，无控制台错误 |

`tests/client-component-fallback.spec.tsx` 用 DSH 自己的 `SlotCore` 按各版本的注册方式构造每一行：0.5.31 的 Starter 以默认优先级注册，其 `dsh-mnemon/client` 没有 `MNEMON_COMPONENT_FALLBACK_PRIORITY`；记忆空间 0.5.21 不注册设置。测试检查 DSH 渲染哪个条目、记忆空间的设置是否恰好渲染一套、记忆空间自己的注册注销后后备是否重新出现，以及 DSH 是否拒绝记忆空间在 0.5.31 内置设置旁边注册，这也是记忆空间先做检查的原因。`test:installed-dsh` 还针对 0.2.0-rc.2 的 slot core 运行它。记忆空间自己的 `tests/settings.spec.tsx` 检查它的 `apply()` 在让出设置的 dsh-mnemon 下注册设置，在不让出的 dsh-mnemon 下不注册。

WebUI 一列来自 e2e fixture：用已发布的 `dsh-mnemon@0.5.31` 与 `dsh-mnemon-source-memory-spaces@0.5.21` 客户端包替换本分支的客户端包（只替换 `lib/client.js`，Host 仍是本分支的），在两个 DSH 版本上分别运行。八次运行中，插件页里记忆空间的页面每次都只显示一个**记忆 Provider**标题、一张 Mnemon Native 卡片和一行 OpenViking，打开的 OpenViking 表单都是同样四个字段，控制台没有错误。

## 改动前后

无头 Chrome，1280×800，浅色，在 DSH 0.2.1-rc.1 上的 e2e fixture 中：`main`（`3b33e07e`）在单独的 worktree 中构建，与本分支对照，中英文各一次。每次运行依次打开插件页中记忆空间的页面、Mnemon Native 的嵌入设置、OpenViking 的表单（输入前、输入后，以及带凭据保存后；使用仓库中的 OpenViking 协议 fixture `scripts/fixtures/openviking-protocol.mjs` 和占位密钥）、Mem0 的表单（一个选择项和一个凭据字段）与 ByteRover 的表单（路径、它的位置行和凭据字段）、DSH 为记忆空间这一行提供的页面，以及记忆空间页面带 OpenViking 字段的**创建记忆空间**对话框。下表每个视图在 `main` 与本分支上都相同。

| 视图 | `main` 与本分支 |
|---|---|
| 插件页中记忆空间的页面，中文 | ![记忆空间页面与记忆 Provider 列表](./page-zh.jpg) |
| 同上，英文 | ![英文的同一页面](./page-en.jpg) |
| 展开 Mnemon Native 的嵌入设置，中文 | ![Mnemon Native 的嵌入设置](./native-zh.jpg) |
| 同上，英文 | ![英文的同一设置](./native-en.jpg) |
| 带凭据保存的 OpenViking，字段以掩码显示凭据，中文 | ![OpenViking 表单，API Key 显示为掩码](./credential-zh.jpg) |
| 同上，英文 | ![英文的同一表单](./credential-en.jpg) |
| Mem0 的表单：一个选择项，以及带提示的凭据字段，中文 | ![Mem0 的服务表单与接入模式选择器](./choice-zh.jpg) |
| 同上，英文 | ![英文的同一表单](./choice-en.jpg) |

- 像素：两种语言下九个视图都相同，只有一处例外：创建记忆空间对话框中有 21 个（中文）和 11 个（英文）像素在一个通道上相差一个色阶，位于 DSH 的关闭图标处，中文另有两个圆角像素。再次截取本分支的中文界面时，它与第一次截图恰好在这些像素上不同，而与 `main` 的九个视图全部相同。
- 布局：设置下每个元素以及对话框中 Provider 字段的位置尺寸、文字与计算样式都相同。
- 标记：去掉类名中随构建变化的前缀后，两种语言下八个设置视图的标记全部相同。

## 留待以后

本批改动不改变行为，以下几处因此与 `main` 保持一致：

- **没有 `readSources.model.<provider>` 文字的 Provider**：在记忆空间页面的来源列表中，它的空间下方是一行空白。记忆空间为随附的九个 Provider 提供了文字；其他 Provider 可以改为显示描述中的名称。
- **已保存凭据的两条规则。** 配置页用十二个圆点填满字段；在选中掩码时输入会整体替换它，但保留部分圆点的编辑（例如移动光标后删掉一个圆点）会把剩下的圆点存为凭据。如果某个 Host 发来已保存的凭据（`secretValues`，dsh-mnemon 从不发送），配置页还会直接显示出来。记忆空间的对话框则让字段保持为空，说明凭据已保存、留空即保留，并提供清除选项。对话框的规则更安全，适合作为统一的规则。
- **`.providerFieldControl` 有两份不同的样式**：配置页的（`MnemonSettingsCard.module.css`）把字段放在纵向排列的底部，复选框没有外边距；页面工具的（`MnemonView.module.css`，记忆空间 0.5.21 的对话框也用它）是网格，复选框上下各有 2 px 外边距。二者不是副本：合并会改变字段在更高的单元格中的位置以及复选框的尺寸，所以两份都保留。

## 兼容性

- **自行固定记忆空间版本的 profile：** 见上表。比本版本更新的记忆空间会像本版本一样用自己的设置替代后备。
- **公开 SDK：** 只有上面列出的新增。移除的 `MnemonClient` 方法和删除的 `src/client` 文件从来不是公开入口。记忆空间的客户端入口新增 `MemorySpacesSettings`、`installMemorySpacesSettings` 与 `ProviderIcon`。
- **peer 最低版本：** 记忆空间的设置使用 `dsh-mnemon/client` 的新导出。它在运行时检查这些导出，因此搭配较旧的 Starter 仍能工作，但发布 PR 应把它的 `dsh-mnemon` peer 最低版本提高到导出 `MNEMON_COMPONENT_FALLBACK_PRIORITY` 的那一版。
- **存储数据与 Host：** 没有任何设置、键、RPC 名称、载荷或工具发生变化；Host 未改动。`tests/client-component-host.spec.ts` 检查移走的设置发送的 RPC 名称与载荷。
- **样式：** 没有任何样式规则变化。移走的设置使用 `dsh-mnemon/client` 提供的配置页类名表，相应规则仍归 Starter 所有；对话框继续使用页面工具的样式。
- **文案：** 较旧的 Starter 搭配本版本记忆空间时，自己的词典里仍有每个键；记忆空间优先读取自己的文案。

## 检查

| 命令 | 结果 |
|---|---|
| `pnpm run typecheck`；`pnpm --filter dsh-mnemon-source-memory-spaces run typecheck` | 通过 |
| `pnpm run test:root` | 2,049 通过，6 跳过（140 个文件） |
| `DSH_HOST_ROOT=<已安装的 0.2.0-rc.2> pnpm run test:installed-dsh` | 2,049 通过，6 跳过（140 个文件） |
| `pnpm --filter dsh-mnemon-source-memory-spaces run test` | 260 通过，2 跳过（24 个文件） |
| `pnpm run verify` | 通过，用时 123 秒：4,356 个链接与 225 个锚点，53 个文件的确定性构建，17 个插件测试套件 547 通过、3 跳过，根测试同上，Headless，63 个文件的包与 21 个浏览器一侧的客户端类型声明 |
| `MNEMON_CLI_PATH=/nonexistent/mnemon MNEMON_PLUGIN_VERIFY_CONCURRENCY=1 pnpm run verify:plugins` | 通过，用时 245 秒：17 个独立插件仓库与 18 个打包产物 |
| `pnpm run release:intent`（基准 `3b33e07e`） | 通过：`dsh-mnemon` 与 `dsh-mnemon-source-memory-spaces` 的 changeset 覆盖 |

新增测试：`tests/client-component-fallback.spec.tsx`（上表四行）；`tests/client-component-host.spec.ts`（`host` 借出和拒绝的内容，以及 RPC 名称与载荷，随客户端方法一起从 `tests/client-api.spec.ts` 移来）；记忆空间的 `tests/settings.spec.tsx`（字段在各处的绘制方式，包括两条凭据规则；它自己的设置基于借来的 `host` 工作；按 dsh-mnemon 版本决定是否注册）。`tests/client-settings.spec.tsx` 中原有的设置测试改为在 Starter 借出的 host 上渲染记忆空间的设置，断言不变，全部通过。
