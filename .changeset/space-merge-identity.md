---
"dsh-mnemon": patch
---

Git sync and ZIP merge no longer copy a Memory Space each time it comes back from another machine (#370). Spaces are compared by the memories they hold, so the read counts a recall writes never count, and the memories only the other machine added are merged into this machine's space: two machines that both remember keep one space holding both. Only a memory edited or forgotten on one side keeps the other version as one copy, which its later versions move on. Comparing and merging need `node:sqlite` (Node 22.13, 23.4 or later). Copies earlier versions already made are not merged back.
