---
"dsh-mnemon": patch
"dsh-mnemon-strategy-default-three-tier": patch
---

A Strategy now declares the background work dsh-mnemon runs for the turns it composes, in its manifest's new `workflows` field: `idle-review` and `runtime-capacity`. The Layered strategy declares both, so nothing changes for it, and the Host no longer keys idle review and Runtime capacity maintenance to the Layered strategy's type id or imports that plugin's code; a third-party Strategy can opt into either. A Strategy built by spreading the Layered manifest now copies `workflows` too; `workflows: []` keeps it out of both, as before. A Host ignores workflows it does not know, an older Host ignores the field, and a Layered strategy before 0.5.10 still counts as declaring both. `threeTierActionWorkflow` stays exported and is deprecated.
