# 计划新增五项

[English](./README.md)

2026 年 10 月审查这一批的最后几个 PR 又发现了五处问题，此前只做了记录，尚未列入计划。本次把它们作为第 19 至 23 项加入[计划](../../plans/review-gaps-2026-10.md)（英文），每项写明现状、改法与测试，并以中英两种语言加入[路线图](../../zh-CN/roadmap.md)。只改动文档，不影响任何发布内容，因此没有 changeset。写于 2026-10-18。

| 问题 | 发现于 | 核对位置 |
|---|---|---|
| 19. Git 同步表单与 Host 对部分本地路径的判断不一致，且只有 Host 拒绝 NUL 字符 | 统一同步校验规则时（#426） | `src/host/sync-rules.ts` 中的 `portableAbsolutePath`，`src/host/sync-config.ts` 中的 `isAbsolute` 与 NUL 检查 |
| 20. Host 中有 28 个端点已不再被发布的客户端调用 | 统一列出 Host 端点时（#426） | `tests/rpc-endpoints.spec.ts` 中的 `SERVED_FOR_OTHER_CALLERS` |
| 21. 客户端包带有构建机器的路径（构建维护） | 对比构建产物时（#426） | 构建后 `lib/client.js` 中 CSS 模块区段的注释 |
| 22. ByteRover 发布的类型声明丢失类型（构建维护） | 拆分客户端模块时（#425） | 忽略工作区循环依赖时 `pnpm -r build` 的构建顺序；已发布的 0.5.5 声明文件 |
| 23. 多条记忆同分时，每次召回可能保留不同的记忆 | 截取 v0.5.32 图集时（#424） | 记忆空间 `src/service.ts` 中只按分数排序 |

## 检查

- `node scripts/verify-docs.mjs` 与 `pnpm exec vitest run tests/docs.spec.mjs tests/package-locales.spec.mjs tests/changesets.spec.mjs`。
