import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { MemorySpaceIdentity } from '../src/host/space-identity.ts'
import { sqlite, writeSpace, type SpaceInsight } from './helpers/memory-space-db.ts'

const directories: string[] = []
function temporary(): string {
  const directory = mkdtempSync(join(tmpdir(), 'dsh-mnemon-space-identity-'))
  directories.push(directory)
  return directory
}
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

const INSIGHTS: SpaceInsight[] = [
  { id: 'i-1', content: 'The gateway routes by model family' },
  { id: 'i-2', content: 'Accounts warm up for a week before routing', tags: '["routing"]' },
]
const THIRD: SpaceInsight = { id: 'i-3', content: 'A third memory' }
const FOURTH: SpaceInsight = { id: 'i-4', content: 'A memory only this machine holds' }

function space(root: string, name: string, options: Parameters<typeof writeSpace>[1]): Buffer {
  const path = join(root, name + '.db')
  writeSpace(path, options)
  return readFileSync(path)
}

/** A database built from SQL, for schemas Mnemon does not write. */
function built(root: string, name: string, sql: string): Buffer {
  const path = join(root, name + '.db')
  const database = new sqlite!.DatabaseSync(path)
  database.exec(sql)
  database.close()
  return readFileSync(path)
}

/** What a database holds, read back for the assertions. */
function inspect<T>(root: string, bytes: Uint8Array, read: (database: InstanceType<NonNullable<typeof sqlite>['DatabaseSync']>) => T): T {
  const path = join(root, 'inspect-' + String(Math.random()).slice(2) + '.db')
  writeFileSync(path, bytes)
  const database = new sqlite!.DatabaseSync(path)
  try {
    return read(database)
  } finally {
    database.close()
  }
}

describe.skipIf(sqlite === undefined)('Memory Space identity', () => {
  it('stays the same when the space was only read, though its bytes change (#370)', () => {
    const root = temporary()
    const fresh = space(root, 'fresh', { insights: INSIGHTS, edges: [['i-1', 'i-2']] })
    // As two machines leave it after recalls: counters, read times, the read log, a computed embedding.
    const read = space(root, 'read', {
      insights: INSIGHTS.map((insight, index) => ({ ...insight, accessCount: 42 + index, accessedAt: '2026-10-13T00:41:34Z', embedding: new Uint8Array([1, 2, 3]), effectiveImportance: 0.9 })),
      edges: [['i-1', 'i-2']],
      reads: 5,
    })
    expect(fresh.equals(read)).toBe(false)
    const identity = new MemorySpaceIdentity(root)
    expect(identity.of(fresh)).toMatch(/^content:[0-9a-f]{64}$/u)
    expect(identity.of(read)).toBe(identity.of(fresh))
    identity.dispose()
  })

  it('tells apart a space whose memories, tags or edges differ', () => {
    const root = temporary()
    const identity = new MemorySpaceIdentity(root)
    const base = identity.of(space(root, 'base', { insights: INSIGHTS, edges: [['i-1', 'i-2']] }))
    expect(identity.of(space(root, 'more', { insights: [...INSIGHTS, THIRD], edges: [['i-1', 'i-2']] }))).not.toBe(base)
    expect(identity.of(space(root, 'edited', { insights: [INSIGHTS[0]!, { ...INSIGHTS[1]!, content: 'Accounts warm up for two weeks' }], edges: [['i-1', 'i-2']] }))).not.toBe(base)
    expect(identity.of(space(root, 'retagged', { insights: [INSIGHTS[0]!, { ...INSIGHTS[1]!, tags: '["routing","accounts"]' }], edges: [['i-1', 'i-2']] }))).not.toBe(base)
    expect(identity.of(space(root, 'unlinked', { insights: INSIGHTS }))).not.toBe(base)
    identity.dispose()
  })

  it('knows a space that only gained memories from one that diverged', () => {
    const root = temporary()
    const identity = new MemorySpaceIdentity(root)
    const base = space(root, 'base', { insights: INSIGHTS, edges: [['i-1', 'i-2']] })
    const read = space(root, 'read', { insights: INSIGHTS.map(insight => ({ ...insight, accessCount: 9, accessedAt: '2026-10-13T00:41:34Z' })), edges: [['i-1', 'i-2']], reads: 3 })
    const more = space(root, 'more', { insights: [...INSIGHTS, THIRD], edges: [['i-1', 'i-2'], ['i-2', 'i-3']] })
    const forgotten = space(root, 'forgotten', { insights: [INSIGHTS[0]!, { ...INSIGHTS[1]!, deletedAt: '2026-10-13T01:00:00Z', updatedAt: '2026-10-13T01:00:00Z' }], edges: [] })
    expect([identity.contains(more, base), identity.contains(base, more)]).toEqual([true, false])
    // Reading changes nothing a space holds, so each holds the other.
    expect([identity.contains(base, read), identity.contains(read, base)]).toEqual([true, true])
    // A forgotten memory is a row the other version lacks, whichever way round.
    expect([identity.contains(forgotten, base), identity.contains(base, forgotten), identity.contains(more, forgotten)]).toEqual([false, false, false])
    identity.dispose()
  })

  it('holds an edge by the memories it links and its type, whatever its weight, note or time (#391)', () => {
    const root = temporary()
    const identity = new MemorySpaceIdentity(root)
    const published = space(root, 'published', { insights: INSIGHTS, edges: [['i-1', 'i-2', { weight: 0.86, metadata: '{"sub_type":"similar_topic"}' }]] })
    // A merge into this machine's space wrote every edge again, as mnemon import does.
    const rewritten = space(root, 'rewritten', { insights: INSIGHTS, edges: [['i-1', 'i-2', { weight: 0.5, metadata: '{"reason":"semantic"}', createdAt: '2026-10-16T10:35:00Z' }]] })
    expect(identity.of(rewritten)).toBe(identity.of(published))
    expect([identity.contains(rewritten, published), identity.contains(published, rewritten)]).toEqual([true, true])
    // Another type between the same memories is another edge.
    const causal = space(root, 'causal', { insights: INSIGHTS, edges: [['i-1', 'i-2', { type: 'causal' }]] })
    expect([identity.contains(rewritten, causal), identity.contains(causal, rewritten)]).toEqual([false, false])
    identity.dispose()
  })

  it('merges a version whose shared edges carry other values, keeping this machine\'s (#391)', () => {
    const root = temporary()
    const identity = new MemorySpaceIdentity(root)
    const local = space(root, 'local', { insights: INSIGHTS, edges: [['i-1', 'i-2', { weight: 0.5, metadata: '{"reason":"semantic"}', createdAt: '2026-10-16T10:35:00Z' }]] })
    const incoming = space(root, 'incoming', { insights: [...INSIGHTS, THIRD], edges: [
      ['i-1', 'i-2', { weight: 0.86, metadata: '{"sub_type":"similar_topic"}' }],
      ['i-2', 'i-3', { weight: 0.7, metadata: '{"sub_type":"follow_up"}' }],
    ] })
    const merged = identity.merge(local, incoming)!
    expect(merged).toBeInstanceOf(Uint8Array)
    expect(inspect(root, merged, database => ({
      insights: database.prepare('SELECT id FROM insights ORDER BY id').all(),
      edges: database.prepare('SELECT source_id, target_id, edge_type, weight, metadata, created_at FROM edges ORDER BY source_id, target_id').all(),
      broken: database.prepare('PRAGMA foreign_key_check').all(),
    }))).toEqual({
      insights: [{ id: 'i-1' }, { id: 'i-2' }, { id: 'i-3' }],
      edges: [
        { source_id: 'i-1', target_id: 'i-2', edge_type: 'semantic', weight: 0.5, metadata: '{"reason":"semantic"}', created_at: '2026-10-16T10:35:00Z' },
        { source_id: 'i-2', target_id: 'i-3', edge_type: 'semantic', weight: 0.7, metadata: '{"sub_type":"follow_up"}', created_at: '2026-10-05T08:37:12Z' },
      ],
      broken: [],
    })
    // A memory edited on one side still refuses the merge.
    const edited = space(root, 'edited', { insights: [INSIGHTS[0]!, { ...INSIGHTS[1]!, content: 'Accounts warm up for two weeks', updatedAt: '2026-10-13T01:00:00Z' }],
      edges: [['i-1', 'i-2', { weight: 0.86 }]] })
    expect(identity.merge(local, edited)).toBeUndefined()
    identity.dispose()
  })

  it('holds a memory whose vector was filled in later as the same memory (#391)', () => {
    const root = temporary()
    const identity = new MemorySpaceIdentity(root)
    const published = space(root, 'published', { insights: INSIGHTS, edges: [['i-1', 'i-2']] })
    // mnemon embed --all stamps the update time with every vector it fills in; gc --keep does as well.
    const filled = space(root, 'filled', { insights: INSIGHTS.map(insight => ({ ...insight, embedding: new Uint8Array([1, 2, 3, 4]), updatedAt: '2026-10-15T17:00:00Z' })), edges: [['i-1', 'i-2']] })
    expect(identity.of(filled)).toBe(identity.of(published))
    expect([identity.contains(filled, published), identity.contains(published, filled)]).toEqual([true, true])
    expect(identity.merge(filled, published)).toBe(filled)
    // A forget still differs: it sets the time a memory was forgotten.
    const forgotten = space(root, 'forgotten', { insights: [INSIGHTS[0]!, { ...INSIGHTS[1]!, deletedAt: '2026-10-15T17:00:00Z', updatedAt: '2026-10-15T17:00:00Z' }], edges: [['i-1', 'i-2']] })
    expect(identity.merge(filled, forgotten)).toBeUndefined()
    identity.dispose()
  })

  it('reads a table whatever it is called, constructor included', () => {
    const root = temporary()
    const identity = new MemorySpaceIdentity(root)
    const one = built(root, 'one', 'CREATE TABLE "constructor" (id TEXT PRIMARY KEY, value TEXT); INSERT INTO "constructor" VALUES (\'a\', \'1\');')
    const other = built(root, 'other', 'CREATE TABLE "constructor" (value TEXT, id TEXT PRIMARY KEY); INSERT INTO "constructor" VALUES (\'1\', \'a\');')
    // Compared by content, so the column order and the bytes do not matter.
    expect(identity.of(one)).toMatch(/^content:/u)
    expect(identity.of(one)).toBe(identity.of(other))
    identity.dispose()
  })

  it('compares rows by column name, not by the order a table declares them in', () => {
    const root = temporary()
    const identity = new MemorySpaceIdentity(root)
    const one = built(root, 'one', "CREATE TABLE notes (id TEXT PRIMARY KEY, body TEXT, rank INTEGER); INSERT INTO notes VALUES ('n-1', 'first', 1), ('n-2', 'second', 2)")
    const other = built(root, 'other', "CREATE TABLE notes (rank INTEGER, body TEXT, id TEXT PRIMARY KEY); INSERT INTO notes VALUES (2, 'second', 'n-2'), (1, 'first', 'n-1')")
    expect(identity.of(other)).toBe(identity.of(one))
    expect([identity.contains(one, other), identity.contains(other, one)]).toEqual([true, true])
    identity.dispose()
  })

  it('holds and merges a space from a Mnemon without a column a newer one added', () => {
    const root = temporary()
    const identity = new MemorySpaceIdentity(root)
    const older = built(root, 'older', "CREATE TABLE notes (id TEXT PRIMARY KEY, body TEXT); INSERT INTO notes VALUES ('n-1', 'first'), ('n-2', 'second')")
    const newer = built(root, 'newer', "CREATE TABLE notes (id TEXT PRIMARY KEY, body TEXT, pinned INTEGER DEFAULT 0); INSERT INTO notes (id, body) VALUES ('n-1', 'first')")
    expect([identity.contains(newer, older), identity.contains(older, newer)]).toEqual([false, false])
    // The newer schema takes the older version's rows, the new column at its default.
    const merged = identity.merge(newer, older)!
    expect(inspect(root, merged, database => database.prepare('SELECT id, body, pinned FROM notes ORDER BY id').all())).toEqual([
      { id: 'n-1', body: 'first', pinned: 0 }, { id: 'n-2', body: 'second', pinned: 0 },
    ])
    expect(identity.contains(merged, older)).toBe(true)
    // The older schema cannot hold the newer column, so that way round nothing merges.
    expect(identity.merge(older, newer)).toBeUndefined()
    identity.dispose()
  })

  it('keeps the types SQLite stored apart, integers past 2^53 and special reals included', () => {
    const root = temporary()
    const identity = new MemorySpaceIdentity(root)
    const kinds = ['1', "'1'", '1.5', "x'01'", '9007199254740993', '0.0', '-0.0', '9e999', 'NULL']
      .map((value, index) => identity.of(built(root, 'typed-' + String(index), `CREATE TABLE insights (id TEXT PRIMARY KEY, importance); INSERT INTO insights VALUES ('i-1', ${value})`)))
    expect(kinds.every(kind => kind.startsWith('content:'))).toBe(true)
    expect(new Set(kinds).size).toBe(kinds.length)
    identity.dispose()
  })

  it('compares bytes, as merges did before, without node:sqlite, for a file that is not a database, or past the row limits', () => {
    const root = temporary()
    const database = space(root, 'real', { insights: INSIGHTS, edges: [['i-1', 'i-2']] })
    const withoutSqlite = new MemorySpaceIdentity(root, () => undefined)
    expect(withoutSqlite.of(database)).toMatch(/^bytes:[0-9a-f]{64}$/u)
    // The same memories after a read: equal to the identity, but not to the bytes.
    const read = space(root, 'read', { insights: INSIGHTS, edges: [['i-1', 'i-2']], reads: 1 })
    expect([withoutSqlite.contains(database, read), withoutSqlite.contains(database, database)]).toEqual([false, true])
    const identity = new MemorySpaceIdentity(root)
    const header = Buffer.alloc(4096)
    header.write('SQLite format 3\0', 0, 'binary')
    expect(identity.of(header)).toMatch(/^bytes:/u)
    // Two memories and an edge: three rows, one more than this identity reads.
    const limited = new MemorySpaceIdentity(root, undefined, 2)
    expect(limited.of(database)).toMatch(/^bytes:/u)
    expect(new MemorySpaceIdentity(root, undefined, 3).of(database)).toBe(identity.of(database))
    // A merge reads at most so many rows in all: the second space is past it.
    const merge = new MemorySpaceIdentity(root, undefined, 10, 4)
    expect(merge.of(database)).toMatch(/^content:/u)
    expect(merge.of(space(root, 'second', { insights: INSIGHTS }))).toMatch(/^bytes:/u)
    for (const used of [withoutSqlite, identity, limited, merge]) used.dispose()
  })

  it('compares a database with a virtual table by its bytes, without opening the table', () => {
    const root = temporary()
    const fts = built(root, 'virtual', "CREATE TABLE insights (id TEXT PRIMARY KEY, content TEXT); INSERT INTO insights VALUES ('i-1', 'one'); CREATE VIRTUAL TABLE notes USING fts5(body); INSERT INTO notes VALUES ('hello')")
    // The same database naming a module this SQLite does not have: opening the table would fail.
    const unknown = Buffer.from(fts)
    unknown.write('USING zzz5(body)', unknown.indexOf('USING fts5(body)'), 'latin1')
    const identity = new MemorySpaceIdentity(root)
    expect([identity.of(fts), identity.of(unknown)].map(value => value.slice(0, 6))).toEqual(['bytes:', 'bytes:'])
    expect(identity.merge(fts, unknown)).toBeUndefined()
    identity.dispose()
  })

  it('merges the memories only the other version holds, keeping this machine\'s counts, log and schema', () => {
    const root = temporary()
    const identity = new MemorySpaceIdentity(root)
    const local = space(root, 'local', { insights: INSIGHTS.map(insight => ({ ...insight, accessCount: 9, accessedAt: '2026-10-13T00:41:34Z' })), edges: [['i-1', 'i-2']], reads: 4 })
    const incomingPath = join(root, 'incoming.db')
    writeSpace(incomingPath, { insights: [...INSIGHTS, THIRD], edges: [['i-1', 'i-2'], ['i-2', 'i-3']], reads: 1 })
    // The other machine's file also carries a trigger of its own, which must not come along.
    const extra = new sqlite!.DatabaseSync(incomingPath)
    extra.exec("CREATE TRIGGER rewrite AFTER UPDATE ON insights BEGIN UPDATE insights SET content = 'rewritten' WHERE id = NEW.id; END")
    extra.close()
    const incoming = readFileSync(incomingPath)
    const merged = identity.merge(local, incoming)!
    expect(merged).toBeInstanceOf(Uint8Array)
    expect(identity.contains(merged, local) && identity.contains(merged, incoming)).toBe(true)
    expect(inspect(root, merged, database => ({
      insights: database.prepare('SELECT id, access_count FROM insights ORDER BY id').all(),
      // Edges sort before the memories they link, so the foreign keys are checked at the commit.
      edges: database.prepare('SELECT source_id, target_id FROM edges ORDER BY source_id, target_id').all(),
      reads: database.prepare("SELECT count(*) AS n FROM oplog WHERE operation = 'recall'").get(),
      triggers: database.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' ORDER BY name").all(),
      broken: database.prepare('PRAGMA foreign_key_check').all(),
    }))).toEqual({
      insights: [{ id: 'i-1', access_count: 9 }, { id: 'i-2', access_count: 9 }, { id: 'i-3', access_count: 0 }],
      edges: [{ source_id: 'i-1', target_id: 'i-2' }, { source_id: 'i-2', target_id: 'i-3' }],
      reads: { n: 4 },
      triggers: [{ name: 'set_insight_stored_at' }],
      broken: [],
    })
    // Nothing to add: this machine's version comes back as it is.
    expect(identity.merge(merged, local)).toBe(merged)
    identity.dispose()
  })

  it('merges two versions that both gained memories into one that holds both', () => {
    const root = temporary()
    const identity = new MemorySpaceIdentity(root)
    const here = space(root, 'here', { insights: [...INSIGHTS, FOURTH] })
    const there = space(root, 'there', { insights: [...INSIGHTS, THIRD], edges: [['i-3', 'i-1']] })
    const merged = identity.merge(here, there)!
    expect(inspect(root, merged, database => database.prepare('SELECT id FROM insights ORDER BY id').all())).toEqual([
      { id: 'i-1' }, { id: 'i-2' }, { id: 'i-3' }, { id: 'i-4' },
    ])
    // The other machine reaches the same memories from its side.
    expect(identity.of(identity.merge(there, here)!)).toBe(identity.of(merged))
    identity.dispose()
  })

  it('refuses to merge a memory edited or forgotten on one side, and leaves both versions as they were', () => {
    const root = temporary()
    const identity = new MemorySpaceIdentity(root)
    const local = space(root, 'local', { insights: [...INSIGHTS, FOURTH] })
    const edited = space(root, 'edited', { insights: [INSIGHTS[0]!, { ...INSIGHTS[1]!, content: 'Accounts warm up for two weeks', updatedAt: '2026-10-13T01:00:00Z' }, THIRD] })
    const forgotten = space(root, 'forgotten', { insights: [INSIGHTS[0]!, { ...INSIGHTS[1]!, deletedAt: '2026-10-13T01:00:00Z', updatedAt: '2026-10-13T01:00:00Z' }] })
    const before = Buffer.from(local)
    expect(identity.merge(local, edited)).toBeUndefined()
    expect(identity.merge(local, forgotten)).toBeUndefined()
    expect(identity.merge(forgotten, local)).toBeUndefined()
    expect(Buffer.from(local).equals(before)).toBe(true)
    identity.dispose()
  })

  it('leaves no copy of a space behind, its own or one a stopped merge left', () => {
    const root = temporary()
    mkdirSync(join(root, '.dsh-space-identity-stale'))
    writeFileSync(join(root, '.dsh-space-identity-stale', 'left.db'), 'copy')
    const identity = new MemorySpaceIdentity(root)
    identity.merge(space(root, 'one', { insights: INSIGHTS }), space(root, 'two', { insights: [...INSIGHTS, THIRD] }))
    expect(existsSync(join(root, '.dsh-space-identity-stale'))).toBe(false)
    expect(readdirSync(root).filter(name => name.startsWith('.dsh-space-identity-'))).toHaveLength(1)
    expect(readdirSync(join(root, readdirSync(root).find(name => name.startsWith('.dsh-space-identity-'))!))).toEqual([])
    identity.dispose()
    expect(readdirSync(root).filter(name => name.startsWith('.dsh-space-identity-'))).toEqual([])
    expect(existsSync(root)).toBe(true)
  })

  it('reads on when a copy cannot be removed or written, and never fails the merge for it', () => {
    const root = temporary()
    // A copy another process still holds: this one cannot remove it, the next merge will.
    const stale = join(root, '.dsh-space-identity-held')
    mkdirSync(stale)
    writeFileSync(join(stale, 'left.db'), 'copy')
    chmodSync(stale, 0o500)
    try {
      const identity = new MemorySpaceIdentity(root)
      expect(identity.of(space(root, 'one', { insights: INSIGHTS }))).toMatch(/^content:/u)
      expect(() => { identity.dispose() }).not.toThrow()
    } finally {
      chmodSync(stale, 0o700)
    }
    // No place to put a copy at all: the bytes decide, as before, and nothing merges.
    const nowhere = new MemorySpaceIdentity(join(root, 'missing'))
    expect(nowhere.of(space(root, 'two', { insights: INSIGHTS }))).toMatch(/^bytes:/u)
    expect(nowhere.merge(space(root, 'three', { insights: INSIGHTS }), space(root, 'four', { insights: [...INSIGHTS, THIRD] }))).toBeUndefined()
    expect(() => { nowhere.dispose() }).not.toThrow()
  })
})

