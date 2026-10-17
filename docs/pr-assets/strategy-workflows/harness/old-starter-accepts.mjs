// old-starter-accepts.mjs <node_modules of a profile with dsh-mnemon 0.5.31>: the published Starter's Core validates a
// Strategy manifest that carries the new `workflows` field and keeps it unchanged (its Host reads only the type id).
import { createRequire } from 'node:module'
import { join } from 'node:path'
const modules = process.argv[2]
const require = createRequire(join(modules, 'dsh-mnemon', 'package.json'))
const version = require('dsh-mnemon/package.json').version
const sdk = await import(require.resolve('dsh-mnemon/extension-sdk'))
const contracts = await import(require.resolve('dsh-mnemon/contracts'))
const layered = await import(require.resolve('dsh-mnemon-strategy-default-three-tier'))
const manifest = { ...layered.DEFAULT_THREE_TIER_VIEW_STRATEGY.manifest, workflows: ['idle-review', 'runtime-capacity'] }
const defined = sdk.defineMemoryStrategy({ manifest, compose: layered.DEFAULT_THREE_TIER_VIEW_STRATEGY.compose })
console.log(JSON.stringify({ starter: version, apiVersion: contracts.COMPOSABLE_MEMORY_API_VERSION, accepted: true, keptWorkflows: defined.manifest.workflows, typeId: defined.manifest.typeId }))
