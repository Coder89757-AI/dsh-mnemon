---
"dsh-mnemon": patch
"dsh-mnemon-source-memory-spaces": patch
---

Namespaces a third-party Provider gains after its settings were saved, such as a new Hindsight bank or Honcho workspace, now reach Memory Spaces without saving the settings again (#373). The Host asks every enabled Provider once, a little after it starts serving a data directory, and **Rediscover** on the Memory Spaces page asks on demand. Only new namespaces are added, and they start inactive, so recall reads them only once you switch them on. Mounted spaces keep their settings, a space made by hand for the same namespace is not mounted twice, a namespace you disconnected stays disconnected, and the page says which Provider could not finish.
