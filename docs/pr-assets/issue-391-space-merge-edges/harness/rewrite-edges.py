# rewrite-edges.py <storage root> <space name>: write one Memory Space's memories and edges into it again, as
# dsh-mnemon's mergeSpaces does when a copy of the space is merged back (mnemon import, edges at weight 0.5).
import json, os, sqlite3, subprocess, sys, tempfile
root, name = sys.argv[1], sys.argv[2]
registry = json.load(open(os.path.join(root, 'data', '.dsh-memory-bodies.json')))
body = next(body for body in registry['bodies'] if body['name'] == name)
found = [os.path.join(directory, 'mnemon.db') for directory, _dirs, files in os.walk(root) if os.path.basename(directory) == body['id'] and 'mnemon.db' in files and '/git/' not in directory]
if len(found) != 1: raise SystemExit('expected one database for ' + body['id'] + ': ' + repr(found))
db = found[0]
data_dir = os.path.dirname(os.path.dirname(os.path.dirname(db)))
def edges():
    c = sqlite3.connect(db)
    rows = c.execute('select source_id, target_id, edge_type, weight, metadata, created_at from edges order by 1, 2, 3').fetchall()
    c.close(); return rows
c = sqlite3.connect(db)
ins = c.execute('select id, content, category, importance, tags, entities, source, created_at from insights where deleted_at is null order by created_at').fetchall()
c.close()
before = edges()
index = {row[0]: i for i, row in enumerate(ins)}
draft = {'schema_version': '1', 'source': 'dsh-mnemon-merge',
  'insights': [{'content': r[1], 'category': r[2], 'importance': r[3], 'tags': json.loads(r[4]), 'entities': json.loads(r[5]), 'source': r[6], 'created_at': r[7]} for r in ins],
  'edges': [{'source_index': index[s], 'target_index': index[t], 'edge_type': ty, 'weight': 0.5, 'reason': ty} for (s, t, ty, *_rest) in before if s in index and t in index]}
with tempfile.TemporaryDirectory() as directory:
    path = os.path.join(directory, 'memory-draft.json')
    json.dump(draft, open(path, 'w'))
    out = subprocess.run(['mnemon', '--data-dir', data_dir, '--store', body['id'], 'import', path], capture_output=True, text=True)
if out.returncode != 0: raise SystemExit(out.stderr)
result = json.loads(out.stdout)
after = edges()
print(json.dumps({'database': os.path.relpath(db, root), 'space': name, 'memories': len(ins), 'edges': len(before), 'sameKeys': [r[:3] for r in before] == [r[:3] for r in after],
  'valuesRewritten': sum(1 for a, b in zip(before, after) if a[3:] != b[3:]),
  'import': {k: result.get(k) for k in ('imported', 'updated', 'skipped', 'edges_inserted', 'errors')}}, ensure_ascii=False))
