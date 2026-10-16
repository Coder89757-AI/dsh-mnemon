# A Recall past the turn budget — issue #389

[简体中文](./README.zh-CN.md) | [Verification record](./verification.json)

Issue #389 asked three different questions with `mnemon_recall` in one turn. The third returned exactly what the second had returned, the same ids and excerpts, and only a hint said `budget exhausted`. A caller that read the results and not the hint took the answer to one question for the answer to another. Item 1 of issue #390 reports the Documents side: a second `mnemon_document_search` returns `notRun: true` and an empty list, which reads like "no such document".

Baseline: main `4feee034`. Fix: `c05c1efe` and, after review, `20c0264e`, with the e2e fixture in `590aab2b`. The runs took place on 2026-10-16 (Asia/Shanghai):
- macOS 15.6 arm64, Node 24.19.0 and Mnemon CLI 0.2.10;
- headless Chrome at 1280×800, zh-CN, light;
- DSH 0.2.1-alpha.2 (npm `alpha`) through `scripts/serve-e2e.mjs`.

## Cause

The Layered strategy allows two Recall queries per Agent turn and one Related traversal. Past that, it answered a new query by replaying the latest query's admitted evidence, under that query's text, and a new Related traversal by replaying the previous one's neighbours. The replay was meant to stop retrieval without failing the call, but the result looked like an ordinary hit for the new question.

## Fix

A different read past the budget runs no query and returns nothing, under its own query: `notRun: true`, `budgetExhausted: true`, an empty `results` list, and a hint that says the empty list does not mean nothing matches. The same applies to a second Related traversal from another insight. Repeating a read that already ran in the turn still replays its own evidence, which is its true answer. A second Documents search also carries `budgetExhausted: true`, and a Related call from an insight the turn's Recall did not admit carries `notRun: true`. The Host's recall counter no longer counts a read that ran no query. The reference documentation says how the budget counts: per executing Agent turn, and one turn for a delegated child's whole task.

Review found that a parallel third Recall answered that the budget was spent while the reads holding it could still fail and give their places back, so the third read answered with nothing where main surfaced the error. A parallel Recall past the budget now waits for the reads in flight and asks again; so do a second Related traversal and a second Documents search, whose slot a failed search now gives back. `/mnemon recall` and `/mnemon related` say when a query did not run instead of reporting that nothing was found.

## Method

`pnpm e2e:serve --recall-budget` seeds the Chinese Lumen demo project, the same one the documentation gallery uses, and scripts a model that asks three different Recall questions after `recall-budget-check`: 结账页 性能 (checkout performance), ClickHouse 写入 (ClickHouse writes) and 站会 时间 (stand-up time). Only the model's decisions are scripted; DSH, the View, the Strategy, the Mnemon Native spaces and the three tool calls are real. The reply states what the third call returned. The baseline ran the same build with `src/host/subagent.ts` and the strategy's `src/retrieval.ts` from main.

## Before and after

| main | Fix |
|---|---|
| ![The third question about the stand-up returned 3 results under the query ClickHouse 写入, the first about Kafka and ClickHouse](./before.jpg) | ![The third recall did not run: the turn's two Recall queries were used (budgetExhausted), and it has no results of its own](./after.jpg) |

On main the question about the stand-up time came back with three memories about ClickHouse writes, and the result's `query` field said `ClickHouse 写入`. With the fix it came back with `notRun: true`, `budgetExhausted: true`, no results and its own query, `站会 时间`. The turn's memory bar lists only what the first two queries found:

![The turn memory bar: Memory Spaces recall ×3 with the evidence of the first two queries](./after-turn-memory.jpg)

## Automated checks

- `plugins/dsh-mnemon-strategy-default-three-tier/tests/retrieval.spec.ts`: a third different Recall query and a second Related traversal from another insight run nothing and return nothing under their own query; the same Recall query and the same traversal still replay their own evidence; a second Documents search carries `budgetExhausted`; Related from an insight the turn did not admit carries `notRun`.
- `tests/default-three-tier-host.spec.ts`: the same through the real `mnemon_recall`, `mnemon_document_search` and `mnemon_view_route` tools, and the recall counter leaves out the read that did not run.
- `tests/subagent.spec.ts`: the coordinator's refinement test now expects the exhausted query to return nothing rather than the refinement's evidence.

Eight of these tests fail on main.

## Limits

- The turn memory bar counts tool calls, so it still reads 召回 3 (Recall 3) for three calls, one of which ran nothing.
- The budget itself is unchanged: two Recall queries, one Related traversal and one Documents search per Agent turn. A delegated child does its whole task in one turn.
- The General strategy has no such envelope: a route past its own `maxCalls` fails the call, as before.
