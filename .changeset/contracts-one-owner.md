---
"dsh-mnemon": patch
"dsh-mnemon-source-memory-spaces": patch
"dsh-mnemon-source-runtime": patch
---

Internal cleanups; nothing you see or store changes, and every stored setting validates as before. dsh-mnemon takes the values it shares with Memory Spaces and runtime memory from those components instead of keeping copies (memory categories and sources, edge types, the embedding defaults, the runtime memory limits and the placement capabilities a persistence strategy can require), lists the endpoints its Host serves once for both the Host and the WebUI, and checks the Git sync settings in the WebUI and on the Host with one set of rules. For plugin authors, the Memory Spaces `./contracts` entry now exports `MEMORY_PLACEMENT_CAPABILITIES`, from which `MemoryPlacementCapability` is derived, and the runtime memory `./contracts` entry exports `RUNTIME_MEMORY_LIMIT_MAX_BYTES`, the largest limit its USER.md and MEMORY.md take.
