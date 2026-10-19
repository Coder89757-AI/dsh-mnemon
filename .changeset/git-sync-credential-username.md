---
"dsh-mnemon": patch
---

Git sync over HTTPS uses the token you gave it, or your GitHub sign-in, on a computer whose Git configuration names a user for the host, as Git Credential Manager setups do; before, Git looked the token up under that name, found nothing, and the page asked for credentials that were already there. Hosts other than GitHub are now offered the token under the user name `oauth2`, which Gitee requires and GitLab, Gitea and Azure DevOps accept, and a repository address may name the user its host wants, such as Bitbucket's `https://x-token-auth@bitbucket.org/...`; a password or a token in the address is still refused. When the host rejects a credential it was offered, the sync settings now say the host rejected it instead of asking you to sign in or add a token.
