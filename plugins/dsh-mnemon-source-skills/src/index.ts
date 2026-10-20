import type { Context } from '@deepseek-ai/cordis'
import { defineMemoryPlugin, installMemory, memoryConfigurationDigest } from 'dsh-mnemon/extension-sdk'
import { createSkillsMemorySource, type Config } from './source.ts'

export const name = 'dsh-mnemon-source-skills'
export const inject = ['mnemonMemory']
export type { Config }

export const memoryPlugin = defineMemoryPlugin({
  packageName: name,
  label: { en: 'Skills', 'zh-CN': '技能管理' },
  description: {
    en: 'DSH skills in one place, with versions, evolution suggestions from real use, evidence trajectories and eval sets.',
    'zh-CN': '集中管理 DSH 技能：版本、来自实际使用的进化建议、证据轨迹与评测集。',
  },
  roles: ['source'],
  provides: [{ id: 'source.procedural' }],
})

export function apply(ctx: Context, config: Config = {}): void {
  installMemory(ctx, { plugin: memoryPlugin, sources: [createSkillsMemorySource(config)] }, { effectiveDigest: memoryConfigurationDigest(config) })
}

export { createSkillsMemorySource, SKILLS_MEMORY_SOURCE, SKILLS_SOURCE_TYPE_ID, SKILLS_SOURCE_ROLE } from './source.ts'
