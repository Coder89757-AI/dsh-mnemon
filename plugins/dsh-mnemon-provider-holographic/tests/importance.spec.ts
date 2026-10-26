import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { createMemorySpaceProviderFixture } from 'dsh-mnemon-source-memory-spaces/testing'
import { HolographicProvider, descriptor } from '../src/index.ts'

const directories: string[] = []
afterEach(() => { for (const path of directories.splice(0)) rmSync(path, { recursive: true, force: true }) })
function fixture() {
  const dataDir = mkdtempSync(join(tmpdir(), 'holographic-importance-'))
  directories.push(dataDir)
  const dataPath = join(dataDir, 'facts.json')
  const { authority, body } = createMemorySpaceProviderFixture(descriptor, { dataPath, defaultTrust: 0.7, minTrust: 0.5 }, { dataDir })
  return { body, dataPath, provider: new HolographicProvider(authority), facts: () => JSON.parse(readFileSync(dataPath, 'utf8')).facts }
}

it('normalizes explicit importance, keeps the configured default, and applies minTrust to every read', async () => {
  const f = fixture()
  const low = await f.provider.remember(f.body, { content: 'Release checklist low', importance: 1, entities: ['Release'] }) as { id: string }
  const high = await f.provider.remember(f.body, { content: 'Release checklist high', importance: 5, entities: ['Release'] }) as { id: string }
  await f.provider.remember(f.body, { content: 'Release checklist default', entities: ['Release'] })
  expect(f.facts().map((row: { trustScore: number }) => row.trustScore)).toEqual([0.2, 1, 0.7])
  expect((await f.provider.search(f.body, { query: 'Release' })).results.map(row => row.id)).not.toContain(low.id)
  expect((await f.provider.list(f.body, {})).map(row => row.id)).not.toContain(low.id)
  expect((await f.provider.related(f.body, high.id, 1)).map(row => row.id)).not.toContain(low.id)
  expect(f.facts()).toHaveLength(3)
  expect((await f.provider.list(f.body, {})).find(row => row.id === high.id)?.importance).toBe(5)
})

it('keeps legacy trust values and original facts intact when adding a new fact', async () => {
  const f = fixture()
  await f.provider.remember(f.body, { content: 'Legacy fact', importance: 5 })
  const legacy = f.facts()
  delete legacy[0].importance
  writeFileSync(f.dataPath, JSON.stringify({ version: 1, facts: legacy }))
  await f.provider.remember(f.body, { content: 'New fact', importance: 3 })
  expect(f.facts()[0]).toEqual(legacy[0])
  expect(f.facts()[1]).toMatchObject({ importance: 3, trustScore: 0.6 })
})

it.each([0, 6, 1.5, NaN, Infinity])('refuses invalid importance %s without writing a fact', async importance => {
  const f = fixture()
  await expect(f.provider.remember(f.body, { content: 'Invalid fact', importance })).rejects.toThrow('importance')
  expect((await f.provider.list(f.body, {}))).toEqual([])
})
