# Documentation

**English** | [简体中文](../zh-CN/README.md) | [Project home](../../README.md)

dsh-mnemon gives DeepSeek Harness three kinds of memory: **runtime memory** in every turn, **Project Documents** searched when a question needs them, and **Memory Spaces** for durable evidence on the Provider you choose. A main strategy decides how they take part in each turn; you pick it, and any enhancements, on the Plugins page. Start with the default Layered strategy; you never need to manage plugins to use it.

[![The Memory composition board on the dsh-mnemon plugin page](../assets/webui-v0.5.19/en/plugin-composition.jpg)](./guides/ui-guide.md#on-the-plugins-page)

## Use the system

| Task | Guide |
|---|---|
| Install from scratch on the web, the desktop app or the command line, through to the first memory | [Install and start](./guides/installation.md) |
| Store and use the first memories | [Getting started](./guides/getting-started.md) |
| Find your way around the conversation, the Memory System and the Plugins page | [UI guide](./guides/ui-guide.md) |
| Understand what each component and strategy does | [Capability map](./guides/capabilities.md) |
| Choose and connect a long-term backend | [Providers](./guides/memory-providers.md) |
| Back up, move storage or troubleshoot | [Operations](./guides/operations.md) |
| Upgrade an existing installation | [Compatibility and upgrades](./reference/compatibility.md) |

## Look up a contract

| Question | Reference |
|---|---|
| Which settings exist, where are they edited and saved? | [Configuration](./reference/configuration.md) |
| What is stored where, shared or archived? | [Storage model](./reference/storage-model.md) |
| When do reads, writes and maintenance run? | [Workflows](./reference/workflows.md) |
| Which tools, commands, RPC channels and UI regions are exposed? | [Interfaces](./reference/interfaces.md) |

## Build an extension

| Task | Developer guide |
|---|---|
| Understand Source, Strategy, View, ownership and the UI regions | [Architecture](./development/architecture.md) |
| Create a Source, Strategy, enhancement or Provider | [Plugin development](./development/extensions.md) |
| Adapt a skin to Mnemon backgrounds and transparency | [Skin development](./development/skin-integration.md) |
| Build, test and capture a real WebUI | [Development and verification](./development/README.md) |
| Version and release independent packages | [Release process](./development/releasing.md) |

## What is new

[v0.5.31](./releases/v0.5.31.md) supports DSH 0.2.1-rc.1 beside 0.2.0-rc.2, where memory subagents and Check versions → Update work again, lets task Agents follow the model of the conversation that asks, and stops Git sync from publishing inconsistent Documents. [v0.5.30](./releases/v0.5.30.md) saves memories into the Memory Space a write names, shows and fills in the vectors of every space, stops Git sync from adding space copies or failing on untracked files, and makes Recall and the other tools say what they did not do. [All releases](./releases/README.md) · [Roadmap](./roadmap.md) · [Historical evidence](../pr-assets/README.md)

Guides describe the current release. Screenshots and recordings come from the [v0.5.19 gallery](../assets/webui-v0.5.19/README.md), and the installation steps from the [installation gallery](../assets/install-v0.5.19/README.md); dated PR records establish only their named revisions and environments. Internal Host RPCs are not an external plugin SDK.
