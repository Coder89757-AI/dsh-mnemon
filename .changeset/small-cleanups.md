---
"dsh-mnemon": patch
"dsh-mnemon-source-memory-spaces": patch
---

Internal cleanups; nothing you see or store changes. The Starter names the components it ships in one place, reads its main Strategy through one accessor, and takes the space id rule and the runtime file names from the Sources instead of keeping copies. The retired `conversationInteraction.toolviews` preference, which has switched nothing since 0.1.3, leaves the resolved configuration; profiles that still hold it load as before. For plugin authors, the Memory Spaces `./contracts` entry now exports the Mnemon Native Provider's id, `NATIVE_PROVIDER_ID`, with `isNativeProvider()`, and the limits on a space's name and routing description, `MEMORY_SPACE_NAME_MAX_LENGTH` and `MEMORY_SPACE_DESCRIPTION_MAX_LENGTH`. The development guide gains a compatibility register that lists each piece of compatibility code and the condition that lets it go.
