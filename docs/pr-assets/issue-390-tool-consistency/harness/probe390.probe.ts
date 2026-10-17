// probe390.probe.ts: what the model tools answer, through registerTools on the composition fixture (#390).
// Copy into tests/ as probe390.spec.ts and run with vitest against main's code and the fix's; it prints one JSON line per case.
import { afterEach, it } from 'vitest'
import type { HostAgent, HostContextShape, ToolDefinition } from '../src/host/dsh.ts'
import { MnemonSubagentCoordinator } from '../src/host/subagent.ts'
import { registerTools } from '../src/host/tools.ts'
import { agentScope } from '../src/host/runtime.ts'
import { modelMemoryWake } from '../src/host/view-presentation.ts'
import { compositionFixture } from './fixtures/composition.ts'
import { sessionLog } from './fixtures/session-log.ts'

const releases: Array<() => Promise<void>> = []
afterEach(async () => { for (const release of releases.splice(0).reverse()) await release() })

it('probe #390', async () => {
  const f = await compositionFixture()
  releases.push(f.dispose)
  const root = { id: 'root', session: { header: { cwd: f.workspace }, ...sessionLog() } } as unknown as HostAgent
  const child = { id: 'review-child', session: { header: { cwd: f.workspace, origin: 'subagent', parentSession: root.id } } } as HostAgent
  const registered: ToolDefinition[] = []
  registerTools({ tools: { register: (tool: ToolDefinition) => { registered.push(tool) } } } as unknown as HostContextShape, f.live, new MnemonSubagentCoordinator({} as never, f.live))
  const tool = (name: string) => registered.find(candidate => candidate.name === name)!
  const signal = new AbortController().signal
  await f.memorySpace()
  const documents = f.graph.source('documents')
  for (const index of [1, 2, 3, 4]) await documents.mutate('mutate', { action: 'create', title: `Existing document ${index}`, content: `# Document ${index}\n\n` + 'Body text. '.repeat(40) })
  const pinned = await f.graph.composableTurns.beginTurn('root:probe', agentScope(root, f.config), 'probe')
  f.graph.composableTurns.pinTurn('child:probe', agentScope(child, f.config), pinned.view.id)

  // 8: what a Document write returns to the model.
  const created = await tool('mnemon_document_create').execute({ title: 'Rollout note', content: '# Rollout\n\nStage first, then approve.' } as never, { agent: child, signal } as never) as Record<string, unknown>
  const text = JSON.stringify(created)
  console.log('PROBE ' + JSON.stringify({ case: 'document-create', bytes: text.length, keys: Object.keys(created).sort(),
    documentKeys: Object.keys(created.document as object).sort(), absolutePath: text.includes(f.workspace) || text.includes(f.config.dataDir!) }))

  // 2: ids the View does not offer, as a model writes them; the envelope the model reads lists which ids it shows.
  const wake = modelMemoryWake(f.graph, pinned).text
  const hidden = [...pinned.view.routes, ...pinned.view.actionOffers].map(candidate => candidate.id).filter(id => !wake.includes(id))
  const calls = [
    ['view-route-short', 'mnemon_view_route', { routeId: 'search', input: {} }],
    ['view-route-unknown', 'mnemon_view_route', { routeId: 'source:nowhere/undeclared', input: {} }],
    ['view-action-short', 'mnemon_view_action', { offerId: 'remember', input: {} }],
  ] as const
  for (const [label, name, args] of calls) {
    let message = 'resolved'
    try { await tool(name).execute(args as never, { agent: root, signal } as never) } catch (error) { message = (error as Error).message }
    console.log('PROBE ' + JSON.stringify({ case: label, message: message.slice(0, 400), namesHiddenId: hidden.some(id => message.includes(id)) }))
  }

  // 9: what the status aggregate says it sums.
  const status = await tool('mnemon_status').execute({} as never, { agent: root, signal } as never) as { aggregate?: Record<string, unknown> } | string
  const parsed = typeof status === 'string' ? JSON.parse(status) : status
  console.log('PROBE ' + JSON.stringify({ case: 'status-aggregate', aggregate: parsed.aggregate ?? null }))
  pinned.release?.()
})
