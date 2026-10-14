---
"dsh-mnemon-provider-openviking": patch
---

A search or browse of an OpenViking space no longer fails as a whole when the server's index lists a memory whose file is gone, as a removal behind the server's back or an interrupted write can leave it: that memory is left out, and a search says how many were. When no memory can be read at all, the error is still reported, so a server that cannot be reached never looks like an empty space.
