---
"dsh-mnemon": patch
"dsh-mnemon-source-memory-spaces": patch
---

The embedding **Test status** in Settings now counts the vectors of every Mnemon Native space instead of Mnemon's one default Store, whose full count could read as the health of every space while another one lacked vectors (#392). The total covers all of them, and a list under it names each space with its count, a switched-off space included. A space that lacks vectors is marked, and while the embedding service answers its **Fill in** creates them through the Host, with the storage root and embedding settings DSH uses, which a terminal `mnemon embed --all` may not share; one fill runs for at most a minute and keeps what it wrote. A space whose database is missing is neither read nor filled, since the CLI would create an empty Store for it.
