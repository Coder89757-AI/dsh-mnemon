---
"dsh-mnemon": patch
"dsh-mnemon-source-memory-spaces": patch
---

A memory Mnemon Native saved without a vector, because embedding did not succeed, no longer reads like any other saved memory (#388). A write through the task Agent, `mnemon_remember` or Save to memory, lists such memories in `unembedded`, with a hint that keyword recall finds them while semantic recall misses them until their vectors are filled in from Test status in the Mnemon Native embedding settings, which runs through the storage root and embedding settings DSH uses. `/mnemon remember` adds a line that says so, and so does the receipt of Save to memory, in a conversation or on the Memory Spaces page, whether the task Agent wrote the memory or the text went straight to a space; the line appears only when the write put a memory somewhere.
