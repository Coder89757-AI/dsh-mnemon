// stub.mjs: the e2e fixture's loopback model stub with the Save to memory script, plus one thing the fixture's own
// stub does not keep: the model each request names, and whether it is a conversation turn or a delegated task.
// It is the same test double (no real model, no credential); serve-e2e.mjs reaches it through --live-model.
import { createServer } from 'node:http'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

/** The fixture's neutral request shape, as serve-e2e.mjs builds it for its scripted models. */
function fixtureRequest(wire) {
  const blocks = content => typeof content === 'string' ? [{ type: 'text', text: content }] : content ?? []
  const text = content => blocks(content).filter(block => block.type === 'text').map(block => block.text).join('\n')
  const messages = (wire.messages ?? []).flatMap(message => {
    const results = blocks(message.content).filter(block => block.type === 'tool_result')
      .map(block => ({ role: 'tool', tool_call_id: block.tool_use_id, content: text(block.content) }))
    const calls = blocks(message.content).filter(block => block.type === 'tool_use')
      .map(block => ({ id: block.id, type: 'function', function: { name: block.name, arguments: JSON.stringify(block.input ?? {}) } }))
    const body = text(message.content)
    return [...results, ...(body === '' && calls.length === 0 ? [] : [{ role: message.role, content: body, ...(calls.length === 0 ? {} : { tool_calls: calls }) }])]
  })
  return {
    ...wire,
    messages: [...(wire.system === undefined ? [] : [{ role: 'system', content: text(wire.system) }]), ...messages],
    tools: (wire.tools ?? []).map(tool => ({ type: 'function', function: { name: tool.name, description: tool.description, parameters: tool.input_schema } })),
  }
}

/**
 * @param {string} repo the checkout whose fixture scripts answer
 * @param {(line: string) => void} log
 */
export async function startStub(repo, log) {
  const { saveActionModel } = await import(pathToFileURL(join(repo, 'scripts/fixtures/save-action-model.mjs')).href)
  const { delegatedCompletion } = await import(pathToFileURL(join(repo, 'scripts/fixtures/delegated-completion.mjs')).href)
  const receipts = []
  const requests = []
  const scripted = saveActionModel(event => { if (event.event === 'receipt') receipts.push(event); log('Save action: ' + JSON.stringify(event)) })
  let count = 0
  const server = createServer(async (request, response) => {
    let input = ''
    for await (const chunk of request) input += chunk
    const wire = input === '' ? {} : JSON.parse(input)
    const neutral = fixtureRequest(wire)
    const system = neutral.messages.filter(message => message.role === 'system').map(message => message.content).join('\n')
    // DSH titles a session with its own short request; it is neither a turn nor a task.
    const kind = delegatedCompletion(neutral) !== undefined ? 'delegated task' : /\btitle\b|标题/iu.test(system) && (neutral.tools ?? []).length === 0 ? 'title' : 'conversation'
    count += 1
    requests.push({ n: count, model: wire.model, kind })
    log(`Model request ${count}: ${wire.model} (${kind}) tools=${(neutral.tools ?? []).length} system=${JSON.stringify(system.slice(0, 70))}`)
    let reply
    // Each conversation gets a title of its own, so the sidebar tells them apart.
    const asked = neutral.messages.filter(message => message.role === 'user').map(message => message.content).join('\n')
    if (kind === 'title') reply = asked.includes('发布流程') ? '发布流程（会话 A）' : '另一个会话（会话 B）'
    else try { reply = scripted(neutral) } catch (error) {
      response.writeHead(500, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ error: { message: error instanceof Error ? error.message : String(error) } }))
      return
    }
    response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
    const call = typeof reply !== 'string'
    const event = value => response.write(`event: ${value.type}\ndata: ${JSON.stringify(value)}\n\n`)
    event({ type: 'message_start', message: { id: 'pr354-stub-' + count, type: 'message', role: 'assistant', model: wire.model, content: [], usage: { input_tokens: 10, output_tokens: 0 } } })
    event({ type: 'content_block_start', index: 0, content_block: call ? { type: 'tool_use', id: 'stub-call-' + count, name: reply.name, input: {} } : { type: 'text', text: '' } })
    event({ type: 'content_block_delta', index: 0, delta: call ? { type: 'input_json_delta', partial_json: JSON.stringify(reply.args) } : { type: 'text_delta', text: reply } })
    event({ type: 'content_block_stop', index: 0 })
    event({ type: 'message_delta', delta: { stop_reason: call ? 'tool_use' : 'end_turn' }, usage: { output_tokens: 5 } })
    event({ type: 'message_stop' })
    response.end()
  })
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  return {
    port: server.address().port,
    requests,
    receipts,
    async close() { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) },
  }
}
