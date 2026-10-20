# Skill management and self-evolution

## Aim

DSH loads skills — `SKILL.md` playbooks under `.dsh/skills`, `.agents/skills`, `~/.dsh/skills` and
`~/.agents/skills` — but gives the user no place to see them, switch them, edit them or learn from how
they are used. Skills should improve with use: after a conversation that earned it, a background
reviewer reads what happened and proposes a new skill or a fix to an existing one; the user approves,
and the skill is written.

This plan adds a **Skills** tab (技能管理 in the Chinese UI) to the Memory System, owned by a new Source,
`dsh-mnemon-source-skills`, and a Host workflow that runs that evolution loop on DSH's own skill
mechanism. Three properties shape it:

1. **The trajectory is the evidence.** Every reviewed window is captured deterministically as a
   numbered trajectory (user turns, tool calls with inputs, results and failures, skill loads), the
   reviewer must cite step numbers for every suggestion, and the annotated trajectory is kept as
   evidence the user can browse, pin, prune and turn into test cases. Nothing has to re-read the
   conversation later.
2. **Skills get an eval set.** Cases accumulate from use — the reviewer proposes them from the same
   trajectory, the user derives or writes more — and any version or draft can be backtested at any
   time. Every version carries its score, so evolution is measured, not assumed.
3. **Evolution is reviewed in place.** A task Agent drafts the new `SKILL.md` from the suggestion, its
   evidence and the failing cases; the draft is backtested against the current version (or against no
   skill, for a new one) and shown as a diff with the score difference. The user adopts it, edits it,
   or writes guidance and redrafts.

## The evolution loop

| Piece | Behaviour |
|---|---|
| Gate | One switch on Skills' page under Plugins, off until the user turns it on |
| Trigger | After every turn: `min(⌊userChars/50⌋,3) + turns + min(⌊toolCalls/5⌋,2) + (unique≥3 ? min(unique−2,2) : 0)` — the post-turn score the idle memory review already uses (`src/host/review-activity.ts`); review at ≥5; skill reviews of one session at least 150 s apart; score reset after a review; paused after 3 consecutive failures |
| Reviewer | One tool-less structured run with the numbered trajectory, a list of *strong signals* and two three-question audits (one for an invoked skill → update, one for a new procedure → create) |
| Admission | Confidence < 0.6 dropped; a dismissal blocks the same skill+action from the same session for 24 h; one open suggestion per skill+action (higher confidence replaces); at most 5 pending per session; expiry 7 days; `update` records the `SKILL.md` SHA-256 and is invalidated when the file changes |
| Evolve | Draft → backtest → adopt, in the page; adopting writes the file under its hash fence |
| Log | One entry per review (`suggested`, `nothing`, `error`), with the turn it followed; the conversation shows it under that turn |

dsh-mnemon already has the pieces the loop needs: the post-turn score, task Agents, structured
delegated runs, the Source management protocol and the Memory System workbench.

## Decisions

1. **A Source owns skills and their evolution data.** `dsh-mnemon-source-skills` (type `skills`, role
   `procedural`) is the authority for the skill files it can see and for its ledger: suggestions,
   trajectories, eval cases, backtest runs, drafts, versions, review log and settings. It exposes them
   only through `manage`. It contributes nothing to a model View: for every non-management scenario
   its facts report `unavailable` with reason `management-only`, so neither main Strategy admits it
   and no turn pays for it. DSH's own `skill` tool and catalog remain the only way skills reach the
   model.

2. **The catalog is read from the same roots DSH reads.** The Source scans `<project>/.dsh/skills`
   (rank 100), `<project>/.agents/skills` (200), `$DSH_HOME/skills` (400) and
   `$DSH_AGENTS_HOME/skills` (500) with `dsh-skill-filesystem`'s rules: a bundle `<name>/SKILL.md` or a
   flat `<name>.md`, one level deep, kebab-case `name`, required `description`, `.system` skipped under
   the DSH home, the project root being the nearest ancestor holding `.git`. A name that appears in
   more than one root is listed once per root; the lowest rank is marked as the one DSH loads.
   Plugin-provided and bundled skills are not files a user edits and are not listed.

3. **Switching a skill off uses DSH's own switches.** "Model can load it" writes
   `disable-model-invocation`, "`/` menu" writes `user-invocable` (the page offers them as one choice);
   both keys stay in the file, so DSH,
   the editor and Git all agree on what is on. Deleting moves the bundle or file into the ledger's
   trash; it is never unlinked.

4. **Every write is fenced by the file's hash and leaves a version.** Saving, toggling, adopting a
   draft and restoring all take the `SKILL.md` SHA-256 the page last read, refuse on mismatch, and
   record the content that results — and, on the first write the Source makes to a skill, the content
   that was there before — as a version. A version carries its reason (`original`, `edit`,
   `evolution`, `restore`, `invocation`) and links to the suggestion and draft that produced it.

5. **Trajectories are captured by the Host, deterministically, as turns end.** On `turn/end` of a root
   conversation Agent the Host reads that turn's events and appends numbered steps to the session's
   window: user text (only `source.kind = user`), skill loads (`skill` tool calls and
   `skill-invocation` messages), tool calls with a bounded input excerpt and their result or error,
   and the assistant's text. No model is involved. The window also accumulates the post-turn score.
   Steps are bounded (600 characters each, 160 per window); secrets are redacted with the same
   patterns the Host uses for failures.

6. **The review runs on the post-turn schedule under a task Agent.** When the window's score reaches the
   threshold, evolution is on for the conversation's storage scope, and the last skill review of this
   session was at least the cooldown ago, the Host waits for the conversation to sit idle (20 s by
   default; a new turn postpones it) and runs one structured, tool-less delegated run under a fresh
   task Agent. It is not a child of the conversation, so a new turn does not abort it and it never
   sees conversation tools. The prompt carries the numbered trajectory, the current `SKILL.md` of each
   skill loaded in the window, the visible catalog (names and descriptions) and the titles of the
   existing cases for those skills; the persona carries the strong signals and both audits.
   The answer is `{ outcome, summary, annotations[], suggestions[], cases[] }`; every suggestion and
   case cites step numbers that exist in the window, or it is dropped. Success resets the window;
   failure keeps it, applies the cooldown, and three failures in a row pause the session.

7. **Admission is bounded, then keeps what the evidence needs.** The Source applies the rules in
   the table above (thresholds configurable), stores the window as a trajectory when the review
   produced anything or when it is the most recent of its session, attaches the annotations, links
   each suggestion to its steps, and adds proposed cases to the skill's eval set unless an existing
   case already covers them (character-bigram similarity ≥ 0.8 on title + prompt). Trajectories keep
   at most 100, unpinned and unreferenced ones evicted first; the review log keeps 200 entries.

8. **Evolving is draft → backtest → adopt.** `Generate draft` runs a tool-less task Agent with the
   suggestion, the cited steps (with their annotations), the current `SKILL.md`, the skill's enabled
   cases with the latest failures, and the user's guidance; it answers `{ content, notes, changes[] }`.
   The Source validates the frontmatter (name equals the skill, description present, size ≤ 64 KiB)
   and stores the draft. If the skill has cases and auto-backtest is on, the Host backtests the draft
   and, unless a run for the current hash exists, the baseline (current version, or no skill for a
   `create`). `Adopt` writes the file under the hash fence, records an `evolution` version, marks the
   suggestion `adopted` and the draft `adopted`. `Redraft` keeps the guidance history. A suggestion
   whose `update` hash no longer matches becomes `invalidated` before a draft is made.

9. **A backtest is a simulation and says so.** For each enabled case (at most 8 per run by default) an
   executor run receives the version under test and the case prompt and returns the steps it would
   take and the answer it would give — it has no tools, so a backtest never touches the user's files
   or services. A separate judge run receives the case, its checks and the executor's output (not the
   skill) and grades each check. A case passes when every `must` check passes; its score weighs
   `must` checks twice. A case whose executor or judge run fails (an output limit, no recorded
   result) gets one more try; if it still cannot run it is recorded as an error and left out of the
   run's score, and a draft is compared with its baseline only on the cases both runs graded, so a
   failed run never reads as a worse skill. Runs execute in the background: the Source records
   `running` with progress, the page polls, and a run that outlives the Host shows as `interrupted`.

10. **Model work is Host assistance on the Source's own page.** `skill-draft`, `skill-backtest`,
    `skill-derive-cases` and `skill-review-now` are advertised as assistance for the default `skills`
    instance when a task Agent is available, like `supervise` for Memory Spaces. The Source never
    calls a model.

11. **The page re-reads the revision before it writes.** Background reviews and runs change the
    Source's revision at any time; every mutation the page makes carries an item-level precondition
    (a file hash, a suggestion or draft status), so the page fetches the current revision
    (`read revision`) immediately before each mutation instead of failing on unrelated background
    writes.

12. **Settings are dsh-mnemon's, on the component's page under Plugins.** They form one group of
    the dsh-mnemon entry, `skills` (wire namespace `mnemon-skills`), declared live so a change applies
    without rebuilding the memory runtime: `evolution` (default **off**), `autoBacktest` (on), `hints`
    (on), `sidebar` (off), and the review parameters — trigger threshold (5), idle delay (20 s), cooldown
    (150 s), minimum confidence (0.6), expiry (7 days), pending limit per session (5), cases per run (8).
    dsh-mnemon draws them on Skills' page under Plugins, as it draws the Layered strategy's: switches
    apply at once, the review parameters sit in a folded group with their own Apply. The Host reads them
    for scheduling and passes the admission parameters with each `review-record`, so the Source holds
    data only. The Skills page carries no settings; where evolution is off it says so and offers to
    turn it on.

## Storage

Under the effective data directory, `skills/`:

| Path | Holds |
|---|---|
| `ledger.json` | suggestions, drafts, review log, version index |
| `evals.json` | cases and backtest runs (results bounded: 2 000 characters of output per case) |
| `trajectories/<id>.json` | one captured, annotated window each |
| `versions/<skill-key>/<id>.md` | the content of each version |
| `trash/<timestamp>-<name>/` | deleted bundles and flat files |

All writes are atomic (temporary file + rename, mode 0600) under `withMemoryStorageLock`.

## Source protocol

Reads: `revision`, `overview`, `catalog`, `skill {key}`, `versions {key}`,
`version {key, id}`, `suggestions {status?}`, `suggestion {id}`, `trajectories {filter?}`,
`trajectory {id}`, `cases {skill}`, `runs {skill}`, `run {id}`, `drafts {suggestionId? | skill}`,
`draft {id}`, `reviews {sessionId?, limit?}`, `evidence-pack {suggestionId | skill}` (what a draft prompt needs).

Mutations: `skill-create`, `skill-save`, `skill-invocation`, `skill-delete`,
`version-restore`, `suggestion-dismiss`, `suggestion-status`, `trajectory-pin`, `trajectory-delete`,
`case-save`, `case-delete`, `cases-add`, `draft-record`, `draft-update`, `draft-adopt`,
`draft-discard`, `run-start`, `run-progress`, `run-finish`, `review-record`.

## Page

**Skills** sits after Memory Spaces. It has four tabs, each with its own toolbar, and no settings,
explanations or dashboards of its own: what needs the user shows as a count on its tab.

- **Skills** — a searchable list grouped by root with **New** beside the search; each row has
  its icon, **Use** on hover and a switch, and a dot when an improvement waits for it. The detail shows
  the rendered `SKILL.md` with **Use**, **Edit** and a menu (draft an improvement, delete); a waiting
  improvement shows as one line linking to it. Invocation is one choice (both, `/` only, model only).
  Versions and bundled files are folded sections, closed by default; *Tests* is one row with the case
  count and last score that leads to the skill under **Evals**.
- **Evolution** — an inbox filtered as *pending* and *done*. A suggestion shows what it
  proposes and why, with **Draft** and **Dismiss**; its evidence (the cited steps of the conversation)
  is folded. Once drafted, the same view reviews the draft: what changed, the backtest as one line
  (current → draft) that unfolds to per-case results, the diff, and **Adopt**, **Discard** and
  *redraft with a note*. Where evolution is off the inbox says so with one button. Its third view,
  *evidence*, lists the conversations reviews read, narrowed by the skills they used, each with its
  timeline, pin, delete and *make test cases*; every suggestion's evidence and every case's origin
  links there.
- **Evals** — every skill's tests: the skills with cases first, each with its last score
  against the loaded version, then the rest, and skills a suggestion proposes that do not exist yet.
  The chosen skill shows its cases (each with a switch) and its backtests, newest first, each opening
  to its per-case verdicts.
- **Market** — search, category, sources and refresh in the toolbar; cards open a preview
  that installs.

Evidence is not a tab of its own: it exists only once self-evolution has run and is read from the
suggestions it explains, so it stays with them. Tests are: any skill can have them, with or without
self-evolution, and checking coverage and scores across skills is its own task.

In its own sidebar entry the page is the whole view: the workbench header carries its title, refresh
and a gear that opens its settings, and the Memory System lists it no more.

Copy follows the Memory System's rules: names, states and chips; a sentence only where an action
needs its reason.

## In the conversation

Like the turn's memory bar, a one-line *Turn skills* bar sits under a finished turn when there is
something to say: the skills the turn used (each opens it on the Skills tab), *Reviewing* while a review of
the window that ended with this turn is waiting or running, and *suggested N* once it produced
suggestions (one opens that suggestion, several open the inbox). It reads one Host snapshot per
conversation — the skills each turn used, from the session's own events, and each review with the turn
it followed — and polls only while a review is pending. The `hints` setting removes it.

## Its own sidebar entry

With `sidebar` on, Skills is a DSH sidebar panel of its own, after the Memory System, with DSH's skill
icon. The panel is the Memory System workbench focused on the Skills Source: its header is the page's
title, refresh and settings, and links that open a skills page — from the conversation, the Status
card, anywhere — open this panel instead. Turning it off returns the page to the Memory System.

## Using and switching a skill

A row in **Skills** is an icon, the name and one line of description, a **Use** button that appears on
hover or focus, and a switch.

- The switch turns the whole skill on or off: off writes both `disable-model-invocation: true` and
  `user-invocable: false`, on removes both. The detail view offers the two keys as one choice — both,
  `/` only, model only — and a row shows a chip when only one of them is off.
- **Use** returns to the conversation with `/name ` at the start of its input, where DSH's own `/`
  gesture loads the skill when the message is sent. The page and the composer meet through one
  window event: the skills client registers an invisible member of the composer's
  `conversation.input.left` row, which takes the request for its own session; a request made before
  the conversation is on screen waits ten seconds for its composer to mount. The Memory System page
  gains an optional `onReturnToConversation()` prop for this — the header's back action.

## Market

The market reads skills from **sources**, each one way skills are already published; JSON is only one of them.

| Kind | Added as | What it lists |
| --- | --- | --- |
| Featured (built-in catalog) | — | Our curated list in both languages (`market/official.json`, refreshed from the repository's main branch); each entry installs from its upstream repository under the upstream license. It can be switched off, not removed. |
| skills.sh (built-in search) | — | Nothing up front: as the user types two or more characters, the open index the `skills` CLI uses is searched (hundreds of thousands of skills, by installs). It can be switched off. |
| GitHub repository | `owner/repo`, a github.com URL (a folder too), a skills.sh page of one, or a plugin marketplace's `marketplace.json` | Every `SKILL.md` in the repository: one API call for its tree, each `SKILL.md` read raw for its name and description; dependencies, build output and test fixtures are skipped. A Claude Code plugin marketplace lends the list its name. |
| Website | a host or URL | The site's Agent Skills discovery index (`/.well-known/agent-skills/index.json`, schema 0.2.0, path-scoped first, then the root; the older `/.well-known/skills/` form too). Each artifact is a `SKILL.md` or a `.tar.gz`/`.zip`, checked against its SHA-256 digest before use. |
| Catalog | a JSON URL or absolute path | This market's own format (below), for a team's curated list. |

The add field says what it read before anything is fetched (`GitHub repo · owner/repo`, `Website · host`, `JSON file`); pasting the same into the market's search box offers to add it in one click. A JSON file is read by its shape: a catalog, a discovery index, or a plugin marketplace (read as its repository).

A catalog is one JSON file anyone can host:

```json
{
  "version": 1,
  "id": "team",
  "name": { "en": "Team skills", "zh-CN": "团队技能" },
  "categories": [{ "id": "docs-writing", "label": { "en": "Writing", "zh-CN": "文档写作" } }],
  "skills": [{
    "name": "release-notes",
    "title": { "en": "Release notes" },
    "description": { "en": "…", "zh-CN": "…" },
    "category": "docs-writing", "author": "…", "license": "MIT", "version": "1.0.0",
    "source": { "type": "github", "repo": "org/repo", "path": "skills/release-notes", "ref": "main" }
  }]
}
```

A catalog source is a GitHub folder, a URL to one `SKILL.md`, or a folder relative to a local catalog file.

- **Search results** show the skill's name, its repository and its install count. The preview reads the
  skill from its repository (or skills.sh's text copy while GitHub declines, saying so), with the
  reviews skills.sh publishes (Snyk, Socket and others: pass, warning or fail, worst first). Install
  always fetches the complete folder from the repository, under the name its own `SKILL.md` gives;
  a skill installed from the featured catalog out of the same repository counts as installed.
- **Requests** are bounded: GitHub's unauthenticated limit (60 an hour) is spent once per repository
  per ten minutes, and `GITHUB_TOKEN` or `GH_TOKEN` is used when set; a refusal says so instead of
  failing quietly. Sources older than six hours refresh when the market opens; a failed refresh keeps
  the copy it had and says why.
- **Install** previews the `SKILL.md` and file list first and says plainly that an Agent follows a
  skill as written. Files are fetched outside the storage lock, bounded (300 files, 12 MiB; archives
  refuse links, paths outside the skill and decompression past the limit), staged, checked against
  DSH's rules (the `SKILL.md` must name the skill), then moved into the chosen root. The install is
  recorded with the hash it wrote and leaves an `install` version.
- **State** per entry: available, installed, update (the source's version moved), edited locally
  (the hash moved; updating replaces the edits only after confirmation, the old folder going to the
  trash), or a name already taken by a skill that did not come from this entry.
- **Sources** are managed in one panel: each with its kind, skill count and freshness or its error, a
  switch, and refresh or remove in its menu; the built-in ones can be switched off, not removed.

## Out of scope

- Executing tools during a backtest. Running a skill for real is a conversation, not a test.
- Editing plugin-provided or bundled skills, or skills outside the four roots.
- A model-facing `skill_manage` tool. DSH's own file tools already write skills, and the catalog
  watcher picks the change up.
- Syncing the skills ledger through Git sync or Packs.

## Build order

1. Plugin skeleton, contracts, frontmatter, catalog discovery, store, Source `manage` — with tests.
2. Admission policy and `review-record`, eval cases, runs, drafts, versions — with tests.
3. Host: trajectory capture and score, scheduler, review prompt/parse, task-Agent runs, assistance for
   draft, backtest, derive and review-now — with tests over fake agents.
4. Starter wiring (patch row, dependency, rows, counts, docs, changesets).
5. Client page — with jsdom tests over a real composition runner; then the settings on the component
   page, the conversation bar and the sidebar entry in dsh-mnemon's client.
6. Verify: `pnpm verify`, then the WebUI fixture with a scripted model.
