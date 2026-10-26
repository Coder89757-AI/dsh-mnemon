// spans.mjs <repo> <file|rev:file>...: lines, bytes and the line span of every top-level function and class of each file.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

const [repo, ...specs] = process.argv.slice(2)
const ts = createRequire(resolve(repo, 'package.json'))('typescript')
for (const spec of specs) {
  const text = /^[0-9a-f]{7,40}:/u.test(spec) ? execFileSync('git', ['-C', repo, 'show', spec], { encoding: 'utf8', maxBuffer: 64 << 20 }) : readFileSync(resolve(repo, spec), 'utf8')
  const source = ts.createSourceFile(spec, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const line = position => source.getLineAndCharacterOfPosition(position).line + 1
  const spans = source.statements.filter(node => (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) && node.name)
    .map(node => ({ name: node.name.text, lines: line(node.getEnd()) - line(node.getStart(source)) + 1, members: ts.isClassDeclaration(node) ? node.members.length : undefined }))
    .filter(span => span.lines >= 30)
  console.log(`${spec}: ${text.split('\n').length - 1} lines, ${Buffer.byteLength(text)} bytes; ${spans.map(span => `${span.name} ${span.lines}${span.members === undefined ? '' : ` (${span.members} members)`}`).join(', ')}`)
}
