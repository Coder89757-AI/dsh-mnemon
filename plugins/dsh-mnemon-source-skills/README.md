# dsh-mnemon-source-skills

The Skills Source of [dsh-mnemon](https://github.com/omdsh-dev/dsh-mnemon): one place for the DSH skills a workspace can load, and the data their self-evolution keeps.

- **Skills.** Every `SKILL.md` in `<project>/.dsh/skills`, `<project>/.agents/skills`, `~/.dsh/skills` and `~/.agents/skills`, read with DSH's own rules. Switch a skill out of the model's reach or the `/` menu (DSH's `disable-model-invocation` and `user-invocable` keys), edit it, restore an earlier version, or move it to the trash. Every write is fenced by the file's hash and leaves a version.
- **Evolution.** With self-evolution on, the dsh-mnemon Host captures each conversation's trajectory as turns end, and reviews it in the background once it has earned it. A suggestion names the steps it rests on; a task Agent drafts the new `SKILL.md`, which is backtested against the current version before you adopt it.
- **Evidence.** The annotated trajectories each review read: user turns, tool calls with their failures, skill loads.
- **Evals.** Cases accumulate from real conversations and can be written or derived by hand. A backtest is a simulation: an executor follows the skill without tools, and a judge grades the checks.

The Source never calls a model and never joins a model View; skills reach the model through DSH's own `skill` tool. The Memory System shows it as the **Skills** (技能管理) tab.

## Configuration

| Field | Default | Meaning |
|---|---|---|
| `dataDir` | the Host's storage root | Where `skills/` (settings, ledger, evals, trajectories, versions, trash) is kept |
| `dshHome` | `$DSH_HOME`, then `~/.dsh` | DSH's home; its `skills` folder is read |
| `agentsHome` | `$DSH_AGENTS_HOME`, then `~/.agents` | The shared agents home; its `skills` folder is read |

Self-evolution is off until it is turned on from the page; its settings live with the data they govern.

## Development

```sh
pnpm install
pnpm verify
```
