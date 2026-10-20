import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryCompositionRunner } from 'dsh-mnemon/testing'
import * as skillsPlugin from 'dsh-mnemon-source-skills'
import * as generalStrategy from 'dsh-mnemon-strategy-general'
import type { BacktestRun, SkillDraft, SkillSuggestion, Trajectory } from 'dsh-mnemon-source-skills/contracts'
import type { HostAgent, HostAgentContext, HostSessionEvent } from '../src/host/dsh.ts'
import { DEFAULT_SKILLS_CONFIG, type ResolvedSkillsConfig } from '../src/host/protocol.ts'
import { SkillEvolution, type SkillsSourcePort } from '../src/host/skill-evolution.ts'
import { gradeCase, parseSkillDraft, parseSkillReview, renderSteps } from '../src/host/skill-review.ts'
import { captureTurn, redact, sessionTitle, TrajectoryWindow, turnSkillUses } from '../src/host/skill-trajectory.ts'
import { sessionLog } from './fixtures/session-log.ts'

type Listener = (...args: never[]) => unknown

function turn(events: HostSessionEvent[], number: number, user: string, tools: Array<{ name: string; args: unknown; error?: string; output?: string }> = [], answer = 'Done.'): void {
  const push = (type: string, data: Record<string, unknown>) => events.push({ type, seq: events.length, time: Date.UTC(2026, 9, 21, 8, number), data })
  push('turn/start', { turn: number })
  push('user/message', { id: `u${number}`, role: 'user', content: [{ type: 'text', text: user }], source: { kind: 'user' } })
  push('user/message', { id: `m${number}`, role: 'user', content: [{ type: 'text', text: '[MNEMON] reminder' }], source: { kind: 'plugin:dsh-mnemon' } })
  tools.forEach((tool, index) => {
    const callId = `c${number}-${index}`
    push('tool/call', { turn: number, step: 1, callId, name: tool.name, arguments: JSON.stringify(tool.args) })
    push('tool/result', {
      turn: number, step: 1,
      message: { role: 'tool', toolCallId: callId, source: { kind: 'tool', callId }, content: [{ type: 'text', text: tool.output ?? tool.error ?? 'ok' }], ...(tool.error === undefined ? {} : { isError: true }) },
      ...(tool.error === undefined ? {} : { error: { name: 'Error', code: 'failed', reason: tool.error } }),
    })
  })
  push('assistant/message', { turn: number, step: 2, message: { id: `a${number}`, content: [{ type: 'text', text: answer }] } })
  push('turn/end', { turn: number, reason: { kind: 'completed' } })
}

describe('trajectory capture', () => {
  it('numbers user turns, skill loads, tool results and failures, and drops plugin messages', () => {
    const events: HostSessionEvent[] = []
    turn(events, 1, 'Write the release notes', [
      { name: 'skill', args: { name: 'release-notes' }, output: '<skill_content name="release-notes">…' },
      { name: 'bash', args: { command: 'git log --oneline', token: 'secret' }, error: 'fatal: not a git repository' },
      { name: 'bash', args: { command: 'cat CHANGELOG.md' }, output: '## 2.0' },
    ])
    events.push({ type: 'session/title', seq: events.length, data: { title: 'Release v2 notes' } })
    turn(events, 2, 'No — group them by component from now on. api_key=sk-abcdefghijklmnop')
    const first = captureTurn(events, 1)!
    expect(first).toMatchObject({ turn: 1, userCharacters: 23, toolCalls: 3, toolFailures: 1, toolNames: ['skill', 'bash'], skills: ['release-notes'], reason: 'completed' })
    expect(first.steps.map(step => step.kind)).toEqual(['user', 'skill', 'tool', 'tool', 'assistant'])
    expect(first.steps[2]).toMatchObject({ tool: { name: 'bash', ok: false, input: 'command=git log --oneline token=***', error: 'fatal: not a git repository' } })
    expect(sessionTitle(events)).toBe('Release v2 notes')
    const window = new TrajectoryWindow()
    window.add(first, new Date())
    window.add(captureTurn(events, 2)!, new Date())
    window.add(captureTurn(events, 2)!, new Date())
    expect(window.size).toBe(2)
    expect(window.score()).toMatchObject({ turnScore: 2, eligible: false })
    const steps = window.steps()
    expect(steps.map(step => step.index)).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(steps[5]!.text).toBe('No — group them by component from now on. api_key=***')
    expect(renderSteps(steps.slice(1, 3))).toBe('[2] turn 1 · skill loaded: release-notes (by the model)\n[3] turn 1 · tool bash (command=git log --oneline token=***) FAILED: fatal: not a git repository')
    expect(redact('Bearer abc.def and sk-1234567890abcdef')).toBe('Bearer *** and sk-1234***')
  })

  it('lists the skills each turn used: a / command, and the skill loads that succeeded, each once', () => {
    const events: HostSessionEvent[] = []
    turn(events, 1, 'Write the release notes', [
      { name: 'skill', args: { name: 'release-notes' } },
      { name: 'skill', args: { name: 'release-notes' } },
      { name: 'skill', args: { name: 'pdf' }, error: 'unknown skill' },
    ])
    const push = (type: string, data: Record<string, unknown>) => events.push({ type, seq: events.length, data })
    push('turn/start', { turn: 2 })
    push('user/message', { id: 'u2', role: 'user', content: [{ type: 'text', text: 'weekly' }], source: { kind: 'skill-invocation', name: 'weekly-report' } })
    push('turn/end', { turn: 2, reason: { kind: 'completed' } })
    turn(events, 3, 'Thanks')
    expect(turnSkillUses(events)).toEqual([
      { turn: 1, skills: [{ name: 'release-notes', by: 'model' }] },
      { turn: 2, skills: [{ name: 'weekly-report', by: 'user' }] },
    ])
  })
})

describe('skill model answers', () => {
  it('parses a review leniently and drops what cannot be used', () => {
    expect(parseSkillReview({
      outcome: 'suggest', summary: ' Grouping was corrected. ',
      annotations: [{ step: 4, signal: 'correction', note: 'x' }, { step: 'x', signal: 'correction', note: 'bad' }, { step: 2, signal: 'nope', note: 'bad' }],
      suggestions: [{ skillName: 'release-notes', action: 'update', summary: 'Group', confidence: '0.8', signals: ['correction', 'bogus'], steps: [4, 'x'] }, { skillName: '', summary: 'x' }],
      cases: [{ skillName: 'release-notes', title: 'T', prompt: 'P', checks: [{ text: 'grouped', must: true }, { text: '' }], steps: [4] }, { title: 'no checks', prompt: 'p', checks: [] }],
    })).toEqual({
      outcome: 'suggest', summary: 'Grouping was corrected.',
      annotations: [{ step: 4, signal: 'correction', note: 'x' }],
      suggestions: [{ skillName: 'release-notes', action: 'update', summary: 'Group', confidence: 0.8, signals: ['correction'], steps: [4] }],
      cases: [{ skillName: 'release-notes', title: 'T', prompt: 'P', checks: [{ text: 'grouped', must: true }], steps: [4] }],
    })
    expect(parseSkillDraft({ content: '```markdown\n---\nname: a\n---\nbody\n```', notes: 'n', changes: ['c'] })).toEqual({ content: '---\nname: a\n---\nbody\n', notes: 'n', changes: ['c'] })
    expect(() => parseSkillDraft({ content: '  ' })).toThrow('no SKILL.md')
  })

  it('passes a case only when every must check passes, weighing must checks twice', () => {
    const entry = { id: 'c', skillName: 's', title: 't', prompt: 'p', checks: [{ id: 'a', text: 'A', must: true }, { id: 'b', text: 'B', must: false }], origin: { kind: 'manual' as const }, enabled: true, createdAt: '', updatedAt: '' }
    expect(gradeCase(entry, { checks: [{ index: 1, pass: true, note: 'ok' }, { index: 2, pass: false, note: 'no' }], summary: 's' })).toMatchObject({ verdict: 'pass', score: 2 / 3 })
    expect(gradeCase(entry, { checks: [{ index: 2, pass: true, note: 'ok' }] })).toMatchObject({ verdict: 'fail', score: 1 / 3, checks: [{ checkId: 'a', pass: false, note: 'not graded' }, { checkId: 'b', pass: true }] })
  })
})

describe('skill evolution in the Host', () => {
  let directory: string
  let runner: MemoryCompositionRunner
  let source: SkillsSourcePort
  let events: HostSessionEvent[]
  let agent: HostAgent
  let listeners: Map<string, Listener>
  let config: ResolvedSkillsConfig

  beforeEach(async () => {
    vi.useFakeTimers()
    config = { ...DEFAULT_SKILLS_CONFIG }
    directory = mkdtempSync(join(tmpdir(), 'mnemon-skill-evolution-'))
    mkdirSync(join(directory, 'dsh', 'skills', 'release-notes'), { recursive: true })
    mkdirSync(join(directory, 'workspace'))
    writeFileSync(join(directory, 'dsh', 'skills', 'release-notes', 'SKILL.md'), '---\nname: release-notes\ndescription: Write release notes from a changelog.\n---\n\n1. Read CHANGELOG.md\n')
    runner = new MemoryCompositionRunner()
    await runner.mount(generalStrategy, { instanceId: 'general' })
    await runner.mount(skillsPlugin, { instanceId: 'skills', config: { dataDir: join(directory, 'data'), dshHome: join(directory, 'dsh'), agentsHome: join(directory, 'agents') } })
    const scope = { storage: 'custom' as const, workspaceId: join(directory, 'workspace') }
    const base = { sourceInstanceKey: 'source:skills', scope }
    source = {
      read: async (operation, input = null) => (await runner.executeManagement({ ...base, mode: 'read', operation, input: input as never, confirmed: false })).value as never,
      mutate: async (operation, input) => {
        const { revision } = await runner.executeManagement({ ...base, mode: 'read', operation: 'revision', input: null, confirmed: false })
        return (await runner.executeManagement({ ...base, mode: 'mutate', operation, input: JSON.parse(JSON.stringify(input)), confirmed: true, expectedRevision: revision })).value as never
      },
    }
    events = []
    listeners = new Map()
    const ctx = {
      on: (name: string, listener: Listener) => { listeners.set(name, listener); return () => listeners.delete(name) },
      effect: () => () => undefined,
    } as unknown as HostAgentContext
    agent = { id: 'session-1', status: 'idle', session: { header: { cwd: join(directory, 'workspace') }, ...sessionLog(events) }, ctx, followup: vi.fn(), steer: vi.fn(), inject: vi.fn() }
  })

  afterEach(async () => {
    vi.useRealTimers()
    await runner.dispose()
    rmSync(directory, { recursive: true, force: true })
  })

  function evolution(answers: Array<(label: string, prompt: string) => unknown>) {
    const skillTask = vi.fn(async (_parent: HostAgent, label: string, prompt: string) => {
      const next = answers.shift()
      if (next === undefined) throw new Error('unexpected model call: ' + label)
      const value = next(label, prompt)
      if (value instanceof Error) throw value
      return { structured: value }
    })
    const runTask = vi.fn(async (_root: string | undefined, _signal: AbortSignal, operation: (task: HostAgent) => Promise<unknown>) => operation(agent))
    const host = { settings: () => config, source: () => source, runTask: runTask as never, skillTask, warn: vi.fn() }
    return { skills: new SkillEvolution(host), skillTask, runTask, host }
  }

  async function endTurn(number: number, text: string, tools: Parameters<typeof turn>[3] = []): Promise<void> {
    turn(events, number, text, tools)
    listeners.get('session/event')!(agent.session as never, events.at(-1) as never)
    await vi.advanceTimersByTimeAsync(0)
  }

  it('stays out of the way until evolution is turned on', async () => {
    const { skills, skillTask } = evolution([])
    const stop = skills.watch(agent)
    await endTurn(1, 'x'.repeat(400), [{ name: 'bash', args: {} }])
    await vi.advanceTimersByTimeAsync(60_000)
    expect(skillTask).not.toHaveBeenCalled()
    expect(skills.pending('session-1')).toBeUndefined()
    stop()
  })

  it('reviews an idle window that reached the score, records evidence and starts a new window', async () => {
    config = { ...config, evolution: true, idleSeconds: 20 }
    let prompt = ''
    const { skills, skillTask } = evolution([(_label, text) => {
      prompt = text
      return {
        outcome: 'suggest', summary: 'The user corrected the grouping.',
        annotations: [{ step: 6, signal: 'correction', note: 'Wanted grouping by component' }],
        suggestions: [{ skillName: 'release-notes', action: 'update', summary: 'Group entries by component', rationale: 'Corrected twice', confidence: 0.85, signals: ['correction'], steps: [3, 6] }],
        cases: [{ skillName: 'release-notes', title: 'Grouped notes', prompt: 'Write v2 release notes', checks: [{ text: 'Grouped by component', must: true }], steps: [1, 6] }],
      }
    }])
    skills.watch(agent)
    await endTurn(1, 'Write the release notes for v2 from the changelog in this repository, please.', [
      { name: 'skill', args: { name: 'release-notes' } }, { name: 'bash', args: { command: 'git log' }, error: 'not a git repository' }, { name: 'read', args: { path: 'CHANGELOG.md' } },
    ])
    expect(skills.pending('session-1')).toEqual({ turns: 1, score: 3 })
    await endTurn(2, 'No, group them by component from now on, and put breaking changes first in every section.')
    expect(skills.pending('session-1')!.score).toBeGreaterThanOrEqual(5)
    // A new turn before the pause postpones the review.
    await listeners.get('agent/pre-step')!({ step: 1, signal: new AbortController().signal } as never, (async () => ({ kind: 'enter', messages: [] })) as never)
    await vi.advanceTimersByTimeAsync(30_000)
    expect(skillTask).not.toHaveBeenCalled()
    await endTurn(3, 'Thanks, that is right.')
    await vi.advanceTimersByTimeAsync(20_000)
    expect(skillTask).toHaveBeenCalledTimes(1)
    expect(prompt).toContain('[2] turn 1 · skill loaded: release-notes (by the model)')
    expect(prompt).toContain('=== release-notes (user-dsh:')
    const [suggestion] = await source.read<SkillSuggestion[]>('suggestions')
    expect(suggestion).toMatchObject({ skillName: 'release-notes', action: 'update', status: 'pending', sourceSessionId: 'session-1', signals: ['correction'] })
    const trajectory = await source.read<Trajectory>('trajectory', { id: suggestion!.evidence[0]!.trajectoryId })
    expect(trajectory).toMatchObject({ outcome: 'suggested', stats: { turns: 3, toolFailures: 1, skills: ['release-notes'] }, reviewSummary: 'The user corrected the grouping.' })
    expect(trajectory.annotations).toEqual([{ step: 6, signal: 'correction', note: 'Wanted grouping by component', suggestionIds: [suggestion!.id] }])
    expect(await source.read('cases', { skill: 'release-notes' })).toMatchObject([{ title: 'Grouped notes', origin: { kind: 'review' } }])
    expect(skills.pending('session-1')).toEqual({ turns: 0, score: 0 })
  })

  it('tells the conversation which skills each turn used and how its review went', async () => {
    config = { ...config, evolution: true, idleSeconds: 20 }
    const { skills } = evolution([() => ({
      outcome: 'suggest', summary: 'The user corrected the grouping.',
      suggestions: [{ skillName: 'release-notes', action: 'update', summary: 'Group entries by component', confidence: 0.85, signals: ['correction'], steps: [3, 6] }],
    })])
    skills.watch(agent)
    await endTurn(1, 'Write the release notes for v2 from the changelog in this repository, please.', [
      { name: 'skill', args: { name: 'release-notes' } }, { name: 'bash', args: { command: 'git log' }, error: 'not a git repository' }, { name: 'read', args: { path: 'CHANGELOG.md' } },
    ])
    await endTurn(2, 'No, group them by component from now on, and put breaking changes first in every section.')
    expect(await skills.activity(agent)).toEqual({
      available: true,
      turns: [{ turn: 1, skills: [{ name: 'release-notes', by: 'model' }] }],
      reviews: [{ turn: 2, state: 'scheduled', suggestions: [] }],
    })
    await vi.advanceTimersByTimeAsync(20_000)
    const [suggestion] = await source.read<SkillSuggestion[]>('suggestions')
    expect((await skills.activity(agent)).reviews).toEqual([{ turn: 2, state: 'suggested', suggestions: [{ id: suggestion!.id, skillName: 'release-notes', action: 'update', status: 'pending' }] }])
    // A handled suggestion leaves the line; the review stays.
    await source.mutate('suggestion-dismiss', { id: suggestion!.id })
    expect((await skills.activity(agent)).reviews).toEqual([{ turn: 2, state: 'suggested', suggestions: [] }])
    // Turning self-evolution off stops what is scheduled next.
    config = { ...config, evolution: false }
    await endTurn(3, 'Now do the same for the v3 changelog, grouped by component with breaking changes first.', [{ name: 'skill', args: { name: 'release-notes' } }])
    expect((await skills.activity(agent)).reviews.map(review => review.state)).toEqual(['suggested'])
  })

  it('logs a failed review, keeps its window and pauses the session after three failures', async () => {
    config = { ...config, evolution: true, idleSeconds: 1, cooldownSeconds: 0, reviewThreshold: 1 }
    const { skills, skillTask, host } = evolution([() => new Error('model unavailable'), () => new Error('model unavailable'), () => new Error('model unavailable')])
    skills.watch(agent)
    for (let index = 1; index <= 4; index++) {
      await endTurn(index, `Turn ${index}`)
      await vi.advanceTimersByTimeAsync(2_000)
    }
    expect(skillTask).toHaveBeenCalledTimes(3)
    expect(host.warn).toHaveBeenCalledWith('skill review failed', expect.any(Error))
    const reviews = await source.read<Array<{ outcome: string; error?: string }>>('reviews')
    expect(reviews.map(review => review.outcome)).toEqual(['error', 'error', 'error'])
    expect(reviews[0]!.error).toBe('model unavailable')
    expect(skills.pending('session-1')!.turns).toBe(3)
  })

  it('drafts in the background, backtests draft and baseline, and adopts through the Source', async () => {
    config = { ...config, evolution: true }
    await source.mutate('case-save', { case: { skillName: 'release-notes', title: 'Grouped notes', prompt: 'Write v2 notes', checks: [{ text: 'Grouped by component', must: true }] } })
    const next = '---\nname: release-notes\ndescription: Write release notes grouped by component.\n---\n\n1. Read CHANGELOG.md\n2. Group by component\n'
    // Two runs share the model at once, so answer by what each call asks rather than by order.
    const drafts = [
      () => ({ content: '# missing frontmatter', notes: 'x', changes: [] }),
      (prompt: string) => { expect(prompt).toContain('Your previous SKILL.md was rejected'); return { content: next, notes: '按组件分组。', changes: ['Group by component'] } },
    ]
    const { skills, host } = evolution([])
    host.skillTask.mockImplementation(async (_parent: HostAgent, label: string, prompt: string) => {
      if (label === 'Mnemon skill draft') return { structured: drafts.shift()!(prompt) }
      if (label.startsWith('Mnemon skill eval')) return { structured: prompt.includes('Group by component') ? { steps: ['read changelog', 'group'], answer: '## API\n- x' } : { steps: ['read changelog'], answer: '- x' } }
      const pass = prompt.includes('## API')
      return { structured: { checks: [{ index: 1, pass, note: pass ? 'grouped' : 'flat list' }], summary: pass ? 'good' : 'flat' } }
    })
    const started = await skills.draft(source, join(directory, 'workspace'), { skill: 'release-notes', guidance: 'Group by component' })
    expect(started).toEqual({ started: true })
    await vi.runAllTimersAsync()
    await vi.waitFor(async () => {
      const runs = await source.read<BacktestRun[]>('runs', { skill: 'release-notes' })
      expect(runs.map(run => run.status)).toEqual(["completed", "completed"])
    })
    const [draft] = await source.read<SkillDraft[]>('drafts', { skill: 'release-notes' })
    expect(draft).toMatchObject({ status: 'ready', action: 'update', notes: '按组件分组。', guidance: ['Group by component'] })
    const view = await source.read<{ runs: BacktestRun[] }>('draft', { id: draft!.id })
    expect(view.runs.map(run => [run.target.kind, run.passRate])).toEqual([['draft', 1], ['current', 0]])
    await source.mutate('draft-adopt', { id: draft!.id })
    expect(readFileSync(join(directory, 'dsh', 'skills', 'release-notes', 'SKILL.md'), 'utf8')).toBe(next)
  })

  it('retries a case whose run fails and leaves a case that never runs out of the score', async () => {
    await source.mutate('case-save', { case: { skillName: 'release-notes', title: 'Flaky', prompt: 'Write notes A', checks: [{ text: 'Has notes', must: true }] } })
    await source.mutate('case-save', { case: { skillName: 'release-notes', title: 'Broken', prompt: 'Write notes B', checks: [{ text: 'Has notes', must: true }] } })
    const { skills, host } = evolution([])
    const failures = new Map([['Write notes A', 1], ['Write notes B', 2]])
    host.skillTask.mockImplementation(async (_parent: HostAgent, label: string, prompt: string) => {
      if (label.startsWith('Mnemon skill eval')) {
        const key = prompt.includes('Write notes A') ? 'Write notes A' : 'Write notes B'
        const left = failures.get(key)!
        if (left > 0) { failures.set(key, left - 1); throw new Error('memory subagent stopped with max-tokens') }
        return { structured: { steps: ['read'], answer: 'notes' } }
      }
      return { structured: { checks: [{ index: 1, pass: true, note: 'ok' }], summary: 'ok' } }
    })
    const { runId } = await skills.backtest(source, join(directory, 'workspace'), { skillName: 'release-notes', target: { kind: 'current' } })
    await vi.runAllTimersAsync()
    await vi.waitFor(async () => expect((await source.read<BacktestRun>('run', { id: runId })).status).toBe('completed'))
    const run = await source.read<BacktestRun>('run', { id: runId })
    expect(Object.fromEntries(run.results.map(result => [result.title, result.verdict]))).toEqual({ Flaky: 'pass', Broken: 'error' })
    expect(run.results.find(result => result.title === 'Broken')?.error).toContain('max-tokens')
    expect(run).toMatchObject({ passRate: 1, score: 1, errors: 1 })
  })

  it('derives cases from a trajectory and reviews a session on request', async () => {
    const { skills } = evolution([
      () => ({ outcome: 'nothing', summary: 'Nothing to keep.', suggestions: [] }),
      () => ({ cases: [{ title: 'Breaking first', prompt: 'Notes with a breaking change', checks: [{ text: 'Breaking change listed first', must: true }] }] }),
    ])
    turn(events, 1, 'Write notes')
    const result = await skills.reviewNow(agent)
    expect(result).toMatchObject({ inserted: 0, casesAdded: 0 })
    const derived = await skills.deriveCases(source, undefined, { trajectoryId: result.trajectoryId!, skillName: 'release-notes' }, new AbortController().signal)
    expect(derived.added).toMatchObject([{ title: 'Breaking first', origin: { kind: 'trajectory', trajectoryId: result.trajectoryId } }])
    expect(await source.read<Trajectory>('trajectory', { id: result.trajectoryId! })).toMatchObject({ outcome: 'nothing', caseIds: [derived.added[0]!.id] })
  })
})
