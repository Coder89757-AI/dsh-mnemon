# The v0.5.32 WebUI gallery, captured on DSH 0.2.1

[简体中文](./README.zh-CN.md)

Recorded on 2026-10-17 (Asia/Shanghai). The documentation's gallery, [webui-v0.5.19](../../assets/webui-v0.5.19/README.md), was captured on 2026-09-28 on DSH 0.1.7-rc.2, which dsh-mnemon no longer supports, and the screens around the plugin changed with DSH 0.2: the sidebar, the Plugins page and dsh-mnemon's page. This change captures the same flows again on DSH 0.2.1-rc.2 with the live DeepSeek model, as [webui-v0.5.32](../../assets/webui-v0.5.32/README.md), named after the release that will ship it, and points the current documentation at it. Release notes and PR records keep linking the v0.5.19 gallery, which stays as a dated record. No code changes; the changeset is for the two READMEs, which npm publishes with `dsh-mnemon`.

## What the gallery holds

- For each language, five recordings (recall, save, correct, memory, plugins) as MP4, four of them also as GIF, and 28 screens: 25 desktop and 3 phone. In all, 74 files and 23.8 MB, against v0.5.19's 68 files and 17.7 MB.
- The flows and screen names are v0.5.19's, so links only change their directory. Three screens are new: `chat-save-target`, the Save to menu; `plugins-list`, DSH's Plugins page, taken at 1280 × 858 so the page title and the dsh-mnemon row are both whole; and `memory-runtime-limits`, the top of the Runtime memory page with its size-against-limit cards, which the configuration reference now shows. That one was taken on a fresh fixture of the same build before any conversation, as the manifest marks it; the guides keep `memory-runtime`, opened from a turn. The save recording has a fourth segment, for the Save to menu.
- The [gallery README](../../assets/webui-v0.5.32/README.md#what-changed-since-v0519--与-v0519-相比的变化) lists what changed since v0.5.19, and its manifest records every file's viewport, size, duration and SHA-256 and what each turn read and wrote.

## How it was captured

- Revision `64933532`: this branch with `origin/main` at `1fd64eaf` merged, built with Node 24.19.0 and pnpm 10.13.1, served by the pinned DSH 0.2.1-rc.2, with Mnemon CLI 0.2.10 and headless Chrome 155 over the DevTools protocol at 1280 × 800 and 390 × 844, device scale factor 2, light. The branch has since merged `origin/main` at `03dd40a4` (#423), internal cleanups that change nothing users see.
- One pass per language over a fresh `node scripts/serve-e2e.mjs --docs-demo --live-model` (`--docs-demo=en` for English). The DeepSeek key reached that process only through its environment and appears in no file, log or image. No embedding service ran: the Mnemon Native embedding settings stay at their default, so dsh-mnemon supplies no override, Mnemon tries its own default endpoint and nothing answers. Each save to a Memory Space therefore reports that it has no vector; the gallery README says so.
- The tour scripts that drive the WebUI, record the screencast and assemble the gallery stay outside the repository, as for v0.5.19. Screens use v0.5.19's JPEG quality (the same quantization tables), MP4 CRF 27 and GIF 880 px at 8 fps with one 256-colour palette per GIF; the only path on screen is the fixture's temporary directory.

## Takes

Every reply, Save to memory candidate and receipt, and Agent answer was read, and frames from every recording were checked. The English take is the first pass. Chinese took seven passes on the same build with the same question. In the first five, Ask Agent got four of the five memories that mention ClickHouse, all at relevance 0.58, without the September 12 incident, so its answer said the evidence records no incident; on one of those fixtures, a direct search with that question afterwards returned a different four, and a second Ask Agent cited the incident, so which four a recall returns changes between calls. The sixth pass is kept, as the first whose Agent answer cites the incident (among four memories) with other turns as good as the first pass's. Its first answer read the two Project Documents without a Memory Spaces recall, so the Chinese recall recording and turn bar show documents only, and the Chinese alt text says so. The seventh pass also cited the incident and also read documents only in its first turn.

Trial passes before this revision found two faults in the recorder, both fixed in the tooling before these passes: a segment's still tail, such as the save receipt, was cut where segments join, and every MP4 ran 1.6 s past its last frame.

## Found while capturing

Three behaviors that change what users see join the [plan](../../plans/review-gaps-2026-10.md) as items 12 to 14 and the [roadmap](../../en/roadmap.md#next-gaps-from-the-october-2026-review) in both languages:

- with the embedding settings at their default and no embedding service, every save to a Memory Space ends with "embedding did not succeed", which reads as a failure on a default install;
- a replaced runtime memory entry shows its creation time, never its update time (`plugins/dsh-mnemon-source-runtime/src/client/pages.tsx:114` and `:131`);
- at 390 px the active Memory System tab can sit off-screen in English, and the turn memory bar's summary and a space card's counts are cut off.

The review of this change found four more in the recordings and screens, filed the same way as items 15 to 18 after checking each against the code:

- while a space's status is still being checked, its card on Memory Spaces' Overview reads 0 memories, 0 edges and 0 B (Chinese memory recording, 9.9 s);
- a page opened from a turn shows an empty canvas with only the Status tab until the Memory System's Source catalog answers, a frame or two here (Chinese recall recording at 10.0 s, English at 13.5 s);
- the graph draws at most 24 entities and its footer counts only those, so it reads 24 where the Entities page reads 26 once the saved memory adds entities; on the freshly seeded demo both read 22;
- in a dense graph, node labels overlap and run past the right edge ("Code re", "No production depl…" over "A PR needs at leas…").

Also seen, not filed: Ask Agent's changing evidence above; Mnemon CLI's automatic entities such as "2.4", "2.9", "SDK" and "Next" (from Next.js) in Entities and the graph; the task Agent keeping a superseded memory and linking the new one to it, by design (#148); and the model's reasoning line streaming in English for a moment during a Chinese reply.

## Documentation changed

- `README.md` and `README.zh-CN.md`: the recordings and the gallery link, the alt text of the save and plugins recordings and of the Chinese recall recording, and a sentence on the save receipt's vector line.
- `docs/assets/README.md`: the v0.5.32 row (56 screenshots), with v0.5.19 as a dated record.
- `docs/{en,zh-CN}`: `README.md`, `development/README.md`, the getting-started, memory-providers, operations and UI guides, and the compatibility and configuration references; the configuration reference shows `memory-runtime-limits`. The UI guide adds the two new screens, the correction's two writes, the receipt's vector line and the Plugins page by DSH version; the component list no longer carries v0.5.19's note on the group row. Checked on the hosts: DSH 0.2.1-rc.2 lists nine components and no group row, DSH 0.2.0-rc.2 also lists `dsh-mnemon/bundle`, Off.
- `docs/plans/review-gaps-2026-10.md` and `docs/{en,zh-CN}/roadmap.md`: items 12 to 18.

## After review

- The GIFs were encoded again from the same frames with one 256-colour palette per GIF, built from all of its frames, so the green tags, the red Uninstall button and the orange vector line keep their colour. The eight GIFs grew from 8.9 MB to 10.4 MB (17.8%); a palette per frame would have made them about 14 times larger.
- The Chinese `memory-graph` screen keeps a half-clipped row under the sticky tabs: that pass's fixture is gone, so a retake would mean a new pass.

## Checks

- `node scripts/verify-docs.mjs`: 4,792 local links and 364 Markdown anchors, the bilingual paths and the official plugin coverage verified.
- `pnpm exec vitest run tests/docs.spec.mjs tests/package-locales.spec.mjs tests/changesets.spec.mjs`: 3 files, 39 tests passed.
- `node scripts/verify-package-contents.mjs`: 65 files, 475,953 packed and 2,018,330 unpacked bytes.
- `pnpm run release:intent` against `origin/main`: the changeset covers `dsh-mnemon`.
- No DeepSeek key, WebUI token or home-directory path in any new file, including a `strings` scan of every image and recording.
