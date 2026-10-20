import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MemoryCompositionRunner } from 'dsh-mnemon/testing'
import * as plugin from '../src/index.ts'
import { strategy } from './fixture.ts'

describe('Skills Source', () => {
  it('manages skills through the protocol and never joins a model View', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'mnemon-skills-source-'))
    const workspace = join(directory, 'workspace')
    mkdirSync(join(directory, 'dsh', 'skills', 'pdf'), { recursive: true })
    mkdirSync(workspace)
    writeFileSync(join(directory, 'dsh', 'skills', 'pdf', 'SKILL.md'), '---\nname: pdf\ndescription: Make PDFs.\n---\n\nSteps.\n')
    const runner = new MemoryCompositionRunner()
    try {
      await runner.mount(strategy, { instanceId: 'strategy' })
      await runner.mount(plugin, { instanceId: 'skills', config: { dataDir: join(directory, 'data'), dshHome: join(directory, 'dsh'), agentsHome: join(directory, 'agents') } })
      const base = { sourceInstanceKey: 'source:skills', scope: { storage: 'custom' as const, workspaceId: workspace }, confirmed: false }
      const catalog = await runner.executeManagement({ ...base, mode: 'read', operation: 'catalog', input: null })
      expect(catalog.value).toMatchObject({ skills: [{ key: 'user-dsh:pdf', name: 'pdf', invocation: { modelInvocable: true, userInvocable: true } }] })
      const skill = (catalog.value as { skills: Array<{ hash: string }> }).skills[0]!
      await expect(runner.executeManagement({ ...base, mode: 'mutate', operation: 'skill-invocation', confirmed: true, expectedRevision: 'stale',
        input: { key: 'user-dsh:pdf', modelInvocable: false, userInvocable: true, expectedHash: skill.hash } })).rejects.toThrow('revision conflict')
      const toggled = await runner.executeManagement({ ...base, mode: 'mutate', operation: 'skill-invocation', confirmed: true, expectedRevision: catalog.revision,
        input: { key: 'user-dsh:pdf', modelInvocable: false, userInvocable: true, expectedHash: skill.hash } })
      expect(toggled.value).toMatchObject({ invocation: { modelInvocable: false, userInvocable: true } })
      expect(toggled.revision).not.toBe(catalog.revision)
      // Settings are the Host's: the Source has none of its own to change.
      await expect(runner.executeManagement({ ...base, mode: 'mutate', operation: 'settings-update', confirmed: true, expectedRevision: toggled.revision, input: { patch: { minConfidence: 0.9 } } })).rejects.toThrow()
      await expect(runner.executeManagement({ ...base, mode: 'read', operation: 'nope', input: null })).rejects.toThrow('unsupported Skills read operation')
      const turn = await runner.beginTurn({ scope: base.scope })
      try {
        expect(turn.view.routes).toEqual([])
        expect(turn.view.actionOffers).toEqual([])
      } finally { turn.release() }
    } finally { await runner.dispose(); rmSync(directory, { recursive: true, force: true }) }
  })
})
