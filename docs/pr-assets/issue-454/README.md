# Issue 454: cross-Provider score admission evidence

## Reproduction and regression

The tests run the actual Hindsight and OpenViking drivers against synthetic HTTP responses, then call the actual Memory Spaces service. Hindsight returns the issue's boosted score `1.0379764538482916` with the Docker version fact; OpenViking returns four unrelated clues with scores between `0.67` and `0.71`. The reporter's thresholds (`0.67` / `0.78`) and a total result limit of four reproduce the lost-answer bug before this change.

```sh
pnpm --filter dsh-mnemon-source-memory-spaces exec vitest run tests/recall-quality.spec.ts tests/service.spec.ts tests/config.spec.ts tests/algorithm-performance.spec.ts
pnpm --filter dsh-mnemon-strategy-default-three-tier exec vitest run tests/retrieval.spec.ts
pnpm run verify
```

The fixed service admits two Hindsight and two OpenViking rows in bounded Provider rank order, preserves the exact Docker score and text, and labels all four `ranked` without inventing a normalized score. Reversing space order also retains the answer. Separate tests cover single-Provider ordering, admission beyond the unknown budget, a zero ranked budget, non-finite scores, undeclared scales, normalized scores above 1, quality diagnostics, and the Strategy's existing turn budget.

[Captured admitted results and quality counters](./admitted.json) contain only synthetic facts. All six targeted regression cases initially failed on main; the policy/service/config suite now passes 92 tests, and the Strategy retrieval suite passes 12.

## Small live model smoke

The actual service output above was passed as text to one DeepSeek Flash request with thinking disabled. The prompt asks for the Docker Engine and Compose version strings using only those synthetic recalled memories. The answer is `Docker Engine 29.8.0 and Compose v5.5.1.` Both version strings match the admitted evidence. [Response and usage](./model-answer.json): 72 input tokens, 19 output tokens, 91 total, normal stop.

Provider HTTP is fixture data; this is a live downstream model smoke, not a live Hindsight/OpenViking service or complete DSH Agent session. It does not establish calibrated relevance for arbitrary queries. No account credentials, private memories, user paths or remote service secrets are included.

Full `pnpm run verify` passed all plugin suites, 2,174 root tests (7 optional skips), TypeScript checks, deterministic builds, published Headless activation and package validation on Node 22.22.0 / pnpm 10.13.1.
