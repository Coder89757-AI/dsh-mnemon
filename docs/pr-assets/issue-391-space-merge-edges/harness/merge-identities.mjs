// Run with node --experimental-transform-types, after copying src/host/space-identity.ts from main and from the fix to space-identity.main.ts and space-identity.fix.ts in the probe directory.
// merge-identities.mjs <probe dir> [local database] [published database]: merge the published version of the space into the local one with main's and the fix's identity.
// The local database defaults to the store a probe left in <probe dir>/data, the published one to <probe dir>/published.db.
import { mkdtempSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
const root = process.argv[2]
const local = readFileSync(process.argv[3] ?? join(root, 'data', 'data', 'default', 'mnemon.db'))
const published = readFileSync(process.argv[4] ?? join(root, 'published.db'))
for (const label of ['main', 'fix']) {
  const { MemorySpaceIdentity } = await import(join(root, `space-identity.${label}.ts`))
  const identity = new MemorySpaceIdentity(mkdtempSync(join(root, 'scratch-')))
  const merged = identity.merge(local, published)
  console.log(JSON.stringify({ label, sameIdentity: identity.of(local) === identity.of(published), localHoldsPublished: identity.contains(local, published),
    merge: merged === undefined ? 'refused: the caller keeps a copy' : merged === local ? 'nothing to add' : 'merged' }))
  identity.dispose()
}
