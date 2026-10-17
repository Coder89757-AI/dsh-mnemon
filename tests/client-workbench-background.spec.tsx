// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Config } from '../src/host/config.ts'
import type { ClientConnectionHandle } from '../src/host/dsh.ts'
import { ComposedMnemonWorkbench as MnemonWorkbench } from './fixtures/client.tsx'
import { translateEn } from '../src/client/locales.ts'
import { liveSettingsScope } from './helpers/settings-scope.ts'

afterEach(cleanup)

const snapshot = { status: 'ready' as const, value: {} as Config, base: {}, user: {}, revision: 0, writable: true, mode: 'host' as const }

/** The workbench's own page, with a Host that answers only the model directory. */
function workbench(options: { value?: Config; writable?: boolean; snapshot?: Partial<typeof snapshot>; catalog?: (payload: Record<string, unknown>) => unknown } = {}) {
  const calls: Array<{ endpoint: string; payload: Record<string, unknown> }> = []
  const call = vi.fn(async (channel: string, endpoint: string, payload: Record<string, unknown>) => {
    calls.push({ endpoint, payload: payload ?? {} })
    if (channel !== '/dsh-mnemon-read' || endpoint !== 'task-agent-models') {
      return { ok: false as const, error: { code: 'unexpected', message: endpoint } }
    }
    return { ok: true as const, value: options.catalog === undefined ? directory : await options.catalog(payload ?? {}) }
  })
  const connection = { rpc: { call }, isLoopback: true } as unknown as ClientConnectionHandle
  const mutate = vi.fn(async () => {})
  const scope = liveSettingsScope<Config>({ ...snapshot, value: options.value ?? {}, writable: options.writable ?? true, ...options.snapshot }, mutate)
  render(<MnemonWorkbench connection={connection} settingsScope={scope} sessionId="session-1" t={translateEn} locale="en" />)
  return { calls, scope, mutate }
}

// The conversation runs on one model; DSH's new-session default is another.
const directory = {
  effective: { provider: 'ai', model: 'space-bunny', source: 'dsh-default' as const },
  defaultSelection: { provider: 'ai', model: 'space-bunny' },
  session: { provider: 'ai', model: 'deepseek-v4.1-flash' },
  inherited: { provider: 'ai', model: 'space-bunny', source: 'dsh-default' as const },
  groups: [
    { id: 'ai', name: 'AI', models: [{ id: 'deepseek-v4.1-flash', name: 'DeepSeek V4.1 Flash' }, { id: 'space-bunny', name: 'Space Bunny' }] },
    { id: 'openai', name: 'OpenAI', models: [{ id: 'gpt-5', name: 'GPT-5' }] },
  ],
  failures: [],
}

const row = (label: string) => document.querySelector<HTMLButtonElement>(`[aria-labelledby^="${label}-title "]`)!

describe('the background task route on the status page', () => {
  it('states the route and where it comes from, and keeps the choice behind the gear', async () => {
    const { calls } = workbench()

    const section = await screen.findByRole('region', { name: 'Background tasks' })
    expect(await within(section).findByText('ai / space-bunny')).toBeTruthy()
    expect(within(section).getByText('DSH default')).toBeTruthy()
    expect(calls.find(call => call.endpoint === 'task-agent-models')?.payload).toEqual({ includeCatalog: false, sessionId: 'session-1' })
    // The page states the route; changing it is one gear away, not a second editor.
    expect(row('mnemon-task-agent')).toBeNull()
    expect(within(section).queryByRole('switch')).toBeNull()

    fireEvent.click(within(section).getByRole('button', { name: 'Change the task Agent model' }))
    const dialog = await screen.findByRole('dialog', { name: 'Background tasks' })
    expect(row('mnemon-task-agent').textContent).toBe('Follow the main route')
    expect(within(dialog).getByRole('switch', { name: 'Prefer the conversation\'s model' }).getAttribute('aria-checked')).toBe('false')
  })

  it('follows the conversation only once the switch is on, and says so at once', async () => {
    const { mutate } = workbench()

    const section = await screen.findByRole('region', { name: 'Background tasks' })
    expect(await within(section).findByText('ai / space-bunny')).toBeTruthy()
    fireEvent.click(within(section).getByRole('button', { name: 'Change the task Agent model' }))
    const dialog = await screen.findByRole('dialog', { name: 'Background tasks' })

    fireEvent.click(within(dialog).getByRole('switch', { name: 'Prefer the conversation\'s model' }))
    await waitFor(() => expect(mutate).toHaveBeenCalledWith([{ op: 'set', path: ['taskAgentModel'], value: { mode: 'inherit', followConversation: true } }]))
    // The conversation's model reads on the page and in the dialog before the Host is asked again.
    expect(await within(section).findByText('ai / deepseek-v4.1-flash')).toBeTruthy()
    expect(within(section).getByText('The conversation\'s model')).toBeTruthy()
    expect(within(dialog).getByText('ai / deepseek-v4.1-flash')).toBeTruthy()

    // Off again stores the plain inherited route.
    fireEvent.click(within(dialog).getByRole('switch', { name: 'Prefer the conversation\'s model' }))
    await waitFor(() => expect(mutate).toHaveBeenLastCalledWith([{ op: 'set', path: ['taskAgentModel'], value: { mode: 'inherit' } }]))
    expect(await within(section).findByText('ai / space-bunny')).toBeTruthy()
  })

  it('picks a fixed model in the dialog, starting from DSH\'s default', async () => {
    const { calls, mutate } = workbench()

    const section = await screen.findByRole('region', { name: 'Background tasks' })
    fireEvent.click(within(section).getByRole('button', { name: 'Change the task Agent model' }))
    const dialog = await screen.findByRole('dialog', { name: 'Background tasks' })
    fireEvent.click(row('mnemon-task-agent'))
    fireEvent.click(screen.getByRole('menuitem', { name: /Choose a model/u }))
    await waitFor(() => expect(calls.filter(call => call.payload.includeCatalog === true).length).toBe(1))
    await waitFor(() => expect(mutate).toHaveBeenCalledWith([{ op: 'set', path: ['taskAgentModel'], value: { mode: 'fixed', provider: 'ai', model: 'space-bunny' } }]))
    // A fixed route has no conversation to follow, so the switch goes.
    expect(within(dialog).queryByRole('switch')).toBeNull()

    fireEvent.click(row('mnemon-task-agent-model'))
    fireEvent.click(screen.getByRole('menuitem', { name: /DeepSeek V4.1 Flash/u }))
    await waitFor(() => expect(mutate).toHaveBeenLastCalledWith([{ op: 'set', path: ['taskAgentModel'], value: { mode: 'fixed', provider: 'ai', model: 'deepseek-v4.1-flash' } }]))
    expect(await within(section).findByText('ai / deepseek-v4.1-flash')).toBeTruthy()
    expect(within(section).getByText('Chosen model')).toBeTruthy()
  })

  it('reads a change made on another page at once', async () => {
    const { scope } = workbench()

    const section = await screen.findByRole('region', { name: 'Background tasks' })
    expect(await within(section).findByText('ai / space-bunny')).toBeTruthy()
    // The Layered strategy's page, say, stores a fixed route.
    await act(async () => { await scope.mutate([{ op: 'set', path: ['taskAgentModel'], value: { mode: 'fixed', provider: 'openai', model: 'gpt-5' } }]) })

    expect(await within(section).findByText('openai / gpt-5')).toBeTruthy()
    expect(within(section).getByText('Chosen model')).toBeTruthy()
  })

  it('keeps the switch when a fixed model is given up before it was written', async () => {
    const { mutate } = workbench({
      value: { taskAgentModel: { mode: 'inherit', followConversation: true } },
      // The whole directory never arrives, so choosing a fixed model waits.
      catalog: payload => payload.includeCatalog === true ? new Promise(() => {}) : directory,
    })

    const section = await screen.findByRole('region', { name: 'Background tasks' })
    expect(await within(section).findByText('ai / deepseek-v4.1-flash')).toBeTruthy()
    fireEvent.click(within(section).getByRole('button', { name: 'Change the task Agent model' }))
    const dialog = await screen.findByRole('dialog', { name: 'Background tasks' })
    fireEvent.click(row('mnemon-task-agent'))
    fireEvent.click(screen.getByRole('menuitem', { name: /Choose a model/u }))
    fireEvent.click(row('mnemon-task-agent'))
    fireEvent.click(screen.getByRole('menuitem', { name: /Follow the main route/u }))

    expect(within(dialog).getByRole('switch', { name: 'Prefer the conversation\'s model' }).getAttribute('aria-checked')).toBe('true')
    expect(within(section).getByText('ai / deepseek-v4.1-flash')).toBeTruthy()
    expect(mutate).not.toHaveBeenCalled()
  })

  it('reads only the route until the gear opens, and the whole directory again for a fixed route', async () => {
    let full = 0
    const { calls } = workbench({
      value: { taskAgentModel: { mode: 'fixed', provider: 'openai', model: 'gpt-5' } },
      catalog: payload => {
        if (payload.includeCatalog !== true) return directory
        full += 1
        if (full === 1) throw new Error('the model directory is down')
        return directory
      },
    })

    // A fixed route reads from the settings; stating it needs no Provider's models.
    const section = await screen.findByRole('region', { name: 'Background tasks' })
    expect(await within(section).findByText('openai / gpt-5')).toBeTruthy()
    expect(within(section).getByText('Chosen model')).toBeTruthy()
    await waitFor(() => expect(calls.filter(call => call.endpoint === 'task-agent-models').length).toBe(1))
    expect(calls.some(call => call.payload.includeCatalog === true)).toBe(false)

    fireEvent.click(within(section).getByRole('button', { name: 'Change the task Agent model' }))
    const dialog = await screen.findByRole('dialog', { name: 'Background tasks' })
    expect(await within(dialog).findByText('Could not load the model directory: the model directory is down')).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Read again' }))
    await waitFor(() => expect(full).toBe(2))
    // With the directory read, the fixed route can be changed in place.
    await waitFor(() => expect(row('mnemon-task-agent-model').disabled).toBe(false))
  })

  it('states the route the Host takes without a DSH default, and the Host\'s route before the settings are read', async () => {
    workbench({
      catalog: () => ({ ...directory, defaultSelection: undefined, inherited: { provider: 'ai', model: 'starter', source: 'active-agent' as const }, effective: { provider: 'ai', model: 'starter', source: 'active-agent' as const } }),
    })
    const section = await screen.findByRole('region', { name: 'Background tasks' })
    expect(await within(section).findByText('ai / starter')).toBeTruthy()
    expect(within(section).getByText('An open conversation\'s model')).toBeTruthy()
    cleanup()

    // Until this page has the settings, only the Host knows the stored route.
    workbench({
      snapshot: { status: 'loading' as never },
      catalog: () => ({ ...directory, effective: { provider: 'openai', model: 'gpt-5', source: 'fixed' as const } }),
    })
    const loading = await screen.findByRole('region', { name: 'Background tasks' })
    expect(await within(loading).findByText('openai / gpt-5')).toBeTruthy()
    expect(within(loading).getByText('Chosen model')).toBeTruthy()
  })

  it('states a failed directory read instead of quietly falling back, and reads again when asked', async () => {
    const { calls } = workbench({ catalog: () => { throw new Error('the model directory is down') } })

    const section = await screen.findByRole('region', { name: 'Background tasks' })
    expect(await within(section).findByText('Could not load the model directory: the model directory is down')).toBeTruthy()
    // A failed read is a statement, not a control the reader has to dismiss.
    expect(within(section).queryByRole('alert')).toBeNull()

    fireEvent.click(within(section).getByRole('button', { name: 'Read again' }))
    await waitFor(() => expect(calls.filter(call => call.endpoint === 'task-agent-models').length).toBe(2))
  })

  it('states the route without the gear when the reader may not write settings', async () => {
    const { mutate } = workbench({ writable: false })

    const section = await screen.findByRole('region', { name: 'Background tasks' })
    expect(await within(section).findByText('ai / space-bunny')).toBeTruthy()
    expect(within(section).queryByRole('button', { name: 'Change the task Agent model' })).toBeNull()
    expect(mutate).not.toHaveBeenCalled()
  })
})
