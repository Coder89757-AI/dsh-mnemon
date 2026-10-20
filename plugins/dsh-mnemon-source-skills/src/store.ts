import { createHash, randomUUID } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import type {
  BacktestRun, EvalCase, MarketInstall, MarketRegistryFile, MarketSourceKind, ReviewLogEntry, SkillDraft, SkillSuggestion, SkillVersion, Trajectory, TrajectorySummary,
} from './contracts.ts'

export const MAX_TRAJECTORIES = 100
export const MAX_REVIEWS = 200
export const MAX_DRAFTS = 60
export const MAX_RUNS_PER_SKILL = 20
export const MAX_VERSIONS_PER_SKILL = 30
export const MAX_CASES_PER_SKILL = 40

export interface LedgerFile {
  version: 1
  /** Bumped by every write this Source makes; part of the management revision. */
  generation: number
  suggestions: SkillSuggestion[]
  drafts: SkillDraft[]
  reviews: ReviewLogEntry[]
  versions: SkillVersion[]
  trajectories: TrajectorySummary[]
  /** Skills installed from a market, by skill key. */
  installs: MarketInstall[]
}

export interface RegistryRecord {
  id: string
  /** How the source publishes; records written before kinds existed are catalogs. */
  kind?: MarketSourceKind
  location: string
  enabled: boolean
  builtin: boolean
}

export interface RegistryCache {
  fetchedAt?: string
  registry?: MarketRegistryFile
  error?: string
}

export interface EvalsFile {
  version: 1
  cases: EvalCase[]
  runs: BacktestRun[]
}

function emptyLedger(): LedgerFile {
  return { version: 1, generation: 0, suggestions: [], drafts: [], reviews: [], versions: [], trajectories: [], installs: [] }
}

function emptyEvals(): EvalsFile {
  return { version: 1, cases: [], runs: [] }
}

function object(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function array<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : []
}

/** An opaque, filesystem-safe directory name for one skill key. */
export function keyDirectory(skillKey: string): string {
  return createHash('sha256').update(skillKey).digest('hex').slice(0, 16)
}

/**
 * The Skills Source's own files under `<dataDir>/skills`. Every file is
 * replaced atomically; callers serialize writes with the storage lock.
 */
export class SkillsStore {
  constructor(readonly directory: string) {}

  private path(name: string): string {
    return join(this.directory, name)
  }

  /** A directory beside the data, for staging a download before it is moved into place. */
  stagingDirectory(): string {
    return this.path('staging')
  }

  private readJson(name: string): unknown {
    const path = this.path(name)
    if (!existsSync(path)) return undefined
    try { return JSON.parse(readFileSync(path, 'utf8')) as unknown } catch (error) {
      throw new Error(`Skills Source file is unreadable: ${path}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private writeAtomic(path: string, content: string): void {
    mkdirSync(join(path, '..'), { recursive: true, mode: 0o700 })
    const temporary = `${path}.${process.pid}-${randomUUID()}.tmp`
    try {
      writeFileSync(temporary, content, { mode: 0o600 })
      renameSync(temporary, path)
    } finally {
      rmSync(temporary, { force: true })
    }
  }

  private writeJson(name: string, value: unknown): void {
    this.writeAtomic(this.path(name), `${JSON.stringify(value, null, 2)}\n`)
  }

  /** Name, size and time of each file the revision depends on. */
  fingerprint(): string {
    return ['ledger.json', 'evals.json'].map(name => {
      try {
        const info = statSync(this.path(name))
        return `${name}:${info.size}:${info.mtimeMs}`
      } catch { return `${name}:-` }
    }).join('|')
  }

  ledger(): LedgerFile {
    const value = object(this.readJson('ledger.json'))
    if (value === undefined) return emptyLedger()
    return {
      version: 1,
      generation: typeof value.generation === 'number' ? value.generation : 0,
      suggestions: array(value.suggestions),
      drafts: array(value.drafts),
      reviews: array(value.reviews),
      versions: array(value.versions),
      trajectories: array(value.trajectories),
      installs: array(value.installs),
    }
  }

  saveLedger(ledger: LedgerFile): void {
    ledger.generation += 1
    ledger.reviews = ledger.reviews.slice(0, MAX_REVIEWS)
    const kept = new Set<string>()
    ledger.drafts = ledger.drafts.filter(draft => {
      if (draft.status === 'ready') return true
      kept.add(draft.id)
      return kept.size <= MAX_DRAFTS
    })
    this.writeJson('ledger.json', ledger)
  }

  evals(): EvalsFile {
    const value = object(this.readJson('evals.json'))
    return value === undefined ? emptyEvals() : { version: 1, cases: array(value.cases), runs: array(value.runs) }
  }

  saveEvals(evals: EvalsFile): void {
    const counts = new Map<string, number>()
    // Runs are newest first; keep the newest per skill, and every running one.
    evals.runs = evals.runs.filter(run => {
      const count = (counts.get(run.skillName) ?? 0) + 1
      counts.set(run.skillName, count)
      return run.status === 'running' || count <= MAX_RUNS_PER_SKILL
    })
    this.writeJson('evals.json', evals)
  }

  trajectory(id: string): Trajectory {
    if (!/^[a-z0-9-]{1,80}$/u.test(id)) throw new Error('invalid trajectory id')
    const value = object(this.readJson(join('trajectories', `${id}.json`)))
    if (value === undefined) throw new Error('trajectory not found: ' + id)
    return value as unknown as Trajectory
  }

  saveTrajectory(trajectory: Trajectory): void {
    this.writeJson(join('trajectories', `${trajectory.id}.json`), trajectory)
  }

  deleteTrajectory(id: string): void {
    if (!/^[a-z0-9-]{1,80}$/u.test(id)) throw new Error('invalid trajectory id')
    rmSync(this.path(join('trajectories', `${id}.json`)), { force: true })
  }

  versionContent(version: SkillVersion): string {
    return readFileSync(this.path(join('versions', keyDirectory(version.skillKey), `${version.id}.md`)), 'utf8')
  }

  saveVersionContent(version: SkillVersion, content: string): void {
    this.writeAtomic(this.path(join('versions', keyDirectory(version.skillKey), `${version.id}.md`)), content)
  }

  deleteVersionContent(version: SkillVersion): void {
    rmSync(this.path(join('versions', keyDirectory(version.skillKey), `${version.id}.md`)), { force: true })
  }

  registries(): RegistryRecord[] {
    return array<RegistryRecord>(object(this.readJson(join('market', 'registries.json')))?.registries)
  }

  saveRegistries(registries: RegistryRecord[]): void {
    this.writeJson(join('market', 'registries.json'), { version: 1, registries })
  }

  registryCache(id: string): RegistryCache | undefined {
    if (!/^[a-z0-9][a-z0-9-]{0,62}$/u.test(id)) return undefined
    return object(this.readJson(join('market', 'cache', `${id}.json`))) as RegistryCache | undefined
  }

  saveRegistryCache(id: string, cache: RegistryCache): void {
    if (!/^[a-z0-9][a-z0-9-]{0,62}$/u.test(id)) throw new Error('invalid registry id')
    this.writeJson(join('market', 'cache', `${id}.json`), cache)
  }

  deleteRegistryCache(id: string): void {
    if (/^[a-z0-9][a-z0-9-]{0,62}$/u.test(id)) rmSync(this.path(join('market', 'cache', `${id}.json`)), { force: true })
  }

  /** Move a bundle or a flat file out of DSH's reach, never deleting it. */
  trash(path: string, name: string): string {
    const target = this.path(join('trash', `${new Date().toISOString().replace(/[:.]/gu, '-')}-${name}${basename(path).endsWith('.md') && !existsSync(join(path, 'SKILL.md')) ? '.md' : ''}`))
    mkdirSync(join(target, '..'), { recursive: true, mode: 0o700 })
    try {
      renameSync(path, target)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EXDEV') throw error
      cpSync(path, target, { recursive: true, errorOnExist: true })
      rmSync(path, { recursive: true, force: true })
    }
    return target
  }

  trashed(): string[] {
    try { return readdirSync(this.path('trash')).sort().reverse() } catch { return [] }
  }
}
