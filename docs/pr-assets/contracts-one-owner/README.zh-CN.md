# 共享的值、通信类型与同步检查各归一处

[English](./README.md)

v0.5.31 之后的技术债审计发现：Starter 的 Host 复制了 Source 的值，几个通信结果类型声明在可在浏览器使用的协议之外，RPC 端点名称在两端都是随手写的字符串，设置表单又把 Host 的 Git 同步检查重新实现了一遍（M2 与 M3 两项）。本改动让它们各有唯一的归属。这一批改动的维护者规则仍然适用：用户和模型看到的内容一律不变，已保存的每项配置都和以前一样通过校验，超时范围也不例外（[计划第 4 项](../../plans/review-gaps-2026-10.md#4-one-timeout-range-for-mnemon-calls)日后再统一它们）。

测试版本：分支 `claude/contracts-one-owner`，在 main `03dd40a4`（#423）上编写，随后合入 main `7a7e1ae1`（#424、#425），2026-10-17 至 2026-10-18（Asia/Shanghai），Node 24.19.0、pnpm 10.13.1，锁定的 DSH 0.2.1-rc.2；根测试另在安装的 DSH 0.2.0-rc.2 上运行。下列检查均在合入后的版本上通过；`verify`、`verify:plugins`、安装的 DSH 与 Git 同步在合入前也已通过。评审之后的修正按表格最后一行所列方式检查。#425 把同步设置区块拆成几个模块，它们以相同名称从 `sync-view.ts` 导入表单的检查，因此无需改动。

## 改动内容

| 项目 | 之前 | 现在 |
|---|---|---|
| 记忆空间的列表与嵌入默认值 | `src/host/protocol.ts` 声明了记忆空间 `./contracts` 中 `CATEGORIES`、`SOURCES`、`EDGE_TYPES`、`INTENTS` 以及嵌入端点、模型、协议与协议列表的副本。命名工具用这份副本生成 `category`、`source`、`edge` 与 `type` 的枚举，`config-values.ts` 也从这里再导出嵌入默认值。自 #421 起，客户端代码不再读取它们 | protocol.ts 不再声明它们。`src/host/tools.ts` 从 `dsh-mnemon-source-memory-spaces/contracts` 导入这三个列表，`config-values.ts` 从那里再导出嵌入默认值，与 #416 以来 Host 取用空间 id 规则和各 Source 文件名的方式相同。客户端一个都不需要，因此客户端构建的打包列表没有新增内容，Starter 的客户端仍只经由唯一的网关模块取用记忆空间的代码（`tests/plugin-repository-boundary.spec.ts`）。记忆空间的 Source 也改用这些列表检查分类、来源、意图与边 |
| 运行时记忆的上限 | `config-values.ts` 重写了 10 KiB、4 KiB 与 1 MiB | 默认值取自 `RUNTIME_MEMORY_LIMITS`，最大值取自 `dsh-mnemon-source-runtime/contracts` 新增的导出 `RUNTIME_MEMORY_LIMIT_MAX_BYTES`，即其配置与控制器本来就采用的值 |
| 放置能力 | 列了三遍：Host 的设置 schema（`src/host/config.ts`）、记忆空间的 `MemoryPlacementCapability` 类型及其配置中的检查。记忆空间的放置为每项能力给出的标签是以该类型为键的记录，由编译器保证完整，保持不变 | 记忆空间 `./contracts` 导出 `MEMORY_PLACEMENT_CAPABILITIES`，类型由它推导；两个 schema 都使用这个列表 |
| 超时范围 | Host 接受 100–120,000 ms 的 `timeoutMs`，记忆空间接受 1–600,000 ms | 不变。两处各加一条注释，写明另一处的范围，并说明统一它们已列入路线图 |
| Starter patch 中的默认值 | `cordis.patch.yml` 为 `mnemon` Entry 重写了十二项设置，其中包括嵌入、召回质量与超时 | 不变，另加测试保证它写入的每个值都是代码中的默认值：既是 schema 的默认值（DSH 生成的表单显示的值），也是 `resolveConfig` 的默认值 |
| 通信结果类型 | `src/host/subagent.ts` 声明了三个会经过 RPC 的结果：`DelegatedAnswerResult`（`agent-search` 附加到召回结果上的回答）、`CoordinatedDocumentResult`（文档的写入与归档）和 `CoordinatedRuntimeMemoryResult`（运行时记忆的写入，作为管理结果的值） | 移入 protocol.ts；subagent.ts 再导出它们，与它自 #411 起再导出 `DelegatedWriteResult` 的做法相同 |
| RPC 端点名称 | 随手写的字符串：一端是客户端的 `MnemonClient`、设置作用域以及页面借给组件的操作，另一端是 Host 的分支判断 | protocol.ts 中的 `MNEMON_RPC_ENDPOINTS` 列出 Host 在九个通道上提供的全部端点，共 75 个，名称不变。`callMnemonRpc`、`MnemonClient` 的调用以及页面借给组件的操作都以它为类型，组件操作还按读写方式区分。拼错的名称无法通过编译；调用本身写明通道或读写方式时，发到不提供它的通道或以不对应的方式调用的名称也无法通过编译；在运行时才选定通道或方式的调用，如 `assistSource` 与页面借出的操作，则接受其任一通道提供的名称。View 处理器改从这份列表读取名称，不再自写字面量；API Gateway 的设置检查把远程页面访问每个设置端点所需的条件记在一张以它为类型的映射中，日后新增的设置端点在给出条件之前无法通过编译；它只查找字符串，因此格式错误的名称仍得到未知端点的回答 |
| Git 同步检查 | `src/client/sync-view.ts` 以“与 Host 的检查相同”为由，重新实现了 Host 对仓库地址、分支、目录与作者邮箱的检查（`sync-config.ts`）、对计算机名称的检查（`machine-identity.ts`）以及对 GitHub 仓库名称的检查（`github-auth.ts`） | 这些规则与 `MNEMON_MACHINE_LABEL_MAX` 移入 `src/host/sync-rules.ts`，它不导入任何模块，由 protocol.ts 再导出。两端都调用它；每条提示信息仍在原处，逐字不变 |
| 接口参考（文档错误） | 通道表写着远程页面可以读取 `/dsh-mnemon-review`，只有 `reconcile` 与 `apply` 需要 trusted-host 授权 | 这一行改为需要 `remoteAccess: trusted-host`，与 `MnemonRemoteService.review` 以及表格下方的段落一致；有测试固定每个审查端点的拒绝 |

### 表单与 Host 的不同之处

共享规则保留了两端各自的判断。两端原本不一致的地方，各自仍按原来的方式处理：

- **本地仓库路径。** 表单无法知道 Host 运行在哪个平台上，因此使用 `portableAbsolutePath`：POSIX 路径、带盘符的 Windows 路径或 UNC 共享。Host 传入 Node 按其自身平台判断的 `path.isAbsolute`，因此每个平台上通过校验的路径与以前相同。两者在三种情况下不同，`tests/sync-rules.spec.ts` 都已固定：在 POSIX Host 上，表单接受 `C:\repo` 与 `\\server\share`，Host 保存时拒绝；在 Windows Host 上，Host 接受从当前驱动器根目录开始的路径 `\repo`，表单则显示格式提示。
- **仓库地址或分支内目录中的 NUL 字节**：只有 Host 拒绝，与以前相同。
- **其余本来就是同一条规则。** 只有 Host 写出的分支检查（不含 `\`、不以 `/` 开头、不是 `@`）已由两端共用的模式保证；空的作者邮箱在 Host 上仍表示使用这台计算机的 Git 身份，表单则把它作为单独的选项提供。

改变上述任一处不同，都会改变用户看到的内容或通过校验的值，因此两者是留给路线图的发现，不属于这一批改动。

### 保持原样的部分

- **只有其他调用方使用的端点。** Host 提供的端点中有 28 个已不被随附的客户端调用：工作台的页面改用 Source 管理与 Host 协助之前使用的直接路径（859d8df8，2026 年 9 月）、8 月起由回合记忆栏的 `turn-activities` 取代的单回合读取 `turn-activity`、激活通道的 `body` 端点，以及 View 通道的 `preview`、`inspect-plugin` 与 `install-plugin`。[接口参考](../../zh-CN/reference/interfaces.md#rpc-通道)仍列出它们，`scripts/verify-sync-git.mjs` 也通过直接的 `runtime-memory` 端点写入。端点测试逐一列出这 28 个，移除其中一个或让客户端重新调用其中一个都须明确决定；移除它们会改变 Host 的接口，不属于这一批改动。
- **Host 为转发的设置定的默认值。** `timeoutMs`（10,000 ms）与 `defaultRecallLimit`（10）是 Host 自己的设置：前者也限制 Core 对 Source 的调用，后者也限制 `/mnemon recall` 命令。记忆空间相同的默认值只用于 Starter 未配置的实例，例如单独挂载的实例。patch 测试以 Host 的默认值检查 patch。
- **命名工具中的其他字面量枚举**（召回模式、运行时记忆的操作、目标与重要性、文档操作）重述了 Source 操作的结构，而 Source 并未把它们作为列表导出。工具 schema 告诉模型什么，属于审计第 M4 项与计划第 6 项。
- **`RecallResult`** 仍在 subagent.ts 中：它是 `mnemon_recall` 与 `mnemon_related` 返回给模型、由 `/mnemon recall` 打印的结果，不是 RPC 的回答。
- **记忆空间的页面客户端** 自行声明 `supervise` 回答的结构：插件只能导入 `dsh-mnemon` 的公开入口，而协议不在其中。

## 等价性

- **浏览器包。** 以相同方式（根包、全部插件、再构建根包）从 main `7a7e1ae1` 与本分支构建的 `lib/client.js` 只有两处不同：一是 `src/host/sync-rules.ts` 的区段，十个模式与七个函数及其文档注释，`sync-view.ts` 中表单的检查改为调用它们，各缩短为一行；二是页面借给组件的操作改为取用找到的端点（`names.find`），原先是检查 `names.includes`（948,312 字节变为 950,182 字节，+1,870）。端点列表、移动的类型与删除的常量都不会进入客户端包：rolldown 会舍弃客户端不读取的内容。记忆空间与运行时记忆的 `lib/client.js` 以及记忆空间的 `lib/provider-sdk.js` 逐字节不变。
- **Host 包。** `lib/index.js` 只在各项所述之处不同（686,227 字节变为 689,453 字节）：导入记忆空间与运行时记忆的值并删去副本、运行时记忆上限常量改读 `RUNTIME_MEMORY_LIMITS` 与 `RUNTIME_MEMORY_LIMIT_MAX_BYTES`、共享的同步规则及其调用、端点列表与读取它的 View 处理器，以及远程设置映射。命名工具的代码逐字节不变，因为它们使用的名称现在以相同拼写导入。
- **记忆空间与运行时记忆。** 记忆空间的 `lib/contracts.js` 增加 `MEMORY_PLACEMENT_CAPABILITIES`（5,871 字节变为 6,136 字节），`lib/index.js` 改用 contracts 中的列表做检查（202,293 字节变为 202,009 字节）。运行时记忆的 contracts chunk 增加 `RUNTIME_MEMORY_LIMIT_MAX_BYTES`（4,018 字节变为 4,203 字节），chunk 因此改名。
- **模型看到的内容。** `tests/memory-tools.spec.ts` 把每个工具的名称、描述、输入与输出 schema 与 `tests/fixtures/model-tools.json` 比较，本改动没有修改这个文件；测试通过。
- **包内容。** `verify:package` 统计到 66 个文件（原为 65 个，新增 `sync-rules.d.ts`），打包 479,524 字节（原为 476,306），解包 2,030,924 字节（原为 2,021,100），公开类型依赖（声明文件）35 个（原为 34 个，新增的是 `sync-rules.d.ts`）；客户端的 21 个声明不变。
- **同步检查，逐项相同。** [`harness/sync-rules-equivalence.mts`](./harness/sync-rules-equivalence.mts) 用 4,650 个输入运行表单的六项检查与 Host 的六项检查（含一次 GitHub 仓库创建）：由规则特别处理的 16 个字符（NUL、`\`、`/`、`:`、`@`、`{`、空格、换行、U+2028 等）组成的所有不超过三个字符的字符串、各长度上限处的值，以及由 17 个前缀和 12 个主体组合出的仓库地址。它记录每个判断、Host 返回的每个值和抛出的每条信息。换入 main 的 `sync-view.ts`、`sync-config.ts`、`machine-identity.ts`、`github-auth.ts` 与 `protocol.ts` 后，输出文件完全相同（`2f36fd57d8669c36a9374b248d7f7d83f591232dce1e0923f8e1e68df5fb0460`）。把表单的路径规则改为接受单个开头的反斜杠后，表单的摘要随之改变。
- **新测试描述的正是 main 原有的行为。** 换入 main 的模块后，新增与改动的测试都通过：端点、API Gateway、View、客户端传输与组件 host 测试在 main 的 `src/client/api.ts`、`component-host.ts`、`remote-rpc.ts` 以及 `src/host/view-rpc.ts`、`remote-rpc.ts` 上通过（5 个文件 57 个测试）；配置与工具测试在 main 的 `config.ts`、`config-values.ts`、`protocol.ts` 与 `tools.ts` 上通过（3 个文件 49 个）；同步测试在 main 的四个同步模块上通过（5 个文件 87 个）。
- **测试能发现偏差。** 往列表中加入一个 Host 不提供的端点，两项端点测试都会失败，View 通道也不例外：这样的名称能通过其检查，随后得到 `Unknown View operation`；把 `turn-activity` 从列表中删去，两项也都会失败，其中 Host 测试是因为它还会探测处理器模块中出现的每个单词；把 patch 的 `timeoutMs` 改为 9,999，patch 测试失败；客户端端点拼错、在 Pack 通道上发送 `status`、借出的写操作用了读端点的名称，或以读方式调用 `embedding-fill` 组件操作，类型检查都会失败。

新增与扩展的测试：

| 位置 | 证明的内容 |
|---|---|
| `tests/rpc-endpoints.spec.ts` | Host 注册列出的九个通道，每个处理器恰好提供为它列出的端点，探测输入包括所有列出的名称以及其模块中出现的每个单词。客户端经由 `MnemonClient` 的每个方法（新增方法而不更新测试会使测试失败）、设置作用域以及页面借给组件的操作，只调用列出的端点；它从不调用的列出端点恰好是为其他调用方保留的 28 个 |
| `tests/sync-rules.spec.ts` | 表单与 Host 接受相同的分支、目录、作者邮箱、计算机名称与 GitHub 仓库名称（后者经由 GitHub 登录自己的 `create` 检查），除本地路径外也接受相同的仓库地址；对本地路径，它把表单的规则与 Node 的 POSIX、Windows 规则并列固定；只有 Host 拒绝 NUL 字节，并给出它自己的信息 |
| `tests/client-platform-boundary.spec.ts` | protocol.ts 以及它取用值的五个模块都不导入 Node 的模块；此前测试只读取 protocol.ts 本身 |
| `tests/config.spec.ts` | patch 只把代码中的默认值写入 `mnemon` Entry；Host 对运行时记忆上限的默认值与范围和运行时记忆 Source 相同，即 10,240、4,096 与 1,048,576 字节；两个 schema 恰好接受列出的放置能力；均固定 schema 的提示信息 |
| `tests/remote-rpc.spec.ts` | API Gateway 恰好能访问列出的设置端点，`mutate` 只在有 trusted-host 授权时可用，其他名称（包括 `constructor` 与 `__proto__`）都以原有信息拒绝；不是字符串的名称（如 `["get"]`）得到同样的回答，设置处理器不会被调用；每个审查端点都需要授权 |
| 运行时记忆 `tests/contracts.spec.ts` | `RUNTIME_MEMORY_LIMITS` 与 `RUNTIME_MEMORY_LIMIT_MAX_BYTES` 就是其配置与控制器采用的值，控制器的提示信息不变 |
| 记忆空间 `tests/config.spec.ts`、`tests/provider-placement.spec.ts` | 持久化策略恰好接受 `MEMORY_PLACEMENT_CAPABILITIES`，其他值以原有提示信息拒绝；放置可以按其中每一项检查 Provider |

## 兼容性

- **版本差异。** Starter 的 Host 现在导入两个新导出：记忆空间的 `MEMORY_PLACEMENT_CAPABILITIES` 与运行时记忆的 `RUNTIME_MEMORY_LIMIT_MAX_BYTES`，因此这两个 Source 须与本版 Starter 一同发布，发布 PR 保持精确锁定。与 #416 相同，Node 从 Starter 自己的依赖解析它的导入，因此保留另一份 Source 的 profile 改变的是运行哪个 Source，而不是 Starter 导入什么。它新导入的其他值在锁定的版本中都已存在。较旧的 Starter 与这些 Source 一起使用时保留自己的副本，值也相同。若 Starter 与缺少这些导出的记忆空间或运行时记忆一起运行，将无法加载；精确锁定排除了这种情况，与 #416 的导入相同。没有 Source 使用 Starter 中的新内容，peer 下限不变。通信协议不变，因此仍打开着的旧版本页面与本版 Host 的交互一如既往。
- **公开 SDK。** 只有新增：上述两个导出，两个包的 README 现在都写明了它们；`MemoryPlacementCapability` 的成员不变，现由列表推导。protocol.ts 不再声明的常量从来不是任何包的导出（`protocol.ts` 是内部文件，`dsh-mnemon/client` 也没有再导出它们），移动的类型在 subagent.ts 中仍可按原名取用。
- **持久化数据与设置。** 不变：schema 的范围与默认值相同（patch 测试与现有的配置测试），同步设置文件接受的值相同（验证脚本在 POSIX 上运行；在 Windows 上，两个版本调用的是同一个 `path.isAbsolute`），写入的内容也没有变化。
- **界面与模型。** 不变：浏览器包只有上述差别，表单的检查给出相同的判断、Host 给出相同的信息（见验证脚本），工具与 fixture 一致。
- **Node 20。** `sync-rules.ts` 只使用表单原本就用的正则表达式与字符串方法。

## 命令与结果

```sh
pnpm install --frozen-lockfile
pnpm run verify
MNEMON_CLI_PATH=/nonexistent/mnemon MNEMON_PLUGIN_VERIFY_CONCURRENCY=1 pnpm run verify:plugins
DSH_HOST_ROOT=<prefix>/lib/node_modules/@deepseek-ai/dsh pnpm run test:installed-dsh   # DSH 0.2.0-rc.2
CHANGESET_BASE_REVISION=$(git rev-parse origin/main) CHANGESET_REVISION=$(git rev-parse HEAD) pnpm run release:intent
node scripts/verify-sync-git.mjs
MNEMON_E2E_DSH=<prefix>/lib/node_modules/@deepseek-ai/dsh/lib/bin.js node scripts/verify-sync-git.mjs   # DSH 0.2.0-rc.2

# 包对比：以相同方式构建 main 与本分支，再比较。
pnpm run build && pnpm --workspace-concurrency=4 -r build && pnpm run build && pnpm run verify:package
diff <main 的构建>/lib/client.js lib/client.js
diff <main 的构建>/lib/index.js lib/index.js

# 同步检查：在本分支上运行一次，换入 main 的模块后再运行一次。
node --experimental-transform-types --no-warnings docs/pr-assets/contracts-one-owner/harness/sync-rules-equivalence.mts "$PWD" "$TMPDIR/branch.json"
for file in src/client/sync-view.ts src/host/sync-config.ts src/host/machine-identity.ts src/host/github-auth.ts src/host/protocol.ts; do git show origin/main:$file > $file; done
node --experimental-transform-types --no-warnings docs/pr-assets/contracts-one-owner/harness/sync-rules-equivalence.mts "$PWD" "$TMPDIR/main.json"
git checkout -- src
cmp "$TMPDIR/branch.json" "$TMPDIR/main.json"
```

| 检查 | 结果 |
|---|---|
| lockfile | 清单与 lockfile 均无改动；`pnpm install --frozen-lockfile` |
| `pnpm run verify` | 通过：文档链接与锚点（4,816 个本地链接、368 个锚点）、类型检查、56 个文件的确定性输出、每个插件的类型检查与测试（17 个包共 593 个通过、3 个跳过；运行时记忆 81 个，记忆空间 292 个、跳过 2 个）、根测试（151 个文件，2,108 个通过、7 个跳过）、真实 Headless 激活（共 38 个工具，其中 8 个属于 Mnemon），含旧设置导入与停用的 Starter、包内容（66 个文件）、导入 15 个 Node 入口并检查 35 个公开类型依赖、publint 与 attw |
| 测试数量 | 根测试：新增 11 个（`7a7e1ae1` 上为 2,098 个），其中 6 个在两个新文件中、3 个在 `tests/config.spec.ts` 中、2 个在 `tests/remote-rpc.spec.ts` 中，另扩展 2 个。运行时记忆：新增 1 个（80 个变为 81 个）。记忆空间：新增 1 个（291 个变为 292 个），扩展 1 个 |
| `verify:plugins` | 通过：17 个独立插件仓库（各自安装、类型检查、测试与构建）、18 个打包产物、外部使用方（构建、类型检查、测试）、真实 DSH 只安装打包的 Starter 并激活其插件，以及三个可选策略插件同时激活 |
| 安装的 DSH 0.2.0-rc.2 上的根测试 | 151 个文件，2,105 个通过、10 个跳过：多出的 3 个跳过是只适用于 DSH 0.2.1 的真实宿主探针 |
| Git 同步端到端 | 在 DSH 0.2.1-rc.2 与 0.2.0-rc.2 上 64 项检查全部通过：两个真实的 DSH Web 实例经由共享的检查配置一个本地裸仓库，向它发布并从它拉取 |
| 同步检查验证脚本 | 4,650 个输入、12 项检查；main 的模块与本分支输出相同 |
| 新测试放在 main 的模块上 | 端点 5 个文件 57 个测试，配置与工具 3 个文件 49 个，同步 5 个文件 87 个 |
| 包 | `lib/client.js` 增加 1,870 字节，只有共享的同步规则与借出操作的查找；记忆空间与运行时记忆的客户端包逐字节不变 |
| `release:intent` | 已确认 `dsh-mnemon`、`dsh-mnemon-source-memory-spaces` 与 `dsh-mnemon-source-runtime` 的 changeset 覆盖 |
| 评审之后：`1928b1ab`、`b2cbe87d`、`36fd588a` 与本记录 | 根包构建与 `pnpm run typecheck`；受影响的测试，其中 `tests/remote-rpc.spec.ts` 的新测试在去掉字符串检查时失败、换入 main 的 `remote-rpc.ts` 时通过，另有端点、配置、同步规则与两个边界测试（7 个文件 78 个测试）；`pnpm run test:root`（151 个文件，2,109 个通过、7 个跳过）；`node scripts/verify-docs.mjs`（4,816 个本地链接、368 个锚点）；同样三个包的 `release:intent` |
