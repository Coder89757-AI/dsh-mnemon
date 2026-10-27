---
'dsh-mnemon': minor
'dsh-mnemon-source-skills': minor
---

Let the skill draft and backtest pages pick the model that runs the work: one
global pick per page plus an optional override per suggestion, per skill, or per
backtest, stored beside the ledger and defaulting to the task Agent's own route.

The Host carries that pick through to the agent it starts, so a run no longer
silently inherits the default model's reasoning effort and fails with
`UNSUPPORTED_REASONING_EFFORT` when the picked Provider spells its levels
differently. A suggestion whose draft write died with the previous Host is put
back to pending instead of staying in `drafting` forever, and both a suggestion
and a draft can be deleted from the page.

Selectors that repeat the chosen option's Provider under its name also flip
their menu above the button when there is no room below.
