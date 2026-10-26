// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MnemonStorageSection, type MnemonStorageSectionProps } from '../src/client/MnemonStorageSection.tsx'
import { translateEn } from '../src/client/locales.ts'
import { directoryPicker } from '../src/client/picker.ts'
import { settingsScope } from './helpers/settings-scope.ts'

afterEach(cleanup)

function fixture(overrides: Partial<MnemonStorageSectionProps> = {}, clientPicker = true) {
  const mutate = vi.fn(async () => {})
  const value = { storageScope: 'custom' as const, dataDir: '/fixture/original' }
  const scope = settingsScope({ value, status: 'ready', writable: true, mode: 'host', base: {}, user: {}, revision: 0 }, mutate)
  const picker = { available: () => true, pick: vi.fn(async (): Promise<string | null> => '/fixture/chosen') }
  const props: MnemonStorageSectionProps = { scope, value, user: {}, disabled: false, dashboard: null,
    target: { root: '/fixture/original', scope: 'custom', nativeDirectoryPicker: true }, ...(clientPicker ? { directoryPicker: picker } : {}),
    language: 'en', t: translateEn, onOpen: vi.fn(), onSaved: vi.fn(), ...overrides }
  const view = render(<MnemonStorageSection {...props} />)
  return { ...view, props, picker, mutate, update: (next: Partial<MnemonStorageSectionProps>) => view.rerender(<MnemonStorageSection {...props} {...next} />) }
}

const field = () => screen.getByRole('textbox', { name: 'Data directory' }) as HTMLInputElement
const choose = () => fireEvent.click(screen.getByRole('button', { name: 'Choose directory' }))
const apply = () => fireEvent.click(screen.getByRole('button', { name: 'Apply' }))

describe('storage directory chooser', () => {
  it.each(['custom', 'workspaces'] as const)('stages a selected path and preserves the %s scope on Apply', async storageScope => {
    const f = fixture({ value: { storageScope, dataDir: '/fixture/original' } })
    choose()
    await waitFor(() => expect(field().value).toBe('/fixture/chosen'))
    expect(f.mutate).not.toHaveBeenCalled()
    expect(screen.getByText('Memory moves to the new location; existing data stays where it is')).toBeTruthy()
    apply()
    await waitFor(() => expect(f.mutate).toHaveBeenCalledWith([{ op: 'set', path: ['dataDir'], value: '/fixture/chosen' }]))
    expect(f.props.onSaved).toHaveBeenCalledOnce()
  })

  it('keeps the global default until Custom and Apply are both chosen', async () => {
    const f = fixture({ value: { storageScope: 'global' } })
    expect(screen.queryByRole('button', { name: 'Choose directory' })).toBeNull()
    fireEvent.click(screen.getByRole('radio', { name: 'Custom' }))
    choose()
    await waitFor(() => expect(field().value).toBe('/fixture/chosen'))
    expect(f.mutate).not.toHaveBeenCalled()
    apply()
    await waitFor(() => expect(f.mutate).toHaveBeenCalledWith([
      { op: 'set', path: ['storageScope'], value: 'custom' },
      { op: 'set', path: ['dataDir'], value: '/fixture/chosen' },
    ]))
  })

  it('preserves a typed draft when the native chooser is cancelled', async () => {
    const f = fixture()
    fireEvent.change(field(), { target: { value: '/fixture/typed' } })
    f.picker.pick.mockResolvedValue(null)
    choose()
    await waitFor(() => expect((screen.getByRole('button', { name: 'Choose directory' }) as HTMLButtonElement).disabled).toBe(false))
    expect(field().value).toBe('/fixture/typed')
    expect(f.mutate).not.toHaveBeenCalled()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('discards a picked path and keeps the existing configuration', async () => {
    const f = fixture()
    choose()
    await waitFor(() => expect(field().value).toBe('/fixture/chosen'))
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }))
    expect(field().value).toBe('/fixture/original')
    expect(f.mutate).not.toHaveBeenCalled()
  })

  it('leaves manual entry usable after a chooser error', async () => {
    const f = fixture()
    f.picker.pick.mockRejectedValue(new Error('Chooser denied'))
    choose()
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Could not open the directory chooser. Try again or enter a path.'))
    expect(screen.queryByText('Chooser denied')).toBeNull()
    fireEvent.change(field(), { target: { value: '/fixture/manual' } })
    expect(screen.queryByRole('alert')).toBeNull()
    apply()
    await waitFor(() => expect(f.mutate).toHaveBeenCalledWith([{ op: 'set', path: ['dataDir'], value: '/fixture/manual' }]))
  })

  it('keeps the selected draft retryable when saving fails', async () => {
    const f = fixture()
    f.mutate.mockRejectedValueOnce(new Error('Profile write failed'))
    choose()
    await waitFor(() => expect(field().value).toBe('/fixture/chosen'))
    apply()
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Profile write failed'))
    expect(f.props.onSaved).not.toHaveBeenCalled()
    expect(f.props.value?.dataDir).toBe('/fixture/original')
    expect(field().value).toBe('/fixture/chosen')
    apply()
    await waitFor(() => expect(f.props.onSaved).toHaveBeenCalledOnce())
  })

  it.each(['absent capability', 'browse capability', 'absent client', 'unavailable client'] as const)('keeps manual entry with %s', condition => {
    const f = fixture({
      target: { root: '/fixture/original', scope: 'custom', ...(condition === 'absent capability' ? {} : { nativeDirectoryPicker: condition !== 'browse capability' }) },
      ...(condition === 'unavailable client' ? { directoryPicker: { available: () => false, pick: vi.fn() } } : {}),
    }, condition !== 'absent client')
    expect(screen.queryByRole('button', { name: 'Choose directory' })).toBeNull()
    expect(field().disabled).toBe(false)
    expect(f.picker.pick).not.toHaveBeenCalled()
  })

  it('does not open a chooser in a read-only view or for a workspace-owned directory', () => {
    const f = fixture({ disabled: true })
    choose()
    expect(f.picker.pick).not.toHaveBeenCalled()
    f.update({ value: { storageScope: 'workspace' }, disabled: false })
    expect(screen.queryByRole('button', { name: 'Choose directory' })).toBeNull()
    expect(screen.queryByRole('textbox', { name: 'Data directory' })).toBeNull()
  })

  it.each(['edit', 'default', 'scope', 'workspace', 'permissions', 'saved value', 'unmount'] as const)('ignores a pending result after %s changes', async change => {
    const f = fixture()
    let resolve!: (path: string) => void
    f.picker.pick.mockImplementation(() => new Promise(next => { resolve = next }))
    choose()
    choose()
    expect(f.picker.pick).toHaveBeenCalledOnce()
    if (change === 'edit') fireEvent.change(field(), { target: { value: '/fixture/newer' } })
    if (change === 'default') fireEvent.click(screen.getByRole('radio', { name: 'Default' }))
    if (change === 'scope') {
      fireEvent.click(document.querySelector<HTMLButtonElement>('[aria-labelledby^="mnemon-storage-scope-title "]')!)
      fireEvent.click(screen.getAllByRole('menuitem').find(item => item.textContent?.startsWith('Workspace'))!)
    }
    if (change === 'workspace') f.update({ workspaceId: 'different-workspace' })
    if (change === 'permissions') f.update({ disabled: true })
    if (change === 'saved value') f.update({ value: { storageScope: 'custom', dataDir: '/fixture/elsewhere' } })
    if (change === 'unmount') f.unmount()
    await act(async () => { resolve('/fixture/stale') })
    expect(screen.queryByDisplayValue('/fixture/stale')).toBeNull()
    expect(f.mutate).not.toHaveBeenCalled()
    if (change === 'edit') expect(field().value).toBe('/fixture/newer')
  })
})

describe('optional DSH client picker', () => {
  it('uses the public service and follows removal and replacement', async () => {
    const first = { pickDirectory: vi.fn(async () => '/fixture/first') }
    const get = vi.fn((): unknown => first)
    const connection = { isLoopback: true }
    const picker = directoryPicker({ get, connection } as never)
    expect(picker.available()).toBe(true)
    await expect(picker.pick()).resolves.toBe('/fixture/first')
    expect(get).toHaveBeenCalledWith('uiWorkspace')
    get.mockReturnValue(undefined)
    expect(picker.available()).toBe(false)
    await expect(picker.pick()).rejects.toThrow('unavailable')
    get.mockReturnValue({ pickDirectory: async () => null })
    expect(picker.available()).toBe(true)
    await expect(picker.pick()).resolves.toBeNull()
    connection.isLoopback = false
    expect(picker.available()).toBe(false)
    await expect(picker.pick()).rejects.toThrow('unavailable')
    connection.isLoopback = true
    get.mockImplementation(() => { throw new Error('service unloaded') })
    expect(picker.available()).toBe(false)
  })
})
