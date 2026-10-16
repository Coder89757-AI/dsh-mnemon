---
"dsh-mnemon": patch
"dsh-mnemon-source-memory-spaces": patch
---

The embedding **Test status** in Settings now counts the vectors of every Mnemon Native space instead of Mnemon's one default Store, whose full count could read as the health of every space while another one lacked vectors (#392). The total covers all of them, and a list under it names each space with its count, an inactive space included; one that cannot be read shows Mnemon's reason and stays out of the total. A space that lacks vectors is marked, and while the embedding service answers its **Fill in** creates them through the Host, with the storage root and embedding settings DSH uses, which a terminal `mnemon embed --all` may not share. A fill runs for at most a minute, in steps no longer than one Mnemon call that let other memory work take the storage lock between them, and says how many vectors it filled in, how many remain, or that the service returned none. Neither a count nor a fill opens a space whose database is missing, checked once the call holds the storage lock, since the CLI would create an empty Store for it; with no space to count, the embedding runtime is asked in a scratch directory.
