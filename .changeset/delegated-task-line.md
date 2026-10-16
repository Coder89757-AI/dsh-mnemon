---
"dsh-mnemon": patch
---

Every task dsh-mnemon delegates to a child Agent now starts with one line of its own, such as `[dsh-mnemon:delegated review]` for idle review. DSH records the task as the child's message from the user, so a plugin that collects a workspace's sessions, such as a work log, used to take the idle review's internal checkpoint for work the user asked for. The line is documented as a stable contract: a user message whose first line matches `^\[dsh-mnemon:delegated [a-z-]+\]$` is a task dsh-mnemon gave its own child.
