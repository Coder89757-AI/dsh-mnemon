---
"dsh-mnemon": patch
---

Git sync no longer adds a copy of a Memory Space every time its links differ only in their values on the two sides. Merging spaces, including merging an earlier sync copy back, rewrites the weight, note and time of every link in the target, while the branch still holds them as published, so the next sync could not merge the two versions and kept the branch's version as a new, active space beside this one: a duplicate that recall then read from as well. A link is now the two memories it joins and its type; the same link with other values is the same link and keeps this machine's values, and the memories and links only the other machine added still arrive.
