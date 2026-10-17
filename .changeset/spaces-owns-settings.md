---
"dsh-mnemon": patch
"dsh-mnemon-source-memory-spaces": patch
---

Memory Spaces now brings its own settings to its page under Plugins, the Providers and the embedding Mnemon Native reads, along with their copy and the copy only its pages use, so it can change them without a dsh-mnemon release. Nothing you see or do changes: the settings, Memory Spaces' dialogs and its source lists look and work as before, in every language DSH offers, and one field component now draws every Provider field, each place as it did. dsh-mnemon keeps Memory Spaces' settings as a fallback that draws the page whenever Memory Spaces' own client registers none: while it is off or its client loads, if that client fails, and beside Memory Spaces 0.5.21 and earlier. Memory Spaces registers its own only with a dsh-mnemon that yields them, and turning it on swaps one for the other without the page changing, so one copy shows whichever versions a profile runs. For plugin authors, `dsh-mnemon/client` adds `MNEMON_COMPONENT_FALLBACK_PRIORITY`, the `host` Memory Spaces' settings receive, and the controls and class map those settings are drawn with.
