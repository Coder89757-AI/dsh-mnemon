// moved-lines.mjs [--indent] --before <file|rev:file>... --after <file|rev:file>...: compare the code lines of a set of
// files before and after a move, as multisets. Import statements and blank lines are left out, and a line that only
// gained `export` counts as moved. With --indent, leading whitespace is ignored too, for code that moved into or out of
// a function body. A `rev:path` argument reads the file at that revision with git; run it from the repository root.
//
// Prints every line that is only before or only after, so a reader sees each line that is not a verbatim move.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const args = process.argv.slice(2)
const indent = args.includes('--indent')
const rest = args.filter(arg => arg !== '--indent')
const split = rest.indexOf('--after')
if (rest[0] !== '--before' || split < 0) throw new Error('usage: moved-lines.mjs [--indent] --before <files...> --after <files...>')
const read = spec => /^[0-9a-f]{7,40}:/u.test(spec) ? execFileSync('git', ['show', spec], { encoding: 'utf8', maxBuffer: 64 << 20 }) : readFileSync(spec, 'utf8')

function codeLines(specs) {
  const lines = new Map()
  const origin = new Map()
  for (const spec of specs) {
    let inImport = false
    for (const raw of read(spec).split('\n')) {
      const line = raw.trimEnd()
      const stripped = line.trim()
      if (inImport) {
        if (/from ['"][^'"]+['"]$/u.test(stripped)) inImport = false
        continue
      }
      if (/^(import|export) .* from ['"][^'"]+['"]$/u.test(stripped) || /^import ['"]/u.test(stripped)) continue
      if (/^(import|export)( type)? \{$/u.test(stripped)) { inImport = true; continue }
      if (stripped === '') continue
      const key = indent ? stripped : line
      lines.set(key, (lines.get(key) ?? 0) + 1)
      if (!origin.has(key)) origin.set(key, spec.split('/').at(-1))
    }
  }
  return { lines, origin }
}

const before = codeLines(rest.slice(1, split))
const after = codeLines(rest.slice(split + 1))
const subtract = (left, right) => new Map([...left].map(([line, count]) => [line, count - (right.get(line) ?? 0)]).filter(([, count]) => count > 0))
const removed = subtract(before.lines, after.lines)
const added = subtract(after.lines, before.lines)
const exported = []
for (const [line, count] of [...added]) {
  const bare = line.replace(/^(\s*)export /u, '$1')
  if (bare === line || !removed.has(bare)) continue
  const moved = Math.min(count, removed.get(bare))
  exported.push(bare)
  if (count === moved) added.delete(line); else added.set(line, count - moved)
  if (removed.get(bare) === moved) removed.delete(bare); else removed.set(bare, removed.get(bare) - moved)
}
const total = map => [...map.values()].reduce((sum, count) => sum + count, 0)
console.log(`code lines before ${total(before.lines)}, after ${total(after.lines)}; gained export ${exported.length}; only before ${total(removed)}; only after ${total(added)}`)
for (const line of exported) console.log(`  export  ${line.trim().slice(0, 150)}`)
for (const [line, count] of removed) console.log(`- ${count}x ${line.trim().slice(0, 200)}    [${before.origin.get(line)}]`)
for (const [line, count] of added) console.log(`+ ${count}x ${line.trim().slice(0, 200)}    [${after.origin.get(line)}]`)
