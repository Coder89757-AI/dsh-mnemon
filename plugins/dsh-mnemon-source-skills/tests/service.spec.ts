import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ReviewRecordInput } from '../src/contracts.ts'
import { setFrontmatterKey, withInvocation } from '../src/frontmatter.ts'
import { SkillsService } from '../src/service.ts'

let root: string
let home: string
let agents: string
let workspace: string
let data: string
let now: Date

function skill(name: string, description = `Use ${name}.`, extra = ''): string {
  return `---\nname: ${name}\ndescription: ${description}\n${extra}---\n\n# ${name}\n\n1. Step one\n`
}

function write(path: string, content: string): void {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, content)
}

function service(): SkillsService {
  return new SkillsService(data, { dshHome: home, agentsHome: agents }, () => now)
}

function review(overrides: Partial<ReviewRecordInput> = {}): ReviewRecordInput {
  return {
    review: { at: now.toISOString(), sessionId: 'session-1', sessionTitle: 'Release notes', trigger: 'automatic', durationMs: 1200, outcome: 'suggested', summary: 'The user corrected the format twice.' },
    trajectory: {
      sessionId: 'session-1', sessionTitle: 'Release notes', startedAt: now.toISOString(), endedAt: now.toISOString(),
      stats: { turns: 3, userCharacters: 400, toolCalls: 4, toolFailures: 1, uniqueTools: 2, skills: ['release-notes'] },
      steps: [
        { index: 1, turn: 1, kind: 'user', text: 'Write release notes from the changelog' },
        { index: 2, turn: 1, kind: 'skill', text: 'release-notes', skill: { name: 'release-notes', by: 'model' } },
        { index: 3, turn: 1, kind: 'tool', text: 'git log failed', tool: { name: 'bash', ok: false, input: 'git log --oneline', error: 'not a git repository' } },
        { index: 4, turn: 2, kind: 'user', text: 'No, group them by component from now on' },
        { index: 5, turn: 2, kind: 'assistant', text: 'Grouped by component.' },
      ],
      annotations: [],
    },
    annotations: [{ step: 4, signal: 'correction', note: 'Grouping by component was missing' }, { step: 99, signal: 'directive', note: 'out of range' }],
    suggestions: [{ skillName: 'release-notes', action: 'update', summary: 'Group entries by component', rationale: 'The user corrected it.', confidence: 0.8, signals: ['correction', 'directive'], steps: [3, 4] }],
    cases: [{ skillName: 'release-notes', title: 'Group by component', prompt: 'Write release notes for v2 from this changelog', checks: [{ text: 'Entries are grouped by component', must: true }, { text: 'Breaking changes come first', must: false }], steps: [1, 4] }],
    ...overrides,
  }
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'mnemon-skills-'))
  home = join(root, 'dsh')
  agents = join(root, 'agents')
  workspace = join(root, 'project', 'packages', 'app')
  data = join(root, 'data')
  mkdirSync(join(root, 'project', '.git'), { recursive: true })
  mkdirSync(workspace, { recursive: true })
  now = new Date('2026-10-21T08:00:00.000Z')
})

afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('skill catalog', () => {
  it('reads the four roots with DSH rules and marks the skill DSH loads', () => {
    write(join(home, 'skills', 'release-notes', 'SKILL.md'), skill('release-notes'))
    write(join(home, 'skills', 'flat-skill.md'), skill('flat-skill'))
    write(join(home, 'skills', '.system', 'SKILL.md'), skill('system-skill'))
    write(join(home, 'skills', 'broken', 'SKILL.md'), '# no frontmatter\n')
    write(join(root, 'project', '.dsh', 'skills', 'release-notes', 'SKILL.md'), skill('release-notes', 'Project override.'))
    write(join(agents, 'skills', 'Bad_Name', 'SKILL.md'), skill('Bad_Name'))
    write(join(home, 'skills', 'release-notes', 'templates', 'note.md'), 'x')
    const catalog = service().catalogView(workspace)
    expect(catalog.projectRoot).toBe(join(root, 'project'))
    expect(catalog.skills.map(entry => entry.key)).toEqual(['user-dsh:flat-skill', 'project-dsh:release-notes', 'user-dsh:release-notes'])
    expect(catalog.skills.find(entry => entry.key === 'user-dsh:release-notes')?.shadowedBy).toBe('project-dsh:release-notes')
    expect(catalog.skills.find(entry => entry.key === 'user-dsh:release-notes')?.resources).toEqual(['templates/note.md'])
    expect(catalog.skills.find(entry => entry.key === 'user-dsh:flat-skill')?.layout).toBe('flat')
    expect(catalog.problems.map(problem => problem.reason)).toEqual(['missing YAML frontmatter', 'invalid skill name "Bad_Name"'])
    expect(service().catalogView(undefined).roots.map(entry => entry.kind)).toEqual(['user-dsh', 'user-agents'])
  })

  it('switches a skill with DSH frontmatter keys and keeps every other byte', () => {
    const raw = skill('pdf', 'Make PDFs.', 'version: 1.0.0\n')
    const off = withInvocation(raw, { modelInvocable: false, userInvocable: false })
    expect(off).toBe('---\nname: pdf\ndescription: Make PDFs.\nversion: 1.0.0\ndisable-model-invocation: true\nuser-invocable: false\n---\n\n# pdf\n\n1. Step one\n')
    expect(withInvocation(off, { modelInvocable: true, userInvocable: true })).toBe(raw)
    expect(setFrontmatterKey(off, 'user-invocable', 'true')).toContain('user-invocable: true\n---')
  })
})

describe('skill writes', () => {
  it('fences on the file hash and keeps the original and each edit as versions', async () => {
    const path = join(home, 'skills', 'pdf', 'SKILL.md')
    write(path, skill('pdf'))
    const store = service()
    const before = store.skill(workspace, 'user-dsh:pdf')
    await expect(store.saveSkill(workspace, { key: 'user-dsh:pdf', content: skill('pdf', 'Edited.'), expectedHash: 'stale' })).rejects.toThrow(/changed since it was read/)
    await expect(store.saveSkill(workspace, { key: 'user-dsh:pdf', content: skill('other'), expectedHash: before.hash })).rejects.toThrow(/names "other"/)
    const saved = await store.saveSkill(workspace, { key: 'user-dsh:pdf', content: skill('pdf', 'Edited.'), expectedHash: before.hash })
    expect(saved.description).toBe('Edited.')
    const versions = store.versions('user-dsh:pdf')
    expect(versions.map(version => version.reason)).toEqual(['edit', 'original'])
    const toggled = await store.setInvocation(workspace, { key: 'user-dsh:pdf', modelInvocable: false, userInvocable: true, expectedHash: saved.hash })
    expect(toggled.invocation).toEqual({ modelInvocable: false, userInvocable: true })
    expect(readFileSync(path, 'utf8')).toContain('disable-model-invocation: true')
    const original = store.versions('user-dsh:pdf').find(version => version.reason === 'original')!
    const restored = await store.restoreVersion(workspace, { key: 'user-dsh:pdf', versionId: original.id, expectedHash: toggled.hash })
    expect(readFileSync(path, 'utf8')).toBe(skill('pdf'))
    expect(restored.description).toBe('Use pdf.')
  })

  it('creates in the chosen root and moves a deleted skill to the trash', async () => {
    const store = service()
    const created = await store.createSkill(workspace, { name: 'deploy-check', description: 'Check a deploy.', root: 'project-dsh' })
    expect(created.path).toBe(join(root, 'project', '.dsh', 'skills', 'deploy-check', 'SKILL.md'))
    await expect(store.createSkill(workspace, { name: 'deploy-check', description: 'Again.', root: 'project-dsh' })).rejects.toThrow(/already exists/)
    await expect(store.createSkill(workspace, { name: 'Deploy Check', description: 'x' })).rejects.toThrow(/lowercase/)
    const { trashedTo } = await store.deleteSkill(workspace, { key: created.key, expectedHash: created.hash })
    expect(existsSync(created.path)).toBe(false)
    expect(readFileSync(join(trashedTo, 'SKILL.md'), 'utf8')).toContain('name: deploy-check')
    expect(store.catalogView(workspace).skills).toEqual([])
  })
})

describe('review admission', () => {
  it('records the trajectory, links evidence, and adds proposed cases once', async () => {
    write(join(home, 'skills', 'release-notes', 'SKILL.md'), skill('release-notes'))
    const store = service()
    const result = await store.recordReview(workspace, review())
    expect(result).toMatchObject({ inserted: 1, updated: 0, casesAdded: 1 })
    const [suggestion] = store.suggestions()
    expect(suggestion).toMatchObject({ skillName: 'release-notes', action: 'update', status: 'pending', confidence: 0.8, signals: ['correction', 'directive'], skillKey: 'user-dsh:release-notes' })
    expect(suggestion!.evidence).toEqual([{ trajectoryId: result.trajectoryId, steps: [3, 4] }])
    const trajectory = store.trajectory(result.trajectoryId!)
    expect(trajectory.annotations).toEqual([{ step: 4, signal: 'correction', note: 'Grouping by component was missing', suggestionIds: [suggestion!.id] }])
    expect(trajectory).toMatchObject({ outcome: 'suggested', signals: ['correction'], suggestionIds: [suggestion!.id] })
    expect(store.cases('release-notes')[0]).toMatchObject({ title: 'Group by component', origin: { kind: 'review', trajectoryId: result.trajectoryId, steps: [1, 4], suggestionId: suggestion!.id } })

    now = new Date(now.getTime() + 60_000)
    const again = await store.recordReview(workspace, review({ suggestions: [{ ...review().suggestions[0]!, confidence: 0.7, summary: 'Lower' }] }))
    expect(again).toMatchObject({ inserted: 0, updated: 0, casesAdded: 0 })
    expect(again.skipped.map(entry => entry.reason)).toEqual(['duplicate_lower_confidence', 'similar_case'])
    expect(store.suggestions()[0]!.evidence).toHaveLength(2)
    expect(store.overview(workspace).counts).toMatchObject({ skills: 1, pending: 1, trajectories: 2, cases: 1 })
  })

  it('drops weak, uncited and recently dismissed proposals and keeps the session within its limit', async () => {
    const store = service()
    // The Host passes its admission settings with each review; out-of-range values fall back.
    const result = await store.recordReview(workspace, review({
      policy: { maxPendingPerSession: 2, minConfidence: 2 },
      cases: [],
      suggestions: [
        { skillName: 'Weak One', action: 'create', summary: 'Weak', confidence: 0.3, signals: [], steps: [1] },
        { skillName: 'uncited', action: 'create', summary: 'No steps', confidence: 0.9, signals: [], steps: [42] },
        { skillName: 'missing', action: 'update', summary: 'Unknown', confidence: 0.9, signals: [], steps: [1] },
        { skillName: 'Alpha Flow', action: 'create', summary: 'A', confidence: 0.7, signals: ['procedure'], steps: [1] },
        { skillName: 'beta-flow', action: 'create', summary: 'B', confidence: 0.9, signals: ['procedure'], steps: [1] },
        { skillName: 'gamma-flow', action: 'create', summary: 'C', confidence: 0.8, signals: ['procedure'], steps: [1] },
      ],
    }))
    expect(result.skipped.map(entry => entry.reason)).toEqual(['no_evidence', 'unknown_skill', 'low_confidence'])
    expect(store.suggestions(['pending']).map(entry => entry.skillName)).toEqual(['gamma-flow', 'beta-flow'])
    expect(store.suggestions(['expired']).map(entry => entry.skillName)).toEqual(['alpha-flow'])
    const beta = store.suggestions(['pending']).find(entry => entry.skillName === 'beta-flow')!
    await store.dismissSuggestion(beta.id)
    const blocked = await store.recordReview(workspace, review({ cases: [], suggestions: [{ skillName: 'beta-flow', action: 'create', summary: 'B again', confidence: 0.95, signals: [], steps: [1] }] }))
    expect(blocked.skipped.map(entry => entry.reason)).toEqual(['recently_dismissed'])
    now = new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000)
    expect(store.suggestions(['pending'])).toEqual([])
  })
})

describe('evolution drafts and backtests', () => {
  it('adopts an update draft under the base hash and records an evolution version', async () => {
    const path = join(home, 'skills', 'release-notes', 'SKILL.md')
    write(path, skill('release-notes'))
    const store = service()
    const { trajectoryId } = await store.recordReview(workspace, review())
    const suggestion = store.suggestions()[0]!
    await store.suggestionStatus({ id: suggestion.id, status: 'drafting' })
    const pack = store.evidencePack(workspace, { suggestionId: suggestion.id })
    expect(pack.excerpts[0]).toMatchObject({ trajectoryId, sessionTitle: 'Release notes' })
    expect(pack.excerpts[0]!.steps.map(step => step.index)).toEqual([2, 3, 4, 5])
    expect(pack.skill?.content).toBe(skill('release-notes'))
    await expect(store.recordDraft(workspace, { suggestionId: suggestion.id, skillName: 'release-notes', content: '# no frontmatter', notes: '', changes: [], guidance: [] })).rejects.toThrow(/would not load/)
    const next = skill('release-notes', 'Use release-notes; group by component.')
    const draft = await store.recordDraft(workspace, { suggestionId: suggestion.id, skillName: 'release-notes', content: next, notes: 'Groups by component.', changes: ['Group by component'], guidance: [] })
    expect(store.suggestion(workspace, suggestion.id)).toMatchObject({ suggestion: { status: 'review', draftId: draft.id }, hashCurrent: true })
    expect(store.draft(workspace, draft.id).base?.content).toBe(skill('release-notes'))
    const adopted = await store.adoptDraft(workspace, draft.id)
    expect(readFileSync(path, 'utf8')).toBe(next)
    expect(adopted.version).toMatchObject({ reason: 'evolution', draftId: draft.id, suggestionId: suggestion.id })
    expect(store.suggestions()[0]!.status).toBe('adopted')
    expect(store.versions('user-dsh:release-notes').map(version => version.reason)).toEqual(['evolution', 'original'])
  })

  it('refuses a stale update draft and creates a new skill from a create draft', async () => {
    const path = join(home, 'skills', 'release-notes', 'SKILL.md')
    write(path, skill('release-notes'))
    const store = service()
    const draft = await store.recordDraft(workspace, { skillName: 'release-notes', content: skill('release-notes', 'v2'), notes: '', changes: [], guidance: [] })
    write(path, skill('release-notes', 'edited by hand'))
    await expect(store.adoptDraft(workspace, draft.id)).rejects.toThrow(/changed since it was read/)
    const created = await store.recordDraft(workspace, { skillName: 'weekly-report', content: skill('weekly-report'), notes: 'New', changes: [], guidance: [], targetRoot: 'user-agents' })
    expect(created).toMatchObject({ action: 'create', targetRoot: 'user-agents' })
    const result = await store.adoptDraft(workspace, created.id)
    expect(result.skill.key).toBe('user-agents:weekly-report')
    expect(readdirSync(join(agents, 'skills'))).toEqual(['weekly-report'])
  })

  it('scores a run from its case results', async () => {
    write(join(home, 'skills', 'release-notes', 'SKILL.md'), skill('release-notes'))
    const store = service()
    await store.recordReview(workspace, review())
    const second = await store.saveCase({ skillName: 'release-notes', title: 'Breaking first', prompt: 'Notes with a breaking change', checks: [{ text: 'Breaking change first', must: false }] })
    expect(second.checks[0]!.must).toBe(true)
    const cases = store.cases('release-notes')
    const { target } = store.targetContent(workspace, 'release-notes', { kind: 'current' })
    const run = await store.startRun({ skillName: 'release-notes', target, caseIds: cases.map(entry => entry.id) })
    expect(run.progress).toEqual({ done: 0, total: 2 })
    await store.progressRun({ id: run.id, result: { caseId: cases[0]!.id, title: cases[0]!.title, verdict: 'pass', score: 1, checks: [], steps: ['a'], answer: 'ok' } })
    await store.progressRun({ id: run.id, result: { caseId: cases[1]!.id, title: cases[1]!.title, verdict: 'fail', score: 0.5, checks: [], steps: [], answer: 'no' } })
    const finished = await store.finishRun({ id: run.id, status: 'completed' })
    expect(finished).toMatchObject({ status: 'completed', passRate: 0.5, score: 0.75, progress: { done: 2, total: 2 } })
    expect(store.catalogView(workspace).stats['release-notes']).toMatchObject({ open: 1, cases: 2, lastPassRate: 0.5, lastScore: 0.75 })
  })

  it('flags a regression only when the live version scores below its own last backtest', async () => {
    write(join(home, 'skills', 'release-notes', 'SKILL.md'), skill('release-notes'))
    const store = service()
    await store.recordReview(workspace, review())
    const [entry] = store.cases('release-notes')
    const draft = await store.recordDraft(workspace, { skillName: 'release-notes', content: skill('release-notes', 'Use release-notes, grouped.'), notes: 'Grouped.', changes: [], guidance: [] })
    const backtest = async (target: Parameters<SkillsService['startRun']>[0]['target'], score: number) => {
      now = new Date(now.getTime() + 1000)
      const run = await store.startRun({ skillName: 'release-notes', target, caseIds: [entry!.id] })
      await store.progressRun({ id: run.id, result: { caseId: entry!.id, title: entry!.title, verdict: score === 1 ? 'pass' : 'fail', score, checks: [], steps: [], answer: '' } })
      await store.finishRun({ id: run.id, status: 'completed' })
    }
    const { target: current } = store.targetContent(workspace, 'release-notes', { kind: 'current' })
    const regressions = () => store.overview(workspace).attention.filter(item => item.kind === 'regression').map(item => item.title)
    await backtest(current, 0.8)
    await backtest({ kind: 'draft', hash: 'h', draftId: draft.id }, 1)
    await backtest(current, 0.75)
    // A draft scoring higher than the live version is not a regression of the live version.
    expect(regressions()).toEqual([])
    await backtest(current, 0.5)
    expect(regressions()).toEqual(['75 → 50'])
  })
})
