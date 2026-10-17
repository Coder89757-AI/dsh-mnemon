# Five more gaps on the plan

[简体中文](./README.zh-CN.md)

The last pull requests of the October 2026 review batch found five more gaps that were noted but not yet planned. This change adds them to the [plan](../../plans/review-gaps-2026-10.md) as items 19 to 23, each with what happens today, the change and its tests, and to the [roadmap](../../en/roadmap.md#next-gaps-from-the-october-2026-review) in both languages. Documentation only; nothing shipped changes, so there is no changeset. Written on 2026-10-18.

| Item | Found while | Checked in |
|---|---|---|
| 19. The Git sync form and the Host disagree on some local paths, and only the Host refuses a NUL byte | Giving the sync checks one owner (#426) | `portableAbsolutePath` in `src/host/sync-rules.ts`, `isAbsolute` and the NUL checks in `src/host/sync-config.ts` |
| 20. 28 Host endpoints the shipped client no longer calls | Listing the Host's endpoints (#426) | `SERVED_FOR_OTHER_CALLERS` in `tests/rpc-endpoints.spec.ts` |
| 21. Client bundles carry the build machine's path (build maintenance) | Comparing bundles (#426) | The CSS-module region comments in the built `lib/client.js` |
| 22. ByteRover's published declarations lose their types (build maintenance) | Splitting the client modules (#425) | The build order of `pnpm -r build` with the workspace cycle ignored; the published 0.5.5 declarations |
| 23. A recall can keep a different set of tied memories each time | Capturing the v0.5.32 gallery (#424) | The score-only sort in Memory Spaces' `src/service.ts` |

## Checks

- `node scripts/verify-docs.mjs` and `pnpm exec vitest run tests/docs.spec.mjs tests/package-locales.spec.mjs tests/changesets.spec.mjs`.
