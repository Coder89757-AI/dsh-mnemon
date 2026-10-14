# dsh-mnemon on DSH 0.2.1-alpha.3

[简体中文](./README.zh-CN.md) | [Verification record](./verification.json)

DSH 0.2.1-alpha.3 (npm `alpha`, released 2026-10-14) changes how a subagent is composed and how a plugin is replaced. On it, dsh-mnemon 0.5.29 can start no memory subagent, and **Check versions → Update** fails. This record covers what differs, what this change does about it, and what was run on 0.2.1-alpha.3, on 0.2.1-alpha.2 and on DSH 0.2.0-rc.2 (npm `latest` and `next`) to show that dsh-mnemon works on all three.

Tested revision: the branch `claude/dsh-021-alpha3`, on top of v0.5.29 (main `4feee034`). The runs took place on 2026-10-14 and 15 (Asia/Shanghai):
- macOS 15.6 arm64 and Node 24.19.0;
- headless Chrome 155, zh-CN, light;
- DSH 0.2.1-alpha.3, 0.2.1-alpha.2 and 0.2.0-rc.2, each in an isolated npm prefix;
- Mnemon CLI 0.2.10.

## What differs on 0.2.1-alpha.3

| DSH 0.2.1-alpha.3 | Effect on dsh-mnemon 0.5.29 | Now |
|---|---|---|
| A start request no longer carries `persona` or `toolFilter`, and no provider declares either; a child joins its parent's composition or an Agent Preset named for it | Every memory subagent fails before it starts: `dsh-mnemon requires a non-inheriting DSH subagent provider with tool filtering, persona, and depth limiting` | The child's instructions and tool list are registered in its own scope while DSH publishes it |
| With hot reload, the plugin manager refuses to install a package the profile has (`already-installed`); another version replaces it only after it is removed | **Check versions → Update** stops with `DSH could not install dsh-mnemon@0.5.29: already-installed` | DSH's own `dsh plugin add` replaces the package, with DSH's lock and compatibility check, and a restart follows as before |
| A child resumed after it settled gets a persona and tool filter back only when its log records them, and DSH records none now | A finished memory task resumed from the conversation's subagent list runs with the conversation's tools and instructions | Documented in [Compatibility](../../en/reference/compatibility.md#dsh-02) |
| `dsh-session-persistence-jsonl` exports the plugin itself (`name`, `Config`, `apply`) rather than a default class | None for users; the tests that load it failed with `invalid plugin` | The tests load either form |
| The API Gateway dispatches each call for the Peer it speaks for: `fetch(request, peer)` | None for users; the contract test that calls the shared handler without a Peer failed | The test passes an owner Peer where the Connection can create one |
| The plugin manager applies a change through HMR's `reconcileProfile` | None for users; the activation fixture's stand-in HMR had no such method | The stand-in recomposes through app-boot's `recomposeProfile` |
| The Plugins page groups plugins into built-in, experimental and installed | None: the dsh-mnemon page, its configuration and its component list render as on 0.2.1-alpha.2 | — |

Every named value dsh-mnemon imports from DSH packages, such as the 20 from `dsh-client-ui-primitives`, exists in 0.2.1-alpha.3. Its other changes, such as the credentials precedence and the remote-access policies for Peers other than the owner, leave dsh-mnemon as it was: GitHub sign-in uses the record half of the credentials store, and a browser authenticated with the launch token is the owner.

### Memory subagents

dsh-mnemon gives each memory subagent its own instructions, which carry the run's completion protocol, and only the tools its task needs, such as the result tool alone for USER.md compaction. Up to 0.2.1-alpha.2 it passes both in the start request, and DSH's spawn and fork providers register them in the child's own scope. 0.2.1-alpha.3 dropped both from the request and from the providers' capabilities, so dsh-mnemon 0.5.29 finds no provider it can use. That stops Save to memory, Memory Space writes, idle review, USER.md compaction, working-memory archiving, Document archive and Git sync's reconciliation review.

Where a provider declares neither capability, this change starts the child without them and registers them itself while DSH publishes the child. DSH announces the child once it has composed it and before it submits the task. dsh-mnemon's listener runs first and adds the persona section and the tool restriction in the child's scope, the way DSH 0.2.1-alpha.3 still restores both for a child an earlier release recorded with them. The child's scope releases both with it. This applies only to a provider whose children DSH creates in this process: one that prepares local activations, as DSH's spawn and fork do. Any other provider is refused before it starts anything, and a run whose child dsh-mnemon did not see created is disposed and refused, so a memory task never runs with the conversation's tools. On DSH 0.2.1-alpha.2, 0.2.0 and 0.1.7 the request still carries both. Concurrent starts are told apart by their async context, and each child gets its own instructions.

The real-host compaction test now also checks the tools the child's model request offers. On all three installed hosts it is `mnemon_subagent_result` alone. With the restriction left out, on 0.2.1-alpha.3 the same request offers all 17 tools of the test's conversation.

A memory task that has settled is not meant to be continued, but DSH lists it among the conversation's subagents. [`harness/resumed-memory-task-host.probe.ts`](./harness/resumed-memory-task-host.probe.ts) compacts USER.md through a child and then has the conversation message that child:

| DSH | The compaction child | The same child, resumed |
|---|---|---|
| 0.2.1-alpha.3, this change | `mnemon_subagent_result` and Mnemon's instructions | the conversation's tools (17 in the probe), without Mnemon's instructions |
| 0.2.1-alpha.2 | `mnemon_subagent_result` and Mnemon's instructions | `mnemon_subagent_result` and Mnemon's instructions, restored from its log |
| 0.2.0-rc.2 | `mnemon_subagent_result` and Mnemon's instructions | cannot be resumed |

### Check versions → Update

With hot reload, DSH 0.2.1-alpha.3 refuses to install a package the profile already has, before pnpm runs. Its own Plugins page updates an official plugin by removing it and then installing the new version. dsh-mnemon cannot do that to itself: removing it stops the code that runs the update, and a failed install would leave the profile without it. When DSH refuses with `already-installed`, this change runs `runPluginCommand` from `@deepseek-ai/dsh-plugin-manager/operations` for `add <package>@<version> --save-exact`. That is the code behind `dsh plugin add`, and DSH's runtime resolution supplies it from the installation DSH runs from. It holds the profile's write lock and uses the package manager the launcher supplied. It reads the release's manifest before pnpm runs and refuses one whose DSH peers exclude the running DSH, so nothing is installed. Another failure restores the profile's manifest and lockfile and leaves a log under `.plugin-manager/logs`. A successful update asks for a restart, as every update did. Where the installation exports no such command, the error names `dsh plugin --profile <profile> add …` to run with DSH stopped. On 0.2.0 and 0.2.1-alpha.2 DSH's installer runs as before.

Checked in fresh 0.2.1-alpha.3 web profiles, with the WebUI's **Check versions** offering 0.5.29, the npm `latest`:

| dsh-mnemon 0.5.28 from npm | This change, installed as 0.5.28 | This change, with a 0.5.29 that asks for DSH ^0.3.0 |
|---|---|---|
| ![Check versions reports DSH could not install dsh-mnemon@0.5.29: already-installed](./update-before.jpg) | ![dsh-mnemon updated, current version 0.5.29, waiting for a restart](./update-after.jpg) | ![DSH could not install dsh-mnemon@0.5.29: incompatible-version, naming the DSH it requires](./update-incompatible.jpg) |

After the update the profile records `dsh-mnemon` `0.5.29`, the profile's operation log shows pnpm adding it, and after a restart the Memory System runs 0.5.29. For the incompatible release DSH logged `installation rejected` and installed nothing, so the profile kept 0.5.28. The same build, installed the same way on 0.2.0-rc.2, updated through DSH's installer. A local registry served this branch's package as version 0.5.28 and, for the third run, the published 0.5.29 with its DSH peers raised to `^0.3.0`. It passed every other request to registry.npmjs.org and published nothing.

### Independent review

A review of the first version found that the update ran pnpm from PATH, without DSH's lock and compatibility check, that composition at publication accepted a provider whose children run elsewhere, and that its listener ran after other plugins' listeners. This version addresses all three and adds tests for concurrent starts, a provider that runs children elsewhere and an incompatible release. The review also proposed refusing a resumed memory task. It is documented instead: DSH keeps no record that marks a child as Mnemon's, and the resumed child gets no more than its conversation already has.

## Running the tests against an installed DSH

The configuration of the [DSH 0.2.1-alpha.2 harness](../dsh-021-alpha2/README.md#running-the-tests-against-an-installed-dsh) runs unchanged on 0.2.1-alpha.3. That record's task-directory probe loads the JSONL persistence the way 0.2.1-alpha.2 exported it, so it does not run on 0.2.1-alpha.3. The probe here runs with the same configuration:

```sh
DSH_HOST_ROOT=<prefix>/lib/node_modules/@deepseek-ai/dsh DSH_VERSION=<version> MNEMON_TEST_DIR=docs/pr-assets/dsh-021-alpha3/harness \
  pnpm exec vitest run --config docs/pr-assets/dsh-021-alpha2/harness/installed-dsh-all.vitest.config.mjs
```

## Results

### Tests against the installed hosts

| Check | DSH 0.2.1-alpha.3 | DSH 0.2.1-alpha.2 | DSH 0.2.0-rc.2 |
|---|---|---|---|
| Root tests other than the six real-host specs, on v0.5.29 | 48 failed: 44 in `legacy-session-repair`, 3 activation contracts, 1 Connection contract | passed | passed |
| The six real-host specs from their adapted copies, on v0.5.29 | 12 of 17 failed | 17 passed | 17 passed |
| Root tests other than the six real-host specs, this change | 1,948 passed, 6 skipped (130 files) | 1,948 passed, 6 skipped | 1,948 passed, 6 skipped |
| The six real-host specs, this change | 17 passed | 17 passed | 17 passed |
| Starter activation contracts: cold start, another bundle stopped since startup, component and bundle switches | passed | passed | passed |
| `--check-declared-rows` | passed | passed | fails on the grouping row, the known listing issue |
| Headless, with the default composition and with the three optional Strategies | passed | passed | passed |
| `scripts/verify-sync-git.mjs` | 64 checks passed (v0.5.29: fails at the reconciliation review) | 64 passed | 64 passed |

`pnpm verify` and `verify:plugins` pass on the pinned DSH 0.1.7-rc.2.

### WebUI on 0.2.1-alpha.3

Each check ran in the real WebUI of the e2e fixture with `MNEMON_E2E_DSH` set to 0.2.1-alpha.3, driven through headless Chrome; only the model's choices are scripted.

| Area | Result |
|---|---|
| Plugins page | dsh-mnemon is listed under the installed plugins. Its page shows the configuration and 9 components (5 running, 4 off) with no grouping row and no note. Switching Light context on and off applies at once with no restart notice (6 then 5 running), and Status stays nominal. |
| Save to memory (`--save-action`) | The task Agent creates a Native space and writes the reply: "Saved in Release notes". |
| Idle review (`--idle-review`) | After two turns, the fork reviewer creates a Document and adds a profile entry before the fixture's deliberate failure; Status shows both receipts. |
| USER.md compaction (`--profile-compaction`) | The third fact finds USER.md full; the compaction child merges the first two, and the third is added. |
| Conversation memory (`--docs-demo`) | A Documents search and two Memory Spaces recalls answer from 4 memories and 2 Documents; a working-memory replace succeeds. |
| Remote pages (`--trusted-host`) | Without the grant the Memory System and the plugin settings are read only and say so; with `remoteAccess: trusted-host` a change persists across a reload. |
| Check versions → Update | See above. |

| Save to memory | Idle review on Status |
|---|---|
| ![Save to memory reports Saved in Release notes](./save-to-memory.jpg) | ![Status lists the Document and the profile entry the review committed before the fixture's failure](./idle-review.jpg) |

Save to memory, idle review, USER.md compaction and the Plugins page ran on 0.2.0-rc.2 with this change as well and passed; there the page lists the grouping row and the note explains it. No run logged a browser console error.

## Limits

- DSH 0.2.1-alpha.3 is an alpha; its APIs may change again.
- The model was a loopback stub that scripts only the model's choices; tools, subagents, storage and the WebUI were real.
- Only macOS was run. The DSH desktop app has no 0.2.1-alpha.3 build, so desktop windows were not checked, nor an update through the pnpm a desktop app bundles, which DSH's plugin command would use.
- `dsh plugin add` runs without a registry flag, so the update on 0.2.1-alpha.3 uses pnpm's own registry settings, not the registry DSH's Plugins page chose.
