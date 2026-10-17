#!/bin/bash
# status-scope.sh <work dir>: what `mnemon embed --status` counts, and what a --store for an unknown Store does.
# Two Stores, default with two memories and other with three, all remembered while no embedding service answers.
set -u
D=$1/data
rm -rf "$D"
export MNEMON_DATA_DIR=$D MNEMON_EMBED_ENDPOINT=http://127.0.0.1:9
mnemon remember "First memory in the default Store" --cat fact > /dev/null
mnemon remember "Second memory in the default Store" --cat fact > /dev/null
mnemon store create other > /dev/null
for i in 1 2 3; do mnemon --store other remember "Memory $i in the other Store" --cat fact > /dev/null; done
echo "embed --status:"; mnemon embed --status | grep -E '"total_insights"|"embedded"'
echo "--store other embed --status:"; mnemon --store other embed --status | grep -E '"total_insights"|"embedded"'
echo "Stores before: $(ls "$D/data" | tr '\n' ' ')"
mnemon --store nosuch embed --status > /dev/null
echo "Stores after --store nosuch: $(ls "$D/data" | tr '\n' ' ')"
