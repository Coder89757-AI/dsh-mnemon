import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SkillsService } from '../src/service.ts'

let root: string
let home: string
let agents: string
let workspace: string
let data: string
let now: Date

function service(): SkillsService {
  return new SkillsService(data, { dshHome: home, agentsHome: agents }, () => now)
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'mnemon-trash-'))
  home = join(root, 'dsh')
  agents = join(root, 'agents')
  workspace = join(root, 'project', 'packages', 'app')
  data = join(root, 'data')
  mkdirSync(join(root, 'project', '.git'), { recursive: true })
  mkdirSync(workspace, { recursive: true })
  now = new Date('2026-10-21T08:00:00.000Z')
})

afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('the Trash', () => {
  it('lists a removed skill with where it came from, then restores it', async () => {
    const skills = service()
    const created = await skills.createSkill(workspace, { name: 'release-notes', description: 'Use release-notes.' })
    await skills.deleteSkill(workspace, { key: created.key, expectedHash: created.hash })
    expect(skills.overview(workspace).counts.trash).toBe(1)
    const [entry] = skills.trashItems()
    expect(entry).toMatchObject({ name: 'release-notes', kind: 'bundle', root: 'user-dsh', key: created.key })
    expect(entry!.bytes).toBeGreaterThan(0)
    const restored = await skills.restoreTrash(workspace, { id: entry!.id })
    expect(restored.key).toBe(created.key)
    expect(skills.trashItems()).toEqual([])
    expect(skills.catalogView(workspace).skills.map(skill => skill.key)).toContain(created.key)
  })

  it('deletes an entry for good only from the Trash', async () => {    const skills = service()
    const created = await skills.createSkill(workspace, { name: 'scratch', description: 'Use scratch.' })
    await skills.deleteSkill(workspace, { key: created.key, expectedHash: created.hash })
    const [entry] = skills.trashItems()
    await skills.purgeTrash({ id: entry!.id })
    expect(skills.trashItems()).toEqual([])
    expect(skills.overview(workspace).counts.trash).toBe(0)
    expect(existsSync(join(data, 'skills', 'trash', entry!.id))).toBe(false)
  })

  it('refuses to restore a name the root took back meanwhile', async () => {    const skills = service()
    const created = await skills.createSkill(workspace, { name: 'twice', description: 'Use twice.' })
    await skills.deleteSkill(workspace, { key: created.key, expectedHash: created.hash })
    await skills.createSkill(workspace, { name: 'twice', description: 'Use twice.' })
    const [entry] = skills.trashItems()
    await expect(skills.restoreTrash(workspace, { id: entry!.id })).rejects.toThrow(/already exists/u)
    expect(skills.trashItems()).toHaveLength(1)
  })

  it('still lists an entry removed before entries carried a record', () => {
    const legacy = join(data, 'skills', 'trash', '2026-10-20T09-30-00-000Z-old-skill')
    mkdirSync(legacy, { recursive: true })
    writeFileSync(join(legacy, 'SKILL.md'), '---\nname: old-skill\ndescription: Use old-skill.\n---\n\n# old-skill\n')
    const [entry] = service().trashItems()
    expect(entry).toMatchObject({ name: 'old-skill', kind: 'bundle', trashedAt: '2026-10-20T09:30:00.000Z' })
    expect(entry!.bytes).toBeGreaterThan(0)
  })

  it('names what it cannot find', async () => {
    await expect(service().purgeTrash({ id: 'nope' })).rejects.toThrow('trash entry not found: nope')
  })

  it('empties everything at once and says how much went', async () => {
    const skills = service()
    for (const name of ['one', 'two']) {
      const created = await skills.createSkill(workspace, { name, description: `Use ${name}.` })
      await skills.deleteSkill(workspace, { key: created.key, expectedHash: created.hash })
    }
    expect(skills.trashItems()).toHaveLength(2)
    await expect(skills.emptyTrash()).resolves.toEqual({ purged: 2 })
    expect(skills.trashItems()).toEqual([])
    expect(skills.overview(workspace).counts.trash).toBe(0)
  })
})
