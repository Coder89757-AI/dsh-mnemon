# The v0.5.32 WebUI gallery, captured again with an embedding service

[简体中文](./README.zh-CN.md)

Recorded on 2026-10-18 (Asia/Shanghai). The [first capture](../webui-gallery-v0532/README.md) of the [v0.5.32 gallery](../../assets/webui-v0.5.32/README.md) ran without an embedding service, so every save to a Memory Space ended with "Saved without a vector", and the documentation had to explain a line that a default install with a local Ollama never shows. The maintainers decided to capture the gallery again with a real embedding service, so that saves take the normal path and get a vector. This change replaces the media under the same names, regenerates the manifest and the gallery README, and updates the sentences and alt texts that described the first capture. No code changes; the gallery's changeset now mentions the embedding service.

## Embedding setup

- Ollama 0.40.6, the official CLI, served `nomic-embed-text` (768 dimensions), the Mnemon CLI 0.2.10's default embedding model, on 127.0.0.1:11434, Mnemon's default endpoint.
- The Mnemon Native embedding settings stayed at their default, with **Manage embedding settings in DSH** off, so DSH supplied no override and Mnemon used exactly this endpoint and model, as a default install with a local Ollama does. The fixture sets no embedding either.
- After each pass, `mnemon embed --status` reported 100% coverage on all three stores of the fixture, the saved memory included. The Chinese fixture was also checked right after seeding, with the same result. No receipt in either pass carries a vector line.

## How it was captured

- The capture ran on revision `bd70979f` (`main` with #424 to #426), built with Node 24.19.0 and pnpm 10.13.1, served by the pinned DSH 0.2.1-rc.2, with Mnemon CLI 0.2.10 and headless Chrome 155 at 1280 × 800 and 390 × 844, device scale factor 2, light. The branch then took `main` at `6724ccde` (#427). That change only rewords the receipt line for a memory saved without a vector, and no screen here shows that line, so the capture still holds.
- Same questions and tooling as the first capture: one live pass per language over a fresh `--docs-demo --live-model` fixture, with the DeepSeek key only in the fixture's environment. `memory-runtime-limits` was taken on a fresh fixture of the same build before any conversation, and `plugins-list` at 1280 × 858.
- One tooling change. The graph screen is now framed by the bottom of the sticky page header, where it was framed by a fixed offset, so the graph's own header row is hidden in both languages (the first capture's Chinese `memory-graph` showed it half cut off). The Chinese pass ran before the change, so its `memory-graph` was taken again on the pass's own fixture right after the pass, with the same data, and the manifest marks it.

## Takes

Each language's first pass is kept. Every reply, Save to memory candidate and receipt, and Agent answer was read, and frames from every recording were checked. Neither pass logged a browser console error.

- **English.** The first answer used working memory and a Project Documents search that returned four documents, with no Memory Spaces recall. The English recall alt texts therefore name working memory and Project Documents only.
  - The save went to the Lumen project as the follow-up to the note on the synchronous SDK.
  - The correction replaced the runtime entry and also updated the checkout LCP investigation, so its turn memory bar lists a runtime memory update and a document update. The English UI guide says so.
  - Ask Agent cites five memories, including the September 12 incident.
  - Direct search for "checkout performance" puts the saved decision first, at score 0.82.
- **Chinese.** The first answer read two documents and recalled one memory from Memory Spaces, so the Chinese recall alt texts now include Memory Spaces.
  - The save went to the Lumen project as a technical decision.
  - The correction wrote two runtime memory updates, as before.
  - Ask Agent cites four memories, including the September 12 incident. This came on the first pass; the first capture needed six passes to get it.

## Documentation changed

- `docs/assets/webui-v0.5.32/`:
  - The media, replaced under the same names. The 74 files total 23.1 MB, against 23.8 MB before.
  - The manifest: capture date 2026-10-18, revision `bd70979f`, a new `embedding` field, and the retaken screen marked.
  - The gallery README: the embedding row and paragraph, no notes about missing vectors, the English recall alt text, and a link to this record.
- `README.md` and `README.zh-CN.md`: the sentence about the vector line is removed, and the recall alt text is updated in both languages.
- `docs/{en,zh-CN}/guides/ui-guide.md`:
  - The intro's embedding sentence.
  - The alt texts of the recall answer and the receipt in both languages, and of the correction in English.
  - The English sentence on the correction's writes.
- `docs/{en,zh-CN}/guides/getting-started.md`: the recall alt text.
- `docs/assets/README.md`: the gallery's description.
- `.changeset/webui-gallery-v0532.md`: names the embedding service.
- Items 12 to 18 of the [review plan](../../plans/review-gaps-2026-10.md) and the matching roadmap entries, in both languages:
  - They quoted times, seconds and counts from the first capture that the new gallery no longer shows.
  - They now name the screen or recording that shows each behavior and leave those figures out.
  - Where they still quote the first capture (item 12's receipts and item 14's cut-off summary), they say so.
  - Their file references now cite `main` at `44a3cfc8`, after the client and Host module splits (#425, #428); item 12, done before them, keeps `03dd40a4`.
- Left as it is: the first capture's record.

## Checks

- `node scripts/verify-docs.mjs`: 4,899 local links and 368 Markdown anchors, the bilingual paths and the official plugin coverage verified.
- `pnpm exec vitest run tests/docs.spec.mjs tests/package-locales.spec.mjs tests/changesets.spec.mjs`: 3 files, 39 tests passed.
- `pnpm run release:intent` against `origin/main`: the changeset covers `dsh-mnemon`.
- No DeepSeek key, WebUI token or home-directory path in any changed file. Every image and recording was also scanned with `strings`.
