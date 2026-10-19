# Git sync finds its token whatever Git configures, under a user name each host takes

[简体中文](./README.zh-CN.md) | **English**

Issue [#408](https://github.com/omdsh-dev/dsh-mnemon/issues/408) and its comment. Tested on branch `claude/fix-408-git-credential-username`, written on main `2143a1ed` (v0.5.32) and revised after two reviews, 2026-10-19 to 2026-10-20 (Asia/Shanghai), Node 24.19.0, pnpm 10.13.1 and Git 2.50.1 (Apple Git-155), against the pinned DSH 0.2.1-rc.2 and an installed DSH 0.2.0-rc.2. No account or token was used, and no request reached a Git host: every Git command ran against local repositories or loopback HTTPS remotes with made-up tokens, through no proxy, under a Git configuration the check wrote itself (`GIT_CONFIG_GLOBAL`, `GIT_CONFIG_NOSYSTEM=1`; the one test of a system file names a file of its own with `GIT_CONFIG_SYSTEM` and runs only on Git 2.32 and later, which read that file in place of the machine's), so the machine's own configuration was never read.

The rule the review set: every setup that works today stays as it is, and behavior changes only where it fails.

## What was wrong

Git sync hands a token to Git through a credential store that exists for one command: a `0600` file holding `https://x-access-token:<token>@<host>`, and arguments that clear the helper list and add `store --file=<file>`. Git found nothing in it in two cases, and a third case broke on the host's side:

- **A user name configured for the host.** Git looks a credential up under the user name it has for the address, and takes one from `credential.username` or `credential.<url>.username` when the address names none. Git Credential Manager setups carry `credential.https://github.com.username`, as the reporter's did. The store holds `x-access-token`, so nothing matched, Git fell back to a prompt, `GIT_TERMINAL_PROMPT=0` refused it, and `could not read Password` was classified as an authentication failure: the page said "Needs credentials; sign in with GitHub or add an access token" while the account was signed in, and signing in again changed nothing.
- **`credential.useHttpPath`.** With it on, Git adds the repository's path to the lookup, and an entry that names the host alone no longer matches. Git Credential Manager's installer sets `credential.https://dev.azure.com.useHttpPath = true` ([source](https://github.com/git-ecosystem/git-credential-manager/blob/main/src/Microsoft.AzureRepos/AzureReposHostProvider.cs), `ConfigureAsync`).
- **gitee.com refuses `x-access-token`.** The comment measured Gitee with a valid token: the account name and `oauth2` work, `x-access-token` gets `The token username invalid` and HTTP 403. HTTPS sync with a token could never work there, and the page again asked for a token that was given.

All three ended in a message that sent the user to sign in or add a token. The store's host was also written as `new URL(address).host`, lowercased and without a default port, while Git compares the host as the address writes it: `https://GitHub.com/...` or `https://host:443/...` never matched either.

## What changed

**The user name.** The store holds the user name the address names, else `oauth2` for `gitee.com`, also when written `gitee.com.`, and `x-access-token` for every other host, as before (`src/host/git-sync.ts`, `credentialTarget`). The host is kept exactly as the address writes it, and the token is percent-encoded, which Git decodes back; a token made of letters, digits, `-`, `_`, `.` and `~`, as GitHub's, GitLab's, Gitee's and Gitea's are, is written byte for byte as before.

**The lookup.** Git must look the token up under that name, whatever the machine configures, and the command must otherwise stay the one that has always run:

- **Git 2.26 and later** get `-c credential.useHttpPath=false -c credential.username=<name>` and the address without a user name. From 2.26 on, the last `credential.username` Git reads wins, and the command line is read after every configuration file ([82eb2498](https://code.googlesource.com/git/+/82eb249853868582d8ba65e3afc5a7dcaeb620ea%5E%21/), "credential: use the last matching username in the config"). Credential sections are applied in the order they are read whatever their URL pattern, so a more specific pattern does not win: the tests include `credential.https://github.com/<owner>.username` and one for a single repository, an included file, `GIT_CONFIG_PARAMETERS` in the form every Git reads, `GIT_CONFIG_COUNT` from Git 2.31 and a system file from Git 2.32, each first shown to be in effect. The requests a working setup makes are the ones it made before; the two keys only add a name Git would otherwise have taken from the store.
- **An older Git** (the channel supports 2.20 and later) kept the first configured user name, so a name on the command line would lose to a global one there. It runs the command main has always run, unless `git config --get-urlmatch credential <address>`, read in the command's own environment and directory, names another user for the address than the store's, an empty name included: then the store's name goes into the address, `https://<name>@<host>/...`, which every Git takes before any configured name ([gitcredentials](https://git-scm.com/docs/gitcredentials): `username` is "a default username, if one is not provided in the URL"). A configured name that is the store's own, such as `credential.https://github.com.username = x-access-token`, which works on main, keeps main's command. When the configuration turns `credential.useHttpPath` on, read as Git reads a boolean, the command turns it off.
- **An address that names its user** gets the same treatment: on Git 2.26 and later the name goes on the command line and the address without it; an older Git gets the address as written.

The Git version is the one the channel already reads before every operation (`gitStatus`). The mirror's `mnemon.origin` keeps the configured address, and Git writes `FETCH_HEAD` without a user part.

**Why the name goes on the command line rather than into the address.** A name in the address is what Git documents as taking precedence, but Git, through curl, then offers that name once with an empty password before it asks the store. Traced against the loopback remote, one `ls-remote` makes these requests (user:password):

| How the name reaches Git | Requests |
|---|---|
| Nothing pinned, the issue's configuration (main) | none, then Git gives up: `could not read Password for 'https://alice@…'` |
| `-c credential.username=<name>` and the plain address (Git 2.26 and later, this change) | none → `<name>:<token>` → `<name>:<token>` |
| `https://<name>@host/...` (an older Git with a configured name, this change) | none → `<name>:<empty>` → `<name>:<token>` → `<name>:<token>` |

The empty-password request is answered 401 by the hosts above, which then get the token, but it is one more request, and a host that answered it with 403 would refuse. So the address carries the name only on a Git where nothing else wins over a configured name, and only when another one is configured. The issue's own patch, `-c credential.username=x-access-token`, is the Git 2.26 form for github.com, which the reporter verified against real GitHub with `ls-remote`, `fetch` and `push --dry-run`.

**A user name in the address.** `src/host/sync-rules.ts`, shared by the form and the Host, accepts an HTTPS address whose user part is a user name, judged as Git reads it:

- the user part may hold what RFC 3986 allows there (letters, digits, `-._~!$&'()*+,;=` and escapes), and is decoded before it is judged; one that does not decode is refused;
- the decoded name may not hold a colon (a password), an `@`, a control character or a space, and is at most 100 characters, so `alice%3Ahunter2@`, `alice%40example.com@`, `alice%0A@` and `alice%20smith@` are refused;
- the decoded name may not look like a token: the prefixes GitHub (`ghp_`, `gho_`, `ghu_`, `ghs_`, `ghr_`, `github_pat_`), GitLab (`glpat-`, `gldt-`, `glcbt-`), Hugging Face (`hf_`) and Atlassian (`ATBB`, `ATCTT`, `ATATT`) give theirs, so an escaped prefix such as `%67hp_…` is refused too; 32 or more hexadecimal digits, as Gitee's, Gitea's and older GitHub tokens are; or 52 or more letters and digits, as Azure DevOps' tokens are. 52 is longer than a GitHub user name (39), a Bitbucket user name (30) or an Azure DevOps organization name (50), so a long organization name in the address is taken; the first version counted 32 letters and digits as a token, which refused it.

The form's refusal reads "Only a user name may go in the address; enter the token under Access token" (地址里只能写用户名，令牌请填在“访问令牌”里).

**The message.** When the Host offered a credential and the host refused it, the repository row, a sync, an automatic sync and the two dialogs say so, and name what was refused, since a saved token and `MNEMON_SYNC_GIT_TOKEN` come before the GitHub sign-in and signing in again changes nothing for them:

| Credential | github.com | Another host |
|---|---|---|
| The GitHub sign-in | GitHub rejected the sign-in; sign in again or check its access to this repository | — (the sign-in is offered to github.com alone) |
| A saved token | GitHub rejected the saved access token; replace it | The host rejected the saved token; replace it, or name the user it expects in the address |
| `MNEMON_SYNC_GIT_TOKEN` | GitHub rejected the token in MNEMON_SYNC_GIT_TOKEN; replace it | The host rejected the token in MNEMON_SYNC_GIT_TOKEN; replace it |
| None | unchanged: Needs credentials; sign in with GitHub or add an access token | unchanged: Needs credentials; add an access token |

The Chinese texts are in `src/client/locales.ts`. The client decides from `credentialSource`, which the status already carries and which comes from the same resolution each command uses. SSH, local, not-found, network and timeout texts are unchanged, and Git's own words are not shown. Each line was placed in the state line of the live page at the record's 1280 px width beside **Set credentials** and **Check again**, and stays one row in both languages. Beside them an English message has 514 px. With the variable's name in it, a pointer to the user name in the address took 534 to 666 px in every wording tried (the review's "The host rejected the token in MNEMON_SYNC_GIT_TOKEN; replace it, or put the user name it expects in the address" takes 666), so the variable's line says in both languages what GitHub's does (399 px), and the pointer stays on the saved-token line (496 px) and in the guide. The first version's English line ("The host rejected the credential; check the token, or put the user name it expects in the address") did not fit either.

## User names hosts take with a token

| Host | User name with a token | Source |
|---|---|---|
| github.com | `x-access-token`, unchanged; the GitHub sign-in's grant works under it | [Installation tokens over HTTP](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/authenticating-as-a-github-app-installation); the reporter's check with `-c credential.username=x-access-token` |
| GitHub Enterprise Server, and GitHub Enterprise Cloud with data residency (`*.ghe.com`) | `x-access-token`, unchanged: it is the only name their documentation gives for installation tokens | [GHES 3.17](https://docs.github.com/en/enterprise-server@3.17/apps/creating-github-apps/authenticating-with-a-github-app/authenticating-as-a-github-app-installation), [Enterprise Cloud](https://docs.github.com/en/enterprise-cloud@latest/apps/creating-github-apps/authenticating-with-a-github-app/authenticating-as-a-github-app-installation), [data residency on GHE.com](https://docs.github.com/en/enterprise-cloud@latest/admin/data-residency/about-github-enterprise-cloud-with-data-residency) |
| GitLab | Any non-blank name for personal, project and group tokens, `x-access-token` included; `oauth2` recommended for OAuth tokens | [Personal access tokens](https://docs.gitlab.com/user/profile/personal_access_tokens/), [OAuth 2.0](https://docs.gitlab.com/api/oauth2/) |
| gitee.com | `oauth2` (the default now) or the account name; `x-access-token` is refused with HTTP 403 | The issue comment's measurements on 0.5.32; no Gitee documentation found |
| A self-hosted Gitee | Presumably the same; the address names `oauth2` or the account name, as the refusal message says | — |
| Gitea | Not checked: a password that is a token identifies the user | [services/auth/basic.go](https://github.com/go-gitea/gitea/blob/main/services/auth/basic.go) |
| Forgejo | Its deployments document the account name with the token as password; it derives from Gitea, whose check ignores the name, but its current code was not checked here | — |
| Azure DevOps | Not checked: "the username can be empty" | [Use personal access tokens](https://learn.microsoft.com/en-us/azure/devops/organizations/accounts/use-personal-access-tokens-to-authenticate) |
| Bitbucket Cloud | `x-token-auth` (access and API tokens), or the Bitbucket user name for API tokens; the address names it | [Access tokens](https://support.atlassian.com/bitbucket-cloud/docs/using-access-tokens/), [API tokens](https://support.atlassian.com/bitbucket-cloud/docs/using-api-tokens/) |
| AWS CodeCommit | The user name IAM generates for Git credentials; the address names it | [Git credentials](https://docs.aws.amazon.com/codecommit/latest/userguide/setting-up-gc.html) |

So `x-access-token` stays the name every host is offered: github.com, GitHub Enterprise Server and `*.ghe.com` document it, GitLab, Gitea and Azure DevOps accept it, and no host was found that takes it and refuses `oauth2`, but none that refuses `oauth2` was ruled out either. Only gitee.com, which is known to refuse it, gets `oauth2`. Any other host that wants its own name, a self-hosted Gitee, Bitbucket or CodeCommit, gets it from the address, which is how Bitbucket's documentation writes the clone address (`https://x-token-auth@bitbucket.org/{workspace}/{repository}.git`).

## Before and after

### Offline: what `git credential fill` finds with the arguments the channel hands Git

[`harness/credential-lookup.probe.ts`](./harness/credential-lookup.probe.ts) answers the status check's `ls-remote` with `git credential fill` on the very argument list the channel built, while the one-command store exists, then syncs through loopback HTTPS remotes and lists the requests each saw, and prints what the page says. Run once on this branch and once with main's `git-sync.ts`, `sync-rules.ts`, `sync-view.ts`, `MnemonSyncSection.tsx`, `MnemonSyncDialogs.tsx` and `locales.ts`, the six modules its header names:

| Case | main | This change |
|---|---|---|
| `credential.https://github.com.username = alice` (the issue) | `could not read Password for 'https://alice@github.com'` | `username=x-access-token password=<token>` |
| `credential.https://github.com/octocat.username = alice` | `could not read Password for 'https://alice@github.com'` | `username=x-access-token password=<token>` |
| `credential.username = alice` | `could not read Password for 'https://alice@github.com'` | `username=x-access-token password=<token>` |
| `credential.https://dev.azure.com.useHttpPath = true` | `could not read Username for 'https://dev.azure.com/contoso/project/_git/memory'` | `username=x-access-token password=<token>` |
| gitee.com, no configuration | `username=x-access-token` (which Gitee refuses) | `username=oauth2 password=<token>` |
| Another host, no configuration | `username=x-access-token password=<token>` | the same |
| The address writes `GitHub.com:443` | `could not read Username for 'https://GitHub.com:443'` | `host=GitHub.com:443 username=x-access-token password=<token>` |
| HTTPS remote taking the token under any name; `alice` configured for it | status: auth, `could not read Password for 'https://alice@127.0.0.1:…'`; no request | push published; `x-access-token:<token>` (200) |
| HTTPS remote answering for gitee.com: refuses `x-access-token`, takes `oauth2` | status: auth; `x-access-token:<token>` (403) | push published; `oauth2:<token>` (200) |
| The same remote under another name | status: auth; `x-access-token:<token>` (403) | the same, and the page points at the user name in the address |
| … with `oauth2@` in the address | refused: `sync repository must not embed credentials` | push published; `oauth2:<token>` (200) only |
| HTTPS remote wanting `x-token-auth`, named in the address | refused: `sync repository must not embed credentials` | push published; `x-token-auth:<token>` (200) only |
| The page, a refused credential (each source, both hosts) | Needs credentials … | the texts in the table above |

The remote that answers for gitee.com is the loopback remote: Git resolves `gitee.com` to 127.0.0.1 through `http.curloptResolve`, the remote's certificate names it, and Git uses no proxy. A Git older than 2.37 has no `http.curloptResolve` and would look the real host up, so the probe and the test skip that remote there.

### In the WebUI

The real WebUI (`scripts/serve-e2e.mjs`) on DSH 0.2.1-rc.2, with four loopback remotes from [`scripts/fixtures/git-https-remote.mjs`](../../../scripts/fixtures/git-https-remote.mjs): one takes the token under any name, and the WebUI's Git configuration names `alice` for it; one answers for gitee.com, refusing `x-access-token` and taking `oauth2`; one does the same under its own address, as a self-hosted Gitee might; and one takes only `x-token-auth`. The WebUI's Git gets `GIT_SSL_CAINFO` for their certificates and no proxy. The same steps ran on main's build and on this branch's, in Chinese and in English; a second run gave the WebUI a wrong `MNEMON_SYNC_GIT_TOKEN`.

Headless Chrome at 1280×900, light. Under **Plugins → dsh-mnemon**, switch **Git sync** on, choose **Repository address**, enter the first remote's address and a token and click **Connect**. Then, each time through **Change** and **Save**: the gitee.com address with the token; the self-hosted one with the token; the same with `oauth2@`; the first remote with a wrong token; the `x-token-auth` remote with `x-token-auth@`, which is then synced; and the same with `x-token-auth:secret@`, which the form refuses, and **Cancel**. The baseline is the same steps on a build with main's six modules.

A user name configured for the host, and a valid token:

| main | This change |
|---|---|
| ![main: Needs credentials](./en-configured-name-before.jpg) | ![this change: connected with an access token](./en-configured-name-after.jpg) |
| ![main, Chinese](./zh-configured-name-before.jpg) | ![this change, Chinese](./zh-configured-name-after.jpg) |

gitee.com with a valid token (the loopback remote answering for it):

| main | This change |
|---|---|
| ![main: Needs credentials](./en-gitee-before.jpg) | ![this change: connected](./en-gitee-after.jpg) |
| ![main, Chinese](./zh-gitee-before.jpg) | ![this change, Chinese](./zh-gitee-after.jpg) |

A wrong saved token:

| main | This change |
|---|---|
| ![main: Needs credentials](./en-refused-token-before.jpg) | ![this change: the host rejected the saved token](./en-refused-token-after.jpg) |
| ![main, Chinese](./zh-refused-token-before.jpg) | ![this change, Chinese](./zh-refused-token-after.jpg) |

The self-hosted remote that refuses `x-access-token`, with a valid token and no name in the address, gets the same line on this branch, which points at the address; with `oauth2@` in the address it connects. main says "Needs credentials; add an access token" for the first and refuses the second address in the form.

| English | 中文 |
|---|---|
| ![the self-hosted host rejected the saved token](./en-self-hosted-after.jpg) | ![自建主机拒绝了保存的令牌](./zh-self-hosted-after.jpg) |

A wrong `MNEMON_SYNC_GIT_TOKEN`:

| main | This change |
|---|---|
| ![main: Needs credentials](./en-environment-before.jpg) | ![this change: the host rejected the token in MNEMON_SYNC_GIT_TOKEN](./en-environment-after.jpg) |
| ![main, Chinese](./zh-environment-before.jpg) | ![this change, Chinese](./zh-environment-after.jpg) |

The `x-token-auth` remote, written into the address:

| main | This change |
|---|---|
| ![main: the address is refused as a token](./en-user-in-address-before.jpg) | ![this change: the address is taken](./en-user-in-address-after.jpg) |
| ![main, Chinese](./zh-user-in-address-before.jpg) | ![this change, Chinese](./zh-user-in-address-after.jpg) |

On this branch that address connected and **Sync now** published to it. A password in the address is still refused:

| English | 中文 |
|---|---|
| ![a password in the address is refused](./en-password-in-address-after.jpg) | ![地址中的密码被拒绝](./zh-password-in-address-after.jpg) |

What the remotes saw on this branch: the first `x-access-token:<token>` (200, then 401 for the wrong token, and 401 for the wrong variable); the gitee.com one `oauth2:<token>` (200); the self-hosted one `x-access-token:<token>` (403) and, once named, `oauth2:<token>` (200); the `x-token-auth` one `x-token-auth:<token>` (200) only, with no empty-password request. On main: nothing authenticated reached the first, and the gitee.com and self-hosted ones saw `x-access-token:<token>` (403). The branch's steps on DSH 0.2.0-rc.2 and on a separate install of 0.2.1-rc.2 gave the same lines and requests. Every state line stayed one row, and no run had a browser console error.

### The tests on main's modules

The new and changed tests, run with main's six modules checked out: 17 of 69 fail, each on what this change fixes (the lookups, the sign-in's grant, the named and encoded addresses, host case and port, the Git 2.26 and 2.25 forms, the user name per host, the HTTPS syncs, the address rules on both sides, the form's copy and the refusal messages). The rest pass, among them `reports a credential the host refuses as an authentication failure with a credential offered`, which pins the Host's classification the page relies on.

## Compatibility

- **Working setups.** Every host but gitee.com is offered `x-access-token`, as before, so no host that worked sees another name. On Git 2.26 and later the command gains two `-c` keys and sends the same requests; a named address no longer sends the empty-password request first. On an older Git the command is the one main ran, unless this machine's configuration names another user for the address than the store's or turns `credential.useHttpPath` on, the cases that failed.
- **Stored data and settings.** No key changes: `state/sync-git.json` keeps `repoUrl` and `token`, and a configuration saved before reads the same. What changes is which addresses are accepted: one that names a user is now valid. An earlier dsh-mnemon reading such an address refuses the whole file (`sync repository must not embed credentials`), so its page can neither change nor disconnect the repository; remove the name before going back to an earlier version, or before sharing the data directory with one. The guide says so.
- **What users see.** An address with mixed case or an explicit port now finds its stored credential. The page says "rejected" only when a credential was offered and refused, and names which.
- **Mirror and process arguments.** The token reaches only the one-command store. The user name reaches the arguments only as described above, and Git writes it nowhere: the test scans both storage roots after a real HTTPS sync and finds the token in `sync-git.json` alone and the name nowhere, `FETCH_HEAD` and the mirror's config included.
- **`url.<base>.insteadOf`.** On Git 2.26 and later the address Git is given carries no user name, so rewrite rules apply as they do to the plain address. On an older Git that gets the name in the address, a rule written for `https://<host>/` no longer matches.
- **Version skew.** Starter only: the Host and the page ship in the same package, and no plugin changes. `credentialTarget` is a new export of `src/host/git-sync.ts`, which no public entry exposes; the client's message helpers take an optional credential source, and `MnemonKey` gains five keys.
- **Public SDK, RPC and tools.** No export of any public entry, RPC name, stored key, tool or tool description changes.

## Verification

| Check | Result |
|---|---|
| `pnpm exec vitest run tests/git-sync-credentials.spec.mjs` | 13 passed: 8 offline (Git in a home of its own; `git credential fill` over 21 host and configuration pairs and four more places Git reads configuration from; the sign-in's grant; named and encoded addresses; host case and port; the Git 2.26 and 2.25 forms with no configured name, another, the store's own or an empty one, and with a path setting; the user name per host), 5 over HTTPS (git http-backend; a sync past a configured name; gitee.com through the loopback remote, from Git 2.37; refused tokens; a named address without the empty-password request) |
| Client, rules, configuration and presentation tests (`tests/client-sync.spec.tsx`, `tests/sync-rules.spec.ts`, `tests/sync-config.spec.ts`, `tests/client-presentation.spec.ts`) | 61 passed |
| The same new and changed tests on main's modules | 17 of 69 failed, as listed above |
| `pnpm exec vitest run tests/git-sync.spec.ts tests/sync-rpc.spec.ts tests/auto-backup.spec.ts tests/github-auth.spec.ts` | 107 passed |
| `pnpm run typecheck` | passed |
| `pnpm run e2e:sync` on DSH 0.2.1-rc.2 | 64 of 64 |
| `MNEMON_E2E_DSH=…/dsh-0.2.0-rc.2/… node scripts/verify-sync-git.mjs` | 64 of 64 |
| WebUI: main and this branch, Chinese and English, on DSH 0.2.1-rc.2, with and without the variable; this branch also on DSH 0.2.0-rc.2 and on a separately installed 0.2.1-rc.2 | as above |
| `pnpm run verify` | Passed: 5,061 local links and 371 anchors; root tests 2,138 passed and 7 skipped in 154 files; the 17 plugin suites 597 passed and 3 skipped; Headless activation; package contents, 66 files |
| `MNEMON_CLI_PATH=/nonexistent/mnemon MNEMON_PLUGIN_VERIFY_CONCURRENCY=1 pnpm run verify:plugins` | Passed: 17 independent plugin repositories and 18 packed artifacts |
| `DSH_HOST_ROOT=<prefix>/lib/node_modules/@deepseek-ai/dsh pnpm run test:installed-dsh`, DSH 0.2.0-rc.2 | 2,135 passed and 10 skipped in 154 files; the specs of DSH 0.2.1 behavior skip |

```sh
pnpm install --frozen-lockfile
pnpm build && pnpm --workspace-concurrency=4 -r build
# Git reads a configuration the check controls, never the machine's.
export GIT_CONFIG_GLOBAL=<empty file> GIT_CONFIG_NOSYSTEM=1
pnpm exec vitest run tests/git-sync-credentials.spec.mjs tests/client-sync.spec.tsx tests/sync-rules.spec.ts tests/sync-config.spec.ts tests/client-presentation.spec.ts
pnpm exec vitest run tests/git-sync.spec.ts tests/sync-rpc.spec.ts tests/auto-backup.spec.ts tests/github-auth.spec.ts
node scripts/verify-sync-git.mjs
MNEMON_E2E_DSH=<prefix>/lib/node_modules/@deepseek-ai/dsh/lib/bin.js node scripts/verify-sync-git.mjs   # DSH 0.2.0-rc.2
pnpm run verify
MNEMON_CLI_PATH=/nonexistent/mnemon MNEMON_PLUGIN_VERIFY_CONCURRENCY=1 pnpm run verify:plugins
DSH_HOST_ROOT=<prefix>/lib/node_modules/@deepseek-ai/dsh pnpm run test:installed-dsh   # DSH 0.2.0-rc.2
# The probe, on this branch and with main's six modules checked out:
cp docs/pr-assets/issue-408-git-credential-username/harness/credential-lookup.probe.ts tests/credential-lookup.spec.ts
pnpm exec vitest run tests/credential-lookup.spec.ts
for file in src/host/git-sync.ts src/host/sync-rules.ts src/client/sync-view.ts src/client/MnemonSyncSection.tsx src/client/MnemonSyncDialogs.tsx src/client/locales.ts; do git show origin/main:$file > $file; done
pnpm exec vitest run tests/credential-lookup.spec.ts
git checkout -- src && rm tests/credential-lookup.spec.ts
# A remote to try by hand; give the WebUI's Git the certificate it prints, and no proxy:
node scripts/fixtures/git-https-remote.mjs --account oauth2:<made-up token> --refuse x-access-token
```

## Limits

- No Git older than 2.26 was available here. Its form is checked by the arguments the channel builds for a reported `git version 2.25.1` and `2.20.0`, with no configured name, another, the store's own or an empty one, and with a path setting, and by Git's own history for which name wins; `git config --get-urlmatch credential` was checked on Git 2.50 to report a configured `credential.username`, `credential.<url>.username`, an owner pattern and `credential.useHttpPath`, and nothing for another host's settings.
- `--get-urlmatch` matches the configuration as Git matches `http.<url>.*` settings: the address is normalized, so a path prefix, a wildcard, a host in other case or the default port written out match, and the most specific pattern wins whatever the order (checked on Git 2.50). A Git before 2.26 took the first name configured for the address and compared host and path as text. So on such a Git, a name it reports that the Git would not have applied still puts the store's name into the address, which works, with the empty-password request first; and a name the Git took first while `--get-urlmatch` reports the store's own, from a later and more specific pattern, fails as it does on main.
- No real host was contacted. The loopback remotes answer as their policy says; the per-host table rests on each host's documentation, Gitea's source and the comment's Gitee measurements. A host that answered an empty password with 403 would refuse an address that names its user on a Git older than 2.26.
- `credential.username` on the command line and `--get-urlmatch` cover the configurations Git reads; a credential helper the machine configures is still cleared for these commands, as before.
- GitHub still answers "not found" for a private repository a credential cannot reach, and the not-found text still mentions a sign-in or a token; only the authentication case changed, as the issue asked.
- Git's stderr stays out of the page; the Host's error text, with the token masked, still carries it for anything the page cannot name.
