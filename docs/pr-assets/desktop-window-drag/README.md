# Dragging the DSH Desktop window by the Memory System page

[简体中文](./README.zh-CN.md) | [Verification record](./verification.json)

On DSH Desktop for macOS a window moves when it is dragged by the top of a page: the band under the traffic lights and the page's title row. The Memory System page kept that band empty but did not make it, or its header, part of the window's drag area, so the window could not be moved from the top of the page. DSH Desktop 0.2.0-rc.2 shows it.

## How DSH marks a drag area

DSH 0.2.0-rc.2 and 0.2.1-alpha.2 work the same way:

- the desktop preload sets `<html data-platform="darwin">`;
- the frontend turns `[data-window-drag]` into `-webkit-app-region: drag`, keeps buttons, links, fields, tabs and other interactive elements as `no-drag`, and keeps everything outside `#root`, such as a dialog, as `no-drag`;
- it refreshes the regions when a `[data-window-drag]` element moves or resizes;
- the frame reserves `--dsh-frame-top-clearance` (48px) at the top of the main column, and DSH's own Plugins page puts that clearance into its header, which carries `data-window-drag`.

## The change

- The main column seat lays a band marked `data-window-drag` over the clearance it keeps.
- The page header carries `data-window-drag` where the page fills the main column (`titleBar`).
- The layout does not move. The fallback panel, the better-sidebar seat and the builtin surface are unchanged, and nothing applies outside DSH Desktop for macOS.

## Before and after

DSH 0.2.0-rc.2 WebUI in headless Chrome at 1280×800, with `data-platform="darwin"` set as the desktop preload sets it. The blue areas are the elements whose computed `-webkit-app-region` is `drag`.

| | Screen |
|---|---|
| main | ![Before: only DSH's logo row is a drag area; the band and the Memory System header are not](./before-memory-system.jpg) |
| This change | ![After: the band above the header and the header row are drag areas](./after-memory-system.jpg) |
| This change, sidebar collapsed | ![After, sidebar collapsed: the band stays a drag area and DSH's sidebar and new-session buttons in it stay clickable](./after-collapsed-sidebar.jpg) |
| DSH's Plugins page, for reference | ![DSH's Plugins page: the band and the title row form one drag area](./reference-plugins.jpg) |

Computed `-webkit-app-region` at points of the page:

| Point | main | This change | DSH Plugins page |
|---|---|---|---|
| Band above the header (y = 20) | none | drag | drag |
| Page title | none | drag | drag |
| Header, empty space | none | drag | - |
| Back, refresh and settings buttons, status | no-drag | no-drag | no-drag (header button) |
| First page tab | no-drag | no-drag | - |
| Page body | none | none | - |
| Band while a dialog is open | - | no-drag | - |

## Tests

- `tests/client-native-sidebar.spec.tsx`: the main column seat holds the band, marked and hidden from assistive technology, and gives the page `titleBar`.
- `tests/client.spec.tsx`: the header carries `data-window-drag` with `titleBar` and not without it.
- `pnpm verify` and `verify:plugins`: see [verification.json](./verification.json).

## Limits

- The checks read the computed style that Electron hit-tests. A window was not dragged by hand in DSH Desktop during these runs.
- On Windows the title bar band belongs to DSH's frame and the drag rule applies to macOS only, so nothing changes there.
