# Hindsight entity names read in one pass

[简体中文](./README.zh-CN.md) | [Verification record](./verification.json)

This turned up while reviewing the Memory Space Providers' parsing of what a server sends. A Hindsight server can send a memory's entities as one string, such as `Alice (person), TypeScript (language)`. The driver removed each name's note in parentheses with `/\s*\([^)]*\)\s*$/u`.

Given a name made of many `(` and no `)`, that pattern tries every `(` and scans to the end of the string from each one. The time grows with the square of the name's length. Search, browsing and the graph all read entities. While the pattern runs, the Host does nothing else.

Baseline: main `20e4ab67`. Fix: `ebfa0cb2`. The run took place on 2026-10-13 (Asia/Shanghai), on macOS 15.6 arm64 with Node 24.19.0.

## Fix

The note is now found in one pass:
1. Find the `)` at the end of the name.
2. Find the `)` before it.
3. Take the leftmost `(` between the two.

The name before that `(` is the name without its note. A name with no `)` at the end is only trimmed, as before.

## Same results

[`harness/note-equivalence.mjs`](./harness/note-equivalence.mjs) compares the old pattern with the new pass. It runs both on every string of up to ten characters made from `(`, `)`, a space, a tab and a letter, which is 12,207,031 strings. No string gives a different result.

## Time

The harness also times both on a name of `x` followed by many `(`:

| `(` in the name | Old pattern | New pass |
|---:|---:|---:|
| 10,000 | 40 ms | under 0.01 ms |
| 20,000 | 194 ms | under 0.01 ms |
| 40,000 | 706 ms | under 0.01 ms |
| 80,000 | 2,617 ms | under 0.01 ms |

Each doubling of the name takes the old pattern about four times as long. An earlier run, while the machine was busy with other work, took 4.5 s at 80,000.

## Automated checks

`plugins/dsh-mnemon-provider-hindsight/tests/driver.spec.ts` has a new test, "reads entity names without their notes, and a name of many "(" at once". It reads ordinary names with and without notes. It also reads a name of 120,000 `(` within the test's time limit, which main does not.

## Limits

- No Hindsight server was run. The entity string comes from the server, so the timing above is the time one hostile or broken entity name holds the Host.
- A note that itself holds a `)`, such as the one in `Name (a) b)`, was never removed by the old pattern. The new pass leaves it the same way.
