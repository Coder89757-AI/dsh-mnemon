---
"dsh-mnemon": patch
---

Task Agents can follow the conversation that asked for the work. DSH sets its new-session default to the model last picked in any conversation, and task Agents (Save to memory, Ask Agent, tidying and archiving) use it, while review and other subagent delegations already take their conversation's route. Under **Task Agent model → Follow the main route**, the new **Prefer the conversation's model** switch (`taskAgentModel.followConversation`, off by default) gives task Agents that route too: the provider, model and reasoning effort of the conversation's last request, or the route it was created with before the first, while the conversation is open. A conversation that is not open keeps the DSH default, and the switch never takes another conversation's route. With the switch off nothing changes, and a release that does not know the switch reads the route as before.

The status page now states the model task Agents run on and where it comes from, under **Background tasks**. Its gear opens the same choice as the Layered strategy's page, so a profile on any strategy can change it, and both read the stored setting, so a change on one shows on the other at once. A model directory that cannot be read says so and offers **Read again**. A dialog leaves Escape and Tab to a menu opened above it.
