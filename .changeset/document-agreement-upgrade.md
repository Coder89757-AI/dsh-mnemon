---
"dsh-mnemon": patch
---

The first Git sync after updating from dsh-mnemon 0.5.28 no longer turns a Project Document edited since the last sync into two documents. 0.5.28 kept no record of the document versions it and the branch agreed on, so that first sync took the branch's older version for a new document and kept it beside the edited one. A machine without that record now uses the documents at the commit of its last sync, which 0.5.28 did remember, as long as the branch still descends from it. The last sync is forgotten when the branch or directory changes, as it already was for another repository, so the "last synced" line starts over then too.
