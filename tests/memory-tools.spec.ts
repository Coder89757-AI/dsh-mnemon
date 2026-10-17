import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import { TurnActivityProjection } from '../src/host/activity.ts'
import type { HostContextShape, HostSessionEvent, ToolDefinition } from '../src/host/dsh.ts'
import { MEMORY_TOOLS, memoryTool } from '../src/host/protocol.ts'
import { MnemonSubagentCoordinator } from '../src/host/subagent.ts'
import { registerTools } from '../src/host/tools.ts'
import { modelMemoryWake, presentMemoryWake } from '../src/host/view-presentation.ts'
import { compositionFixture } from './fixtures/composition.ts'

const fixtures: Awaited<ReturnType<typeof compositionFixture>>[] = []
afterEach(async () => { for (const f of fixtures.splice(0)) await f.dispose() })

/** Every tool the Host registers, the result tool of delegated children included, in registration order. */
function registered(): ToolDefinition[] {
  const tools: ToolDefinition[] = []
  const register = (tool: ToolDefinition) => { tools.push(tool); return () => {} }
  const coordinator = new MnemonSubagentCoordinator({} as never, {} as never, { tools: { register }, on: () => () => {} } as never)
  registerTools({ tools: { register } } as unknown as HostContextShape, {} as never, coordinator)
  return tools
}

describe('memory tool table', () => {
  it('has a row for every memory tool the Host registers, in registration order, and for nothing else', () => {
    const names = registered().map(tool => tool.name)
    // The result tool delegated children finish with runs no Source operation, so it has no row.
    expect(names.filter(name => name !== 'mnemon_subagent_result')).toEqual(Object.keys(MEMORY_TOOLS))
    expect(memoryTool('mnemon_subagent_result')).toBeUndefined()
    expect(memoryTool('toString')).toBeUndefined()
  })

  it('keeps every model-visible tool name, description and input schema byte-identical', () => {
    const visible = registered().map(tool => ({ name: tool.name, description: tool.description, parameters: tool.parameters }))
    expect(JSON.stringify(visible, null, 2) + '\n').toBe(readFileSync(new URL('./fixtures/model-tools.json', import.meta.url), 'utf8'))
  })

  it('records the Source and operation each named tool runs, as its activity always named them', () => {
    const recorded = Object.fromEntries(registered().flatMap(tool => {
      const present = tool.output.presentationMeta
      if (present === undefined) return []
      const meta = present({}, {}) as { kind: string; sourceTypeId?: string; operationId: string }
      return [[tool.name, [meta.kind, meta.sourceTypeId, meta.operationId]]]
    }))
    expect(recorded).toEqual({
      // Without the call that served it, a generic View call records its tool's own operation.
      mnemon_view_route: ['read', undefined, 'view-route'],
      mnemon_view_action: ['write', undefined, 'view-action'],
      mnemon_recall: ['read', 'memory-spaces', 'recall'],
      mnemon_related: ['read', 'memory-spaces', 'related'],
      mnemon_document_search: ['read', 'documents', 'search'],
      mnemon_document_create: ['write', 'documents', 'create'],
      mnemon_document_manage: ['write', 'documents', 'manage'],
      mnemon_runtime_memory: ['write', 'runtime', 'mutate'],
      mnemon_remember: ['write', 'memory-spaces', 'remember'],
      mnemon_link: ['write', 'memory-spaces', 'link'],
      mnemon_forget: ['write', 'memory-spaces', 'forget'],
      mnemon_memory_body_create: ['write', 'memory-spaces', 'manage-spaces'],
      mnemon_memory_body_update: ['write', 'memory-spaces', 'manage-spaces'],
      mnemon_memory_body_merge: ['write', 'memory-spaces', 'manage-spaces'],
    })
    // Inspections read health or the catalog, not memory, and record no activity.
    for (const [name, tool] of Object.entries(MEMORY_TOOLS)) {
      if (tool.kind === 'inspect') expect(recorded[name]).toBeUndefined()
      else if ('sourceTypeId' in tool) expect(recorded[name]).toEqual([tool.kind, tool.sourceTypeId, tool.operation])
    }
  })

  it('binds every Source operation a named tool runs, on the Starter instance of each Source type, as before', () => {
    const runtime = 'source:mnemon-source-runtime', documents = 'source:mnemon-source-documents', spaces = 'source:mnemon-source-memory-spaces'
    const other = 'source:mnemon-source-runtime-global'
    const instances = [[runtime, 'runtime'], [documents, 'documents'], [spaces, 'memory-spaces'], [other, 'runtime']] as const
    const route = (key: string, id: string) => ({ id: `${key}/${id}`, sourceInstanceKey: key, sourceRouteId: id, readGrantId: `${key}/grant`, description: id, inputSchema: {}, maxCalls: 1 })
    const offer = (key: string, id: string) => ({ id: `${key}/${id}`, sourceInstanceKey: key, sourceActionId: id, description: id, inputSchema: {} })
    const view = {
      id: 'view:every-operation', digest: 'every-operation', projection: [],
      readGrants: instances.map(([key, type]) => ({ id: `${key}/grant`, sourceInstanceKey: key, schema: `dsh-mnemon.${type}/v1` })),
      routes: [route(documents, 'search'), route(spaces, 'inspect'), route(spaces, 'recall'), route(spaces, 'related')],
      actionOffers: [offer(runtime, 'mutate'), offer(documents, 'manage'), offer(documents, 'create'), offer(spaces, 'remember'), offer(spaces, 'link'),
        offer(spaces, 'forget'), offer(spaces, 'manage-spaces'), offer(other, 'mutate')],
    }
    const generation = { sourceInstances: () => instances.map(([sourceInstanceKey, sourceTypeId]) => ({ sourceInstanceKey, sourceTypeId })) }
    const lines = presentMemoryWake(generation as never, view as never).text.split('\n')
    expect(lines.filter(line => line.startsWith('MNEMON VIEW TOOLS'))).toEqual(['MNEMON VIEW TOOLS (available in this View): mnemon_document_search, '
      + 'mnemon_memory_bodies / mnemon_status, mnemon_recall, mnemon_related, mnemon_runtime_memory, mnemon_document_manage, mnemon_document_create, '
      + 'mnemon_remember, mnemon_link, mnemon_forget, mnemon_memory_body_create / mnemon_memory_body_update / mnemon_memory_body_merge'])
    // The other runtime instance keeps its exact offer for mnemon_view_action.
    const routes = lines.find(line => line.startsWith('MNEMON VIEW ROUTES'))!
    expect(JSON.parse(routes.slice(routes.indexOf(': ') + 2))).toEqual([{ source: other, routes: [], actions: [{ id: `${other}/mutate`, description: 'mutate', inputSchema: {} }] }])
  })

  it('counts each settled call in the counter it always added to', () => {
    const names = [...Object.keys(MEMORY_TOOLS), 'mnemon_subagent_result', 'mnemon_notes_digest']
    const events = names.flatMap((name, index): HostSessionEvent[] => [
      { type: 'tool/call', seq: index * 2 + 1, data: { turn: 1, step: 1, callId: `call-${index}`, name, arguments: '{}' } },
      { type: 'tool/result', seq: index * 2 + 2, data: { turn: 1, step: 1, message: { source: { callId: `call-${index}` } } } },
    ])
    expect(new TurnActivityProjection().snapshot(events).activities[0]).toMatchObject({
      count: 18, recalls: 2, writes: 9, documentSearches: 1, inspections: 2, failures: 0,
    })
  })

  it('names the tools the default View binds exactly as the model has read them', async () => {
    const f = await compositionFixture()
    fixtures.push(f)
    await f.memorySpace()
    const turn = await f.graph.composableTurns.beginTurn('root:tools', { storage: 'custom', workspaceId: f.workspace, agentId: 'root' })
    const named = modelMemoryWake(f.graph, turn).text.split('\n').filter(line => line.startsWith('MNEMON VIEW TOOLS'))
    expect(named).toEqual(['MNEMON VIEW TOOLS (available in this View): mnemon_document_search, mnemon_memory_bodies / mnemon_status, mnemon_recall, mnemon_related, '
      + 'mnemon_runtime_memory, mnemon_document_manage, mnemon_document_create, mnemon_memory_body_create / mnemon_memory_body_update / mnemon_memory_body_merge, '
      + 'mnemon_remember, mnemon_forget'])
  })
})
