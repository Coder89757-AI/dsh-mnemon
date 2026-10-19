# v0.5.33 发布验收

[English](README.md) | [验证记录](validation.json)

验收于 2026-10-20（Asia/Shanghai）。受测的是 0.5.33 变更的那一个包，即 `pnpm release:version` 基于 `main` `708807c1`（包含 #437 至 #441）构建出的 `dsh-mnemon@0.5.33`。其余 17 个组件包按 Starter 锁定的版本取自 npm，0.5.33 未改变它们。

每个宿主都是未经修改的 npm DSH，使用 Node `24.19.0` 以及全新的 home、DSH home 与 pnpm store：`0.2.1-rc.2`（npm `latest` 与 `next`）和 `0.2.0-rc.2`。本地回环 registry 返回 npm 的真实元数据，外加这个新版本。dsh-mnemon 的版本检查自己向 npm 发出请求，不经过 pnpm，因此验收环境把这个请求也发往同一个 registry，**检查版本**便像 npm 发布之后那样提供候选版本。每一步在其运行的宿主上都通过；从 v0.5.30 更新只在 DSH 0.2.1-rc.2 上运行，发布说明只在那里给出这条路径。

## 在官方 WebUI 中全新安装

1. 启动未安装 Mnemon 的宿主，打开**插件 → 添加插件**。在 DSH 0.2.1-rc.2 上，没有配置模型的新用户会先看到一个对话框，提示登录或添加 API Key；关闭后，WebUI 其余部分照常可用。
2. 安装 `dsh-mnemon`。安装源由 DSH 自行选择，测速选中了中国大陆镜像。随后 Profile 中是新的 Starter，各组件均为锁定的 npm 版本。
3. 点击**立即启用**，无需重启宿主即出现记忆系统。状态页显示 **dsh-mnemon 0.5.33 / 系统正常**，Mnemon Native 显示 **Mnemon 0.2.11**：[0.2.1-rc.2](status.jpg)、[0.2.0-rc.2](status-020.jpg)。
4. 添加一条运行时记忆，刷新页面后读回：[运行时记忆](runtime.jpg)。
5. 在 WebUI 中创建 Mnemon Native 空间，并在卡片上激活：[记忆空间](spaces.jpg)。用 Mnemon CLI `0.2.11` 写入一条事实并用 CLI 召回，再用 WebUI 的**直接检索**找到同一条事实：[检索](recall.jpg)。
6. 用 CLI 再写入三条带有实体 `Atlas` 的记忆，以及一条只在正文中提到 Atlas 的记忆。在**实体**页，`Atlas` 计数为 3，恰好列出这三条；**查找相关记忆**找到了只提到它的那一条：[实体](entities.jpg)、[相关记忆](entities-related.jpg)。
7. 打开**检查版本**。dsh-mnemon 显示已安装 0.5.33，已是最新。在 DSH 0.2.0-rc.2 上，旁边的 Mnemon CLI 卡片提供了它自己的 npm 更新（0.2.11 到 0.2.12），这不属于本次发布。

## 通过检查版本从 v0.5.32 更新

1. 启动 WebUI 前先从 npm 安装 `dsh-mnemon@0.5.32`。状态页显示 **dsh-mnemon 0.5.32 / 系统正常**，**检查版本**提供 0.5.33。
2. 在 dsh-mnemon 上点击**更新**。两个宿主上，对话框都显示 **dsh-mnemon 已更新**，并提示重启 DSH：[更新后的检查版本](update-versions.jpg)。
3. 重启 DSH。状态页显示 **dsh-mnemon 0.5.33 / 系统正常**，与全新安装后的页面相同（两张截图完全一致），检查版本显示 0.5.33 已是最新：[更新后的状态](update-status.jpg)。Profile 中 17 个组件均为 Starter 锁定的版本，与全新安装相同。两次启动都没有激活警告。

![在 DSH 0.2.1-rc.2 上从 v0.5.32 更新后的检查版本：dsh-mnemon 已更新，0.5.33，待重启](update-versions.jpg)

## 在 DSH 0.2.1-rc.2 上从 v0.5.30 更新

发布说明让 DSH 0.2.1 上的较早安装改为执行一次精确安装，本次验收按说明操作：

1. 启动 WebUI 前先从 npm 安装 `dsh-mnemon@0.5.30`。**检查版本**提供 0.5.33，点击**更新**后停在 `DSH could not install dsh-mnemon@0.5.33: already-installed`，与说明一致。
2. 运行 `dsh plugin --profile web add dsh-mnemon@0.5.33`，再重启 DSH。状态页显示 **dsh-mnemon 0.5.33 / 系统正常**，Profile 中是与全新安装相同的 17 个锁定组件，两次启动都没有激活警告。

桌面版在同样情况下的方法（在插件页卸载 dsh-mnemon 后重新添加）记录在 [desktop-update-older](../desktop-update-older/README.zh-CN.md) 中。

两个宿主都没有控制台错误。[validation.json](validation.json) 记录了包摘要与各项结果。Profile 与记忆均为合成数据。

## 两个宿主上的 Git 同步

本版本改变了 Git 同步把令牌交给 Git 的方式（#441），因此用构建好的发布分支对每个已安装的 DSH 运行了 `pnpm run e2e:sync`：两个真实的 Web 宿主、一个临时 bare 仓库，以及与浏览器相同的请求封装。DSH 0.2.0-rc.2 与 DSH 0.2.1-rc.2 上各通过 **64 / 64** 项检查。

## 本版本的改动

- [Git 同步能找到它的令牌](../issue-408-git-credential-username/README.zh-CN.md)（#441，issue #408）
- [任务 Agent 会话不进入会话列表](../issue-435-task-agent-sessions/README.zh-CN.md)（#438，issue #435）
- [在 DSH 0.2.1 的桌面版中从 0.5.30 及更早版本更新](../desktop-update-older/README.zh-CN.md)（#437，issue #433 与 #436）
- 中英文 README 以 Star 历史与许可证章节收尾（#439、#440）

## 验证与发布边界

这五个 PR 按顺序合并。#438、#439 与 #441 的最终提交都通过了 CI。#440 的已安装 DSH 任务在从 npm 安装 DSH 0.2.0-rc.2 时失败（一个 AWS SDK 的 tarball 返回 404），尚未运行任何测试，其余检查都通过。只改文档的 #437 在本地检查通过后、CI 仍在运行时合并，随后 CI 也通过。`main` 上，`e268d124`（#438）的 CI 通过；#440 与 #441 合并后的运行被下一次推送取消；`708807c1`（#437）上的打包插件校验中，一个与这些 PR 都无关的记忆空间客户端测试在 5 秒处超时了一次，重跑后通过。

`pnpm run release:check` 确认 `latest` 标签上的 Starter 0.5.33，`pnpm run release:intent` 确认已消费的 3 个 changeset 与它对应。插件版本与 peer 下限都不变，锁文件也不变。仓库的构建与测试和 CI 一样使用 pnpm 10.13.1；DSH 宿主内的插件安装使用 pnpm 11.25。写入版本号后，`pnpm run verify` 通过（2,147 项主包测试、所有插件测试、确定性构建、Headless 与发布包检查），不带 Mnemon CLI 的 `pnpm run verify:plugins`（17 个插件仓库、18 个打包产物）以及在已安装的 DSH 0.2.0-rc.2 上运行的主包测试（2,144 项）也都通过。发布包包含 66 个文件、解包后 2,047,510 字节，低于 2,500,000 字节的上限。

发布工作流在创建 GitHub Release 前的最后一项检查，会在 Headless profile 中从 Registry 上的 0.5.29 升级。按工作流的方式在本地运行，在锁定的 DSH 0.2.1-rc.2 上由已验收的候选包提供 0.5.33 时，它把 0.5.29 升级到 0.5.33，运行时记忆的字节保持不变，并检查旧设置导入、禁用开关与三个可选策略。

发布 PR 与发布工作流会再次运行完整的工作区与打包插件校验。随后，发布流程会在创建 GitHub Release 前检查完整的锁定组合、一次 Registry 安装与一次真实升级。
