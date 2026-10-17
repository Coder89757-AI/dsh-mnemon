# 同步镜像中 Git 不跟踪的文件 — issue #396

[English](./README.md) | [验证记录](./verification.json)

issue #396 在 Git 同步镜像的 `state/sync/git/mnemon/payload/data/default/` 下发现了 `mnemon.db-shm` 与 `mnemon.db-wal`。此后每次同步、每次自动备份都失败，报 `the remote Mnemon payload holds an unchecksummed file: payload/data/default/mnemon.db-shm`，而分支本身是干净的。手工删除这两个文件后同步恢复正常。

基线：main `4feee034`。修复：`61f0e1ba`，以及审查后的 `d6c0651f`。运行于 2026-10-16（Asia/Shanghai）：
- macOS 15.6 arm64，Node 24.19.0，Git 2.50.1；
- 无头 Chrome，1280×800，zh-CN，浅色；
- DSH 0.2.1-alpha.3（npm `alpha`），通过 `scripts/serve-e2e.mjs` 运行；
- 同步远端是一个本机裸仓库。

## 原因

Git 同步从镜像的工作树读取分支上的载荷。读取前，它用 `git fetch` 和 `git reset --hard` 把镜像对齐到分支，而 reset 不会动 Git 不跟踪的文件。于是同步目录里多出的文件被当作载荷的一部分读入，校验清单里没有它，同步就此停下。下一次同步又遇到同一个文件，又停下。只有远端分支还不存在时才会执行 `git clean`。

## 修复

reset 之后，同步还会在镜像中自己的目录上执行 `git clean -fdxq`，路径按字面传入。这样在读取之前，这个目录里的内容与分支完全一致。镜像中其他位置的文件保持不动。issue 没能查明这两个文件由谁产生；无论来源是什么，它们都不会再让同步停下。

审查发现，清理把一个早已存在的隐性问题变成了每次都失败的同步：`git add` 遵守忽略规则（例如全局的 `*.db` 排除），所以某个记忆空间的数据库虽然列在 `checksums.json` 中，却从未被提交；清理移除被忽略的副本之后，此后每次同步都报告缺少带校验和的文件。现在同步用 `git add --all --force` 暂存它的目录，因为清理之后该目录中只有分支上的 payload 和本次同步刚写入的内容；Git 环境还会去掉会让清理悄悄失效的 pathspec 变量。

## 方法

1. 在 **插件 → 可组合记忆** 中打开 **Git 同步**，选择 **仓库地址**，填入裸仓库的路径，点 **连接**。
2. 点 **立即同步**。第一次同步发布载荷。
3. 在夹具存储根目录下的 `state/sync/git/mnemon/payload/data/default/` 中写入 `mnemon.db-shm` 与 `mnemon.db-wal`。此时镜像中的 `git status` 把该目录列为未跟踪。
4. 再点一次 **立即同步**。

基线使用同一构建，只把 `src/host/git-sync.ts` 换成 main 的版本。

## 修复前后

| main | 修复后 |
|---|---|
| ![同步失败：the remote Mnemon payload holds an unchecksummed file: payload/data/default/mnemon.db-shm](./before.jpg) | ![已是最新，仓库与本机一致。](./after.jpg) |

main 上第二次同步失败，报的正是 issue 中的错误，两个文件留在镜像里，下一次同步还会遇到。修复后显示「已是最新，仓库与本机一致。」，之后镜像中的 `git status` 为空。两次运行中，分支上都没有任何 `-shm` 或 `-wal` 文件。

## 自动化检查

`tests/git-sync.spec.ts` 新增一个基于真实裸仓库的用例：第一次推送后，在镜像的同步目录中写入 `mnemon.db-shm`、`mnemon.db-wal` 和一个多余的目录，然后预览并推送。两者都成功，多余的文件被删除，镜像干净，分支上也没有这些文件。main 上预览失败，报 `unchecksummed file: payload/data/default/mnemon.db-shm`。

`pnpm e2e:sync`（`scripts/verify-sync-git.mjs`）在修复版本上针对 DSH 0.2.1-alpha.2 通过全部 64 项检查：两个 DSH Web 实例经真实 HTTP 与真实裸仓库运行。针对 0.2.1-alpha.3 时它停在记忆整理一节，那一节需要 PR #386 带来的子 Agent 兼容，与本改动无关。

## 限制

- 如果有进程一直打开着镜像中的数据库，clean 之后它可能再次写出 `-shm`，在它关闭数据库之前同步仍会因此停下。dsh-mnemon 自己从不在镜像中打开数据库：它通过私有副本读取与合并空间。
- `git clean -x` 也会删除仓库 `.gitignore` 列出的文件，但只限于同步目录内。两次同步之间，dsh-mnemon 不在那里存放任何自己的东西。
