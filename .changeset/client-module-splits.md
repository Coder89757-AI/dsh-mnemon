---
"dsh-mnemon": patch
"dsh-mnemon-source-memory-spaces": patch
---

Internal restructuring; nothing you see, store or send changes. The Memory System page's client code and Memory Spaces' pages are split into smaller modules, each page and section in its own file, and the workspace keeps its status, Source catalog and navigation in three hooks. The pages look and work as before, read the same data in the same order, and the published entries export the same names.
