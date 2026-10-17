// public-exports.mjs <repo> <name>...: for each name, whether a public package entry (root package.json exports, and each
// plugin's) exposes a declaration of that name, through any chain of re-exports, as TypeScript resolves it.
import { readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'

const [repo, ...names] = process.argv.slice(2)
const require = createRequire(join(repo, 'package.json'))
const ts = require('typescript')
const entries = []
const addEntries = (directory, prefix) => {
  const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'))
  for (const [subpath, target] of Object.entries(manifest.exports ?? {})) {
    const types = typeof target === 'string' ? target : target.types ?? target.default
    if (typeof types !== 'string' || !/\.d\.ts$|\.ts$|\.tsx$/u.test(types)) continue
    // lib/types/src/x.d.ts -> src/x.ts(x)
    const source = types.replace(/^\.\/lib\/types\//u, '').replace(/\.d\.ts$/u, '')
    for (const extension of ['.ts', '.tsx']) {
      try { readFileSync(join(directory, source + extension)); entries.push({ name: prefix + subpath, file: join(directory, source + extension) }); break } catch {}
    }
  }
}
addEntries(repo, 'dsh-mnemon')
for (const plugin of readdirSync(join(repo, 'plugins'))) addEntries(join(repo, 'plugins', plugin), plugin)
const config = ts.getParsedCommandLineOfConfigFile(join(repo, 'tsconfig.json'), {}, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => {} })
const program = ts.createProgram({ rootNames: [...new Set([...config.fileNames, ...entries.map(entry => entry.file)])], options: config.options })
const checker = program.getTypeChecker()
const exposed = new Map()
for (const entry of entries) {
  const source = program.getSourceFile(entry.file)
  if (source === undefined) { console.error('no source for', entry.file); continue }
  const module = checker.getSymbolAtLocation(source)
  if (module === undefined) continue
  for (const symbol of checker.getExportsOfModule(module)) {
    const target = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol
    for (const declaration of target.declarations ?? []) {
      const key = `${target.getName()}@${declaration.getSourceFile().fileName.replace(repo + '/', '')}`
      if (!exposed.has(key)) exposed.set(key, new Set())
      exposed.get(key).add(entry.name)
    }
  }
}
for (const name of names) {
  const hits = [...exposed].filter(([key]) => key.startsWith(name + '@'))
  console.log(name.padEnd(32), hits.length === 0 ? 'not public' : hits.map(([key, from]) => `${key.split('@')[1]} via ${[...from].join(', ')}`).join('; '))
}
