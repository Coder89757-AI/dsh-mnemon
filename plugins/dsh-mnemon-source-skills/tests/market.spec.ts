import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { bundledOfficialRegistry, parseRegistry, type Fetcher } from '../src/market.ts'
import { SkillsService } from '../src/service.ts'

let root: string
let now: Date
const SKILL = (name: string, extra = '') => `---\nname: ${name}\ndescription: Do ${name}.\n---\n\n# ${name}\n${extra}`

/** A tiny GitHub: one tree and raw files, counted by URL. */
function github(files: Record<string, string>, calls: string[] = []): Fetcher {
  return async url => {
    calls.push(url)
    const tree = /api\.github\.com\/repos\/([^/]+\/[^/]+)\/git\/trees\//u.exec(url)
    const body = tree !== null
      ? JSON.stringify({ truncated: false, tree: Object.keys(files).map(path => ({ path, type: 'blob', size: files[path]!.length })) })
      : files[decodeURIComponent(url.replace(/^https:\/\/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/[^/]+\//u, ''))]
    if (body === undefined) return { ok: false, status: 404, text: async () => '', arrayBuffer: async () => new ArrayBuffer(0) }
    return { ok: true, status: 200, text: async () => body, arrayBuffer: async () => new TextEncoder().encode(body).buffer as ArrayBuffer }
  }
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'mnemon-skills-market-'))
  now = new Date('2026-10-21T08:00:00.000Z')
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

function service(fetcher: Fetcher): SkillsService {
  return new SkillsService(join(root, 'data'), { dshHome: join(root, 'dsh'), agentsHome: join(root, 'agents') }, () => now, fetcher)
}

describe('skill registries', () => {
  it('ships an official registry whose entries all install from their upstream source', () => {
    const official = bundledOfficialRegistry()
    expect(official.skills.length).toBeGreaterThan(30)
    expect(official.skills.every(entry => entry.source.type === 'github' && typeof entry.description !== 'string')).toBe(true)
    expect(new Set(official.skills.map(entry => entry.name)).size).toBe(official.skills.length)
    const categories = new Set(official.categories!.map(category => category.id))
    expect(official.skills.every(entry => entry.category !== undefined && categories.has(entry.category))).toBe(true)
  })

  it('keeps the entries it can install and drops the rest', () => {
    const { registry, skipped } = parseRegistry({ version: 1, name: 'Team', skills: [
      { name: 'ok-skill', description: 'Fine', source: { type: 'url', url: 'https://example.test/SKILL.md' } },
      { name: 'Bad Name', description: 'x', source: { type: 'url', url: 'https://example.test/a.md' } },
      { name: 'escape', description: 'x', source: { type: 'github', repo: 'a/b', path: '../etc' } },
      { name: 'ok-skill', description: 'duplicate', source: { type: 'url', url: 'https://example.test/b.md' } },
    ] })
    expect(registry.skills.map(entry => entry.name)).toEqual(['ok-skill'])
    expect(skipped).toBe(3)
    expect(() => parseRegistry({ skills: [] })).toThrow('"version": 1')
  })
})

describe('market install', () => {
  it('previews, installs, detects edits and updates a GitHub skill from the official registry', async () => {
    const calls: string[] = []
    const files: Record<string, string> = { 'skills/frontend-design/SKILL.md': SKILL('frontend-design'), 'skills/frontend-design/LICENSE.txt': 'Apache License', 'other/SKILL.md': SKILL('other') }
    const market = service(github(files, calls))
    const view = market.marketView(undefined)
    expect(view.registries[0]).toMatchObject({ id: 'official', builtin: true, enabled: true })
    expect(view.stale).toEqual(['official'])
    expect(view.items.find(item => item.name === 'frontend-design')).toMatchObject({ state: 'available', registryId: 'official' })
    const preview = await market.marketPreview('official', 'frontend-design')
    expect(preview.content).toContain('name: frontend-design')
    expect(preview.files.map(file => file.path).sort()).toEqual(['LICENSE.txt', 'SKILL.md'])
    const installed = await market.installMarket(undefined, { registryId: 'official', name: 'frontend-design' })
    expect(installed).toMatchObject({ updated: false, skill: { key: 'user-dsh:frontend-design' } })
    expect(readFileSync(join(root, 'dsh', 'skills', 'frontend-design', 'LICENSE.txt'), 'utf8')).toBe('Apache License')
    expect(market.marketView(undefined).items.find(item => item.name === 'frontend-design')?.state).toBe('installed')
    expect(market.versions('user-dsh:frontend-design').map(version => version.reason)).toEqual(['install'])

    writeFileSync(join(root, 'dsh', 'skills', 'frontend-design', 'SKILL.md'), SKILL('frontend-design', 'local edit\n'))
    expect(market.marketView(undefined).items.find(item => item.name === 'frontend-design')?.state).toBe('modified')
    await expect(market.installMarket(undefined, { registryId: 'official', name: 'frontend-design' })).rejects.toThrow('edited after it was installed')
    files['skills/frontend-design/SKILL.md'] = SKILL('frontend-design', 'upstream v2\n')
    const updated = await market.installMarket(undefined, { registryId: 'official', name: 'frontend-design', overwrite: true })
    expect(updated.updated).toBe(true)
    expect(readFileSync(join(root, 'dsh', 'skills', 'frontend-design', 'SKILL.md'), 'utf8')).toContain('upstream v2')
    expect(market.store.trashed().length).toBe(1)
    expect(market.versions('user-dsh:frontend-design').map(version => version.reason)).toEqual(['install', 'install'])
  })

  it('refuses a skill whose name exists already and one whose SKILL.md names another skill', async () => {
    mkdirSync(join(root, 'dsh', 'skills', 'theme-factory'), { recursive: true })
    writeFileSync(join(root, 'dsh', 'skills', 'theme-factory', 'SKILL.md'), SKILL('theme-factory'))
    const market = service(github({ 'skills/theme-factory/SKILL.md': SKILL('theme-factory'), 'skills/internal-comms/SKILL.md': SKILL('something-else') }))
    expect(market.marketView(undefined).items.find(item => item.name === 'theme-factory')?.state).toBe('conflict')
    await expect(market.installMarket(undefined, { registryId: 'official', name: 'theme-factory' })).rejects.toThrow('did not come from this market entry')
    await expect(market.installMarket(undefined, { registryId: 'official', name: 'internal-comms' })).rejects.toThrow('names "something-else"')
    expect(existsSync(join(root, 'dsh', 'skills', 'internal-comms'))).toBe(false)
  })

  it('adds a local registry by path, installs from a folder beside it, and switches registries', async () => {
    const shared = join(root, 'team')
    mkdirSync(join(shared, 'skills', 'release-notes', 'templates'), { recursive: true })
    writeFileSync(join(shared, 'skills', 'release-notes', 'SKILL.md'), SKILL('release-notes'))
    writeFileSync(join(shared, 'skills', 'release-notes', 'templates', 'note.md'), 'template')
    writeFileSync(join(shared, 'registry.json'), JSON.stringify({ version: 1, id: 'team', name: { en: 'Team', 'zh-CN': '团队' }, skills: [
      { name: 'release-notes', version: '1.0.0', description: { en: 'Release notes', 'zh-CN': '发布说明' }, source: { type: 'path', path: 'skills/release-notes' } },
    ] }))
    const market = service(github({}))
    await expect(market.addRegistry('relative/registry.json')).rejects.toThrow('absolute path')
    const added = await market.addRegistry(join(shared, 'registry.json'))
    expect(added).toMatchObject({ id: 'team', builtin: false, enabled: true, entries: 1 })
    await expect(market.addRegistry(join(shared, 'registry.json'))).rejects.toThrow('already added')
    await market.installMarket(undefined, { registryId: 'team', name: 'release-notes', root: 'user-agents' })
    expect(readFileSync(join(root, 'agents', 'skills', 'release-notes', 'templates', 'note.md'), 'utf8')).toBe('template')
    await market.toggleRegistry('official', false)
    expect(market.marketView(undefined).items.map(item => item.name)).toEqual(['release-notes'])
    await expect(market.removeRegistry('official')).rejects.toThrow('switched off, not removed')
    await market.removeRegistry('team')
    expect(market.marketView(undefined).registries.map(registry => registry.id)).toEqual(['official'])
  })

  it('keeps the packaged official copy when a refresh fails, and caches a successful one', async () => {
    const market = service(async () => ({ ok: false, status: 404, text: async () => '', arrayBuffer: async () => new ArrayBuffer(0) }))
    await market.refreshMarket()
    const view = market.marketView(undefined)
    expect(view.items.length).toBe(bundledOfficialRegistry().skills.length)
    expect(view.registries[0]!.error).toBeUndefined()
    const fresh = service(async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ version: 1, name: 'Official', skills: [{ name: 'only-one', description: 'x', source: { type: 'url', url: 'https://example.test/SKILL.md' } }] }), arrayBuffer: async () => new ArrayBuffer(0) }))
    await fresh.refreshMarket()
    expect(fresh.marketView(undefined)).toMatchObject({ stale: [], items: [{ name: 'only-one' }] })
  })
})
