---
"dsh-mnemon": patch
---

Memory tasks no longer leave empty conversations in DSH. Save to memory, Ask Agent, Document archive, a new Memory Space's Provider choice, Tidy names and descriptions and working-memory archiving each run under a task Agent whose session DSH keeps. dsh-mnemon now creates that session with the origin DSH gives its own subagents, so neither the DSH sidebar nor the ACP session list shows it as a conversation. Before, wherever DSH held no projection-cache record of such a session, the sidebar listed it as an empty Untitled conversation under Ungrouped, one more for every task (#435). The tasks run and report as before, on DSH 0.2.0 and 0.2.1. Rows earlier releases left stay until you archive them with Archive session; memory data is unaffected.
