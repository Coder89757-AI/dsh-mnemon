# Host 模块按既有边界拆分

[English](./README.md)

两个 Host 模块已经大到一次评审难以看完：`src/host/subagent.ts` 有 2,378 行、147 KB，其中记忆任务协调器 `MnemonSubagentCoordinator` 一个类就占 1,467 行；`src/host/tools.ts` 的 `registerTools` 是一个 439 行的函数，注册全部 16 个记忆工具。本改动来自技术债审查的 H2 项：按两个文件本已存在的边界拆分，委派子 Agent 的人设、结果 schema 与任务文本、DSH 输出 schema 检查、回执恢复、运行时容量工作流和文档归档工作流各自移入自己的模块，记忆工具按工具族逐组注册。用户与模型看到的都没有变化。代码原样移动；离开协调器的方法改为把用到的协调器状态作为参数传入；`subagent.ts` 导出同样的名称；构建出的 Host 产物包含同样的语句，唯一的例外是协调器类、由其方法变成的 13 个函数，以及工具注册函数，而它们都由原代码组成。

基线：main `bd70979f`，即 #426（M2 与 M3）的合并提交；本改动从该分支的最新提交 `a8c40265` 开始，main 在其后新增的四个提交都没有涉及这两个模块。改动：`0236a9e0`（固定文本的测试）、`5a5c16c2`（`subagent.ts`）、`4b4de316`（`tools.ts`），并在 `bad852aa` 合并了 main，以及评审后扩展固定内容的 `ea19a2ec`，2026-10-18（Asia/Shanghai），macOS 15.6 arm64，Node 24.19.0，pnpm 10.13.1，锁定的 DSH 0.2.1-rc.2；根测试另在已安装的 DSH 0.2.0-rc.2 上运行，真实宿主测试另在已安装的 0.2.1-rc.2 上运行。

## 移动内容

| 模块 | 之前行数 | 现在包含 | 之后行数 |
|---|---:|---|---:|
| `src/host/subagent.ts` | 2,378 | 门面、委派任务行、每类子 Agent 可调用的工具、把写入限定在调用方指定空间的保护（#387）、未生成向量的记忆的提示（#388），以及 `MnemonSubagentCoordinator`（之前 1,467 行、60 个成员，现在 836 行、48 个成员）：结果工具、召回、放置、元数据、写入、审查、对账，以及启动每个子 Agent 的 `delegate` | 1,068 |
| `src/host/subagent-prompts.ts` | 新增 | 每个委派子 Agent 的人设、其结果必须符合的 schema，以及把一次运行的数据写进任务的辅助函数：请求摘要、证据、元数据样本、运行时记忆快照与可用的记忆空间 | 278 |
| `src/host/subagent-output-schema.ts` | 新增 | DSH 结构化输出工具能编译的 JSON Schema 子集、由 `subagent.ts` 再导出的 `assertDshOutputSchema`，以及按 schema 检查捕获结果的函数 | 84 |
| `src/host/subagent-receipts.ts` | 新增 | 读回子 Agent 的返回：其结构化结果、可在它没有记录结果时代替结果的记忆工具回执、失败的空闲审查保留的回执，以及有长度上限的失败详情 | 154 |
| `src/host/archive-destinations.ts` | 新增 | 两个归档工作流共用的部分：哪些记忆空间能接收归档，无论在当前还是另一个记忆空间 Source 中（#336），以及 Provider 回执所证明的 lineage | 110 |
| `src/host/runtime-capacity.ts` | 新增 | 运行时容量工作流：`runtimeLocked`、`compactUserAndCommit`、`archiveRuntimeEntry`、`archiveRuntimeLocally` 与 `runtimeArchiveSource`，路由摘录与分批，以及协调器为它构建的写入上下文 | 508 |
| `src/host/document-archive.ts` | 新增 | 文档工作流：写入放不下时先归档（`documentLocked`）、把文档索引进记忆空间并归档（`archiveDocumentLocked`）、本地归档、归档任务与冷路径 | 276 |
| `src/host/tools.ts` | 502 | `registerTools`（之前 439 行，现在 8 行）、所有工具共用的辅助函数（`toolHelpers`，32 行），以及每个工具族一个注册函数：视图工具（57）、记忆空间的读取（84）、文档工具（84）、运行时记忆工具（36）、记忆空间的写入（152） | 534 |

代码的移动方式：

- 每个新模块按原顺序放入 `subagent.ts` 中的若干代码块，注释随代码一起移动。被同级模块导入的声明加上了 `export`，这些行没有其他改动。
- 13 个私有方法离开协调器，成为上述模块中的函数。每个函数把用到的协调器状态作为第一个参数，函数体与原方法的区别只在于读取这个参数而不是 `this`：
  - `counters`：`runtimeLocked`、`archiveRuntimeLocally` 与 `archiveDocumentLocally`；
  - `runtimeSource`：`runtimeArchiveSource`，原来读 `this.runtimeSource.config.writeEnabled` 的地方改读 `runtimeSource.config.writeEnabled`；
  - `host`，即 `DocumentWorkflowHost`：`documentLocked`、`archiveDocumentLocked`、`documentCommit`、`documentIndexSpaces` 与 `assertAutomaticMemoryWrite`。文档工作流用到协调器的 `runtimeSource`、`counters`、`turnAuthority`、`sourceFor`、`writableSourceFor` 与 `delegate`，这些仍是私有成员；协调器的 `documentWorkflow()` 在每次处理文档请求时把它们绑定到协调器后交给工作流；
  - 无：`compactUserAndCommit`、`archiveRuntimeEntry`、`archivableElsewhere` 与 `noArchivableMemorySpace` 没有用到协调器的任何状态，参数不变。
- 单独设立 `archive-destinations.ts`，是因为两个工作流使用同样的目标检查与 lineage 辅助函数；放在任一工作流的模块里，都会让一个工作流依赖另一个。
- 记忆空间的工具分两个函数注册：模型拿到的记忆空间读取工具在文档工具之前，写入工具在运行时记忆工具之后，`tests/fixtures/model-tools.json` 固定了这一顺序。辅助函数仍只构建一次；视图、文档与运行时记忆工具读取的 `config` 仍是注册工具时取得的那一个。
- 每个新模块只导入自身代码用到的内容，并且只导入 `subagent.ts` 此前已经加载的模块；`subagent.ts` 在原有导入之后再导入它们，因此每个已有模块仍按相同顺序加载，新模块紧挨在 `subagent.ts` 之前加载。`subagent.ts` 不再需要的导入已删除。

## 等价性

**先固定文本。** 在移动任何代码之前，`0236a9e0` 在基线上新增了两个测试：

- `tests/subagent.spec.ts` 中的“What delegated children read”通过协调器启动每一类委派子 Agent，所用的 Provider 像 DSH 0.2.0 的 Provider 一样在启动请求中接收子 Agent 的人设：8 种写入操作、基于证据的回答、Provider 放置、元数据维护、经 spawn 与经 fork、开启与关闭运行时记忆的空闲审查、MEMORY.md 归档路由的两个批次（其中一条长于路由摘录，一条带分支）、USER.md 压缩、文档归档，以及对合并后记忆的对账；对账经维护任务运行器执行，所用的证据包括另一台机器写入的条目、分支、文档、同步分支一侧的差异与一条审阅意见。对这 20 个子 Agent，测试逐一固定其标签，以及人设、人设之后的完成协议（其中包含结果 schema，并去掉每次运行随机生成的 requestId）与任务的 SHA-256。其中有 14 种不同的人设、8 种不同的完成协议和 18 种不同的任务。任务中凡由分隔符连接的列表都有两个元素（请求的标签、被路由条目的分支、文档的源路径），并且有一个请求字段是对象，因此这些分隔符也被固定。在人设或任务文本中加一个空格，测试即会失败；把上述任一分隔符改动一个字符，同样会失败。
- `tests/tool-cards.spec.ts` 按注册顺序固定每个记忆工具在对话中显示的调用卡片与结果卡片。

两个测试在基线上通过，每次移动之后不加修改仍然通过。评审之后，`ea19a2ec` 加入了对账子 Agent 以及上述列表与对象；扩展后的固定内容在移动之前的代码 `a8c40265` 上通过，在移动之后同样通过。固定每个工具名称、描述、输入与输出 schema 以及注册顺序的 `tests/memory-tools.spec.ts` 与 `tests/fixtures/model-tools.json` 没有改动，也都通过。

**源码。** 两次移动由 [`harness/split-subagent.py`](./harness/split-subagent.py) 与 [`harness/split-tools.py`](./harness/split-tools.py) 完成：它们按行号从基线文件中截取代码，把离开类的方法去掉两个空格的缩进（模板字符串中的行属于模型文本，不去缩进），并且只应用其中列出的替换，每处替换都检查出现次数是否符合预期。在 `a8c40265` 上，或在这两个文件与之相同的 main `bd70979f` 上运行，它们都逐字节写出 `4b4de316` 的 8 个文件。客户端拆分留下的 [`moved-lines.mjs`](../client-module-splits/harness/moved-lines.mjs) 把前后代码行作为多重集比较，不计导入与空行，需在仓库根目录运行：

| 拆分 | 之前代码行 | 之后 | 加上 `export` | 仅在之前 | 仅在之后 |
|---|---:|---:|---:|---:|---:|
| `subagent.ts` 拆为 7 个模块，忽略缩进 | 2,195 | 2,237 | 49 | 64 | 106 |
| `tools.ts` | 469 | 499 | 0 | 1 | 31 |

对 `subagent.ts`，仅在之前的 64 行是 13 个方法签名、移走的方法中通过 `this` 读取协调器的 45 行，以及协调器中调用被移走方法的 6 行；仅在之后的 106 行是新签名、改为读取新参数或调用函数的对应行、模块注释、`DocumentWorkflowHost` 与 `documentWorkflow()`。对 `tools.ts`，仅在之前的一行是 `registerTools` 原来的单行文档注释（现在是三行），仅在之后的 31 行是新的函数签名、注释与右括号、`registerTools` 中的六个调用、`toolHelpers` 的返回语句及其类型。这里没有忽略缩进：每个工具注册都是同样的行、同样的缩进。

**构建产物。** main 与合并后的分支以同样方式构建（`pnpm run build`、`pnpm --workspace-concurrency=4 -r build`、`pnpm run build`），main 在其文件树的一份普通副本中构建。[`harness/host-bundle-compare.mjs`](./harness/host-bundle-compare.mjs) 读取 Host 产物 `lib/index.js`：它是一个 ES 模块，其顶层语句就是各 Host 模块的语句。脚本按模块比较导入的名称，把顶层语句作为多重集比较，并且按顺序比较模块加载时就会运行代码的语句：

| | main `bd70979f` | 合并后的改动 `bad852aa` |
|---|---:|---:|
| `lib/index.js` 字节数 | 689,485 | 692,411 |
| 导入 | 29 个模块 | 从同样 29 个模块导入同样的名称 |
| 顶层语句 | 764 | 783 |
| 只在一侧的语句 | 2 条：协调器类与 `registerTools` | 21 条：协调器类、原来的 13 个方法、`registerTools` 及其 6 个新函数 |
| 加载时运行的语句 | 45 | 45，其中 43 条顺序不变 |
| 模块区段 | 56 | 62：6 个新模块紧挨在 `subagent.ts` 之前，其余 56 个顺序不变 |

- 协调器类：之前 66 个成员，之后 54 个（产物把构造函数的 6 个参数属性声明为字段）。13 个方法移出；调用它们的 6 个方法（`runtime`、`enqueueRuntime`、`viewAction`、`manageSource`、`document` 与 `archiveDocument`）只在这次调用上不同，各一行；`documentWorkflow()` 是新成员。
- 13 个函数：参数与原方法相同，只在前面多了传入的协调器状态；从方法中去掉 `this.`，再从函数、传递该参数的调用和 `host.` 中去掉新的第一个参数之后，函数体与方法体完全相同。
- `registerTools`：原来的 22 条函数体语句，即 6 个辅助函数与 16 个注册调用，就是 `toolHelpers` 与 5 个工具族函数的函数体语句；只在之后的 7 条是调用 `toolHelpers`、5 个工具族函数调用，以及辅助函数的返回语句。16 个 `ctx.tools.register(...)` 调用完全相同，执行顺序也相同。
- 加载时运行的语句：`subagent.ts` 中有 3 条语句在产物加载时构建常量值：`AUTONOMOUS_WRITE_TOOLS` 过滤一个由工具名组成的常量数组，`WRITE_ACTION_SET` 与 `DSH_OUTPUT_SCHEMA_KEYS` 是由字符串字面量构成的 Set。后两者现在随各自的模块在 `subagent.ts` 之前加载，因此这三条语句彼此之间的执行顺序变了。每条语句都只用在它之前定义的常量构建值，并且要到某个函数运行时才会被读取，所以这一顺序无法被观察到。其余加载时运行的语句顺序不变。
- 对 `a8c40265` 与 `4b4de316` 做同样的比较（两者都在合并前于本检出目录中构建），除大小（689,453 与 692,379 字节）外报告完全相同。
- 根构建写出的其余文件都相同。在本检出目录中构建时，`a8c40265` 与 `4b4de316` 写出同样的客户端产物、其他入口与代码块，以及 `lib/types` 下发布的声明；main 在另一个目录中构建，其客户端产物与合并后分支的差别只在于样式表区段注释中记录的检出路径。没有任何包入口能到达新模块，因此它们不增加声明文件。

## 兼容性

- **模型与用户看到的内容。** 每个委派子 Agent 读到同样的人设、结果 schema 与任务（见固定文本的测试）；模型拿到的工具及其描述与 schema 相同，顺序相同（见 fixture）；工具显示同样的卡片。
- **行为。** 移动后的代码按同样的顺序运行同样的语句，抛出同样的错误；类与函数的差别仅限上文所述。计数、两个队列与副作用的顺序都没有改变：文档工作流的 host 在排队执行的调用中构建，也就是原来调用方法的位置，并读取协调器自身的状态。
- **公开 SDK。** 没有包入口改变：`src/host/subagent.ts` 与 `src/host/tools.ts` 是内部模块，发布的声明完全相同。`subagent.ts` 仍向 Host 与测试导出同样的名称。
- **版本组合。** 没有任何内容跨越包边界：没有插件改动，也没有 peer 下限需要提高。
- **持久化数据与通信格式。** 不变：归档索引的文本、其冷路径与 lineage 引用都随各自的工作流原样移动。
- **DSH 版本。** 根测试在锁定的 DSH 0.2.1-rc.2 与已安装的 0.2.0-rc.2 上通过，真实宿主测试在已安装的 0.2.1-rc.2 上通过。

## 不在本次改动中

- `delegate`（208 行）仍是协调器的一个方法。它负责结果能力、工具结果观察者、回执，以及子 Agent 的启动与释放；拆分它需要设计新的部件，而不是移动代码。
- `write` 及其周边的保护与提示留在 `subagent.ts`，`review` 与 `reconcile` 留在协调器中；对账的提示与人设本已在 `reconcile.ts` 中。放置、回答与写入方法内联构建的任务文本留在这些方法中，因为移动它们需要新增函数。

## 命令与结果

除非某行注明了其他 revision，所有命令都通过 Node 24.19.0 与 pnpm 10.13.1 在合并提交 `bad852aa` 加上本记录（它只新增记录与 changeset）上运行，事先执行了 `pnpm install --frozen-lockfile` 与上述构建；main 的数字来自在 `bd70979f` 上运行的相同命令。

| 命令 | 结果 |
|---|---|
| `pnpm run verify` | 通过：文档（4,828 个本地链接、368 个锚点）、类型检查、56 个文件的确定性输出、每个插件的类型检查与测试（17 个包共 593 个通过、3 个跳过；Runtime 81 个，Memory Spaces 292 个、跳过 2 个）、根测试（152 个文件，2,111 个通过、7 个跳过）、真实 Headless 激活（38 个工具，其中 8 个属于 Mnemon）以及旧设置导入与停用 Starter、包内容（66 个文件，打包后 480,083 字节）、15 个 Node 入口及其 35 个公开类型依赖与 21 个浏览器端客户端声明、`publint` 与 `attw` |
| `MNEMON_CLI_PATH=/nonexistent/mnemon MNEMON_PLUGIN_VERIFY_CONCURRENCY=1 pnpm run verify:plugins` | 通过：17 个独立插件仓库与 18 个打包产物、只用公开 SDK 的组合与客户端测试；在真实 DSH 中单独安装打包后的 Starter 并激活其插件，以及同时激活三个可选的打包 Strategy 插件 |
| `DSH_HOST_ROOT=<DSH 0.2.0-rc.2> pnpm run test:installed-dsh` | 152 个文件，2,108 个通过、10 个跳过；多出的 3 个跳过是只适用于 DSH 0.2.1 的真实宿主探针 |
| `DSH_HOST_ROOT=<DSH 0.2.1-rc.2> pnpm exec vitest run --config scripts/installed-dsh.config.ts` | 152 个文件，2,111 个通过、7 个跳过，其中包括真实宿主测试，与锁定的 DSH 上相同 |
| `node scripts/verify-sync-git.mjs` | 在锁定的 DSH 0.2.1-rc.2 上 64 项检查全部通过：两个真实的 DSH Web 实例配置本地裸仓库，向其发布并从中拉取 |
| `pnpm exec vitest run tests/subagent.spec.ts tests/tool-cards.spec.ts tests/memory-tools.spec.ts`，在 `0236a9e0`、`5a5c16c2` 与 `4b4de316` 之后各运行一次 | 每次分别通过 149、1 与 7 个测试 |
| 用 `ea19a2ec` 的固定内容运行 `pnpm exec vitest run tests/subagent.spec.ts`，分别在 `ea19a2ec` 与 `a8c40265` 的文件上 | 两处都通过 149 个测试 |
| `pnpm exec tsc -p tsconfig.json --noEmit --noUnusedLocals` | 8 个模块中没有未使用的导入或局部变量 |
| `python3 docs/pr-assets/host-module-splits/harness/split-subagent.py . a8c40265 <dir>` 与 `split-tools.py . a8c40265 <dir>` | 逐字节写出 `4b4de316` 的 8 个文件 |
| `node docs/pr-assets/client-module-splits/harness/moved-lines.mjs [--indent] --before a8c40265:<file> --after 4b4de316:<files>` | 见“等价性”中的源码表格 |
| `node docs/pr-assets/host-module-splits/harness/host-bundle-compare.mjs . <基线>/lib/index.js lib/index.js` | 见“等价性”中的构建产物表格 |
| `node docs/pr-assets/host-module-splits/harness/spans.mjs . a8c40265:src/host/subagent.ts a8c40265:src/host/tools.ts src/host/<file>...` | 见“移动内容”中的行数 |
| 在 main `bd70979f` 上运行 `pnpm run test:root` 与 `DSH_HOST_ROOT=<DSH 0.2.0-rc.2> pnpm run test:installed-dsh` | 151 个文件，2,109 个通过、7 个跳过；在已安装的 DSH 0.2.0-rc.2 上 2,106 个通过、10 个跳过。本改动新增两个固定文本的测试，其中一个在新文件中 |
| `CHANGESET_BASE_REVISION=bd70979f CHANGESET_REVISION=HEAD pnpm run release:intent` | 已验证 `dsh-mnemon` 的 changeset 覆盖 |

Changeset：`host-module-splits`（`dsh-mnemon`，patch）。
