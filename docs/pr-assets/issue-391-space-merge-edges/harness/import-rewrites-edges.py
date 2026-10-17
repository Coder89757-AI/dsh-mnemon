import json, os, shutil, sqlite3, subprocess, sys
root = sys.argv[1]
env = dict(os.environ, MNEMON_DATA_DIR=os.path.join(root, 'data'))
shutil.rmtree(os.path.join(root, 'data'), ignore_errors=True)
def mn(*args):
    out = subprocess.run(['mnemon', *args], env=env, capture_output=True, text=True)
    if out.returncode != 0: raise SystemExit(out.stderr)
    return out.stdout
for text in ['The staging gateway routes requests by model family for the Lumen project',
             'The Lumen staging gateway warms new accounts for a week before routing them',
             'Lumen gateway routing rules live in the routing service repository']:
    mn('remember', text, '--cat', 'fact', '--entities', 'Lumen,gateway')
db = os.path.join(root, 'data', 'data', 'default', 'mnemon.db')
def edges(path):
    c = sqlite3.connect(path)
    rows = c.execute('select source_id, target_id, edge_type, weight, metadata, created_at from edges order by source_id, target_id, edge_type').fetchall()
    c.close(); return rows
shutil.copy(db, os.path.join(root, 'published.db'))
before = edges(db)
# What mergeSpaces does with a copy of this space: every memory and edge of the copy, edges at weight 0.5.
c = sqlite3.connect(db)
ins = c.execute('select id, content, category, importance, tags, entities, source, created_at from insights where deleted_at is null order by created_at').fetchall()
c.close()
index = {row[0]: i for i, row in enumerate(ins)}
draft = {'schema_version': '1', 'source': 'dsh-mnemon-merge',
  'insights': [{'content': r[1], 'category': r[2], 'importance': r[3], 'tags': json.loads(r[4]), 'entities': json.loads(r[5]), 'source': r[6], 'created_at': r[7]} for r in ins],
  'edges': [{'source_index': index[s], 'target_index': index[t], 'edge_type': ty, 'weight': 0.5, 'reason': ty} for (s, t, ty, *_rest) in before if s in index and t in index]}
path = os.path.join(root, 'draft.json'); json.dump(draft, open(path, 'w'))
result = json.loads(mn('import', path))
after = edges(db)
print(json.dumps({'import': {k: result.get(k) for k in ('imported', 'updated', 'skipped', 'edges_inserted', 'errors')},
  'edges': len(before), 'sameKeys': [r[:3] for r in before] == [r[:3] for r in after],
  'changedValues': sum(1 for a, b in zip(before, after) if a[3:] != b[3:]),
  'example': {'before': before[0][3:], 'after': after[0][3:]}}, indent=1))
