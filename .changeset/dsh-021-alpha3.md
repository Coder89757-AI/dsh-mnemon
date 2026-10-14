---
"dsh-mnemon": patch
---

dsh-mnemon works on DSH 0.2.1-alpha.3 (npm `alpha`) as well as on 0.2.0 and 0.1.7. That DSH no longer takes a subagent's persona or tool filter at start, so every memory subagent failed: Save to memory, Memory Space writes, idle review, USER.md compaction, Document archive and Git sync's reconciliation review. Each memory subagent now gets Mnemon's instructions and only its memory tools in its own scope while DSH publishes it, before its first step; a provider whose children DSH does not create in this process is not used. With hot reload, that DSH also refuses to install over a plugin the profile has, so **Check versions → Update** stopped with `already-installed`. The update now runs DSH's own `dsh plugin add`, which holds the profile's lock and refuses a release incompatible with the running DSH before installing anything, and asks for a restart as before. Earlier DSH versions keep the paths they used.
