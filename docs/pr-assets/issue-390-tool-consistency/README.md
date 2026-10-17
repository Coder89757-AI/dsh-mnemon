# Tool answers that no longer read as "nothing there" — issue #390

[简体中文](./README.zh-CN.md) | [Verification record](./verification.json)

Issue #390 listed eleven tool answers, measured on one machine, that do not fail but lead to the wrong conclusion, or where the tools and the Mnemon CLI disagree. This change covers the ones that belong to dsh-mnemon's tools:

| Item | What the issue saw | Where it is fixed |
|---|---|---|
| 1 | A second Documents search in a turn returned `notRun` and an empty list | The change for #389 (`budgetExhausted`) |
| 2 | A mistyped View id and a missing Route or Offer gave the same error, and the exact id format appeared only in the injected envelope | Here |
| 3 | `mnemon_related` returned mostly temporal and entity neighbors | Here, in part: the tool says, for Mnemon Native, that each neighbor names its edge type and how to follow one kind |
| 4 | `mnemon_forget` refused a space outside the View with a generic message, while the CLI deleted | Here |
| 5 | The CLI without `--store` reads only its default Store | Mnemon CLI |
| 6 | `mnemon_memory_bodies` has no counts | Not changed: the model-facing catalog leaves statistics out on purpose; they are on the WebUI |
| 7 | Documents and memories are searched by different tools, and neither says so | Here |
| 8 | `mnemon_document_create` returned every Document | Here |
| 9 | `mnemon_status` did not say what its aggregate sums | Here |
| 10 | No table of tools against CLI commands | Here |
| 11 | Writes had no structured landing | The change for #387 (`memoryBodyIds` from receipts) |

Baseline: main `4feee034`. Fix: `34c0f5e6`, then `2647d5da` after review. The runs took place on 2026-10-17 (Asia/Shanghai) with macOS 15.6 arm64 and Node 24.19.0.

## Fix

- **View ids (2).** `mnemon_view_route` and `mnemon_view_action` refuse an id the View does not offer by naming only what the model's envelope shows. In the default product every Route and Offer is bound to a named tool and left out of `MNEMON VIEW ROUTES`, so a short form of one names that tool (`this View offers it as mnemon_remember, so call that tool`). A short form of an id the envelope lists names the exact id. Anything else lists the ids the envelope shows, with those that share the short form first, or says it shows none by id. A call without an id says so. The core keeps main's message; the Host, which knows the bindings, tells the cases apart.
- **Forget (4).** A forget that names a space this turn's View does not read names the space and why. A switched-off space: whether it is on is the user's choice, on the Memory Spaces page, and a forget there works from the turn after. A space whose Provider is turned off, or a Native space without the CLI, says so. A space switched on after the turn began works from the next turn. An unknown space is called unknown. The generic refusal names the switched-off spaces only when there are some.
- **Retrieval (3, 7).** `mnemon_recall` and `mnemon_document_search` each say what they search and which tool finds the other's items, and recall says that of a cold-archived Document it finds only the index memory the archive left. For Mnemon Native, `mnemon_related` says each neighbor names its `edgeType`, that temporal and entity edges are added automatically and outnumber the rest, and that `edge` follows one kind. Other Providers name no edge type and do not filter by `edge`, and the tool says so.
- **Document writes (8).** The receipt carried the snapshot of every Document, with excerpts and absolute paths, growing with the layer. A Document write now returns to the model the Document written, with its `contentHash` and without the body it just sent or a path, and the layer's totals in `documents`. A write through `mnemon_view_action` is compacted the same way. The WebUI keeps reading the full catalog from the control plane.
- **Status (9).** The aggregate carries `scope` and `spaces`: it sums the active, healthy spaces whose Provider reports statistics, and says how many; `totalInsights` counts live memories and `deletedInsights` the forgotten ones a Provider keeps, as Mnemon Native does.
- **Capabilities (10).** The interface reference gains a table of model tools against Mnemon CLI commands, with what each acts on. It says how the CLI's `--store`, `--data-dir` and `MNEMON_DATA_DIR` reach dsh-mnemon's memory, that a Store made with `mnemon store create` there appears as a switched-off space, and that a Store removed with `mnemon store remove` comes back empty at dsh-mnemon's next status check.

## Method

[harness/probe390.probe.ts](./harness/probe390.probe.ts) runs the registered tools on the composition fixture: a Holographic space, four Documents and a pinned View. It creates a Document through `mnemon_document_create`, calls `mnemon_view_route` with the short name `search` and with an id the View never offered, calls `mnemon_view_action` with the short name `remember`, and reads `mnemon_status`. For each refusal it checks whether the message names an id the model's envelope does not show.

[harness/archive-fixture.probe.ts](./harness/archive-fixture.probe.ts) feeds the scripted model of `pnpm e2e:serve --document-archive` the receipts the model reads. Create and update run through `mnemon_document_manage` on the real Documents layer. The archive is the real Documents archive with the lineage the Host builds, since the Host's index needs a model. The model asserts that the lineage digest is the content hash of the Document it wrote.

Both ran on the fix, on main, and on the first version, `34c0f5e6`, with `src/host/tools.ts`, `src/host/view-presentation.ts`, `src/core/composition.ts` and the Memory Spaces view model and Source taken from each.

## Before and after

| Case | main | First version | Fix |
|---|---|---|---|
| `mnemon_document_create` with 5 Documents | 4,832 bytes: the body, a `snapshot` of every Document, an absolute path | 458 bytes: no body, no absolute path, a storage-root `relativePath`, no `contentHash` | 480 bytes: no body, no path, `contentHash` |
| `mnemon_view_route` with `search` | `memory View Route is unavailable: search` | names `"source:mnemon-source-documents/search"`, an id the envelope hides | `…; this View offers it as mnemon_document_search, so call that tool` |
| `mnemon_view_route` with `source:nowhere/undeclared` | `memory View Route is unavailable: source:nowhere/undeclared` | lists four Route ids, all hidden | `…; MNEMON VIEW ROUTES offers none by id this turn, only the named tools in MNEMON VIEW TOOLS` |
| `mnemon_view_action` with `remember` | `memory ActionOffer is unavailable: remember` | names `"source:mnemon-source-memory-spaces/remember"`, hidden | `…; this View offers it as mnemon_remember, so call that tool` |
| `mnemon_status` aggregate | Counts only | `scope`: active, healthy spaces | `scope`: active, healthy spaces whose Provider reports statistics, with `spaces: 1` |
| `--document-archive` model | `tool-archive-completed` | fails: the lineage digest has no `contentHash` to match | `tool-archive-completed` |

The forget refusals are shown by the Memory Spaces Source test below, through a real View over a Provider fixture.

## Automated checks

- `tests/default-three-tier-host.spec.ts`, through the registered tools on a View with an external Source:
  - a short form of a bound Route or Offer names its tool, a short form of the external Route names its exact id, an unknown id lists what the envelope shows, an Action kind with every Offer bound says none is offered by id, and a call without an id says so; no message names a hidden id;
  - with two Sources whose Routes end alike, the ids a short form could mean come first within the twelve listed;
  - a Document write through `mnemon_view_action` comes back compact.
- `tests/document-protection.spec.ts`:
  - the Source-action and root paths return the compact receipt, with `contentHash` and no body or path, workspace or storage root;
  - an archive keeps its lineage, whose digest is the `contentHash` the model was handed;
  - the full Document is still stored and readable.
- `plugins/dsh-mnemon-source-memory-spaces/tests/source.spec.ts`: on a real View over a Provider fixture,
  - with no space switched off, the generic refusal names none;
  - after a space is switched off, a forget naming it says that switching it on is the user's choice and works from the next turn, and the generic refusal names it;
  - switched on again during the turn, it is still outside the pinned View, and the next turn's forget works;
  - an unknown space is called unknown.
- `plugins/dsh-mnemon-source-memory-spaces/tests/view-model.spec.ts`: the aggregate carries its scope and counts only the spaces with statistics; a Provider without them counts as healthy and adds nothing.

All eight new or changed tests fail with the sources from main. Seven fail with the first version's; the compact receipt of a Source-action create passes there too.

## Review

An independent review of the first version found:
- the compact receipt dropped `contentHash`, which broke the `--document-archive` e2e model;
- the id refusals named ids the envelope hides behind named tools, so a model that followed them would write without the write worker;
- the forget advice to switch a space on could not work in the same turn and would change the user's setting for good;
- `mnemon_related` claimed edge types for every Provider;
- the CLI table had three errors;
- the aggregate's scope ignored Providers without statistics.

`2647d5da` fixes all of them.

## Limits

- Item 5 belongs to the Mnemon CLI, and item 6 to a deliberate bound on the model-facing catalog; the capability table explains both.
- `mnemon_related` still traverses every edge type unless `edge` is given; only its description changed.
- An exact id the envelope hides still runs through the generic tools, as on main; the refusals no longer reveal one.
- The browser run of `pnpm e2e:serve --document-archive` was not repeated; its scripted model ran against the tools' receipts instead.
- The activity row of a Document write in the conversation still names the write by its title, as before.
