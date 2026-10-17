# Task Agents that can follow their conversation — PR #354

[简体中文](./README.zh-CN.md) | [Verification record](./verification.json)

PR #354 lets the task Agents behind Save to memory, Ask Agent, tidying and archiving run on the model of the conversation that asks for the work, and puts the task Agent model on the Memory System's status page. As first submitted, it changed what `taskAgentModel: inherit` means for every profile. It also fell back to another open conversation's model when the asking one was not open, and the status card kept the setting it read when it first appeared. The maintainer adjustment keeps the author's commits and the feature, behind a switch that is off by default.

Revisions: baseline main `c00e6d7a`; the author's `6e6a4921` and `3977b974`; main merged in `1fb83599`; the adjustment `4a40ace5`. The runs took place on 2026-10-17 (Asia/Shanghai):
- macOS 15.6 arm64, Node 24.19.0, Mnemon CLI 0.2.10;
- headless Chrome at 1280×800, zh-CN, light;
- DSH 0.2.0-rc.2 (npm `latest` and `next`) and 0.2.1-alpha.2, through `scripts/serve-e2e.mjs`.

## What DSH does with a model choice

DSH handles a model pick in two ways (both hosts):
- A model picked in a conversation applies to that conversation's next request, and DSH also saves it as the new-session default (`agentDefaultModel.saveSelection` in its session controller). Task Agents use that default, so they run on the model picked last, in any conversation.
- A delegated child takes its parent's route: the provider, model and reasoning effort of the parent's last request, or its creation route before the first. Idle review and the other delegations a conversation starts therefore always follow that conversation.

So a task Agent usually runs on its conversation's model already. The two part once another conversation picks a different model afterwards, for example a fast model for one conversation and a stronger one for another. Save to memory in the first conversation then runs on the second one's model, while review in the first still uses the first one's.

## The change

- **Prefer the conversation's model**, under **Task Agent model → Follow the main route**, is a switch (`taskAgentModel.followConversation`), off by default. It gives task Agents the route DSH gives the conversation's own delegated work, while that conversation is open, so they match review. A conversation that is not open, or a caller without one, keeps the DSH default. With the switch off, nothing changes.
- It is a key rather than a third mode. v0.5.30's schema keeps a key it does not know and its resolver still reads `inherit`, so a downgrade keeps working; an unknown mode would fail to load.
- Only the asking conversation counts. The first version fell back to whichever conversation happened to be open.
- **Background tasks** on the status page states the model task Agents run on and where it comes from. Its gear opens the same choice as the Layered strategy's page, so a profile on another strategy can change it too. Both pages read the stored setting, so a change on one shows on the other at once. The page reads only the route until the gear opens.
- The author's dialog fix stays: a dialog leaves Escape and Tab to a menu opened above it.

An independent review of the adjustment found six more issues, each now with a test:
- The status page's first wording also claimed review.
- Giving up a fixed model that was never written turned the switch off.
- **Read again** on a fixed route read only the route.
- Status read the whole model directory on every visit.
- The stated route could differ from the Host's without a DSH default, or before the page had the settings.
- The switch left out the reasoning effort.

The first version's own screenshots show the editor it put on Status, which the stated route and its gear replace: [the card](./status-background-tasks-zh.png), [a fixed route](./status-background-tasks-fixed-model-zh.png) and [its Provider list](./status-background-tasks-provider-zh.png).

## The run

The same steps ran on both hosts, with a loopback model stub ([harness/stub.mjs](./harness/stub.mjs)) that records the model each request names. It is the fixture's own stub with the Save to memory script, reached through `--live-model` with a test key.

1. Conversation A picks DeepSeek-V4-Pro and gets a reply.
2. A new conversation B picks DeepSeek-V4.1-Flash and gets a reply.
3. Back in A, **Save to memory → Send to task Agent** on its reply.
4. On this branch: Status, its gear, the switch on, another reply in A and a second Save to memory. Then the Layered strategy's page.

| | A's replies | B's reply | The task of A's Save to memory |
|---|---|---|---|
| main, DSH 0.2.0-rc.2 | `deepseek-v4-pro` | `deepseek-flash` | `deepseek-flash` |
| This branch, switch off, both hosts | `deepseek-v4-pro` | `deepseek-flash` | `deepseek-flash` |
| This branch, switch on, both hosts | `deepseek-v4-pro` | | `deepseek-v4-pro` |

With the switch off, the branch does what main does: A's task runs on B's model, DSH's default. With the switch on, it runs on A's own. The switch was stored as `taskAgentModel: { mode: inherit, followConversation: true }`. No step logged a browser console error.

On main the status page has no background task section, and the Layered strategy's page has no switch:

| Status on main | The Layered strategy's page on main |
|---|---|
| ![Status on main: the engine, the components and the Providers](./before-status.jpg) | ![Background tasks on main: the task Agent model and the route it takes](./before-layered.jpg) |

On this branch, Status states the route and where it comes from, and the gear opens the choice:

![Background tasks on Status: deepseek-official / deepseek-flash, the DSH default](./after-status-default.jpg)

| The choice, switch off | Switch on: A's own model |
|---|---|
| ![The dialog with the switch off: deepseek-official / deepseek-flash, the DSH default](./after-dialog-off.jpg) | ![The dialog with the switch on: deepseek-official / deepseek-v4-pro, the conversation's model](./after-dialog-on.jpg) |

| Status after the switch | The Layered strategy's page reads the same setting |
|---|---|
| ![Status: deepseek-official / deepseek-v4-pro, the conversation's model](./after-status-on.jpg) | ![The Layered strategy's background tasks with the switch on](./after-layered.jpg) |

## Tests

- **Host:**
  - An inherited route keeps the DSH default unless it follows its conversation.
  - With the switch on, Runtime maintenance and a page task asked from the conversation take its route, reasoning effort included. A conversation that has not run yet takes its creation route, as DSH's delegations do.
  - A conversation that is not open, a caller without one, and half a request header keep the default.
  - The model directory reports the conversation's route and the inherited route either way.
- **Config:** the switch is off unless set, has no effect on a fixed route, and must be a boolean.
- **Status page:**
  - The stated route and its source, the gear and the dialog, the switch on and off, and a fixed model picked in the dialog.
  - A change made on another page shows at once.
  - Giving up a fixed model keeps the switch.
  - Only the route is read until the gear opens, and **Read again** reads the whole directory for a fixed route.
  - The route is right without a DSH default and before the settings are read.
  - A failed directory read is stated, and there is no gear without the settings grant.
- **Layered strategy's page:** it asks with its conversation and follows it only with the switch on.
- **On the first version (`1fb83599`), 14 of these fail:** 12 new or rewritten cases, and 2 older catalog cases that now expect the inherited route. For example, a task asked from a conversation that is not open took the open conversation's `ai / space-bunny`, and a fixed route stored on another page never showed on Status. The review's eight cases also fail on the adjustment as it stood before the review (`1ac2e75d`).

## Validation

`pnpm run verify` (Node 24.19.0, pnpm 11.25.0) passed with the adjustment:
- docs, typecheck and the deterministic build;
- every plugin's build, typecheck and tests;
- root tests: 2,025 passed, 6 skipped;
- Headless activation and the legacy settings import;
- package contents: 59 files, 1,990,405 unpacked bytes, under the 2,500,000-byte ceiling;
- publint and attw.

[verification.json](./verification.json) has the requests, the stated routes and the steps of each run.
