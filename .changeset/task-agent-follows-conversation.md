---
"dsh-mnemon": patch
---

**Task Agent model**, under **Background tasks** on the Layered strategy's page, is one choice of three. **Follow the main route** is now **Follow global** and **Choose a model** is now **Custom**; the new **Follow the conversation** lets task Agents follow the conversation that asked for the work.

- **Follow global**, the default, works as before. Task Agents use the model DSH keeps for new sessions, and DSH sets that to the model last picked in any conversation.
- **Follow the conversation** (`taskAgentModel.followConversation`) applies while that conversation is open. Task Agents (Save to memory, Ask Agent, tidying and archiving) get the route DSH already gives the conversation's own delegated work, such as review: the provider, model and reasoning effort of its last request, or its creation route before the first. Otherwise they follow global, and never take another conversation's route.
- **Custom** pins a Provider and model, as **Choose a model** did.

The choice is stored as a key of its own, so a release that does not know it reads it as Follow global.

The page reads the stored choice live and shows where the route comes from. Giving up a custom model before it was written keeps the choice, and **Read again** reads the whole model directory for a custom route. A dialog leaves Escape and Tab to a menu opened above it.
