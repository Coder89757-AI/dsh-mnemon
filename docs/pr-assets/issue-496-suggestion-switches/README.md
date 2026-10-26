# Independent skill suggestion controls

[中文](./README.zh-CN.md)

Verified on 2026-10-26 from `600072a85863d3c16a04aea335696e60b3d5e4a4` plus this PR's `codex/496-skill-suggestion-switches` changes, using macOS arm64, Node 22.22.0, pnpm 10.13.1 and the published DSH 0.2.1-rc.2 packages. The screenshots show the locally built plugin in a disposable real DSH WebUI profile, not a mock settings page.

The existing `skills.evolution` master switch remains unchanged. `skills.allowCreate` and `skills.allowUpdate` default to `true`, preserving existing configuration behavior. Turning both off pauses conversation reviews; existing suggestions still support explicit manual draft, backtest and adoption operations.

| Check | Result |
|---|---|
| Real WebUI settings | All four create/update combinations saved independently; the profile patch matched the visible state. |
| Host restart | After a real Host restart, create-only remained enabled and improvements remained disabled. |
| English and Chinese copy | Both labels and descriptions rendered; the captures below show opposite selections. |
| Host and Source tests | All four combinations, actual catalog classification, model attempts to return disabled suggestions and eval cases, switches changed during a review, both switches disabled before model startup, and malformed policy values passed. |
| Existing operations and read-only views | Manual draft/backtest/adopt with both switches off and page/scope read-only settings passed automated tests. |
| Complete verification | 2,203 root tests and 696 plugin tests passed; 7 root and 3 plugin opt-in tests skipped. Documentation, types, deterministic builds, Headless and package verification passed. |

```bash
env -u HTTP_PROXY pnpm run verify
env -u HTTP_PROXY MNEMON_E2E_PORT=43496 node scripts/serve-e2e.mjs --docs-demo=en
```

The UI checks used only disposable local fixture data and the fixture's loopback model. No live provider API or personal session data was used. Admission behavior is established by the automated Host/Source tests; these screenshots establish the visible controls and persisted selections, not live model suggestion quality. The fixture's unchanged global settings page also reported an unrelated `permissionPresets/catalog` 404; it did not affect the plugin controls.

![Create-only selection in Chinese, after restarting the Host](./create-only-zh.jpg)

![Improvements-only selection in English](./improvements-only-en.jpg)
