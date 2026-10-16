---
"dsh-mnemon": patch
"dsh-mnemon-source-memory-spaces": patch
---

The embedding **Test status** in Settings now counts the vectors of every Mnemon Native space instead of Mnemon's one default Store, whose full count could read as the health of every space while another one lacked vectors (#392). The total covers all of them, and a list under it names each space with its count, a switched-off space included; a space that lacks vectors is marked with a hint on how to fill them in. A space whose database is missing is not read, since the CLI would create an empty Store for it.
