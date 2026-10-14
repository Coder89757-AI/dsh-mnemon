---
"dsh-mnemon": patch
---

A **Merge here only** that fails in **Check remote** now says why. The comparison is read again after the merge, and that used to clear the failure, so the dialog looked as if nothing had happened. The sync section also reads its state again after a failed merge, since the Host can fail after it has written.
