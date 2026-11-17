# Changelog

本项目的重要变更记录在这里。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

发布新版本前，必须为本版本补充 `Added` / `Changed` / `Fixed` 等条目，并让
`npm run release:check` 通过。

## [Unreleased]

## [0.5.0] - 2026-11-17

### Added

- 仓库面板可直接按路径添加本地仓库（`POST /api/projects`），自动解析到 Git 仓库根目录，并校验路径存在、且确实是 Git 仓库。
- 仓库面板支持移除仓库（`DELETE /api/projects?id=`），只影响列表，不删除已有 Review 数据。

### Changed

- 数据文件 `.diff-review-data.json` 首次写入时自动加入 `.git/info/exclude`，不再出现在用户的 `git status` 里，也避免完整源码被误提交。不改动用户的 `.gitignore`。

## [0.4.0] - 2026-11-16

### Added

- 版本链条（commit graph）：在仓库面板中按父子关系绘制提交 DAG。
- 分支、tag、`HEAD` 引用徽章；merge commit 的车道分叉/汇合可视化。
- 最多加载 80 个提交（`git log --all --date-order`），点击任意提交查看历史 Diff。
- 历史 Review 按提交时的 Git tree 扫描依赖，而不是用当前工作区代替。
- `GET /api/commits` 返回 `parents`、`refs` 字段。

### Changed

- 发布到 npm（包名 `diff-viz-cli`，命令仍是 `diff-viz`），支持 `npx diff-viz-cli` 直接运行。
- 安装包只保留 `bin` / `src` / `dist` 与文档，不再包含 `docs/`、`scripts/`，体积从 4.6 MB 降到约 330 kB。

## [0.3.0] - 2026-11-16

### Added

- 单 hub 常驻进程：一个端口服务多个项目、多次分析。
- CLI 变为 hub 客户端：注册 Review 后立即退出，不再为每次分析启动常驻进程。
- 仓库切换面板；从已注册仓库中选择当前工作区。
- 历史提交 Review：最近提交列表、按 commit 生成 Diff 和依赖拓扑。
- `diff-viz hub` / `diff-viz stop` 命令。
- hub 状态目录不可写时自动回退到系统临时目录；支持 `DIFF_VIZ_HOME`。
- hub 状态写回与 `annotate` 同步。

### Changed

- `serve` 改为把已有数据注册到 hub，不再单独占用端口。
- 勾选状态写回 hub 的 Review 缓存，并以 review 维度隔离 `localStorage`。

## [0.2.0] - 2026-11-16

### Added

- Java 依赖解析：普通 import、`import static`、包通配符 import。
- Java 同包类引用（无 import）识别。
- `package` + 文件名构建 FQCN 索引，适配 Maven / Gradle / 多模块目录。
- 内部类回退（`Outer.Inner` → `Outer.java`）。
- Java Diff 语法高亮。

### Fixed

- CI 缺少 `devDependencies` 导致 `tsc` 不可用的问题。

## [0.1.0] - 2026-11-16

### Added

- 零运行时依赖的 Node CLI：工作区、暂存区、最近提交、commit range、base 对比。
- JS/TS（tsconfig `baseUrl` / `paths`）、Python、Go 依赖解析与影响分析。
- React Flow + dagre 变更拓扑、状态颜色、影响/依赖方向切换。
- 详情抽屉：摘要与影响、Unified/双栏 Diff、TODO/FIXME 扫描与勾选。
- Agent 注解合并、`SKILL.md`、本地 HTTP 服务与浏览器自动打开。
- 柔和亮色主题、可拖拽左右面板、MiniMap、键盘 Review 导航。
- 已构建 `dist/`，无需安装前端依赖即可运行。

[Unreleased]: https://github.com/mdhUser/diff-viz/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/mdhUser/diff-viz/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/mdhUser/diff-viz/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/mdhUser/diff-viz/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/mdhUser/diff-viz/compare/v0.1.0...v0.2.0
