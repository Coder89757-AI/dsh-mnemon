---
"dsh-mnemon": patch
"dsh-mnemon-source-memory-spaces": patch
---

Internal code that nothing used is removed: unused declarations in the Host, the client and Memory Spaces' Provider registry, the old sidebar launcher and pending-change helper that only tests still called, five translations only that helper read, and a style rule for a class that no longer exists. None of them was reachable from a public package entry, so plugins built on the public SDK are unaffected, and the interface does not change.
