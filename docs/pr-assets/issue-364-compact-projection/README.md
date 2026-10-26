# Compact Runtime projection — issue 364

[简体中文](./README.zh-CN.md)

A local RuntimeMemoryController was populated with the same four synthetic entries at a fixed clock on the base and this branch. [Before](./before.json): 926 UTF-8 bytes. [After](./after.json): 621 bytes, a 32.9% reduction for this fixture. The recorded entries, revision and exact stored JSON/USER.md/MEMORY.md strings are identical. This is a format measurement, not a general token-cost or live-model-quality claim.

The normal, less-than-one-day-old entries no longer need an annotation line. Critical/low importance remains explicit. The text removes revision and capacity/count diagnostics, while retaining file boundaries, all entry content and exact-match guidance. Source revision checks and management metadata remain in place.

Regression evidence: the new preservation test fails on the base; the revised controller suite passes 46 tests. Source tests continue to pin a snapshot across a day boundary and reject stale mutations. Host tests verify frozen turns and bounded truncation with the three strategy extensions. Future/invalid ages remain visible and stored content still matches independently of annotations. Complete `pnpm run verify` passes with the existing optional environment-dependent skips.

Only the compact-format portion of #364 is implemented. Content classification, deferred recall and selective tool declarations remain outside this PR.
