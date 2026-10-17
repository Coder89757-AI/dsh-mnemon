#!/usr/bin/env python3
"""split-subagent.py <repo> <base-rev> [<out-dir>]: split src/host/subagent.ts at <base-rev> into its modules, written under <out-dir> (default <repo>).

Every moved line is sliced from the base file by line number. Top-level blocks move unchanged
(a name a sibling imports gains `export`); class methods move de-indented by two spaces, and
only the listed substitutions are applied, each checked to occur exactly as often as expected.
"""
import os
import subprocess
import sys

repo, rev = sys.argv[1], sys.argv[2]
out_dir = sys.argv[3] if len(sys.argv) > 3 else repo
base = subprocess.run(['git', '-C', repo, 'show', f'{rev}:src/host/subagent.ts'], check=True, capture_output=True, text=True).stdout
lines = base.split('\n')
assert lines[-1] == ''
lines = lines[:-1]


def L(a, b):
    """Lines a..b of the base file, one-based and inclusive."""
    return lines[a - 1:b]


def export(block, *names):
    out = list(block)
    for name in names:
        hits = [i for i, line in enumerate(out) if any(line.startswith(f'{kind} {name}') and not line[len(kind) + 1 + len(name)].isalnum()
                                                       for kind in ('function', 'const', 'interface', 'type', 'async function'))]
        assert len(hits) == 1, (name, hits)
        out[hits[0]] = 'export ' + out[hits[0]]
    return out


def substitute(block, replacements):
    text = '\n'.join(block)
    for old, new, count in replacements:
        assert text.count(old) == count, (old, text.count(old), count)
        text = text.replace(old, new)
    return text.split('\n')


# The lines inside multi-line template literals of moved methods: model text, which keeps its columns.
TEMPLATE_LINES = set(range(1774, 1784)) | set(range(1960, 1964))


def method(a, b, signature, replacements=()):
    """A class method as a module function: two spaces less indentation, a new signature start."""
    block = []
    for n, line in enumerate(L(a, b), start=a):
        if n in TEMPLATE_LINES:
            block.append(line)
            continue
        assert line == '' or line.startswith('  '), (n, line)
        block.append(line[2:])
    old, new = signature
    hits = [i for i, line in enumerate(block) if line.startswith(old)]
    assert len(hits) == 1, (old, hits)
    block[hits[0]] = new + block[hits[0]][len(old):]
    return substitute(block, replacements)


def module(header, imports, blocks):
    out = list(header) + list(imports) + ['']
    for index, block in enumerate(blocks):
        if index > 0:
            out.append('')
        out.extend(block)
    return '\n'.join(out) + '\n'


def write(path, text):
    os.makedirs(os.path.dirname(f'{out_dir}/{path}'), exist_ok=True)
    with open(f'{out_dir}/{path}', 'w') as handle:
        handle.write(text)


# subagent-output-schema.ts: the DSH output-schema validator.
write('src/host/subagent-output-schema.ts', module([
    '/** The JSON Schema subset DSH structured-output tools compile, and the check of a captured result against a schema in it. */',
], [], [
    L(308, 311),
    L(313, 325),
    L(327, 329),
    export(L(331, 389), 'assertDshOutputValue'),
]))

# subagent-prompts.ts: the personas, the result schemas and the helpers that write a child's task.
write('src/host/subagent-prompts.ts', module([
    '/**',
    ' * What a delegated child reads apart from its run\'s own data: the persona of each kind of child, the',
    ' * schema its result must match, and the helpers that write a run\'s data into its task.',
    ' * tests/subagent.spec.ts pins this text as the children read it.',
    ' */',
], [
    "import type { Insight, MemorySpaceMetadataSample } from 'dsh-mnemon-source-memory-spaces/contracts'",
    "import { RUNTIME_ENTRY_DELIMITER, RUNTIME_PROJECTION_FILES, type RuntimeMemoryMaintenancePlan } from 'dsh-mnemon-source-runtime/contracts'",
], [
    export(L(119, 119), 'WRITE_ACTIONS'),
    export(L(203, 306), 'WRITE_SCHEMA', 'DOCUMENT_ARCHIVE_SCHEMA', 'ANSWER_SCHEMA', 'providerPlacementSchema', 'METADATA_MAINTENANCE_SCHEMA',
           'RUNTIME_MIGRATION_SCHEMA', 'USER_COMPACTION_SCHEMA'),
    export(L(457, 468), 'indentedText'),
    export(L(470, 490), 'REQUEST_LABELS', 'TARGETED_WRITE_LABELS'),
    export(L(555, 575), 'naturalRequest', 'naturalEvidence'),
    export(L(577, 593), 'runtimeEntryScopeMeta', 'runtimeSnapshotContext'),
    export(L(631, 642), 'pendingMutationContext'),
    export(L(663, 672), 'eligibleMemorySpaceContext'),
    export(L(674, 686), 'WRITE_PERSONA', 'AUTONOMOUS_WRITE_PERSONA', 'SUPERVISED_WRITE_PERSONA', 'ANSWER_PERSONA', 'PROVIDER_PLACEMENT_PERSONA',
           'METADATA_MAINTENANCE_PERSONA'),
    export(L(688, 702), 'metadataSampleText'),
    export(L(704, 727), 'reviewPersona'),
    export(L(729, 737), 'ARCHIVE_PERSONA', 'USER_COMPACTION_PERSONA', 'DOCUMENT_ARCHIVE_PERSONA'),
]))

# subagent-receipts.ts: receipt recovery.
write('src/host/subagent-receipts.ts', module([
    '/**',
    ' * Reading back what a delegated child returned: its structured result, the receipts of the memory tools',
    ' * it called, which can stand in for a result it did not record, and the bounded detail of a failure.',
    ' */',
], [
    'import type { HostSubagentResult, HostSubagentRun } from "./dsh.ts"',
    "import { mutationResultCommitted } from './receipts.ts'",
    "import type { IdleReviewFailure, MemoryToolName } from './protocol.ts'",
    "import { WRITE_ACTIONS } from './subagent-prompts.ts'",
], [
    export(L(94, 97), 'isTool'),
    L(120, 120),
    L(130, 137),
    export(L(149, 152), 'CapturedSubagentResult'),
    export(L(154, 157), 'CapturedToolReceipt'),
    export(L(166, 178), 'reviewReceipt'),
    export(L(192, 194), 'ToolReceiptRecovery'),
    export(L(416, 423), 'object', 'strings'),
    export(L(425, 455), 'safeFailureDetail', 'subagentFailureDetail'),
    export(L(764, 766), 'optionalObject'),
    export(L(793, 813), 'addString'),
    export(L(872, 905), 'recoverStructuredResult'),
]))

# archive-destinations.ts: what both archive workflows share.
write('src/host/archive-destinations.ts', module([
    '/**',
    ' * Where a MEMORY.md archive or a Document\'s index can go, and the lineage that names where an archived',
    ' * entry went: the Memory Spaces that can take one, and the destination a Provider\'s receipt proves.',
    ' */',
], [
    "import { createHash } from 'node:crypto'",
    "import type { MemorySpaceCatalog } from 'dsh-mnemon-source-memory-spaces/contracts'",
    "import { mutationResultCommitted } from './receipts.ts'",
    "import type { MemoryMigrationLineage, MemoryOperationScope } from '../core/contracts/index.ts'",
    "import type { MemoryCompositionGeneration } from '../core/composition.ts'",
    "import type { MnemonRuntimeGraph } from './runtime.ts'",
    "import { addString, optionalObject } from './subagent-receipts.ts'",
], [
    export(L(180, 185), 'MigrationSource'),
    export(L(644, 653), 'archivableSpace'),
    export(L(768, 770), 'sha256'),
    export(L(815, 866), 'destinationFromCommittedMutation', 'skippedExactDestination', 'mutationStates'),
    method(2335, 2339, ('private async archivableElsewhere(', 'export async function archivableElsewhere('), [
        ('return !await this.noArchivableMemorySpace(', 'return !await noArchivableMemorySpace(', 1),
    ]),
    method(2341, 2357, ('private async noArchivableMemorySpace(', 'export async function noArchivableMemorySpace(')),
]))

# runtime-capacity.ts: the runtime-capacity workflow.
write('src/host/runtime-capacity.ts', module([
    '/**',
    ' * The runtime-capacity workflow: a runtime memory write that does not fit first compacts USER.md locally, or',
    ' * archives MEMORY.md entries into a Memory Space, routing them in bounded batches when several spaces could',
    ' * take them, or into the Runtime Source\'s local archive when none can (#336), and then commits the write.',
    ' * The coordinator runs it one write at a time.',
    ' */',
], [
    "import { randomUUID } from 'node:crypto'",
    'import type { HostSubagentResult } from "./dsh.ts"',
    "import { RUNTIME_ENTRY_DELIMITER, type RuntimeMemoryCompactedEntry, type RuntimeMemoryMaintenancePlan, type RuntimeMemoryMutation, type RuntimeMemoryMutationResult } from 'dsh-mnemon-source-runtime/contracts'",
    "import type { Insight, MemorySpaceCatalog, MemorySpaceWriteScopeRequest } from 'dsh-mnemon-source-memory-spaces/contracts'",
    "import { mutationResultCommitted } from './receipts.ts'",
    "import { sourceFailure, type SourceSession } from './source-session.ts'",
    "import { allowsParticipation } from './access.ts'",
    "import type { CoordinatedRuntimeMemoryResult, SubagentCounters } from './protocol.ts'",
    "import type { ComposableMemoryView, MemoryMigrationLineage, MemoryOperationScope } from '../core/contracts/index.ts'",
    "import type { MemoryCompositionGeneration } from '../core/composition.ts'",
    "import type { MnemonAgentRuntimeSource, MnemonRuntimeGraph } from './runtime.ts'",
    "import type { ComposableMemoryTurn } from '../core/turns.ts'",
    "import { ARCHIVE_PERSONA, eligibleMemorySpaceContext, pendingMutationContext, RUNTIME_MIGRATION_SCHEMA, runtimeEntryScopeMeta, runtimeSnapshotContext, USER_COMPACTION_PERSONA, USER_COMPACTION_SCHEMA } from './subagent-prompts.ts'",
    "import { object, optionalObject, safeFailureDetail, strings } from './subagent-receipts.ts'",
    "import { archivableElsewhere, archivableSpace, destinationFromCommittedMutation, mutationStates, noArchivableMemorySpace, sha256, skippedExactDestination, type MigrationSource } from './archive-destinations.ts'",
], [
    export(L(27, 27), 'RuntimeModelResult'),
    L(29, 33),
    export(L(35, 45), 'RuntimeWriteContext'),
    L(111, 112),
    L(595, 629),
    L(655, 661),
    L(772, 782),
    method(1283, 1305, ('private async runtimeArchiveSource(graph: MnemonRuntimeGraph,', 'export async function runtimeArchiveSource(runtimeSource: MnemonAgentRuntimeSource, graph: MnemonRuntimeGraph,'), [
        ('!this.runtimeSource.config.writeEnabled', '!runtimeSource.config.writeEnabled', 1),
        ('await this.noArchivableMemorySpace(', 'await noArchivableMemorySpace(', 1),
        ('await this.archivableElsewhere(', 'await archivableElsewhere(', 1),
    ]),
    method(1307, 1340, ('private async archiveRuntimeLocally(context:', 'async function archiveRuntimeLocally(counters: SubagentCounters, context:'), [
        ('this.counters.', 'counters.', 4),
    ]),
    method(1693, 1949, ('private async runtimeLocked(context:', 'export async function runtimeLocked(counters: SubagentCounters, context:'), [
        ('return this.compactUserAndCommit(context,', 'return compactUserAndCommit(context,', 1),
        ('return this.archiveRuntimeLocally(context,', 'return archiveRuntimeLocally(counters, context,', 2),
        ('await this.archiveRuntimeEntry(', 'await archiveRuntimeEntry(', 1),
        ('this.counters.', 'counters.', 4),
    ]),
    method(1951, 2004, ('private async compactUserAndCommit(', 'async function compactUserAndCommit(')),
    method(2006, 2040, ('private async archiveRuntimeEntry(', 'async function archiveRuntimeEntry(')),
]))

# document-archive.ts: the Document workflow.
host_interface = [
    '/** What the Document workflow takes from the coordinator that runs it. */',
    'export interface DocumentWorkflowHost {',
    '  readonly runtimeSource: MnemonAgentRuntimeSource',
    '  readonly counters: SubagentCounters',
    '  turnAuthority(agent: HostAgent, required: boolean): { context: ComposableMemoryTurn; graph: MnemonRuntimeGraph } | undefined',
    '  sourceFor(parent: HostAgent, typeId: string): SourceSession',
    '  writableSourceFor(parent: HostAgent, typeId: string, actionId: string): Promise<SourceSession>',
    "  delegate(parent: HostAgent, operation: 'document-archive', label: string, prompt: string, tools: string[], outputSchema: Record<string, unknown>,",
    "    signal: AbortSignal, preferredProvider: 'spawn' | 'fork', persona: string): Promise<{ provider: string; runId: string; result: HostSubagentResult }>",
    '}',
]
write('src/host/document-archive.ts', module([
    '/**',
    ' * The Document workflow: a Document write that does not fit first archives the Documents its capacity plan',
    ' * names, each indexed in a Memory Space with lineage, or archived locally when no space can take its index',
    ' * (#336), and then commits the write. The coordinator runs it one request at a time.',
    ' */',
], [
    "import { randomUUID } from 'node:crypto'",
    'import type { HostAgent, HostSubagentResult } from "./dsh.ts"',
    "import type { DocumentCapacityPlan, DocumentMutation, DocumentMutationResult, DocumentRecord, DocumentView } from 'dsh-mnemon-source-documents/contracts'",
    "import type { Insight, MemorySpaceCatalog } from 'dsh-mnemon-source-memory-spaces/contracts'",
    "import { mutationResultCommitted } from './receipts.ts'",
    "import { sourceFailure, type SourceSession } from './source-session.ts'",
    "import { allowsParticipation, assertParticipation } from './access.ts'",
    "import type { CoordinatedDocumentResult, SubagentCounters } from './protocol.ts'",
    "import type { MemoryMigrationLineage } from '../core/contracts/index.ts'",
    "import type { MemoryCompositionGeneration } from '../core/composition.ts'",
    "import { agentScope, type MnemonAgentRuntimeSource, type MnemonRuntimeGraph } from './runtime.ts'",
    "import type { ComposableMemoryTurn } from '../core/turns.ts'",
    "import { DOCUMENT_ARCHIVE_PERSONA, DOCUMENT_ARCHIVE_SCHEMA, eligibleMemorySpaceContext, indentedText } from './subagent-prompts.ts'",
    "import { object, optionalObject, strings } from './subagent-receipts.ts'",
    "import { archivableElsewhere, archivableSpace, destinationFromCommittedMutation, mutationStates, noArchivableMemorySpace, sha256, skippedExactDestination, type MigrationSource } from './archive-destinations.ts'",
], [
    L(739, 762),
    L(784, 791),
    L(868, 870),
    host_interface,
    method(1532, 1571, ('private async documentLocked(parent:', 'export async function documentLocked(host: DocumentWorkflowHost, parent:'), [
        ('await this.writableSourceFor(', 'await host.writableSourceFor(', 1),
        ('await this.archiveDocumentLocked(parent,', 'await archiveDocumentLocked(host, parent,', 2),
        ('await this.documentCommit(parent,', 'await documentCommit(host, parent,', 2),
    ]),
    method(1573, 1691, ('private async archiveDocumentLocked(parent:', 'export async function archiveDocumentLocked(host: DocumentWorkflowHost, parent:'), [
        ('this.runtimeSource.forAgent(parent)', 'host.runtimeSource.forAgent(parent)', 1),
        ('this.turnAuthority(parent, false)', 'host.turnAuthority(parent, false)', 1),
        ('(await this.writableSourceFor(', '(await host.writableSourceFor(', 1),
        ('await this.documentIndexSpaces(parent,', 'await documentIndexSpaces(host, parent,', 1),
        ('return this.archiveDocumentLocally(controller,', 'return archiveDocumentLocally(host.counters, controller,', 2),
        ('!await this.archivableElsewhere(', '!await archivableElsewhere(', 1),
        ('await this.delegate(', 'await host.delegate(', 1),
        ('await this.assertAutomaticMemoryWrite(parent)', 'await assertAutomaticMemoryWrite(host, parent)', 1),
    ]),
    method(2295, 2300, ('private async documentCommit(parent:', 'async function documentCommit(host: DocumentWorkflowHost, parent:'), [
        ('this.sourceFor(parent,', 'host.sourceFor(parent,', 1),
        ('this.turnAuthority(parent, false)', 'host.turnAuthority(parent, false)', 1),
        ('this.runtimeSource.config.writeEnabled', 'host.runtimeSource.config.writeEnabled', 1),
    ]),
    method(2316, 2333, ('private async documentIndexSpaces(parent:', 'async function documentIndexSpaces(host: DocumentWorkflowHost, parent:'), [
        ('this.runtimeSource.forAgent(parent)', 'host.runtimeSource.forAgent(parent)', 1),
        ('!this.runtimeSource.config.writeEnabled', '!host.runtimeSource.config.writeEnabled', 1),
        ('this.turnAuthority(parent, false)', 'host.turnAuthority(parent, false)', 1),
        ('await this.noArchivableMemorySpace(', 'await noArchivableMemorySpace(', 1),
        ('return this.writableSourceFor(', 'return host.writableSourceFor(', 1),
    ]),
    method(2359, 2370, ('private async archiveDocumentLocally(controller:', 'async function archiveDocumentLocally(counters: SubagentCounters, controller:'), [
        ('this.counters.', 'counters.', 4),
    ]),
    method(2372, 2377, ('private async assertAutomaticMemoryWrite(parent:', 'async function assertAutomaticMemoryWrite(host: DocumentWorkflowHost, parent:'), [
        ('this.runtimeSource.forAgent(parent)', 'host.runtimeSource.forAgent(parent)', 1),
        ('!this.runtimeSource.config.writeEnabled', '!host.runtimeSource.config.writeEnabled', 1),
        ('return this.writableSourceFor(', 'return host.writableSourceFor(', 1),
    ]),
]))

# subagent.ts: the facade and the coordinator.
removed = [(27, 27), (29, 45), (94, 97), (111, 112), (119, 120), (130, 137), (149, 158), (166, 186), (192, 195), (203, 390), (416, 491),
           (555, 906), (1282, 1340), (1531, 2040), (2294, 2300), (2315, 2377)]
gone = set()
for a, b in removed:
    for n in range(a, b + 1):
        assert n not in gone
        gone.add(n)

imports = {
    1: "import { randomUUID } from 'node:crypto'",
    3: "import type { DocumentMutation, DocumentSearchResult, DocumentSnapshot, DocumentView } from 'dsh-mnemon-source-documents/contracts'",
    4: "import type { RuntimeMemoryMutation, RuntimeMemoryMutationResult, RuntimeMemorySnapshot } from 'dsh-mnemon-source-runtime/contracts'",
    5: "import type { EdgeType, Insight, MemorySpaceCatalog, MemorySpaceMetadataSample, PreparedMemoryPlacement, RememberRequest, SearchRequest } from 'dsh-mnemon-source-memory-spaces/contracts'",
    7: "import { SourceSession } from './source-session.ts'",
    13: "import { DEFAULT_MEMORY_VIEW_BUDGET, type ComposableMemoryView, type MemoryEvidence, type MemoryJsonValue, type MemoryMutationReceipt, type MemoryOperationScope, type MemorySourceManagementRequest, type MemorySourceManagementResult } from '../core/contracts/index.ts'",
    14: None,
}
added_imports = [
    "import { assertDshOutputSchema, assertDshOutputValue } from './subagent-output-schema.ts'",
    "import { ANSWER_PERSONA, ANSWER_SCHEMA, AUTONOMOUS_WRITE_PERSONA, indentedText, METADATA_MAINTENANCE_PERSONA, METADATA_MAINTENANCE_SCHEMA, metadataSampleText, naturalEvidence, naturalRequest, PROVIDER_PLACEMENT_PERSONA, providerPlacementSchema, REQUEST_LABELS, reviewPersona, SUPERVISED_WRITE_PERSONA, TARGETED_WRITE_LABELS, WRITE_PERSONA, WRITE_SCHEMA } from './subagent-prompts.ts'",
    "import { isTool, object, optionalObject, recoverStructuredResult, reviewReceipt, strings, subagentFailureDetail, type CapturedSubagentResult, type CapturedToolReceipt, type ToolReceiptRecovery } from './subagent-receipts.ts'",
    "import { archivableElsewhere } from './archive-destinations.ts'",
    "import { runtimeArchiveSource, runtimeLocked, type RuntimeModelResult, type RuntimeWriteContext } from './runtime-capacity.ts'",
    "import { archiveDocumentLocked, documentLocked, type DocumentWorkflowHost } from './document-archive.ts'",
]
workflow_method = [
    '',
    '  /** What the Document workflow in document-archive.ts takes from this coordinator. */',
    '  private documentWorkflow(): DocumentWorkflowHost {',
    '    return {',
    '      runtimeSource: this.runtimeSource, counters: this.counters, turnAuthority: this.turnAuthority.bind(this),',
    '      sourceFor: this.sourceFor.bind(this), writableSourceFor: this.writableSourceFor.bind(this), delegate: this.delegate.bind(this),',
    '    }',
    '  }',
]
facade = []
for n, line in enumerate(lines, start=1):
    if n in gone:
        continue
    if n in imports:
        if imports[n] is not None:
            facade.append(imports[n])
        continue
    facade.append(line)
    if n == 21:
        facade.extend(added_imports)
    if n == 23:
        facade.append("export { assertDshOutputSchema } from './subagent-output-schema.ts'")
    if n == 1414:
        assert line == '  }', line
        facade.extend(workflow_method)
assert lines[20].startswith("import type { IdleReviewFailure, MemoryToolName }"), lines[20]
assert lines[22].startswith('export type {'), lines[22]
facade = substitute(facade, [
    ('elsewhere: await this.archivableElsewhere(graph, scope, lease.generation, sourceInstanceKey, signal)',
     'elsewhere: await archivableElsewhere(graph, scope, lease.generation, sourceInstanceKey, signal)', 1),
    ('this.runtimeQueue.then(() => this.runtimeLocked(context, request, signal))',
     'this.runtimeQueue.then(() => runtimeLocked(this.counters, context, request, signal))', 1),
    ('return this.runtimeArchiveSource(graph, ', 'return runtimeArchiveSource(this.runtimeSource, graph, ', 2),
    ('this.documentQueue.then(() => this.documentLocked(parent, request, signal))',
     'this.documentQueue.then(() => documentLocked(this.documentWorkflow(), parent, request, signal))', 1),
    ('this.documentQueue.then(() => this.archiveDocumentLocked(parent, id, signal))',
     'this.documentQueue.then(() => archiveDocumentLocked(this.documentWorkflow(), parent, id, signal))', 1),
])
write('src/host/subagent.ts', '\n'.join(facade) + '\n')
print('split done')
