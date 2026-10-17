// hooks-compare.mjs <repo> <before client.js> <after client.js>: compare the built MnemonWorkspace of main with the
// MnemonWorkspace and the three hooks it became (useWorkspaceStatus, useSourceCatalog, useWorkspaceNavigation).
//
// 1. Statements: the body statements of the old function against the bodies of the four new ones, as multisets with
//    indentation normalized. The build returns some values inline (`return { x: useMemo(...) }` for the source's
//    `const x = useMemo(...)`); each such value must be the expression the old function gave that const.
// 2. Effects: every hook call in the order the component makes it, a hook's own calls expanded where it is called.
//    React runs a commit's layout effects before its passive ones, so each phase must keep its order: useLayoutEffect
//    in the layout phase, useEffect and useSyncExternalStore's subscription in the passive phase.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'

const [repo, beforePath, afterPath] = process.argv.slice(2)
const ts = createRequire(resolve(repo, 'package.json'))('typescript')
const HOOKS = ['useWorkspaceStatus', 'useSourceCatalog', 'useWorkspaceNavigation']

function functions(path) {
  const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  const found = new Map()
  const visit = node => {
    if (ts.isFunctionDeclaration(node) && node.name !== undefined && node.body !== undefined) found.set(node.name.text, { node, source })
    ts.forEachChild(node, visit)
  }
  visit(source)
  return found
}
const normalize = text => text.split('\n').map(line => line.trim()).join('\n')
const short = text => normalize(text).replaceAll('\n', ' ').slice(0, 160)
const before = functions(beforePath).get('MnemonWorkspace')
const afterFunctions = functions(afterPath)
const after = [...HOOKS, 'MnemonWorkspace'].map(name => afterFunctions.get(name))
const statements = ({ node, source }) => node.body.statements.map(statement => ({ statement, source, text: normalize(statement.getText(source)) }))

// 1. Statements.
const left = statements(before)
const right = after.flatMap(statements)
const take = (list, other) => {
  const counts = other.reduce((map, item) => map.set(item.text, (map.get(item.text) ?? 0) + 1), new Map())
  return list.filter(item => { const n = counts.get(item.text) ?? 0; if (n > 0) { counts.set(item.text, n - 1); return false } return true })
}
const onlyBefore = take(left, right)
const onlyAfter = take(right, left)
const initializers = new Map(onlyBefore.flatMap(({ statement, source }) => ts.isVariableStatement(statement)
  ? statement.declarationList.declarations.filter(d => ts.isIdentifier(d.name) && d.initializer).map(d => [d.name.text, normalize(d.initializer.getText(source))]) : []))
const inlined = new Set()
for (const { statement, source } of onlyAfter) {
  if (!ts.isReturnStatement(statement) || statement.expression === undefined || !ts.isObjectLiteralExpression(statement.expression)) continue
  for (const property of statement.expression.properties) {
    if (!ts.isPropertyAssignment(property)) continue
    const name = property.name.getText(source)
    if (initializers.get(name) === normalize(property.initializer.getText(source))) inlined.add(name)
  }
}
const explained = onlyBefore.filter(({ statement }) => !(ts.isVariableStatement(statement) && statement.declarationList.declarations.every(d => inlined.has(d.name.getText(before.source)))))
console.log(`statements: MnemonWorkspace before ${left.length}; ${[...HOOKS, 'MnemonWorkspace'].join(' + ')} after ${right.length}`)
console.log(`  before only, returned inline by a hook with the same expression: ${[...inlined].join(', ') || 'none'}`)
console.log(`  before only, otherwise: ${explained.length}`)
for (const item of explained) console.log(`  - ${short(item.text)}`)
console.log(`  after only: ${onlyAfter.length}`)
for (const item of onlyAfter) console.log(`  + ${short(item.text)}`)

// 2. Effects.
function hookCalls(fn) {
  const out = []
  const visit = node => {
    if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) return
    if (ts.isCallExpression(node)) {
      ts.forEachChild(node, visit)
      const name = node.expression.getText(fn.source).replace(/^\(0, /u, '').replace(/\)$/u, '').split('.').at(-1)
      if (HOOKS.includes(name)) out.push(...hookCalls(afterFunctions.get(name)))
      else if (/^use[A-Z]/u.test(name)) out.push({ name, text: short(node.arguments[0]?.getText(fn.source) ?? '').slice(0, 90) })
      return
    }
    ts.forEachChild(node, visit)
  }
  for (const statement of fn.node.body.statements) visit(statement)
  return out
}
const beforeCalls = hookCalls(before)
const afterCalls = hookCalls(afterFunctions.get('MnemonWorkspace'))
console.log(`hook calls: before ${beforeCalls.length}, after ${afterCalls.length}`)
for (const [phase, names] of [['layout', ['useLayoutEffect']], ['passive', ['useEffect', 'useSyncExternalStore']]]) {
  const effects = calls => calls.filter(call => names.includes(call.name)).map(call => `${call.name} ${call.text}`)
  const [l, r] = [effects(beforeCalls), effects(afterCalls)]
  console.log(`${phase} effects: before ${l.length}, after ${r.length}, same order: ${l.length === r.length && l.every((text, index) => text === r[index])}`)
  for (const text of r) console.log(`  ${text}`)
}
