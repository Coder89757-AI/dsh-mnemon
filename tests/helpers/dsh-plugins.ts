import * as jsonl from '@deepseek-ai/dsh-session-persistence-jsonl'

/**
 * The Cordis plugin a DSH package provides. DSH 0.2.0 exports some packages' plugin class as
 * default; DSH 0.2.1 exports the plugin itself (`name`, `Config`, `apply`), which Cordis loads as it is.
 */
export function dshPlugin<Plugin>(module: object): Plugin {
  return ((module as { default?: Plugin }).default ?? module) as Plugin
}

/** DSH's JSONL Session persistence, whichever form the installed DSH exports. */
export const JsonlSessionPersistence = dshPlugin<typeof jsonl>(jsonl)
