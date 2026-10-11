---
"dsh-mnemon": patch
---

Git sync reads in the order it is set up: connect a repository through a GitHub sign-in or by its address, then sync, automatic sync, backup history and the advanced choices. Sync now merges the repository and pushes in one step, Check remote shows what a sync would change before anything is written, a failure is said in the page's language with the way to fix it, and a public repository asks before it is used. Switching to another repository, or syncing after the remote branch was deleted, no longer publishes earlier payloads there; a saved token no longer follows the repository to another host; a push raced by another machine is merged and retried once; an abandoned sync lock no longer blocks every later sync; a blank commit author falls back to the channel identity on a machine without one; and the mirror initializes on Git 2.20 through 2.27 again.
