---
"dsh-mnemon": patch
---

Git sync no longer fails every time a file Git does not track sits in its working copy, such as the `-wal` and `-shm` SQLite leaves beside a database something opened in place. Such a file was read as part of the branch's payload and refused as "the remote Mnemon payload holds an unchecksummed file", on every sync and every automatic backup, until someone deleted it by hand. Each sync now brings the sync directory inside the mirror back to exactly what the branch holds before reading it, and publishes every payload file whatever ignore rules the machine has: a global ignore such as `*.db` used to keep Memory Space databases off the branch while the checksums listed them, which made every other machine's sync fail. A branch an earlier version published that way still fails the check on every machine; delete the branch on the remote, or choose another directory under Advanced, and sync once to publish a complete payload.
