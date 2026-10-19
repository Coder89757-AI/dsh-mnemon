# 不论 Git 配置了什么，Git 同步都能找到令牌，并以各主机接受的用户名提供它

**简体中文** | [English](./README.md)

对应 Issue [#408](https://github.com/omdsh-dev/dsh-mnemon/issues/408) 及其补充评论。测试分支 `claude/fix-408-git-credential-username`，基于 main `2143a1ed`（v0.5.32），2026-10-19 至 2026-10-20（Asia/Shanghai），Node 24.19.0、pnpm 10.13.1、Git 2.50.1（Apple Git-155），宿主为固定的 DSH 0.2.1-rc.2 与已安装的 DSH 0.2.0-rc.2。全程没有使用任何账号、令牌或网络远端：每条 Git 命令都针对本地仓库或回环地址上的 HTTPS 远端，令牌均为虚构，Git 读取的是检查自己写入的配置（`GIT_CONFIG_GLOBAL`、`GIT_CONFIG_NOSYSTEM=1`），从未读取本机自己的配置。

## 问题所在

Git 同步通过一个只为一条命令存在的凭据存储把令牌交给 Git：一个权限 `0600` 的文件，内容为 `https://x-access-token:<令牌>@<主机>`，命令参数清空 helper 列表后加上 `store --file=<文件>`。有两种情况 Git 在其中找不到凭据，第三种情况则在主机一侧失败：

- **为该主机配置了用户名。** Git 按地址对应的用户名查找凭据；地址里没有用户名时，取 `credential.username` 或 `credential.<url>.username`。Git Credential Manager 的配置里带有 `credential.https://github.com.username`，报告者的机器正是如此。凭据存储里是 `x-access-token`，于是匹配不到，Git 退回交互提示，被 `GIT_TERMINAL_PROMPT=0` 拒绝，`could not read Password` 被归为认证失败：账号明明已登录，页面却显示“需要凭据，请用 GitHub 登录或填写访问令牌”，重新登录也无济于事。
- **`credential.useHttpPath`。** 开启后 Git 会把仓库路径加入查找条件，只写明主机的条目就匹配不上了。Git Credential Manager 安装时会设置 `credential.https://dev.azure.com.useHttpPath = true`（[源码](https://github.com/git-ecosystem/git-credential-manager/blob/main/src/Microsoft.AzureRepos/AzureReposHostProvider.cs) 中的 `ConfigureAsync`）。
- **`x-access-token` 是 GitHub 的令牌用户名。** 补充评论用有效令牌实测 Gitee：账户名与 `oauth2` 都可以，`x-access-token` 得到 `The token username invalid` 与 HTTP 403。在 Gitee 上用令牌走 HTTPS 同步从来不可能成功，页面同样要求填写一个已经填写了的令牌。

三种情况最后都提示用户去登录或填写令牌。此外，凭据存储里的主机写作 `new URL(地址).host`，即转为小写并去掉默认端口，而 Git 按地址原样比较主机：`https://GitHub.com/...` 或 `https://host:443/...` 也同样匹配不到。

## 改动内容

**用户名。** 凭据存储写入地址中写明的用户名；没有写明时，`github.com` 用 `x-access-token`，其他主机都用 `oauth2`（`src/host/git-sync.ts` 的 `credentialTarget`）。主机完全按地址原样写入；令牌做百分号编码，Git 读取时会解码还原；由字母、数字、`-`、`_`、`.`、`~` 组成的令牌（GitHub、GitLab、Gitee 与 Gitea 的令牌都是如此）写入的字节与之前完全相同。

**查找。** 不论这台电脑配置了什么，Git 都必须按这个用户名查找令牌：

- Git 2.26 及以后的版本得到 `-c credential.username=<用户名>`。从 2.26 起，Git 读到的最后一个 `credential.username` 生效，而命令行在所有配置文件之后读取（[82eb2498](https://code.googlesource.com/git/+/82eb249853868582d8ba65e3afc5a7dcaeb620ea%5E%21/)，“credential: use the last matching username in the config”）。凭据配置段不论 URL 模式如何都按读取顺序应用，因此更具体的模式也不会胜出：测试覆盖了 `credential.https://github.com/<owner>.username` 与只针对一个仓库的写法、被包含的文件、系统配置文件、`GIT_CONFIG_PARAMETERS` 与 `GIT_CONFIG_COUNT`。
- 更早的 Git（同步通道支持 2.20 及以后）保留第一个配置的用户名，命令行上的用户名会输给全局配置。这类 Git 改为在地址中得到用户名，即 `https://<用户名>@<主机>/...`，所有 Git 都优先采用地址中的用户名（[gitcredentials](https://git-scm.com/docs/gitcredentials)：`username` 是“a default username, if one is not provided in the URL”）。
- 地址中已写明用户名时，所有版本都按原样把地址交给 Git。
- 每条带认证的命令还会得到 `-c credential.useHttpPath=false`，因为凭据存储只写明主机。

Git 版本取自同步通道在每次操作前本来就会读取的版本（`gitStatus`）。其余不变：`ls-remote`、`fetch` 与 `push` 的其他参数相同，镜像的 `mnemon.origin` 仍是配置的地址，Git 写入 `FETCH_HEAD` 时不带用户名部分。

**为什么不在所有 Git 上都把用户名写进地址。** 这是 Git 文档写明优先的方式。但对着回环远端追踪可以看到，地址带用户名时，Git 会经由 curl 先以空密码提供一次这个用户名，然后才去查凭据存储；命令行给出用户名，则保持现在正常工作时的请求序列：

| 用户名如何交给 Git | 一次 `ls-remote` 发出的请求（用户名:密码） |
|---|---|
| 不做固定，issue 中的配置（main） | 无认证，然后 Git 放弃：`could not read Password for 'https://alice@…'` |
| `-c credential.username=oauth2`（Git 2.26 及以后，本改动） | 无认证 → `oauth2:<令牌>` → `oauth2:<令牌>` |
| `https://oauth2@host/...`（更早的 Git，本改动） | 无认证 → `oauth2:<空>` → `oauth2:<令牌>` → `oauth2:<令牌>` |

上表各主机对空密码的请求都回答 401，随后拿到令牌；但这让每条命令多一次请求，而如果某个主机对它回答 403，原本能用的同步就会被拒绝。因此地址写法只用于没有其他办法胜出的 Git 版本。issue 自带的补丁 `-c credential.username=x-access-token` 正是 github.com 在 Git 2.26 及以后的写法，报告者已在真实 GitHub 上用 `ls-remote`、`fetch` 与 `push --dry-run` 验证过。

**地址中的用户名。** 表单与 Host 共用的 `src/host/sync-rules.ts` 现在接受用户名部分是用户名的 HTTPS 地址：字母、数字、`.`、`_`、`~`、`+`、`-` 或百分号转义，最多 100 个字符。以下情况仍然拒绝：密码（`user:secret@`）、空的用户名部分、第二个 `@`，以及形似令牌的用户名部分：GitHub（`ghp_`、`gho_`、`ghu_`、`ghs_`、`ghr_`、`github_pat_`）与 GitLab（`glpat-`）令牌的前缀，以及连续 32 个及以上的字母数字（Gitee、Gitea、Azure DevOps 的令牌与 GitHub 旧式令牌都是这样）。表单的拒绝提示改为：地址里只能写用户名，令牌请填在“访问令牌”里（英文为 Only a user name may go in the address; enter the token under Access token）。

**提示文案。** Host 提供了凭据而主机拒绝时，仓库这一行、手动同步、自动同步以及两个对话框现在都如实说明：github.com 上为“GitHub 拒绝了这个凭据，请重新登录，或检查它能否访问这个仓库”，其他 HTTPS 主机为“仓库主机拒绝了这个凭据，请检查令牌，或在地址中写上它要求的用户名”。客户端依据 `credentialSource` 判断，状态里本来就带有它，且与每条命令使用的凭据出自同一次解析。没有凭据时仍是原来的文案，SSH、本地路径、找不到仓库、网络与超时的文案也都不变。页面不显示 Git 的原始输出：原因已经点明，这一行也保持简短。

## 各主机接受的令牌用户名

| 主机 | 搭配令牌的用户名 | 依据 |
|---|---|---|
| github.com | `x-access-token`，保持不变；GitHub 登录的凭据同样适用 | [GitHub：通过 HTTP 使用 installation token](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/authenticating-as-a-github-app-installation)；报告者用 `-c credential.username=x-access-token` 所做的验证 |
| GitLab | 个人、项目与群组令牌接受任意非空用户名；OAuth 令牌推荐 `oauth2` | [Personal access tokens](https://docs.gitlab.com/user/profile/personal_access_tokens/)、[OAuth 2.0](https://docs.gitlab.com/api/oauth2/) |
| Gitee | 账户名或 `oauth2`；`x-access-token` 被拒绝，HTTP 403 | 补充评论在 0.5.32 上的实测；没有找到 Gitee 的相关文档 |
| Gitea | 不检查：密码是令牌时由令牌确定用户 | [services/auth/basic.go](https://github.com/go-gitea/gitea/blob/main/services/auth/basic.go) |
| Forgejo | 各部署的文档写的是账户名加令牌作密码；它源自 Gitea，Gitea 的检查忽略用户名，但这里没有核对它当前的代码 | — |
| Azure DevOps | 不检查：“the username can be empty” | [Use personal access tokens](https://learn.microsoft.com/en-us/azure/devops/organizations/accounts/use-personal-access-tokens-to-authenticate) |
| Bitbucket Cloud | `x-token-auth`（access token 与 API token），API token 也可用 Bitbucket 用户名；没有列出 `oauth2`，因此需要在地址中写明用户名 | [Access tokens](https://support.atlassian.com/bitbucket-cloud/docs/using-access-tokens/)、[API tokens](https://support.atlassian.com/bitbucket-cloud/docs/using-api-tokens/) |
| AWS CodeCommit | IAM 为 Git 凭据生成的用户名 | [Git credentials](https://docs.aws.amazon.com/codecommit/latest/userguide/setting-up-gc.html) |

因此 github.com 以外主机的默认用户名是 `oauth2`：Gitee 要求它或账户名，GitLab 为 OAuth 令牌推荐它、其他令牌也接受它，Gitea 与 Azure DevOps 不看用户名。`x-access-token` 虽然后三者同样接受或忽略，却正是 Gitee 拒绝的那一个。要求特定用户名的主机（例如 Bitbucket）从地址中得到用户名，这也正是它自己的文档写克隆地址的方式（`https://x-token-auth@bitbucket.org/{workspace}/{repository}.git`）。

## 改动前后

### 离线：用同步通道交给 Git 的参数，`git credential fill` 能找到什么

[`harness/credential-lookup.probe.ts`](./harness/credential-lookup.probe.ts) 在一次性凭据存储还存在时，用同步通道构造出的那一组参数运行 `git credential fill` 来回答状态检查的 `ls-remote`，然后通过回环 HTTPS 远端同步，并打印页面上的文案。在本分支上运行一次，再换回 main 的 `git-sync.ts`、`sync-rules.ts`、`sync-view.ts`、`MnemonSyncSection.tsx`、`MnemonSyncDialogs.tsx` 与 `locales.ts` 运行一次：

| 场景 | main | 本改动 |
|---|---|---|
| `credential.https://github.com.username = alice`（issue 的情况） | `could not read Password for 'https://alice@github.com'` | `username=x-access-token password=<令牌>` |
| `credential.https://github.com/octocat.username = alice` | `could not read Password for 'https://alice@github.com'` | `username=x-access-token password=<令牌>` |
| `credential.username = alice` | `could not read Password for 'https://alice@github.com'` | `username=x-access-token password=<令牌>` |
| `credential.https://dev.azure.com.useHttpPath = true` | `could not read Username for 'https://dev.azure.com/contoso/project/_git/memory'` | `username=oauth2 password=<令牌>` |
| gitee.com，无任何配置 | `username=x-access-token`（Gitee 拒绝） | `username=oauth2 password=<令牌>` |
| 地址写作 `GitHub.com:443` | `could not read Username for 'https://GitHub.com:443'` | `host=GitHub.com:443 username=x-access-token password=<令牌>` |
| 接受任意用户名的 HTTPS 远端；为它配置了 `alice` | 状态：auth，`could not read Password for 'https://alice@127.0.0.1:…'` | 可访问；推送成功 |
| 像 Gitee 一样拒绝 `x-access-token`、接受 `oauth2` 的 HTTPS 远端 | 状态：auth，`remote: This host takes no token under that user name` … `error: 403` | 可访问；推送成功 |
| 要求 `x-token-auth`、在地址中写明的 HTTPS 远端 | 拒绝：`sync repository must not embed credentials` | 可访问；推送成功 |
| 页面，github.com，提供了凭据 | Needs credentials; sign in with GitHub or add an access token | GitHub rejected the credential; sign in again or check its access to this repository |
| 页面，其他主机，提供了凭据 | Needs credentials; add an access token | The host rejected the credential; check the token, or put the user name it expects in the address |
| 页面，没有凭据（两种主机） | Needs credentials … | 不变 |

### WebUI

在 DSH 0.2.1-rc.2 上运行真实 WebUI（`scripts/serve-e2e.mjs`），配合 [`scripts/fixtures/git-https-remote.mjs`](../../../scripts/fixtures/git-https-remote.mjs) 启动的三个回环远端；WebUI 的 Git 通过 `GIT_SSL_CAINFO` 信任它们的证书，并读取一份为第一个远端写明 `alice` 用户名的配置。同样的步骤分别在 main 的构建与本分支的构建上、以中文与英文运行；截图是插件页中 dsh-mnemon 页面的 Git 同步区块。

无头 Chrome，1280×900，浅色。在**插件 → 可组合记忆**中打开 **Git 同步**，选择**仓库地址**，填入第一个远端的地址与令牌，点击**连接**。之后每次都经由**更改**与**保存**：第二个远端加令牌；同一地址加错误令牌；第三个远端写上 `x-token-auth@` 的地址加令牌，随后点击**立即同步**；同一地址写成 `x-token-auth:secret@`，被表单拒绝，点击**取消**。基线是在用 main 的六个模块构建的版本上执行同样的步骤。

第一个远端接受任意用户名下的令牌；为它配置了 `alice`，填写的是有效令牌：

| main | 本改动 |
|---|---|
| ![main：需要凭据](./zh-configured-name-before.jpg) | ![本改动：已连接，使用访问令牌](./zh-configured-name-after.jpg) |
| ![main，英文](./en-configured-name-before.jpg) | ![本改动，英文](./en-configured-name-after.jpg) |

第二个远端拒绝 `x-access-token`、接受 `oauth2`。使用有效令牌时，main 显示“需要凭据，请填写访问令牌”（远端收到的是 `x-access-token`，回答 403），本分支则成功连接；下面是使用错误令牌时：

| main | 本改动 |
|---|---|
| ![main：需要凭据](./zh-refused-token-before.jpg) | ![本改动：仓库主机拒绝了这个凭据](./zh-refused-token-after.jpg) |
| ![main，英文](./en-refused-token-before.jpg) | ![本改动，英文](./en-refused-token-after.jpg) |

第三个远端要求 `x-token-auth`，写在地址中：

| main | 本改动 |
|---|---|
| ![main：地址被当作令牌拒绝](./zh-user-in-address-before.jpg) | ![本改动：地址被接受](./zh-user-in-address-after.jpg) |
| ![main，英文](./en-user-in-address-before.jpg) | ![本改动，英文](./en-user-in-address-after.jpg) |

在本分支上，这个地址成功连接，**立即同步**也成功推送。地址中的密码仍会被拒绝，提示为新的文案：

| 中文 | English |
|---|---|
| ![地址中的密码被拒绝](./zh-password-in-address-after.jpg) | ![a password in the address is refused](./en-password-in-address-after.jpg) |

本分支上各远端收到的请求：第一个只有 `oauth2:<令牌>`（200）；第二个是 `oauth2:<令牌>`（200，错误令牌时为 401）；第三个先是空密码的 `x-token-auth`（401），再是带令牌的（200），这是地址写明用户名时都会发出的请求。在 main 上：第一个远端没有收到任何带认证的请求，第二个收到 `x-access-token:<令牌>`（403）。本分支在 DSH 0.2.0-rc.2 上运行同样的步骤，得到同样的状态与文案。所有运行都没有浏览器控制台错误。

### 在 main 的模块上运行测试

换回 main 的六个模块后运行新增与改动的测试：65 个中有 15 个失败，失败的正是本改动修复的内容（凭据测试中的各次查找、HTTPS 同步、两侧的地址规则、表单文案、拒绝提示），其余通过。`reports a credential the host refuses as an authentication failure with a credential offered` 在 main 上同样通过：它固定的是页面所依赖的 Host 分类。

## 兼容性

- **存储的数据与设置。** 没有键名变化：`state/sync-git.json` 仍是 `repoUrl` 与 `token`，以前保存的配置读取结果相同。变化在于接受哪些地址：带用户名的地址现在有效。更早的 dsh-mnemon 读到这样的地址会拒绝整个文件（`sync repository must not embed credentials`），因此保存过这种地址的用户在回退到旧版本、或与旧版本共用数据目录之前，需要先去掉用户名；操作指南写明了这一点。
- **现有用户看到的变化。** github.com 上除原本失败的情况外没有变化：用户名仍是 `x-access-token`，在 Git 2.26 及以后请求也完全相同。其他主机的用户名变为 `oauth2`：GitLab、Gitea 与 Azure DevOps 原本接受 `x-access-token`，同样接受 `oauth2`；原本拒绝它的 Gitee 现在可以同步。大小写混写或写明端口的地址现在能匹配到它的凭据。只有提供了凭据且被拒绝时，页面才显示“拒绝”。
- **镜像与进程参数。** 令牌只进入一次性凭据存储。默认用户名只在 Git 2.26 之前的版本里出现在命令参数中，Git 也不会把它写到任何地方：测试在真实的 HTTPS 同步之后扫描两个存储根目录，除 `sync-git.json` 外找不到令牌，任何地方也找不到 `oauth2`，`FETCH_HEAD` 与镜像的配置都包括在内。
- **`url.<base>.insteadOf`。** 在 Git 2.26 及以后，交给 Git 的地址不变，改写规则照常生效。在更早的 Git 上，默认用户名写进地址后，为 `https://<主机>/` 写的规则不再匹配。
- **版本错配。** 只涉及 Starter：Host 与页面在同一个包中发布，插件没有改动。`credentialTarget` 是 `src/host/git-sync.ts` 新增的导出，不经由任何公开入口暴露；客户端的文案函数增加了一个可选的末位参数，`MnemonKey` 增加了两个键。
- **公开 SDK、RPC 与工具。** 任何公开入口的导出、RPC 名称、存储键、工具及工具描述都没有变化。

## 验证

| 检查 | 结果 |
|---|---|
| `pnpm exec vitest run tests/git-sync-credentials.spec.mjs` | 10 个通过：7 个离线（对 14 组主机与配置以及另外四处 Git 读取配置的位置运行 `git credential fill`，GitHub 登录的凭据，写明用户名的地址，主机的大小写与端口，Git 2.25 与 2.26 的两种写法，各主机的用户名），3 个走 HTTPS（越过已配置的用户名并通过拒绝 `x-access-token` 的主机同步、被拒绝的令牌、地址中的用户名） |
| 客户端、规则与配置测试（`tests/client-sync.spec.tsx`、`tests/sync-rules.spec.ts`、`tests/sync-config.spec.ts`、`tests/client-presentation.spec.ts`） | 60 个通过 |
| 同样的新测试在 main 的模块上 | 65 个中 15 个失败，见上文 |
| `pnpm exec vitest run tests/git-sync.spec.ts tests/sync-rpc.spec.ts tests/auto-backup.spec.ts tests/github-auth.spec.ts` | 107 个通过 |
| DSH 0.2.1-rc.2 上的 `pnpm run e2e:sync` | 64 项全部通过 |
| `MNEMON_E2E_DSH=…/dsh-0.2.0-rc.2/… node scripts/verify-sync-git.mjs` | 64 项全部通过 |
| WebUI：main 与本分支、中文与英文，DSH 0.2.1-rc.2；本分支另在 DSH 0.2.0-rc.2 与单独安装的 0.2.1-rc.2 上 | 见上文 |
| `pnpm run verify` | 通过：5041 个本地链接与 371 个锚点；根测试 154 个文件中 2134 个通过、7 个跳过；17 个插件测试套件 597 个通过、3 个跳过；Headless 激活；包内容 66 个文件 |
| `MNEMON_CLI_PATH=/nonexistent/mnemon MNEMON_PLUGIN_VERIFY_CONCURRENCY=1 pnpm run verify:plugins` | 通过：17 个独立插件仓库与 18 个打包产物 |
| `DSH_HOST_ROOT=<prefix>/lib/node_modules/@deepseek-ai/dsh pnpm run test:installed-dsh`，DSH 0.2.0-rc.2 | 154 个文件中 2131 个通过、10 个跳过；只针对 DSH 0.2.1 行为的测试跳过 |

```sh
pnpm install --frozen-lockfile
pnpm build && pnpm --workspace-concurrency=4 -r build
# Git 只读取检查控制的配置，从不读取本机的配置。
export GIT_CONFIG_GLOBAL=<空文件> GIT_CONFIG_NOSYSTEM=1
pnpm exec vitest run tests/git-sync-credentials.spec.mjs tests/client-sync.spec.tsx tests/sync-rules.spec.ts tests/sync-config.spec.ts tests/client-presentation.spec.ts
pnpm exec vitest run tests/git-sync.spec.ts tests/sync-rpc.spec.ts tests/auto-backup.spec.ts tests/github-auth.spec.ts
node scripts/verify-sync-git.mjs
MNEMON_E2E_DSH=<prefix>/lib/node_modules/@deepseek-ai/dsh/lib/bin.js node scripts/verify-sync-git.mjs   # DSH 0.2.0-rc.2
pnpm run verify
MNEMON_CLI_PATH=/nonexistent/mnemon MNEMON_PLUGIN_VERIFY_CONCURRENCY=1 pnpm run verify:plugins
DSH_HOST_ROOT=<prefix>/lib/node_modules/@deepseek-ai/dsh pnpm run test:installed-dsh   # DSH 0.2.0-rc.2
# 探针：在本分支上运行一次，换回 main 的模块后再运行一次：
cp docs/pr-assets/issue-408-git-credential-username/harness/credential-lookup.probe.ts tests/credential-lookup.spec.ts
pnpm exec vitest run tests/credential-lookup.spec.ts
for file in src/host/git-sync.ts src/host/sync-rules.ts src/client/sync-view.ts src/client/MnemonSyncSection.tsx src/client/MnemonSyncDialogs.tsx src/client/locales.ts; do git show origin/main:$file > $file; done
pnpm exec vitest run tests/credential-lookup.spec.ts
git checkout -- src && rm tests/credential-lookup.spec.ts
# 手动试用的远端；把它打印的证书交给 WebUI 的 Git：
node scripts/fixtures/git-https-remote.mjs --account oauth2:<虚构令牌> --refuse x-access-token
```

## 局限

- 这里没有 2.26 之前的 Git。它的写法通过同步通道在报告 `git version 2.25.1` 时构造的参数检查，哪个用户名生效则依据 Git 自身的历史；地址写法本身已在 Git 2.50 上对回环远端验证。
- 没有访问任何真实主机。回环远端按设定的策略应答；各主机的表格依据各自的文档、Gitea 的源码与补充评论对 Gitee 的实测。如果某个主机对空密码的请求回答 403，写明用户名的地址就会被拒绝，而所有这样的 Git 远端都会发出这个请求。
- GitHub 对凭据无权访问的私有仓库仍回答“找不到”，找不到仓库的文案仍提到登录或令牌；按 issue 的要求，只有认证这一种情况改变了。
- 页面仍不显示 Git 的 stderr；页面无法归类的失败，仍由 Host 的错误信息（令牌已遮蔽）给出原文。
