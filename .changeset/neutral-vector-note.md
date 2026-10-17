---
"dsh-mnemon": patch
"dsh-mnemon-source-memory-spaces": patch
---

A memory saved without a vector no longer reads as a failure on an install without an embedding service. While DSH does not manage the Mnemon Native embedding settings, as by default, the Save to memory receipt in a conversation and on the Memory Spaces page, and `/mnemon remember`, end with a neutral note: no embedding service is available, keyword search still finds the memory, and its vector can be filled in from Test status once a service is connected. While DSH manages them, a service that did not answer keeps the caution as before. What the model reads is unchanged. For plugin authors, `WriteReceipt` from `dsh-mnemon/client` takes an optional `embeddingManaged` that picks the wording, and Memory Spaces' status reports `embeddingManaged`; dsh-mnemon 0.5.31 and earlier ignore the prop and keep the caution.
