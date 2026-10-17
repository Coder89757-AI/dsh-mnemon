# Gaps from the October 2026 review

[Design plans](./README.md) · [Roadmap](../en/roadmap.md)

Status: planned, nothing here has shipped. Written on 2026-10-17 against `main` at `f41a121f` (v0.5.31 with #414, #415 and #416); file references are to that revision.

After v0.5.31, a review of the code, the documentation and the Host's compatibility branches produced a list of follow-ups. The ones that keep behavior unchanged (consolidation, refactors, documentation and tests) went into pull requests of their own. The items below change what users, plugin authors or the model see, so each one needs its own decision and pull request. The [roadmap](../en/roadmap.md#next-gaps-from-the-october-2026-review) lists them in the same order.

## 1. Backups and Git sync drop a Native space's placement decision

**Today.** `parseMemorySpaceRegistry` in Memory Spaces' `./contracts` keeps six fields of each registry entry: `id`, `name`, `description`, `active`, `createdAt` and `updatedAt`. The Pack reads the local registry and the archive's registry through it. An import that includes Memory Spaces, whether it replaces or merges, writes the result back as the local registry (`readCurrentRegistry`, `mergeRegistry` and `writeRegistry` in `src/host/pack.ts`), and Git sync applies a pulled version through the same import. Such an import therefore rewrites each Native space's entry without `placement`, the automatic placement decision that the Spaces page shows under the space. The name and description stay, because the Pack carries them. Memory Spaces does not read `metadataSource` back for a Native space even today, so `placement` is the only field lost.

**Change.** Carry `placement` in the Pack, and on a merge keep a local entry's `placement` when the incoming entry lacks it; decide which side wins on a replace. A Pack written by an earlier version, with six fields per entry, must still import.

**Tests.** Replace, merge and sync of a space with a placement decision, from a Pack of this version and from one of an earlier version, and from a machine with Providers this one lacks: a placement survives loading only when its Provider and every candidate Provider are installed.

## 2. One atomic write and one lock rule for every store

**Today.** Eleven writes go through a temporary file and a rename, each written by hand: in the Host, Git sync (two), the machine identity, the sync settings, the review ledger and the Pack; in the Sources, Runtime (two), Documents and the Memory Spaces registry; and the Holographic Provider. They differ in ways that matter after a failure:

- Documents, the Memory Spaces registry and the Holographic Provider leave the temporary file behind when the write fails.
- The sync settings, both Git sync writes and the Memory Spaces registry name the temporary file after the process id alone. The writes are synchronous, so one process cannot collide with itself, but two processes with the same id, such as two containers sharing a storage root, can.
- Locks are taken in four ways: three lock files created exclusively, and Git sync's lock directory. Only the Pack checks that it still owns a lock it took before it releases it; Runtime, Documents and Git sync delete theirs unconditionally.
- A leading `~` is expanded in five places with different rules (`version-updates.ts` misses a bare `~`, and only `native-cli` handles `~\` on Windows), and two more places accept a leading `~` without expanding it. The default data directory `~/.mnemon/sources/<key>` is computed three times, and only Memory Spaces accepts a configured `~/` path. Versions are compared in two places.

**Change.** Host-internal helpers first: one atomic write that names its temporary file uniquely and removes it on failure, one lock that only its owner removes, one path expansion and one data-directory rule. Then the same helpers as Node-only SDK exports that the plugins adopt: the Sources through `dsh-mnemon`'s extension SDK, and the Holographic Provider through `dsh-mnemon-source-memory-spaces/provider-sdk`. Adopting them raises the Sources' peer floor on `dsh-mnemon` and the Provider's on Memory Spaces.

**Tests.** A failed write leaves nothing behind; two writers with one process id; a lock taken over after it was abandoned is not deleted by its first owner; `~`, `~/` and `~\` on each platform.

## 3. One rule for a saved secret in Provider settings

**Today.** On Memory Spaces' Provider configuration page, a saved secret shows as a mask of twelve dots with a show button. Focusing the field selects the mask, so typing replaces it. If the user instead moves the cursor and deletes one dot, the remaining dots stay in the draft, and **Save service configuration** saves them as the new secret. With the secret shown, the field reads "Saved credential", and an edited copy of that text is saved the same way. The page's draft also merges in a `secretValues` field, which it would display if a Host sent one; nothing sends it today, although Memory Spaces still has an unused `includeSecrets` option that would. The Provider dialogs use a safer rule: the field is empty, a hint says the saved secret is kept when the field is left empty, and clearing it is an explicit action. The `.providerFieldControl` class is also styled in two places, differently.

**Change.** Use the dialogs' rule on the configuration page too, drop `secretValues` from the draft and the unused option from Memory Spaces, and keep one style for the field. Update the Memory providers guide ([English](../en/guides/memory-providers.md), [中文](../zh-CN/guides/memory-providers.md)), which says the WebUI shows a configured secret only as a mask.

**Tests.** Editing, clearing and keeping a saved secret on both surfaces, with the secret hidden and shown; the draft never holds a saved value.

## 4. One timeout range for Mnemon calls

**Today.** The Host's settings accept a Mnemon call timeout (`timeoutMs`) of 100–120,000 ms, as the [configuration reference](../en/reference/configuration.md) states, while the Memory Spaces Source's own configuration accepts 1–600,000 ms for the same value.

**Change.** One range for both. A stored value outside it is clamped when read, never refused, and the configuration reference states the range.

**Tests.** Values below, inside and above the new range, stored under either rule, load and clamp the same way in the Host and in Memory Spaces.

## 5. The turn memory bar opens the page of the Source that served it

**Today.** The bar under a turn chooses a page by tool name (`memoryPageForTool` in `src/client/MnemonTurnTail.tsx`). A tool it does not know, including the generic `mnemon_view_route` and `mnemon_view_action`, opens Memory Spaces. Items are matched by the Source that served them, but only for the three shipped Sources and only through their named tools: an item from any other Source opens Memory Spaces, and so does an item a shipped Source served through a generic tool.

**Change.** In the Host, when one of the two generic View tools accepts an id, resolve the offered Route's or Action's Source from the turn's View generation, record its Source type and its operation (`sourceRouteId` or `sourceActionId`) with the tool's activity, and add the Sources that served each tool to `TurnMemoryActivity`. In the client, give the bar each Source's page directory. The named tools keep today's pages. The chip of a generic or unknown tool that one Source served opens that Source's first primary page, the one its Memory System tab opens, and Status otherwise. An item opens its Source's page: a Project Document by id, a runtime memory by its text, Memory Spaces' Spaces or Explore page as today, and another Source's first primary page.

**Caveats.** Calls made from Code Mode never reach the bar. A second instance of a shipped Source opens the shipped instance's page. A Source without a page of its own could open its management section in the Memory System or Status; decide which. Sessions recorded before the change carry no Source, so their generic chips would open Status instead of Memory Spaces; decide whether to keep the old target for them.

**Tests.** Chips and items for each shipped Source through named and generic tools, for an installed Source with and without pages, and for a session recorded before the change.

## 6. The named memory tools pass arguments the Source refuses

**Today.**

- The named tools' schemas leave undeclared properties open, while the Routes and Actions behind them refuse them. A property the model adds, for example `scope` on `mnemon_recall` or `sort` on `mnemon_document_search`, fails with `unsupported property`. `mnemon_document_create` passes its arguments on for every caller, and a delegated writer's `mnemon_remember`, `mnemon_link`, `mnemon_forget`, `mnemon_memory_body_update` and `mnemon_memory_body_merge` do the same.
- Memory Spaces' Recall Route offers `limit` as any integer but refuses one outside 1–20, which `mnemon_recall` reaches with a limit below 1, or above 20 under the General strategy.
- Memory Spaces' remember Action offers `importance` as a number, which the model sees through `mnemon_view_action` for a Memory Spaces instance that no named tool serves, while Memory Spaces keep it as an integer from 1 to 5 and refuse a fraction. `mnemon_remember` itself declares an integer, and for the default instance `mnemon_view_action` refuses the offer and names `mnemon_remember` instead.

**Change.** Pass only the properties the bound Route or Action declares, and leave a non-object input unchanged. Memory Spaces clamps `limit` to 1–20, as the Documents Route already does, and rounds a fractional `importance` to its nearest step before it checks the range, so a value off the 1–5 scale is still refused. Tightening the model-visible schemas themselves (enums, array item types, bounds) changes what the model is told, so it is a separate decision.

**Tests.** Each named tool with an extra property and an out-of-range `limit`, through the named tool and through a delegated writer, and a fractional `importance` through `mnemon_view_action`.

## 7. Providers bring their own translated text

**Today.** A Provider's descriptor carries its label and summary in one language, and dsh-mnemon keeps the translated copy for the shipped Providers itself, keyed by Provider id (for example `readSources.model.<id>`). An installed third-party Provider shows its descriptor's text in every language. Where Memory Spaces lists what each space reads, a Provider without a `readSources.model.<id>` entry shows its badge with an empty line beside it.

**Change.** Descriptors may carry `{ en, 'zh-CN' }` text, with the existing i18n key as the fallback; where Memory Spaces has no copy for a Provider, it shows the descriptor's summary.

**Tests.** A Provider with text in both languages, in one, and in none, in both interface languages.

## 8. Memory Spaces reaches Mnemon Native through its Provider adapter

**Today.** For a few operations, the Memory Spaces Source runs the Mnemon CLI itself instead of asking the Native Provider: embedding status and fill (`embed --status`, `embed --all`), the version check (`--version`), and space merges, which write a `memory-draft.json` and call `import`, duplicating what the Native driver does.

**Change.** Optional adapter capabilities for merge and import, embedding status and fill, and the version check, which the Native Provider implements and other Providers may implement. Memory Spaces calls them and offers each operation only where a Provider has it. How Memory Spaces finds the Mnemon CLI does not change.

**Tests.** Each operation through the Native Provider against the real Mnemon CLI, and its absence for a Provider without the capability.

## 9. SDK helpers for code every plugin repeats

**Today.** Each Source repeats its `presentation.ts`, the effect that refreshes a page when its revision changes, and the parsing of navigation seeds. The nine Provider packages' entry files are nearly identical, and four Providers repeat the same status probe.

**Change.** Client SDK helpers in `dsh-mnemon` for the three page patterns, and a `dsh-mnemon-source-memory-spaces/provider-sdk` helper that builds a packaged Provider's entry with a default status probe. Adopting them raises the Sources' peer floor on `dsh-mnemon` and the Providers' on Memory Spaces. Removing the Starter's page-kit CSS shim waits for a major release.

**Tests.** Each shipped Source and Provider on the helpers, with their existing tests and the packed-artifact checks passing unchanged.
