# Scripts / 脚本

[Development and verification](../docs/en/development/README.md) · [开发与验证](../docs/zh-CN/development/README.md)

The repository's own tooling: the checks `pnpm run verify` chains, the release steps, the real-WebUI fixtures and the Provider Lab helpers. Most run through a `package.json` script; run the rest with `node` from the repository root, after `pnpm build` and `pnpm --workspace-concurrency=1 -r build` when they load built packages. Scripts that start an installed DSH run it with `node`, not `pnpm`, so the host inherits no `NODE_PATH`. None of them ships in an npm package. Reusable tooling for an evidence record belongs here or in `tests/`, and the record links to it.

这里是仓库自己的工具：`pnpm run verify` 串起的各项检查、发布步骤、真实 WebUI 夹具，以及 Provider Lab 的辅助脚本。大多数通过 `package.json` 中的脚本运行，其余在仓库根目录用 `node` 运行；需要加载构建产物的脚本，请先运行 `pnpm build` 与 `pnpm --workspace-concurrency=1 -r build`。会启动已安装 DSH 的脚本用 `node` 而不是 `pnpm` 运行，以免宿主继承 `NODE_PATH`。这些脚本都不进入 npm 包。验收记录用到的可复用工具应放在这里或 `tests/` 中，由记录链接过去。

## Checks / 检查

| Script / 脚本 | Run / 运行 | What it does / 作用 | Inputs and environment / 输入与环境变量 |
|---|---|---|---|
| `verify-docs.mjs` | `pnpm run verify:docs` | Every local link and anchor in tracked Markdown, `blob/main` links included; a `docs/zh-CN` twin for each `docs/en` page; every official plugin named in both READMEs / 检查已跟踪 Markdown 中的本地链接与锚点（含 `blob/main` 链接）、`docs/en` 每页在 `docs/zh-CN` 中的对应页，以及两个 README 是否列出全部官方插件 | — |
| `verify-deterministic-build.mjs` | `pnpm run verify:build` | Builds the root package twice and compares the SHA-256 of every file under `lib/` / 构建根包两次，比较 `lib/` 下每个文件的 SHA-256 | Run through the package manager (`npm_execpath`) / 须经包管理器运行 |
| `link-bundle-declarations.mjs` | `pnpm build` | Points the root package's emitted `dsh-mnemon/*` self-references at its bundled declarations / 把根包生成的类型声明中对 `dsh-mnemon/*` 的自引用指向打包后的声明文件 | `tsconfig.json` paths |
| `package-locales.mjs` | Imported by the next two / 由下面两个脚本导入 | Reads and validates a package's `locale/*.json` metadata / 读取并校验包的 `locale/*.json` 元数据 | — |
| `verify-package-contents.mjs` | `pnpm run verify:package` | Dry-run pack of the root package: required and unexpected files, Host code in `lib/client.js`, absolute README image URLs, and the unpacked-size ceiling / 根包试打包：必需与多余文件、`lib/client.js` 中的 Host 代码、README 图片是否为绝对地址，以及解包大小上限 | — |
| `verify-public-entries.mjs` | `pnpm run verify:package`; CI on Node 20 / CI 在 Node 20 上运行 | Imports every public Node entry of the root, Memory Spaces and Layered strategy packages, checks their declarations expose no private type, and runs each executable's `--help` / 导入根包、记忆空间与分层策略包的每个公开 Node 入口，检查声明不暴露私有类型，并运行每个可执行文件的 `--help` | — |
| `verify-headless-profile.mjs` | `pnpm run verify:headless` | Installs the Starter into an isolated Headless profile of real DSH, runs one-shot tasks against a loopback model, and checks the Mnemon tools, settings across a restart and the disabled Starter / 把 Starter 安装进真实 DSH 的隔离 Headless profile，用回环模型运行一次性任务，检查 Mnemon 工具、重启后的设置与停用的 Starter | `--package <spec> --registry <url>`, `--upgrade-from <spec> --upgrade-registry <url>`, `--strategy-extensions true`; `MNEMON_E2E_DSH` |
| `verify-plugin-artifacts.mjs` | `pnpm run verify:plugins` | Packs every package, verifies each plugin as its own repository outside the workspace through a loopback registry, then an external consumer and the packed Starter in real DSH, including an upgrade from an earlier release / 打包全部包，经回环 registry 在工作区外把每个插件当作独立仓库验证，再验证外部消费者与真实 DSH 中的打包 Starter（含从较早版本升级） | `--skip-build`, `--keep`; `MNEMON_PLUGIN_VERIFY_CONCURRENCY` (default 4 / 默认 4) |
| `verify-sync-git.mjs` | `pnpm run e2e:sync` | Two real DSH Web hosts over disposable homes publish to a real bare repository through the sync, settings, review and pack channels / 两个使用临时目录的真实 DSH Web 宿主，经同步、设置、审查与备份通道发布到真实的裸仓库 | `MNEMON_E2E_DSH`; `MNEMON_SYNC_E2E_KEEP=1` keeps the fixture / 保留夹具 |
| `installed-dsh.config.ts` | `pnpm run test:installed-dsh` | Runs the root tests with every `@deepseek-ai/*` import resolved from an installed DSH / 运行根测试，所有 `@deepseek-ai/*` 导入都从已安装的 DSH 解析 | `DSH_HOST_ROOT` (required / 必填) |
| `benchmark-algorithms.config.ts` | `pnpm bench:algorithms` | Runs `tests/algorithm-performance.measure.ts` in one worker / 在单个 worker 中运行 `tests/algorithm-performance.measure.ts` | `MNEMON_BENCH_OUTPUT`, `MNEMON_BENCH_SIZES` |

## Release / 发布

[Releasing independent packages](../docs/en/development/releasing.md) · [独立包发布流程](../docs/zh-CN/development/releasing.md)

| Script / 脚本 | Run / 运行 | What it does / 作用 | Inputs and environment / 输入与环境变量 |
|---|---|---|---|
| `release.mjs` | `pnpm run release:check`; `.github/workflows/publish.yml` | Computes the release plan; `--check` is read-only, and `--pack`, `--publish-plugins`, `--verify-plugins`, `--publish-starter` and `--verify-release` are the publication steps / 计算发布计划；`--check` 只读，其余模式是发布的各个步骤 | `--artifacts <dir>`, `--registry <url>`; `RELEASE_REVISION`, `RELEASE_BASE_REVISION`, `RELEASE_TAG`, `RELEASE_PRERELEASE`, `RELEASE_PUBLISH_CONCURRENCY` (default 4 / 默认 4), `GITHUB_ACTIONS` (provenance) |
| `check-release-intent.mjs` | `pnpm run release:intent`; CI | Every package whose published inputs changed has a changeset, or a release pull request consumed them all / 检查发布输入有变化的每个包都有 changeset，或发布 PR 已全部消费 | `CHANGESET_BASE_REVISION`, `CHANGESET_REVISION`: full SHAs, by default the merge base with `origin/main` and `HEAD` / 完整 SHA，默认分别为与 `origin/main` 的 merge base 和 `HEAD` |
| `sync-release-metadata.mjs` | `pnpm run release:version` | Synchronizes the Starter's exact plugin pins, the external consumer's pins and the generated Provider version declarations / 同步 Starter 的精确插件版本、外部消费者的版本与生成的 Provider 版本声明 | — |

## Real WebUI and Provider Lab / 真实 WebUI 与 Provider Lab

| Script / 脚本 | Run / 运行 | What it does / 作用 | Inputs and environment / 输入与环境变量 |
|---|---|---|---|
| `serve-e2e.mjs` | `pnpm e2e:serve` | Real DSH WebUI with disposable state and a loopback model; Ctrl-C removes the fixture and `SIGUSR2` restarts the WebUI on the same data. Its options are in the [development guide](../docs/en/development/README.md#fixture-options) / 使用临时数据与回环模型的真实 DSH WebUI；Ctrl-C 清理夹具，`SIGUSR2` 保留数据重启 WebUI。选项见[开发指南](../docs/zh-CN/development/README.md#夹具选项) | `MNEMON_E2E_PORT`, `MNEMON_E2E_DSH`, `MNEMON_E2E_EMBEDDING_DELAY_MS`, `MNEMON_CLI_PATH`; `DEEPSEEK_API_KEY` and `DEEPSEEK_BASE_URL` with `--live-model` / 与 `--live-model` 一起使用 |
| `serve-sidebar-bundle-reproduction.mjs` | `node` | Published DSH with every packed plugin in disposable storage, for native Sidebar navigation and independent bundle activation / 在临时存储中运行正式发布的 DSH 与全部打包插件，用于原生侧栏导航与 bundle 独立启用 | `--profile`, `--artifacts`, `--state` (empty / 空目录), `--port`, `--skin-center`, `--skin-market`; `MNEMON_CLI_PATH` |
| `seed-provider-lab.mjs` | `node`, see [Provider Lab](../provider-lab/README.md) | One active Provider Lab Memory Space per Provider, seeded through public plugin composition / 通过公开的插件组合为每个 Provider 建立一个已激活的 Provider Lab 记忆空间并写入数据 | `MNEMON_DATA_DIR` (disposable / 仅用临时目录), `PROVIDER_LAB_ONLY`, `SUPERMEMORY_API_KEY`, `OPENVIKING_ROOT_API_KEY`, `BRV_PATH`, `MEM0_LLM_MODEL` |
| `probe-provider-lab.mjs` | `node` | Health report for the Provider Lab services; exits 1 when one is down / Provider Lab 各服务的健康报告，有服务不可用时退出码为 1 | `OPENVIKING_ROOT_API_KEY` |

## Fixtures / 夹具

Under `fixtures/`. The scripted models answer for one `serve-e2e.mjs` option each and print their steps with their own prefix.

位于 `fixtures/`。每个脚本化模型对应 `serve-e2e.mjs` 的一个选项，并以自己的前缀输出各步。

| File / 文件 | Used by / 使用方 |
|---|---|
| `archive-copies.mjs` | `--archive-copies`: working memory and its copies seeded before the Host starts, and a slow embedding service / Host 启动前写入的工作记忆及其副本，以及响应缓慢的嵌入服务 |
| `docs-demo.mjs` | `--docs-demo`, `--remember-target`, `--recall-budget`: the fictional Lumen project and its scripted model / 虚构的 Lumen 项目及其脚本化模型 |
| `document-archive-model.mjs`, `document-protection-model.mjs`, `exact-id-model.mjs`, `general-strategy-model.mjs`, `idle-review-model.mjs`, `legacy-session-replay-model.mjs`, `openviking-write-model.mjs`, `profile-compaction-model.mjs`, `recall-budget-model.mjs`, `remember-target-model.mjs`, `result-tool-cache-model.mjs`, `review-evidence-model.mjs`, `review-layers-model.mjs`, `runtime-routing-model.mjs`, `runtime-write-scope-model.mjs`, `save-action-model.mjs`, `strict-template-model.mjs` | The `serve-e2e.mjs` option of the same name / `serve-e2e.mjs` 中同名的选项 |
| `delegated-completion.mjs` | The scripted models: reads the completion instructions a delegated child receives / 各脚本化模型：读取委派子 Agent 收到的完成说明 |
| `openviking-protocol.mjs` | `node scripts/fixtures/openviking-protocol.mjs` for `--openviking-write`: a deterministic OpenViking protocol server, not a live backend / 供 `--openviking-write` 使用的确定性 OpenViking 协议服务，不是真实后端; `MNEMON_OPENVIKING_FIXTURE_PORT` (default / 默认 19335) |
| `openviking-user-key.mjs` | `tests/openviking-user-host.spec.mjs`: the user-key protocol of issue #271 / issue #271 的 user key 协议 |
| `electron-dsh-host.cjs` | `--electron`: runs the DSH CLI in an Electron main process / 在 Electron 主进程中运行 DSH CLI |
| `electron-desktop-window.mjs`, `electron-desktop-preload.cjs` | Opens a running WebUI the way DSH Desktop does, at `dsh-app://app/`, for desktop-only checks such as #310 / 像 DSH 桌面版那样在 `dsh-app://app/` 打开运行中的 WebUI，用于 #310 等桌面版专属检查; `DSH_HOST_URL`, `DSH_TRANSPORT`, `DSH_OFFSCREEN`, `DSH_LANG`, `--remote-debugging-port` |
| `packed-web-fixture.mjs` | Published DSH and packed plugins with disposable state, shared by the acceptance fixtures below and `serve-sidebar-bundle-reproduction.mjs` / 正式发布的 DSH 与打包插件加临时数据，供下列验收夹具与 `serve-sidebar-bundle-reproduction.mjs` 共用; `--profile`, `--artifacts`, `--state`, `--port`; `MNEMON_CLI_PATH` |
| `serve-runtime-metadata.mjs` | Issue #280 acceptance: the importance and age lines of the runtime snapshot / issue #280 验收：运行时快照中的重要性与时间标注 |
| `serve-runtime-user-branches.mjs` | Issue #281 acceptance: a user-profile entry replaced with an empty `branches` list / issue #281 验收：以空的 `branches` 列表替换用户画像条目; `--profile`, `--artifacts`, `--state`, `--port`; `MNEMON_CLI_PATH` |
| `serve-skin-hook.mjs` | Issue #273 acceptance: skin overrides of the workspace surface / issue #273 验收：皮肤对工作台表面的覆盖; `--skin-order before\|after\|none` |
| `serve-team-review.mjs` | Issue #275 acceptance: idle review beside published DSH Agent Teams / issue #275 验收：与正式发布的 DSH Agent Teams 并存的空闲审查; `--profile`, `--artifacts`, `--state`, `--policy`, `--provider`; `MNEMON_CLI_PATH` |
| `plugin-consumer/` | `verify-plugin-artifacts.mjs` and the [plugin guide](../docs/en/development/extensions.md): an external Source, Strategy, Provider and Client built only on the packed public SDKs / 以及[插件开发指南](../docs/zh-CN/development/extensions.md)：只依赖打包后公开 SDK 的外部 Source、Strategy、Provider 与 Client |

Other fixtures live beside the tests that use them, in `tests/fixtures/`; [the pre-extraction storage fixture](../tests/fixtures/upgrade/README.md) explains its own.

其他夹具与使用它们的测试放在一起，位于 `tests/fixtures/`；[拆分前的存储夹具](../tests/fixtures/upgrade/README.md)有自己的说明。
