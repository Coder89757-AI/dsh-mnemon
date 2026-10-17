# 小型清理：重复的名称与规则各归一处

[English](./README.md)

v0.5.31 之后的技术债审计列出了一些小问题：同一件事在几处各写一遍，或者保留着没有写明理由的代码。本改动处理其中五项（L3、L6、L7、L8 与 M5(a)），以及 [Source 拥有自己的存储格式](../source-owned-formats/README.zh-CN.md)（#416）之后仍留在 Host 中的规则副本。这一批改动的维护者规则是：用户和模型看到的内容一律不变。某一项若需要这类改动，或会与进行中的工作冲突，就保持原样，并在下文说明。

测试版本：分支 `claude/small-cleanups`，在 main `f41a121f`（#416）上编写，先合入 main `d0cf29c0`（#417、#418），再合入 `ca94e889`（#419，以及把开发基线换成 DSH 0.2.1-rc.2 的 #420），然后合入 `8e052c22`（把记忆空间设置移入其自身客户端的 #421）与 `1fd64eaf`（只改文档的 #422），2026-10-17（Asia/Shanghai），Node 24.19.0、pnpm 10.13.1，锁定的 DSH 0.2.1-rc.2；根测试另在安装的 DSH 0.2.0-rc.2 上运行。下列检查均在最终合入的版本上通过。`verify`、`verify:plugins`、安装的 DSH、Git 同步与 `serve-e2e.mjs` 在合入 `ca94e889` 之后，以及在此前两个状态（DSH 0.2.1-rc.1）上也已通过。前三项包对比是在 `f41a121f` 与合入前的本分支之间进行的，在基础版本模块上的运行使用 `f41a121f` 的模块；客户端常量要等 #421 合入，与 `8e052c22` 对比。

## 改动内容

| 项目 | 之前 | 现在 |
|---|---|---|
| L3：`toolviews` 偏好 | `conversationInteraction.toolviews` 会被解析、补默认值、导入、在写入时拒绝，却从不被读取。它在 0.1.1 与 0.1.2 中控制对话内的工具卡片，0.1.3 起没有代码读取它 | 解析后的配置及其协议类型不再包含它。schema 仍带默认值声明它，这让 DSH 根据 schema 生成的表单保持原样；无论是否声明，已保存的值都能通过校验，因为未声明的键会被放行，另有测试固定这一声明。旧设置导入仍接受并带上它；两个设置命名空间仍拒绝写入它。`Config.conversationInteraction.toolviews` 标为已弃用 |
| L6：记忆空间名称 | Host 导入已弃用的 `MemoryBody*` 别名（`subagent.ts`、`rpc.ts`、`protocol.ts` 与五个测试文件），辅助函数也以 body 命名 | 使用规范的 `MemorySpace*` 类型；`eligibleMemorySpaceContext`、`receiptMemorySpaceIds` 与协调器的 `scopeRelatedMemorySpace`。通信协议与存储中的名称保持不变：工具名、`bodies` 与 `body-*` 操作、`memoryBodyId` 字段、`memory-bodies` 存储类型、`.dsh-memory-bodies.json`、页面客户端的方法 |
| L6：主策略 id | 插件管理把插件选择 `memoryView.strategyTypeId` 写入 `memoryTopology.strategyId` 后，三处各自读取这个字段 | `src/host/main-strategy.ts`：插件管理在解析配置的地方（运行时图与每次 View 请求）用 `withMainStrategy` 应用这一选择，`mainStrategyTypeId` 为组合、空闲审查与 View 面板读取结果。状态 RPC 仍发送整个拓扑，客户端只读取其中的各层；插件恢复重新提交已保存的选择，只为填好请求 |
| L7：随附组件 | 列了六遍：客户端的随附判断与组件行、Host 的安装建议、`verify-headless-profile.mjs`、`serve-e2e.mjs`、`verify-sync-git.mjs` | `src/host/starter-components.ts`：按 patch 顺序的组件行、按建议顺序的增强，以及自带 bundle patch 的包。客户端通过 `protocol.ts` 取用；脚本直接导入它，因为它没有任何导入、只用可擦除的类型，Node 能把它当作 TypeScript 运行。`src/client/starter-rows.ts` 已删除 |
| L8：兼容代码 | 没有写明理由或移除条件 | [兼容登记表](../../zh-CN/development/compatibility-register.md)（[English](../../en/development/compatibility-register.md)）：17 行，开发指南与“兼容性与升级”均有链接 |
| M5(a)：Native Provider id | 记忆空间 Source 中约十几处 `'mnemon-native'`，其中一半写作 `(provider.typeId ?? provider.id) === 'mnemon-native'`；客户端中另有七处：记忆空间的页面与设置中五处（其中两处在 #421 之前位于 Starter 的 `component-settings.tsx`），Starter 的保存操作与状态页各一处 | 记忆空间 `./contracts` 导出 `NATIVE_PROVIDER_ID` 与 `isNativeProvider()`；登记表、服务、目录、持久化策略默认值与 forget 说明都改用它们，记忆空间的页面与设置从 `../contracts.ts` 导入这个常量。它的 `./client` 入口也导出 `NATIVE_PROVIDER_ID`，Starter 的保存操作与状态页从 `src/client/memory-spaces-client.ts` 取用；自 #421 起，Starter 的客户端经由这个网关取用记忆空间的客户端代码。服务中按 Provider id 判断的方法改名为 `isNativeProviderId` |
| #416 之后的规则副本 | 名称与描述的 100/1,000 字符上限在登记表解析、每次登记表写入、Source 的创建与更新请求解析以及页面名称与描述输入框的 `maxLength` 中各写一遍；空间 id 的正则在 `src/host/config.ts` 与记忆空间的 `config.ts` 中各有一份；`src/host/subagent.ts` 中写死 USER.md/MEMORY.md | `MEMORY_SPACE_NAME_MAX_LENGTH` 与 `MEMORY_SPACE_DESCRIPTION_MAX_LENGTH`（新增）、`MEMORY_SPACE_ID_PATTERN` 与 `RUNTIME_PROJECTION_FILES`；提示信息不变 |

### 保持原样的部分

- **文案键与样式选择器。** 记忆空间 `presentation/locales.json` 有两类文案键仍含 `mnemon-native`：页面按 Provider 的 id 拼出的 `readSources.model.*`，以及 Native 描述以 `summaryI18nKey` 指定的 `overview.providerSummary.*`；它的 `presentation/page.module.css` 用 `[data-provider="mnemon-native"]` 为 Native 的标记、卡片、标签与图节点设定颜色。两者都是以这个 id 为键的展示资源，JSON 文件和样式表无法导入常量，它们也不是 id 的另一份定义。
- **保存操作中的判断** 仍把 `typeId ?? id` 与这个 id（现为 `NATIVE_PROVIDER_ID`）比较，而不调用 `isNativeProvider()`：后者要在记忆空间的 `./client` 再加一个导出，并为一处调用在 Starter 的包中加入一个函数。
- **提示文本。** `subagent.ts` 仍在 persona 文本和消息中写 USER.md 与 MEMORY.md，并用字面量上限（100、100、300）截断提示中的名称与 Provider 标签。这些是提示措辞与篇幅预算，不是 Source 规则的副本，模型看到的文本必须不变。
- **`src/host/config.ts` 中的 `CUSTOM_PACK_ID`** 与空间 id 的模式相同，但它是另一条规则：自定义 Pack 的 id。
- **restore 中的占位值。** `plugin-management.ts` 的 `restore()` 发送 `strategyTypeId: saved ?? 'default-three-tier'`，只因为请求结构需要这个字段；它只检查格式，不选择任何策略。
- **`scripts/fixtures/` 下的夹具 patch** 为各自的场景把增强行写进 profile YAML。
- **一项观察，未改动：** `verify-headless-profile.mjs` 只把三个增强排除在链接的包之外，而 `serve-e2e.mjs` 与 `verify-sync-git.mjs` 还排除了同样自带 bundle patch 的通用策略。脚本保持原有行为。

## 等价性

- **浏览器包。** 分别从 `f41a121f` 与合入前的本分支构建的 `lib/client.js` 只有两处不同：组件行从 `src/client/starter-rows.ts` 区段移到 `src/host/starter-components.ts`，八项内容相同；`SHIPPED_PACKAGES` 改由这些行生成，不再是写有同样八个包名的字面量（931,923 字节变为 931,666 字节）。
- **Host 包。** `lib/index.js` 只在各项所述之处不同：`resolveConfig` 中 `toolviews` 那一行、改为调用 `MEMORY_SPACE_ID_PATTERN.test` 的 store 检查、`main-strategy.ts` 的两个函数及其三处调用、改名的辅助函数、用于安装建议的增强列表、快照标题中的 `RUNTIME_PROJECTION_FILES[target]`，以及一处导入的顺序。
- **记忆空间。** 它的 `lib/provider-sdk.js` 逐字节不变，`lib/client.js` 在客户端常量这一步之前也逐字节不变；`lib/contracts.js` 增加四个导出，其他 chunk 在原先比较字面量之处调用它们。
- **客户端常量。** 以相同方式从 `8e052c22` 与本分支构建，Starter 的 `lib/client.js` 只在字面量变为引用之处改变：它作为后备显示的记忆空间设置中的 Native 行（两处）与状态页的 Native 行（一处）改读 `NATIVE_PROVIDER_ID`，每处多 3 字节；常量的声明连同文档注释与记忆空间 contracts 的区段注释增加 330 字节（945,217 字节变为 945,556 字节，+339）。记忆空间的 `lib/client.js` 在创建表单的默认 Provider、两个描述输入框与设置中的 Native 行（两处）改变，并增加 `NATIVE_PROVIDER_ID` 与 `MEMORY_SPACE_DESCRIPTION_MAX_LENGTH` 的声明及其文档注释，以及前者的导出（361,733 字节变为 362,220 字节，+487）；它的 `lib/types/client.d.ts` 增加这个导出。其余位置逐字节不变：tsdown 使用的 rolldown 1.2.4 默认会在 `??` 与 `||` 中以及值很短（如 `100`）时内联导入的常量，因此保存操作中的判断、持久化策略对话框的两个默认值与两个名称输入框在包中仍是字面量。两个包 `lib/` 目录中的其他文件都没有改变。
- **新测试放在之前的代码上。** 随附组件测试在 main 的 `component-copy.ts` 上通过；新的 settings 与 live-config 测试在 main 的 Host 模块上通过：`toolviews` 的写入本来就被拒绝，已保存的 profile 本来就能通过校验。config 与旧设置导入测试与 main 的差别只在于解析后的配置不再包含 `toolviews`。提示测试固定了 main 写出的标题文本；评审后新增的测试（面板中的主策略、schema 中的声明、登记表创建与 Source 请求解析中的上限）在基础版本的模块上同样通过。
- **脚本。** 三个脚本都无需构建即可加载 `src/host/starter-components.ts`：已在 Node 24.19 与 25.1 上直接导入检查，并由 `verify` 中的 `pnpm run verify:headless`、`verify:plugins`（它两次运行 `verify-headless-profile.mjs`）、Git 同步端到端运行，以及启动 `serve-e2e.mjs` 直到它提供 WebUI 来验证。Node 从 22.18 起无需参数即可运行 `.ts` 文件，开发需要 22.19 或更高版本，CI 中运行这些脚本的地方（`verify:plugins` 与发布工作流）使用 Node 24。

新增与扩展的测试：

| 位置 | 证明的内容 |
|---|---|
| `tests/config.spec.ts` | 已保存的 `toolviews` 被接受，且不出现在解析后的配置中；schema 仍声明它，生成的表单保留三个开关；store 提示只接受空间 id，提示信息不变 |
| `tests/live-config.spec.ts` | DSH 的动态 Config 能校验含有 `toolviews` 的已保存 profile |
| `tests/settings.spec.ts` | 两个命名空间都拒绝写入 `toolviews`，旧客户端的交互路径仍可写入 |
| `tests/legacy-settings-import.spec.ts` | 含有 `toolviews` 的保留文件仍能导入，解析后的配置不含它 |
| `tests/main-strategy.spec.ts` | 插件选择优先于拓扑 id；没有选择时原样返回配置对象 |
| `tests/view-management.spec.ts` | View 面板报告 profile 选择的主策略，没有选择时报告默认策略 |
| `tests/plugin-metadata.spec.ts` | 组件行与 bundle patch 一致（同前），也与 package.json 锁定的组件一致，每个组件锁定一个确切版本（可以是预发布版本，绝不是范围）；增强就是随附的策略扩展，并默认关闭；自注册的包正是在清单中声明 bundle patch 的包；随附判断；Starter 以 `NATIVE_PROVIDER_ID` 安装 Mnemon Native |
| 记忆空间 `tests/contracts.spec.ts` | `NATIVE_PROVIDER_ID` 就是 Native Provider 包给其描述、manifest 与驱动的 id；`isNativeProvider` 按类型、按 id 判断；名称与描述上限在登记表的创建与更新（含提示信息）以及解析中的效果 |
| 记忆空间 `tests/source.spec.ts` | 同样的上限与提示信息也适用于 `body-create`、`body-update` 操作和模型的 `manage-spaces` Action |
| 记忆空间 `tests/config.spec.ts` | store 提示只接受空间 id |
| `tests/subagent.spec.ts` | 压缩提示中的快照标题，逐字节相同 |

## 兼容性

- **版本差异。** Starter 精确锁定记忆空间与运行时记忆。它新增的值导入 `MEMORY_SPACE_ID_PATTERN` 与 `RUNTIME_PROJECTION_FILES` 随 #416 加入，与它一同发布（`source-owned-formats` changeset）；`MemorySpace*` 名称自记忆空间 0.5.4 起就有，且只用作类型。记忆空间新增的导出用于记忆空间内部、测试，以及经由网关的 Starter 客户端；Starter 的构建从源码打包这个网关（#421），常量的值就在 Starter 的 `lib/client.js` 中，因此保留其他版本记忆空间的 profile 不受影响。没有插件使用 Starter 中的新内容，peer 下限不变。Native Provider 包没有改动，由测试保证它的 id 与 Source 中的一致。
- **公开 SDK。** 只有新增：记忆空间 `./contracts` 的四个导出，以及其 `./client` 入口的 `NATIVE_PROVIDER_ID`。`ResolvedConfig` 没有以名称从任何入口导出；现由 `protocol.ts` 再导出的 `STARTER_COMPONENT_ROWS` 从来不是公开导出，`src/client/starter-rows.ts` 也是内部文件。`MemoryBody*` 别名仍然发布，`scripts/fixtures/plugin-consumer` 仍基于它们编译。
- **持久化数据。** 不变：schema、旧设置导入的输出和所有存储名称都相同。
- **界面与模型。** 不变：客户端包只有上述差别，工具名与描述没有改动，提示文本逐字节相同。

## 命令与结果

```sh
pnpm install --frozen-lockfile
pnpm run verify
MNEMON_CLI_PATH=/nonexistent/mnemon MNEMON_PLUGIN_VERIFY_CONCURRENCY=1 pnpm run verify:plugins
DSH_HOST_ROOT=<prefix>/lib/node_modules/@deepseek-ai/dsh pnpm run test:installed-dsh   # DSH 0.2.0-rc.2
CHANGESET_BASE_REVISION=$(git rev-parse origin/main) CHANGESET_REVISION=$(git rev-parse HEAD) pnpm run release:intent
node scripts/verify-sync-git.mjs
node scripts/serve-e2e.mjs   # 打印 WebUI 地址后用 Ctrl-C 停止

# 包对比：以相同方式构建 main 与本分支，再比较。
pnpm run build && pnpm --workspace-concurrency=4 -r build && pnpm run build
diff <main checkout>/lib/client.js lib/client.js
diff <main checkout>/lib/index.js lib/index.js
diff <main checkout>/plugins/dsh-mnemon-source-memory-spaces/lib/client.js plugins/dsh-mnemon-source-memory-spaces/lib/client.js

# 把新测试放在基础版本的 Host 模块上：换入、运行、还原。
for file in settings config live-config protocol legacy-settings-import; do git show f41a121f:src/host/$file.ts > src/host/$file.ts; done
pnpm exec vitest run tests/settings.spec.ts tests/live-config.spec.ts tests/config.spec.ts tests/legacy-settings-import.spec.ts
git checkout -- src/host
```

| 检查 | 结果 |
|---|---|
| Lockfile | `pnpm install --frozen-lockfile --lockfile-only` 不改变 `pnpm-lock.yaml`；清单文件没有改动 |
| `pnpm run verify` | 在最终合入的版本上通过：文档链接与锚点（4,680 个本地链接、353 个锚点）、类型检查、55 个文件的确定性输出、每个插件的类型检查与测试（17 个包共 591 项通过、3 项跳过；记忆空间 291 项通过、2 项跳过）、根测试（2,098 项通过、7 项跳过，149 个文件）、真实 Headless 启用（38 个工具，其中 8 个属于 Mnemon），含旧设置导入与停用 Starter 的检查、包内容（65 个文件）、导入 15 个 Node 入口并检查 34 个公开类型依赖、publint 与 attw。合入 `ca94e889` 之后：根测试 2,075 项通过、7 项跳过（146 个文件），插件测试 578 项；合入前：2,051 项与 6 项（141 个文件），577 项 |
| 测试数量 | 根测试新增 12 项（`f41a121f` 上为 2,041 项）。记忆空间新增 4 项（274 项变为 278 项） |
| `verify:plugins` | 通过：17 个独立插件仓库（各自安装、类型检查、测试与构建）、18 个打包制品、外部消费者（构建、类型检查、测试）、真实 DSH 从 0.5.29 升级时只安装打包的 Starter，以及同时启用三个可选策略插件 |
| 在安装的 DSH 0.2.0-rc.2 上运行根测试 | 最终合入的版本上 2,095 项通过、10 项跳过（149 个文件），多跳过的 3 项是只在 DSH 0.2.1 上运行的真实宿主探测；合入 `ca94e889` 之后为 2,072 项与 10 项，合入前为 2,051 项与 6 项 |
| Git 同步端到端 | 在 DSH 0.2.1-rc.2 上 64 项检查全部通过，此前在 0.2.1-rc.1 上同样通过：两个真实 DSH Web 实例向真实的裸仓库发布并从中拉取 |
| `serve-e2e.mjs` | 与之前一样安装 profile（Starter 与 13 个组件包，排除四个自带 bundle patch 的包），启动 WebUI；它打印了地址，没有启动 token 时返回 401；Ctrl-C 后删除夹具 |
| 新测试放在基础版本的 Host 模块上 | 换用 `f41a121f` 的 `settings.ts`、`config.ts`、`live-config.ts`、`protocol.ts` 与 `legacy-settings-import.ts` 后，四个相关文件中的 104 项测试有 102 项通过；未通过的两项断言解析后的配置不含 `toolviews` |
| `release:intent` | 已验证 `dsh-mnemon` 与 `dsh-mnemon-source-memory-spaces` 的 changeset 覆盖 |
