---
"dsh-mnemon": patch
"dsh-mnemon-source-runtime": patch
"dsh-mnemon-source-documents": patch
"dsh-mnemon-source-memory-spaces": patch
---

Backups, Git sync and the storage inventory on the Status page now take each Source's file names, locks and parsers from that Source instead of keeping their own copies, so renaming a Source's files or changing how its index or registry is read no longer leaves them behind. Nothing you see or store changes: a backup holds the same files under the same names, and the Status page reports the same counts. For plugin authors, each Source's `./contracts` entry now names its files (Runtime and Documents also their locks) and exports the rules for reading them: the Runtime USER.md/MEMORY.md projection and byte count, the Documents index parser, the Memory Spaces registry parser, and inventory counts for each. Memory Spaces adds a Node-only `./space-identity` entry whose one class compares and merges two copies of a Mnemon store by what they hold.
