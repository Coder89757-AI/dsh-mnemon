---
"dsh-mnemon": patch
---

Order a copy of the open suggestions before sorting them during a skill review. Management reads return deeply frozen values, so sorting the result in place threw `Cannot assign to read only property '0' of object '[object Array]'` whenever two or more suggestions were open, and the review failed before reaching the model.
