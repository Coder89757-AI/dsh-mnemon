---
"dsh-mnemon": patch
---

Idle review is named the same everywhere. The Status alert after a failed review reads **Idle review failed** instead of **Background review failed**, and the review settings on the Layered strategy's page call the Agent that reviews a task Agent, as **Task Agent model** above them does: **Scoped task Agent review** replaces **Scoped child review**, the review methods' hints name the task Agent instead of a child, and **Pause review** drops "(legacy compatible)". The documentation uses the same names. Only the wording changes; the stored settings (`idleReview.provider`, `idleReview.agentTeams: pause | scoped`) stay as they were.
