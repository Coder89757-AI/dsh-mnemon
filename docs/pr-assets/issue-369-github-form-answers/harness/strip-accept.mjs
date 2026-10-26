// Loaded with --import into the DSH Host, as a stand-in for the fetch patch in issue #369: requests to
// github.com are rebuilt without their accept header, so GitHub's OAuth endpoints answer form-encoded.
const original = globalThis.fetch
globalThis.fetch = function patchedFetch(input, init) {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input?.url
  if (typeof url === 'string' && url.startsWith('https://github.com/')) {
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
    headers.delete('accept')
    init = { ...init, headers }
  }
  return original.call(this, input, init)
}
