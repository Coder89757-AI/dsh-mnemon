# 记忆工具收拢为一张表

[English](./README.md) | [验证记录](./verification.json)

Host 与 WebUI 的六个模块各自保存一份记忆工具的信息：命名工具运行哪个 Source 操作、一次调用计入哪个回合计数、View 把哪些命名工具绑定到各个 Source 操作、回合记忆栏的标签与页面，以及委派子 Agent 的工具列表和空闲审查各层里的工具名。没有任何机制让这些副本保持一致。本改动来自技术债审查的 M4 项：共享的信息收进一张浏览器安全的表，由 Host 模块与 WebUI 读取，子 Agent 的工具列表与审查各层则按这张表定类型。用户与模型看到的都没有变化：测试把两者看到的内容固定为 main 的结果，换回 main 的模块后这些测试同样通过。记录还对照了命名工具的 schema 与它们运行的 Source 操作，作为后续改动的发现。

基线：main `f41a121f`，在 `78025c4c` 合并进本分支；改动最初基于 `4996a796` 编写。改动：`c89ab542`，评审后的补充为 `17be6818` 与 `6f297d40`，2026-10-17（Asia/Shanghai），macOS 15.6 arm64，Node 24.19.0，pnpm 10.13.1，锁定的 DSH 0.2.1-rc.1；根测试另在已安装的 DSH 0.2.0-rc.2 上运行。

## 改动内容

`src/host/memory-tools.ts` 由浏览器安全的 `src/host/protocol.ts` 再导出，每个记忆工具一行：命名工具运行的 Source 类型与 Route 或 Action，工具是读取、查看还是写入，它在回合记忆栏中的条目打开哪个页面，以及它的标签键。两个通用 View 工具 `mnemon_view_route` 与 `mnemon_view_action` 运行调用所指定的任意 Route 或 Action，因此它们那一行不写 Source，也不写页面。委派子 Agent 的结果工具 `mnemon_subagent_result` 不运行任何 Source 操作，表中没有它。

| 模块 | 之前 | 现在 |
|---|---|---|
| `src/host/tools.ts`、`src/host/activity-presentation.ts` | 每个命名工具为其结果记录的活动重复写出自己的 Source 与操作 | `namedToolPresentation(name)` 从该工具的行读取，并且只接受读取或写入的工具：查看类工具不记录活动 |
| `src/host/activity.ts` | 三个名称集合加上档案检索的特例决定一次调用计入哪个计数 | 由行的种类与 Source 决定；通用 View 工具和表中没有的工具不计入任何计数，与之前相同 |
| `src/host/view-presentation.ts` | 两张从 Source 操作到所绑定命名工具的字面量映射 | 由表的各行生成；运行同一操作的工具按表中顺序列在一起 |
| `src/client/MnemonTurnTail.tsx` | 自己的标签映射与页面函数 | 使用行中的标签与页面；与之前相同，表中没有的工具显示自己的名称，没有页面的工具打开记忆空间 |
| `src/host/subagent.ts` | 委派子 Agent 的工具列表，以及六处与工具名的比较，都是普通字符串 | 同样的列表，类型限定为表中的行；这些比较改用只接受表中名称的辅助函数 |
| `src/host/review-tools.ts` | 空闲审查能做的两种写入是字符串字面量 | 同样的两个名称，类型限定为表中的行 |

子 Agent 的工具列表与审查各层仍逐一写明。子 Agent 能调用哪些工具属于策略，新增一行不会自动交给子 Agent；而重命名或删除一行时，列出它的地方现在会在类型检查中报错。

有两处差别对任何人都不可见。从 Source 操作到命名工具的映射现在按 memory-spaces、documents、runtime 的顺序填充，而不是 runtime、documents、memory-spaces；所有读取方都按 id 查找 Route 或 Action，因此 View 的文本与拒绝信息完全相同。另外，main 的标签映射在普通对象上按名称查找，`constructor` 或 `__proto__` 这样的名称会取到 `Object.prototype` 上的属性，而这张表会原样显示这类名称；任何会话都记录不到这类名称，因为回合活动只保留以 `mnemon_` 开头的名称。

## 与 main 等价

下表每个测试都固定 main 产生的结果。[等价性运行](./verification.json)用 main（`f41a121f`）版本的上述七个模块替换本改动的版本，再运行包含新测试与现有活动、审查测试的四个测试文件：68 个测试通过，与本改动相同。独立评审发现的、能通过第一版全部测试的每种改动，现在都会让一项检查失败：[`harness/review-mutations.mjs`](./harness/review-mutations.mjs) 修改两个输出 schema、把两个工具移到其他计数、在空间写入保护中重命名一个工具、让查看类工具记录活动、在任一侧修改页面类型，七种改动都会让测试或类型检查失败。

| 测试 | 固定的内容 |
|---|---|
| `tests/memory-tools.spec.ts`，一致性 | 每个注册的记忆工具都有一行，每一行都已注册，顺序与注册顺序一致 |
| `tests/memory-tools.spec.ts`，模型可见文本 | DSH 向模型展示的全部 17 个工具（含结果工具）的内容：名称、描述、输入 schema、Code Mode 的 TypeScript 声明用来为每个结果定类型的输出 schema，以及没有工具设置的 `deferLoading`；与用 main 的模块生成的 `tests/fixtures/model-tools.json` 逐字节比对，不受检出时换行符的影响 |
| `tests/memory-tools.spec.ts`，类型 | 表的页面类型与回合记忆栏的锚点页面类型相同，`namedToolPresentation` 恰好接受读取或写入的 12 个工具（类型检查） |
| `tests/memory-tools.spec.ts`，活动 | 每个工具的活动记录的种类、Source 与操作：通用工具记录 `view-route` 与 `view-action`，不带 Source；查看类工具不记录 |
| `tests/memory-tools.spec.ts`，全部绑定 | 一个提供了所有命名工具所运行的 Source 操作的 View 的 `MNEMON VIEW TOOLS` 行，以及第二个运行时实例原样留在 `MNEMON VIEW ROUTES` 中的提供项 |
| `tests/memory-tools.spec.ts`，默认 View | 真实默认组合加一个记忆空间时的同一行 |
| `tests/memory-tools.spec.ts`，计数 | 每个工具各占一个回合时，16 行各自计入的计数，以及结果工具和另一个 `mnemon_` 工具不计入任何计数 |
| `tests/client-interaction-surfaces.spec.tsx`，全部条目 | 回合记忆栏中每个条目的标签与页面，以及表中没有的工具显示自己的名称并打开记忆空间 |

## 命名工具与其运行的 Source 操作对照

以下只是发现；本改动不修改任何 schema。DSH 只对用它的 `defineTool` 构建的工具按 schema 检查参数。dsh-mnemon 注册的是普通定义，因此命名工具的参数按模型发送的原样到达 Host。随后 Core 按 Source 的 schema 检查 Route 或 Action 的输入（类型、枚举、必填与未声明的属性），其余由 Source 自己校验。[`harness/schema-findings.probe.ts`](./harness/schema-findings.probe.ts) 发出了下文引用的调用，在本改动上与换回 main 的模块后结果相同。

| 发现 | 工具 | 当前效果 | 可能的修复 |
|---|---|---|---|
| 工具的 schema 对未声明的属性开放，DSH 为 Code Mode 生成的 TypeScript 声明还会加上 `& Record<string, JsonValue>`；Source 的 schema 是封闭的 | `mnemon_recall`、`mnemon_document_search`；委派写入者的 `mnemon_remember`、`mnemon_link`、`mnemon_forget`、`mnemon_memory_body_update` 与 `mnemon_memory_body_merge` | 被拒绝：召回报 `memory Route input contains unsupported property: scope`，档案检索的 `sort` 同理；委派的 remember 报 `memory Action input contains unsupported property: confidence`，委派的记忆空间更新的 `reason` 同理 | 只把工具或所绑定的 Route、Action 声明过的属性交给 Source，这样在通用策略下，召回 Route 提供的过滤条件（如 `category`）仍能到达 |
| `limit` 在两边都是整数，召回 Route 拒绝 1 到 20 以外的值 | `mnemon_recall` | 通用策略下 limit 为 50 时被拒绝：`value must be an integer within 1..20`。分层策略会先把 limit 限制到 6，因此只有小于 1 的值（如 0）会被拒绝 | 在 Route 中把 limit 夹到范围内，与档案 Route 的做法一致 |
| `importance` 在工具中是整数，在 remember Action 的 schema 中是数字，而 Action 只接受 1 到 5 的整数 | `mnemon_remember`；经 `mnemon_view_action` 调用的 remember Action | 3.6（Action 的 schema 允许）与 9 都报 `value must be an integer within 1..5` | 把这一刻度上的小数取整，或在 Action 的 schema 中声明 1 到 5 的整数（模型可见） |
| 工具中是枚举，Source 中是普通字符串：`category`、`source`、关联 `type`、关联查询 `edge` | `mnemon_remember`、`mnemon_link`、`mnemon_related` | Source 拒绝其他值并给出说明；通过通用工具调用时，模型只能从这条拒绝中得知可选值 | 在 Source 的 schema 中声明（模型可见） |
| 工具中是字符串数组，Source 中是未限定元素类型的数组：`tags`、`entities`、`memoryBodyIds`、`sourcePaths`、`branches`、`sourceMemoryBodyIds` | 多个 | Source 拒绝字符串以外的元素 | 同上 |
| 只写在描述里的范围：`depth` 1 到 5、`weight` 0 到 1、最多 20 个标签与 50 个实体、合并来源 1 到 20 个 | `mnemon_related`、`mnemon_link`、`mnemon_remember`、`mnemon_memory_body_merge` | Source 按描述执行这些限制 | 无需修改 |
| 两边 schema 都没写的上限：档案标题 160、描述 600 个字符，记忆空间名称 100、描述 1,000 个字符，一条记忆 8 KiB，召回查询 2,000 个字符，关联理由 1,000 个字符，标签不能含逗号 | 多个 | 超出时被拒绝并给出说明 | 写在模型会读到的地方（模型可见） |
| 工具中是 `old_text`，Action 中是 `oldText` | `mnemon_runtime_memory` | Host 负责映射 | 无需修改 |
| 由 Host 提供或保留的字段：`sessionIds`、remember 的 `source` 默认为 `agent`、档案的 `archive` 流程、放置位置的 `selection` | 档案与记忆空间工具 | 按设计如此 | 无需修改 |
| 召回 Route 提供而工具没有的过滤条件：`category`、`source`、`intent` | `mnemon_recall` | 分层策略认为它们不可靠而丢弃 | 无需修改 |
| 工具声明了、但只有分层策略执行的上限：召回 6 条结果、档案 4 份 | `mnemon_recall`、`mnemon_document_search` | 通用策略下 limit 为 10 的档案检索返回了全部 6 份匹配档案，分层策略下为 4 份；召回最多返回 20 条 | 在 Host 中执行这些上限，或说明它们取决于策略 |

## 不在本改动中

对于 `mnemon_view_route` 与 `mnemon_view_action` 的每个条目和内容，无论调用由哪个 Source 处理，回合记忆栏仍然打开记忆空间，因为这些调用记录的活动不带 Source。记录 Source 并据此跳转会改变这些内容打开的位置，因此留给后续改动；出于同样的原因，表中通用工具的行不写页面。命名工具的执行路径也仍然逐字写出各自的 Source 与操作，因此与 main 一样，没有任何机制把一行的操作与该工具实际运行的操作联系起来。上面的各项发现在本改动中也都没有修改。这两项改动都已列入[路线图](../../zh-CN/roadmap.md)，细节见[计划](../../plans/review-gaps-2026-10.md)（英文）第 5 与第 6 项。

## 兼容性

- **模型可见文本**：工具名称、描述以及输入与输出 schema 与 main 逐字节相同，View 的命名工具绑定也相同。
- **持久化数据**：每个工具随会话保存的活动元数据与 main 写入的相同；没有存储的设置发生变化。
- **Wire**：没有 DTO 或 RPC 名称变化。`protocol.ts` 新增 `MEMORY_TOOLS`、`memoryTool`、`memoryTools` 及其类型；它们是浏览器安全的，不在任何公开入口上，[公开导出检查](../remove-dead-code/harness/public-exports.mjs)确认了这一点。
- **公开 SDK**：没有删除或重命名任何导出。
- **界面**：回合记忆栏显示同样的标签、打开同样的页面。没有修改任何文案键，文案指纹不变。
- **版本错配**：只有 Starter 改变，它的 Host 与 WebUI 一起发布；没有插件使用新的导出，因此不需要提高任何 peer 下限。
- **DSH 版本**：根测试在 DSH 0.2.1-rc.1 与已安装的 0.2.0-rc.2 上都通过。

## 命令与结果

所有命令都在最终代码（合并提交 `78025c4c`）上，通过 Node 24.19.0 与 pnpm 10.13.1 运行。把这些结果写入记录后又运行了一次 `pnpm run verify:docs`：4,547 个链接、326 个锚点。

| 命令 | 结果 |
|---|---|
| `pnpm run verify` | 通过：文档（4,545 个链接、326 个锚点）、类型、确定性构建（50 个文件）、每个插件的类型与测试（记忆空间 274 个通过、2 个跳过）、139 个文件中的根测试 2,049 个通过、6 个跳过、Headless 激活、包内容（60 个文件，打包后 466,525 字节） |
| `MNEMON_CLI_PATH=/nonexistent/mnemon MNEMON_PLUGIN_VERIFY_CONCURRENCY=1 pnpm run verify:plugins` | 通过：17 个独立插件仓库与 18 个打包产物，仅经公开 SDK 的组合与客户端测试；在真实 DSH 中只安装打包后的 Starter 并激活其插件，以及同时激活三个可选的打包策略插件 |
| `DSH_HOST_ROOT=<DSH 0.2.0-rc.2> pnpm run test:installed-dsh` | 139 个文件中 2,049 个通过、6 个跳过 |
| `CHANGESET_BASE_REVISION=f41a121f CHANGESET_REVISION=HEAD pnpm run release:intent` | 确认 `dsh-mnemon` 有 changeset 覆盖 |
| 换上 main 的七个模块运行 `pnpm exec vitest run tests/memory-tools.spec.ts tests/client-interaction-surfaces.spec.tsx tests/activity.spec.ts tests/review-tools.spec.ts`，再换回本改动的模块运行一次 | main 的模块下 68 个通过，本改动 68 个通过 |
| `node docs/pr-assets/memory-tool-table/harness/review-mutations.mjs .` | 七种改动都让一项检查失败：前三种是测试，其余四种是类型检查 |
| 把 [`harness/schema-findings.probe.ts`](./harness/schema-findings.probe.ts) 复制到 `tests/` 并用 vitest 运行，分别在本改动上与换上 main 的七个模块后 | 12 次调用两边结果相同，见上文引用与[验证记录](./verification.json) |
| `node docs/pr-assets/remove-dead-code/harness/public-exports.mjs "$PWD" MEMORY_TOOLS memoryTool memoryTools MemoryToolEntry MemoryToolName MemoryToolLabel MemoryToolPage namedToolPresentation memoryPageStyles` | 新名称都不公开；对照项 `memoryPageStyles` 在 `dsh-mnemon/client` 上被找到 |

Changeset：`memory-tool-table`（`dsh-mnemon` patch）。没有插件的代码或导出发生变化。
