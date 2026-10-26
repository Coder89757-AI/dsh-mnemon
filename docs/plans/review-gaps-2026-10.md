# Gaps from the October 2026 review

[Design plans](./README.md) · [Roadmap](../en/roadmap.md)

Status: planned; item 12 is done ([record](../pr-assets/neutral-vector-note/README.md)), and nothing else here has shipped. Written on 2026-10-17 against `main` at `f41a121f` (v0.5.31 with #414, #415 and #416); file references are to that revision.

After v0.5.31, a review of the code, the documentation and the Host's compatibility branches produced a list of follow-ups. The ones that keep behavior unchanged (consolidation, refactors, documentation and tests) went into pull requests of their own. The items below change what users, plugin authors or the model see, so each one needs its own decision and pull request. The [roadmap](../en/roadmap.md#next-gaps-from-the-october-2026-review) lists them in the same order. Items 10 and 11 were found later in the same batch, while Memory Spaces' settings moved into Memory Spaces (#421). Items 12 to 14 were found while capturing the [v0.5.32 gallery](../assets/webui-v0.5.32/README.md), and items 15 to 18 while reviewing it. The file references of items 13 to 18 are to `main` at `44a3cfc8`, after the client and Host module splits (#425, #428); item 12's, written before its fix, are to `03dd40a4`. The gallery was later [captured again with an embedding service](../pr-assets/webui-gallery-embedding/README.md), so these items name the screen or recording that shows each behavior, and say so where they quote the [first capture](../pr-assets/webui-gallery-v0532/README.md). Items 19 to 23 were found at the end of the batch, while the endpoints were listed, the client modules split and the gallery captured, and their file references are to `main` at `44a3cfc8`; 21 and 22 are build maintenance that changes nothing users see.

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

## 10. Memory Spaces shows an error for a moment after it is switched on

**Today.** Found while recording the switch for #421, the same on `main`. Right after Memory Spaces is switched on from its page under Plugins, its Source is still starting, so the settings' first `provider-services` read answers that the Source `memory-spaces` is not installed. The page shows that as a load error for about half a second to a second, until the next read lists the Providers.

**Change.** While the Source a component's settings read is starting, show them as loading and read again once it is running, instead of reporting the read as failed; `ProviderSettingsSection` already has a `pending` state for this, which the settings do not pass yet. A Source that stays unavailable still shows the error.

**Tests.** Switching Memory Spaces on in the WebUI on both DSH releases shows no error frame; a Source that never starts still shows the error with its retry.

## 11. A Provider list reload can undo a switch or a save on the page

**Today.** Found in the review of #421, the same on `main`. The Provider settings read the list again quietly, for example when the configuration's revision moves. If such a read is under way when the user switches a Provider or saves its service, and it answers after the switch or the save, the page shows the list as it was before the change (`load` in Memory Spaces' `src/client/provider-settings.tsx` does not know the change happened). What is stored is right; the page shows it again at the next read.

**Change.** Start a new request version when a switch or a save begins, so a read that started before it is discarded.

**Tests.** With a quiet read held open, switch a Provider and save one; the page keeps the new state when the held read answers.

## 12. A default install's save receipt reads as a failure

**Today.** Found while capturing the v0.5.32 gallery. With the Mnemon Native embedding settings at their default, where **Manage embedding settings in DSH** is off, dsh-mnemon supplies no override and leaves embedding to the Host environment and the Mnemon CLI's own defaults. On a machine where no embedding service answers, every write to a Mnemon Native space comes back with `embedded: false`, and since #388 every receipt for a save that lands in a Memory Space, in a conversation and on the Memory Spaces page, ends in the caution tone with "Saved without a vector: embedding did not succeed, so this memory is left out of semantic matching for now. Once the embedding service answers, fill it in from Test status in the Mnemon Native embedding settings." (未生成向量：嵌入没有成功，…). Saves to working memory or the user profile never carry the line: `saveDirectly` in `src/client/MnemonSaveAction.tsx:96-120` sets `unembedded` only for a write to a space. The memory is saved, and keyword, link and recency recall reach it; but someone who never set up embedding reads a failure on every save to a Memory Space, as the [first capture](../pr-assets/webui-gallery-v0532/README.md)'s receipts showed.

**Change.** Word the line by its cause. When no embedding service is set up, neither in DSH's settings nor in the environment the Mnemon CLI reads, a neutral note says that semantic matching needs an embedding service and links to the Mnemon Native embedding settings; the caution stays for a service that is set up but did not answer or lacks the model. Decide whether the neutral note shows on every save or once per space.

**Tests.** Save to memory through the task Agent and straight to a space, with the settings at their default and no service, with a configured service that is down, and with a working service, in both languages: the neutral note, the caution, and no line; a save to working memory or the user profile shows none of them.

**Done** ([record](../pr-assets/neutral-vector-note/README.md)). The line is worded by whether DSH manages the Mnemon Native embedding settings (`embedding.enabled`). Off, the default, it is a neutral note in the hint colour: no embedding service is available, keyword search still finds the memory, and the vector can be filled in from Test status once a service is connected. On, it keeps the caution. The conversation's Save to memory reads the setting from the settings it already holds, the Memory Spaces page from its Source's status (a new optional `embeddingManaged`), and `/mnemon remember` from the Host's resolved configuration; `WriteReceipt` takes it as an optional `embeddingManaged`, and without it keeps the caution, as beside a Memory Spaces of 0.5.21 or earlier. The hint the model reads is unchanged. The note shows on every save without a vector, since each receipt stands alone. The approved scope words the line by `embedding.enabled` alone, without probing the service or reading the environment the Mnemon CLI inherits, so unlike the Change above, a service DSH does not manage also gets the neutral note when it produces no vector: one set up only in that environment, and an Ollama at Mnemon's default endpoint that is down or lacks the model. The note's advice holds for them, and Test status tells them apart.

## 13. A replaced runtime memory entry shows when it was first written

**Today.** Found while capturing the v0.5.32 gallery; v0.5.19's screens show the same. A runtime memory entry stores `created_at` and `updated_at`, and a replace keeps `created_at` and sets `updated_at`. The Runtime memory page shows each entry's `created_at` and sorts by it (`plugins/dsh-mnemon-source-runtime/src/client/pages.tsx:114` and `:131`), so it never shows `updated_at`. The gallery's English Runtime memory screen (`memory-runtime`) shows the corrected checkout target with the time the demo was seeded, like the entries nobody changed.

**Change.** Keep the order the [UI guide](../en/guides/ui-guide.md#runtime-memory) describes, where editing an older entry keeps its place, and show when an entry last changed: its update time beside the creation time whenever the two differ.

**Tests.** An entry added, replaced by the Agent, edited on the page, and kept by a capacity compaction: the order stays and each shows the right times, in both languages.

## 14. At 390 px the active tab, the turn bar's summary and the space cards' counts are out of sight

**Today.** Found while capturing the v0.5.32 gallery; v0.5.19's phone screens show the same. At 390 × 844, the Memory System's page tabs scroll sideways without a scrollbar (`.nav` in `src/client/MnemonView.module.css`), and nothing brings the active tab into view: in English, Memory Spaces, the fourth tab, is off-screen while its page is open. At the same width a space card on Memory Spaces' Overview cuts its counts short, and the turn memory bar's summary is cut once it outgrows the row (the [first capture](../pr-assets/webui-gallery-v0532/README.md) showed "Turn memory recalled 1 document se…").

**Change.** When a page opens, scroll the tab strip itself so the active tab shows; `scrollIntoView` would also move DSH's sliding phone frame. Let the bar's summary and a card's counts wrap at phone width instead of truncating.

**Tests.** At 390 px in both languages: each tab, opened from the sidebar and from a turn's item, is in view without the phone frame moving; the summary and the counts read in full.

## 15. Memory Spaces shows empty counts while a space is still being checked

**Today.** Found while reviewing the v0.5.32 gallery. Memory Spaces' Overview first shows the space directory, which answers without waiting for the Providers (`spaceDirectory` in Memory Spaces' `src/service.ts`), and then each space's status. A Mnemon Native space card takes its memories, edges and size from the status's `stats` and shows zero while there are none (`plugins/dsh-mnemon-source-memory-spaces/src/client/overview-page.tsx:419`). Until a space's status answers, its card therefore reads "0 memories", "0 edges" and "0 B" while its status line reads "Checking"; the gallery's Chinese memory recording shows this for a few frames before the real counts. A slow Provider therefore looks like an empty space.

**Change.** Show a placeholder for the counts while a space's status is loading and whenever its status brought no `stats`; a space whose status reports no memories keeps its zeros.

**Tests.** With a space's status read held open, its card shows the placeholder and then the counts; an empty space shows zeros; a space whose status read fails shows no zeros; in both languages.

## 16. Opening a turn's item can show an empty Memory System for a moment

**Today.** Found while reviewing the v0.5.32 gallery. When the Memory System opens, and whenever its session, workspace or storage settings change, it reads its status and its Source catalog for that view again, and until the catalog answers it has none (`sourceCatalog` in `src/client/use-source-catalog.ts:57`): its tabs list only Status, and its header reads "Checking" while the status loads (`src/client/MnemonWorkbench.tsx:313`). A turn's item opens a Source page, and until the catalog arrives nothing in the canvas matches that page (`MnemonWorkbench.tsx:434-444`), so the canvas stays empty. In the gallery's recall recordings this lasts a frame or a few; on a slower Host it lasts as long as the catalog read.

**Change.** While the catalog loads, show the target page as loading in the canvas, and its tab as pending, instead of an empty page.

**Tests.** Open a document, a memory and a runtime entry from a turn with the catalog read held open: the canvas shows a loading state, and the target page opens when the read answers; opening Status directly is unchanged.

## 17. The graph's footer counts only the entities it draws

**Today.** Found while reviewing the v0.5.32 gallery. The Overview graph keeps the 24 entities that most memories carry (`enrichMultiSpaceGraph`, `plugins/dsh-mnemon-source-memory-spaces/src/client/memory-graph.tsx:102`), and its footer counts the entity nodes it drew (`overview-page.tsx:294` and `:447`), so in the gallery it reads 24 entities and leaves the rest out of its element total. The Entities page counts every distinct entity of the same spaces (`entities` in Memory Spaces' `src/service.ts:1122`), above 24 in the gallery. With 24 entities or fewer the two agree, as on the freshly seeded demo.

**Change.** Count every entity in the footer and say how many the graph draws, for example "24 of 26 entities", and count the entities left out in the elements total.

**Tests.** Spaces with fewer and with more than 24 entities: the footer's entity total matches the Entities page, and its drawn count matches the nodes on screen.

## 18. Graph labels overlap and run past the right edge

**Today.** Found while reviewing the v0.5.32 gallery. With 22 nodes or more, every third node gets a label of up to 19 characters to its right (`plugins/dsh-mnemon-source-memory-spaces/src/client/memory-graph.tsx:416` and `:436`), with no check against other labels or the edge of the view, while nodes are kept only 58 units inside the graph's 930-unit-wide view box (`clampGraphPosition`, `:148`). In the gallery's English graph (`memory-graph`), labels run into one another and one at the right edge is cut off.

**Change.** Place a label to the left of its node when it would cross the right edge, and leave out a label that would overlap one already placed; the selected node always keeps its label.

**Tests.** A dense graph at the Overview's size, and the same graph after Natural spread and Uniform reset: no label crosses the edge of the view or overlaps another, and the selected node's label shows.

## 19. The Git sync form and the Host disagree on some local paths

**Today.** Found while giving the sync checks one owner (#426). The settings form and the Host run the same rules (`src/host/sync-rules.ts`), but each kept its old answer where they differed: the form checks a local repository path with a portable rule (`portableAbsolutePath`), the Host with its own platform's `isAbsolute` (`src/host/sync-config.ts`). On a POSIX Host the form accepts `C:\repo`, `C:/repo` and `\\server\share`, which the Host then refuses; on a Windows Host the Host accepts `\repo`, which the form refuses. In the repository address and the directory, only the Host refuses a NUL byte (the branch and machine-name rules refuse it on both sides).

**Change.** One answer per Host platform: the form checks a local path by the rule of the platform the Host reports, and both sides refuse a NUL byte in the repository address and the directory. Stored settings keep loading; a stored path the new form rule refuses is shown with its problem, never dropped.

**Tests.** Each path form on a POSIX and a Windows Host, in the form and in the Host, and a NUL byte on both.

## 20. Host endpoints the shipped client no longer calls

**Today.** Found while listing the Host's endpoints in one place (#426). The Host serves 28 endpoints the shipped client no longer calls (`SERVED_FOR_OTHER_CALLERS` in `tests/rpc-endpoints.spec.ts`): 14 reads such as `runtime-memory`, `documents`, `search` and `graph`, 10 writes such as `remember` and `body-update`, the activation `body`, and the View's `preview`, `inspect-plugin` and `install-plugin`. The workbench moved to Source management and Host assistance in September 2026; the Interfaces reference still lists the direct endpoints, and scripts such as `verify-sync-git.mjs` use `runtime-memory`.

**Change.** Decide which stay as a documented interface and say so in the Interfaces reference, move the repository's scripts to the operations the client uses, and deprecate the rest with a removal named in the release notes ahead of time.

**Tests.** The endpoint spec follows the decision; every kept endpoint has a caller or a documented use.

## 21. Client bundles carry the path of the machine that built them

**Today.** Found while comparing bundles in #426. The CSS-module region comments in the built `lib/client.js` of the Starter and of Memory Spaces include the absolute checkout path, so the published packages carry the CI runner's path and the bytes depend on where the repository is checked out. Build maintenance only; nothing users see.

**Change.** Strip the region comments from client builds, or write the paths relative to the package.

**Tests.** Two builds from different checkout paths give identical client bundles.

## 22. ByteRover's published declarations lose their types

**Today.** Found while splitting the client modules (#425). With the workspace cycle ignored, `pnpm -r build` can build `dsh-mnemon-provider-byterover` before Memory Spaces, and its `lib/index.d.ts` then types its definition and module as `any`; the published 0.5.5 has the `any` types. A later build resolves them. Build maintenance only; nothing users see at run time.

**Change.** Build Memory Spaces and the SDK entries the Providers import before the Providers, or break the cycle, and check the packed declarations.

**Tests.** A packed-artifact check that each Provider's declarations carry no `any` (the published 0.5.5 also types `scoreSemantics` as `any`).

## 23. A recall can keep a different set of tied memories each time

**Today.** Found while capturing the v0.5.32 gallery (#424). Ask Agent's recall kept four of five memories that matched equally, and a later call on the same store kept a different four. When all spaces use one Provider, Memory Spaces sorts candidates by score alone (`plugins/dsh-mnemon-source-memory-spaces/src/service.ts:895`) before each recall-quality policy cuts the list to the requested limit (`src/recall-quality/policies.ts`), so ties keep the order they arrive in, and the order the Mnemon CLI returns them in is not fixed. With several Providers, candidates are ordered by federated rank, then by space.

**Change.** Break ties where the limit cuts by a stable key (for example the newer memory first, then the id), in Memory Spaces and, upstream, in the Mnemon CLI's recall.

**Tests.** A recall over memories with equal scores and a limit below their number keeps the same memories on every call.
