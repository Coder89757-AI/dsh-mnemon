// What `--log-model-requests` adds to each `Fixture model request:` line of scripts/serve-e2e.mjs.

const text = content => typeof content === 'string' ? content
  : Array.isArray(content) ? content.filter(block => block?.type === 'text').map(block => block.text).join('\n') : ''

/**
 * The model a request to the loopback stub names, and what sent it: a Mnemon memory task, whose
 * delegated child carries Mnemon's completion protocol, DSH's session title, or any other
 * request, such as a conversation's. Then its tool count and, where the request sets them, its
 * thinking mode and reasoning effort. `wire` is the Messages-protocol body DSH's DeepSeek adapter sends.
 */
export function describeModelRequest(wire) {
  const user = (wire.messages ?? []).findLast(message => message.role === 'user')
  const kind = /Completion protocol: call `/u.test(text(wire.system)) ? 'memory task'
    : text(user?.content).startsWith('Generate the session title') ? 'title' : 'conversation'
  return {
    model: wire.model,
    kind,
    tools: (wire.tools ?? []).length,
    ...(wire.thinking?.type === undefined ? {} : { thinking: wire.thinking.type }),
    ...(wire.output_config?.effort === undefined ? {} : { effort: wire.output_config.effort }),
  }
}
