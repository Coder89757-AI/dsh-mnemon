# 策略声明自己驱动的后台工作

[English](README.md)

验证于 2026-10-17（Asia/Shanghai），基于 `main` `3b33e07e` 加上本改动，锁定 DSH 0.2.1-rc.1，并使用从 npm 安装的 DSH 0.2.0-rc.2。

## 原来的问题

Host 通过比较策略的类型 id 是否为分层策略的 `default-three-tier` 来决定运行哪些后台工作：

- `lifecycle.ts` 只在所配置的策略为 `default-three-tier` 时运行空闲审查，并且只审查该类型 id 的策略组合的回合；
- `subagent.ts` 在三个入口通过 `threeTierActionWorkflow` 接管运行时记忆的写入以维护容量（先归档较早的条目）。这个辅助函数从分层策略插件的 `extension-sdk` 导入，比较的也是同一个类型 id。

因此 Host 会加载一个具体策略包的代码（已发布的 0.5.31 的 `lib/index.js` 在启动时导入那个 `extension-sdk`），通用策略和第三方策略都无法选用这两项工作。`docs/plans/plugin-first-ui.md` 写明分层策略提供它驱动的后台任务，而这里是 Host 仍替它做决定的最后一处。

## 改动内容

- **契约。** `MemoryStrategyManifest` 新增可选字段 `workflows`，已知的 id 列在 `MEMORY_STRATEGY_WORKFLOWS` 中：`idle-review` 与 `runtime-capacity`（`src/core/contracts/view.ts`）。`defineMemoryStrategy` 校验 id 的格式并拒绝重复；不认识的 id 原样保留，较新的策略因此仍能加载。
- **分层策略。** 其 manifest 声明 `workflows: ['idle-review', 'runtime-capacity']`。`threeTierActionWorkflow` 继续导出，标记为已弃用。
- **Host。** `src/host/strategy-workflows.ts` 根据声明回答“这个策略是否驱动这项工作”。回合结束时，Host 记录组合该回合的策略（经由保存其定义的 generation）及其是否声明了 `idle-review`；之后只有当这个策略仍是所配置的策略时才运行空闲审查。判断只读取回合记录下来的内容，所以审查定时器不会再去运行时里查找任何东西。运行时容量维护在三个入口读取该 generation 所选策略的声明：没有固定回合的运行时写入、具名工具与 View Action 的写入，以及浏览器管理。`subagent.ts` 不再导入分层策略插件。

## 行为一致性与版本错配

随附的策略行为不变：分层策略声明的恰好是原来由其类型 id 代表的两项工作，通用策略什么也不声明。以展开分层策略 manifest 的方式构造的第三方策略，现在也会复制这份声明；写 `workflows: []` 即可不参与，changeset 与扩展开发指南都写明了这一点。（范围组合、轻量上下文与主动记录是策略扩展，不是策略，没有这种 manifest。）

| Starter | 分层策略 | 结果 |
|---|---|---|
| 本改动 | 本改动（声明两项） | 两项工作，依据声明 |
| 本改动 | 0.5.9 或更早（未声明），由 Profile 保留 | 两项工作：未声明且类型 id 为分层策略时，按声明了两项处理 |
| 0.5.31（已发布） | 本改动 | 两项工作：旧 Host 按类型 id 判断，并保留不认识的字段 |
| 0.5.31 | 0.5.9 | 不变 |

第三行用已发布的包核对过：`harness/old-starter-accepts.mjs` 从一个从 npm 安装的 profile 中加载 `dsh-mnemon@0.5.31` 及其分层策略，并定义一个 manifest 带有 `workflows` 的策略。结果：`{"starter":"0.5.31","apiVersion":"dsh-mnemon/v1","accepted":true,"keptWorkflows":["idle-review","runtime-capacity"],"typeId":"default-three-tier"}`。

分层策略插件没有用到 Starter 的新导出（这个字段只是数据），所以它对 `dsh-mnemon` 的 peer 下限保持 `^0.5.17`。

## 测试

- `tests/strategy-workflows.spec.ts`（新增）：保留声明，拒绝格式错误或重复的 id，不认识的 id 可以加载并被忽略；`strategyDrives` 依据声明（只声明 `runtime-capacity` 的分层策略不做空闲审查），类型 id 兜底只适用于未声明的分层策略；容量维护只接管 Runtime 的 `mutate` Action；View 的策略从其 generation 读取。
- `tests/lifecycle.spec.ts`：夹具现在像 Core 一样，让每个 View 对应组合它的策略及该策略自己的 generation。每个与策略有关的用例都在分层策略未声明（0.5.10 之前）和已声明（随附版本）两种情况下各跑一次：配置了自定义策略、已安排审查后切换策略、由兜底策略组合的回合、没有记忆的回合，以及分层策略自己的审查。新增用例：声明了 `idle-review` 的第三方策略会被审查；只声明 `runtime-capacity` 的分层策略不会；即使运行时查找会抛错，已安排的审查也能照常判断，因为 DSH 遇到定时器里抛出的异常会退出。
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

结果：全部通过。

- `pnpm run verify`：主包测试 2,054 项通过、6 项跳过（141 个文件），所有插件测试、确定性构建、Headless 与发布包检查（59 个文件，解包后 1,996,939 字节）均通过。
- 不带 Mnemon CLI 的 `pnpm run verify:plugins`：17 个独立插件仓库与 18 个打包产物。
- 在 DSH 0.2.0-rc.2 上运行 `pnpm run test:installed-dsh`：2,054 项通过、6 项跳过。
- `pnpm run release:intent`：changeset 覆盖 `dsh-mnemon` 与 `dsh-mnemon-strategy-default-three-tier`。
- 用 v0.5.31 验收时的 profile 运行验证脚本，输出即上文引用的结果。
