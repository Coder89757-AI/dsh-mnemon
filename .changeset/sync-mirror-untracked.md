---
"dsh-mnemon": patch
---

Git sync no longer fails every time a file Git does not track sits in its working copy, such as the `-wal` and `-shm` SQLite leaves beside a database something opened in place. Such a file was read as part of the branch's payload and refused as "the remote Mnemon payload holds an unchecksummed file", on every sync and every automatic backup, until someone deleted it by hand. Each sync now brings its directory in the mirror back to exactly what the branch holds before reading it.
