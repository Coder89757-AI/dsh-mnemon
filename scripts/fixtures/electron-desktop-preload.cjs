// DSH Desktop declares that the shell owns the Host and where its stream lives. With
// DSH_TRANSPORT=none the shell declares nothing, so the page sees only dsh-app://app/.
const { contextBridge } = require('electron')
const argument = process.argv.find(value => value.startsWith('--dsh-stream-base='))
if (argument !== undefined) {
  contextBridge.exposeInMainWorld('__DSH_TRANSPORT__', { ownsHost: true, streamBaseUrl: argument.slice('--dsh-stream-base='.length) })
}
