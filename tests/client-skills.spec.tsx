// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ClientConnectionHandle } from '../src/host/dsh.ts'
import type { SkillActivitySnapshot, SkillsConfig } from '../src/host/protocol.ts'
import { subscribeMnemonAnchor } from '../src/client/anchor.ts'
import { translateEn as t } from '../src/client/locales.ts'
import { SKILLS_PAGE, SkillTurnTail } from '../src/client/SkillTurnTail.tsx'
import { SKILLS_PACKAGE, SkillsSettings } from '../src/client/skills-settings.tsx'
import { liveSettingsScope } from './helpers/settings-scope.ts'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const page = { component: { packageName: SKILLS_PACKAGE, label: 'Skills', enabled: true }, writable: true, language: 'en' }
const locale = { active: 'en' as const, locales: [], revision: 0 }
const localeRuntime = { getSnapshot: () => locale, subscribe: () => () => {} }

describe('技能管理 settings under Plugins', () => {
  it('shows self-evolution\'s own settings only while it is on, and applies each switch at once', async () => {
    const writes = vi.fn(async () => {})
    const scope = liveSettingsScope<SkillsConfig>({ status: 'ready', value: {}, revision: 1, writable: true, mode: 'host' }, writes)
    render(<SkillsSettings scope={scope} page={page} t={t} />)
    expect(screen.queryByRole('switch', { name: t('skills.autoBacktest') })).toBeNull()
    expect(screen.queryByText(t('skills.parameters'))).toBeNull()
    fireEvent.click(screen.getByRole('switch', { name: t('skills.evolution') }))
    await waitFor(() => expect(writes).toHaveBeenCalledWith([{ op: 'set', path: ['evolution'], value: true }]))
    expect(await screen.findByRole('switch', { name: t('skills.autoBacktest') })).not.toBeNull()
    expect(screen.getByText(t('skills.parameters'))).not.toBeNull()
    fireEvent.click(screen.getByRole('switch', { name: t('skills.hints') }))
    await waitFor(() => expect(writes).toHaveBeenLastCalledWith([{ op: 'set', path: ['hints'], value: false }]))
    fireEvent.click(screen.getByRole('switch', { name: t('skills.sidebar') }))
    await waitFor(() => expect(writes).toHaveBeenLastCalledWith([{ op: 'set', path: ['sidebar'], value: true }]))
  })

  it('applies the review parameters together and holds back one out of range', async () => {
    const writes = vi.fn(async () => {})
    const scope = liveSettingsScope<SkillsConfig>({ status: 'ready', value: { evolution: true }, revision: 1, writable: true, mode: 'host' }, writes)
    render(<SkillsSettings scope={scope} page={page} t={t} />)
    fireEvent.click(screen.getByText(t('skills.parameters')))
    fireEvent.change(screen.getByLabelText(t('skills.idleSeconds')), { target: { value: '45' } })
    fireEvent.change(screen.getByLabelText(t('skills.minConfidence')), { target: { value: '2' } })
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', t('skills.invalid', { field: t('skills.minConfidence'), min: 0, max: 1 }))
    expect((screen.getByRole('button', { name: t('options.apply') }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByLabelText(t('skills.minConfidence')), { target: { value: '0.7' } })
    fireEvent.click(screen.getByRole('button', { name: t('options.apply') }))
    await waitFor(() => expect(writes).toHaveBeenCalledWith([
      { op: 'set', path: ['idleSeconds'], value: 45 },
      { op: 'set', path: ['minConfidence'], value: 0.7 },
    ]))
  })
})

describe('the skills line under a turn', () => {
  function connection(read: () => SkillActivitySnapshot) {
    const call = vi.fn(async (_channel: string, endpoint: string) => endpoint === 'skill-activity'
      ? { ok: true as const, value: read() }
      : { ok: false as const, error: { message: 'unexpected' } })
    return { call, handle: { rpc: { call }, isLoopback: true } as unknown as ClientConnectionHandle }
  }

  it('names the skills a turn used, follows its review, and opens what it left on the Skills page', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    let snapshot: SkillActivitySnapshot = { available: true, turns: [{ turn: 3, skills: [{ name: 'release-notes', by: 'model' }] }], reviews: [{ turn: 3, state: 'reviewing', suggestions: [] }] }
    const { call, handle } = connection(() => snapshot)
    const opened = vi.fn()
    const stop = subscribeMnemonAnchor('session-a', opened)
    render(<SkillTurnTail turn={{ turn: 3, status: 'closed' }} seq={1} sessionId="session-a" connection={handle} localeRuntime={localeRuntime} t={t} />)
    expect(await screen.findByRole('button', { name: 'release-notes' })).not.toBeNull()
    expect(screen.getByText(t('skillTail.reviewing'))).not.toBeNull()
    expect(call).toHaveBeenCalledWith(expect.any(String), 'skill-activity', { sessionId: 'session-a' })
    snapshot = { ...snapshot, reviews: [{ turn: 3, state: 'suggested', suggestions: [{ id: 's1', skillName: 'release-notes', action: 'update', status: 'pending' }] }] }
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000) })
    fireEvent.click(await screen.findByRole('button', { name: t('skillTail.suggested', { count: 1 }) }))
    expect(opened).toHaveBeenCalledWith(expect.objectContaining({ page: SKILLS_PAGE, seed: 'suggestion:s1', sessionId: 'session-a' }))
    fireEvent.click(screen.getByRole('button', { name: 'release-notes' }))
    expect(opened).toHaveBeenLastCalledWith(expect.objectContaining({ page: SKILLS_PAGE, seed: 'name:release-notes' }))
    // Once the review has settled, the line stops reading.
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000) })
    const settled = call.mock.calls.length
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000) })
    expect(call).toHaveBeenCalledTimes(settled)
    stop()
  })

  it('stays out of a turn with nothing to say about skills, and out of an open turn', async () => {
    const quiet = connection(() => ({ available: true, turns: [], reviews: [{ turn: 1, state: 'nothing', suggestions: [] }] }))
    const { container } = render(<SkillTurnTail turn={{ turn: 1, status: 'closed' }} seq={1} sessionId="session-b" connection={quiet.handle} localeRuntime={localeRuntime} t={t} />)
    await waitFor(() => expect(quiet.call).toHaveBeenCalled())
    expect(container.textContent).toBe('')
    const open = connection(() => ({ available: true, turns: [], reviews: [] }))
    render(<SkillTurnTail turn={{ turn: 2, status: 'open' }} seq={2} sessionId="session-c" connection={open.handle} localeRuntime={localeRuntime} t={t} />)
    expect(open.call).not.toHaveBeenCalled()
  })
})
