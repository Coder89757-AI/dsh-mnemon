# Skill management and self-evolution

## Aim

DSH loads skills — `SKILL.md` playbooks under `.dsh/skills`, `.agents/skills`, `~/.dsh/skills` and
`~/.agents/skills` — but gives the user no place to see them, switch them, edit them or learn from how
they are used. Skills should improve with use: after a conversation that earned it, a background
reviewer reads what happened and proposes a new skill or a fix to an existing one; the user approves,
and the skill is written.

This plan adds a **技能管理 (Skills)** tab to the Memory System, owned by a new Source,
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
| Gate | One switch per storage scope, off until the user turns it on |
| Trigger | After every turn: `min(⌊userChars/50⌋,3) + turns + min(⌊toolCalls/5⌋,2) + (unique≥3 ? min(unique−2,2) : 0)` — the post-turn score the idle memory review already uses (`src/host/review-activity.ts`); review at ≥5; skill reviews of one session at least 150 s apart; score reset after a review; paused after 3 consecutive failures |
| Reviewer | One tool-less structured run with the numbered trajectory, a list of *strong signals* and two three-question audits (one for an invoked skill → update, one for a new procedure → create) |
| Admission | Confidence < 0.6 dropped; a dismissal blocks the same skill+action from the same session for 24 h; one open suggestion per skill+action (higher confidence replaces); at most 5 pending per session; expiry 7 days; `update` records the `SKILL.md` SHA-256 and is invalidated when the file changes |
| Evolve | Draft → backtest → adopt, in the page; adopting writes the file under its hash fence |
| Log | One entry per review (`suggested`, `nothing`, `error`) and counters on the Overview |

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
   `disable-model-invocation`, "`/` menu" writes `user-invocable`; both keys stay in the file, so DSH,
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
   `must` checks twice. Runs execute in the background: the Source records `running` with progress,
   the page polls, and a run that outlives the Host shows as `interrupted`.

10. **Model work is Host assistance on the Source's own page.** `skill-draft`, `skill-backtest`,
    `skill-derive-cases` and `skill-review-now` are advertised as assistance for the default `skills`
    instance when a task Agent is available, like `supervise` for Memory Spaces. The Source never
    calls a model.

11. **The page re-reads the revision before it writes.** Background reviews and runs change the
    Source's revision at any time; every mutation the page makes carries an item-level precondition
    (a file hash, a suggestion or draft status), so the page fetches the current revision
    (`read revision`) immediately before each mutation instead of failing on unrelated background
    writes.

12. **Settings live with the data they govern.** `settings.json` in the ledger holds `enabled`
    (default **off**: turning it on is one switch on the Overview), the trigger threshold (5),
    cooldown (150 s), idle delay (20 s), minimum confidence (0.6), expiry (7 days), pending limit per
    session (5), auto-backtest (on), cases per run (8) and the root new skills are created in
    (`user-dsh`). They follow the storage scope like every other Source's data.

## Storage

Under the effective data directory, `skills/`:

| Path | Holds |
|---|---|
| `settings.json` | settings above |
| `ledger.json` | suggestions, drafts, review log, version index |
| `evals.json` | cases and backtest runs (results bounded: 2 000 characters of output per case) |
| `trajectories/<id>.json` | one captured, annotated window each |
| `versions/<skill-key>/<id>.md` | the content of each version |
| `trash/<timestamp>-<name>/` | deleted bundles and flat files |

All writes are atomic (temporary file + rename, mode 0600) under `withMemoryStorageLock`.

## Source protocol

Reads: `revision`, `overview`, `settings`, `catalog`, `skill {key}`, `versions {key}`,
`version {key, id}`, `suggestions {status?}`, `suggestion {id}`, `trajectories {filter?}`,
`trajectory {id}`, `cases {skill}`, `runs {skill}`, `run {id}`, `drafts {suggestionId? | skill}`,
`draft {id}`, `reviews {limit?}`, `evidence-pack {suggestionId | skill}` (what a draft prompt needs).

Mutations: `settings-update`, `skill-create`, `skill-save`, `skill-invocation`, `skill-delete`,
`version-restore`, `suggestion-dismiss`, `suggestion-status`, `trajectory-pin`, `trajectory-delete`,
`case-save`, `case-delete`, `cases-add`, `draft-record`, `draft-update`, `draft-adopt`,
`draft-discard`, `run-start`, `run-progress`, `run-finish`, `review-record`.

## Page

`技能管理` sits after Memory Spaces and has its own header and tabs:

- **Overview** — the evolution switch with one line on what it does, counts (skills, pending
  suggestions, drafts to review, evidence, cases, last review), a *needs you* list (suggestions,
  drafts, regressions) and the recent review log.
- **Skills** — searchable list grouped by root, each with its switches, pending-suggestion and pass-rate
  chips; detail with the rendered `SKILL.md`, edit, versions (with score per version and restore), its
  eval summary, and links to its suggestions and evidence. New skill and delete live here.
- **Evolution** — the suggestion inbox by status; a suggestion opens with its confidence, signals,
  rationale and cited steps; draft review shows the diff, the notes, the per-case backtest comparison
  and guidance for a redraft; adopt, redraft, discard, dismiss.
- **Evidence** — trajectories with their annotations: a step timeline where cited steps are marked by
  signal, filters by skill and signal, pin, delete, and *make test cases* from selected steps.
- **Evals** — per skill: cases (add, edit, switch off, delete, origin link), run backtest against the
  current version or a draft, run history with a score trend across versions, per-case verdicts with
  the judge's notes and the executor's output.

Copy follows the Memory System's rules: names, states and chips; a sentence only where an action
needs its reason. Switches apply at once; typed values wait for their Apply.

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
5. Client page (five tabs) — with jsdom tests over a real composition runner.
6. Verify: `pnpm verify`, then the WebUI fixture with a scripted model.
