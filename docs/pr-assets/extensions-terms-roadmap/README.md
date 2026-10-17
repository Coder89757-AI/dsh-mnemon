# Two terms in the extension guide, and two more roadmap items

[简体中文](./README.zh-CN.md)

Two small documentation follow-ups after #421, which merged on 2026-10-17. Documentation only; nothing shipped changes, so there is no changeset.

- **Extension guide.** The documentation restructure (#415) settled on one hub name, Documentation / 文档中心, and on "runtime memory" for what older pages called hot context. It left [the extension guide](../../en/development/extensions.md) alone because #421 was changing it: its English page still linked the hub as "Documentation Center", and both languages said a small resident cap could hide "hot context" / 热记忆. Both now use the settled terms.
- **Roadmap.** Two behaviors found while Memory Spaces' settings moved into Memory Spaces (#421), both the same on `main` before that change, join the [plan](../../plans/review-gaps-2026-10.md) as items 10 and 11 and the [roadmap](../../en/roadmap.md#next-gaps-from-the-october-2026-review):
  - right after Memory Spaces is switched on, its settings show the Source as not installed for about a second while it starts (seen in #421's recording on DSH 0.2.1-rc.2 and 0.2.0-rc.2);
  - a quiet Provider list reload already under way when the user switches or saves a Provider can answer after the change and show the list from before it until the next read (`load` in Memory Spaces' `src/client/provider-settings.tsx` is not superseded by a switch or a save; found by #421's review).

## Checks

- `node scripts/verify-docs.mjs` and `pnpm exec vitest run tests/docs.spec.mjs tests/package-locales.spec.mjs tests/changesets.spec.mjs`.
- No page uses "Documentation Center", "hot context" or 热记忆 any more, apart from the release notes, the PR records and the dated media records under `docs/assets`.
