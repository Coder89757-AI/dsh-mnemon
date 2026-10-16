---
"dsh-mnemon": patch
"dsh-mnemon-source-memory-spaces": patch
---

Model tools no longer answer in ways that read as "nothing there" when something else went wrong (#390). `mnemon_view_route` and `mnemon_view_action` refuse an id the View does not offer by naming the exact id a short one stands for, or listing what the View offers, or saying it offers none this turn. `mnemon_forget` refused for a switched-off or unknown space says which, and to switch the space on first. `mnemon_recall` and `mnemon_document_search` say that neither finds the other's items, and `mnemon_related` that each neighbor names its edge type and that `edge` follows one kind. `mnemon_status` says its aggregate sums only active, healthy spaces. A Document write returns the Document written, without its body, and the layer's totals instead of every Document with its paths. The interface reference gains a table of model tools against Mnemon CLI commands.
