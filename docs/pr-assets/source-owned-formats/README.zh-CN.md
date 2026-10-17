# Source 拥有自己的存储格式

[English](./README.md)

开发指南写明根包拥有 Host 与 Starter，“不拥有 Source 存储实现”，架构文档也写明 Source 拥有自己的格式。但 Starter 的 Host 在四处用自己复制的规则读取 Source 的私有文件：Mnemon Pack（`src/host/pack.ts`）、Mnemon 存储的内容身份（`src/host/space-identity.ts`）、状态页的存储清单（`src/host/storage-scope.ts`）和 Git 同步（`src/host/git-sync.ts`）。Source 一旦改动文件或锁文件名，备份、同步和状态页就会在没有测试报错的情况下失效；Mnemon 的表结构一变，Host 也会出错。

本改动完成审计项 H1 的 (a) 与 (b)：每个 Source 在自己的 contracts 中给出自己的文件与规则，Host 直接使用。用户能看到和保存的内容都没有变化。

(c) 让 Source 声明自己在 Pack 中的部分，已按维护者的决定取消：Mnemon Pack 备份与 Git 同步有意只覆盖官方组件（运行时记忆、项目档案、记忆空间）。dsh-mnemon 不备份、不同步安装的第三方 Source，其数据由该 Source 自行处理。[开发记忆插件](../../zh-CN/development/extensions.md#开放操作有限执行)向 Source 作者说明这一点，[备份与恢复](../../zh-CN/guides/operations.md#备份与恢复)向用户说明。

测试版本：分支 `claude/source-owned-formats`，基于 main `4996a796`（v0.5.31、[#414](https://github.com/omdsh-dev/dsh-mnemon/pull/414) 与 [#415](https://github.com/omdsh-dev/dsh-mnemon/pull/415)），2026-10-17（Asia/Shanghai），Node 24.19.0、pnpm 10.13.1，锁定的 DSH 0.2.1-rc.1；根测试另在安装的 DSH 0.2.0-rc.2 上运行。

## 移到了哪里

| 内容 | 原位置 | 现位置 |
|---|---|---|
| USER.md/MEMORY.md 投影及其字节计数 | `pack.ts`，复制自 Runtime 控制器 | `dsh-mnemon-source-runtime/contracts`：`runtimeProjection`、`runtimeBytes`；控制器与 Pack 共用 |
| Runtime 目录、文件、锁文件及其过期规则、本地归档、单条大小上限 | `pack.ts`、`storage-scope.ts`、控制器 | `RUNTIME_DIRECTORY`、`RUNTIME_MEMORIES_FILE`、`RUNTIME_PROJECTION_FILES`、`RUNTIME_LOCK_FILE`、`RUNTIME_LOCK_STALE_MS`、`RUNTIME_ARCHIVE_DIRECTORY`、`RUNTIME_ENTRY_MAX_BYTES` |
| 为存储清单统计 memories.json | `storage-scope.ts` | `summarizeRuntimeMemories` |
| 备份所携带的 Documents 索引 | `pack.ts` | `dsh-mnemon-source-documents/contracts`：`parseDocumentIndex`、`DocumentIndex`、`DOCUMENT_FILENAME_PATTERN` |
| Documents 目录、索引、锁文件及其过期规则 | `pack.ts`、`storage-scope.ts`、控制器 | `DOCUMENTS_DIRECTORY`、`DOCUMENTS_INDEX_FILE`、`DOCUMENTS_LOCK_FILE`、`DOCUMENTS_LOCK_STALE_MS` |
| 统计 index.json | `storage-scope.ts` | `summarizeDocumentIndex` |
| 备份所携带的 Native 注册表 | `pack.ts` | `dsh-mnemon-source-memory-spaces/contracts`：`parseMemorySpaceRegistry`、`MemorySpaceRegistryEntry`、`MemorySpaceRegistryFile` |
| 存储布局：data 目录、注册表、`mnemon.db`、空间 id 规则、Mnemon 的 `active` 文件、Provider 注册表 | `pack.ts`、`storage-scope.ts`、注册表、Mnemon runner | `MEMORY_SPACES_DIRECTORY`、`MEMORY_SPACE_REGISTRY_FILE`、`MEMORY_SPACE_DATABASE_FILE`、`MEMORY_SPACE_ID_PATTERN`、`MNEMON_ACTIVE_STORE_FILE`、`MEMORY_PROVIDER_REGISTRY_FILE` |
| 统计注册表与 Provider 注册表 | `storage-scope.ts` | `summarizeMemorySpaceRegistry`、`summarizeMemoryProviderRegistry` |
| Mnemon 表结构：比较与合并同一存储的两个副本（[#370](https://github.com/omdsh-dev/dsh-mnemon/issues/370)、[#391](https://github.com/omdsh-dev/dsh-mnemon/issues/391)） | `src/host/space-identity.ts` | `dsh-mnemon-source-memory-spaces/space-identity`，新的仅限 Node 入口，构建与类型方式同 `./native-cli`。它只导出一个类，以存放副本的目录创建，提供 `of`、`contains`、`merge` 与 `dispose`；实现、行数上限与测试钩子留在内部模块中。它的 17 个测试和 Mnemon 表结构测试夹具一并迁移，另有一个测试固定该入口的公开内容 |
| 同步重复的 Pack 载荷布局 | `git-sync.ts` | `pack.ts` 导出 `payloadPrefix` 与 `DOCUMENTS_INDEX_PATH` |

这些 contracts 辅助函数都是纯函数，不导入任何 Node 模块，因为浏览器包也会加载 contracts。四个 `summarize*` 辅助函数形式一致：从不抛出异常，返回 `valid` 与各项计数；状态页显示的消息留在 Host，保持不变。`runtimeBytes` 用 `TextEncoder` 计数，结果与控制器原来使用的 `Buffer.byteLength` 一致，未配对的代理项也一样；有测试在隐藏 `Buffer` 的情况下计算它。

Host 保留属于自己的部分：Pack 格式（manifest、checksums、条目清单、合并、删除记录）、Pack 自己的锁 `.dsh-pack.lock`，以及它等待任何锁的时长（5 秒）。它现在只按某个 Source 自己的过期规则接管该 Source 的锁（目前两者都是 30 秒，与之前相同），并且无论 manifest 以何种顺序列出组件，仍先取 runtime 锁、再取 documents 锁。

### 有意留在 Host 的部分

- `pack.ts` 中的 `parseRuntime` 是 Pack 对传入 memories.json 的检查，它与控制器的读取规则有意不同：遇到带分支范围的用户档案条目时丢弃该范围而不是拒绝整个文件，并执行大小上限。共用一个解析器会改变其中一方的行为。
- `pack.ts` 校验载荷内容哈希时仍读取档案 Markdown 的 front matter（`id:` 行与正文），合并时以新 id 保留分歧副本时也会改写它。两者都用 `node:crypto` 计算哈希，而保留副本是 Pack 的合并决策；迁移它们需要 Documents 提供 Node 入口。
- Pack 复制存储时自己的安全检查：SQLite 文件头，以及拒绝预写日志尚未落盘的存储。
- `src/host/subagent.ts` 用自己的 `Buffer.byteLength` 检查压缩的字节预算；该文件属于审计项 H2。
- `MNEMON_PACK_COMPONENTS` 仍把 Pack 固定为三个官方组件，这是有意的设计（见上文）。

### 顺带发现的后续事项

- Pack 只携带每个 Native 空间的六个字段，因此替换或合并导入会以不含空间 `placement` 与 `metadataSource` 的内容重写本地注册表。这一行为早于本改动；本改动保持原样，并在 `parseMemorySpaceRegistry` 处写明。
- Host 中仍有较小的 Source 规则副本：空间名称与描述的 100 与 1,000 字符上限、`src/host/config.ts` 中的空间 id 规则，以及 `src/host/subagent.ts` 中的 USER.md/MEMORY.md 文件名。

## 等价性

- **逐字节一致。** [`harness/pack-equivalence.mts`](./harness/pack-equivalence.mts) 在合成数据目录上驱动真实的 Pack 与存储清单：完整导出与仅 Runtime 导出、预览、替换导入到空目录、合并导入到已有数据的目录（使用真实 SQLite 存储，因此会执行记忆空间合并规则并写出合并后的存储）、导出合并结果、只替换两个组件，以及四个目录的存储清单。它把产生的每个字节记为 SHA-256 摘要。分别用 main 的 `src/host` 与本分支的运行一次，两份输出是同一个文件（`3ffd2ecc6c3773cd6078029b5f7c9b85429789eb9c0ab02eafb95f0561e8c833`）；两次的完整备份都是 `e908aad7181b319838d77e810754eccba2edf76e2ce8a500fca096fb5e69665f`。
- **新的根测试描述的是 main 已有的行为。** 换入 main 的 `pack.ts`、`storage-scope.ts`、`git-sync.ts` 与 `space-identity.ts` 后，`tests/pack.spec.ts`、`pack-compat-0.5.24.spec.ts`、`pack-tombstones.spec.ts`、`storage-scope.spec.ts` 与 `documents-index-integrity.spec.ts` 全部通过：67 个测试，包括四个新测试。
- **锁测试能发现错误的锁。** 让 Pack 指向另一个 runtime 锁文件名时，新的锁测试失败。

新测试：

| 位置 | 证明的内容 |
|---|---|
| `plugins/dsh-mnemon-source-runtime/tests/contracts.spec.ts` | 名称就是控制器的路径；`runtimeProjection` 等于控制器写入的 USER.md/MEMORY.md 字节，`runtimeBytes` 等于其报告的用量；不用 `Buffer` 也与 `Buffer.byteLength` 计数相同；单条上限；清单统计 |
| `plugins/dsh-mnemon-source-documents/tests/contracts.spec.ts` | 名称就是控制器的路径；解析器原样读取控制器写入的索引，规范化旧的 `.mnemon/` 路径，保留和丢弃字段的方式与之前相同，并对每条被违反的规则给出对应消息；清单统计 |
| `plugins/dsh-mnemon-source-memory-spaces/tests/contracts.spec.ts` | 名称就是注册表与 runner 使用的名称；id 规则与 `validateMemorySpaceId` 相同；解析器读取 Source 写入的注册表；拒绝情形；注册表与 Provider 注册表统计 |
| `tests/pack.spec.ts` | Pack 携带并写回的 USER.md 与 MEMORY.md 就是 Runtime Source 写入的字节；只有按其 Source 的规则已过期的锁才会被接管，仍被持有的锁会被等待（由一个 worker 线程持有） |
| `tests/pack-compat-0.5.24.spec.ts` | 现在由 Source 名称拼出的条目名，正是 0.5.24 接受的那些 |
| `tests/storage-scope.spec.ts` | 松散与损坏的区域（未知 target、缺少投影、版本 2 注册表、损坏的 JSON）给出与之前相同的状态、计数与消息 |

## 兼容性

- **版本错位。** Starter 精确锁定三个 Source 的版本，并从自己锁定的副本导入新导出，就像它已经导入 `parseRuntimeBranches` 与 `RUNTIME_ENTRY_DELIMITER` 一样。Profile 自行保留某个 Source 的旧版或新版副本时，改变的是运行哪个 Source，而不是 Starter 导入什么：Node 从 Starter 自己的依赖解析它的导入，Profile 持有其他版本时 npm 与 pnpm 都会在那里安装锁定的版本。旧版 Starter 搭配这些 Source 时继续使用自己的副本，照常工作，因为没有任何名称、取值或存储字节发生变化。没有 Source 使用 Starter 中的新内容，因此 peer 下限不变。有一项限制保持原样：Host 按 Starter 锁定版本的规则读取 Source 的文件，因此 Profile 运行该 Source 的其他版本时，读取仍按锁定版本的规则进行，就像此前按 Host 自己的副本读取一样。要让正在运行的 Source 自己决定，需要一个运行时契约，而维护者已经随 (c) 一并否决。
- **发布。** Starter 现在使用 `dsh-mnemon-source-runtime`、`dsh-mnemon-source-documents` 与 `dsh-mnemon-source-memory-spaces` 的新导出（包括新的 `./space-identity` 入口），这三个包必须与它一起发布；发布 PR 保持精确锁定。Source 不需要提高 peer 下限，因为是 Starter 依赖它们，而不是反过来。
- **公开 SDK。** 只有新增。没有任何包的导出被删除或改名，新类型也可以通过各 Source 的根入口看到（根入口会再导出其 contracts 类型）。`./space-identity` 只公开一个类，其构造函数只接收一个目录，因此行数上限与测试钩子可以自由调整。
- **持久数据。** 不变，见上面的验证：相同的备份字节、相同的导入文件与权限。
- **界面。** 不变。状态页的计数、状态与消息都相同（`tests/storage-scope.spec.ts`）。
- **Node 20。** contracts 都是普通函数。`./space-identity` 仍只在比较时加载 `node:sqlite`，其发布的类型声明不再引用 `node:sqlite` 的类型，因此在较旧的 Node 类型下也能编译。

## 命令与结果

```sh
pnpm install --frozen-lockfile
pnpm run verify
MNEMON_CLI_PATH=/nonexistent/mnemon MNEMON_PLUGIN_VERIFY_CONCURRENCY=1 pnpm run verify:plugins
DSH_HOST_ROOT=<prefix>/lib/node_modules/@deepseek-ai/dsh pnpm run test:installed-dsh   # DSH 0.2.0-rc.2
CHANGESET_BASE_REVISION=$(git rev-parse origin/main) CHANGESET_REVISION=$(git rev-parse HEAD) pnpm run release:intent
node scripts/verify-sync-git.mjs
MNEMON_E2E_DSH=<prefix>/lib/node_modules/@deepseek-ai/dsh/lib/bin.js node scripts/verify-sync-git.mjs   # DSH 0.2.0-rc.2

# 逐字节比较：先在本分支运行一次，再换入 main 的 Host 模块运行一次。
node --experimental-transform-types --no-warnings docs/pr-assets/source-owned-formats/harness/pack-equivalence.mts "$PWD" "$TMPDIR/branch.json"
for file in pack storage-scope git-sync space-identity; do git show origin/main:src/host/$file.ts > src/host/$file.ts; done
node --experimental-transform-types --no-warnings docs/pr-assets/source-owned-formats/harness/pack-equivalence.mts "$PWD" "$TMPDIR/main.json"
git checkout -- src/host && rm src/host/space-identity.ts
cmp "$TMPDIR/branch.json" "$TMPDIR/main.json"
```

| 检查 | 结果 |
|---|---|
| 锁文件 | `pnpm install --frozen-lockfile --lockfile-only` 不改动 `pnpm-lock.yaml` |
| `pnpm run verify` | 通过：文档链接与锚点、类型检查、49 个文件的确定性构建、每个插件的类型检查与测试（17 个包共 574 通过、3 跳过：Runtime 80、Documents 47、Memory Spaces 274 及 2 跳过）、根测试（2,041 通过、6 跳过，140 个文件）、真实 Headless 激活（38 个工具，其中 8 个属于 Mnemon）、包内容（59 个文件）、导入 15 个 Node 入口并核对 32 个公开类型依赖、publint 与 attw |
| 与 main 相比的测试数量 | 根测试：少 17 个（内容身份测试移入记忆空间），新增 4 个。Runtime 与 Documents：各新增 6 个。Memory Spaces：移入 17 个，新增 7 个 |
| 逐字节验证脚本 | main 与本分支输出完全相同（见“等价性”） |
| 在 main 的 Host 上运行新的根测试 | 5 个文件，67 个测试通过 |
| 浏览器包 | 各 Source 的 `lib/client.js` 分别由 main 与本分支的源码构建，逐字节相同 |
| `verify:plugins` | 通过：17 个独立插件仓库（各自完成安装、类型检查、测试与构建）、18 个打包产物、外部使用方（构建、类型检查、测试；它会导入每个声明的 Node 入口，包括 `./space-identity`）、真实 DSH 在从 0.5.29 升级的场景下只安装打包的 Starter，以及同时启用三个可选 Strategy 插件 |
| 安装的 DSH 0.2.0-rc.2 上的根测试 | 2,041 通过、6 跳过（140 个文件），与锁定宿主相同 |
| Git 同步端到端 | DSH 0.2.1-rc.1 与 0.2.0-rc.2 上 64 项检查全部通过：两个真实的 DSH Web 实例向真实的裸仓库推送并拉取 |
| `release:intent` | 已确认 `dsh-mnemon` 与三个 Source 都有 changeset 覆盖 |
