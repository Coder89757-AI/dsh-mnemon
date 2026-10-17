"""remember-without-vector.py <probe dir>: what Mnemon Native says when it saves a memory while no embedding service answers.

Remembers one memory with the embedding endpoint pointed at a port nothing listens on, then recalls it by a keyword and reads
the embedding coverage. Prints the remember receipt's fields, the recall hit and the coverage.
"""
import json, os, shutil, subprocess, sys

root = sys.argv[1]
data = os.path.join(root, 'data')
shutil.rmtree(data, ignore_errors=True)
env = dict(os.environ, MNEMON_DATA_DIR=data, MNEMON_EMBED_ENDPOINT='http://127.0.0.1:9')  # nothing listens there


def mn(*args):
    out = subprocess.run(['mnemon', *args], env=env, capture_output=True, text=True)
    if out.returncode != 0:
        raise SystemExit(out.stderr)
    return json.loads(out.stdout)


remembered = mn('remember', 'Grafana on the staging cluster listens on port 3300; check it first for monitoring issues.', '--cat', 'fact')
recalled = mn('recall', 'Grafana staging', '--verbose')
hit = next((r for r in recalled['results'] if r['insight']['id'] == remembered.get('id')), None)
status = mn('embed', '--status')
print(json.dumps({
    'remember': {k: remembered.get(k) for k in ('action', 'embedded')},
    'recall': None if hit is None else {'found': True, 'via': hit['via'], 'signals': hit['signals']},
    'embedStatus': {k: status.get(k) for k in ('embedding_available', 'embedded', 'total_insights', 'coverage')},
}, indent=1))
