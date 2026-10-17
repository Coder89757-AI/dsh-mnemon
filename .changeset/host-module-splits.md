---
"dsh-mnemon": patch
---

Internal restructuring; nothing you see, store or send changes. The Host's memory task coordinator and its model tools are split into smaller modules: the tasks' instructions and result schemas, the check of a task's result, reading back what a task returned, and the runtime memory capacity and Document archive workflows each have a module of their own, and the memory tools register one family at a time in the same order. Memory tasks read the same instructions, the model is given the same tools with the same descriptions and schemas, and the published entries export the same names.
