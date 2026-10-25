---
"dsh-mnemon-source-skills": patch
---

List removed skills in a Trash tab and rename the skill action to Remove: a removal still moves the files to the Source's `trash` directory, the new tab shows each entry with where and when it was removed, restores it without overwriting, and only there can an entry be deleted for good. `trash-list`, `trash-restore` and `trash-purge` join the Source's management operations, and `overview.counts.trash` counts what waits there.

Restore skills to their recorded project and original path, ask for a destination for legacy entries, and offer renaming or explicitly confirmed replacement with the displaced skill retained in the Trash.
