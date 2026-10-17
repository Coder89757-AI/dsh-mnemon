// review-mutations.mjs [repo]: apply, one at a time, each change that passed every test of the first version of
// this record, run the check that now catches it, and restore the file. Prints one JSON line per change. Run it on a
// clean tree, with pnpm on PATH; it changes one source file at a time and always writes the original back.
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const repo = process.argv[2] ?? process.cwd()
const checks = {
  test: ['exec', 'vitest', 'run', 'tests/memory-tools.spec.ts'],
  types: ['exec', 'tsc', '-p', 'tsconfig.json', '--noEmit'],
}
const changes = [
  ['the named tools\' output schema', 'src/host/tools.ts',
    "const JSON_OBJECT_OUTPUT = { type: 'object', additionalProperties: true } as const",
    "const JSON_OBJECT_OUTPUT = { type: 'object', additionalProperties: false } as const", 'test'],
  ['the result tool\'s output schema', 'src/host/subagent.ts',
    "recorded: { type: 'boolean', const: true }", "recorded: { type: 'boolean' }", 'test'],
  ['mnemon_related counted as an inspection and mnemon_memory_bodies as a recall', 'src/host/activity.ts',
    '  const tool = memoryTool(name)\n',
    "  if (name === 'mnemon_related') return 'inspections'\n  if (name === 'mnemon_memory_bodies') return 'recalls'\n  const tool = memoryTool(name)\n", 'test'],
  ['a renamed tool in the space write guard', 'src/host/subagent.ts',
    "isTool(execution.name, 'mnemon_memory_body_merge')", "isTool(execution.name, 'mnemon_memory_bodies_merge')", 'types'],
  ['an inspection given activity', 'src/host/tools.ts',
    "import { memoryReadPresentation, memoryWritePresentation, namedToolPresentation } from './activity-presentation.ts'\n",
    "import { memoryReadPresentation, memoryWritePresentation, namedToolPresentation } from './activity-presentation.ts'\nexport const inspectionActivity = namedToolPresentation('mnemon_status')\n", 'types'],
  ['a page the table types and the anchor does not', 'src/host/memory-tools.ts',
    "export type MemoryToolPage = 'status' | `${string}/${string}`", "export type MemoryToolPage = 'status' | 'home' | `${string}/${string}`", 'types'],
  ['a page the anchor types and the table does not', 'src/client/anchor.ts',
    "export type MnemonAnchorPage = 'status' | `${string}/${string}`", "export type MnemonAnchorPage = 'status' | 'home' | `${string}/${string}`", 'types'],
]
for (const [change, file, from, to, check] of changes) {
  const path = join(repo, file)
  const original = readFileSync(path, 'utf8')
  if (original.split(from).length !== 2) throw new Error(`${file}: the text to change is not there exactly once`)
  writeFileSync(path, original.replace(from, () => to))
  let caught = false
  try {
    execFileSync('pnpm', checks[check], { cwd: repo, stdio: 'pipe' })
  } catch {
    caught = true
  } finally {
    writeFileSync(path, original)
  }
  console.log(JSON.stringify({ change, file, check, caught }))
}
