---
"dsh-mnemon": patch
---

Git sync no longer leaves a copy of a Project Document's previous version every time the document is edited and synced. An edit, a rename or an archive made on one machine now reaches the same document on the other, instead of arriving as a copy beside it. Each machine records what it and the branch agreed on after every merge and publish, and at which commit. A document both sides changed still keeps both versions, one as a copy, even when only its title or archive differs. A machine on an older dsh-mnemon can still add copies, so update every machine that syncs.
