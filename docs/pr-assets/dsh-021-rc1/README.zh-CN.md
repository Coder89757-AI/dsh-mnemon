# dsh-mnemon 在 DSH 0.2.1-rc.1 与 0.2.0-rc.2 上

[English](./README.md) | [验证记录](./verification.json)

DSH 0.2.1-rc.1（npm `next`，2026-10-17 发布）是 DSH 0.2.1 的第一个候选版本；DSH 0.2.0-rc.2 仍是 npm `latest`。本改动把这两个版本，以及其后的 0.2.0 与 0.2.x 版本，定为 dsh-mnemon 支持的宿主。开发基线改为 DSH 0.2.1-rc.1，去掉只为 DSH 0.1.7、0.2.0-rc.1 与 0.2.1 alpha 保留的内容，并记录在两个版本上运行的检查。

测试版本：本分支的 `cd999526`，基于 main `7b7efa49`（v0.5.30 与 #354）。其后的提交只修改缺少子 Agent provider 时的错误信息、打包制品检查的升级起点、文档与本记录。运行于 2026-10-17（Asia/Shanghai）：
- macOS 15.6 arm64、Node 24.19.0 与 CI 使用的 pnpm 10.13.1；
- headless Chrome，zh-CN，浅色；
- DSH 0.2.1-rc.1 与 0.2.0-rc.2，各自安装在独立的 npm prefix 中；
- Mnemon CLI 0.2.10。

## 支持的版本

dsh-mnemon 支持 `>=0.2.0-rc.2 <0.2.1-0 || >=0.2.1-rc.1 <0.3.0-0`。DSH 0.2.1 从 Starter 新增的 `engines.dsh` 读取这个范围：清单中写了它时，兼容性只由它决定。DSH 0.2.0 读取 Starter 的 DSH peer，两者写的是同一个范围。两个版本各自的检查对 Starter 清单的判断：

| 运行时 | DSH 0.2.0-rc.2 的检查 | DSH 0.2.1-rc.1 的检查 |
|---|---|---|
| 正在运行的版本 | 支持 | 支持 |
| 0.1.7-rc.2 | 拒绝 | 拒绝 |
| 0.2.1-alpha.5 | 拒绝 | 拒绝 |
| 0.3.0-rc.1 | 拒绝 | 拒绝 |

`tests/dsh-host-compatibility.spec.ts` 对全部 18 个清单在 0.2.0-rc.2、0.2.0、0.2.1-rc.1、0.2.1 与 0.2.2 上执行 DSH 的检查，并确认 Starter 在 0.1.7-rc.2、0.2.0-rc.1、0.2.1-alpha.3、0.2.1-alpha.5 与 0.3.0-rc.1 上被拒绝。

与 0.2.1-alpha.3 相比，DSH 0.2.1-rc.1 对插件的变化：

| DSH 0.2.1-rc.1 | 本改动 |
|---|---|
| 清单写了 `engines.dsh` 时，兼容性只由它决定；否则每个 `@deepseek-ai/dsh*` peer 都必须包含当前运行时 | Starter 在两处都写明支持的范围 |
| 被拒绝的插件记录以 `requirements` 说明它的要求，键为 `engines.dsh` 或 peer 包名；0.2.0 则以 `peers` 列出 peer | **检查版本 → 更新**两种都能写明：`requires DSH ^0.3.0` 或 `requires @deepseek-ai/dsh-app-boot ^0.3.0, …` |
| 安装中不再包含 `dsh-client-ui-primitives`：前端把它共享给每个客户端 bundle，DSH 自己的客户端插件只把它列为开发依赖 | dsh-mnemon 与记忆空间从 peer 中去掉它 |
| 子 Agent API、热重载与插件页与 0.2.1-alpha.3 相同 | 本 PR 为 alpha.3 写的路径原样适用 |

## 改动内容

- **支持范围。** 即上文 root 的 `engines.dsh` 与 DSH peer。root 与记忆空间都去掉了客户端 primitives peer，因此记忆空间也随之发布补丁版本。
- **开发基线。** 所有 DSH 开发依赖改为 0.2.1-rc.1，Cordis 为 4.0.5。真实宿主测试通过 `tests/helpers/installed-dsh.ts` 组合它所运行的 DSH：只在宿主版本具备时加载工作目录服务，使用 `start` 或 `startActivation`，Code Mode 与原生工具并列只在 0.2.0 上。判断依据是版本，而不是包能否解析：在 `pnpm run` 下，NODE_PATH 会让已安装的 0.2.0 解析到本仓库自己的 DSH 0.2.1 包。
- **CI 覆盖另一个受支持的版本。** `pnpm run test:installed-dsh` 在已安装的 DSH 上运行根测试（`scripts/installed-dsh.config.ts`，由 [0.2.1-alpha.2 记录](../dsh-021-alpha2/README.zh-CN.md#在已安装的-dsh-上运行测试)中的配置提升而来）。新的 CI 任务用它测试从 npm 安装的 DSH 0.2.0-rc.2。[#356](../issue-356-subagent-activation/README.zh-CN.md) 所需的六个改写副本不再需要：测试本身就能在两个版本上运行。
- **不再支持的版本的代码与测试。** 注释、测试假对象与夹具改为指明 DSH 0.2.0 与 DSH 0.2.1，而不是 0.1.7 与 0.2.1 alpha。子 Agent 假对象只模拟两个受支持的宿主；alpha.2 那种 activation 加请求组合的混合形态及其用例已移除。打包 profile 夹具通过 DSH 自己的检查接受 Starter 支持的任何 DSH，不再只接受 0.1.7-rc.2。Electron 窗口夹具默认使用 DSH 桌面版声明的传输方式。代码路径本身就是两个受支持版本各自走的路径。
- **文案。** Agent Teams 暂停空闲审查时，状态页的说明不再写 DSH 0.1.7-rc.2：Team 审查测试在两个受支持版本及其官方 Teams 上都通过。缺少子 Agent provider 时的错误信息改为说明两个版本共同的要求，即限制深度、并让每个子 Agent 使用自己的指令和工具的 provider，而不再列出 DSH 0.2.0 的能力名。
- **文档。** [兼容性与升级](../../zh-CN/reference/compatibility.md)是唯一说明受支持版本的地方，包括旧宿主应保留的 dsh-mnemon 版本表、DSH 0.2.0 与 0.2.1 的差异与升级顺序。各指南、配置与开发参考、README 与 CONTRIBUTING 改为链接到这里，不再重复 0.1.7 时期的说法。

## 结果

| 检查 | DSH 0.2.1-rc.1 | DSH 0.2.0-rc.2 |
|---|---|---|
| `pnpm run verify` 与 `pnpm run verify:plugins`（17 个插件仓库、18 个打包制品，以及在真实 DSH 中从 0.5.29 升级到打包的 Starter） | 通过（锁定的基线） | — |
| 根测试 | 2,036 通过，6 跳过（140 个文件），锁定版本 | 2,036 通过，6 跳过（140 个文件），已安装版本，没有排除或改写任何测试 |
| Headless，默认组合与启用三个可选策略 | 通过 | 通过 |
| Starter 激活契约：冷启动、隔离、另一个 bundle 自启动起停用 | 通过 | 通过 |
| `--check-declared-rows` | 通过 | 因分组行失败，即已知的列表问题 |
| Git 同步端到端 | 64 项通过 | 64 项通过 |
| WebUI 场景（见下） | 14 个全部通过 | 14 个全部通过 |
| 插件页 | 9 个组件（“共 9 个 · 5 运行中 · 4 已停用”），没有分组行，也没有相应说明 | 10 行，其中 `dsh-mnemon/bundle` 为已关闭，列表上方的说明解释了它 |
| 检查版本 → 更新：本分支以 0.5.29 安装，更新到已发布的 0.5.30 | 通过 `dsh plugin add` 更新；重启后记忆系统运行 0.5.30 | 通过 DSH 的安装器更新；重启后记忆系统运行 0.5.30 |
| 同上，但 0.5.30 的清单要求 DSH ^0.3.0 | 在安装任何东西之前被拒绝：`requires DSH ^0.3.0; this DSH is 0.2.1-rc.1` | 在安装任何东西之前被拒绝，列出三个 peer |

WebUI 场景在 headless Chrome 中驱动 e2e 夹具。只有模型决策是脚本化的；工具、子 Agent、Source 与 Provider 都真实运行：
- 空闲审查在刻意的失败前提交一份项目档案和一条档案条目，状态页显示回执；
- 通过记忆子 Agent 压缩 USER.md；
- 存入记忆，以及编辑候选后再次保存；
- 远程页面保持只读，以及通过可信 host 的远程管理；
- 插件页上的组件开关；
- 第二个运行时；
- 含未跟踪文件的 Git 同步；
- 召回预算；
- 审查子 Agent 会话中的委派任务行；
- 项目档案格式升级；
- 记忆空间的关联；
- 存入指定空间的记忆，以及模型指定已停用空间的情况（#387）；
- 可组合记忆页面上的设置图标。

| 插件页，DSH 0.2.1-rc.1 | 插件页，DSH 0.2.0-rc.2 |
|---|---|
| ![DSH 0.2.1-rc.1 上 Starter 包含的组件：九行，第一行是 dsh-mnemon 核心](./components-021.jpg) | ![DSH 0.2.0-rc.2 上的同一列表：第一行是已关闭的分组行 dsh-mnemon/bundle](./components-020.jpg) |

| DSH 0.2.1-rc.1 上的更新 | 不兼容的版本，DSH 0.2.1-rc.1 | 不兼容的版本，DSH 0.2.0-rc.2 |
|---|---|---|
| ![dsh-mnemon 已更新，请重启 DSH 以加载](./update-021.jpg) | ![DSH could not install dsh-mnemon@0.5.30: incompatible-version (requires DSH ^0.3.0; this DSH is 0.2.1-rc.1)](./update-021-incompatible.jpg) | ![DSH could not install dsh-mnemon@0.5.30: incompatible-version，列出三个 DSH peer；this DSH is 0.2.0-rc.2](./update-020-incompatible.jpg) |

更新实验中，本地 registry 把本分支的包作为 0.5.29 提供；在不兼容的实验中，还把已发布 0.5.30 的 DSH peer 与 `engines.dsh` 改为 `^0.3.0`。其他请求都转发到 registry.npmjs.org，没有发布任何东西。

## 自行运行

```sh
pnpm install --frozen-lockfile
pnpm run build
pnpm --workspace-concurrency=4 -r build
pnpm run test:root

npm install --global --prefix <prefix> @deepseek-ai/dsh@0.2.0-rc.2
DSH_HOST_ROOT=<prefix>/lib/node_modules/@deepseek-ai/dsh pnpm run test:installed-dsh
MNEMON_E2E_DSH=<prefix>/lib/node_modules/@deepseek-ai/dsh/lib/bin.js node scripts/verify-headless-profile.mjs
MNEMON_E2E_DSH=<prefix>/lib/node_modules/@deepseek-ai/dsh/lib/bin.js node scripts/verify-sync-git.mjs
node --expose-internals tests/fixtures/bundle-activation.mjs <prefix>/lib/node_modules/@deepseek-ai/dsh manager
```

请用 `node` 而不是 `pnpm` 运行这些脚本，以免继承 `NODE_PATH`。

## 限制

- pnpm 11 不选用发布不足 24 小时的版本，DSH 0.2.1-rc.1 的所有包在 2026-10-18 03:17 UTC 之前都受此影响；在此之前请像 CI 一样用 pnpm 10 安装本仓库。
- 运行使用 DSH 的 web profile，没有试用 DSH 桌面版 0.2.1-rc.1。
- 需要嵌入服务的场景（向量召回、带嵌入的存入记忆、嵌入覆盖）没有重跑；它们不依赖 DSH 版本。
- [v0.5.19 图集](../../assets/webui-v0.5.19/README.md)在 DSH 0.1.7-rc.2 上截取，本记录没有重新截取。
