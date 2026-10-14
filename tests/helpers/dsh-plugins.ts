import * as jsonl from '@deepseek-ai/dsh-session-persistence-jsonl'

/**
 * The Cordis plugin a DSH package provides. Up to DSH 0.2.1-alpha.2 some
 * packages export a plugin class as default; from 0.2.1-alpha.3 they export the
 * plugin itself (`name`, `Config`, `apply`), which Cordis loads as it is.
 */
export function dshPlugin<Plugin>(module: { default?: Plugin }): Plugin {
  return module.default ?? module as Plugin
}

/** DSH's JSONL Session persistence, whichever form the installed DSH exports. */
export const JsonlSessionPersistence = dshPlugin<typeof jsonl.default>(jsonl)
