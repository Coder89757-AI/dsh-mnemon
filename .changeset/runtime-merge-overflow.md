---
"dsh-mnemon": patch
---

Preserve MEMORY merge overflow in a transactional local archive so Git sync and safe imports can complete within the hot-memory budget, without treating archival as deletion. Report archived records separately from admitted memories.
