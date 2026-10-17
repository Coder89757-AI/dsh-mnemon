import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  DOCUMENT_FILENAME_PATTERN, DOCUMENTS_DIRECTORY, DOCUMENTS_INDEX_FILE, DOCUMENTS_LOCK_FILE,
  parseDocumentIndex, summarizeDocumentIndex, type DocumentRecord,
} from '../src/contracts.ts'
import { DocumentController } from '../src/controller.ts'

const directories: string[] = []

function temporary(): string {
  const directory = mkdtempSync(join(tmpdir(), 'dsh-mnemon-documents-contracts-'))
  directories.push(directory)
  return directory
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

/** A controller over a separate storage root, as the Starter mounts it, with one active and one archived document. */
async function stored(): Promise<{ root: string; controller: DocumentController; index: unknown }> {
  const root = temporary()
  const controller = new DocumentController(temporary(), undefined, () => new Date('2026-10-17T08:00:00.000Z'), root)
  await controller.mutate({ action: 'create', title: 'Release checklist', description: 'Steps', content: '# Release\n\nTag, then publish.', sourcePaths: ['README.md'] })
  const archived = await controller.mutate({ action: 'create', title: '旧的设计', content: 'Retired design' })
  await controller.archive(archived.document.id, archived.document.revision, { summary: 'Superseded', memoryBodyIds: ['project'] })
  return { root, controller, index: JSON.parse(readFileSync(join(root, DOCUMENTS_DIRECTORY, DOCUMENTS_INDEX_FILE), 'utf8')) as unknown }
}

function record(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'doc-1', title: 'Title', description: '', status: 'active', filename: 'title-doc1.md', relativePath: 'documents/active/title-doc1.md',
    sourcePaths: [], sessionIds: [], createdAt: '2026-10-17T08:00:00.000Z', updatedAt: '2026-10-17T08:00:00.000Z',
    lastAccessedAt: '2026-10-17T08:00:00.000Z', revision: 1, contentHash: 'a'.repeat(64), sizeBytes: 10, memoryBodyIds: [],
    ...overrides,
  }
}

describe('Documents storage contracts', () => {
  it('name the files the controller reads, writes and locks', async () => {
    const { root, controller } = await stored()
    expect(controller.directory).toBe(join(root, DOCUMENTS_DIRECTORY))
    expect(controller.indexPath).toBe(join(root, DOCUMENTS_DIRECTORY, DOCUMENTS_INDEX_FILE))
    expect(controller.lockPath).toBe(join(root, DOCUMENTS_DIRECTORY, DOCUMENTS_LOCK_FILE))
    // The names a Mnemon Pack has always carried them under.
    expect([DOCUMENTS_DIRECTORY, DOCUMENTS_INDEX_FILE, DOCUMENTS_LOCK_FILE]).toEqual(['documents', 'index.json', '.index.lock'])
  })

  it('read the index the controller writes as it stands, each file name one it generates', async () => {
    const { index, controller } = await stored()
    const parsed = parseDocumentIndex(index)
    expect(parsed).toEqual(index)
    expect(parsed.documents.map(document => document.status)).toEqual(['active', 'archived'])
    expect(parsed.documents.every(document => DOCUMENT_FILENAME_PATTERN.test(document.filename))).toBe(true)
    for (const document of parsed.documents) expect(readFileSync(join(controller.storageRoot, document.relativePath), 'utf8')).toContain(`id: ${JSON.stringify(document.id)}`)
  })

  it('place a record where its status puts it, whatever path a copy names', async () => {
    // Without a storage root the controller records the legacy `.mnemon/` prefix.
    const workspace = temporary()
    const controller = new DocumentController(workspace)
    await controller.mutate({ action: 'create', title: 'Legacy layout', content: 'Body' })
    const index = JSON.parse(readFileSync(controller.indexPath, 'utf8')) as { documents: DocumentRecord[] }
    expect(index.documents[0]!.relativePath).toMatch(/^\.mnemon\/documents\/active\//u)
    expect(parseDocumentIndex(index).documents[0]!.relativePath).toBe(`documents/active/${index.documents[0]!.filename}`)
    expect(parseDocumentIndex({ version: 1, documents: [record({ status: 'archived', relativePath: '../../outside.md' })] }).documents[0]!.relativePath)
      .toBe('documents/archived/title-doc1.md')
  })

  it('keep what a record holds and drop what it does not', () => {
    const parsed = parseDocumentIndex({ version: 1, documents: [record({
      sourcePaths: ['a.md', 7, null], sessionIds: ['s-1', {}], memoryBodyIds: ['project', false],
      archivedAt: '2026-10-17T09:00:00.000Z', archiveSummary: 'Moved', healthy: true, excerpt: 'not stored',
    }), record({ id: 'doc-2', archivedAt: 5, archiveSummary: null })] })
    expect(parsed.documents[0]).toEqual({ ...record(), sourcePaths: ['a.md'], sessionIds: ['s-1'], memoryBodyIds: ['project'], archivedAt: '2026-10-17T09:00:00.000Z', archiveSummary: 'Moved' })
    expect(parsed.documents[1]).not.toHaveProperty('archivedAt')
    expect(parsed.documents[1]).not.toHaveProperty('archiveSummary')
  })

  it('refuse a whole index for one bad record, saying which rule it broke', () => {
    const refusals: Array<[unknown, string]> = [
      [null, 'Documents index.json is invalid'],
      [{ version: 2, documents: [] }, 'Documents index.json is invalid'],
      [{ version: 1, documents: {} }, 'Documents index.json is invalid'],
      [{ version: 1, documents: ['doc-1'] }, 'Documents index contains an invalid or duplicate id'],
      [{ version: 1, documents: [record({ id: '  ' })] }, 'Documents index contains an invalid or duplicate id'],
      [{ version: 1, documents: [record(), record()] }, 'Documents index contains an invalid or duplicate id'],
      [{ version: 1, documents: [record({ status: 'deleted' })] }, 'Documents index contains an invalid record'],
      [{ version: 1, documents: [record({ title: 1 })] }, 'Documents index contains an invalid record'],
      [{ version: 1, documents: [record({ revision: 1.5 })] }, 'Documents index contains invalid metadata'],
      [{ version: 1, documents: [record({ sizeBytes: 2 ** 53 })] }, 'Documents index contains invalid metadata'],
      [{ version: 1, documents: [record({ lastAccessedAt: undefined })] }, 'Documents index contains invalid metadata'],
      [{ version: 1, documents: [record({ sessionIds: 's-1' })] }, 'Documents index contains invalid lists'],
    ]
    for (const filename of ['../escape.md', 'nested/file.md', 'back\\slash.md', 'notes.txt', '.md', 'space name.md', 'C:file.md']) {
      refusals.push([{ version: 1, documents: [record({ filename })] }, 'Documents index contains an unsafe filename'])
    }
    for (const [value, message] of refusals) expect(() => parseDocumentIndex(value), JSON.stringify(value)).toThrow(message)
    expect(DOCUMENT_FILENAME_PATTERN.test('..md')).toBe(true)
  })

  it('summarize a stored index for an inventory without judging its records, and never throw', async () => {
    const { index } = await stored()
    expect(summarizeDocumentIndex(index)).toEqual({ valid: true, documents: 2, active: 1, archived: 1 })
    // A record that is an object counts whatever its status; anything else is skipped.
    expect(summarizeDocumentIndex({ version: 7, documents: [{ status: 'active' }, { status: 'gone' }, 3, null, { status: 'archived' }] }))
      .toEqual({ valid: true, documents: 3, active: 1, archived: 1 })
    for (const value of [null, [], { documents: 'none' }, { version: 1 }]) {
      expect(summarizeDocumentIndex(value)).toEqual({ valid: false, documents: 0, active: 0, archived: 0 })
    }
  })
})
