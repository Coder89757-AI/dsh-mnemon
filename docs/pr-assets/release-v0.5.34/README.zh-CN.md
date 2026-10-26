# v0.5.34 发布验收

[English](README.md) | [验证记录](validation.json)

验证日期：2026-10-21（Asia/Shanghai）。被测的是 0.5.34 变更的两个包：`dsh-mnemon@0.5.34` 与新增的 `dsh-mnemon-source-skills@0.5.1`，由 `pnpm release:version` 从 `main` `5bfbd7c9`（#443 的合并）构建。其余 17 个组件包按 Starter 固定的版本取自 npm，0.5.34 没有改动它们。

每个宿主都是未修改的 npm 版 DSH，使用 Node `22.22.0`，并配有全新的 home、DSH home 与 pnpm store：`0.2.1-rc.2`（npm `latest` 与 `next`）和 `0.2.0-rc.2`。本地回环 registry 返回 npm 的真实元数据，并加上两个候选包。dsh-mnemon 的版本检查不经过 pnpm，而是自己向 npm 发请求，因此验收环境把这个请求也转到同一个 registry，**检查版本**提供候选包的方式与 npm 发布后相同。除本记录另有说明外，每一步在两个宿主上都通过。

## 在官方 WebUI 中全新安装

1. 启动未安装 Mnemon 的宿主，打开**插件 → 添加插件**。没有配置模型的新用户会先看到一个对话框：DSH 0.2.1-rc.2 提示登录或添加 API Key，DSH 0.2.0-rc.2 提示输入 API 密钥；关闭它或选择稍后配置后，WebUI 的其余部分一切如常。验收中没有输入任何密钥。
2. 从 DSH 显示的安装源 registry 安装 `dsh-mnemon`。对话框显示 **dsh-mnemon，版本 0.5.34** 和新的描述：[添加插件](install.jpg)。profile 中随即是新的 Starter，18 个组件都是固定版本，其中包括 `dsh-mnemon-source-skills` 0.5.1。
3. 点击**立即启用**，无需重启宿主即出现记忆系统，第五个标签页是**技能管理**。状态页显示 **dsh-mnemon 0.5.34 / 系统正常**，技能管理卡片显示 **0 个技能、自进化未开启**：[0.2.1-rc.2](status.jpg)、[0.2.0-rc.2](status-020.jpg)。
4. 在技能管理页面用**新建**创建技能 `release-check`。它写入该宿主的 `~/.dsh/skills/release-check/SKILL.md`，并列在**用户**下：[技能](skills.jpg)（详情中的用户目录路径已模糊处理）。在 DSH 0.2.1-rc.2 的对话中输入 `/release`，DSH 自己的菜单列出了它和它的描述：[`/` 菜单](slash.jpg)。DSH 0.2.0-rc.2 的 `/` 菜单只列命令、不列技能，因此这一步在那里没有对应。
5. 在**插件 → 可组合记忆 (dsh-mnemon)** 中，技能管理是**记忆组合**里的一行，状态为运行中，带有**实验性**标签：[插件页](plugin.jpg)。在它的页面上打开**自进化**后，出现了**草案自动回测**与**复盘参数**，profile 中保存了 `skills.evolution: true`，状态页卡片无需重启即变为**自进化已开启**；再关闭后恢复默认：[技能管理设置](settings.jpg)。
6. 添加一条运行时记忆，刷新页面后仍能读到：[运行时记忆](runtime.jpg)。
7. 打开**检查版本**：dsh-mnemon 显示已安装 0.5.34 且为最新，子包 18 个；Mnemon CLI 0.2.12 为最新。

## 通过检查版本从 v0.5.33 更新

1. 启动 WebUI 前从 npm 安装 `dsh-mnemon@0.5.33`。状态页显示 **dsh-mnemon 0.5.33**，记忆系统中没有技能管理标签页，**检查版本**提供 0.5.34。
2. 点击 dsh-mnemon 的**更新**。两个宿主上的对话框都显示 **dsh-mnemon 已更新**，并提示重启 DSH：[更新后的检查版本](update-versions.jpg)。
3. 重启 DSH。状态页显示 **dsh-mnemon 0.5.34 / 系统正常**和技能管理卡片，记忆系统中出现技能管理标签页，与全新安装后的页面相同（两张截图完全一致）：[更新后的状态页](update-status.jpg)。profile 中 18 个组件都是 Starter 固定的版本，与全新安装一致。两次启动都没有激活警告。

![在 DSH 0.2.1-rc.2 上从 v0.5.33 更新后的检查版本：dsh-mnemon 已更新，0.5.34，待重启](update-versions.jpg)

两个宿主上浏览器控制台都没有错误。[validation.json](validation.json) 记录了包的摘要与结果。profile、记忆与技能都是合成数据。

## 本版本的变更

- [技能管理：越用越好的 DSH 技能（实验性）](https://github.com/omdsh-dev/dsh-mnemon/pull/443)（#443）：[指南](../../zh-CN/guides/skills.md)、[计划](../../plans/skill-management.md)与[图集](../../assets/skills-v0.5.34/README.md)。

## 验证与发布边界

#443 在最终提交 `d188cc02` 上通过了两个受支持 DSH 版本的 CI，以 `5bfbd7c9` 合并。

`pnpm run release:check` 确认 Starter 0.5.34 位于 `latest` 标签，组合中包含 `dsh-mnemon-source-skills` 0.5.1；`pnpm run release:intent` 确认已消耗的 changeset 覆盖这两个包。新包对 `dsh-mnemon` 的 peer 范围保持 `^0.5.33`：它从 dsh-mnemon 的 SDK 与 client 引入的内容在 0.5.33 中都已存在。锁文件只改动版本升级涉及的两个 specifier：Starter 对 `dsh-mnemon-source-skills` 的固定版本，以及该包对 `dsh-mnemon` 的开发依赖范围。写入版本号后，`pnpm run verify` 通过了文档、类型、确定性构建与全部插件检查（含技能管理 Source 的 39 个测试）以及 2,167 个根测试（7 个跳过）；`pnpm run verify:headless` 与 `pnpm run verify:package` 通过；针对已安装 DSH 0.2.0-rc.2 的根测试通过 2,164 个（10 个跳过）。两次根测试中都有一个测试在本机失败：*Git sync over HTTPS reports a credential the host refuses as an authentication failure*，本机 Git 2.54.0 把这种拒绝归为 `unknown`。本版本没有改动 Git 同步代码，CI 中该测试通过。`pnpm run verify:plugins` 在 CI 的 Node 24 上通过；在本机，Node 22 自带的 npm 10.9.4 在解析产物的 peer 依赖时出错，测试尚未开始。包共 66 个文件、2,153,561 个解包字节，低于 2,500,000 字节的上限。

发布流程在创建 GitHub Release 前的最后一项检查，是从 registry 上的 0.5.29 升级一个 Headless profile。按发布流程的方式在本机运行（固定的 DSH 0.2.1-rc.2，0.5.34 来自已验收的候选包），它把 0.5.29 升级到 0.5.34，运行时记忆的字节不变，并检查了旧设置导入、禁用开关与三个可选策略。

发布 PR 与发布流程都会运行完整的工作区与打包插件验证。发布流程随后检查完整的固定组合、registry 安装与一次真实升级，然后才创建 GitHub Release。
