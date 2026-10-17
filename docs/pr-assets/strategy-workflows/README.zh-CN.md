# 策略声明自己驱动的后台工作

[English](README.md)

验证于 2026-10-17（Asia/Shanghai），基于 `main` `3b33e07e` 加上本改动，锁定 DSH 0.2.1-rc.1，并使用从 npm 安装的 DSH 0.2.0-rc.2。

## 原来的问题

Host 通过比较策略的类型 id 是否为分层策略的 `default-three-tier` 来决定运行哪些后台工作，共三处：

- `lifecycle.ts` 只在所配置的策略为 `default-three-tier` 时运行空闲审查，并且只审查该类型 id 的策略组合的回合；
- `subagent.ts` 通过 `threeTierActionWorkflow` 接管运行时记忆的写入以维护容量（先归档较早的条目）。这个辅助函数从分层策略插件的 `extension-sdk` 导入，比较的也是同一个类型 id。

因此 Host 在构建时依赖一个具体的策略包，通用策略和第三方策略都无法选用这两项工作。`docs/plans/plugin-first-ui.md` 写明分层策略提供它驱动的后台任务，而这里是 Host 仍替它做决定的最后一处。

## 改动内容

- **契约。** `MemoryStrategyManifest` 新增可选字段 `workflows`，已知的 id 列在 `MEMORY_STRATEGY_WORKFLOWS` 中：`idle-review` 与 `runtime-capacity`（`src/core/contracts/view.ts`）。`defineMemoryStrategy` 校验 id 的格式并拒绝重复；不认识的 id 原样保留，较新的策略因此仍能加载。
- **分层策略。** 其 manifest 声明 `workflows: ['idle-review', 'runtime-capacity']`。`threeTierActionWorkflow` 继续导出，标记为已弃用。
- **Host。** `src/host/strategy-workflows.ts` 根据声明回答“这个策略是否驱动这项工作”。空闲审查读取两份声明：组合该回合的策略（经由保存其定义的 generation），以及当前生效的组合所安装的已配置策略。运行时容量维护在三个入口（具名工具、View Action、浏览器管理）都读取该 generation 所选策略的声明。`subagent.ts` 不再导入分层策略插件。

## 行为一致性与版本错配

随附的策略行为不变：分层策略声明的恰好是原来由其类型 id 代表的两项工作，通用策略什么也不声明。（范围组合、轻量上下文与主动记录是策略扩展，不是策略，没有这种 manifest。）

| Starter | 分层策略 | 结果 |
|---|---|---|
| 本改动 | 本改动（声明两项） | 两项工作，依据声明 |
| 本改动 | 0.5.9 或更早（未声明），由 Profile 保留 | 两项工作：未声明且类型 id 为分层策略时，按声明了两项处理 |
| 0.5.31（已发布） | 本改动 | 两项工作：旧 Host 按类型 id 判断，并保留不认识的字段 |
| 0.5.31 | 0.5.9 | 不变 |

第三行用已发布的包核对过：`harness/old-starter-accepts.mjs` 从一个从 npm 安装的 profile 中加载 `dsh-mnemon@0.5.31` 及其分层策略，并定义一个 manifest 带有 `workflows` 的策略。结果：`{"starter":"0.5.31","accepted":true,"keptWorkflows":["idle-review","runtime-capacity"],"typeId":"default-three-tier"}`。

分层策略插件没有用到 Starter 的新导出（这个字段只是数据），所以它对 `dsh-mnemon` 的 peer 下限保持 `^0.5.17`。

## 测试

- `tests/strategy-workflows.spec.ts`（新增）：保留声明，拒绝格式错误或重复的 id，不认识的 id 可以加载并被忽略；`strategyDrives` 依据声明（只声明 `runtime-capacity` 的分层策略不做空闲审查），类型 id 兜底只适用于未声明的分层策略；容量维护只接管 Runtime 的 `mutate` Action；View 的策略从其 generation 读取。
- `tests/lifecycle.spec.ts`：新增两项，声明 `idle-review` 的第三方策略会被审查，未声明它的分层策略不会。测试夹具中的组合现在可以带上已声明的策略；原有 67 项不变并全部通过。
- `tests/runtime-capacity-workflow.spec.ts`：新增一项，声明 `runtime-capacity` 的独立策略会归档。原有的独立策略用例整体复制了分层策略的 manifest，现在写明 `workflows: []`，继续测试一个什么都不声明的策略。
- 分层策略插件自己的测试检查它的声明。

## 验证

在仓库根目录用 Node 24.19 与 pnpm 10.13.1 运行：

```bash
pnpm exec vitest run tests/strategy-workflows.spec.ts tests/lifecycle.spec.ts tests/runtime-capacity-workflow.spec.ts
pnpm --filter dsh-mnemon-strategy-default-three-tier run typecheck && pnpm --filter dsh-mnemon-strategy-default-three-tier run test
pnpm run verify
DSH_HOST_ROOT=<DSH 0.2.0-rc.2 安装目录> pnpm run test:installed-dsh
CHANGESET_BASE_REVISION=<main> CHANGESET_REVISION=<head> pnpm run release:intent
```

结果：VERIFY_RESULTS
