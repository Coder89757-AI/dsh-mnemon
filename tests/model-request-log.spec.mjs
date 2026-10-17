import { describe, expect, it } from 'vitest'
import { describeModelRequest } from '../scripts/fixtures/model-request-log.mjs'

const tool = name => ({ name, description: name, input_schema: { type: 'object' } })
const user = text => ({ role: 'user', content: [{ type: 'text', text }] })

describe('--log-model-requests', () => {
  it('names a conversation request with its model, tools and reasoning settings', () => {
    expect(describeModelRequest({
      model: 'deepseek-v4-pro', system: [{ type: 'text', text: 'You are testing the Mnemon memory UI.' }],
      messages: [user('我们的发布流程是什么？')], tools: [tool('mnemon_recall'), tool('mnemon_remember')],
      thinking: { type: 'enabled' }, output_config: { effort: 'high' },
    })).toEqual({ model: 'deepseek-v4-pro', kind: 'conversation', tools: 2, thinking: 'enabled', effort: 'high' })
  })

  it('tells a Mnemon memory task by the completion protocol its child carries', () => {
    const system = 'You are the supervised durable-memory writer.\nCompletion protocol: call `mnemon_subagent_result` with requestId `synthetic`'
    expect(describeModelRequest({ model: 'deepseek-flash', system, messages: [user('Save this reply.')], tools: [tool('mnemon_subagent_result')], thinking: { type: 'disabled' } }))
      .toEqual({ model: 'deepseek-flash', kind: 'memory task', tools: 1, thinking: 'disabled' })
    expect(describeModelRequest({ model: 'deepseek-flash', system: [{ type: 'text', text: system }], messages: [] })).toMatchObject({ kind: 'memory task', tools: 0 })
  })

  it("tells DSH's session title request by its last user message", () => {
    const result = { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'call-1', content: 'ok' }] }
    expect(describeModelRequest({ model: 'deepseek-flash', messages: [result, user('Generate the session title from this JSON array of human messages:\n["Hello"]')] }))
      .toEqual({ model: 'deepseek-flash', kind: 'title', tools: 0 })
    expect(describeModelRequest({ model: 'deepseek-flash', messages: [user('Generate the session title from this JSON array of human messages:\n[]'), user('Hello')] }))
      .toMatchObject({ kind: 'conversation' })
  })

  it('describes a request without messages or a model', () => {
    expect(describeModelRequest({})).toEqual({ model: undefined, kind: 'conversation', tools: 0 })
  })
})
