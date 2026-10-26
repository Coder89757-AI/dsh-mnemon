import { describe, expect, it } from 'vitest'
import { packageManagerCommand } from '../scripts/package-manager.mjs'

describe('package manager command', () => {
  it('runs a JavaScript package manager entry through Node', () => {
    for (const entry of [
      '/usr/local/lib/node_modules/pnpm/bin/pnpm.cjs',
      '/opt/corepack/dist/pnpm.js',
      'C:\\Program Files\\nodejs\\node_modules\\pnpm\\bin\\pnpm.cjs',
    ]) {
      expect(packageManagerCommand({ npm_execpath: entry })).toEqual({ command: process.execPath, args: [entry] })
    }
  })

  it('runs a standalone package manager executable directly', () => {
    for (const entry of [
      '/home/user/.local/share/pnpm/pnpm',
      '/home/user/.local/bin/pnpm',
      'C:\\tools\\pnpm\\pnpm.exe',
    ]) {
      expect(packageManagerCommand({ npm_execpath: entry })).toEqual({ command: entry, args: [] })
    }
  })

  it('requires the package manager environment', () => {
    expect(() => packageManagerCommand({})).toThrow('Run this check through the package manager')
    expect(() => packageManagerCommand({ npm_execpath: '' })).toThrow('Run this check through the package manager')
  })
})
