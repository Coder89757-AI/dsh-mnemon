# 在 Starter 的运行时 Source 旁再挂一个 — issue #397

[English](./README.md) | [验证记录](./verification.json)

issue #397 在通用策略下，于 Starter 的运行时 Source 旁再挂载一个：项目轨之外的一条共享轨。此后每次调用 `mnemon_runtime_memory` 都失败，报 `Runtime Action is ambiguous; use an exact View ActionOffer`，而且也拿不到可以改用的确切 offer。

基线：main `4feee034`。修复：`63ab00dc`，以及审查后的 `e0173301`。运行于 2026-10-16（Asia/Shanghai）：
- macOS 15.6 arm64，Node 24.19.0；
- 无头 Chrome，1280×800，zh-CN，浅色；
- DSH 0.2.1-alpha.3（npm `alpha`），通过 `scripts/serve-e2e.mjs` 运行。

## 原因

`mnemon_runtime_memory` 收集 View 中每个运行时 Source 的 `mutate` offer，并要求恰好一个。挂了两个运行时 Source 就有两个。View 和对待其他具名工具一样，把这个工具绑定到 Starter 实例，并把该实例的 offer 从模型读到的路由信封中去掉。于是工具不肯选，模型也拿不到 Starter 实例的确切 offer。

## 修复

工具执行 View 绑定给它的那个实例的 offer：Starter 实例，或唯一的那个运行时 Source。这条规则现在集中在一个函数 `namedToolInstance` 里，View 的绑定也用它。其他运行时 Source 在信封里保留各自确切的 offer，供 `mnemon_view_action` 使用。挂了多个运行时 Source 而都不是 Starter 实例时，工具仍然拒绝，错误信息会列出可用的确切 offer。只有一个运行时 Source 的 profile 行为不变。

审查发现，第一版会拒绝只在一个 runtime Source 上提供 `mutate`、而那个 Source 又不是 Starter 的 View；Scoped 组合可能产生这种 View，而 main 能正常写入。现在工具采用所绑定 Starter 实例的 offer，否则采用唯一的 offer，只有多个 runtime Source 都提供 `mutate`、且其中没有 Starter 的时才拒绝；Source 会话默认的选择遵循同样的规则。文档说明了什么是 Starter 实例，以及在分层策略下同一角色的第二个 Source 需要 Scoped 组合。

## 方法

`pnpm e2e:serve --general-strategy --second-runtime` 选中通用策略，并像 issue 中的 profile patch 那样插入 `mnemon-source-runtime-global`：一个数据目录在夹具内的运行时 Source。在 Mnemon E2E 对话中发送 `general-strategy-check remember`。脚本模型先检查 View 接入了哪些 Source，再用 `mnemon_runtime_memory` 保存一条事实。只有模型决策是脚本化的；DSH、策略、其 View、两个 Source 和写入都是真实运行。基线使用同一构建，只把 `src/host/subagent.ts`、`src/host/protocol.ts` 与 `src/host/view-presentation.ts` 换成 main 的版本。

## 修复前后

main 与修复后，View 都接入了两个运行时 Source：`source:include:mnemon-source-runtime` 与 `source:include:mnemon-source-runtime-global`，另有项目档案和记忆空间。

| main | 修复后 |
|---|---|
| ![写入失败：Runtime Action is ambiguous; use an exact View ActionOffer](./before.jpg) | ![Saved through the general Strategy](./after.jpg) |

修复后，**记忆系统 → 运行时记忆** 中，这条事实出现在 Starter 实例的 MEMORY.md 里：

![MEMORY.md 中有 The general-strategy check build uses pnpm 11.](./after-runtime-memory.jpg)

## 自动化检查

`tests/source-instances.spec.ts` 用真实的 Source 和通用策略组合出带第二个运行时 Source 的环境：
- `mnemon_runtime_memory` 写入 Starter 实例，另一个实例不受影响；另一个实例的 offer 列在路由信封里，仍能通过 `mnemon_view_action` 写入，Starter 实例的 offer 则不列出；
- 有两个运行时 Source 而都不是 Starter 实例时，错误信息列出两个确切的 offer。

两个测试在 main 上都失败。

## 限制

- 分层策略在组合 View 时仍拒绝同一角色的第二个 Source；issue 中的 profile 使用的是能组合多个 Source 的通用策略。
- 通用策略不做运行时容量维护，所以 MEMORY.md 写满时，两条轨都和以前一样报告容量错误。
