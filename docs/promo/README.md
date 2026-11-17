# 宣传素材

用于社交媒体推广 diff-viz 的现成图片与文案。

> 安装状态：npm 包 `diff-viz-cli` 已就绪但**尚未发布**。文案里的安装方式写 clone 仓库，不要写 `npx`，等发布后再统一替换。

## 图片

| 文件 | 尺寸 | 用途 |
| --- | --- | --- |
| `01-cover.png` | 1600×900 | 首次发布封面（16:9） |
| `01-cover-vertical.png` | 1080×1440 | 首次发布封面（3:4，小红书） |
| `02-topology.png` | 1600×1220 | 拓扑图 + 图例说明 |
| `03-diff.png` | 1600×1220 | 代码 Diff + 待办 |
| `04-v060-cover.png` | 1600×900 | v0.6.0 更新封面（16:9） |
| `05-impact-chain.png` | 1600×900 | 影响链路示意（depth 0 → 3） |
| `06-whats-new-3x4.png` | 1080×1440 | v0.6.0 六项更新清单（3:4） |

发布顺序建议：封面 → `05-impact-chain.png` → `02-topology.png`，三张连起来是「更新了什么 → 为什么有用 → 实际长什么样」。

## v0.6.0 通用短版

> diff-viz 更到 v0.6.0 了，这次主要治「烦」：
>
> · 保存即刷新——改完不用再跑命令，图自己重算
> · 影响链路——不只说谁受影响，还能看到 A→B→C 怎么传过去的
> · 误报能忽略——标灰就完事，不用每次重新判断
> · 界面里直接加仓库，不用回终端
> · 解析加了缓存，1200 个文件从 107ms 降到 24ms
>
> 本地跑、零依赖、代码不上传。
> https://github.com/mdhUser/diff-viz

## v0.6.0 小红书

> 标题：AI 改完代码，我终于不用手动重跑了
>
> 以前每次让 AI 改完，都要重新跑一遍工具才出图。
> 现在保存就自动刷新，不到一秒拓扑图自己变。
>
> 这版 v0.6.0 更新了 6 件事：
> 1️⃣ 保存即刷新（watch + SSE）
> 2️⃣ 影响链路：A→B→C 看得见，还能点回去
> 3️⃣ 误报一键忽略，图上标灰
> 4️⃣ 界面里直接加仓库
> 5️⃣ 解析缓存，1200 文件 107ms→24ms
> 6️⃣ 缓存自动清理，状态文件收 0600
>
> 全部本地运行，代码不上传。
> GitHub 搜 diff-viz（作者 mdhUser）
>
> #程序员 #AI编程 #代码review #开源工具 #效率工具

## v0.6.0 X / Twitter

> diff-viz v0.6.0 is out.
>
> It now watches your repo: save a file, and the graph re-renders about a second later (SSE push, no re-run).
> Also: impact chains (A→B→C), one-click ignore for false positives, add repos from the UI, and a scan cache (1200 files: 107ms → 24ms).
>
> Local, zero-dep, MIT. https://github.com/mdhUser/diff-viz

## 一句话版

> diff-viz v0.6.0：改完代码图自己刷新，还能看到影响是怎么一层层传过来的。本地、零依赖、MIT。

---

## 首次发布文案（保留）

> 你改的这行，谁会被搞挂？
>
> diff-viz：把一次 git 改动摊成一张依赖拓扑图。
> · 改了哪些文件、牵连了谁，一眼看完
> · 点开就是代码 Diff + 待办清单
> · 本地跑、零依赖、一条命令
>
> JS/TS · Python · Go · Java，MIT 开源
> https://github.com/mdhUser/diff-viz
