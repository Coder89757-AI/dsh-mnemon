import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveConfig } from '../src/host/config.ts'
import { MnemonPackManager } from '../src/host/pack.ts'
import { createStorageRoot } from '../src/host/storage-root.ts'
import { sourceFixture } from './fixtures/sources.ts'

const directories: string[] = []
const releases: Array<() => Promise<void>> = []
const now = () => new Date('2026-10-14T01:49:04.859Z')

/** The version this checkout declares, which is what a Pack manifest has to name. */
const DECLARED_VERSION = (JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8')) as { version: string }).version

function temporary(label: string): string {
  const directory = mkdtempSync(join(tmpdir(), `dsh-mnemon-${label}-`))
  directories.push(directory)
  return directory
}

/** One store holding one Project Document, and the manager that reads it. */
async function fixture(label: string) {
  const root = temporary(label)
  const workspace = temporary(`${label}-workspace`)
  const config = resolveConfig({ storageScope: 'custom', dataDir: root, cliPath: '/fake/mnemon' })
  const runner = createStorageRoot(config)
  const sources = await sourceFixture({ dataDir: root, workspace })
  releases.push(sources.dispose)
  await sources.documents.mutate('mutate', { action: 'create', title: 'Hermes image generation', content: '# Hermes\n\nDirect upstream call.' }, { confirmed: true })
  return { root, manager: new MnemonPackManager(runner, config, undefined, now) }
}

interface IndexDocument { id: string; relativePath: string; contentHash: string; sizeBytes: number }
interface DocumentsIndex { version: number; documents: IndexDocument[] }

function indexOf(root: string): DocumentsIndex {
  return JSON.parse(readFileSync(join(root, 'documents', 'index.json'), 'utf8')) as DocumentsIndex
}

/** Leave the store in the state a damaged one holds: one document's entry rewritten. */
function damage(root: string, change: (document: IndexDocument) => IndexDocument): void {
  const index = indexOf(root)
  index.documents[0] = change(index.documents[0]!)
  writeFileSync(join(root, 'documents', 'index.json'), `${JSON.stringify(index, null, 2)}\n`)
}

afterEach(async () => {
  for (const release of releases.splice(0)) await release()
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe('Documents index integrity', () => {
  it('records a sha256 digest for every document it indexes', async () => {
    const source = await fixture('documents-hash-shape')
    expect(indexOf(source.root).documents[0]!.contentHash).toMatch(/^[a-f0-9]{64}$/u)
  })

  it('refuses to publish a content hash one character too long, and still backs it up', async () => {
    const source = await fixture('documents-hash-long')
    // The value the reported store carried: a real sha256 digest plus one trailing character.
    damage(source.root, document => ({ ...document, contentHash: document.contentHash + '6' }))
    expect(indexOf(source.root).documents[0]!.contentHash).toHaveLength(65)

    await expect(source.manager.exportPack('documents', { stamp: true })).rejects.toThrow('Documents index records a content hash that is not a sha256 digest for documents/active/')
    // The ZIP path reads the same index, and the store this report describes is one that has to be backed up before it is repaired.
    const backup = await source.manager.exportPack('documents')
    expect(backup.bytes).toBeGreaterThan(0)
    // The backup cannot carry the bad index anywhere else: importing it is refused by the same rule.
    const target = await fixture('documents-hash-long-target')
    await expect(target.manager.importPack(backup.base64, { mode: 'merge' })).rejects.toThrow('Documents index records a content hash that is not a sha256 digest for documents/active/')
  })

  it('refuses to publish a content hash that is the right length but not hexadecimal', async () => {
    const source = await fixture('documents-hash-non-hex')
    damage(source.root, document => ({ ...document, contentHash: 'Z'.repeat(64) }))

    await expect(source.manager.exportPack('documents', { stamp: true })).rejects.toThrow('Documents index records a content hash that is not a sha256 digest for documents/active/')
    await expect(source.manager.exportPack('documents')).resolves.toMatchObject({ bytes: expect.any(Number) })
  })

  it('refuses to publish a size the payload cannot hold', async () => {
    const source = await fixture('documents-size')
    damage(source.root, document => ({ ...document, sizeBytes: document.sizeBytes + 1 }))

    await expect(source.manager.exportPack('documents', { stamp: true })).rejects.toThrow('Documents payload size does not match')
  })

  it('refuses to publish a digest that is well formed but is not this body', async () => {
    const source = await fixture('documents-hash-wrong')
    // A shape check cannot see this one: only comparing the digest against the body can, and
    // until now nothing did. A branch that received it refused every push that came after,
    // because a push imports the branch's own payload before it can publish anything else.
    damage(source.root, document => ({ ...document, contentHash: '0'.repeat(64) }))

    // The ZIP path is deliberately unchanged: a person backing up a store that needs repair
    // still gets an archive they can keep.
    const downloaded = await source.manager.exportPack('documents')
    expect(downloaded.bytes).toBeGreaterThan(0)
    expect(downloaded.manifest.source.pluginVersion).toBe(DECLARED_VERSION)

    // The publish path refuses the same store before anything leaves this machine.
    await expect(source.manager.exportPack('documents', { stamp: true })).rejects.toThrow('Documents payload content hash does not match documents/active/')
  })

  it('publishes a scope that carries no Documents without reading one', async () => {
    const source = await fixture('documents-absent')
    damage(source.root, document => ({ ...document, contentHash: document.contentHash + '6' }))

    // A scope that holds no Documents has none to judge, so the state of their index cannot
    // decide whether this payload may be published.
    await expect(source.manager.exportPack('runtime', { stamp: true })).resolves.toBeDefined()
  })
})
