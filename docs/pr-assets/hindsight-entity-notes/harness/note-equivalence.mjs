// The entity-note pattern the Hindsight driver used, against the linear pass that replaced it:
// every string up to ten characters over a small alphabet, then the time each takes on names
// of many "(" without a ")". Run with: node note-equivalence.mjs
const pattern = entry => entry.replace(/\s*\([^)]*\)\s*$/u, '').trim()

function linear(entry) {
  const trimmed = entry.trimEnd()
  if (!trimmed.endsWith(')')) return entry.trim()
  const close = trimmed.length - 1
  // The leftmost "(" after the last ")" before the closing one: the note holds no ")" of its own.
  const open = trimmed.indexOf('(', trimmed.lastIndexOf(')', close - 1) + 1)
  return open < 0 || open >= close ? entry.trim() : trimmed.slice(0, open).trim()
}

const alphabet = ['(', ')', ' ', 'a', '\t']
let checked = 0
let differ = 0
const walk = (prefix, depth) => {
  checked += 1
  if (pattern(prefix) !== linear(prefix)) {
    differ += 1
    if (differ <= 5) console.log('differs:', JSON.stringify(prefix), JSON.stringify(pattern(prefix)), JSON.stringify(linear(prefix)))
  }
  if (depth === 0) return
  for (const character of alphabet) walk(prefix + character, depth - 1)
}
walk('', 10)
console.log(`checked ${checked} strings, ${differ} differ`)

const time = (run, value) => {
  const start = process.hrtime.bigint()
  run(value)
  return Number(process.hrtime.bigint() - start) / 1e6
}
for (const length of [10_000, 20_000, 40_000, 80_000]) {
  const name = 'x' + '('.repeat(length)
  console.log(`${length} "(": pattern ${time(pattern, name).toFixed(0)} ms, linear pass ${time(linear, name).toFixed(2)} ms`)
}
