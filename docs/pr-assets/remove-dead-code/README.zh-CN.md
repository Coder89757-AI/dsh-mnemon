# 移除无人使用的代码

[English](./README.md)

对仓库技术债的审查发现了一些没有任何调用方的声明，以及两个客户端辅助函数：它们在产品中的调用方早已被替换，只靠自己的测试存活。本改动移除它们。用户可见的行为没有变化，也没有任何公开包入口失去名称。

测试版本：分支 `claude/remove-dead-code`，基于 [#386](https://github.com/omdsh-dev/dsh-mnemon/pull/386)（`9a09c89e`），2026-10-17，Node 24.19.0、pnpm 10.13.1，锁定的 DSH 0.2.1-rc.1。

## 移除的内容

| 位置 | 内容 | 为何无人使用 |
|---|---|---|
| `src/client/ui-icons.ts` | `IconDataOutline16` | 没有页面使用；旁边公开的 `IconChevronLeftOutline14` 保留 |
| `src/host/access.ts` | `DEFAULT_PARTICIPATION` | 配置解析各层参与方式时使用相同的默认值（`src/host/config.ts`） |
| `src/host/activity-presentation.ts` | `MnemonActivityMeta` | 没有任何地方使用的联合类型别名；它的两个成员保留 |
| `src/host/protocol.ts` | `MemoryTopologyDefinition`、`MnemonSyncGitHubFlowStatus` | Host 与客户端都没有用到 |
| `src/host/storage-scope.ts` | `validateCustomStorageRoot` | 自定义数据目录由配置解析时校验（`src/host/config.ts`） |
| `src/host/subagent.ts` | `DelegatedRecallResult` | v0.3 预发布时 `RecallResult` 的别名；召回早已不再委派 |
| 记忆空间 `providers/catalog.ts`、`providers/registry.ts` | `isMemoryProviderId`、`MemoryProviderAdapterFactory` | registry 类与 `testing` 使用 `MemoryAdapterFactory` 与 `MemoryProviderAdapterFactoryContext` 作类型；没有地方使用这两个名称 |
| `src/client/component-feedback.ts` 与 `locales.ts` | `describePending`，以及每种语言的五个 `feedback.pending*` 键 | 配置页在变更生效后才说明它；只有该辅助函数自己的测试调用它 |
| `src/client/workspace-mount.tsx` | `mountMnemonSidebarLauncher` | 产品中已由 `mountMnemonSidebarNavigation` 取代，后者的回退入口就是同一行与同一套面板协调 |
| `src/client/MnemonSettingsCard.module.css` | 减少动效规则中的 `.boardRowCopy` | 没有元素使用这个类 |

有一处声明是移动而不是删除。`supervise` RPC 的结果在 Host 中声明了两次（`subagent.ts` 的 `DelegatedWriteResult`、`lifecycle.ts` 的 `SupervisedWritebackResult`），客户端的 `supervise()` 又内联声明了一份更窄的类型。现在两者都放在 `src/host/protocol.ts`（CONTRIBUTING 规定 wire 类型的位置），Host 模块与客户端都使用它们；Host 模块仍导出这两个名称。

## 检查方式

- [`harness/public-exports.mjs`](./harness/public-exports.mjs) 让 TypeScript 列出 root 包与每个插件的每个公开入口经由任意层级的再导出所公开的声明。移除之前，上表中的名称都不在其中；而 `dsh-mnemon/client` 公开的 `memoryPageStyles` 与 `IconChevronLeftOutline14` 能被找到，说明这项检查确实能识别公开名称。
- 原先驱动旧启动器的 13 个侧边栏测试，改为在没有声明原生面板位的外壳中驱动 `mountMnemonSidebarNavigation`，也就是产品在这种情况下走的路径。除此之外测试内容不变，全部通过。
- 类型检查通过。根测试：2,035 通过，6 跳过（140 个文件），少的一个是被移除辅助函数的测试。记忆空间：类型检查与 250 个测试通过。`pnpm run verify:package`：59 个文件，导入 14 个 Node 入口，核对 31 个公开类型依赖，publint 与 attw 无问题。文案指纹现在每种语言 1,341 个键。

自行检查时，传入要查找的名称：

```sh
node docs/pr-assets/remove-dead-code/harness/public-exports.mjs "$PWD" memoryPageStyles IconChevronLeftOutline14
```
