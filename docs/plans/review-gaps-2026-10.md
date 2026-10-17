# Gaps from the October 2026 review

[Design plans](./README.md) · [Roadmap](../en/roadmap.md)

Status: planned, nothing here has shipped. Written on 2026-10-17 against `main` at `f41a121f` (v0.5.31 with #414, #415 and #416); file references are to that revision.

After v0.5.31, a review of the code, the documentation and the Host's compatibility branches produced a list of follow-ups. The ones that keep behavior unchanged (consolidation, refactors, documentation and tests) went into pull requests of their own. The items below change what users, plugin authors or the model see, so each one needs its own decision and pull request. The [roadmap](../en/roadmap.md#next-gaps-from-the-october-2026-review) lists them.

## 1. Backups and Git sync keep only part of a Memory Space entry

**Today.** `parseMemorySpaceRegistry` in Memory Spaces' `./contracts` keeps six fields of each registry entry: `id`, `name`, `description`, `active`, `createdAt` and `updatedAt`. The Pack reads the local registry and the archive's registry through it, and a replace or merge import writes the result back as the local registry (`readCurrentRegistry`, `mergeRegistry` and `writeRegistry` in `src/host/pack.ts`). Git sync applies a pulled version through the same import. Every import therefore rewrites each Native space's entry without the other fields it may hold, such as `placement` (the automatic placement decision) and `metadataSource` (whether the name and description came from the Provider, the user or the AI). The visible name and description stay, since the Source treats an existing entry without `metadataSource` as edited by the user, but the Source no longer knows how the space was placed or who named it.

**Change.** Carry the remaining fields of a Native entry in the Pack, and on a merge keep the local fields an incoming entry lacks; decide which side wins on a replace. A Pack written by an earlier version, with six fields per entry, must still import.

**Tests.** Replace, merge and sync of a space with `placement` and `metadataSource`, from a Pack of this version and of an earlier one.

## 2. One atomic write and one lock rule for every store

**Today.** Eleven writes go through a temporary file and a rename, each written by hand: in the Host, Git sync (two), the machine identity, the sync settings, the review ledger and the Pack; in the Sources, Runtime (two), Documents and the Memory Spaces registry; and the Holographic Provider. They differ in ways that matter after a failure:

- Documents, the Memory Spaces registry and the Holographic Provider leave the temporary file behind when the write fails.
- The sync settings, both Git sync writes and the Memory Spaces registry name the temporary file after the process id alone, so two writes of one file in one process can collide.
- Lock files are created in three or four ways. The Pack checks that it still owns a lock before it deletes it; the Runtime and Documents Sources delete theirs unconditionally.
- A leading `~` is expanded in six places with different rules (`version-updates.ts` misses a bare `~`, and only `native-cli` handles `~\` on Windows). The default data directory `~/.mnemon/sources/<key>` is computed three times, and only Memory Spaces accepts a configured `~/` path. Versions are compared in two places.

**Change.** Host-internal helpers first: one atomic write that removes its temporary file on failure and names it uniquely, one lock that is removed only by its owner, one path expansion and one data-directory rule. Then the same helpers as Node-only SDK exports the plugins adopt, which raises their peer floor on the SDK.

**Tests.** A failed write leaves nothing behind; two concurrent writes in one process; a lock taken over after it was abandoned is not deleted by its first owner; `~`, `~/` and `~\` on each platform.

## 3. The turn memory bar opens the page of the Source that served it

**Today.** The bar under a turn chooses a page by tool name (`memoryPageForTool` in `src/client/MnemonTurnTail.tsx`). A tool it does not know, including the generic `mnemon_view_route` and `mnemon_view_action`, opens Memory Spaces, and so does an item from a Source other than the three shipped ones. A tool chip never considers the Source.

**Change.** In the Host, when one of the two generic View tools accepts an id, resolve the offered Route's or Action's Source from the turn's View generation, record its Source type and its operation (`sourceRouteId` or `sourceActionId`) with the tool's activity, and add the Sources that served each tool to `TurnMemoryActivity`. In the client, give the bar each Source's page directory: a chip opens that Source's table page, or its first registered page when it has one Source, or Status otherwise. Items keep their current targets for the shipped Sources (a Project Document by id, a runtime memory by its text, Memory Spaces' Spaces and Explore pages) and open another Source's first page.

**Caveats.** Calls made from Code Mode never reach the bar. A second instance of a shipped Source opens the shipped instance's page. A Source without a page opens Status. Sessions recorded before the change carry no Source, so their generic chips would open Status instead of Memory Spaces; decide whether to keep the old target for them.

## 4. The named memory tools pass arguments the Source refuses

**Today.**

- The named tools' schemas leave undeclared properties open, while the Routes and Actions behind them refuse them. A property the model adds, for example `scope` on `mnemon_recall` or `sort` on `mnemon_document_search`, fails with `unsupported property`. A delegated writer's `mnemon_remember`, `mnemon_link`, `mnemon_forget`, `mnemon_memory_body_update` and `mnemon_memory_body_merge` pass such a property on in the same way.
- Memory Spaces' Recall Route offers `limit` as any integer but refuses one outside 1–20, which `mnemon_recall` reaches with a limit below 1, or above 20 under the General strategy.
- The remember Action offers `importance` as a number, while Memory Spaces keep it as an integer from 1 to 5 and refuse a fraction.

**Change.** Pass only the properties the tool or the bound Route or Action declares, and leave a non-object input unchanged. Memory Spaces clamps `limit` to 1–20, as the Documents Route already does, and rounds a fractional `importance` to its nearest step; a value off the scale is still refused. Tightening the model-visible schemas themselves (enums, array item types, bounds) changes what the model is told, so it is a separate decision.

**Tests.** Each named tool with an extra property, an out-of-range `limit` and a fractional `importance`, through the named tool and through a delegated writer.

## 5. Providers bring their own translated text

**Today.** A Provider's descriptor carries its label and summary in one language, and dsh-mnemon keeps the translated copy for the shipped Providers itself, keyed by Provider id (for example `readSources.model.<id>`). An installed third-party Provider shows its descriptor's text in every language, and where Memory Spaces lists what each space reads, a Provider without a `readSources.model.<id>` entry shows an empty line.

**Change.** Descriptors may carry `{ en, 'zh-CN' }` text with the existing i18n key as the fallback; Memory Spaces shows the descriptor's own label where it has no copy.

## 6. One rule for a saved secret in Provider settings

**Today.** On Memory Spaces' Provider configuration page, a saved secret shows as a mask of twelve dots with a show button. Focusing the field selects the mask, so typing replaces it, but moving the cursor and deleting one dot saves the remaining dots as the new secret. The page's draft also merges in a `secretValues` field, which it would display if a Host sent one; nothing sends it today, although Memory Spaces still has an unused `includeSecrets` option that would. The Provider dialogs use a safer rule: the field is empty, a hint says the saved secret is kept when it is left empty, and clearing it is an explicit action. The `.providerFieldControl` class is also styled in two places, differently.

**Change.** Use the dialogs' rule on the configuration page too, drop `secretValues` from the draft and the unused option from Memory Spaces, and keep one style for the field.

**Tests.** Editing, clearing and keeping a saved secret on both surfaces; the draft never holds a saved value.

## 7. Memory Spaces reaches Mnemon Native through its Provider adapter

**Today.** For a few operations, the Memory Spaces Source runs the Mnemon CLI itself instead of asking the Native Provider: embedding status and fill (`embed --status`, `embed --all`), the version check (`--version`), and space merges, which write a `memory-draft.json` and call `import`, duplicating what the Native driver does.

**Change.** Optional adapter capabilities (merge and import, embedding status and fill) that the Native Provider implements and other Providers may implement; Memory Spaces calls them and offers the operation only where a Provider has it. How Memory Spaces finds the Mnemon CLI does not change.

## 8. SDK helpers for code every plugin repeats

**Today.** Each Source repeats its `presentation.ts`, the effect that refreshes a page when its revision changes, and the parsing of navigation seeds. The nine Provider packages' entry files are nearly identical, and four Providers repeat the same status probe.

**Change.** Client SDK helpers for the three page patterns, and a `provider-sdk` helper that builds a packaged Provider's entry with a default status, which raises the plugins' peer floor on the SDK. Removing the Starter's page-kit CSS shim waits for a major release.

## 9. One timeout range for Mnemon calls

**Today.** The Host's settings accept a Mnemon call timeout (`timeoutMs`) of 100–120,000 ms, while the Memory Spaces Source's own configuration accepts 1–600,000 ms for the same value.

**Change.** One range, chosen so that every value stored under either rule still loads: a stored value outside the new range is clamped when read, never refused.
