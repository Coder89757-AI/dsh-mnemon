---
'dsh-mnemon': patch
---

Git sync validates the Documents payload it is about to publish, so a store whose `documents/index.json` disagrees with its own document bodies can no longer be pushed to the branch and lock every later sync behind it. A Documents index entry's `contentHash` is now checked for the shape the format always writes (a `sha256` digest in hex), and `manifest.json` names the real package version instead of `0.1.0`.
