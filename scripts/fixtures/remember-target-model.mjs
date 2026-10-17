import { delegatedCompletion } from './delegated-completion.mjs'

const text = message => typeof message?.content === 'string' ? message.content : (message?.content ?? []).map(block => block.text ?? '').join('\n')
const parse = message => { try { return JSON.parse(text(message)) } catch { return { error: text(message) } } }

export const rememberTargetContent = '调研结论：TimescaleDB 的写入吞吐不足以替代 ClickHouse，埋点事件继续写入 ClickHouse。'

/**
 * A memory saved into a named Memory Space (#387), over the docs demo's spaces. After
 * `remember-target-check` the root Agent lists the spaces and names Lumen 项目 for a
 * research conclusion. The writer first tries 调研归档, which describes the memory better
 * but is switched off, then the space it was given. After `remember-archive-check` the root
 * Agent names 调研归档 itself, which the Host refuses before any writer runs. Only the model
 * decisions are scripted; the tools, their guard and the Mnemon Native writes are real.
 */
export function rememberTargetModel(report) {
  return request => {
    const messages = request.messages ?? []
    const terminal = delegatedCompletion(request)
    if (terminal === undefined) {
      const userIndex = messages.findLastIndex(message => message.role === 'user' && /remember-(?:target|archive)-check/u.test(text(message)))
      if (userIndex < 0) return 'Send remember-target-check.'
      // DSH titles the session with a separate request that carries no memory protocol.
      if (text(messages[userIndex]).startsWith('Generate the session title')) return 'Remember target check'
      const space = text(messages[userIndex]).includes('remember-archive-check') ? '调研归档' : 'Lumen 项目'
      const results = messages.slice(userIndex + 1).filter(message => message.role === 'tool').map(parse)
      if (results.length === 0) return { name: 'mnemon_memory_bodies', args: {} }
      const named = results[0]?.items?.find(item => item.name === space)
      if (named === undefined) return `${space} is not listed.`
      if (results.length === 1) return { name: 'mnemon_remember', args: { content: rememberTargetContent, category: 'fact', importance: 3, memoryBodyId: named.id } }
      const receipt = results.at(-1)
      if (typeof receipt.action !== 'string') {
        report({ event: 'refused', named: named.id, message: String(receipt.error ?? '').slice(0, 300) })
        return `写入被拒绝：${String(receipt.error ?? '').replace(/^Error: /u, '')}`
      }
      report({ event: 'receipt', named: named.id, action: receipt.action, memoryBodyIds: receipt.memoryBodyIds, activated: receipt.activatedMemoryBodyIds ?? [] })
      return `记忆 Agent 回执：${receipt.action}；写入的记忆空间：${(receipt.memoryBodyIds ?? []).join('、') || '无'}${(receipt.activatedMemoryBodyIds ?? []).length === 0 ? '' : '；被重新激活：' + receipt.activatedMemoryBodyIds.join('、')}。`
    }
    const done = (action, memoryBodyIds, summary) => ({ name: terminal.name, args: terminal.wrap({ action, memoryBodyIds, summary }) })
    const results = messages.filter(message => message.role === 'tool').map(parse)
    if (results.length === 0) return { name: 'mnemon_memory_bodies', args: {} }
    const items = results.find(result => Array.isArray(result.items))?.items ?? []
    const archive = items.find(item => item.name === '调研归档')
    const named = items.find(item => item.name === 'Lumen 项目')
    if (archive === undefined || named === undefined) return done('failed', [], 'The fixture spaces are missing.')
    const attempts = results.slice(1)
    if (attempts.length === 0) {
      report({ event: 'writer-try', space: '调研归档', active: archive.active })
      return { name: 'mnemon_remember', args: { content: rememberTargetContent, category: 'fact', importance: 3, memoryBodyId: archive.id } }
    }
    const first = attempts[0]
    if (attempts.length === 1 && typeof first.action !== 'string') {
      report({ event: 'writer-refused', message: String(first.error ?? '').slice(0, 200) })
      return { name: 'mnemon_remember', args: { content: rememberTargetContent, category: 'fact', importance: 3, memoryBodyId: named.id } }
    }
    const written = attempts.at(-1)
    report({ event: 'writer-done', action: written.action, memoryBodyId: written.memoryBodyId })
    return done(written.action === 'added' ? 'stored' : String(written.action), [written.memoryBodyId ?? named.id], `已把调研结论存入「${written.memoryBodyName ?? '记忆空间'}」。`)
  }
}
