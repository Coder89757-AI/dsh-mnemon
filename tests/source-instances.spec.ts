import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as runtimePlugin from 'dsh-mnemon-source-runtime'
import * as general from 'dsh-mnemon-strategy-general'
import type { RuntimeMemorySnapshot } from 'dsh-mnemon-source-runtime/contracts'
import type { HostAgent, HostContextShape, HostSubagentsService, ToolDefinition } from '../src/host/dsh.ts'
import { agentScope } from '../src/host/runtime.ts'
import { MnemonSubagentCoordinator } from '../src/host/subagent.ts'
import { registerTools } from '../src/host/tools.ts'
import { presentMemoryWake } from '../src/host/view-presentation.ts'
import { compositionFixture } from './fixtures/composition.ts'
import { sessionLog } from './fixtures/session-log.ts'

// Issue #397: a profile can mount a second Source of one type next to the
// Starter's, such as a shared runtime track beside the project one, under a
// Strategy that composes several Sources of one role (General). The named
// tools write to the Starter's instance, as the View's tool bindings and reads
// already do, and the other instance stays reachable by its exact offer.

const runtimeKey = 'source:mnemon-source-runtime'
const otherRuntimeKey = 'source:mnemon-source-runtime-global'
const fixtures: Awaited<ReturnType<typeof compositionFixture>>[] = []
afterEach(async () => { for (const f of fixtures.splice(0)) await f.dispose() })

async function fixture() {
  const f = await compositionFixture({ memoryTopology: { strategyId: 'general' } })
  fixtures.push(f)
  await f.mount(general, { instanceId: 'mnemon-strategy-general' })
  await f.releases[3]!()
  const otherRuntime = join(f.root, 'global-runtime')
  mkdirSync(otherRuntime)
  await f.mount(runtimePlugin, { instanceId: 'mnemon-source-runtime-global', config: { dataDir: otherRuntime, userDataDir: otherRuntime } })
  const start = vi.fn()
  const coordinator = new MnemonSubagentCoordinator({ start } as unknown as HostSubagentsService, f.live)
  const tools = new Map<string, ToolDefinition>()
  registerTools({ tools: { register: (tool: ToolDefinition) => tools.set(tool.name, tool) } } as unknown as HostContextShape, f.live, coordinator)
  const agent = { id: 'instances-root', session: { header: { cwd: f.workspace }, ...sessionLog() } } as unknown as HostAgent
  const begin = async () => {
    const graph = f.live.snapshot()
    return graph.composableTurns.beginTurn(agent.id + ':1', agentScope(agent, graph.config))
  }
  const execute = (name: string, input: object) => Promise.resolve().then(() => tools.get(name)!.execute(input as never, { agent, signal: new AbortController().signal }))
  const runtimeEntries = async (key: string) => (await f.graph.source('runtime').forInstance(key).read<RuntimeMemorySnapshot>('snapshot')).entries.map(entry => entry.content)
  return { ...f, start, coordinator, agent, begin, execute, runtimeEntries }
}

describe('a second Source of one type beside the Starter instance (issue 397)', () => {
  it('writes MEMORY.md through mnemon_runtime_memory into the Starter runtime Source', async () => {
    const f = await fixture()
    const turn = await f.begin()
    // Both instances offer their mutate Action. The Starter one is bound to the named tool,
    // so only the other one is listed for mnemon_view_action.
    const mutate = turn.view.actionOffers.filter(offer => offer.sourceActionId === 'mutate')
    expect(mutate.map(offer => offer.sourceInstanceKey).sort()).toEqual([runtimeKey, otherRuntimeKey])
    const wake = presentMemoryWake(f.graph.memoryComposition.generation(turn.view.runtimeGeneration)!, turn.view).text
    expect(wake).toContain(mutate.find(offer => offer.sourceInstanceKey === otherRuntimeKey)!.id)
    expect(wake).not.toContain(mutate.find(offer => offer.sourceInstanceKey === runtimeKey)!.id)
    await expect(f.execute('mnemon_runtime_memory', { action: 'add', target: 'memory', content: 'Project fact for the Starter track.' }))
      .resolves.toMatchObject({ memoryReceipt: { status: 'succeeded' } })
    expect(await f.runtimeEntries(runtimeKey)).toEqual(['Project fact for the Starter track.'])
    expect(await f.runtimeEntries(otherRuntimeKey)).toEqual([])
    // The other track still takes writes through its exact offer.
    const other = turn.view.actionOffers.find(offer => offer.sourceInstanceKey === otherRuntimeKey && offer.sourceActionId === 'mutate')!
    await f.execute('mnemon_view_action', { offerId: other.id, input: { action: 'add', target: 'memory', content: 'Shared fact for the global track.' } })
    expect(await f.runtimeEntries(otherRuntimeKey)).toEqual(['Shared fact for the global track.'])
    expect(await f.runtimeEntries(runtimeKey)).toEqual(['Project fact for the Starter track.'])
    f.graph.composableTurns.endTurn(turn.turnId)
  })

  it('names the exact offers when no runtime Source is the Starter one', async () => {
    const f = await fixture()
    await f.releases[0]!()
    const second = join(f.root, 'second-runtime')
    mkdirSync(second)
    await f.mount(runtimePlugin, { instanceId: 'mnemon-source-runtime-team', config: { dataDir: second, userDataDir: second } })
    const turn = await f.begin()
    const offers = turn.view.actionOffers.filter(offer => offer.sourceActionId === 'mutate').map(offer => offer.id)
    expect(offers).toHaveLength(2)
    const failure = await f.execute('mnemon_runtime_memory', { action: 'add', target: 'memory', content: 'Unrouted fact.' }).catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(Error)
    for (const id of offers) expect((failure as Error).message).toContain(id)
    f.graph.composableTurns.endTurn(turn.turnId)
  })
})
