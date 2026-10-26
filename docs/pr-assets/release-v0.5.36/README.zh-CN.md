# v0.5.36 发布验收

[English](README.md) | [结构化验证记录](validation.json)

于 **2026-10-26（Asia/Shanghai）** 验证 main `0538fb0fdb81ef6d748c02b9bd9bee9d227a4afa` 加发布版本与元数据调整，环境为 Node 22.22.0、pnpm 10.13.1、macOS arm64 和真实 DSH WebUI。所有 home、工作区和记忆均为临时夹具，没有使用模型凭据或用户私有数据，也没有修改用户 Desktop profile。

三个候选包为 Starter **0.5.36**、Skills **0.5.3**、OpenViking **0.5.10**。其余十六个组件从 npm 安装原有精确锁定版本。[结构化记录](validation.json)包含 SHA-256、SHA-512 integrity、十九包组合及各项结果。六次安装的十九包版本全部匹配，三个候选包中的 **104 个文件**逐字节一致。Starter 解包大小为 **2,171,049 字节**，占未调整的 2,500,000 字节上限的 86.8%。

## 全新安装与升级

沿用[发布验收服务](../../../scripts/serve-release-acceptance.mjs)，以隔离 home 启动未经修改的正式 DSH。回环 Registry 只在真实 npm 元数据上覆盖三个候选包。测试专用版本检查重定向和较早的夹具发布时间让现有界面能发现未发布候选版本，不改变生产环境的发布时间限制。

对 DSH **0.2.0-rc.2**、**0.2.1-rc.2**、**0.2.1-rc.3** 分别执行：

1. 通过**插件 → 添加插件**输入 `dsh-mnemon@0.5.36`，确认精确版本，点击**立即启用**后打开记忆系统。状态显示 **dsh-mnemon 0.5.36 / 系统正常**，五个标签均存在。
2. 在另一隔离 profile 安装实际 npm **0.5.35**，打开**检查版本**，看到 **0.5.36** 及两个组件更新。点击**更新**，显示 **dsh-mnemon 已更新 / 需要重启**。
3. 重启宿主并重新连接，状态显示实际运行的 **0.5.36 / 系统正常**，已安装组合和候选文件字节核对通过。

| 宿主 | 全新安装 | 新装状态 | 发现更新 | 更新完成 | 重启后状态 |
| --- | --- | --- | --- | --- | --- |
| 0.2.0-rc.2 | [安装](fresh020-install.png) | [状态](fresh020-status.png) | [版本](upgrade020-offered.png) | [已更新](upgrade020-updated.png) | [运行中](upgrade020-status.png) |
| 0.2.1-rc.2 | [安装](fresh021-install.png) | [状态](fresh021-status.png) | [版本](upgrade021-offered.png) | [已更新](upgrade021-updated.png) | [运行中](upgrade021-status.png) |
| 0.2.1-rc.3 | [安装](freshrc3-install.png) | [状态](freshrc3-status.png) | [版本](upgraderc3-offered.png) | [已更新](upgraderc3-updated.png) | [运行中](upgraderc3-status.png) |

rc.3 升级前，通过运行时的**添加记忆**保存一条合成项目事实。升级并重启后，[界面仍显示该记忆](upgraderc3-memory-preserved.png)，三个 Runtime 文件摘要全部保持不变。这是有限的数据保留检查，不代表覆盖所有历史数据库。

复现方法：构建并打包三个候选包，运行 `node scripts/serve-release-acceptance.mjs --dsh <official-dsh>/lib/bin.js --artifacts <candidate-directory> --state <empty-disposable-directory> --port <port>`；升级场景增加 `--previous dsh-mnemon@0.5.35`。从私有元数据读取连接地址，更新后向夹具进程发送 SIGUSR2 重启 DSH。

## 验证与限制

- `pnpm run verify`：文档、类型、确定性构建、**2,236 项主包测试**（7 条件跳过）、**696 项插件测试**（3 条件跳过）、Headless 激活与包检查通过。
- 独立安装 DSH **0.2.0-rc.2**：**2,233 通过 / 10 条件或宿主相关跳过**；**0.2.1-rc.3**：**2,236 通过 / 7 条件跳过**。
- `pnpm run verify:plugins --skip-build`：**18 个独立仓库 / 19 个制品**、外部 SDK 消费者、可选 Strategy 组合以及从 **0.5.29** 的真实打包升级通过。
- 正式 rc.3 API Key adapter 模拟 **3,600 ms** HTTP 响应，首次调用在 **3,607 ms** 成功填充模型目录，真实网络请求为零，复验了合并版本的超时修复。
- `pnpm run release:check`：稳定 `latest`，只选择三个版本递增包，无待消费 changeset。变更组件不依赖新 SDK 导出，原运行时 peer 最低版本仍有效。
- [目录选择器记录](../storage-directory-picker/README.zh-CN.md)包含真实 WebUI 能力判定、手动输入、异常恢复、设置保存和数据保留检查。**真实系统弹窗的选择/取消尚未完成手验**，Windows/Linux 弹窗亦未手验。自动化测试覆盖成功、取消返回值及迟到的异步结果。发布说明保留此限制。

[建议开关记录](../issue-496-suggestion-switches/README.zh-CN.md)和[模型目录记录](../rc3-model-directory/README.zh-CN.md)包含功能专项验收。发布阶段会另外冻结 main，核对 npm 字节，完成干净 Registry 安装和升级，最后才创建 GitHub Release。

## 发布验证调度

首次发布工作流因未改动的 Memory Spaces 客户端集成测试超过原有五秒超时，在写入 npm 前停止。PR CI 也出现过相同失败，同一提交重跑后通过。为消除两层并发造成的 CPU 过度占用，独立验证现让每个包只使用一个 Vitest worker，保留外层四个包的并发。本地完整 18 仓库 / 19 制品验证及 20 项发布测试已在此设置下通过；没有放宽断言或超时，这一脚本调整不改变已验收安装包。[停止的发布流程](https://github.com/omdsh-dev/dsh-mnemon/actions/runs/40342572010)。
