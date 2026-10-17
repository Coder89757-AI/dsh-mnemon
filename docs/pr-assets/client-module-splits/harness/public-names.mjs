// public-names.mjs <repo>: every name each public package entry (root package.json exports and each plugin's) exposes,
// through any chain of re-exports, as TypeScript resolves it from source. One line per entry and name, sorted, with the
// kind of the declaration (value, type or both), so two trees can be diffed by name alone.
// Adapted from docs/pr-assets/remove-dead-code/harness/public-exports.mjs.
import { readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'

const repo = resolve(process.argv[2])
const require = createRequire(resolve(repo, 'package.json'))
const ts = require('typescript')
const entries = []
const addEntries = (directory, prefix) => {
  const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'))
  for (const [subpath, target] of Object.entries(manifest.exports ?? {})) {
    const types = typeof target === 'string' ? target : target.types ?? target.default
    if (typeof types !== 'string' || !/\.d\.ts$|\.ts$|\.tsx$/u.test(types)) continue
    const source = types.replace(/^\.\/lib\/types\//u, '').replace(/\.d\.ts$/u, '')
    const candidates = [source, source.replace(/^\.\/lib\//u, './src/'), 'src/' + source]
    let found = false
    for (const candidate of candidates) {
      for (const extension of ['.ts', '.tsx']) {
        try { readFileSync(join(directory, candidate + extension)); entries.push({ name: prefix + subpath.slice(1), file: join(directory, candidate + extension) }); found = true; break } catch {}
      }
      if (found) break
    }
    if (!found) console.error('no source for', prefix + subpath.slice(1), types)
  }
}
addEntries(repo, 'dsh-mnemon')
for (const plugin of readdirSync(join(repo, 'plugins')).sort()) addEntries(join(repo, 'plugins', plugin), plugin)
const config = ts.getParsedCommandLineOfConfigFile(join(repo, 'tsconfig.json'), {}, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => {} })
const program = ts.createProgram({ rootNames: [...new Set([...config.fileNames, ...entries.map(entry => entry.file)])], options: config.options })
const checker = program.getTypeChecker()
const lines = []
for (const entry of entries) {
  const source = program.getSourceFile(entry.file)
  if (source === undefined) { console.error('no program source for', entry.file); continue }
  const module = checker.getSymbolAtLocation(source)
  if (module === undefined) { lines.push(`${entry.name}\t(no module symbol)`); continue }
  for (const symbol of checker.getExportsOfModule(module)) {
    const target = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol
    const value = (target.flags & ts.SymbolFlags.Value) !== 0
    const type = (target.flags & (ts.SymbolFlags.Type | ts.SymbolFlags.Namespace)) !== 0
    lines.push(`${entry.name}\t${symbol.getName()}\t${value && type ? 'value+type' : value ? 'value' : 'type'}`)
  }
}
console.log(lines.sort().join('\n'))
