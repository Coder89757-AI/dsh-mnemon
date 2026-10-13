---
"dsh-mnemon": patch
---

GitHub sign-in works when another plugin's `fetch` patch drops the `accept: application/json` header (#369): the device code and token answers GitHub then sends form-encoded are read the same way, through the proxy fallback too. A device code answer that still cannot be used now says its HTTP status, content type and field names, without any of their values.
