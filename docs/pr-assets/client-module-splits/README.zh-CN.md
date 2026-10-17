# 客户端模块按既有边界拆分

[English](./README.md)

三个客户端模块分别长到了 953、823 和 1,774 行：记忆系统工作台（`src/client/MnemonWorkbench.tsx`）、Git 同步区块（`src/client/MnemonSyncSection.tsx`）和记忆空间的页面（`plugins/dsh-mnemon-source-memory-spaces/src/client/pages.tsx`）。本改动来自技术债审查的 M6 项：按各文件本已存在的边界拆分，原先放在其中的每个页面、区块和对话框都有了自己的模块，工作台的状态、Source 目录与导航改由三个 hook 维护。用户与模型看到的都没有变化。代码原样移动：标记、类名、文案键与 RPC 调用都相同，effect 的运行顺序相同，公开入口导出的名称也相同。构建产物包含同样的语句；唯一的例外是工作台的函数体和它现在调用的三个 hook，而它们由原函数体的语句组成。

基线：main `03dd40a4`，即 #423 的合并提交，其文件树与 `a214dd07` 相同。改动：`e5cae8e1`（记忆空间页面）、`f91f39d8`（同步区块）、`b5bb4d49`（状态页与 Source 管理页）、`33a3f10c`（工作区 hook），2026-10-17（Asia/Shanghai），macOS 15.6 arm64，Node 24.19.0，pnpm 10.13.1，锁定的 DSH 0.2.1-rc.2；根测试另在已安装的 DSH 0.2.0-rc.2 上运行。

## 移动内容

| 模块 | 之前行数 | 现在包含 | 之后行数 |
|---|---:|---|---:|
| `src/client/MnemonWorkbench.tsx` | 953 | 工作台：页头、标签页、已关闭或已停止的层的页面、重启提醒，以及调用下面三个 hook 的 `MnemonWorkspace`（之前 404 行，现在 271 行） | 449 |
| `src/client/StatusPage.tsx` | 新增 | `StatusPage`、带 Mnemon Native 行的 `ProviderHealth`、`StorageDomains`，以及工作台同样使用的组件卡片、层状态和存储范围标签 | 196 |
| `src/client/SourceManagementPage.tsx` | 新增 | `SourceManagementPage`，由描述驱动的管理页 | 119 |
| `src/client/use-workspace-status.ts` | 新增 | `useWorkspaceStatus`：一个视图上下文的状态及其两步读取 | 48 |
| `src/client/use-source-catalog.ts` | 新增 | `useSourceCatalog`：正在运行的 Source 实例、为每个实例绑定的管理客户端，以及由它们得到的页面与管理标签页 | 76 |
| `src/client/use-workspace-navigation.ts` | 新增 | `useWorkspaceNavigation`：打开的页面、标签页、锚点以及跟随所属层的页面，连同页面 id 辅助函数 | 162 |
| `src/client/is-record.ts` | 4 | 新增工作台与管理页共用的 `jsonRecord` | 10 |
| `src/client/MnemonSyncSection.tsx` | 823 | 同步区块、仓库状态行、编辑器及其地址表单 | 412 |
| `src/client/sync-repository-editor.ts` | 新增 | 仓库编辑器及其打开的 GitHub 登录共用的 props（`9482d145`） | 22 |
| `src/client/MnemonSyncGitHubConnect.tsx` | 新增 | 通过设备流程登录 GitHub | 156 |
| `src/client/MnemonSyncRepositoryPicker.tsx` | 新增 | 仓库选择器 | 99 |
| `src/client/MnemonSyncAdvancedSettings.tsx` | 新增 | 本机名称、分支、目录与提交作者 | 160 |
| `src/client/sync-feedback.tsx` | 新增 | 同步区块与高级设置共用的反馈行 | 10 |
| 记忆空间 `src/client/pages.tsx` | 1,774 | `src/client.ts` 导出的模块，再导出同样的名称 | 8 |
| 记忆空间 `src/client/widgets.tsx` | 新增 | 多个页面共用的内容：Provider 辅助函数与字段、分类标签、读取来源面板、记忆卡片，以及已弃用的 `nativeBodyProvider` | 180 |
| 记忆空间 `src/client/memory-graph.tsx` | 新增 | 概览页的图：布局、它补充的空间与实体节点，以及 SVG | 443 |
| 记忆空间 `src/client/overview-page.tsx` | 新增 | `OverviewPage`、全文预览，以及它记住的已关闭的重新发现提示 | 496 |
| 记忆空间 `src/client/explore-page.tsx` | 新增 | `ExplorePage` 与 `MemorySpacesPageStatus` | 130 |
| 记忆空间 `src/client/entities-page.tsx` | 新增 | `EntitiesPage`，连同其分页大小、占位与相关记忆偏好 | 311 |
| 记忆空间 `src/client/persistence-strategy-dialog.tsx` | 新增 | `PersistenceStrategyDialog` 及其两个设置类型 | 137 |
| 记忆空间 `src/client/remember-page.tsx` | 新增 | `RememberPage` | 81 |
| 记忆空间 `src/client/list-page.tsx` | 新增 | `ListPage` | 48 |

代码的移动方式：

- 每个新模块按原顺序放入原文件中的若干代码块，注释随代码一起移动。被同级模块导入的声明加上了 `export`，这些行没有其他改动。
- 每个新模块只导入自身代码用到的内容，并且只导入原文件此前已经加载的模块，因此两个构建产物仍按相同顺序加载每个已有模块，新模块在其来源模块之前加载。文件不再需要的导入已删除。
- 记忆空间的 `pages.tsx` 逐个按名称再导出，而不是用 `export *`，因此页面共用的辅助函数仍属内部实现，`src/client.ts` 继续从它 `export *`。
- 只有一个测试改动，且只改了它读取的文件：`tests/client-modal-css.spec.ts` 检查客户端源码中的每个对话框页脚，现在不再使用手工列出的文件清单，而是读取 Starter 与各内置 Source 的全部客户端源码，新模块中的对话框也会被检查；它找到的仍是同样的 12 处页脚（`9482d145`，审查之后）。

## 工作区 hook

React 按 hook 的调用顺序运行组件的 effect，并且在每次提交中先运行所有 layout effect，再运行 passive effect；自定义 hook 内的 hook 在调用它的位置运行。因此每个 hook 取原函数体中保存其状态的那一段，工作台在那一段原来的位置调用它：

| 顺序 | 阶段 | Effect | 现在的位置 |
|---:|---|---|---|
| 1 | layout | 页面或视图上下文变化时重置画布滚动 | `useWorkspaceNavigation` |
| 2 | layout | 视图上下文变化时清除锚点带入的输入 | `useWorkspaceNavigation` |
| 1-4 | passive | 订阅配置操作、组件变化、设置与 Source 页面目录 | `MnemonWorkspace`，未变 |
| 5 | passive | 读取 Source 目录（`sourceManagementCatalog`） | `useSourceCatalog` |
| 6 | passive | 读取组件名称（`viewDashboard`） | `MnemonWorkspace`，未变 |
| 7 | passive | 所属层的 Source 停止时把页面移到该层的已停止页面，恢复时移回 | `useWorkspaceNavigation` |
| 8 | passive | 应用保留的锚点并订阅新的锚点 | `useWorkspaceNavigation` |
| 9 | passive | 读取状态（`statusSummary`，需要时再读 `status`） | `MnemonWorkspace`，在导航 hook 之后 |
| 10-12 | passive | 侧边栏重新打开、组件切换或设置变化时刷新 | `MnemonWorkspace`，未变 |

已停止的层要在导航 hook 用到之前根据状态算出，因此 `useWorkspaceStatus` 较早调用，并返回其读取函数 `loadStatus`；运行该读取的 effect 留在工作台中、位于导航 hook 之后，那里的注释说明了原因。不运行 effect 的 hook（例如打开页面的状态）现在位于持有它们的 hook 中，调用位置比原来靠后；导航 hook 还会再读取一次翻译上下文。两者都不会改变任何运行顺序。

## 等价性

**源码**。[`harness/moved-lines.mjs`](./harness/moved-lines.mjs) 把每个文件在 main 上的代码行与它拆成的模块按多重集合比较，导入语句与空行不计：

| 拆分 | 之前代码行 | 之后 | 加上 `export` | 仅之前 | 仅之后 |
|---|---:|---:|---:|---:|---:|
| 记忆空间 `pages.tsx` | 1,655 | 1,656 | 17 | 0 | 1，再导出上方的注释 |
| `MnemonSyncSection.tsx` | 750 | 750 | 6 | 0 | 0 |
| `MnemonWorkbench.tsx` 与 `is-record.ts`，页面移动（`b5bb4d49`） | 865 | 865 | 6 | 0 | 0 |
| `MnemonWorkbench.tsx`，hook（`b5bb4d49` 到 `33a3f10c`），忽略缩进 | 578 | 639 | 5 | 0 | 61 |

仅之后的 61 行是三个 hook 的签名、返回类型、文档注释与返回语句，导航 hook 对选项的解构及其翻译读取，工作台中的三处调用，以及状态读取处的注释。

**构建产物**。main 与本改动在同一目录中以相同方式构建（`pnpm run build`、`pnpm --workspace-concurrency=4 -r build`、`pnpm run build`）；与在独立检出中逐个包构建的 main 比较，结果相同。[`harness/bundle-compare.mjs`](./harness/bundle-compare.mjs) 读取每个客户端构建产物的工厂函数，去掉标记模块的 `//#region` 注释，按多重集合比较顶层语句；在加载时运行代码的语句还必须保持顺序，每个样式表所在的区域（注入的样式表与代码读取的类名映射）必须完全相同：

| 构建产物 | 之前字节 | 之后字节 | 语句 之前 / 之后 | 仅之前 / 之后 | 加载时 effect，顺序相同 | 样式表相同 | 模块区域 之前 / 之后 |
|---|---:|---:|---:|---:|---|---|---:|
| `dsh-mnemon` `lib/client.js` | 945,626（gzip 203.86 kB） | 948,368（gzip 204.21 kB） | 590 / 593 | 1 / 4 | 85，是 | 14 / 14 | 91 / 100 |
| `dsh-mnemon-source-memory-spaces` `lib/client.js` | 362,230（gzip 74.52 kB） | 362,632（gzip 74.58 kB） | 167 / 167 | 0 / 0 | 28，是 | 2 / 2 | 14 / 21 |

记忆空间的构建产物包含同样的语句，只有模块区域变了。Starter 的构建产物中，仅之前的那一条语句是原来的 `MnemonWorkspace`，仅之后的四条是新的 `MnemonWorkspace` 与三个 hook。[`harness/hooks-compare.mjs`](./harness/hooks-compare.mjs) 对它们逐一比较：原函数体的每条语句都在这四个函数之一中，只有四条（`loadStatus`、`sourceManagementClients`、`visibleSourcePages`、`managedSourceTypes`）现在由构建内联在 hook 的返回值中，且表达式与原来完全相同；仅之后的 8 条语句是三处调用、三条返回语句、选项解构与翻译读取。在各 hook 的调用处展开后，2 个 layout effect 与 12 个 passive effect 的运行顺序与 main 相同。Starter 的构建产物从未包含记忆空间的页面，现在也不包含。它增加的 2,742 字节来自九个新的模块区域，以及各 hook 的签名、调用与返回；记忆空间增加的 402 字节来自七个新的模块区域。

其他每个构建文件在两次构建之间都相同：Host 构建产物 `lib/index.js`、Starter 发布的类型声明，以及其他每个插件的 `lib`。另有两处差异来自构建本身，与本改动无关。运行时记忆与项目档案的客户端构建产物在区域注释中写有每个样式表的绝对路径，因此另一目录中的检出只在这里不同。另外，在全新检出的首次构建后，`dsh-mnemon-provider-byterover/lib/index.d.ts` 把定义声明为 `any`，之后的任何一次构建都会写出真实类型：工作区构建把 ByteRover 排在记忆空间之前，首次构建时后者的 `provider-sdk` 类型声明尚不存在。main 与本改动都是如此，见“不在本改动中”的说明。

**公开名称**。[`harness/public-names.mjs`](./harness/public-names.mjs) 列出每个包入口经 TypeScript 暴露的 772 个名称及其种类，改动前后的列表完全相同。[`harness/bundle-exports.mjs`](./harness/bundle-exports.mjs) 按 DSH 的方式加载两个客户端构建产物：`dsh-mnemon` 导出同样的 50 个名称，记忆空间导出同样的 16 个。记忆空间发布的类型声明为每个新模块增加一个文件，`lib/types/client/pages.d.ts` 再导出它们，因此其 `./client` 入口解析到同样的名称与类型。Starter 发布的类型声明不变。

## 不在本改动中

- 审查列出的其他大组件 `CompositionBoard`、`MnemonSaveAction`、`MnemonDialog` 与 `MnemonReviewSection` 保持原样。它们的大部分是一个 214 到 255 行的组件函数体，拆分意味着在组件内部新建子组件或 hook，而不是移动代码。
- `src/client/locales.ts` 保留其词典：把它们移到 JSON 会改变 `MnemonKey` 的类型方式与文案指纹。
- 审查 M6 项中的其他条目（记忆空间的 service 与 source，以及 Host 模块）属于另外的改动；Host 的 `subagent.ts` 与 `tools.ts` 是 H2 项。
- 上文发现的 ByteRover Provider 类型声明：已发布的 `dsh-mnemon-provider-byterover` 0.5.5 同样把定义与模块声明为 `any`，与从全新检出构建的发布一致。ByteRover 构建时只要记忆空间的类型声明已经存在，其类型就能解析；调整构建顺序属于构建改动，因此这里只作报告。

## 兼容性

- **界面**：标记与类名相同，两个构建产物中的每个样式表与类名映射都完全相同。没有修改任何文案键，文案指纹不变。
- **行为**：同样的 RPC 请求按同样的顺序发出；移动的页面使用的浏览器存储键 `dsh-mnemon.memory-spaces.rediscovery-seen` 与 `dsh-mnemon.memory-spaces.entities.related` 随代码一起移动。
- **公开 SDK**：任何公开入口都没有新增、删除或重命名导出。
- **版本错配**：两个包都没有使用对方新增的内容，Starter 的构建产物取用的记忆空间代码与之前相同，因此不需要提高任何 peer 下限，profile 中任意一对版本的组合都照常工作。
- **持久化数据与 wire**：不变。
- **DSH 版本**：根测试在锁定的 DSH 0.2.1-rc.2 与已安装的 0.2.0-rc.2 上都通过。

## 命令与结果

所有命令都在 `33a3f10c` 上，于 `pnpm install --frozen-lockfile` 与上述构建之后，通过 Node 24.19.0 与 pnpm 10.13.1 运行；main 的计数来自在 `03dd40a4` 上运行的相同命令。写入本记录后又运行了一次 `pnpm run verify:docs`：4,694 个链接、353 个锚点。

| 命令 | 结果 |
|---|---|
| `pnpm run verify` | 通过：文档（4,680 个链接、353 个锚点，写入本记录之前）、类型、确定性构建（55 个文件）、每个插件的类型与测试（记忆空间 291 个通过、2 个跳过）、149 个文件中的根测试 2,098 个通过、7 个跳过、Headless 激活、包内容（65 个文件，打包后 476,038 字节）、公开入口（15 个入口、34 个公开类型依赖、21 个浏览器侧客户端声明，与 main 相同）、`publint` 与 `attw` |
| `MNEMON_CLI_PATH=/nonexistent/mnemon MNEMON_PLUGIN_VERIFY_CONCURRENCY=1 pnpm run verify:plugins` | 通过：17 个独立插件仓库与 18 个打包产物，仅经公开 SDK 的组合与客户端测试；在真实 DSH 中只安装打包后的 Starter 并激活其插件，以及同时激活三个可选的打包策略插件 |
| `DSH_HOST_ROOT=<DSH 0.2.0-rc.2> pnpm run test:installed-dsh` | 149 个文件中 2,095 个通过、10 个跳过，与 main 相同 |
| 在 main 上运行 `pnpm run test:root` 与 `test:installed-dsh` | 149 个文件中 2,098 个通过、7 个跳过；在已安装的 DSH 0.2.0-rc.2 上 2,095 个通过、10 个跳过：与本改动相同 |
| `pnpm exec vitest run tests/client-` | 32 个文件中 396 个通过，包括 WebUI 呈现、平台边界与客户端测试，与 main 相同 |
| `pnpm --filter dsh-mnemon-source-memory-spaces run test` | 291 个通过、2 个跳过，与 main 相同 |
| `pnpm exec tsc -p tsconfig.json --noEmit --noUnusedLocals`，以及在记忆空间中运行同样的命令 | 所有客户端模块中都没有未使用的导入或局部变量 |
| 在仓库根目录对四次拆分运行 `node docs/pr-assets/client-module-splits/harness/moved-lines.mjs` | 见“等价性”中的表 |
| `node docs/pr-assets/client-module-splits/harness/bundle-compare.mjs . <main>/lib/client.js lib/client.js`，记忆空间同样运行 | 见“等价性”中的构建产物表 |
| `node docs/pr-assets/client-module-splits/harness/hooks-compare.mjs . <main>/lib/client.js lib/client.js` | 四条语句以相同表达式内联返回，新增 8 条，2 个 layout 与 12 个 passive effect 顺序相同 |
| 在 main 与本改动上分别运行 `node docs/pr-assets/client-module-splits/harness/bundle-exports.mjs . lib/client.js plugins/dsh-mnemon-source-memory-spaces/lib/client.js` | 50 与 16 个名称，两边相同 |
| 在 main 与本改动上分别运行 `node docs/pr-assets/client-module-splits/harness/public-names.mjs .` | 772 个名称，两边相同 |
| `CHANGESET_BASE_REVISION=03dd40a4 CHANGESET_REVISION=HEAD pnpm run release:intent` | 确认 `dsh-mnemon` 与 `dsh-mnemon-source-memory-spaces` 有 changeset 覆盖 |

Changeset：`client-module-splits`（`dsh-mnemon` 与 `dsh-mnemon-source-memory-spaces`，patch）。
