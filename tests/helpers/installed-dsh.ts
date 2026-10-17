import { realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'

/**
 * The DSH a real-host spec composes: the repository's pinned one, or the installation
 * DSH_HOST_ROOT names when `pnpm run test:installed-dsh` runs the root tests against it.
 */
export const requireDsh = createRequire(process.env.DSH_HOST_ROOT === undefined
  ? realpathSync(new URL('../../node_modules/@deepseek-ai/dsh/package.json', import.meta.url))
  : process.env.DSH_HOST_ROOT + '/package.json')

/** The version of the DSH the specs compose. */
export const dshVersion = (requireDsh('@deepseek-ai/dsh/package.json') as { version: string }).version

/**
 * Whether a DSH version is 0.2.1 or later, prereleases included. DSH 0.2.1 starts every child through
 * `startActivation`, has no `both` tools mode and refuses a filtered tool inside `run_code` before it
 * runs; DSH 0.2.0, the other supported host, does none of these.
 */
export function isDsh021(version: string): boolean {
  const [major = 0, minor = 0, patch = 0] = version.split(/[.-]/u).slice(0, 3).map(Number)
  return major > 0 || minor > 2 || (minor === 2 && patch >= 1)
}

/** Whether the DSH the specs compose is 0.2.1 or later. */
export const dsh021 = isDsh021(dshVersion)

/**
 * DSH 0.2.1's subagent runtime needs the working directory service, which needs fs; DSH 0.2.0 has neither.
 * `host` resolves from the DSH being composed, the one the specs compose unless a spec names another. The
 * version decides, not whether the package resolves: under `pnpm run`, NODE_PATH reaches this repository's
 * own DSH packages from any installation.
 */
export async function loadWorkingDirectory(ctx: { get(name: string): unknown; plugin(plugin: never, config?: never): unknown }, host: NodeJS.Require = requireDsh): Promise<void> {
  if (!isDsh021((host('@deepseek-ai/dsh/package.json') as { version: string }).version)) return
  if (ctx.get('fs') === undefined) {
    const fs = await import(host.resolve('@deepseek-ai/dsh-fs-local')) as { default: unknown }
    await ctx.plugin(fs.default as never, { cwd: tmpdir() } as never)
  }
  const workingDirectory = await import(host.resolve('@deepseek-ai/dsh-working-directory')) as { default: unknown }
  await ctx.plugin(workingDirectory.default as never)
}
