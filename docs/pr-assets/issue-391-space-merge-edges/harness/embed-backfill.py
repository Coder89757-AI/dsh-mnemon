"""embed-backfill.py <probe dir> <port file>: what a vector backfill and a kept memory rewrite in the rows Git sync compares.

Three memories are remembered while no embedding service answers, the store is kept as published, then `mnemon embed --all`
runs against fake-embeddings.py and `mnemon gc --keep` keeps one memory. Each step's database is kept for merge-identities.mjs.
"""
import json, os, shutil, sqlite3, subprocess, sys, time

root, port = sys.argv[1], open(sys.argv[2]).read().strip()
data = os.path.join(root, 'data')
shutil.rmtree(data, ignore_errors=True)
env = dict(os.environ, MNEMON_DATA_DIR=data, MNEMON_EMBED_ENDPOINT='http://127.0.0.1:9')  # nothing listens there


def mn(*args):
    out = subprocess.run(['mnemon', *args], env=env, capture_output=True, text=True)
    if out.returncode != 0:
        raise SystemExit(out.stderr)
    return out.stdout


for text in ['The staging gateway routes requests by model family for the Lumen project',
             'The Lumen staging gateway warms new accounts for a week before routing them',
             'Lumen gateway routing rules live in the routing service repository']:
    assert json.loads(mn('remember', text, '--cat', 'fact', '--entities', 'Lumen,gateway'))['embedded'] is False
db = os.path.join(data, 'data', 'default', 'mnemon.db')
# The identity leaves these out: written by reading a space, or derived from what it holds.
USAGE = {'access_count', 'last_accessed_at', 'effective_importance', 'embedding'}


def memories(path):
    c = sqlite3.connect(path)
    columns = sorted(row[1] for row in c.execute('pragma table_info(insights)') if row[1] not in USAGE)
    rows = {row['id']: row for row in (dict(zip(columns, values)) for values in c.execute(f'select {", ".join(columns)} from insights'))}
    vectors = c.execute('select count(*) from insights where embedding is not null').fetchone()[0]
    c.close()
    return rows, vectors


def changed(before, after):
    return sorted({column for id, row in before.items() for column, value in row.items() if after[id][column] != value})


def keep(name):
    shutil.copy(db, os.path.join(root, name))
    return memories(db)


published, published_vectors = keep('published.db')
time.sleep(1.1)
env['MNEMON_EMBED_ENDPOINT'] = 'http://127.0.0.1:' + port
embed = json.loads(mn('embed', '--all'))
embedded, embedded_vectors = keep('embedded.db')
time.sleep(1.1)
first = sorted(published)[0]
mn('gc', '--keep', first)
kept, _ = keep('kept.db')
print(json.dumps({
    'published': {'memories': len(published), 'vectors': published_vectors},
    'embed': {k: embed.get(k) for k in ('succeeded', 'failed')}, 'vectorsAfterEmbed': embedded_vectors,
    'comparedColumnsChangedByEmbed': changed(published, embedded),
    'comparedColumnsChangedByKeep': changed(embedded, kept),
}, indent=1))
