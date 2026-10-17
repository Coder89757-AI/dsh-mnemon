---
"dsh-mnemon": patch
"dsh-mnemon-strategy-default-three-tier": patch
---

A Recall past the Layered strategy's two queries per turn no longer answers with the previous query's evidence. It used to return the latest query's results under that query, with only a hint saying the budget was exhausted, so an answer to one question could pass for an answer to another. A new query past the budget now runs nothing and returns `notRun: true`, `budgetExhausted: true` and an empty `results` under its own query, and a second Related traversal from another insight does the same. Repeating a query that already ran still returns its own evidence. A second Documents search in a turn now also carries `budgetExhausted: true`, a parallel call waits for the reads in flight before it says the budget is spent, and a search that failed gives its place back. `/mnemon recall` and `/mnemon related` say when a query did not run instead of reporting that nothing was found, and the coordinator's recall counter leaves out reads that ran no query.
