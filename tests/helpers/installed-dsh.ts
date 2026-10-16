import { realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'

/**
 * The DSH a real-host spec composes: the repository's pinned one, or the installation
 * DSH_HOST_ROOT names when the installed-DSH harness runs the root tests against it.
 */
export const requireDsh = createRequire(process.env.DSH_HOST_ROOT === undefined
  ? realpathSync(new URL('../../node_modules/@deepseek-ai/dsh/package.json', import.meta.url))
  : process.env.DSH_HOST_ROOT + '/package.json')

/** DSH 0.2.1's subagent runtime needs the working directory service, which needs fs; earlier DSH has neither. */
export async function loadWorkingDirectory(ctx: { get(name: string): unknown; plugin(plugin: never, config?: never): unknown }): Promise<void> {
  let workingDirectory: { default: unknown }
  try {
    workingDirectory = await import(requireDsh.resolve('@deepseek-ai/dsh-working-directory')) as { default: unknown }
  } catch {
    return
  }
  if (ctx.get('fs') === undefined) {
    const fs = await import(requireDsh.resolve('@deepseek-ai/dsh-fs-local')) as { default: unknown }
    await ctx.plugin(fs.default as never, { cwd: tmpdir() } as never)
  }
  await ctx.plugin(workingDirectory.default as never)
}
