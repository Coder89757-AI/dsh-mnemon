import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  RUNTIME_ARCHIVE_DIRECTORY, RUNTIME_DIRECTORY, RUNTIME_ENTRY_DELIMITER, RUNTIME_ENTRY_MAX_BYTES, RUNTIME_LOCK_FILE, RUNTIME_MEMORIES_FILE,
  RUNTIME_MEMORY_LIMIT_MAX_BYTES, RUNTIME_MEMORY_LIMITS, RUNTIME_PROJECTION_FILES, runtimeBytes, runtimeProjection, summarizeRuntimeMemories,
  type RuntimeMemoryEntry,
} from '../src/contracts.ts'
import { runtimeSourceConfig } from '../src/config.ts'
import { RuntimeMemoryController } from '../src/controller.ts'

const directories: string[] = []

afterEach(() => {
  vi.unstubAllGlobals()
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

function fixture(): { root: string; controller: RuntimeMemoryController } {
  const root = mkdtempSync(join(tmpdir(), 'dsh-mnemon-runtime-contracts-'))
  directories.push(root)
  return { root, controller: new RuntimeMemoryController({ effectiveDataDir: () => root }, () => new Date('2026-10-17T08:00:00.000Z')) }
}

function stored(root: string): RuntimeMemoryEntry[] {
  return (JSON.parse(readFileSync(join(root, RUNTIME_DIRECTORY, RUNTIME_MEMORIES_FILE), 'utf8')) as { entries: RuntimeMemoryEntry[] }).entries
}

describe('Runtime storage contracts', () => {
  it('name the files the controller reads, writes and locks', () => {
    const { root, controller } = fixture()
    const directory = join(root, RUNTIME_DIRECTORY)
    expect(controller.directory).toBe(directory)
    expect(controller.sourcePath).toBe(join(directory, RUNTIME_MEMORIES_FILE))
    expect(controller.userPath).toBe(join(directory, RUNTIME_PROJECTION_FILES.user))
    expect(controller.memoryPath).toBe(join(directory, RUNTIME_PROJECTION_FILES.memory))
    expect(controller.lockPath).toBe(join(directory, RUNTIME_LOCK_FILE))
    expect(controller.archivePath).toBe(join(directory, RUNTIME_ARCHIVE_DIRECTORY, 'MEMORY.md'))
    // The names a Mnemon Pack has always carried them under.
    expect([RUNTIME_DIRECTORY, RUNTIME_MEMORIES_FILE, RUNTIME_PROJECTION_FILES.user, RUNTIME_PROJECTION_FILES.memory, RUNTIME_LOCK_FILE])
      .toEqual(['runtime', 'memories.json', 'USER.md', 'MEMORY.md', '.memories.lock'])
  })

  it('project each target byte for byte as the controller writes it, and count the bytes it reports', async () => {
    const { root, controller } = fixture()
    for (const [target, content] of [
      ['user', 'Prefers concise answers'], ['memory', '项目使用 pnpm workspace'], ['memory', 'A rare character \u{20BB7} takes four bytes'],
      ['user', 'Écrit en français'], ['memory', 'The gateway retries twice'],
    ] as const) await controller.mutate({ action: 'add', target, content })
    const entries = stored(root)
    const snapshot = controller.snapshot()
    for (const target of ['user', 'memory'] as const) {
      const file = readFileSync(join(root, RUNTIME_DIRECTORY, RUNTIME_PROJECTION_FILES[target]))
      expect(Buffer.from(runtimeProjection(entries, target), 'utf8').equals(file)).toBe(true)
      expect(runtimeBytes(entries, target)).toBe(snapshot.targets[target].used)
      expect(runtimeBytes(entries, target)).toBe(file.length - 1)
    }
    expect(runtimeProjection(entries, 'memory').split(RUNTIME_ENTRY_DELIMITER)).toHaveLength(3)
  })

  it('project an empty target as an empty file and count it as zero bytes', async () => {
    const { root, controller } = fixture()
    await controller.mutate({ action: 'add', target: 'memory', content: 'Only working memory' })
    expect(readFileSync(join(root, RUNTIME_DIRECTORY, RUNTIME_PROJECTION_FILES.user), 'utf8')).toBe('')
    expect(runtimeProjection(stored(root), 'user')).toBe('')
    expect(runtimeBytes(stored(root), 'user')).toBe(0)
    expect(runtimeBytes([], 'memory')).toBe(0)
  })

  it('count UTF-8 bytes as Node does, unpaired surrogates included, without Node', () => {
    const contents = ['plain', 'é', '中文', '\u{20BB7}', '\uD800', 'x\uDC00y', '\uDC00\uD800', '߿ࠀ￿', '']
    const expected = contents.map(content => Buffer.byteLength(content, 'utf8'))
    // The browser has no Buffer: the count must not need it.
    vi.stubGlobal('Buffer', undefined)
    expect(contents.map(content => runtimeBytes([{ target: 'memory', content }], 'memory'))).toEqual(expected)
    vi.unstubAllGlobals()
    const joined = [{ target: 'memory', content: 'a\uD800' }, { target: 'user', content: 'skipped' }, { target: 'memory', content: '\u{20BB7}' }] as const
    expect(runtimeBytes(joined, 'memory')).toBe(Buffer.byteLength(`a\uD800${RUNTIME_ENTRY_DELIMITER}\u{20BB7}`, 'utf8'))
  })

  it('keep the entry size limit the controller enforces', async () => {
    const { controller } = fixture()
    await expect(controller.mutate({ action: 'add', target: 'memory', content: 'x'.repeat(RUNTIME_ENTRY_MAX_BYTES) })).resolves.toMatchObject({ success: true })
    await expect(controller.mutate({ action: 'add', target: 'memory', content: 'y'.repeat(RUNTIME_ENTRY_MAX_BYTES + 1) })).rejects.toThrow(`max ${RUNTIME_ENTRY_MAX_BYTES}`)
  })

  it('state the limits the configuration and the controller apply', () => {
    // The Starter's settings default and bound both files with these.
    expect(RUNTIME_MEMORY_LIMITS).toEqual({ memory: 10 * 1024, user: 4 * 1024 })
    expect(RUNTIME_MEMORY_LIMIT_MAX_BYTES).toBe(1024 * 1024)
    const { root, controller } = fixture()
    expect(controller.limits).toEqual(RUNTIME_MEMORY_LIMITS)
    expect(runtimeSourceConfig({ dataDir: root }, 'contracts')).toMatchObject({ memoryLimitBytes: RUNTIME_MEMORY_LIMITS.memory, userLimitBytes: RUNTIME_MEMORY_LIMITS.user })
    for (const key of ['memoryLimitBytes', 'userLimitBytes'] as const) {
      expect(runtimeSourceConfig({ dataDir: root, [key]: RUNTIME_MEMORY_LIMIT_MAX_BYTES }, 'contracts')[key]).toBe(RUNTIME_MEMORY_LIMIT_MAX_BYTES)
      expect(() => runtimeSourceConfig({ dataDir: root, [key]: RUNTIME_MEMORY_LIMIT_MAX_BYTES + 1 }, 'contracts')).toThrow()
    }
    for (const target of ['memory', 'user'] as const) {
      const storage = { effectiveDataDir: () => root }
      expect(new RuntimeMemoryController(storage, undefined, { ...RUNTIME_MEMORY_LIMITS, [target]: RUNTIME_MEMORY_LIMIT_MAX_BYTES }).limits[target]).toBe(RUNTIME_MEMORY_LIMIT_MAX_BYTES)
      expect(() => new RuntimeMemoryController(storage, undefined, { ...RUNTIME_MEMORY_LIMITS, [target]: RUNTIME_MEMORY_LIMIT_MAX_BYTES + 1 }))
        .toThrow(`runtime ${target} memory limit must be an integer within 1..${RUNTIME_MEMORY_LIMIT_MAX_BYTES} bytes`)
    }
  })

  it('summarize a stored file for an inventory without judging its entries, and never throw', async () => {
    const { root, controller } = fixture()
    await controller.mutate({ action: 'add', target: 'user', content: 'One profile fact' })
    await controller.mutate({ action: 'add', target: 'memory', content: 'One working fact' })
    expect(summarizeRuntimeMemories(JSON.parse(readFileSync(join(root, RUNTIME_DIRECTORY, RUNTIME_MEMORIES_FILE), 'utf8')))).toEqual({ valid: true, entries: 2, user: 1, memory: 1 })
    // An entry that is an object counts whatever its target; anything else is skipped.
    expect(summarizeRuntimeMemories({ version: 9, entries: [{ target: 'user' }, { target: 'other' }, null, 'text', [], { target: 'memory' }] }))
      .toEqual({ valid: true, entries: 3, user: 1, memory: 1 })
    expect(summarizeRuntimeMemories({ entries: [] })).toEqual({ valid: true, entries: 0, user: 0, memory: 0 })
    for (const value of [null, [], 'memories', { entries: {} }, { version: 1 }]) {
      expect(summarizeRuntimeMemories(value)).toEqual({ valid: false, entries: 0, user: 0, memory: 0 })
    }
  })
})
