import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { LocalizedText, MarketEntry, MarketRegistryFile, MarketSource } from './contracts.ts'
import { isSkillName } from './frontmatter.ts'
import official from '../market/official.json' with { type: 'json' }

export const OFFICIAL_REGISTRY_ID = 'official'
/** The official registry's newest copy; the package carries a snapshot for offline use. */
export const OFFICIAL_REGISTRY_URL = 'https://raw.githubusercontent.com/omdsh-dev/dsh-mnemon/main/plugins/dsh-mnemon-source-skills/market/official.json'
/** A registry copy older than this is refreshed when the page opens. */
export const REGISTRY_REFRESH_MS = 6 * 60 * 60 * 1000

const MAX_REGISTRY_BYTES = 2 * 1024 * 1024
const MAX_ENTRIES = 1_000
const MAX_FILES = 300
const MAX_FILE_BYTES = 4 * 1024 * 1024
const MAX_SKILL_BYTES_TOTAL = 12 * 1024 * 1024
const TIMEOUT_MS = 20_000

export interface FetchResponse {
  ok: boolean
  status: number
  text(): Promise<string>
  arrayBuffer(): Promise<ArrayBuffer>
}
export type Fetcher = (url: string, init?: { signal?: AbortSignal; headers?: Record<string, string> }) => Promise<FetchResponse>

export const defaultFetcher: Fetcher = (url, init) => fetch(url, init as RequestInit) as Promise<FetchResponse>

export interface SkillFile {
  path: string
  data: Buffer
}

function object(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function localizedText(value: unknown, maximum: number): LocalizedText | undefined {
  if (typeof value === 'string') return value.trim() === '' ? undefined : value.trim().slice(0, maximum)
  const fields = object(value)
  if (fields === undefined) return undefined
  const en = typeof fields.en === 'string' ? fields.en.trim().slice(0, maximum) : undefined
  const zh = typeof fields['zh-CN'] === 'string' ? fields['zh-CN'].trim().slice(0, maximum) : typeof fields.zh === 'string' ? fields.zh.trim().slice(0, maximum) : undefined
  if (!en && !zh) return undefined
  return { ...(en ? { en } : {}), ...(zh ? { 'zh-CN': zh } : {}) }
}

/** The text for a language, falling back to the other one. */
export function localized(value: LocalizedText | undefined, language: string): string {
  if (value === undefined) return ''
  if (typeof value === 'string') return value
  return (language.startsWith('zh') ? value['zh-CN'] ?? value.en : value.en ?? value['zh-CN']) ?? ''
}

const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u
const REF = /^[A-Za-z0-9_./-]{1,200}$/u

function safeRelative(path: string): string | undefined {
  const normalized = path.replace(/\\/gu, '/').replace(/^\/+|\/+$/gu, '')
  if (normalized.split('/').some(part => part === '..' || part === '')) return normalized === '' ? '' : undefined
  return normalized
}

function source(value: unknown): MarketSource | undefined {
  const fields = object(value)
  if (fields === undefined) return undefined
  if (fields.type === 'github' && typeof fields.repo === 'string' && REPO.test(fields.repo) && typeof fields.path === 'string') {
    const path = safeRelative(fields.path)
    const ref = typeof fields.ref === 'string' && REF.test(fields.ref) ? fields.ref : undefined
    return path === undefined ? undefined : { type: 'github', repo: fields.repo, path, ...(ref === undefined ? {} : { ref }) }
  }
  if (fields.type === 'url' && typeof fields.url === 'string' && /^https?:\/\//u.test(fields.url)) return { type: 'url', url: fields.url }
  if (fields.type === 'path' && typeof fields.path === 'string' && fields.path.trim() !== '') return { type: 'path', path: fields.path.trim() }
  return undefined
}

/** Validate a registry file; entries that cannot be installed are left out, not fatal. */
export function parseRegistry(value: unknown): { registry: MarketRegistryFile; skipped: number } {
  const fields = object(value)
  if (fields === undefined || fields.version !== 1 || !Array.isArray(fields.skills)) throw new Error('a skill registry is a JSON object with "version": 1 and a "skills" array')
  const seen = new Set<string>()
  const skills: MarketEntry[] = []
  let skipped = 0
  for (const raw of fields.skills.slice(0, MAX_ENTRIES)) {
    const entry = object(raw)
    const name = typeof entry?.name === 'string' ? entry.name.trim() : ''
    const description = localizedText(entry?.description, 600)
    const from = source(entry?.source)
    if (entry === undefined || !isSkillName(name) || description === undefined || from === undefined || seen.has(name)) { skipped++; continue }
    seen.add(name)
    const title = localizedText(entry.title, 120)
    const text = (key: string, maximum: number) => typeof entry[key] === 'string' && (entry[key] as string).trim() !== '' ? { [key]: (entry[key] as string).trim().slice(0, maximum) } : {}
    skills.push({
      name, description, source: from,
      ...(title === undefined ? {} : { title }),
      ...text('category', 60), ...text('author', 120), ...text('license', 60), ...text('version', 40),
      ...(typeof entry.homepage === 'string' && /^https?:\/\//u.test(entry.homepage) ? { homepage: entry.homepage } : {}),
      ...(Array.isArray(entry.tags) ? { tags: entry.tags.filter((tag): tag is string => typeof tag === 'string').slice(0, 8).map(tag => tag.slice(0, 40)) } : {}),
    })
  }
  const name = localizedText(fields.name, 120) ?? 'Skills'
  const description = localizedText(fields.description, 600)
  const categories = Array.isArray(fields.categories) ? fields.categories.flatMap(item => {
    const category = object(item)
    const label = localizedText(category?.label, 60)
    return typeof category?.id === 'string' && label !== undefined ? [{ id: category.id.slice(0, 60), label }] : []
  }) : []
  return {
    registry: {
      version: 1, name, skills,
      ...(typeof fields.id === 'string' && /^[a-z0-9][a-z0-9-]{0,62}$/u.test(fields.id) ? { id: fields.id } : {}),
      ...(description === undefined ? {} : { description }),
      ...(typeof fields.homepage === 'string' && /^https?:\/\//u.test(fields.homepage) ? { homepage: fields.homepage } : {}),
      ...(categories.length === 0 ? {} : { categories }),
    },
    skipped,
  }
}

/** The registry the package ships, so the market works offline and before any refresh. */
export function bundledOfficialRegistry(): MarketRegistryFile {
  return parseRegistry(official).registry
}

function signalWithTimeout(signal: AbortSignal | undefined): AbortSignal {
  const timeout = AbortSignal.timeout(TIMEOUT_MS)
  return signal === undefined ? timeout : AbortSignal.any([signal, timeout])
}

function githubHeaders(): Record<string, string> {
  const token = process.env.GITHUB_TOKEN?.trim() || process.env.GH_TOKEN?.trim()
  return { accept: 'application/vnd.github+json', 'user-agent': 'dsh-mnemon', ...(token ? { authorization: `Bearer ${token}` } : {}) }
}

async function fetchText(fetcher: Fetcher, url: string, signal?: AbortSignal, headers?: Record<string, string>): Promise<string> {
  const response = await fetcher(url, { signal: signalWithTimeout(signal), ...(headers === undefined ? {} : { headers }) })
  if (!response.ok) throw new Error(`${url} answered HTTP ${response.status}`)
  const text = await response.text()
  if (Buffer.byteLength(text, 'utf8') > MAX_REGISTRY_BYTES) throw new Error(`${url} is larger than ${MAX_REGISTRY_BYTES} bytes`)
  return text
}

/** Read a registry from an http(s) URL or an absolute file path. */
export async function loadRegistry(location: string, fetcher: Fetcher, signal?: AbortSignal): Promise<MarketRegistryFile> {
  let text: string
  if (/^https?:\/\//u.test(location)) text = await fetchText(fetcher, location, signal)
  else {
    const path = location.startsWith('file://') ? fileURLToPath(location) : location
    if (!isAbsolute(path)) throw new Error('a registry location is an http(s) URL or an absolute file path')
    if (statSync(path).size > MAX_REGISTRY_BYTES) throw new Error(`${path} is larger than ${MAX_REGISTRY_BYTES} bytes`)
    text = readFileSync(path, 'utf8')
  }
  let parsed: unknown
  try { parsed = JSON.parse(text) } catch (error) { throw new Error(`the registry is not valid JSON: ${error instanceof Error ? error.message : String(error)}`) }
  return parseRegistry(parsed).registry
}

/** A stable id for a registry the user adds: its own id when it declares one, else a digest of where it lives. */
export function registryId(location: string, declared: string | undefined, taken: ReadonlySet<string>): string {
  if (declared !== undefined && declared !== OFFICIAL_REGISTRY_ID && !taken.has(declared)) return declared
  return 'registry-' + createHash('sha256').update(location).digest('hex').slice(0, 10)
}

function rawUrl(repo: string, ref: string, path: string): string {
  return `https://raw.githubusercontent.com/${repo}/${encodeURIComponent(ref).replace(/%2F/gu, '/')}/${path.split('/').map(encodeURIComponent).join('/')}`
}

interface GithubTreeEntry { path: string; type: string; size?: number }

async function githubTree(fetcher: Fetcher, repo: string, ref: string, prefix: string, signal?: AbortSignal): Promise<GithubTreeEntry[]> {
  const text = await fetchText(fetcher, `https://api.github.com/repos/${repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`, signal, githubHeaders())
  const tree = object(JSON.parse(text))
  if (!Array.isArray(tree?.tree)) throw new Error(`${repo} returned no file tree for ${ref}`)
  const base = prefix === '' ? '' : prefix + '/'
  const files = (tree.tree as GithubTreeEntry[]).filter(entry => entry.type === 'blob' && typeof entry.path === 'string' && entry.path.startsWith(base))
  if (files.length === 0 && tree.truncated === true) throw new Error(`${repo} is too large to list; use a registry entry with a direct url`)
  return files
}

function checkBudget(files: ReadonlyArray<{ bytes: number }>): void {
  if (files.length > MAX_FILES) throw new Error(`the skill has more than ${MAX_FILES} files`)
  const total = files.reduce((sum, file) => sum + file.bytes, 0)
  if (total > MAX_SKILL_BYTES_TOTAL) throw new Error(`the skill is larger than ${MAX_SKILL_BYTES_TOTAL} bytes`)
  if (files.some(file => file.bytes > MAX_FILE_BYTES)) throw new Error(`a file of the skill is larger than ${MAX_FILE_BYTES} bytes`)
}

function localRoot(entry: MarketEntry & { source: { type: 'path' } }, registryLocation: string): string {
  if (isAbsolute(entry.source.path)) return entry.source.path
  if (/^https?:\/\//u.test(registryLocation)) throw new Error('a relative path source needs a registry that is a local file')
  return resolve(dirname(registryLocation.startsWith('file://') ? fileURLToPath(registryLocation) : registryLocation), entry.source.path)
}

function listLocal(root: string): Array<{ path: string; bytes: number }> {
  const info = statSync(root)
  if (info.isFile()) return [{ path: 'SKILL.md', bytes: info.size }]
  const found: Array<{ path: string; bytes: number }> = []
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name.startsWith('.') && entry.name !== '.well-known') continue
      const full = join(directory, entry.name)
      if (entry.isDirectory()) visit(full)
      else if (entry.isFile()) found.push({ path: relative(root, full).split(sep).join('/'), bytes: statSync(full).size })
      if (found.length > MAX_FILES) throw new Error(`the skill has more than ${MAX_FILES} files`)
    }
  }
  visit(root)
  return found
}

/** The file list of a market entry, without downloading it. */
export async function listSkillFiles(entry: MarketEntry, registryLocation: string, fetcher: Fetcher, signal?: AbortSignal): Promise<Array<{ path: string; bytes: number }>> {
  if (entry.source.type === 'url') return [{ path: 'SKILL.md', bytes: 0 }]
  if (entry.source.type === 'path') return listLocal(localRoot(entry as MarketEntry & { source: { type: 'path' } }, registryLocation))
  const { repo, path } = entry.source
  const ref = entry.source.ref ?? 'main'
  const prefix = path === '' ? '' : path + '/'
  return (await githubTree(fetcher, repo, ref, path, signal)).map(file => ({ path: file.path.slice(prefix.length), bytes: file.size ?? 0 }))
}

/** The SKILL.md of a market entry, for a preview before installing. */
export async function fetchSkillDocument(entry: MarketEntry, registryLocation: string, fetcher: Fetcher, signal?: AbortSignal): Promise<string> {
  if (entry.source.type === 'url') return fetchText(fetcher, entry.source.url, signal)
  if (entry.source.type === 'path') {
    const root = localRoot(entry as MarketEntry & { source: { type: 'path' } }, registryLocation)
    return readFileSync(statSync(root).isFile() ? root : join(root, 'SKILL.md'), 'utf8')
  }
  return fetchText(fetcher, rawUrl(entry.source.repo, entry.source.ref ?? 'main', entry.source.path === '' ? 'SKILL.md' : `${entry.source.path}/SKILL.md`), signal)
}

/** Download every file of a market entry, bounded, with paths kept inside the skill folder. */
export async function fetchSkillFiles(entry: MarketEntry, registryLocation: string, fetcher: Fetcher, signal?: AbortSignal): Promise<SkillFile[]> {
  if (entry.source.type === 'url') return [{ path: 'SKILL.md', data: Buffer.from(await fetchSkillDocument(entry, registryLocation, fetcher, signal), 'utf8') }]
  const listed = await listSkillFiles(entry, registryLocation, fetcher, signal)
  checkBudget(listed)
  const files: SkillFile[] = []
  for (const file of listed) {
    const path = safeRelative(file.path)
    if (path === undefined || path === '') throw new Error('a file of the skill escapes its folder: ' + file.path)
    let data: Buffer
    if (entry.source.type === 'path') {
      const root = localRoot(entry as MarketEntry & { source: { type: 'path' } }, registryLocation)
      data = readFileSync(statSync(root).isFile() ? root : join(root, ...path.split('/')))
    } else {
      const { repo, ref = 'main' } = entry.source
      const response = await fetcher(rawUrl(repo, ref, entry.source.path === '' ? path : `${entry.source.path}/${path}`), { signal: signalWithTimeout(signal) })
      if (!response.ok) throw new Error(`${repo}/${path} answered HTTP ${response.status}`)
      data = Buffer.from(await response.arrayBuffer())
    }
    if (data.byteLength > MAX_FILE_BYTES) throw new Error(`${path} is larger than ${MAX_FILE_BYTES} bytes`)
    files.push({ path, data })
  }
  checkBudget(files.map(file => ({ bytes: file.data.byteLength })))
  if (!files.some(file => file.path === 'SKILL.md')) throw new Error('the skill has no SKILL.md at its top level')
  return files
}
