// Run with ../../dsh-021-alpha2/harness/installed-dsh-all.vitest.config.mjs, DSH_HOST_ROOT, DSH_VERSION and
// MNEMON_TEST_DIR=docs/pr-assets/dsh-021-alpha3/harness: a USER.md compaction child, then the same child resumed by
// its conversation after it settled, against an installed DSH. Prints what each of its model requests carried.
import { realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry, { type Agent } from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import LlmRuntime, { LlmAdapter, createUserMessage, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import SubagentRuntime from '@deepseek-ai/dsh-subagent'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { expect, it, vi } from 'vitest'
import type { HostContextShape } from '../../../../src/host/dsh.ts'
import { MnemonLifecycle } from '../../../../src/host/lifecycle.ts'
import { MnemonSubagentCoordinator } from '../../../../src/host/subagent.ts'
import { registerTools } from '../../../../src/host/tools.ts'
import { compositionFixture } from '../../../../tests/fixtures/composition.ts'
import { JsonlSessionPersistence } from '../../../../tests/helpers/dsh-plugins.ts'

const requireDsh = createRequire(realpathSync(process.env.DSH_HOST_ROOT + '/package.json'))
const spawn = await import(requireDsh.resolve('@deepseek-ai/dsh-subagent-spawn-in-process'))

type Reply = string | { name: string; args: Record<string, unknown> }

/** Only the model is scripted: the subagent runtime, tools and storage are real. */
class ScriptedAdapter extends LlmAdapter {
  private calls = 0
  constructor(private readonly respond: (options: GenerateOptions) => Reply) { super() }
  override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const reply = this.respond(options)
    const id = `resume-${++this.calls}` as Extract<StreamChunk, { type: 'tool-call-delta' }>['id']
    if (typeof reply === 'string') {
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'text-delta', index: 0, text: reply }
      yield { type: 'block-end', index: 0, block: { type: 'text', text: reply } }
    } else {
      const args = JSON.stringify(reply.args)
      yield { type: 'block-start', index: 0, blockType: 'tool-call' }
      yield { type: 'tool-call-delta', index: 0, id, name: reply.name, argumentsDelta: args }
      yield { type: 'block-end', index: 0, block: { type: 'tool-call', id, name: reply.name, arguments: args } }
    }
    yield { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } }
    yield { type: 'finish', reason: { kind: typeof reply === 'string' ? 'stop' : 'tool-calls' } }
  }
}

const profile = ['User prefers concise answers without long preambles.', 'User prefers answers written in Simplified Chinese.']
const pending = 'Blockers first.'

it('shows what a resumed USER.md compaction child runs with', async () => {
  const f = await compositionFixture({ runtimeMemory: { userLimitBytes: 120 } })
  const ctx = new Context()
  let stop: (() => void) | undefined
  let parentCalls = 0
  let resumed = false
  const children: Agent[] = []
  const requests: Array<{ phase: 'first' | 'resumed'; tools: string[]; mnemonInstructions: boolean }> = []
  try {
    await ctx.plugin(LlmRuntime)
    await ctx.plugin(SessionStore)
    await ctx.plugin(JsonlSessionPersistence, { root: join(f.root, 'sessions'), compression: 'none' })
    await ctx.plugin(SessionProjectionRegistry)
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime, { mode: 'native' })
    await ctx.plugin(AgentRegistry)
    await ctx.plugin(AgentLoop, { agents: [] })
    // Resuming a child reads its Session through Session query, as in a profile.
    const query = await import(requireDsh.resolve('@deepseek-ai/dsh-session-query-sqlite'))
    await ctx.plugin(query.default ?? query, { path: ':memory:', openAt: 'never' })
    // DSH 0.2.1's subagent runtime needs the working directory, which needs fs; a profile loads both.
    let workingDirectory: { default: unknown } | undefined
    try { workingDirectory = await import(requireDsh.resolve('@deepseek-ai/dsh-working-directory')) } catch { /* DSH 0.2.0 has none. */ }
    if (workingDirectory !== undefined) {
      const { tmpdir } = await import('node:os')
      await ctx.plugin((await import(requireDsh.resolve('@deepseek-ai/dsh-fs-local'))).default, { cwd: tmpdir() })
      await ctx.plugin(workingDirectory.default)
    }
    await ctx.plugin(SubagentRuntime)
    await ctx.plugin(spawn, { providerName: 'spawn' })
    ctx.llm.registerAdapter(['mock'], new ScriptedAdapter(options => {
      if (options.sessionId === 'parent') {
        const content = [...profile, pending][parentCalls++]
        return content === undefined ? 'Noted.' : { name: 'mnemon_runtime_memory', args: { action: 'add', target: 'user', content } }
      }
      const system = options.system ?? JSON.stringify(options.messages.filter(message => message.role === 'system'))
      requests.push({ phase: resumed ? 'resumed' : 'first', tools: (options.tools ?? []).map(tool => tool.name).sort(), mnemonInstructions: system.includes('Completion protocol') })
      const terminal = system.match(/Completion protocol: call `([^`]+)`/u)?.[1]
      const requestId = system.match(/requestId `([^`]+)`/u)?.[1]
      if (resumed || terminal === undefined || requestId === undefined) return 'Nothing else to compact.'
      return { name: terminal, args: { requestId, result: {
        summary: 'Merged the two answer preferences.', action: 'compacted',
        compactedEntries: [{ content: 'User prefers concise Simplified Chinese answers.', importance: 'normal', sourceIndexes: [1, 2] }],
      } } }
    }))
    ctx.on('agent/created', ({ agent }): undefined => {
      if (agent.session.header.origin === 'subagent') children.push(agent)
    })
    const host = ctx as unknown as HostContextShape
    const coordinator = new MnemonSubagentCoordinator(host.subagents, f.live, host)
    const lifecycle = new MnemonLifecycle(host, coordinator, f.config, f.live)
    registerTools(host, f.live, coordinator)
    stop = lifecycle.start()
    const parent = await ctx.agentLoop.create(SessionId('parent'), { provider: 'mock', model: 'mock' }, { cwd: f.workspace })
    parent.followup(createUserMessage({ content: [{ type: 'text', text: 'Remember how I like answers.' }], source: { kind: 'user' } }))
    await parent.whenIdle()
    expect(children).toHaveLength(1)
    const child = children[0]!
    await vi.waitFor(() => expect(ctx.agents.get(child.id)).toBeUndefined(), { timeout: 5_000 })

    // The conversation messages the settled child, as a model or a person can from its subagent list.
    resumed = true
    const subagents = (ctx as unknown as { subagents: { sendMessage?(sender: Agent, target: string, content: unknown[], options: { signal: AbortSignal }): Promise<unknown> } }).subagents
    const outcome = typeof subagents.sendMessage !== 'function' ? 'no sendMessage'
      : await subagents.sendMessage(parent, child.id, [{ type: 'text', text: 'Is there anything else to compact?' }], { signal: new AbortController().signal })
        .then(() => 'accepted', error => String((error as Error)?.message ?? error).slice(0, 200))
    if (outcome === 'accepted') await vi.waitFor(() => expect(requests.some(request => request.phase === 'resumed')).toBe(true), { timeout: 5_000 })
    const summary = (phase: 'first' | 'resumed') => {
      const request = requests.find(candidate => candidate.phase === phase)
      return request === undefined ? undefined : { tools: request.tools.length > 3 ? `${request.tools.length} tools` : request.tools, mnemonInstructions: request.mnemonInstructions }
    }
    console.log('RESUMED-MEMORY-TASK ' + JSON.stringify({ dsh: process.env.DSH_VERSION, first: summary('first'), resume: outcome, resumed: summary('resumed') }))
    // The task itself ran with Mnemon's instructions and its result tool only.
    expect(summary('first')).toEqual({ tools: ['mnemon_subagent_result'], mnemonInstructions: true })
  } finally {
    stop?.()
    await ctx.fiber.dispose()
    await f.dispose()
  }
}, 20_000)
