---
"dsh-mnemon": patch
---

`mnemon_remember` now writes into the Memory Space it names, or nowhere. The delegated writer used to treat the named space as a preference and could put the memory into another space whose description matched it better, switching that space back on if someone had switched it off. A guard on the writer now refuses any other space for a named write, and without a named space it refuses a space that was inactive when the run started, so only a caller that names an inactive space, or the user, switches it on; Save to memory follows the same rule. The receipt's `memoryBodyIds` now come from the Source receipts rather than the writer's own report, and `activatedMemoryBodyIds` lists a named inactive space the write switched on.
