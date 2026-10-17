# Documentation navigation and indexes

[简体中文](./README.zh-CN.md)

A review of the documentation found pages and records no index reached, links that went stale or broke outside GitHub, and indexes that listed only part of their folder. This change fixes those without moving content. Tested on 2026-10-17 on top of [#386](https://github.com/omdsh-dev/dsh-mnemon/pull/386) (`51b1dd8e`).

| Where | Before | After |
|---|---|---|
| [Release history](../../en/releases/README.md) (both languages) | v0.5.3 to v0.5.30, and empty v0.4, v0.3 and v0.2 headings | All 63 notes, v0.2.0 to v0.5.30, each titled by its own heading |
| [This index](../README.md) | 21 records missing, three of them linked from nowhere; 19 rows English only | Every record listed beside the records of its time, every row in both languages; a note that a record's commands name files as they were at its tested revision |
| [`docs/plans`](../../plans/README.md) | Six plans linked from nowhere | An index with each plan's status, linked from the development guide |
| [`docs/README.md`](../../README.md) | Sent existing users to the v0.5.17 release notes | Sends them to Compatibility and upgrades and the release history |
| README, both languages | Contributing and security links pinned to a commit of 2026-09-06 | `blob/main`, like the README's other links |
| SECURITY.md | Relative links to the compatibility page, which break on the npm package page | Absolute links |
| [Configuration](../../en/reference/configuration.md) | The English page lacked the paragraph on which runtime graph a running turn and a delegated task keep | Present in both languages |

## Checks

- `pnpm run verify:docs`: 4,237 local links and 217 anchors resolve, and every page has both languages.
- A script compared each release index entry with its note's heading (no mismatch) and every record folder with the index (none missing).
