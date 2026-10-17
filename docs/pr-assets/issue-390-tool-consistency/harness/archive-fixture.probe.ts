// archive-fixture.probe.ts: the scripted model of `pnpm e2e:serve --document-archive` against the receipts the
// model reads (#390). Copy into tests/ as archive-fixture.spec.ts and run with vitest. Create and update run through
// mnemon_document_manage on the real Documents layer; the archive is the real Documents archive with the lineage the
// Host builds, as coordinator.archiveDocument returns it, since the Host's index needs a model. Each rendered tool
// result goes to the fixture as a tool message, and the fixture asserts that the lineage digest is the content hash
// of the Document it wrote.
import { afterEach, it, vi } from 'vitest'
import type { HostAgent, HostContextShape, ToolDefinition } from '../src/host/dsh.ts'
import type { DocumentMutationResult, DocumentView } from 'dsh-mnemon-source-documents/contracts'
import { MnemonSubagentCoordinator } from '../src/host/subagent.ts'
import { registerTools } from '../src/host/tools.ts'
import { agentScope } from '../src/host/runtime.ts'
import { compositionFixture } from './fixtures/composition.ts'
import { sessionLog } from './fixtures/session-log.ts'
// @ts-expect-error plain ESM fixture without types
import { documentArchiveModel } from '../scripts/fixtures/document-archive-model.mjs'

const releases: Array<() => Promise<void>> = []
afterEach(async () => { for (const release of releases.splice(0).reverse()) await release() })

it('the --document-archive model against the receipts the tools return', async () => {
  const f = await compositionFixture()
  releases.push(f.dispose)
  const root = { id: 'root', session: { header: { cwd: f.workspace }, ...sessionLog() } } as unknown as HostAgent
  const registered: ToolDefinition[] = []
  const coordinator = new MnemonSubagentCoordinator({} as never, f.live)
  registerTools({ tools: { register: (tool: ToolDefinition) => { registered.push(tool) } } } as unknown as HostContextShape, f.live, coordinator)
  const manage = registered.find(tool => tool.name === 'mnemon_document_manage')!
  const signal = new AbortController().signal
  const documents = f.graph.source('documents')
  const rendered = (args: unknown, value: unknown) => (manage.output.render(args as never, value as never) as Array<{ text: string }>)[0]!.text
  // As in the e2e, each step is its own conversation turn.
  await f.graph.composableTurns.beginTurn('root:e2e-1', agentScope(root, f.config), 'probe')
  const createArgs = { action: 'create', title: 'Issue 222 Tool Roundtrip', content: '# Tool archive\n\nPreserve this synthetic original.' }
  const created = await manage.execute(createArgs as never, { agent: root, signal } as never) as { document: { id: string } }
  await f.graph.composableTurns.beginTurn('root:e2e-2', agentScope(root, f.config), 'probe')
  const updateArgs = { action: 'update', id: created.document.id, content: '# Tool archive\n\nRevision two: preserve this synthetic original and its exact cold reference.' }
  const updated = await manage.execute(updateArgs as never, { agent: root, signal } as never)
  await f.graph.composableTurns.beginTurn('root:e2e-3', agentScope(root, f.config), 'probe')
  const before = await documents.read<DocumentView>('document', { id: created.document.id })
  const archivedResult = await documents.mutate<DocumentMutationResult>('archive', { id: before.id, documentRevision: before.revision, summary: 'Cold archive index.', memoryBodyIds: ['space'] })
  vi.spyOn(coordinator, 'archiveDocument').mockResolvedValue({ ...archivedResult,
    lineage: [{ source: { layerId: 'documents', reference: `document:${before.id}:${before.revision}`, digest: before.contentHash }, destination: { layerId: 'memory-spaces', reference: 'memory-space:space/item:x', digest: 'd' } }],
    maintenance: { runId: 'run', provider: 'spawn', summary: 'Cold archive index.', memoryBodyIds: ['space'], archivedDocumentIds: [before.id] } } as never)
  const archiveArgs = { action: 'archive', id: created.document.id }
  const archived = await manage.execute(archiveArgs as never, { agent: root, signal } as never)
  const request = {
    tools: [{ function: { name: 'mnemon_document_manage' } }],
    messages: [
      { role: 'user', content: 'archive-tool-222' },
      { role: 'tool', content: rendered(createArgs, created) },
      { role: 'tool', content: rendered(updateArgs, updated) },
      { role: 'tool', content: rendered(archiveArgs, archived) },
    ],
  }
  const events: unknown[] = []
  const model = documentArchiveModel((event: unknown) => { events.push(event) })
  let reply: unknown
  try { reply = model(request) } catch (error) { reply = { fixtureError: (error as Error).message.split('\n')[0] } }
  console.log('PROBE ' + JSON.stringify({ reply, events: events.map(event => (event as { event: string }).event) }))
})
