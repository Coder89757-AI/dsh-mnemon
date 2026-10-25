import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
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

  it('restores to the original project and original bundle path after switching workspaces', async () => {
    const skills = service()
    const created = await skills.createSkill(workspace, { name: 'project-rules', description: 'For this project only.', root: 'project-dsh' })
    const original = join(root, 'project', '.dsh', 'skills', 'custom-folder')
    renameSync(join(root, 'project', '.dsh', 'skills', 'project-rules'), original)
    await skills.deleteSkill(workspace, { key: created.key, expectedHash: created.hash })
    const other = join(root, 'other-project')
    mkdirSync(join(other, '.git'), { recursive: true })
    const entry = skills.trashItems()[0]!
    expect(entry).toMatchObject({ workspace: join(root, 'project'), originalPath: original })
    expect(skills.previewTrashRestore(other, { id: entry.id })).toMatchObject({ path: original, needsRoot: false })
    await expect(skills.restoreTrash(other, { id: entry.id })).resolves.toMatchObject({ path: original })
    expect(existsSync(join(original, 'SKILL.md'))).toBe(true)
    expect(existsSync(join(other, '.dsh', 'skills', 'project-rules'))).toBe(false)
  })

  it('requires a chosen root for legacy files and project records without a recorded project', async () => {
    const skills = service()
    const id = '2026-10-20T09-30-00-000Z-old-skill.md'
    const trash = join(data, 'skills', 'trash')
    mkdirSync(trash, { recursive: true })
    writeFileSync(join(trash, id), '---\nname: old-skill\ndescription: Old skill.\n---\nBody\n')
    writeFileSync(join(trash, id + '.json'), '{damaged optional metadata')
    expect(skills.previewTrashRestore(workspace, { id }).needsRoot).toBe(true)
    await expect(skills.restoreTrash(workspace, { id })).rejects.toThrow('choose a root')
    writeFileSync(join(trash, id + '.json'), JSON.stringify({ name: 'old-skill', kind: 'file', root: 'project-dsh' }))
    await expect(skills.restoreTrash(workspace, { id })).rejects.toThrow('choose a root')
    const restored = await skills.restoreTrash(workspace, { id, root: 'user-agents' })
    expect(restored.path).toBe(join(agents, 'skills', 'old-skill.md'))
  })

  it('detects conflicts across layouts and allows renaming without losing bundle resources', async () => {
    const skills = service()
    const created = await skills.createSkill(workspace, { name: 'notes', description: 'Saved bundle.' })
    writeFileSync(join(home, 'skills', 'notes', 'template.txt'), 'retained resource')
    await skills.deleteSkill(workspace, { key: created.key, expectedHash: created.hash })
    writeFileSync(join(home, 'skills', 'notes.md'), '---\nname: notes\ndescription: Current flat file.\n---\nCurrent\n')
    const entry = skills.trashItems()[0]!
    expect(skills.previewTrashRestore(workspace, { id: entry.id }).conflict).toBeDefined()
    await expect(skills.restoreTrash(workspace, { id: entry.id })).rejects.toThrow('already exists')
    const restored = await skills.restoreTrash(workspace, { id: entry.id, name: 'notes-recovered' })
    expect(skills.skill(workspace, restored.key).name).toBe('notes-recovered')
    expect(readFileSync(join(restored.path, 'template.txt'), 'utf8')).toBe('retained resource')
    expect(readFileSync(join(home, 'skills', 'notes.md'), 'utf8')).toContain('Current flat file.')
    expect(skills.versions(restored.key)[0]?.reason).toBe('restore')
  })

  it('requires the current hash for replacement and retains the replaced skill in the Trash', async () => {
    const skills = service()
    const old = await skills.createSkill(workspace, { name: 'replace-me', description: 'Original.' })
    await skills.deleteSkill(workspace, { key: old.key, expectedHash: old.hash })
    const entry = skills.trashItems()[0]!
    const current = await skills.createSkill(workspace, { name: 'replace-me', description: 'Current.' })
    await expect(skills.restoreTrash(workspace, { id: entry.id, replace: true, expectedHash: old.hash })).rejects.toThrow('confirm replacement')
    expect(skills.skill(workspace, current.key).description).toBe('Current.')
    await skills.restoreTrash(workspace, { id: entry.id, replace: true, expectedHash: current.hash })
    expect(skills.skill(workspace, old.key).description).toBe('Original.')
    const displaced = skills.trashItems()
    expect(displaced).toHaveLength(1)
    expect(displaced[0]!.id).not.toBe(entry.id)
    expect(skills.store.trashContent(displaced[0]!)).toContain('Current.')
  })

  it('refuses tampered original paths and leaves the recoverable entry intact', async () => {
    const skills = service()
    const created = await skills.createSkill(workspace, { name: 'safe', description: 'Safe.' })
    await skills.deleteSkill(workspace, { key: created.key, expectedHash: created.hash })
    const entry = skills.trashItems()[0]!
    const record = join(data, 'skills', 'trash', entry.id + '.json')
    writeFileSync(record, JSON.stringify({ ...entry, originalPath: join(root, 'outside', 'safe') }))
    await expect(skills.restoreTrash(workspace, { id: entry.id })).rejects.toThrow('root has changed')
    expect(skills.trashItems()).toHaveLength(1)
    expect(existsSync(join(root, 'outside'))).toBe(false)
    await expect(skills.purgeTrash({ id: '../outside' })).rejects.toThrow('not found')
  })

  it.runIf(process.platform !== 'win32')('does not follow links while sizing or purging, or overwrite a dangling target', async () => {
    const skills = service()
    const created = await skills.createSkill(workspace, { name: 'linked', description: 'Linked.' })
    symlinkSync('.', join(home, 'skills', 'linked', 'cycle'))
    await skills.deleteSkill(workspace, { key: created.key, expectedHash: created.hash })
    const entry = skills.trashItems()[0]!
    expect(entry.bytes).toBeGreaterThan(0)
    symlinkSync(join(root, 'missing'), join(home, 'skills', 'linked'))
    await expect(skills.restoreTrash(workspace, { id: entry.id })).rejects.toThrow('another file')
    const before = skills.revision(workspace)
    await skills.purgeTrash({ id: entry.id })
    expect(skills.revision(workspace)).not.toBe(before)
  })

  it.runIf(process.platform !== 'win32')('restores a relative directory link without changing its target or requiring it to resolve inside the Trash', async () => {
    const skills = service()
    const created = await skills.createSkill(workspace, { name: 'shared', description: 'Linked bundle.' })
    const path = join(home, 'skills', 'shared')
    renameSync(path, join(home, 'shared-bundle'))
    symlinkSync('../shared-bundle', path)
    await skills.deleteSkill(workspace, { key: created.key, expectedHash: created.hash })
    const entry = skills.trashItems()[0]!
    await skills.restoreTrash(workspace, { id: entry.id })
    expect(lstatSync(path).isSymbolicLink()).toBe(true)
    expect(readlinkSync(path)).toBe('../shared-bundle')
    expect(skills.skill(workspace, created.key).description).toBe('Linked bundle.')
    expect(skills.versions(created.key)[0]?.reason).toBe('restore')
    expect(skills.trashItems()).toEqual([])
  })
})
