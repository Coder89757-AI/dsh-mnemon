// bundle-exports.mjs <repo> <bundle.js>...: evaluate each built client bundle the way DSH's module loader does (a
// factory given `require`) and print the names on its module.exports, with each value's type. React comes from the
// repository; every other external is a stand-in that accepts any use, since only the export names are compared.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import vm from 'node:vm'

const [repo, ...bundles] = process.argv.slice(2)
const require = createRequire(resolve(repo, 'package.json'))
const real = { react: require('react'), 'react/jsx-runtime': require('react/jsx-runtime'), 'react-dom': require('react-dom') }
const stand = () => {
  const target = function () {}
  const proxy = new Proxy(target, {
    get: (_, key) => key === Symbol.toPrimitive ? () => '' : key === '__esModule' ? true : proxy,
    apply: () => proxy,
    construct: () => proxy,
  })
  return proxy
}
for (const bundle of bundles) {
  let loaded
  const context = vm.createContext({
    window: { __ModuleLoader__: { load: ({ id, factory }) => { loaded = { id, exports: factory(name => real[name] ?? stand()) } } } },
    console, setTimeout, clearTimeout, globalThis: undefined,
  })
  context.globalThis = context
  vm.runInContext(readFileSync(bundle, 'utf8'), context, { filename: bundle })
  const names = Object.keys(loaded.exports).sort()
  console.log(`# ${loaded.id} (${names.length} names)`)
  for (const name of names) console.log(`${name}\t${typeof loaded.exports[name]}`)
}
