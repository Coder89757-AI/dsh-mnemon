#!/bin/bash
# embed-all-timeout.sh <work dir> <port file>: does a `mnemon embed --all` stopped midway keep the vectors it wrote?
# Ten memories are remembered while no embedding service answers; then embed --all runs against
# `fake-ollama.py <port file> slow 0.3` (0.3 s per vector) and is killed after 1.5 s, as a timeout would stop it.
set -u
D=$1/data
rm -rf "$D"
export MNEMON_DATA_DIR=$D
for i in 1 2 3 4 5 6 7 8 9 10; do MNEMON_EMBED_ENDPOINT=http://127.0.0.1:9 mnemon remember "Kill test memory number $i" --cat fact > /dev/null; done
export MNEMON_EMBED_ENDPOINT=http://127.0.0.1:$(cat "$2")
mnemon embed --all > "$1/embed.out" 2>&1 &
PID=$!
sleep 1.5
kill $PID
wait $PID 2>/dev/null
echo "killed after 1.5 s"
mnemon embed --status | grep -E '"embedded"|"total_insights"|coverage'
