# 从记忆系统页拖动 DSH 桌面版窗口

[English](./README.md) | [验证记录](./verification.json)

在 macOS 的 DSH 桌面版上，按住页面顶部（红绿灯下方的那条带与页面标题行）就能拖动窗口。记忆系统页留出了这条空白带，却没有把它和页头设为窗口的拖动区，所以无法从页面顶部拖动窗口。DSH 桌面版 0.2.0-rc.2 上可以看到这个问题。

## DSH 如何标记拖动区

DSH 0.2.0-rc.2 与 0.2.1-alpha.2 的做法相同：

- 桌面版的 preload 在 `<html>` 上设置 `data-platform="darwin"`；
- 前端把 `[data-window-drag]` 设为 `-webkit-app-region: drag`，按钮、链接、输入框、标签页等可交互元素保持 `no-drag`，`#root` 之外的内容（例如对话框）也保持 `no-drag`；
- `[data-window-drag]` 元素移动或改变尺寸时，前端会刷新拖动区；
- 框架在主栏顶部预留 `--dsh-frame-top-clearance`（48px），DSH 自己的插件页把这段预留放进带 `data-window-drag` 的页头里。

## 改动

- 主栏位置在它预留的顶带上铺一条带 `data-window-drag` 的透明条。
- 页面占满主栏时（`titleBar`），页头也带上 `data-window-drag`。
- 布局不变。备用浮层、better-sidebar 位置与内置页面都保持原样；在 macOS 桌面版之外不起作用。

## 改动前后

DSH 0.2.0-rc.2 WebUI，无头 Chrome，1280×800，按桌面版 preload 的方式设置 `data-platform="darwin"`。蓝色区域是计算出的 `-webkit-app-region` 为 `drag` 的元素。

| | 画面 |
|---|---|
| main | ![改动前：只有 DSH 的标志行是拖动区，顶带与记忆系统页头都不是](./before-memory-system.jpg) |
| 本次改动 | ![改动后：页头上方的顶带与页头这一行都是拖动区](./after-memory-system.jpg) |
| 本次改动，侧栏收起 | ![改动后侧栏收起：顶带仍是拖动区，DSH 放在其中的侧栏与新建会话按钮仍可点击](./after-collapsed-sidebar.jpg) |
| DSH 插件页（参照） | ![DSH 插件页：顶带与标题行是同一个拖动区](./reference-plugins.jpg) |

页面各处计算出的 `-webkit-app-region`：

| 位置 | main | 本次改动 | DSH 插件页 |
|---|---|---|---|
| 页头上方的顶带（y = 20） | none | drag | drag |
| 页面标题 | none | drag | drag |
| 页头空白处 | none | drag | - |
| 返回、刷新、配置按钮与状态 | no-drag | no-drag | no-drag（页头按钮） |
| 第一个页面标签 | no-drag | no-drag | - |
| 页面正文 | none | none | - |
| 打开对话框时的顶带 | - | no-drag | - |

## 测试

- `tests/client-native-sidebar.spec.tsx`：主栏位置带有这条拖动带（已标记，并对辅助技术隐藏），并以 `titleBar` 渲染页面。
- `tests/client.spec.tsx`：有 `titleBar` 时页头带 `data-window-drag`，没有时不带。
- `pnpm verify` 与 `verify:plugins`：见 [verification.json](./verification.json)。

## 局限

- 这些检查读取的是 Electron 用来判断拖动的计算样式；这次没有在 DSH 桌面版里手动拖动窗口。
- Windows 上的标题栏顶带属于 DSH 的框架，拖动规则只对 macOS 生效，因此 Windows 上没有变化。
