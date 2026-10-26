# 在 OpenViking 0.4.16 上保存记忆 — issue #353

[English](./README.md) | [Issue #353](https://github.com/omdsh-dev/dsh-mnemon/issues/353) | [验证记录](./verification.json)

Issue #353 报告：在 OpenViking 0.4.16 上，每一次路由到 OpenViking 记忆空间的 `mnemon_remember` 都会失败。Provider 在 `POST /api/v1/content/write` 的请求体里带了 `tags`，该版本以 HTTP 400（`extra_forbidden`）拒绝这个未声明的字段，记忆一条也存不进去。报告同时指出，读回的分类是文件夹名。

基线：main `20e4ab67`。修复：`c5afe22d`；下文的夹具改动随本记录一起提交。运行于 2026-10-13（Asia/Shanghai）：
- macOS 15.6 arm64，Node 24.19.0；
- headless Chrome，1280×900，zh-CN，浅色；
- DSH 0.2.1-alpha.2（npm `alpha`），通过 `scripts/serve-e2e.mjs --openviking-write --strategy-extensions` 运行；
- OpenViking 0.4.16、0.4.20 与 0.5.0，来自 PyPI，Python 3.12.13。每个版本都是一次性的本机回环服务器，dev 认证模式，嵌入使用 Ollama `nomic-embed-text`（768 维）。

## 原因

- `remember()` 发送 `uri, content, mode, wait, timeout` 和 `tags`。OpenViking 0.4.18 之前的写入请求只声明前五个字段以及 `telemetry` 与 `processing_mode`，其他字段一律拒绝；`tags` 是 0.4.18 才加入的。因此在这些版本上每次写入都会失败。
- 此时报错写的是 `remote content may remain. Inspect this URI before retrying`，可服务器拒绝了请求，什么也没写入。
- 每个文件夹对应两种分类（`entities`：fact 与 general；`experiences`：insight 与 decision），读回的分类是文件夹名。

## 修复

- 写入只发送接口声明的字段。完整读回后，再用 `content/set_tags` 以 `mode: replace` 设置来源、分类与重要度标签，最多等待 5 秒。只有回答 `tags_updated: true` 才算打上了标签；其他情况都保留已验证的记忆，回执中 `tagsApplied` 为 `false`。
- 服务器拒绝的写入（HTTP 4xx，408 与 409 除外）现在会报告“没有保存任何内容”。
- 文件名以 `_<分类>-<uuid>.md` 结尾，读回的分类与写入时一致。文件名不含分类的文件（旧版本写入的，或 OpenViking 自己写入的）按所在文件夹读回。未知分类按 `general` 保存。
- 文件名的标题部分截到 180 字节，因此加长后的文件名仍在 Linux 允许的 255 字节以内。

## 方法

1. 以 dev 认证模式启动本机 OpenViking：`openviking-server --config <conf> --host 127.0.0.1 --port 19340`。
2. 用 `MNEMON_CLI_PATH=<mnemon> pnpm e2e:serve --openviking-write --strategy-extensions` 分别启动基线与修复的 WebUI。
3. 打开 **插件 → 可组合记忆 (dsh-mnemon) → 记忆空间 → OpenViking**，填写：
   - 服务地址 `http://127.0.0.1:19340`；
   - API Key `synthetic-dev-key`（dev 模式接受任意 key）；
   - Account `default`；
   - User Key 所属用户 `default`。
   点击“保存并启用”后，出现空间 `default`。
4. 在新会话中发送 `openviking-write-233`。脚本化模型先调用 `mnemon_memory_bodies`，再经委托写入调用 `mnemon_remember`，写入分类为 decision、重要度 4 的测试记忆。
5. 打开 **记忆系统 → 记忆空间 → 内容**。

只有模型的决策是脚本化的；Host 工具、Provider 与 OpenViking 都是真实运行。夹具里的委托写入在 Provider 抛错时原本会因断言失败而停止，模型随后不断重复调用；现在它以带有 Provider 错误的 failed 回执结束。基线工作区只复制了这一个夹具文件。

## 修复前后

| | main | 修复 |
|---|---|---|
| 写入 | ![回执：OpenViking write was not verified, remote content may remain, Invalid request parameters: body.tags: Extra inputs are not permitted](./before-write.jpg) | ![回执：stored，分类 decision，tagsApplied 为 true](./after-write.jpg) |
| 空间内容 | ![default 中 0 条记忆](./before-content.jpg) | ![default 中 1 条记忆，标签为“决策”](./after-content.jpg) |

在 main 上，回执里是报告中的 400，空间保持为空。修复后写入成功，`tagsApplied: true`，内容页按“决策”（decision）分类显示这条中英双语的测试记忆。

## 本机集成测试

插件的可选测试会创建一条记忆、完整读回、通过检索和浏览各找到一次，然后删除。现在它还检查 `tagsApplied`，以及检索与浏览报告的分类是否为 `decision`。

| OpenViking | main | 修复 |
|---|---|---|
| 0.4.16 | 失败：`Invalid request parameters: body.tags: Extra inputs are not permitted` | 通过 |
| 0.4.20 | 通过 | 通过 |
| 0.5.0 | 通过 | 通过 |

## 自动化检查

- `plugins/dsh-mnemon-provider-openviking/tests`，共 81 个测试：
  - 写入字段与单独的标签调用；
  - 未确认与超时的标签回答；
  - 哪些失败会报告“没有保存任何内容”；
  - 服务器报告其他分类时，每种分类的往返；
  - 由四字节字符组成的文件名；
  - key 绑定模式下的标签调用。
- 其中 6 个在修复的第一版上失败。
- `tests/openviking-host.spec.mjs` 与 `tests/openviking-user-host.spec.mjs` 通过组合后的 Host 检查保存的标签。前者在 main 上对照 0.4.16 严格夹具时以报告中的 400 失败。

## 限制

- 只在 macOS 上运行。macOS 的文件系统接受 258 字节的文件名，因此 255 字节的上限由单元测试保证，没有在 Linux 服务器上实测。
- 修复前写入的文件保留原名，按文件夹读回：`entities` 中较早的 `general` 记忆读回为 `fact`，`experiences` 中较早的 `decision` 读回为 `insight`。
- 降级会恢复旧的写入方式，它需要 OpenViking 0.4.18 或更高版本。
- 标签调用让每次写入多一个请求：对本机服务器为 8 到 15 毫秒。
