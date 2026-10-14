# GitHub 以表单格式回应时的 GitHub 登录 — issue #369

[English](./README.md) | [Issue #369](https://github.com/omdsh-dev/dsh-mnemon/issues/369) | [验证记录](./verification.json)

Issue #369 报告：在 DSH Desktop 0.2.1-alpha.2 上，另一个插件改写了 `fetch`，Git 同步块里的 GitHub 登录报 `the GitHub device code answer was incomplete`。GitHub 的 OAuth 接口只有在请求带有 `accept: application/json` 时才回 JSON。那个插件重建请求时丢掉了这个请求头，GitHub 于是以表单格式回应，字段齐全，登录却把它解析成了空。

基线：main `20e4ab67`。修复：`3f1b1d4a`。运行于 2026-10-13（Asia/Shanghai）：
- macOS 15.6 arm64，Node 24.19.0；
- headless Chrome，1280×900，zh-CN，浅色；
- DSH 0.2.1-alpha.2（npm `alpha`），通过 `scripts/serve-e2e.mjs` 运行；
- Host 通过 `--import` 加载 [`harness/strip-accept.mjs`](./harness/strip-accept.mjs)。它会像报告中的插件那样，重建每个发往 `github.com` 的请求并去掉 `accept` 请求头。回应来自真实的 github.com；没有授权任何账号，流程最后被取消。

## 原因

- 设备码请求和 token 轮询都用 `accept: application/json` 请求 JSON。缺少这个请求头时，GitHub 以 `application/x-www-form-urlencoded` 回应，而登录只解析 JSON，于是每个字段都被当成缺失。
- 报错里看不出实际收到了什么。
- 代理回退使用的 CONNECT 隧道只保留回应的状态码和正文，因此经过代理时，每个回应都被当作 `text/plain`。

## 修复

- 回应声明为 `application/x-www-form-urlencoded` 时，不是 JSON 的正文按表单读取，设备码与 token 两步都是。其中的计数也能从字符串读取，间隔与有效期保持在流程允许的范围内。
- 代理回退保留回应的 content type。
- 仍然无法使用的设备码回应，会给出它的 HTTP 状态、content type 与字段名，但不含任何字段值。

## 方法

1. 用 `NODE_OPTIONS=--import=<本记录>/harness/strip-accept.mjs MNEMON_CLI_PATH=<mnemon> pnpm e2e:serve` 分别启动基线与修复的 WebUI。
2. 打开 **插件 → 可组合记忆 (dsh-mnemon)**，打开 **Git 同步**，保持 **GitHub 账号**，点击 **使用 GitHub 登录**。
3. 修复版截图中的设备码已遮盖，流程随后用 **取消** 结束。

## 修复前后

| main | 修复 |
|---|---|
| ![GitHub 登录失败：the GitHub device code answer was incomplete](./before-signin.jpg) | ![在 GitHub 页面输入这个设备码（设备码已遮盖）、复制并打开 GitHub、等待授权](./after-signin.jpg) |

## 不经页面直接请求 github.com

去掉同样的请求头后，`POST https://github.com/login/device/code` 返回 HTTP 200、`application/x-www-form-urlencoded`，字段为 `device_code`、`expires_in`、`interval`、`user_code` 与 `verification_uri`。main 报告回应不完整；修复后流程正常开始，给出 user code、`https://github.com/login/device` 与 5 秒间隔。

## 自动化检查

- `tests/github-auth.spec.ts`：
  - 用表单格式回应走完整个登录：设备码、一次等待中的轮询、token；
  - HTML 回应、缺字段的 JSON 回应、以及只是声称为表单的正文，这三种情况的报错都不含任何值；
  - content type 写法少见的表单格式拒绝回应；
  - 间隔与有效期的上下限。
- `tests/github-transport.spec.ts`：隧道回应保留 content type。
- 这 5 个新测试在 main 上失败。

## 限制

- 没有安装报告中的插件。预加载模块复现的是报告 Host 日志显示的请求头丢失。
- 没有授权账号，因此 token 这一步对 github.com 的行为由表单格式的测试覆盖，而不是实测。
- 只在 macOS 上运行；报告来自 Windows。原因与修复都不依赖平台。
