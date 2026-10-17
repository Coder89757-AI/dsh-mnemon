// schema-findings.probe.ts: input a named tool's schema allows and the Source behind it refuses, and the caps
// that depend on the strategy, through the registered tools on the composition fixture. Copy into tests/ as
// schema-findings.probe.spec.ts and run with vitest; it writes one JSON file to $PROBE_OUT.
import { writeFileSync } from 'node:fs'
import { it } from 'vitest'
import * as general from 'dsh-mnemon-strategy-general'
import type { HostAgent, HostContextShape, ToolDefinition } from '../src/host/dsh.ts'
import { agentScope } from '../src/host/runtime.ts'
import { MnemonSubagentCoordinator } from '../src/host/subagent.ts'
import { registerTools } from '../src/host/tools.ts'
import { compositionFixture } from './fixtures/composition.ts'
import { sessionLog } from './fixtures/session-log.ts'

type Fixture = Awaited<ReturnType<typeof compositionFixture>>

/** A fixture with one Memory Space holding one memory, six matching Documents and the registered tools. */
async function prepare(f: Fixture) {
  const body = await f.memorySpace()
  await f.graph.source('memory-spaces').mutate('remember', { memoryBodyId: body.id, content: 'The protocol-token is a saved durable fact.', category: 'fact', source: 'external' })
  for (let index = 1; index <= 6; index += 1) {
    await f.graph.source('documents').mutate('mutate', { action: 'create', title: `Protocol record ${index}`, content: `The protocol-token runbook, part ${index}.` })
  }
  const tools = new Map<string, ToolDefinition>()
  registerTools({ tools: { register: (tool: ToolDefinition) => { tools.set(tool.name, tool) } } } as unknown as HostContextShape, f.live, new MnemonSubagentCoordinator({} as never, f.live))
  const agent = (id: string, header: object = {}) => ({ id, session: { header: { cwd: f.workspace, ...header }, ...sessionLog() } }) as unknown as HostAgent
  const run = (name: string, args: object, caller: HostAgent) => (tools.get(name)!.execute as Function)(args, { agent: caller, signal: new AbortController().signal }) as Promise<unknown>
  return { body, agent, run }
}

/** How many Documents a search returned: the Layered strategy renders results, the General strategy returns the evidence. */
function documentCount(value: unknown): number {
  const result = value as { results?: unknown[]; items?: Array<{ provenance?: { kind?: string } }> }
  return result.results?.length ?? result.items?.filter(item => item.provenance?.kind === 'match').length ?? 0
}

it('probe: schema findings', async () => {
  const outcomes: Array<{ strategy: string; call: string; outcome: string }> = []
  const record = async (strategy: string, call: string, run: () => Promise<unknown>, answered: (value: unknown) => string = () => 'answered') => {
    try { outcomes.push({ strategy, call, outcome: answered(await run()) }) } catch (error) { outcomes.push({ strategy, call, outcome: (error as Error).message }) }
  }
  const documents = (value: unknown) => `answered with ${documentCount(value)} of 6 matching Documents`

  const f = await compositionFixture()
  try {
    const { body, agent, run } = await prepare(f)
    const root = agent('root'), next = agent('root-2')
    const child = agent('writer-child', { origin: 'subagent', parentSession: 'root' })
    const turn = await f.graph.composableTurns.beginTurn('root:findings', agentScope(root, f.config))
    f.graph.composableTurns.pinTurn('child:findings', agentScope(child, f.config), turn.view.id)
    // A property the named tool's open schema allows and does not declare.
    await record('layered', 'mnemon_recall with scope', () => run('mnemon_recall', { query: 'protocol-token', scope: 'all' }, root))
    await record('layered', 'mnemon_document_search with sort', () => run('mnemon_document_search', { query: 'protocol-token', sort: 'recent' }, root))
    await record('layered', 'mnemon_remember with confidence, from a delegated writer', () => run('mnemon_remember', { content: 'Releases go out on Fridays.', memoryBodyId: body.id, confidence: 'high' }, child))
    await record('layered', 'mnemon_memory_body_update with reason, from a delegated writer', () => run('mnemon_memory_body_update', { memoryBodyId: body.id, description: 'Release facts.', reason: 'clearer' }, child))
    // The Recall Route and the remember Action, with input their own schemas offer. The Layered strategy
    // caps a Recall limit at 6 first, so only a limit below 1 reaches the Route; distinct queries keep it
    // from replaying the first one.
    const second = await f.graph.composableTurns.beginTurn('root:findings-2', agentScope(next, f.config))
    const recall = second.view.routes.find(route => route.sourceRouteId === 'recall')!.id
    const remember = second.view.actionOffers.find(offer => offer.sourceActionId === 'remember')!.id
    for (const [limit, query] of [[50, 'protocol-token'], [0, 'saved durable fact']] as const) {
      await record('layered', `Recall Route with limit ${limit}`, () => f.graph.composableTurns.executeRoute(second.turnId, recall, { query, limit }))
    }
    for (const importance of [3.6, 9]) {
      await record('layered', `remember Action with importance ${importance}`, () => f.graph.composableTurns.executeAction(second.turnId, remember, { content: `Importance ${importance}.`, importance, memoryBodyId: body.id }, () => true))
    }
    await record('layered', 'mnemon_document_search with limit 10', () => run('mnemon_document_search', { query: 'protocol-token', limit: 10 }, next), documents)
  } finally { await f.dispose() }

  // The General strategy has no turn policy, so a named tool's limit reaches the Source as the model sent it.
  const g = await compositionFixture({ memoryTopology: { strategyId: 'general' } })
  try {
    await g.mount(general, { instanceId: 'mnemon-strategy-general' })
    await g.releases[3]!()
    const { agent, run } = await prepare(g)
    const root = agent('root')
    await g.graph.composableTurns.beginTurn('general:findings', agentScope(root, g.config))
    await record('general', 'mnemon_recall with limit 50', () => run('mnemon_recall', { query: 'protocol-token', limit: 50 }, root))
    await record('general', 'mnemon_recall with limit 10', () => run('mnemon_recall', { query: 'protocol-token', limit: 10 }, root))
    await record('general', 'mnemon_document_search with limit 10', () => run('mnemon_document_search', { query: 'protocol-token', limit: 10 }, root), documents)
  } finally { await g.dispose() }
  writeFileSync(process.env.PROBE_OUT!, JSON.stringify(outcomes, null, 2) + '\n')
}, 60_000)
