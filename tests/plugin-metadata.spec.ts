import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { memoryPlugin as documents } from 'dsh-mnemon-source-documents'
import { memoryPlugin as spaces } from 'dsh-mnemon-source-memory-spaces'
import { NATIVE_PROVIDER_ID } from 'dsh-mnemon-source-memory-spaces/contracts'
import { memoryPlugin as runtime } from 'dsh-mnemon-source-runtime'
import { memoryPlugin as skills } from 'dsh-mnemon-source-skills'
import { memoryPlugin as capture } from 'dsh-mnemon-strategy-auto-capture'
import { memoryPlugin as threeTier } from 'dsh-mnemon-strategy-default-three-tier'
import { memoryPlugin as general } from 'dsh-mnemon-strategy-general'
import { memoryPlugin as light } from 'dsh-mnemon-strategy-light-context'
import { memoryPlugin as scoped } from 'dsh-mnemon-strategy-scoped'
import { STARTER_COMPONENT_ROWS, STARTER_ENHANCEMENT_PACKAGES, STARTER_SELF_REGISTERING_PACKAGES } from '../src/host/starter-components.ts'
import type { MemoryPluginEntryView } from '../src/host/view-protocol.ts'
import { isShipped } from '../src/client/component-copy.ts'

const components = [runtime, documents, spaces, skills, threeTier, general, capture, light, scoped]
const read = (path: string): Record<string, unknown> => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')) as Record<string, unknown>

describe('component package metadata', () => {
  // DSH names a package's rows from its locale files; the board names them from the declaration.
  it.each(components.map(plugin => [plugin.packageName, plugin] as const))('%s shows DSH the name and description it declares', (packageName, plugin) => {
    for (const [file, language] of [['en', 'en'], ['zh', 'zh-CN']] as const) {
      expect(read(`plugins/${packageName}/locale/${file}.json`)).toEqual({ meta: { title: plugin.label?.[language], description: plugin.description?.[language] } })
    }
    const manifest = read(`plugins/${packageName}/package.json`) as { exports: Record<string, unknown>; files: string[] }
    expect(manifest.exports['./locale/*.json']).toBe('./locale/*.json')
    expect(manifest.files).toContain('locale')
  })

  it('gives every component row the Starter declares a page of its own', () => {
    // Row ids and module names in the bundle patch, for the rows that name a memory component.
    const patch = readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
    const rows = [...patch.matchAll(/- id: ([\w-]+)\n\s+name: (dsh-mnemon-(?:source|strategy)-[\w-]+)/gu)]
    expect(rows.map(row => ({ rowId: row[1], packageName: row[2] }))).toEqual(STARTER_COMPONENT_ROWS)
    expect(rows.map(row => row[2]).sort()).toEqual(components.map(plugin => plugin.packageName).sort())
  })

  it('names exactly the components package.json pins', () => {
    const { dependencies } = read('package.json') as { dependencies: Record<string, string> }
    const pinned = Object.entries(dependencies).filter(([name]) => /^dsh-mnemon-(?:source|strategy)-/u.test(name))
    expect(pinned.map(([name]) => name).sort()).toEqual(STARTER_COMPONENT_ROWS.map(row => row.packageName).sort())
    // One exact version each, a release candidate's prerelease included, never a range.
    for (const [name, version] of pinned) expect(version, name).toMatch(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u)
  })

  it('tells a shipped component from an installed one by the Starter rows', () => {
    for (const { packageName } of STARTER_COMPONENT_ROWS) expect(isShipped({ packageName } as MemoryPluginEntryView), packageName).toBe(true)
    for (const packageName of ['dsh-mnemon-strategy-focus', 'dsh-mnemon-provider-mem0', 'dsh-mnemon']) {
      expect(isShipped({ packageName } as MemoryPluginEntryView), packageName).toBe(false)
    }
  })

  it('names the shipped enhancements and the packages whose own bundle patch registers their row', () => {
    const patch = readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
    const enhancements = components.filter(plugin => plugin.roles.includes('strategy-extension')).map(plugin => plugin.packageName)
    expect([...STARTER_ENHANCEMENT_PACKAGES].sort()).toEqual(enhancements.sort())
    // Each ships switched off in the Starter's own patch.
    for (const name of STARTER_ENHANCEMENT_PACKAGES) expect(patch, name).toMatch(new RegExp(`name: ${name}\n\\s+disabled: true\n`, 'u'))
    const withOwnPatch = STARTER_COMPONENT_ROWS.map(row => row.packageName)
      .filter(name => (read(`plugins/${name}/package.json`) as { dsh?: { bundle?: { patch?: string } } }).dsh?.bundle?.patch !== undefined)
    expect([...STARTER_SELF_REGISTERING_PACKAGES].sort()).toEqual(withOwnPatch.sort())
  })

  it('installs Mnemon Native under the id Memory Spaces knows it by', () => {
    const patch = readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
    expect(patch).toMatch(new RegExp(`- use: dsh-mnemon-provider-mnemon-native\n\\s+instanceId: ${NATIVE_PROVIDER_ID}\n`, 'u'))
  })
})
