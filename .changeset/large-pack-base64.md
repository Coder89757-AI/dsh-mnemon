---
"dsh-mnemon": patch
---

Git sync and ZIP import read a Mnemon Pack of any allowed size (#368). The base64 check threw "Maximum call stack size exceeded" for a ZIP above about 3.4 MB, so such a Pack could not be synced or imported. Every machine that syncs the branch needs this version to read it.
