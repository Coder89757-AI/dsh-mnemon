import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { MNEMON_MACHINE_DIRECTORY, MNEMON_MACHINE_FILE, MnemonMachineStore, defaultMachineLabel } from "../src/host/machine-identity.ts"
import { MNEMON_MACHINE_LABEL_MAX } from "../src/host/protocol.ts"

const directories: string[] = []

function temporary(): string {
  const directory = mkdtempSync(join(tmpdir(), 'dsh-mnemon-identity-'))
  directories.push(directory)
  return directory
}

function store(root: string): MnemonMachineStore {
  return new MnemonMachineStore({ effectiveDataDir: () => root })
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe('Mnemon machine identity', () => {
  it('mints one identity on first use and keeps it across later reads and instances', () => {
    const root = temporary()
    const first = store(root).read()
    expect(first.id).toMatch(/^[0-9a-f-]{36}$/u)
    expect(first.label.length).toBeGreaterThan(0)
    expect(Number.isNaN(Date.parse(first.createdAt))).toBe(false)

    const path = join(root, MNEMON_MACHINE_DIRECTORY, MNEMON_MACHINE_FILE)
    expect(existsSync(path)).toBe(true)
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({ version: 1, ...first, labelSource: 'hostname' })

    expect(store(root).read()).toEqual(first)
    expect(store(root).read().id).toBe(first.id)
  })

  it('labels the machine with its host name and never leaves the label empty', () => {
    expect(defaultMachineLabel().trim()).toBe(defaultMachineLabel())
    expect(defaultMachineLabel().length).toBeGreaterThan(0)
  })

  it('replaces a damaged record instead of failing', () => {
    const root = temporary()
    const path = join(root, MNEMON_MACHINE_DIRECTORY, MNEMON_MACHINE_FILE)
    mkdirSync(dirname(path), { recursive: true })
    for (const damaged of ['not json at all', JSON.stringify({ version: 2, id: 'a', label: 'b', createdAt: 'c' }), JSON.stringify({ version: 1, id: '', label: 'b', createdAt: 'c' }), JSON.stringify({ version: 1, id: 'a', label: 'b' })]) {
      rmSync(path, { force: true })
      writeFileSync(path, damaged)
      const identity = store(root).read()
      expect(identity.id).not.toBe('a')
      expect(identity.label.length).toBeGreaterThan(0)
      expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({ version: 1, ...identity, labelSource: 'hostname' })
    }
  })

  it('follows the host name until a person names the machine', () => {
    const root = temporary()
    const path = join(root, MNEMON_MACHINE_DIRECTORY, MNEMON_MACHINE_FILE)
    mkdirSync(dirname(path), { recursive: true })
    // The record was written while the computer had another host name.
    writeFileSync(path, JSON.stringify({ version: 1, id: 'kept-id', label: 'old-host', createdAt: '2026-10-01T00:00:00.000Z', labelSource: 'hostname' }))

    expect(store(root).current()).toEqual({ identity: { id: 'kept-id', label: defaultMachineLabel(), createdAt: '2026-10-01T00:00:00.000Z' }, source: 'hostname' })
    expect(JSON.parse(readFileSync(path, 'utf8')).label).toBe(defaultMachineLabel())
  })

  it('keeps a typed name for every reader and goes back to the host name on request', () => {
    const root = temporary()
    const first = store(root).read()
    const named = store(root).rename('  Studio  ')
    expect(named).toEqual({ identity: { ...first, label: 'Studio' }, source: 'custom' })
    // Another store over the same directory, as the pack manager holds, sees the name at once.
    expect(store(root).read()).toEqual({ ...first, label: 'Studio' })
    expect(JSON.parse(readFileSync(join(root, MNEMON_MACHINE_DIRECTORY, MNEMON_MACHINE_FILE), 'utf8')).labelSource).toBe('custom')

    expect(store(root).rename(null)).toEqual({ identity: { ...first, label: defaultMachineLabel() }, source: 'hostname' })
    expect(store(root).rename('')).toEqual({ identity: { ...first, label: defaultMachineLabel() }, source: 'hostname' })
    expect(store(root).read().id).toBe(first.id)
  })

  it('reads a record from an earlier version by its label', () => {
    const root = temporary()
    const path = join(root, MNEMON_MACHINE_DIRECTORY, MNEMON_MACHINE_FILE)
    mkdirSync(dirname(path), { recursive: true })
    // Earlier versions always used the host name; a label that is still the host name keeps following it.
    writeFileSync(path, JSON.stringify({ version: 1, id: 'a', label: defaultMachineLabel(), createdAt: 'c' }))
    expect(store(root).current().source).toBe('hostname')
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({ version: 1, id: 'a', label: defaultMachineLabel(), createdAt: 'c', labelSource: 'hostname' })
    // Any other label was set by hand, and a hand-set name stays.
    writeFileSync(path, JSON.stringify({ version: 1, id: 'b', label: 'MacBook', createdAt: 'c' }))
    expect(store(root).current()).toEqual({ identity: { id: 'b', label: 'MacBook', createdAt: 'c' }, source: 'custom' })
    expect(JSON.parse(readFileSync(path, 'utf8')).labelSource).toBe('custom')
  })

  it('refuses a name that is blank, too long or more than one line, and keeps the old one', () => {
    const root = temporary()
    const named = store(root).rename('Laptop').identity
    for (const bad of ['   ', 'x'.repeat(MNEMON_MACHINE_LABEL_MAX + 1), 'two\nlines', 'tab\tbed', 42, {}]) {
      expect(() => store(root).rename(bad)).toThrow(/machine name/u)
    }
    expect(store(root).rename('x'.repeat(MNEMON_MACHINE_LABEL_MAX)).identity.label).toHaveLength(MNEMON_MACHINE_LABEL_MAX)
    expect(store(root).read().id).toBe(named.id)
  })

  it('reads the identity from the effective data directory the runner reports', () => {
    const root = temporary()
    const identity = new MnemonMachineStore({ effectiveDataDir: () => join(root, 'nested', 'deeper') }).read()
    expect(existsSync(join(root, 'nested', 'deeper', MNEMON_MACHINE_DIRECTORY, MNEMON_MACHINE_FILE))).toBe(true)
    expect(identity.id.length).toBeGreaterThan(0)
  })
})
