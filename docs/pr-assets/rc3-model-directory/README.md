# DSH 0.2.1-rc.3 task Agent model directory

[中文](./README.zh-CN.md) · [Evidence index](../README.md)

Verified on 2026-10-26, on `600072a85863d3c16a04aea335696e60b3d5e4a4` plus this PR, with Node 22.22.0 and pnpm 10.13.1. [Machine-readable results](./verification.json).

DSH rc.3 discovers the official API-key models over the network with a default five-second budget. Mnemon previously stopped waiting at three seconds. The official Provider now gets six seconds; other Providers keep three seconds. Model choices, inference timeouts, saved settings and storage formats are unchanged.

## Checks

- Four new regressions failed against the original timeout. The focused lifecycle and host-compatibility suite passes all 114 tests: responses at 3.6 and 5 seconds, upstream errors, bounded stalls, timer cleanup and unaffected Providers.
- `pnpm run verify` passes: root 2,196 passed / 7 conditional skips; plugins 689 passed / 3 conditional skips; documentation, types, deterministic build, Headless and packed public-entry checks pass.
- All root tests against the separately installed DSH 0.2.1-rc.3 also pass: 2,196 passed / 7 conditional skips. CI now includes installed rc.3 alongside 0.2.0-rc.2; the pinned development host remains rc.2.
- The [reusable audit](../../../scripts/verify-task-model-directory.mjs) runs the published DSH LLM runtime and API-key adapter with the actual Mnemon lifecycle. Only its HTTP response is synthetic: the official `/models` endpoint returns after 3.6 seconds. Before, the first load failed at 3,003 ms although DSH finished at 3,607 ms. After, the first load succeeds at 3,604 ms. The rc.2 static catalog still succeeds immediately. No external requests or real credentials are used.
- The real rc.3 WebUI opens the task Agent selector, saves a custom model and shows it after reopening. Its loopback E2E configuration uses DSH's built-in catalog; the delayed official directory is verified by the separate adapter audit above. This does not measure live cloud availability.

Reproduce the adapter audit with a separately installed official DSH package:

```sh
node --experimental-transform-types scripts/verify-task-model-directory.mjs /path/to/dsh/package.json /tmp/catalog.json
```

![Task Agent model saved in the rc.3 WebUI](./task-model-zh.jpg)
