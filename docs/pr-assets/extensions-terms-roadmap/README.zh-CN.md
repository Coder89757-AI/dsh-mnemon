# 扩展指南中的两个用语，以及两条新的路线图条目

[English](./README.md)

#421 于 2026-10-17 合并后的两项小的文档后续。只改动文档，不影响任何发布内容，因此没有 changeset。

- **扩展指南。** 文档重构（#415）统一了文档中心的名称（Documentation / 文档中心），并用“运行时记忆”取代旧页面中的 hot context。由于 #421 正在修改[扩展指南](../../zh-CN/development/extensions.md)，当时没有改它：英文页仍把文档中心写作“Documentation Center”，两种语言都说常驻预算过低可能隐藏“hot context”/热记忆。现在两处都使用统一的用语。
- **路线图。** 把记忆空间的设置移入记忆空间（#421）时发现的两种行为（在该改动之前的 `main` 上也一样）作为第 10、11 项加入[计划](../../plans/review-gaps-2026-10.md)（英文）与[路线图](../../zh-CN/roadmap.md)：
  - 刚打开记忆空间时，Source 仍在启动，它的设置会把 Source 显示为未安装，持续约一秒（见 #421 在 DSH 0.2.1-rc.2 与 0.2.0-rc.2 上的录制）；
  - 用户切换或保存某个 Provider 时，若已有后台刷新正在进行且在修改之后才返回，页面会显示修改之前的列表，直到下一次读取（记忆空间 `src/client/provider-settings.tsx` 中的 `load` 不会因切换或保存而作废；由 #421 的审查发现）。

## 检查

- `node scripts/verify-docs.mjs` 与 `pnpm exec vitest run tests/docs.spec.mjs tests/package-locales.spec.mjs tests/changesets.spec.mjs`。
- 除发布说明、PR 记录与 `docs/assets` 下注明日期的素材记录外，已没有页面使用“Documentation Center”、“hot context”或“热记忆”。
