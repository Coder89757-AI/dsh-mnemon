---
"dsh-mnemon": patch
"dsh-mnemon-strategy-default-three-tier": patch
---

A Recall past the Layered strategy's two queries per turn no longer answers with the previous query's evidence. It used to return the latest query's results under that query, with only a hint saying the budget was exhausted, so an answer to one question could pass for an answer to another. A new query past the budget now runs nothing and returns `notRun: true`, `budgetExhausted: true` and an empty `results` under its own query, and a second Related traversal from another insight does the same. Repeating a query that already ran still returns its own evidence. A second Documents search in a turn now also carries `budgetExhausted: true`, and a call that ran no query no longer counts as a recall in the Host's counters.
