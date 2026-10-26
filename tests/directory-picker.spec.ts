import { describe, expect, it, vi } from 'vitest'
import { hasNativeDirectoryPicker } from '../src/host/directory-picker.ts'

describe('optional DSH native directory capability', () => {
  it.each([undefined, {}, { capability: () => ({ kind: 'browse' }) }, { capability: () => ({ kind: 'future' }) }, { capability: () => ({ kind: 'native' }) }])('hides the native affordance for an unsupported service', service => {
    expect(hasNativeDirectoryPicker({ get: () => service })).toBe(false)
  })

  it('discovers a native capability without opening the chooser', () => {
    const pick = vi.fn()
    expect(hasNativeDirectoryPicker({ get: name => name === 'directoryPicker' ? { capability: () => ({ kind: 'native', pick }) } : undefined })).toBe(true)
    expect(pick).not.toHaveBeenCalled()
  })

  it('keeps storage settings usable when optional capability discovery fails', () => {
    expect(hasNativeDirectoryPicker({ get: () => { throw new Error('service unloaded') } })).toBe(false)
    expect(hasNativeDirectoryPicker({ get: () => ({ capability: () => { throw new Error('unavailable') } }) })).toBe(false)
  })
})
