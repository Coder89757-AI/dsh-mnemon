// big-space.mjs <storage root> <id> <name> <count>: a Mnemon 0.2.10 space of <count> memories with 768-dimension embeddings, registered beside the others.
import { DatabaseSync } from 'node:sqlite'
import { randomBytes, randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
const [root, id, name, count] = process.argv.slice(2)
const dir = join(root, 'data', id)
mkdirSync(dir, { recursive: true })
const path = join(dir, 'mnemon.db')
for (const suffix of ['', '-wal', '-shm']) rmSync(path + suffix, { force: true })
const db = new DatabaseSync(path)
db.exec('PRAGMA journal_mode = WAL')
db.exec(`CREATE TABLE insights ( id TEXT PRIMARY KEY, content TEXT NOT NULL, category TEXT DEFAULT 'general', importance INTEGER DEFAULT 3, tags TEXT DEFAULT '[]', entities TEXT DEFAULT '[]', source TEXT DEFAULT 'user', access_count INTEGER DEFAULT 0, stored_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT , last_accessed_at TEXT, embedding BLOB, effective_importance REAL DEFAULT 0.5);
CREATE TABLE edges ( source_id TEXT NOT NULL, target_id TEXT NOT NULL, edge_type TEXT NOT NULL CHECK(edge_type IN ('temporal','semantic','causal','entity','supersedes')), weight REAL DEFAULT 1.0, metadata TEXT DEFAULT '{}', created_at TEXT NOT NULL, PRIMARY KEY (source_id, target_id, edge_type), FOREIGN KEY (source_id) REFERENCES insights(id) ON DELETE CASCADE, FOREIGN KEY (target_id) REFERENCES insights(id) ON DELETE CASCADE );
CREATE TABLE oplog ( id INTEGER PRIMARY KEY AUTOINCREMENT, operation TEXT NOT NULL, insight_id TEXT, detail TEXT DEFAULT '', created_at TEXT NOT NULL );
CREATE INDEX idx_insights_active_created ON insights(deleted_at, created_at DESC) WHERE deleted_at IS NULL;
CREATE TRIGGER set_insight_stored_at AFTER INSERT ON insights WHEN NEW.stored_at IS NULL OR NEW.stored_at = '' BEGIN UPDATE insights SET stored_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = NEW.id; END;
PRAGMA user_version = 1;`)
const insert = db.prepare("INSERT INTO insights (id, content, category, importance, created_at, updated_at, stored_at, embedding) VALUES (?, ?, 'fact', 3, ?, ?, ?, ?)")
db.exec('BEGIN')
for (let i = 0; i < Number(count); i++) {
  const at = new Date(Date.UTC(2026, 8, 1) + i * 60_000).toISOString().replace(/\.\d{3}Z$/, 'Z')
  // 768 float32 values, as a nomic-embed-text embedding has: incompressible, like the real ones.
  insert.run(randomUUID(), `Routing note ${i + 1}: model family ${['A', 'B', 'C', 'D'][i % 4]} handles window ${i % 24}:00 for account group ${i % 37}.`, at, at, at, randomBytes(768 * 4))
}
db.exec('COMMIT')
db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
db.close()
const registryPath = join(root, 'data', '.dsh-memory-bodies.json')
let registry = { version: 1, bodies: [] }
try { registry = JSON.parse(readFileSync(registryPath, 'utf8')) } catch {}
const now = new Date().toISOString()
registry.bodies = registry.bodies.filter(body => body.id !== id)
registry.bodies.push({ id, name, description: 'Routing notes with their embeddings', active: true, createdAt: now, updatedAt: now })
writeFileSync(registryPath, JSON.stringify(registry, null, 2) + '\n')
console.log(`wrote ${path} (${(readFileSync(path).length / 1048576).toFixed(1)} MiB) and registered ${id}`)
