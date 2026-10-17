// host-bundle-compare.mjs <repo> <before.js> <after.js>: compare two builds of the Host bundle lib/index.js with
// module boundaries normalized. The bundle is one ES module whose body is the scope-hoisted statements of every Host
// module, each module between `//#region <module>` comments. Imports are compared as sets of names per module.
// Top-level statements are compared as multisets, so a statement that only moved to another module's region counts as
// the same; statements that run code when the bundle loads (anything but a declaration of a function, a class or a
// constant initialized without a call) are also compared in order, and any that changed place are listed.
//
// A statement only on one side is explained further where it can be:
// - a class on both sides: its members are compared as multisets, by text;
// - a method that left a class for a top-level function of the same name: its body is compared with the function's
//   after `this.` is dropped from the method and the coordinator's state the function now takes as its first
//   parameter (`host`, `counters` or `runtimeSource`) is dropped from the function, its calls and `host.`;
// - a function whose body now lies across several functions of its module, as registerTools': the body statements
//   are compared as multisets;
// - every `ctx.tools.register(...)` call is compared, in the order the bundle makes them.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

const [repo, beforePath, afterPath] = process.argv.slice(2)
const ts = createRequire(resolve(repo, 'package.json'))('typescript')

function parse(path) {
  const text = readFileSync(path, 'utf8')
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  const regions = []
  const imports = new Map()
  const list = []
  for (const statement of source.statements) {
    const leading = text.slice(statement.getFullStart(), statement.getStart(source))
    for (const match of leading.matchAll(/\/\/#region (.*)/g)) regions.push(match[1])
    if (ts.isImportDeclaration(statement)) {
      const from = statement.moduleSpecifier.text
      const names = imports.get(from) ?? new Set()
      const clause = statement.importClause
      if (clause?.name) names.add(`default as ${clause.name.text}`)
      const bindings = clause?.namedBindings
      if (bindings && ts.isNamespaceImport(bindings)) names.add(`* as ${bindings.name.text}`)
      if (bindings && ts.isNamedImports(bindings)) for (const element of bindings.elements) names.add(element.getText(source))
      imports.set(from, names)
      continue
    }
    list.push({ text: statement.getText(source), node: statement, source, region: regions.at(-1) ?? '(top)' })
  }
  return { text, source, regions, imports, list }
}

function effectful(node) {
  if (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) return false
  if (ts.isVariableStatement(node)) {
    return node.declarationList.declarations.some(declaration => declaration.initializer !== undefined && callsAnything(declaration.initializer))
  }
  if (ts.isExportDeclaration(node)) return false
  return true
}
function callsAnything(node) {
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node) || ts.isClassExpression(node)) return false
  if (ts.isCallExpression(node) || ts.isNewExpression(node) || ts.isTaggedTemplateExpression(node)) return true
  return ts.forEachChild(node, callsAnything) === true
}

const before = parse(beforePath)
const after = parse(afterPath)
const first = text => text.split('\n')[0].slice(0, 150)

console.log(`bytes: before ${readFileSync(beforePath).length}, after ${readFileSync(afterPath).length}`)

// Imports.
const importLines = side => [...side.imports].map(([from, names]) => `${from}: ${[...names].sort().join(', ')}`).sort()
const importsBefore = importLines(before)
const importsAfter = importLines(after)
console.log(`imports: ${importsBefore.length} modules before, ${importsAfter.length} after; same names from each: ${importsBefore.join('\n') === importsAfter.join('\n')}`)
for (const line of importsBefore.filter(line => !importsAfter.includes(line))) console.log(`  - import ${line.slice(0, 200)}`)
for (const line of importsAfter.filter(line => !importsBefore.includes(line))) console.log(`  + import ${line.slice(0, 200)}`)

// Statements as multisets.
function difference(left, right) {
  const counts = new Map()
  for (const item of right) counts.set(item.text, (counts.get(item.text) ?? 0) + 1)
  return left.filter(item => { const n = counts.get(item.text) ?? 0; if (n > 0) { counts.set(item.text, n - 1); return false } return true })
}
const onlyBefore = difference(before.list, after.list)
const onlyAfter = difference(after.list, before.list)
console.log(`top-level statements: before ${before.list.length}, after ${after.list.length}; only before ${onlyBefore.length}, only after ${onlyAfter.length}`)

// Load-time effects in order, and which changed place (not in a longest common subsequence).
const effectsBefore = before.list.filter(item => effectful(item.node))
const effectsAfter = after.list.filter(item => effectful(item.node))
function lcs(a, b) {
  const table = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1))
  for (let i = a.length - 1; i >= 0; i -= 1) for (let j = b.length - 1; j >= 0; j -= 1) {
    table[i][j] = a[i].text === b[j].text ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1])
  }
  const keptA = new Set()
  const keptB = new Set()
  for (let i = 0, j = 0; i < a.length && j < b.length;) {
    if (a[i].text === b[j].text) { keptA.add(i); keptB.add(j); i += 1; j += 1 }
    else if (table[i + 1][j] >= table[i][j + 1]) i += 1
    else j += 1
  }
  return { keptA, keptB }
}
const { keptA, keptB } = lcs(effectsBefore, effectsAfter)
console.log(`load-time effects: before ${effectsBefore.length}, after ${effectsAfter.length}; in the same order: ${keptA.size}; same order throughout: ${keptA.size === effectsBefore.length && keptB.size === effectsAfter.length}`)
effectsBefore.forEach((item, index) => { if (!keptA.has(index)) console.log(`  moved or gone, was in [${item.region}]: ${first(item.text)}`) })
effectsAfter.forEach((item, index) => { if (!keptB.has(index)) console.log(`  moved or new, now in [${item.region}]: ${first(item.text)}`) })

// Regions.
const newRegions = after.regions.filter(region => !before.regions.includes(region))
const goneRegions = before.regions.filter(region => !after.regions.includes(region))
const shared = regions => regions.filter(region => before.regions.includes(region) && after.regions.includes(region))
console.log(`regions: before ${before.regions.length}, after ${after.regions.length}; new ${JSON.stringify(newRegions)}; gone ${JSON.stringify(goneRegions)}; regions in both keep their order: ${shared(before.regions).join('\n') === shared(after.regions).join('\n')}`)

// Classes on both sides.
function classOf(item) {
  const node = item.node
  if (ts.isClassDeclaration(node) && node.name) return { name: node.name.text, node }
  if (ts.isVariableStatement(node)) {
    const declaration = node.declarationList.declarations[0]
    if (declaration?.initializer && ts.isClassExpression(declaration.initializer)) return { name: declaration.name.getText(item.source), node: declaration.initializer }
  }
  return undefined
}
function memberName(member, source) {
  return member.name ? member.name.getText(source) : ts.isConstructorDeclaration(member) ? 'constructor' : '(member)'
}
const movedMethods = new Map()
for (const left of onlyBefore) {
  const leftClass = classOf(left)
  if (leftClass === undefined) continue
  const right = onlyAfter.find(item => classOf(item)?.name === leftClass.name)
  if (right === undefined) continue
  const rightClass = classOf(right)
  const members = (node, source) => node.members.map(member => ({ text: member.getText(source), name: memberName(member, source), node: member, source }))
  const membersBefore = members(leftClass.node, left.source)
  const membersAfter = members(rightClass.node, right.source)
  const gone = difference(membersBefore, membersAfter)
  const added = difference(membersAfter, membersBefore)
  console.log(`class ${leftClass.name}: members before ${membersBefore.length}, after ${membersAfter.length}; only before ${gone.length}, only after ${added.length}`)
  for (const member of gone) {
    const changed = added.find(candidate => candidate.name === member.name)
    if (changed) {
      const lines = text => text.split('\n').map(line => line.trim())
      const removedLines = lines(member.text).filter(line => !lines(changed.text).includes(line))
      const addedLines = lines(changed.text).filter(line => !lines(member.text).includes(line))
      console.log(`  changed ${member.name}:`)
      for (const line of removedLines) console.log(`    - ${line.slice(0, 200)}`)
      for (const line of addedLines) console.log(`    + ${line.slice(0, 200)}`)
    } else {
      console.log(`  left the class: ${member.name}`)
      movedMethods.set(member.name, member)
    }
  }
  for (const member of added) if (!gone.some(candidate => candidate.name === member.name)) console.log(`  new member: ${member.name}\n${member.text.split('\n').map(line => `    ${line}`).join('\n')}`)
}

// Methods that became top-level functions.
const firstParameters = new Set(['host', 'counters', 'runtimeSource'])
const normalizedLines = text => text.split('\n').map(line => line.trim()).join('\n')
let identical = 0
for (const [name, member] of movedMethods) {
  const target = onlyAfter.find(item => ts.isFunctionDeclaration(item.node) && item.node.name?.text === name)
  if (target === undefined) { console.log(`  ${name}: no top-level function of that name`); continue }
  const oldParameters = member.node.parameters.map(parameter => parameter.getText(member.source))
  const newParameters = target.node.parameters.map(parameter => parameter.getText(target.source))
  const extra = newParameters.length === oldParameters.length + 1 && firstParameters.has(newParameters[0]) ? newParameters[0] : undefined
  const sameParameters = (extra === undefined ? newParameters : newParameters.slice(1)).join(', ') === oldParameters.join(', ')
  const oldBody = normalizedLines(member.node.body.getText(member.source)).replaceAll('this.', '')
  let newBody = normalizedLines(target.node.body.getText(target.source)).replaceAll('host.', '')
  for (const parameter of firstParameters) newBody = newBody.replaceAll(`(${parameter}, `, '(')
  const same = oldBody === newBody && sameParameters
  if (same) identical += 1
  console.log(`  ${name}: ${extra === undefined ? 'same parameters' : `takes ${extra} first`}; body ${same ? 'identical' : 'DIFFERENT'} after normalization; async ${(member.node.modifiers ?? []).some(m => m.kind === ts.SyntaxKind.AsyncKeyword)} -> ${(target.node.modifiers ?? []).some(m => m.kind === ts.SyntaxKind.AsyncKeyword)}`)
  if (!same && process.env.SHOW_FULL) console.log(`--- old\n${oldBody}\n--- new\n${newBody}`)
}
if (movedMethods.size > 0) console.log(`methods that left a class: ${movedMethods.size}; identical to their function after normalization: ${identical}`)

// Tool registrations, in the order the bundle makes them.
function registrations(side) {
  const calls = []
  const visit = node => {
    if (ts.isCallExpression(node) && node.expression.getText(side.source) === 'ctx.tools.register') calls.push(node.arguments.map(argument => argument.getText(side.source)).join(', '))
    ts.forEachChild(node, visit)
  }
  visit(side.source)
  return calls
}
const toolsBefore = registrations(before)
const toolsAfter = registrations(after)
const toolName = call => /name: "([^"]+)"/u.exec(call)?.[1] ?? '?'
console.log(`ctx.tools.register calls: before ${toolsBefore.length}, after ${toolsAfter.length}; identical and in the same order: ${toolsBefore.length === toolsAfter.length && toolsBefore.every((call, index) => call === toolsAfter[index])}`)
console.log(`  order: ${toolsAfter.map(toolName).join(', ')}`)

// A function whose body statements now lie across several functions of its module: compare the statements.
const splitFunctions = new Set()
for (const left of onlyBefore) {
  if (!ts.isFunctionDeclaration(left.node) || movedMethods.has(left.node.name?.text)) continue
  const parts = onlyAfter.filter(item => ts.isFunctionDeclaration(item.node) && item.region === left.region && !movedMethods.has(item.node.name?.text))
  if (!parts.some(item => item.node.name?.text === left.node.name?.text)) continue
  const body = (node, source) => node.body.statements.map(statement => ({ text: statement.getText(source) }))
  const oldStatements = body(left.node, left.source)
  const newStatements = parts.flatMap(item => body(item.node, item.source))
  const gone = difference(oldStatements, newStatements)
  const added = difference(newStatements, oldStatements)
  console.log(`function ${left.node.name.text} [${left.region}] now ${parts.length} functions (${parts.map(item => item.node.name.text).join(', ')}): body statements before ${oldStatements.length}, after ${newStatements.length}; only before ${gone.length}, only after ${added.length}`)
  for (const statement of gone) console.log(`    - ${first(statement.text)}`)
  for (const statement of added) console.log(`    + ${first(statement.text)}`)
  splitFunctions.add(left)
  for (const item of parts) splitFunctions.add(item)
}

// Everything else only on one side.
const explained = item => classOf(item) !== undefined || splitFunctions.has(item) || (ts.isFunctionDeclaration(item.node) && movedMethods.has(item.node.name?.text))
for (const item of onlyBefore.filter(item => !explained(item))) console.log(`- [${item.region}] ${first(item.text)}${item.text.includes('\n') ? ` ... (${item.text.split('\n').length} lines)` : ''}`)
for (const item of onlyAfter.filter(item => !explained(item))) console.log(`+ [${item.region}] ${first(item.text)}${item.text.includes('\n') ? ` ... (${item.text.split('\n').length} lines)` : ''}`)
if (process.env.SHOW_FULL) for (const [label, items] of [['-', onlyBefore], ['+', onlyAfter]]) for (const item of items.filter(item => !explained(item))) console.log(`\n${label}${label}${label} [${item.region}]\n${item.text}`)
