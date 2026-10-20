// @vitest-environment jsdom
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryCompositionRunner } from 'dsh-mnemon/testing'
import { strategy } from './fixture.ts'

// Load the installed Core's actual DSH browser artifact; no repository source alias.
vi.mock('dsh-mnemon/client', async () => {
  const { createRequire } = await import('node:module')
  const { loadMemoryClientArtifact } = await import('dsh-mnemon/testing')
  return loadMemoryClientArtifact(createRequire(import.meta.url).resolve('dsh-mnemon/client'), {
    react: await vi.importActual('react'),
    'react/jsx-runtime': await vi.importActual('react/jsx-runtime'),
    'react-dom': await vi.importActual('react-dom'),
    '@deepseek-ai/dsh-client-ui-primitives': await vi.importActual('@deepseek-ai/dsh-client-ui-primitives'),
  })
})

import * as plugin from '../src/index.ts'
import { installSkillsMemoryUI, SkillsSourcePage } from '../src/client.ts'
import { translate } from '../src/client/presentation.ts'
import type { ReviewRecordInput } from '../src/contracts.ts'

const t = translate('en')
let directory: string
let runner: MemoryCompositionRunner
let management: Awaited<ReturnType<MemoryCompositionRunner['managementClient']>>
const skillPath = () => join(directory, 'dsh', 'skills', 'release-notes', 'SKILL.md')
const SKILL = '---\nname: release-notes\ndescription: Write release notes from a changelog.\n---\n\n# Release notes\n\n1. Read CHANGELOG.md\n'

async function mutate(operation: string, input: unknown) {
  const { revision } = await management.read('revision', null)
  return (await management.mutate(operation, JSON.parse(JSON.stringify(input)), { confirmed: true, expectedRevision: revision })).value
}

function review(): ReviewRecordInput {
  const at = new Date().toISOString()
  return {
    review: { at, sessionId: 'session-1', sessionTitle: 'Release v2', trigger: 'automatic', durationMs: 10, outcome: 'suggested', summary: 'The user corrected the grouping.' },
    trajectory: {
      sessionId: 'session-1', sessionTitle: 'Release v2', startedAt: at, endedAt: at,
      stats: { turns: 2, userCharacters: 120, toolCalls: 2, toolFailures: 1, uniqueTools: 1, skills: ['release-notes'] },
      steps: [
        { index: 1, turn: 1, kind: 'user', text: 'Write the v2 release notes' },
        { index: 2, turn: 1, kind: 'skill', text: 'release-notes', skill: { name: 'release-notes', by: 'model' } },
        { index: 3, turn: 1, kind: 'tool', text: 'not a git repository', tool: { name: 'bash', ok: false, input: 'command=git log', error: 'not a git repository' } },
        { index: 4, turn: 2, kind: 'user', text: 'Group them by component from now on' },
      ],
      annotations: [],
    },
    annotations: [{ step: 4, signal: 'correction', note: 'Grouping by component was missing' }],
    suggestions: [{ skillName: 'release-notes', action: 'update', summary: 'Group entries by component', rationale: 'Corrected twice.', confidence: 0.82, signals: ['correction'], steps: [3, 4] }],
    cases: [{ skillName: 'release-notes', title: 'Grouped notes', prompt: 'Write v2 release notes', checks: [{ text: 'Grouped by component', must: true }], steps: [1, 4] }],
  }
}

beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(), 'mnemon-skills-client-'))
  mkdirSync(join(directory, 'dsh', 'skills', 'release-notes'), { recursive: true })
  mkdirSync(join(directory, 'workspace'))
  writeFileSync(skillPath(), SKILL)
  runner = new MemoryCompositionRunner()
  await runner.mount(strategy, { instanceId: 'strategy' })
  await runner.mount(plugin, { instanceId: 'skills', config: { dataDir: join(directory, 'data'), dshHome: join(directory, 'dsh'), agentsHome: join(directory, 'agents') } })
  management = await runner.managementClient('source:skills', { storage: 'custom', workspaceId: join(directory, 'workspace') })
})

afterEach(async () => {
  cleanup()
  await runner.dispose()
  rmSync(directory, { recursive: true, force: true })
})

function page(navigationInput?: { seed: string; nonce: number }) {
  return render(<SkillsSourcePage sourceTypeId="skills" sourceInstanceKey="source:skills" sourceInstances={[]} locale="en" writable management={management} {...(navigationInput === undefined ? {} : { navigationInput })} />)
}

describe('Skills page', () => {
  it('turns self-evolution on from the overview and applies typed settings together', async () => {
    page()
    expect(await screen.findByRole('heading', { name: t('overview.offTitle') })).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: t('overview.enable') }))
    expect(await screen.findByRole('heading', { name: t('overview.onTitle') })).not.toBeNull()
    expect((await management.read('settings', null)).value).toMatchObject({ enabled: true })
    fireEvent.click(screen.getByRole('button', { name: t('overview.settings') }))
    const dialog = await screen.findByRole('dialog')
    const apply = within(dialog).getByRole('button', { name: t('common.apply') }) as HTMLButtonElement
    expect(apply.disabled).toBe(true)
    fireEvent.change(within(dialog).getByLabelText(t('settings.reviewThreshold')), { target: { value: '7' } })
    fireEvent.change(within(dialog).getByLabelText(t('settings.minConfidence')), { target: { value: '3' } })
    expect(within(dialog).getByText(t('settings.invalid', { field: t('settings.minConfidence') }))).not.toBeNull()
    fireEvent.change(within(dialog).getByLabelText(t('settings.minConfidence')), { target: { value: '0.7' } })
    fireEvent.click(apply)
    await waitFor(async () => expect((await management.read('settings', null)).value).toMatchObject({ reviewThreshold: 7, minConfidence: 0.7 }))
  })

  it('lists, switches and edits a skill, keeping each change as a version', async () => {
    page({ seed: 'skill:user-dsh:release-notes', nonce: 1 })
    expect(await screen.findByRole('heading', { name: 'release-notes' })).not.toBeNull()
    expect(screen.getByText('Read CHANGELOG.md')).not.toBeNull()
    fireEvent.click(screen.getByRole('switch', { name: t('detail.model') }))
    await waitFor(() => expect(readFileSync(skillPath(), 'utf8')).toContain('disable-model-invocation: true'))
    expect(await screen.findByText(t('chip.modelOff'))).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: t('common.edit') }))
    const editor = await screen.findByLabelText('SKILL.md')
    fireEvent.change(editor, { target: { value: (editor as HTMLTextAreaElement).value.replace('1. Read CHANGELOG.md', '1. Read CHANGELOG.md\n2. Group by component') } })
    fireEvent.click(screen.getByRole('button', { name: t('common.save') }))
    await waitFor(() => expect(readFileSync(skillPath(), 'utf8')).toContain('2. Group by component'))
    fireEvent.click(await screen.findByRole('tab', { name: `${t('detail.versions')} · 3` }))
    expect(screen.getByText(t('versions.reason.invocation'))).not.toBeNull()
    expect(screen.getByText(t('versions.reason.original'))).not.toBeNull()
  })

  it('shows a suggestion with its cited steps, then reviews and adopts its draft', async () => {
    await mutate('review-record', review())
    const [suggestion] = (await management.read('suggestions', null)).value as Array<{ id: string }>
    page({ seed: `suggestion:${suggestion!.id}`, nonce: 1 })
    expect(await screen.findByText('Group entries by component', { selector: 'p' })).not.toBeNull()
    expect(screen.getByText('Grouping by component was missing')).not.toBeNull()
    expect(screen.getByText('command=git log')).not.toBeNull()
    expect(screen.getByText(t('evolution.noAgent'))).not.toBeNull()
    const next = SKILL.replace('1. Read CHANGELOG.md', '1. Read CHANGELOG.md\n2. Group by component')
    await mutate('draft-record', { suggestionId: suggestion!.id, skillName: 'release-notes', content: next, notes: 'Groups entries by component.', changes: ['Group by component'], guidance: [] })
    cleanup()
    page({ seed: `suggestion:${suggestion!.id}`, nonce: 2 })
    expect(await screen.findByText('Groups entries by component.')).not.toBeNull()
    expect(screen.getByText(t('draft.diff'))).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: t('draft.adopt') }))
    await waitFor(() => expect(readFileSync(skillPath(), 'utf8')).toBe(next))
    expect(await screen.findByText(t('draft.adopted', { key: 'user-dsh:release-notes' }))).not.toBeNull()
  })

  it('steps through evidence, filters by signal and pins a trajectory', async () => {
    const recorded = await mutate('review-record', review()) as { trajectoryId: string }
    page({ seed: `trajectory:${recorded.trajectoryId}`, nonce: 1 })
    expect(await screen.findByRole('heading', { name: 'Release v2' })).not.toBeNull()
    expect(screen.getByText('The user corrected the grouping.')).not.toBeNull()
    expect(screen.getByText('Write the v2 release notes')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: t('evidence.pin') }))
    await waitFor(async () => expect((await management.read('trajectory', { id: recorded.trajectoryId })).value).toMatchObject({ pinned: true }))
    expect(await screen.findByRole('button', { name: t('evidence.unpin') })).not.toBeNull()
  })

  it('adds an eval case by hand and shows the cases a review left', async () => {
    await mutate('review-record', review())
    page({ seed: 'evals:release-notes', nonce: 1 })
    expect(await screen.findByText('Grouped notes')).not.toBeNull()
    expect(screen.getByText(t('evals.origin.review'))).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: t('evals.add') }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText(t('evals.title')), { target: { value: 'Breaking first' } })
    fireEvent.change(within(dialog).getByLabelText(t('evals.prompt')), { target: { value: 'Notes with a breaking change' } })
    fireEvent.change(within(dialog).getByPlaceholderText(t('evals.checkPlaceholder')), { target: { value: 'Breaking change listed first' } })
    fireEvent.click(within(dialog).getByRole('button', { name: t('common.save') }))
    expect(await screen.findByText('Breaking first')).not.toBeNull()
    expect((await management.read('cases', { skill: 'release-notes' })).value).toHaveLength(2)
  })

  it('registers one page in the Memory System and releases it', () => {
    const entries: Array<{ id: string }> = []
    const release = installSkillsMemoryUI({ slots: {
      inject: (_name: string, factory: () => () => void) => factory(),
      register: (options: { id: string }) => { entries.push(options); return () => entries.splice(entries.indexOf(options), 1) },
    } } as never)
    expect(entries.map(entry => entry.id)).toEqual(['skills/library'])
    release()
    expect(entries).toEqual([])
  })
})
