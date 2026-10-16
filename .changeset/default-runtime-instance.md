---
"dsh-mnemon": patch
---

`mnemon_runtime_memory` works again when a profile mounts a second runtime Source beside the Starter's, such as a shared track next to the project one. Every call used to fail with "Runtime Action is ambiguous"; the tool now writes to the Starter instance, which the View already binds it to, and the other instance keeps taking writes through its exact offer with `mnemon_view_action`. When several runtime Sources are mounted and none is the Starter's, the error lists the exact offers to use.
