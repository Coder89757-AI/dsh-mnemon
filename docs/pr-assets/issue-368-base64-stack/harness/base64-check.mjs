// base64-check.mjs: the old pattern, the same check with the u flag, and the final check on one-byte and two-byte strings.
const old = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u
const withU = value => value.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/u.test(value)
const final = value => value.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(value)
const run = (f, s) => { const t = process.hrtime.bigint(); let r; try { r = f(s) } catch (e) { r = e.constructor.name } return `${r} (${Number((process.hrtime.bigint() - t) / 1000000n)} ms)` }
console.log('node', process.version, 'v8', process.versions.v8)
for (const mb of [4, 4.5, 6, 64]) {
  const s = 'QUJD'.repeat(Math.floor(mb * 1024 * 1024 / 4))
  console.log(`one-byte ${mb} MB: old=${run(v => old.test(v), s)} withU=${run(withU, s)} final=${run(final, s)}`)
}
for (const mi of [8, 9, 64]) {
  const s = 'A'.repeat(mi * 1024 * 1024 - 1) + '中'
  console.log(`two-byte ${mi} Mi chars ending in 中: old=${run(v => old.test(v), s)} withU=${run(withU, s)} final=${run(final, s)}`)
}
let diff = 0
for (const v of ['', 'AA==', 'AAA=', 'AAAA', 'A===', '====', 'AAAAA===', 'AA=A', 'AAA', 'AA\nA', 'AAAAAA==', 'AB==', '中AAA', 'AAAA\u0000']) if (old.test(v) !== final(v)) diff++
console.log('edge cases differing between old and final:', diff)
