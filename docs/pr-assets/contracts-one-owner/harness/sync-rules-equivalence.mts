// sync-rules-equivalence.mts <repository> <output.json>
//
// Runs both sides' checks of the Git sync settings over one corpus: the settings form's
// (src/client/sync-view.ts) and the Host's (src/host/sync-config.ts, the machine name in
// machine-identity.ts and the repository name GitHub sign-in creates in github-auth.ts). The corpus
// is every string of up to three characters from an alphabet of the characters the rules treat
// specially, the values at each length limit, and repository addresses built from every prefix and
// body below. Each check's verdict, the value the Host returns or the message it throws, is written
// to <output.json> as a SHA-256 digest per check, so two revisions compare by diffing two files.
// Run with Node 24: node --experimental-transform-types --no-warnings <this file> <repo> <out>
import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'

const [repository, output] = process.argv.slice(2)
if (repository === undefined || output === undefined) throw new Error('usage: sync-rules-equivalence.mts <repository> <output.json>')
const form = await import(`${repository}/src/client/sync-view.ts`)
const host = await import(`${repository}/src/host/sync-config.ts`)
const { machineLabel } = await import(`${repository}/src/host/machine-identity.ts`)
const { MnemonGitHubAuth } = await import(`${repository}/src/host/github-auth.ts`)

const alphabet = ['a', 'Z', '0', '.', '-', '_', '/', '\\', ':', '@', '{', ' ', '\0', '\n', 'é', '\u2028']
const short: string[] = ['']
for (let length = 1, layer = ['']; length <= 3; length++) {
  layer = layer.flatMap(prefix => alphabet.map(character => prefix + character))
  short.push(...layer)
}
const limits = [99, 100, 101, 119, 120, 121, 199, 200, 201, 310, 311, 312, 319, 320, 321, 399, 400, 401, 1999, 2000, 2001].flatMap(length => [
  'x'.repeat(length), `${'x'.repeat(Math.max(0, length - 12))}@example.com`, `https://github.com/${'x'.repeat(Math.max(0, length - 19))}`,
])
const prefixes = ['', 'https://', 'HTTPS://', 'ssh://', 'git@', 'git+ssh://', 'file://', 'ftp://', '/', 'C:\\', 'C:/', 'c:', '\\\\', '\\', '//', '~/', '.']
const bodies = ['github.com/example/memory.git', 'user:secret@github.com/example/memory.git', 'token@github.com/example/memory', 'github.com:22/example/memory.git',
  'github.com:example/memory.git', 'github.com', 'srv/memory.git', 'memory\\repo.git', 'server\\share\\repo.git', 'two words/repo', 'nul\0/repo', '']
const curated = ['mnemon-sync', 'user/mnemon-sync', 'v1.2', ' padded ', 'a//b', 'a..b', 'a@{1}', 'x.lock', 'mnemon/', '/nested/memory/', 'a/../b',
  'me@example.com', ' me@example.com ', 'me@@example.com', '<me>@example.com', 'Studio', 'two\nlines', 'tab\tbed', 'mnemon-memory', '...', 'a.b_c-d']
const corpus = [...new Set([...short, ...limits, ...curated, ...prefixes.flatMap(prefix => bodies.map(body => prefix + body))])]

/** What a Host check makes of a value: what it returns, or the message it throws. */
function outcome(check: (value: unknown) => unknown, value: string): unknown {
  try {
    return { value: check(value) }
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
}

// GitHub sign-in checks the name before it asks GitHub; the stand-in answers any request with a repository.
const grant = { version: 1, accessToken: 'gho_equivalence', savedAt: '2026-10-17T08:00:00.000Z' }
const port = { available: () => true, describe: async () => ({ configured: true, writable: true }), read: async () => grant, write: async () => {}, clear: async () => {} }
const repository_ = { name: 'memory', full_name: 'octocat/memory', clone_url: 'https://github.com/octocat/memory.git', private: true, default_branch: 'main', owner: { login: 'octocat' }, permissions: { push: true } }
const request = (async () => new Response(JSON.stringify(repository_), { status: 201, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch
const github = new MnemonGitHubAuth(port, 'Ov23liq4i7n8UsylGRfb', () => Date.parse(grant.savedAt), request)
async function githubOutcome(name: string): Promise<unknown> {
  try {
    await github.create(name, true)
    return 'accepted'
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
}

const checks: Record<string, Array<unknown>> = {
  'form repositoryProblem': corpus.map(value => form.repositoryProblem(value) ?? null),
  'form branchValid': corpus.map(value => form.branchValid(value)),
  'form directoryValid': corpus.map(value => form.directoryValid(value)),
  'form emailValid': corpus.map(value => form.emailValid(value)),
  'form machineNameValid': corpus.map(value => form.machineNameValid(value)),
  'form repositoryNameValid': corpus.map(value => form.repositoryNameValid(value)),
  'host syncRepositoryUrl': corpus.map(value => outcome(host.syncRepositoryUrl, value)),
  'host syncBranch': corpus.map(value => outcome(host.syncBranch, value)),
  'host syncSubdirectory': corpus.map(value => outcome(host.syncSubdirectory, value)),
  'host syncAuthorEmail': corpus.map(value => outcome(host.syncAuthorEmail, value)),
  'host machineLabel': corpus.map(value => outcome(machineLabel, value)),
  'host GitHub create': await Promise.all(corpus.map(githubOutcome)),
}
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const result = {
  inputs: corpus.length,
  corpus: digest(corpus),
  checks: Object.fromEntries(Object.entries(checks).map(([name, values]) => [name, digest(values)])),
}
writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`)
console.log(`${corpus.length} inputs through ${Object.keys(checks).length} checks: ${output}`)
