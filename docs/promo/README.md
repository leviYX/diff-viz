# 宣传素材

用于社交媒体推广 diff-viz 的现成图片与文案。改文案后可用仓库外的生成脚本重出图（Pillow 绘制）。

## 图片

| 文件 | 尺寸 | 用途 |
| --- | --- | --- |
| `01-cover.png` | 1600×900 | 封面，微博 / 朋友圈 / X 首图 |
| `01-cover-vertical.png` | 1080×1440 | 封面，小红书 / 公众号首图 |
| `02-topology.png` | 1600×1220 | 正文第 2 张：拓扑图 + 图例说明 |
| `03-diff.png` | 1600×1220 | 正文第 3 张：代码 Diff + 待办 |

发布顺序建议：封面 → `02-topology.png` → `03-diff.png`，三张连起来是「是什么 → 看出什么 → 点开是什么」。

## 通用短版

> 你改的这行，谁会被搞挂？
>
> diff-viz：把一次 git 改动摊成一张依赖拓扑图。
> · 改了哪些文件、牵连了谁，一眼看完
> · 点开就是代码 Diff + 待办清单
> · 本地跑、零依赖、一条命令
>
> JS/TS · Python · Go · Java，MIT 开源
> https://github.com/mdhUser/diff-viz

## 小红书

> 标题：AI 写完的代码，我再也不敢直接合了
>
> 不是不信 AI，是它一口气改 10 个文件，
> 我根本不知道牵动了哪个模块。
>
> 所以写了个小工具 diff-viz：
> 🟢 绿=新增　🟡 黄=修改　🔴 红=删除
> 🟣 虚线=没改、但被影响的下游文件
> 👉 点开任意节点，直接看代码 Diff 和待办
>
> 本地跑，代码不上传，零运行时依赖。
> JS/TS、Python、Go、Java 都能解析。
>
> GitHub 搜 diff-viz（作者 mdhUser），MIT 开源。
>
> #程序员 #代码review #AI编程 #开源工具 #效率工具

## X / Twitter

> Reviewing AI-written code in a terminal is guesswork.
>
> diff-viz turns a git diff into a dependency graph: what changed, what it breaks downstream, and where the TODOs are.
>
> Local · zero-dep · one command · JS/TS, Python, Go, Java · MIT
> https://github.com/mdhUser/diff-viz

## 开发者社区（即刻 / V2EX / 掘金）

> 每次让 AI 改完代码，我都要在终端里翻半天 diff，还是不知道有没有碰到别的模块。
>
> 所以写了 diff-viz：`git diff` → 依赖拓扑 → 点开看代码 Diff 和待办。一个常驻进程复用，能切仓库、翻历史提交和版本链。已支持 JS/TS、Python、Go、Java，本地运行，代码不出机器。
>
> 现在 v0.4.0，MIT。
> https://github.com/mdhUser/diff-viz

## 一句话版

> diff-viz：把 git diff 摊成依赖拓扑图——改了谁、牵连谁、还剩几个待办，一眼看完。本地、零依赖、MIT。
