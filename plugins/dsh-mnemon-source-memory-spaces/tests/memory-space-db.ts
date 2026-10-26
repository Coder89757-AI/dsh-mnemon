import { rmSync } from 'node:fs'

type Sqlite = typeof import('node:sqlite')

/** node:sqlite where this Node has it (22.13 and later). */
export const sqlite = process.getBuiltinModule?.('node:sqlite') as Sqlite | undefined

export interface SpaceInsight {
  id: string
  content: string
  tags?: string
  accessCount?: number
  accessedAt?: string | null
  embedding?: Uint8Array | null
  effectiveImportance?: number
  /** Set when the memory was forgotten, as Mnemon's `forget` does. */
  deletedAt?: string | null
  updatedAt?: string
}

/** Mnemon 0.2.10's schema, as `mnemon` writes it: keys, foreign keys, indexes and the stored_at trigger. */
export const MNEMON_SCHEMA = `
CREATE TABLE insights ( id TEXT PRIMARY KEY, content TEXT NOT NULL, category TEXT DEFAULT 'general', importance INTEGER DEFAULT 3,
  tags TEXT DEFAULT '[]', entities TEXT DEFAULT '[]', source TEXT DEFAULT 'user', access_count INTEGER DEFAULT 0, stored_at TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT , last_accessed_at TEXT, embedding BLOB, effective_importance REAL DEFAULT 0.5);
CREATE TABLE edges ( source_id TEXT NOT NULL, target_id TEXT NOT NULL,
  edge_type TEXT NOT NULL CHECK(edge_type IN ('temporal','semantic','causal','entity','supersedes')), weight REAL DEFAULT 1.0,
  metadata TEXT DEFAULT '{}', created_at TEXT NOT NULL, PRIMARY KEY (source_id, target_id, edge_type),
  FOREIGN KEY (source_id) REFERENCES insights(id) ON DELETE CASCADE, FOREIGN KEY (target_id) REFERENCES insights(id) ON DELETE CASCADE );
CREATE TABLE oplog ( id INTEGER PRIMARY KEY AUTOINCREMENT, operation TEXT NOT NULL, insight_id TEXT, detail TEXT DEFAULT '', created_at TEXT NOT NULL );
CREATE INDEX idx_edges_source_type ON edges(source_id, edge_type);
CREATE INDEX idx_insights_active_created ON insights(deleted_at, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_prune_candidates ON insights(deleted_at, importance, access_count, effective_importance);
CREATE TRIGGER set_insight_stored_at AFTER INSERT ON insights WHEN NEW.stored_at IS NULL OR NEW.stored_at = ''
  BEGIN UPDATE insights SET stored_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = NEW.id; END;
`

/** What an edge carries besides the memories it links, as Mnemon writes it. */
export interface SpaceEdge {
  type?: string
  weight?: number
  metadata?: string
  createdAt?: string
}

/**
 * A `mnemon.db` with Mnemon 0.2.10's schema, in WAL mode and checkpointed as a settled space is.
 * `reads` appends read-log rows the way a recall, search or show does.
 */
export function writeSpace(path: string, options: { insights: SpaceInsight[]; edges?: Array<[string, string] | [string, string, SpaceEdge]>; reads?: number }): void {
  if (sqlite === undefined) throw new Error('node:sqlite is not available')
  for (const suffix of ['', '-wal', '-shm']) rmSync(path + suffix, { force: true })
  const database = new sqlite.DatabaseSync(path)
  database.exec('PRAGMA journal_mode = WAL')
  database.exec(MNEMON_SCHEMA)
  const at = '2026-10-05T08:37:12Z'
  const insert = database.prepare(`INSERT INTO insights (id, content, category, importance, tags, entities, source, access_count, stored_at, created_at,
    updated_at, deleted_at, last_accessed_at, embedding, effective_importance) VALUES (?, ?, 'fact', 3, ?, '[]', 'user', ?, ?, ?, ?, ?, ?, ?, ?)`)
  for (const insight of options.insights) {
    insert.run(insight.id, insight.content, insight.tags ?? '[]', insight.accessCount ?? 0, at, at, insight.updatedAt ?? at, insight.deletedAt ?? null,
      insight.accessedAt ?? null, insight.embedding ?? null, insight.effectiveImportance ?? 0.6)
    database.prepare("INSERT INTO oplog (operation, insight_id, detail, created_at) VALUES ('remember', ?, '{}', ?)").run(insight.id, at)
  }
  for (const [source, target, edge] of options.edges ?? []) {
    database.prepare('INSERT INTO edges VALUES (?, ?, ?, ?, ?, ?)')
      .run(source, target, edge?.type ?? 'semantic', edge?.weight ?? 0.8, edge?.metadata ?? '{}', edge?.createdAt ?? at)
  }
  for (let read = 0; read < (options.reads ?? 0); read += 1) {
    database.prepare("INSERT INTO oplog (operation, insight_id, detail, created_at) VALUES ('recall', NULL, '{}', ?)").run(at)
  }
  database.exec('PRAGMA wal_checkpoint(TRUNCATE)')
  database.close()
}
