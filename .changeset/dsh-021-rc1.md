---
"dsh-mnemon": patch
"dsh-mnemon-source-memory-spaces": patch
---

dsh-mnemon supports DSH 0.2.1-rc.1 (npm `next`) and DSH 0.2.0-rc.2 (npm `latest`), and the 0.2.0 and 0.2.x releases after them. DSH refuses to install this release on DSH 0.1.7, 0.2.0-rc.1 and the 0.2.1 alphas; keep dsh-mnemon 0.5.30 there. The Starter states the range in `engines.dsh`, which DSH 0.2.1 reads on its own, and in its DSH peers, which DSH 0.2.0 reads.

- DSH 0.2.1 no longer takes a subagent's persona or tool filter at start, so every memory subagent failed there: Save to memory, Memory Space writes, idle review, USER.md compaction, Document archive and Git sync's reconciliation review. Each memory subagent now gets Mnemon's instructions and only its memory tools in its own scope while DSH publishes it, before its first step; a provider whose children DSH does not create in this process is not used.
- With hot reload, DSH 0.2.1 refuses to install over a plugin the profile has, so **Check versions → Update** stopped with `already-installed`. The update now runs DSH's own `dsh plugin add`, which holds the profile's lock and refuses a release incompatible with the running DSH before installing anything, and asks for a restart as before.
- When DSH refuses an update as incompatible, the error names the DSH the release needs on both releases: `requires DSH ^0.3.0` where DSH 0.2.1 reports its requirements, `requires @deepseek-ai/dsh ^0.3.0` where DSH 0.2.0 reports its peers.
- The Status note shown while Agent Teams pauses idle review no longer names DSH 0.1.7-rc.2: **Scoped child review** works with both supported DSH releases and their official Teams.
- dsh-mnemon and Memory Spaces no longer list `@deepseek-ai/dsh-client-ui-primitives` as a peer. DSH shares it with every client bundle, and its own client plugins do not list it either.
