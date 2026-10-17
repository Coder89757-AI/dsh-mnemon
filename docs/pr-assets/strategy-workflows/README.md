# Strategies declare the background work they drive

[中文](README.zh-CN.md)

Verified on 2026-10-17 (Asia/Shanghai) on `main` `3b33e07e` plus this change, with DSH 0.2.1-rc.1 pinned and DSH 0.2.0-rc.2 installed from npm.

## What was wrong

The Host decided which background work to run by comparing the Strategy's type id with the Layered strategy's, `default-three-tier`, in three places:

- `lifecycle.ts` ran idle review only while the configured Strategy was `default-three-tier`, and only after turns a Strategy of that type id composed;
- `subagent.ts` took over Runtime writes for capacity maintenance (archive older entries first) through `threeTierActionWorkflow`, a helper it imported from the Layered plugin's `extension-sdk`, which compares the same type id.

So the Host had a build-time dependency on one Strategy package, and no other Strategy, General or third-party, could ever opt into either workflow. `docs/plans/plugin-first-ui.md` says the Layered strategy contributes the background tasks it drives; this was the last place where the Host decided that for it.

## What changes

- **Contract.** `MemoryStrategyManifest` gains an optional `workflows` field, with the known ids in `MEMORY_STRATEGY_WORKFLOWS`: `idle-review` and `runtime-capacity` (`src/core/contracts/view.ts`). `defineMemoryStrategy` checks the ids' shape and rejects duplicates; it keeps ids it does not know, so a newer Strategy still loads.
- **Layered strategy.** Its manifest declares `workflows: ['idle-review', 'runtime-capacity']`. `threeTierActionWorkflow` stays exported, now marked deprecated.
- **Host.** `src/host/strategy-workflows.ts` answers "does this Strategy drive this workflow" from the declaration. Idle review reads the declaration of the Strategy that composed the turn, through the generation that holds its definition, and of the configured Strategy as the serving composition installed it. Runtime capacity maintenance reads the declaration of the generation's Strategy at all three entry points (named tools, View Actions, browser management). `subagent.ts` no longer imports the Layered plugin.

## Equivalence and version skew

For the shipped Strategies nothing changes: the Layered strategy declares exactly what its type id used to stand for, and the General strategy declares nothing. (Scoped composition, Light context and Active capture are Strategy extensions, not Strategies, and have no manifest of this kind.)

| Starter | Layered strategy | Result |
|---|---|---|
| this change | this change (declares both) | both workflows, from the declaration |
| this change | 0.5.9 or earlier (declares none), kept in a Profile | both workflows: an undeclared Strategy with the Layered type id counts as declaring both |
| 0.5.31 (published) | this change | both workflows: the old Host keys on the type id and keeps the unknown field |
| 0.5.31 | 0.5.9 | unchanged |

The third row was checked against the published package: `harness/old-starter-accepts.mjs` loads `dsh-mnemon@0.5.31` and its Layered strategy from a profile installed from npm and defines a Strategy whose manifest carries `workflows`. Result: `{"starter":"0.5.31","accepted":true,"keptWorkflows":["idle-review","runtime-capacity"],"typeId":"default-three-tier"}`.

The Layered plugin uses no new Starter export (the field is data), so its `dsh-mnemon` peer floor stays `^0.5.17`.

## Tests

- `tests/strategy-workflows.spec.ts` (new): the declaration is kept, malformed or repeated ids are rejected, unknown ids load and are ignored; `strategyDrives` follows the declaration (a Layered strategy that declares only `runtime-capacity` gets no idle review) and the type-id fallback applies only to an undeclared Layered strategy; capacity maintenance takes over only the Runtime `mutate` Action; a View's Strategy is read from its generation.
- `tests/lifecycle.spec.ts`: two new cases, a third-party Strategy that declares `idle-review` is reviewed, and a Layered strategy that does not declare it is not. The fixture's composition can now carry a declared Strategy; the existing 67 cases are unchanged and pass.
- `tests/runtime-capacity-workflow.spec.ts`: a new case archives for an independent Strategy that declares `runtime-capacity`. The existing independent-Strategy case copied the Layered manifest wholesale, so it now states `workflows: []` to keep testing a Strategy that declares nothing.
- The Layered plugin's own test checks its declaration.

## Verification

Commands, from the repository root through Node 24.19 and pnpm 10.13.1:

```bash
pnpm exec vitest run tests/strategy-workflows.spec.ts tests/lifecycle.spec.ts tests/runtime-capacity-workflow.spec.ts
pnpm --filter dsh-mnemon-strategy-default-three-tier run typecheck && pnpm --filter dsh-mnemon-strategy-default-three-tier run test
pnpm run verify
DSH_HOST_ROOT=<DSH 0.2.0-rc.2 installation> pnpm run test:installed-dsh
CHANGESET_BASE_REVISION=<main> CHANGESET_REVISION=<head> pnpm run release:intent
```

Results: VERIFY_RESULTS
