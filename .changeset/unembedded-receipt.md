---
"dsh-mnemon": patch
---

A memory Mnemon Native saved without a vector, because the embedding server did not answer, no longer reads like any other saved memory (#388). The write result of `mnemon_remember` and Save to memory now lists such memories in `unembedded`, with a hint that keyword recall finds them while semantic recall misses them until their vectors are filled, for example with `mnemon --store <memoryBodyId> embed --all`. `/mnemon remember` adds a line that says so, and the writer is asked to mention it in the summary the user reads.
