# Gaps from the October 2026 review on the roadmap

[简体中文](./README.zh-CN.md)

The review after v0.5.31 produced follow-ups of two kinds. Those that keep behavior unchanged went into their own pull requests. The nine below change what users, plugin authors or the model see; the maintainer asked for them to be planned rather than made in that batch. This change lists them on the [roadmap](../../en/roadmap.md#next-gaps-from-the-october-2026-review) and records each one in a [plan](../../plans/review-gaps-2026-10.md): what happens today, the proposed change, and its tests. Written on 2026-10-17 against `main` at `f41a121f`.

| Item | Found while | Checked at `f41a121f` in |
|---|---|---|
| Backups and Git sync drop a Native space's placement decision | The review of [#416](https://github.com/omdsh-dev/dsh-mnemon/pull/416) (Sources own their storage formats) | `parseMemorySpaceRegistry` in Memory Spaces' `src/contracts.ts` and its Native loader in `src/memory-spaces.ts`; `readCurrentRegistry`, `mergeRegistry` and `writeRegistry` in `src/host/pack.ts` |
| One atomic write and one lock rule | The technical-debt review | The eleven `writeFileSync` + `renameSync` pairs in `src/host`, the Sources and the Holographic driver, and the four lock implementations |
| One rule for a saved secret | Moving the Provider settings into Memory Spaces | `SAVED_SECRET_MASK` and its `onChange` in `src/client/ProviderSettingsSection.tsx`; `includeSecrets` in Memory Spaces' `src/memory-spaces.ts` |
| One timeout range | Consolidating the Host's and the Sources' constants | `timeoutMs` in `src/host/config.ts` and in Memory Spaces' `src/config.ts` |
| The turn memory bar opens the Source that served a tool | The memory tool table | `memoryPageForTool` and `itemTarget` in `src/client/MnemonTurnTail.tsx` |
| The named memory tools pass only what the Source accepts | The memory tool table | The open schemas and `mnemon_document_create`'s pass-through in `src/host/tools.ts`, the closed-schema check in `src/core/composition.ts`, the Recall Route's `limit` and the remember Action's `importance` in Memory Spaces' `src/source.ts` |
| Providers bring their own translated text | Moving the Provider settings into Memory Spaces | `readSources.model.<id>` in `src/client/locales.ts` and Memory Spaces' `src/client/pages.tsx` |
| Memory Spaces reaches Mnemon Native through its adapter | The technical-debt review | `embed --status`, `embed --all`, `--version` and `import` in Memory Spaces' `src/service.ts` |
| SDK helpers for repeated plugin code | The technical-debt review | The nine Provider `src/index.ts` files and the Sources' page helpers |

## Checks

- `pnpm run verify:docs`: every link and anchor resolves, including the roadmap anchor the plan and the plans index use.
- `pnpm exec vitest run tests/docs.spec.mjs`.

Documentation only; nothing shipped changes, so there is no changeset.
