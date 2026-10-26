// bundle-compare.mjs <repo> <before.js> <after.js>: compare two builds of a DSH client bundle with its module boundaries
// normalized. The bundle is one factory whose body is the scope-hoisted statements of every module, between
// `//#region <module>` comments. Region comments are left out, and the top-level statements are compared as multisets:
// a statement that only moved to another module's region counts as the same. Statements that run code when the bundle
// loads (anything but a declaration of a function, a class or a constant initialized without a call) must also keep
// their order, since that order is what moving a module could change.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'

const [repo, beforePath, afterPath] = process.argv.slice(2)
const ts = createRequire(resolve(repo, 'package.json'))('typescript')

// A virtual CSS module's region names its absolute path; keep it from the repository's src/ or plugins/ on, so two
// checkouts in different directories compare.
function relativeRegion(name) {
  const colon = name.indexOf(':/')
  if (colon < 0) return name
  const path = name.slice(colon + 1)
  const start = Math.max(path.lastIndexOf('/src/'), path.lastIndexOf('/plugins/'))
  return name.slice(0, colon + 1) + (start < 0 ? path : path.slice(start + 1))
}

function statements(path) {
  const text = readFileSync(path, 'utf8')
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  let body
  const find = node => {
    if (body === undefined && ts.isPropertyAssignment(node) && node.name.getText(source) === 'factory' && ts.isArrowFunction(node.initializer)) body = node.initializer.body
    ts.forEachChild(node, find)
  }
  find(source)
  const regions = []
  const list = body.statements.map(statement => {
    const leading = text.slice(statement.getFullStart(), statement.getStart(source))
    for (const match of leading.matchAll(/\/\/#region (.*)/g)) regions.push(relativeRegion(match[1]))
    return { text: statement.getText(source), node: statement, region: regions.at(-1) ?? '(top)' }
  })
  return { list, regions }
}

// A load-time effect: anything that runs code when the factory runs, beyond binding names.
function effectful(node) {
  if (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) return false
  if (ts.isVariableStatement(node)) {
    return node.declarationList.declarations.some(declaration => declaration.initializer !== undefined && callsAnything(declaration.initializer))
  }
  return true
}
function callsAnything(node) {
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node) || ts.isClassExpression(node)) return false
  if (ts.isCallExpression(node) || ts.isNewExpression(node) || ts.isTaggedTemplateExpression(node)) return true
  return ts.forEachChild(node, callsAnything) === true
}

const before = statements(beforePath)
const after = statements(afterPath)
const count = list => list.reduce((map, item) => map.set(item.text, (map.get(item.text) ?? 0) + 1), new Map())
const beforeCounts = count(before.list)
const afterCounts = count(after.list)
const onlyBefore = before.list.filter(item => { const left = afterCounts.get(item.text) ?? 0; if (left > 0) { afterCounts.set(item.text, left - 1); return false } return true })
const onlyAfter = after.list.filter(item => { const left = beforeCounts.get(item.text) ?? 0; if (left > 0) { beforeCounts.set(item.text, left - 1); return false } return true })

const effects = list => list.filter(item => effectful(item.node)).map(item => item.text)
const beforeEffects = effects(before.list)
const afterEffects = effects(after.list)
const sameEffects = beforeEffects.length === afterEffects.length && beforeEffects.every((text, index) => text === afterEffects[index])

const newRegions = after.regions.filter(region => !before.regions.includes(region))
const goneRegions = before.regions.filter(region => !after.regions.includes(region))
const order = regions => regions.filter(region => before.regions.includes(region) && after.regions.includes(region))
const sameRegionOrder = order(before.regions).join('\n') === order(after.regions).join('\n')

console.log(`bytes: before ${readFileSync(beforePath).length}, after ${readFileSync(afterPath).length}`)
console.log(`top-level statements: before ${before.list.length}, after ${after.list.length}; only before ${onlyBefore.length}, only after ${onlyAfter.length}`)
console.log(`load-time effects: before ${beforeEffects.length}, after ${afterEffects.length}, same order: ${sameEffects}`)
console.log(`regions: before ${before.regions.length}, after ${after.regions.length}; new ${JSON.stringify(newRegions)}; gone ${JSON.stringify(goneRegions)}; regions in both keep their order: ${sameRegionOrder}`)
// Style sheets: each CSS module's region holds the injected sheet and the class map the code reads; both must match.
const cssRegions = side => side.list.filter(item => /css/u.test(item.region) && !item.region.endsWith('.tsx') && !item.region.endsWith('.ts'))
  .reduce((map, item) => map.set(item.region, (map.get(item.region) ?? '') + item.text + '\n'), new Map())
const cssBefore = cssRegions(before)
const cssAfter = cssRegions(after)
const cssSame = [...cssBefore].every(([region, text]) => cssAfter.get(region) === text) && cssBefore.size === cssAfter.size
console.log(`style sheets: ${cssBefore.size} CSS modules before, ${cssAfter.size} after; sheets and class maps identical: ${cssSame}`)
const show = (label, items) => { for (const item of items) console.log(`${label} [${item.region}] ${item.text.split('\n')[0].slice(0, 160)}${item.text.includes('\n') ? ` ... (${item.text.split('\n').length} lines)` : ''}`) }
show('-', onlyBefore)
show('+', onlyAfter)
if (process.env.SHOW_FULL) for (const [label, items] of [['-', onlyBefore], ['+', onlyAfter]]) for (const item of items) console.log(`\n${label}${label}${label} [${item.region}]\n${item.text}`)
