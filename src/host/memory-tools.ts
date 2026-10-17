/**
 * One row for each memory tool the Host registers: the Source Route or Action a named tool runs,
 * whether it reads, inspects or writes, and how the turn memory bar shows it. The result tool that
 * delegated children finish with runs no Source operation and has no row. Host modules and the
 * browser client read this table; each tool's model-visible description and schemas stay with its
 * registration in tools.ts. The two generic View tools run whichever Route or Action of the turn's
 * View a call names, so their rows name no Source and no page.
 */

/** A Memory System page the turn memory bar opens: Status, or a Source page id. */
export type MemoryToolPage = 'status' | `${string}/${string}`

export interface MemoryToolEntry {
  /** The Source type whose Route or Action the tool runs. */
  readonly sourceTypeId?: string
  /** The id of that Route or Action. */
  readonly operation?: string
  /** `read` returns evidence, `inspect` health or a catalog, and `write` changes memory. */
  readonly kind: 'read' | 'inspect' | 'write'
  /** The page the tool's chip in the turn memory bar opens. */
  readonly page?: MemoryToolPage
  /** The locale key that says what the tool did. */
  readonly label: `turnTail.tool.${string}`
}

/** In registration order, which is also the order the View lists tools that share an operation. */
export const MEMORY_TOOLS = {
  mnemon_view_route: { kind: 'read', label: 'turnTail.tool.viewRoute' },
  mnemon_view_action: { kind: 'write', label: 'turnTail.tool.viewAction' },
  mnemon_memory_bodies: { sourceTypeId: 'memory-spaces', operation: 'inspect', kind: 'inspect', page: 'memory-spaces/spaces', label: 'turnTail.tool.spaces' },
  mnemon_recall: { sourceTypeId: 'memory-spaces', operation: 'recall', kind: 'read', page: 'memory-spaces/explore', label: 'turnTail.tool.recall' },
  mnemon_related: { sourceTypeId: 'memory-spaces', operation: 'related', kind: 'read', page: 'memory-spaces/explore', label: 'turnTail.tool.related' },
  mnemon_status: { sourceTypeId: 'memory-spaces', operation: 'inspect', kind: 'inspect', page: 'status', label: 'turnTail.tool.status' },
  mnemon_document_search: { sourceTypeId: 'documents', operation: 'search', kind: 'read', page: 'documents/library', label: 'turnTail.tool.documentSearch' },
  mnemon_document_create: { sourceTypeId: 'documents', operation: 'create', kind: 'write', page: 'documents/library', label: 'turnTail.tool.documentCreate' },
  mnemon_document_manage: { sourceTypeId: 'documents', operation: 'manage', kind: 'write', page: 'documents/library', label: 'turnTail.tool.documentManage' },
  mnemon_runtime_memory: { sourceTypeId: 'runtime', operation: 'mutate', kind: 'write', page: 'runtime/entries', label: 'turnTail.tool.runtime' },
  mnemon_remember: { sourceTypeId: 'memory-spaces', operation: 'remember', kind: 'write', page: 'memory-spaces/spaces', label: 'turnTail.tool.remember' },
  mnemon_link: { sourceTypeId: 'memory-spaces', operation: 'link', kind: 'write', page: 'memory-spaces/spaces', label: 'turnTail.tool.link' },
  mnemon_forget: { sourceTypeId: 'memory-spaces', operation: 'forget', kind: 'write', page: 'memory-spaces/spaces', label: 'turnTail.tool.forget' },
  mnemon_memory_body_create: { sourceTypeId: 'memory-spaces', operation: 'manage-spaces', kind: 'write', page: 'memory-spaces/spaces', label: 'turnTail.tool.spaceCreate' },
  mnemon_memory_body_update: { sourceTypeId: 'memory-spaces', operation: 'manage-spaces', kind: 'write', page: 'memory-spaces/spaces', label: 'turnTail.tool.spaceUpdate' },
  mnemon_memory_body_merge: { sourceTypeId: 'memory-spaces', operation: 'manage-spaces', kind: 'write', page: 'memory-spaces/spaces', label: 'turnTail.tool.spaceMerge' },
} as const satisfies Readonly<Record<string, MemoryToolEntry>>

export type MemoryToolName = keyof typeof MEMORY_TOOLS
export type MemoryToolLabel = (typeof MEMORY_TOOLS)[MemoryToolName]['label']

/** The row of one memory tool, or undefined for any other tool name. */
export function memoryTool(name: string): (MemoryToolEntry & { readonly label: MemoryToolLabel }) | undefined {
  return Object.hasOwn(MEMORY_TOOLS, name) ? MEMORY_TOOLS[name as MemoryToolName] : undefined
}

/** Every memory tool name with its row, in table order. */
export function memoryTools(): Array<[MemoryToolName, MemoryToolEntry]> {
  return Object.entries(MEMORY_TOOLS) as Array<[MemoryToolName, MemoryToolEntry]>
}
