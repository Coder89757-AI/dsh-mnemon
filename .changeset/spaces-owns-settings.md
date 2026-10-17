---
"dsh-mnemon": patch
"dsh-mnemon-source-memory-spaces": patch
---

Memory Spaces now brings its own settings to its page under Plugins, the Providers and the embedding Mnemon Native reads, along with their copy and the copy only its pages use, so it can change them without a dsh-mnemon release. Nothing you see or do changes: the settings, Memory Spaces' dialogs and its source lists look and work as before, and one field component now draws every Provider field, each place as it did. dsh-mnemon keeps Memory Spaces' settings as a fallback for Memory Spaces 0.5.21 and earlier, and Memory Spaces registers its own only with a dsh-mnemon that yields them, so one copy shows whichever versions a profile runs. For plugin authors, `dsh-mnemon/client` adds `fallback` registrations and `MNEMON_COMPONENT_FALLBACK_PRIORITY`, the `host` a served component's settings receive, and the controls and class map the shipped settings are drawn with.
