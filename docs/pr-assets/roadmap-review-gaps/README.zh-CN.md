# 把 2026 年 10 月审查发现的问题写进路线图

[English](./README.md)

v0.5.31 之后的审查产生了两类后续项。不改变行为的那些已分别提交 PR；下面九项会改变用户、插件作者或模型看到的内容，维护者要求先写进规划，不在那一批里实现。本次改动把它们列入[路线图](../../zh-CN/roadmap.md)，并在[计划](../../plans/review-gaps-2026-10.md)（英文）中逐项记录现状、拟议的改法与对应测试。写于 2026-10-17，基于 `main` 的 `f41a121f`。

| 问题 | 发现于 | 在 `f41a121f` 上核对的位置 |
|---|---|---|
| 备份与 Git 同步丢失 Native 空间的放置决定 | [#416](https://github.com/omdsh-dev/dsh-mnemon/pull/416)（各 Source 拥有自己的存储格式）的审查 | 记忆空间 `src/contracts.ts` 中的 `parseMemorySpaceRegistry` 与 `src/memory-spaces.ts` 中的 Native 加载代码；`src/host/pack.ts` 中的 `readCurrentRegistry`、`mergeRegistry` 与 `writeRegistry` |
| 统一的原子写入与锁规则 | 技术债审查 | `src/host`、各 Source 与 Holographic 驱动中 11 处 `writeFileSync` + `renameSync`，以及四种锁实现 |
| 已保存凭证的统一规则 | 把 Provider 设置移入记忆空间时 | `src/client/ProviderSettingsSection.tsx` 中的 `SAVED_SECRET_MASK` 及其 `onChange`；记忆空间 `src/memory-spaces.ts` 中的 `includeSecrets` |
| 统一的超时范围 | 合并 Host 与各 Source 的常量时 | `src/host/config.ts` 与记忆空间 `src/config.ts` 中的 `timeoutMs` |
| 回合记忆栏打开处理该工具调用的 Source 的页面 | 整理记忆工具表时 | `src/client/MnemonTurnTail.tsx` 中的 `memoryPageForTool` 与 `itemTarget` |
| 具名记忆工具只传递 Source 接受的参数 | 整理记忆工具表时 | `src/host/tools.ts` 中开放的 schema 与 `mnemon_document_create` 的参数透传、`src/core/composition.ts` 中封闭 schema 的检查、记忆空间 `src/source.ts` 中召回 Route 的 `limit` 与 remember Action 的 `importance` |
| Provider 自带翻译文案 | 把 Provider 设置移入记忆空间时 | `src/client/locales.ts` 与记忆空间 `src/client/pages.tsx` 中的 `readSources.model.<id>` |
| 记忆空间通过适配器访问 Mnemon Native | 技术债审查 | 记忆空间 `src/service.ts` 中的 `embed --status`、`embed --all`、`--version` 与 `import` |
| 重复插件代码的 SDK 辅助函数 | 技术债审查 | 9 个 Provider 的 `src/index.ts` 与各 Source 的页面辅助代码 |

## 检查

- `pnpm run verify:docs`：所有链接与锚点都能解析，包括计划与计划索引使用的路线图锚点。
- `pnpm exec vitest run tests/docs.spec.mjs`。

仅改动文档，不影响任何发布内容，因此没有 changeset。
