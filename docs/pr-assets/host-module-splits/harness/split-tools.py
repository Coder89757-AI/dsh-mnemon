#!/usr/bin/env python3
"""split-tools.py <repo> <base-rev> [<out-dir>]: split registerTools in src/host/tools.ts at <base-rev> into one function per tool family, written under <out-dir> (default <repo>).

The shared closures and every ctx.tools.register block are sliced from the base file by line number and keep their
text and indentation; only the new function signatures, the calls in registerTools and their comments are new.
"""
import os
import re
import subprocess
import sys

repo, rev = sys.argv[1], sys.argv[2]
out_dir = sys.argv[3] if len(sys.argv) > 3 else repo
base = subprocess.run(['git', '-C', repo, 'show', f'{rev}:src/host/tools.ts'], check=True, capture_output=True, text=True).stdout
lines = base.split('\n')
assert lines[-1] == ''
lines = lines[:-1]


def L(a, b):
    return lines[a - 1:b]


def expect(n, text):
    assert lines[n - 1] == text, (n, lines[n - 1])


expect(63, '/** Named product tools are views over the same Source Route/Action protocol. */')
expect(64, 'export function registerTools(ctx: HostContextShape, runtimeSource: MnemonAgentRuntimeSource, coordinator: MnemonSubagentCoordinator): void {')
expect(65, '  const runtimeFor = (exec: ToolExecution): MnemonRuntimeGraph => runtimeSource.forAgent(requireAgent(exec))')
expect(93, '  }')
expect(94, '')
expect(95, '  ctx.tools.register(definition({')
expect(502, '}')

# Each family's registrations, by tool name, as the base file has them.
families = [
    ('registerViewTools', '{ runtimeFor, config, composableTurn }', 95, 149, ['mnemon_view_route', 'mnemon_view_action'],
     "/** The two generic View tools, which run whichever Route or Action of the turn's View a call names. */"),
    ('registerMemorySpaceReadTools', '{ sourceFor, requireSource }', 151, 232, ['mnemon_memory_bodies', 'mnemon_recall', 'mnemon_related', 'mnemon_status'],
     "/** Memory Spaces' catalog, Recall, Related and health. */"),
    ('registerDocumentTools', '{ requireSource, config, sourceAction }', 234, 315, ['mnemon_document_search', 'mnemon_document_create', 'mnemon_document_manage'],
     '/** The project Documents tools. */'),
    ('registerRuntimeTools', '{ requireSource, config, composableTurn }', 317, 350, ['mnemon_runtime_memory'],
     '/** The runtime memory tool, which writes USER.md and MEMORY.md. */'),
    ('registerMemorySpaceWriteTools', '{ requireSource, sourceAction }', 352, 501, ['mnemon_remember', 'mnemon_link', 'mnemon_forget', 'mnemon_memory_body_create',
                                                                                     'mnemon_memory_body_update', 'mnemon_memory_body_merge'],
     "/** Memory Spaces' writes: remember, link and forget, and creating, updating and merging spaces. */"),
]
covered = set()
for name, helpers, a, b, tools, _doc in families:
    block = L(a, b)
    text = '\n'.join(block)
    assert block[0] == '  ctx.tools.register(definition({', (name, block[0])
    assert block[-1] == '  } as never))', (name, block[-1])
    names = [line.split("'")[1] for line in block if line.startswith("    name: '")]
    assert names == tools, (name, names)
    assert 'runtimeSource' not in text, name
    used = {helper for helper in ('runtimeFor', 'sourceFor', 'requireSource', 'config', 'composableTurn', 'sourceAction') if re.search(rf'(?<![\w.]){helper}[(.]', text)}
    assert used == set(helpers.strip('{} ').split(', ')), (name, used)
    covered.update(range(a, b + 1))
# Only the blank lines between the families are left out.
assert all(lines[n - 1] == '' for n in range(95, 502) if n not in covered)

out = L(1, 62)
out += [
    '/**',
    ' * Named product tools are views over the same Source Route/Action protocol. Each family registers its tools in the',
    " * order the model has always been given them, which puts Memory Spaces' reads before the Documents tools and its",
    ' * writes after the runtime memory tool.',
    ' */',
    'export function registerTools(ctx: HostContextShape, runtimeSource: MnemonAgentRuntimeSource, coordinator: MnemonSubagentCoordinator): void {',
    '  const helpers = toolHelpers(runtimeSource)',
] + [f'  {name}(ctx, helpers, coordinator)' for name, *_ in families] + [
    '}',
    '',
    "/** What the handlers of every family share: the calling Agent's runtime graph and Sources, its checks, and a Source Action call. */",
    'function toolHelpers(runtimeSource: MnemonAgentRuntimeSource) {',
] + L(65, 93) + [
    '  return { runtimeFor, sourceFor, requireSource, config, composableTurn, sourceAction }',
    '}',
    '',
    'type ToolHelpers = ReturnType<typeof toolHelpers>',
]
for name, helpers, a, b, _tools, doc in families:
    out += ['', doc, f'function {name}(ctx: HostContextShape, {helpers}: ToolHelpers, coordinator: MnemonSubagentCoordinator): void {{']
    out += L(a, b)
    out += ['}']
os.makedirs(f'{out_dir}/src/host', exist_ok=True)
with open(f'{out_dir}/src/host/tools.ts', 'w') as handle:
    handle.write('\n'.join(out) + '\n')
print('split done')
