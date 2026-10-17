# Roadmap

[简体中文](../zh-CN/roadmap.md) | **English** | [Documentation](./README.md)

This page separates shipped foundations from remaining work. Future items are directions, not release promises.

## Shipped foundations

- Independent Source, Strategy and Provider packages, a small public contribution service, Source-owned pages and one immutable View per executing turn.
- A Starter with the Layered strategy as its default, the General strategy as an alternative main strategy, and three optional enhancements that work with either.
- Source-local Provider descriptors, connection schemas, redaction and child-Fiber registration.
- Public-contract tests, independently installed artifacts, isolated Headless/WebUI fixtures and selective package releases.

See [Architecture](./development/architecture.md), [Development](./development/README.md) and [Release process](./development/releasing.md) for the actual scope and limits.

## Next: reliability and recoverability

- Persist background-review watermarks and pending activity across restarts; add bounded backoff and explicit retry.
- Improve idempotence and cancellation under interrupted maintenance; retain evidence of partial writes and source revisions.
- Add a deterministic sensitive-content defense before memory admission. Current model guidance is not a secret scanner.
- Expand real WebUI and fault-injection coverage: scopes, concurrent edits, capacity limits, remote deployment paths, provider recovery and supported OS combinations.
- Extend the [verified compatibility matrix](./reference/compatibility.md), including explicitly authorized real-Provider tests. Adapter fixtures alone are insufficient.

## Next: gaps from the October 2026 review

A review of the code after v0.5.31 found these concrete gaps. Each one changes what users, plugin authors or the model see, so each gets a pull request of its own. [The plan](../plans/review-gaps-2026-10.md) records what happens today and the proposed change for each.

- **Backups and Git sync keep every field of a Memory Space.** An import, and the sync that uses one, keeps six fields of each Memory Space entry, so a Native space loses its recorded placement decision and where its name came from.
- **One atomic write and one lock rule for every store.** Eleven hand-written writes differ in what they leave behind after a failure and in how they name their temporary files, and two Sources remove a lock without checking that they still own it.
- **One rule for a saved secret in Provider settings.** In Memory Spaces' **Memory providers** settings, deleting part of a saved secret's mask saves the rest of the mask as the secret. The dialogs' rule, where an empty field keeps the saved secret and clearing it is explicit, should apply there too.
- **One timeout range for Mnemon calls.** The Host accepts 100–120,000 ms and the Memory Spaces Source 1–600,000 ms for the same value; aligning them must keep every stored value loading.
- **The turn memory bar opens the page of the Source that served a tool.** Today a tool the bar does not know, including the generic View tools, and an item from an installed Source both open Memory Spaces.
- **The named memory tools pass only what the Source accepts.** A property the model adds, a recall `limit` above 20 or a fractional `importance` can make the Source refuse a call the tool's schema allows.
- **Providers bring their own translated text,** and a Provider without copy shows its label instead of an empty line.
- **Memory Spaces reaches Mnemon Native through its Provider adapter** for embedding status and fill, the version check and space merges, so that other Providers can offer the same operations.
- **SDK helpers for the code every Source and Provider repeats:** page presentation, refreshing on a new revision, navigation seeds, and a packaged Provider's entry with a default status check.

## Later: controlled maintenance and extension growth

- Reviewable long-term consolidation, conflict/decay candidates and deliberate forgetting.
- Stronger multi-component backup/restore drills and repair tools for damaged metadata or missing projections.
- Explicit data-format migration and rollback procedures when persistent formats actually need to change.
- Better background-review history and diagnostics; broader internationalization of Host errors and command output.
- A reusable DSH directory picker when the Host exposes the necessary capability; track [dsh-external/issues#603](https://github.com/dsh-external/issues/issues/603) (private repository; requires access, and unauthenticated requests return 404).
- Candidate Source/Strategy evaluation and controlled promotion for RSI: preserve inputs, artifacts, permissions and comparison results before an explicit installation decision.

## Boundaries that remain

The current UI presents memory behavior, not a generic plugin marketplace or View canvas. External plugins follow DSH installation and the public author contracts.

Cordis ownership is not a sandbox. There is no automatic execution of model-generated code, universal deletion guarantee, cross-Provider transaction, notification daemon or claim that every third-party memory plugin integrates without adaptation.
