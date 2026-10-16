---
"dsh-mnemon": patch
---

Every task dsh-mnemon delegates to a child Agent now starts with one line of its own, such as `[dsh-mnemon:delegated review]` for idle review (#393). DSH records the task as a user message (`source.kind: "user"`) in the child's session, so a plugin that collects a workspace's sessions, such as a work log, used to take the idle review's internal checkpoint for work the user asked for. The line is documented as a stable contract, with the pattern `^\[dsh-mnemon:delegated [a-z-]+\]$` and the session header fields that go with it. The task itself, including the idle review's `Bounded completed checkpoint …` header, now starts on the second line, so a reader that matched that header at the start of the message should match the new line instead; sessions recorded before this release have no such line.
