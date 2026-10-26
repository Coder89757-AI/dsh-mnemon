# v0.5.28 release acceptance

[中文](./README.zh-CN.md) | [Validation record](./validation.json)

Verified on 2026-10-11 (Asia/Shanghai), from merged `main` `50c75d99` plus the changes produced by `pnpm release:version`. The candidate is `dsh-mnemon@0.5.28`, pinning `dsh-mnemon-provider-retaindb@0.5.6`; the other 16 components keep their published versions.

## Official WebUI and basic memory flows

Used unmodified npm DSH **0.2.1-alpha.2**, Node **24.20.0** and Mnemon CLI **0.2.10**. `scripts/serve-e2e.mjs --save-action` links the built workspace packages into a disposable Profile. All data is synthetic. The model is the loopback fixture; Host tools, subagents, persistence and Native CLI operations are real.

1. Opened Memory System: Status shows **dsh-mnemon 0.5.28 / System nominal** and Mnemon Native **0.2.10**: [Status](./status-alpha.jpg).
2. Added a Runtime entry, reloaded the browser and read the same entry: [Runtime after reload](./runtime-alpha.jpg).
3. Created a Project Document and read its generated revision and Markdown: [Documents](./documents-alpha.jpg).
4. Sent a conversation message, opened **Save to memory**, and submitted it to the task Agent. It created the Native space and returned **Stored**: [Save receipt](./save-to-memory-alpha.jpg).
5. Opened the stored result in Memory Spaces: [Content](./content-alpha.jpg). The CLI's `recall --basic --verbose` read back the same full text. WebUI **Direct search** also returned it: [Recall](./recall-alpha.jpg).
6. Restarted the Host with the same disposable Profile. Status still shows one Runtime entry, one active Document, one active Space and one memory, with Native **Connected / Mnemon 0.2.10**: [After restart](./restart-alpha.jpg).

![Versioned candidate after a Host restart, with each memory layer retained](./restart-alpha.jpg)

## Integration and release checks

- PR #365 was merged with its original commits retained, after merging the latest main into its branch. Its complete updated CI passed.
- The integrated source passed `pnpm run verify`: 1,881 root tests, Headless activation, package checks and every component's build, typecheck and tests.
- After stamping the release versions, the same verification passed all component checks and 1,880 root tests; one performance fence took 15.90 seconds against a 15-second limit during the concurrent run. Running that file alone passed both cases in 1.17 and 1.07 seconds. Headless and package checks then passed separately. Release CI runs the complete verification again.
- `pnpm run release:check` and `pnpm run release:intent` passed. The package has 59 files and 1,909,380 unpacked bytes; public entry imports, publint and attw passed.
- `pnpm run e2e:sync` passed **64/64** on each of npm DSH **0.2.0-rc.2** and **0.2.1-alpha.2**, using two actual Web hosts and a temporary bare Git repository.

## Scope and limits

These new screenshots show linked, versioned local packages, not a registry installation. Publication separately checks the complete pinned registry composition and a real upgrade. The changed Git UI has [before/after evidence](../git-sync-experience/README.md); Desktop dragging has its [computed-region record](../desktop-window-drag/README.md).

No live model API, real GitHub sign-in, paid Provider or native Desktop window was exercised in this release acceptance. Native recall returned sparse results without a configured embedding service. The fixture disables unrelated subprocess tools; DSH alpha reports four unrelated pending entries (`ptc-runtime`, `terminal-controller`, `ui-deliverables`, `workspace-changes`), and no Mnemon activation warning. No application console error was observed; Chrome's wallet extension independently logged an `ethereum` injection error. The fixture was stopped and its disposable data removed after verification.
