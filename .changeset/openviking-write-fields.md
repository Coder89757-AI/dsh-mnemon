---
"dsh-mnemon-provider-openviking": patch
---

Memories can be stored in OpenViking before 0.4.18, such as 0.4.16 (#353): the write sends only the fields OpenViking's content API accepts, and the source, category and importance tags follow through `content/set_tags`, best effort. A memory now reads back with the category it was written with instead of its folder name, an unknown category is stored as general, and a write the server refuses says nothing was stored.
