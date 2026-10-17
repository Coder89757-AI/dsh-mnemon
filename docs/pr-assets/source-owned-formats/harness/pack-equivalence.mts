// pack-equivalence.mts <repository> <output.json>
//
// Drives the Host's real Mnemon Pack and storage inventory over synthetic data directories: a full
// and a Runtime-only export, a preview, a replace import into an empty directory, merge and replace
// imports into a populated one (real SQLite stores, so the Memory Space merge runs), an export of
// the merged result, and the Status page's inventory of each directory. Every byte they produce is
// written to <output.json> as a SHA-256 digest, so two revisions of the Host compare by diffing two
// files. Run with Node 24: node --experimental-transform-types --no-warnings <this file> <repo> <out>
import { createHash } from 'node:crypto'
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { unzipSync } from 'fflate'

const [repository, output] = process.argv.slice(2)
if (repository === undefined || output === undefined) throw new Error('usage: pack-equivalence.mts <repository> <output.json>')
const { MnemonPackManager } = await import(`${repository}/src/host/pack.ts`)
const { resolveConfig } = await import(`${repository}/src/host/config.ts`)
const { createStorageRoot } = await import(`${repository}/src/host/storage-root.ts`)
const { StorageScopeInspector } = await import(`${repository}/src/host/storage-scope.ts`)

type Sqlite = typeof import('node:sqlite')
const sqlite = process.getBuiltinModule('node:sqlite') as Sqlite
const at = '2026-10-17T08:00:00.000Z'
const now = () => new Date(at)
const sha256 = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex')
const workspace = mkdtempSync(join(tmpdir(), 'mnemon-pack-equivalence-'))

function runtime(root: string, entries: Array<['user' | 'memory', string]>): void {
  const directory = join(root, 'runtime')
  mkdirSync(directory, { recursive: true })
  const file = { version: 1, entries: entries.map(([target, content]) => ({ content, created_at: at, updated_at: at, target, importance: 'normal' })) }
  writeFileSync(join(directory, 'memories.json'), `${JSON.stringify(file, null, 2)}\n`)
  for (const [target, name] of [['user', 'USER.md'], ['memory', 'MEMORY.md']] as const) {
    const text = file.entries.filter(entry => entry.target === target).map(entry => entry.content).join('\n§\n')
    writeFileSync(join(directory, name), text === '' ? '' : `${text}\n`)
  }
}

function documents(root: string, list: Array<{ id: string; title: string; status: 'active' | 'archived'; body: string }>): void {
  const directory = join(root, 'documents')
  const records = list.map(document => {
    const filename = `${document.title.toLowerCase().replace(/[^a-z0-9]+/gu, '-')}-${document.id.slice(0, 8)}.md`
    const markdown = `---\nid: ${JSON.stringify(document.id)}\ntitle: ${JSON.stringify(document.title)}\nstatus: ${JSON.stringify(document.status)}\n---\n\n${document.body}\n`
    mkdirSync(join(directory, document.status), { recursive: true })
    writeFileSync(join(directory, document.status, filename), markdown)
    return {
      id: document.id, title: document.title, description: '', status: document.status, filename, relativePath: `documents/${document.status}/${filename}`,
      sourcePaths: [], sessionIds: [], createdAt: at, updatedAt: at, lastAccessedAt: at, revision: 1,
      contentHash: sha256(document.body), sizeBytes: Buffer.byteLength(markdown), memoryBodyIds: [],
      ...(document.status === 'archived' ? { archivedAt: at, archiveSummary: 'Superseded' } : {}),
    }
  })
  mkdirSync(join(directory, 'active'), { recursive: true })
  mkdirSync(join(directory, 'archived'), { recursive: true })
  writeFileSync(join(directory, 'index.json'), `${JSON.stringify({ version: 1, documents: records }, null, 2)}\n`)
}

/** Native spaces with a Mnemon-shaped schema: memories, the edges between them and the read log. */
function spaces(root: string, list: Array<{ id: string; name: string; memories: string[]; reads?: number }>, active: string): void {
  const data = join(root, 'data')
  for (const space of list) {
    mkdirSync(join(data, space.id), { recursive: true })
    const database = new sqlite.DatabaseSync(join(data, space.id, 'mnemon.db'))
    database.exec(`CREATE TABLE insights (id TEXT PRIMARY KEY, content TEXT NOT NULL, access_count INTEGER DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE edges (source_id TEXT NOT NULL, target_id TEXT NOT NULL, edge_type TEXT NOT NULL, weight REAL DEFAULT 1.0, created_at TEXT NOT NULL, PRIMARY KEY (source_id, target_id, edge_type));
      CREATE TABLE oplog (id INTEGER PRIMARY KEY AUTOINCREMENT, operation TEXT NOT NULL, created_at TEXT NOT NULL);`)
    space.memories.forEach((content, index) => {
      database.prepare('INSERT INTO insights (id, content, access_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(`i-${index}`, content, space.reads ?? 0, at, at)
      if (index > 0) database.prepare("INSERT INTO edges VALUES (?, ?, 'semantic', 0.8, ?)").run(`i-${index - 1}`, `i-${index}`, at)
    })
    for (let read = 0; read < (space.reads ?? 0); read += 1) database.prepare("INSERT INTO oplog (operation, created_at) VALUES ('recall', ?)").run(at)
    database.close()
  }
  writeFileSync(join(data, '.dsh-memory-bodies.json'), `${JSON.stringify({
    version: 1, bodies: list.map(space => ({ id: space.id, name: space.name, description: `${space.name} facts`, active: true, createdAt: at, updatedAt: at })),
  }, null, 2)}\n`)
  writeFileSync(join(root, 'active'), `${active}\n`)
}

function machine(label: string, build: (root: string) => void) {
  const root = join(workspace, label)
  mkdirSync(root, { recursive: true })
  build(root)
  const config = resolveConfig({ storageScope: 'custom', dataDir: root, cliPath: '/nonexistent/mnemon' })
  return { root, pack: new MnemonPackManager(createStorageRoot(config), config, undefined, now) }
}

function copy(from: { root: string }, label: string) {
  return machine(label, root => cpSync(from.root, root, { recursive: true }))
}

/** Every file and directory below a root, with its digest and permission bits, by relative path. */
function tree(root: string): Record<string, string> {
  const listing: Record<string, string> = {}
  const walk = (directory: string) => {
    for (const name of readdirSync(directory).sort()) {
      const path = join(directory, name)
      const stat = statSync(path)
      const key = relative(root, path).split('\\').join('/')
      if (stat.isDirectory()) {
        listing[`${key}/`] = (stat.mode & 0o777).toString(8)
        walk(path)
      } else listing[key] = `${(stat.mode & 0o777).toString(8)} ${sha256(readFileSync(path))}`
    }
  }
  walk(root)
  return listing
}

function archive(base64: string): Record<string, string> {
  return Object.fromEntries(Object.entries(unzipSync(Buffer.from(base64, 'base64'))).sort().map(([path, bytes]) => [path, sha256(bytes)]))
}

/** Absolute paths differ between runs; everything else must not. */
function portable(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value).split(workspace).join('<workspace>'))
}

function inventory(root: string): unknown {
  const config = resolveConfig({ storageScope: 'custom', dataDir: root, cliPath: '/nonexistent/mnemon' })
  const catalog = new StorageScopeInspector(createStorageRoot(config), config).catalog()
  return portable(catalog.scopes.find((scope: { active: boolean }) => scope.active).areas)
}

const results: Record<string, unknown> = {}
try {
  const source = machine('source', root => {
    runtime(root, [['user', 'Prefers concise answers'], ['memory', '项目使用 pnpm workspace'], ['memory', 'A rare character \u{20BB7} takes four bytes']])
    documents(root, [
      { id: 'a1b2c3d4-0000-4000-8000-000000000001', title: 'Release checklist', status: 'active', body: '# Release\n\nTag, then publish.' },
      { id: 'a1b2c3d4-0000-4000-8000-000000000002', title: 'Old design', status: 'archived', body: 'Retired design.' },
    ])
    spaces(root, [
      { id: 'project', name: 'Project', memories: ['The gateway routes by model family', 'Accounts warm up for a week', 'Retries stop after two'] },
      { id: 'research', name: 'Research', memories: ['Paper A compares retrieval depth'] },
    ], 'project')
  })
  const target = machine('target', root => {
    runtime(root, [['user', 'Prefers concise answers'], ['memory', 'Only the target knows this']])
    documents(root, [{ id: 'f0e1d2c3-0000-4000-8000-000000000003', title: 'Target notes', status: 'active', body: 'Kept on the target.' }])
    // The same project space, read here and holding one memory fewer: the merge adds the missing one.
    spaces(root, [{ id: 'project', name: 'Project', memories: ['The gateway routes by model family', 'Accounts warm up for a week'], reads: 3 }], 'project')
  })

  const full = await source.pack.exportPack('full')
  results.fullArchive = { bytes: full.bytes, sha256: sha256(Buffer.from(full.base64, 'base64')), entries: archive(full.base64), manifest: full.manifest }
  const runtimeOnly = await source.pack.exportPack('runtime')
  results.runtimeArchive = { sha256: sha256(Buffer.from(runtimeOnly.base64, 'base64')), entries: archive(runtimeOnly.base64) }
  results.preview = portable(target.pack.inspectPack(full.base64, 'backup.zip'))

  const empty = machine('empty', () => {})
  results.replaceIntoEmpty = portable(await empty.pack.importPack(full.base64, { mode: 'replace' }))
  results.emptyTree = tree(empty.root)

  const merged = copy(target, 'merged')
  results.mergeIntoTarget = portable(await merged.pack.importPack(full.base64, { mode: 'merge' }))
  results.mergedTree = tree(merged.root)
  const remerged = await merged.pack.exportPack('full')
  results.mergedArchive = { sha256: sha256(Buffer.from(remerged.base64, 'base64')), entries: archive(remerged.base64) }

  const replaced = copy(target, 'replaced')
  results.replaceSomeIntoTarget = portable(await replaced.pack.importPack(full.base64, { mode: 'replace', components: ['runtime', 'documents'] }))
  results.replacedTree = tree(replaced.root)

  results.inventory = { source: inventory(source.root), target: inventory(target.root), empty: inventory(empty.root), merged: inventory(merged.root) }
  writeFileSync(output, `${JSON.stringify(results, null, 2)}\n`)
  console.log(`wrote ${output}: ${Object.keys(results.fullArchive as object).length} archive facts, ${Object.keys(results.mergedTree as object).length} merged paths`)
} finally {
  rmSync(workspace, { recursive: true, force: true })
}
