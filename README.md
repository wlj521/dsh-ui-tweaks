# dsh-ui-tweaks

[English](https://github.com/wlj521/dsh-ui-tweaks/blob/main/README.en.md) | **中文**

> **依赖版本**：当前依赖 **DSH v0.2.0-rc.2**。

[DeepSeek Harness](https://deepseek-harness.github.io/deepseek-harness/)（DSH）插件：在设置面板里实时调整对话界面——**主题皮肤**（默认 / 柔光 · 8 色可选）、**GitBar**（会话头部的分支胶囊 + 右侧边栏里的代码差异标签页）、**缓存命中率两位小数**，以及四个可开关的独立模块：**归档管理**、**MCP 管理**、**网络搜索**、**任务提醒**，外加 **`/init` 斜杠命令**。

所有改动**即时生效**，无需刷新页面。

> 代码字号不在这里——DSH 自带的「外观」设置已经提供了（`ui-theme` 的 `codeFontSize`，10–16px）。本插件从 v0.22 起不再重复该功能，也不再向 `body` 写入任何代码字体 token，两个设置不会互相打架。

## 功能

### 外观与布局

- **主题**：两个选项，随时可切回。
  - `默认` —— 完全保留 DSH 原生外观，不注入任何样式。
  - **柔光** —— 一种静态皮肤：中性浅/深双色主题 + 从顶部、底部向中间辐射的柔和光晕，**无动画**，运行时几乎零开销；发光色可在 **薄荷青 / 电光蓝 / 紫罗兰 / 天空青 / 琥珀 / 珊瑚橙 / 玫瑰 / 月光银** 八色间切换（默认薄荷青）。行内代码、代码块、表格表头、链接与列表标记都走该强调色。
  - 皮肤只作用于主界面与插件自己的设置页，宿主设置弹窗保持 DSH 原生配色；切换遵循系统「减少动效」。
- **缓存命中率两位小数**（默认关闭）：DSH 原生统计条只显示整数百分比（「缓存命中 96%」）。开启后改写为两位小数（「缓存命中 96.35%」），且**直接用原始 token 数计算**——缓存读取 ÷ 计费输入（未缓存输入 + 缓存读取 + 缓存写入），与原生数字同源、但不再取整。完全命中显示 100.00%；无计费输入时该组本就不显示。关闭即恢复原样。

### 交互与工具

- **GitBar**（默认关闭）：git 仓库会话的标配两件套——会话头部的**分支胶囊**，加上右侧边栏（文件旁）的**代码差异**标签页。有未提交改动时，分支胶囊与代码差异页签上都带小黄点。
  - **分支胶囊**：位于会话标题旁，显示当前分支名。点击**向下**弹出分支面板——本地 / 远程分支列表（点击即 `git switch`），底部可**新建分支**（`git switch -c` 并自动切换），支持分支重命名与删除。**头部当前分支右侧是拉取按钮**（`git pull --ff-only`：只快进，分叉时中止并显示 git 自己的报错而不悄悄合并；无 upstream 的分支不显示该按钮）。
  - **提交图谱**：面板里的「图谱」打开对话框——最近 150 条提交（`git log --date-order --all`）按拓扑自动分 lane，渲染成彩色 SVG 分叉图：圆点是提交、曲线是 fork/merge，各分支线独立着色，合并弧线汇入目标分支并采用其颜色；行悬停高亮，右上角可刷新。旁边的 **Tag** 管理支持新建 / 推送 / 删除（删除需二次确认）。
  - **代码差异**：文件列表 + 逐文件 diff（默认**只显示有差异的 hunk**，右上可切「完整文件」视图）。文件列表 / diff 内容 / 提交区三段之间的分隔线**可上下拖动调整高度**（双击复位；提交说明框随提交区高度拉伸，可写多行，Shift+Enter 换行）。**提交区保留在视图底部**：逐文件勾选决定本次提交范围（未勾选的排除在外），可打 Tag，提交 / 提交并推送（提交说明必须自行填写）。非 git 仓库时该页显示提示而不隐藏。
  - 在外部应用中打开项目走 DSH 自带的「在本地打开」按钮；所有 git 操作走服务端 `execFile('git', …)`——无 shell、cwd 固定、带超时、支持中止。
- **归档管理**（默认关闭）：设置面板中的「归档管理」页面，列出所有已归档会话（标题 / 所在工作区 / 相对时间），支持**恢复**与**彻底删除**：
  - **恢复**：把会话移出归档——日志与工作区槽位原样保留，会话回到侧边栏列表。
  - **删除**：**彻底删除**该会话——服务端将其 JSONL 日志从磁盘移除、从工作区记账与归档集合中清除、并清理投影缓存，会话永久消失（不可恢复）。只有**正在运行**（有任务在跑）的会话会被拒绝；已打开但空闲的会话也会从内存中移除，删除后实时从列表消失。
  - 侧边栏会话行「…」菜单里也有同一操作的**删除会话**入口（点两次确认，第一次点后 3 秒内不再点则自动撤销；运行中的会话会在菜单里就地提示原因）。两个入口共用同一个开关，同开同关。
  - 顶部另有**全部恢复 / 全部删除**批量操作（删除类需二次确认）。列表随 `host/archived-sessions-changed` 事件与客户端会话列表刷新实时更新。
- **MCP 管理**（默认关闭）：设置面板中的「MCP 管理」页面，展示 profile 里配置的所有 MCP 服务器（`@deepseek-ai/dsh-mcp-client` 实例）及其状态（运行中 / 错误 / 加载中 / 未运行 / 已停用）、传输方式、命令与工具数量，并支持完整管理：
  - **添加 / 编辑**：编辑器支持**表单**（实例 ID / 名称 / 类型 stdio 或 HTTP / 超时时间 ms / 命令 / 参数 / 环境变量 / URL / 请求头）或直接**粘贴 YAML** 两种方式，保存前做格式校验（名称与 ID 字符集、超时正整数、URL 协议、命令非空、未知 YAML 字段等）；环境变量与请求头使用可滚动的键值对编辑器，变量再多也不会挤成难读的长文本。
  - **启用 / 停用 / 删除 / 重启**：改动直接写入 profile 的 `cordis.patch.yml`（保留注释与结构，原子写），DSH 内置补丁监视器热重载加载器——被改动的那个服务器**实时**启动/停止/重启，不影响其它服务器；重启单独运行时生效、不改配置。
  - 新增后请确认服务器能成功连接（状态为「运行中」并注册了工具）；启动失败的实例显示「错误」并可重启重试。
- **网络搜索**（默认关闭）：开启后用本插件的多引擎 provider 接管 DSH 内置的 `web_search` 工具，并新增「网络搜索」设置页：
  - **引擎**：Bing / DuckDuckGo（免费，无需 key）、Exa / Tavily / Keenable（无 key 时走匿名免费额度）、Perplexity / DeepSeek（必须配 key）。任一引擎失败（限流、key 失效、网络）都会**自动回退到下一个**，搜索不会因为单个引擎硬失败。Bing 另可指定市场代码（如 `zh-CN` / `en-US`）。
  - **API key**：按平台填写，保存在凭据中心 `~/.dsh/.credentials.yaml`（`EXA_API_KEY` / `TAVILY_API_KEY` / `KEENABLE_API_KEY` / `PERPLEXITY_API_KEY` / `DEEPSEEK_API_KEY`），**不写进设置文档**；解析优先级为凭据中心 → 环境变量。密钥可显示 / 复制 / 清除，页面还有「测试引擎」按钮做实时连通性检查。
  - 开关会同步到 profile 的 `cordis.patch.yml`（`web` 条目的 `searchProvider`），关掉即恢复官方搜索后端。
- **`/init` 斜杠命令**（默认关闭）：在输入框键入 `/init`（斜杠菜单中可见「分析当前项目并生成 AGENTS.md」），回车或点击后弹出语言选择——**中文提示词 / 英文提示词**，选中即向当前会话提交一段完整的 AGENTS.md 引导提示词：代理会自行探索项目（README、清单文件、构建脚本、关键目录），然后在仓库根目录**生成或改进**一份面向未来 AI 编码代理的 `AGENTS.md`（项目简介、常用命令、代码风格约定、目录导览、注意事项；已存在时原地改进不丢内容）。纯客户端实现。

### 任务提醒

挂着任务切去干别的时，让浏览器把你喊回来（默认关闭）。监听**所有会话**（含后台），两类事件：

- **完成提醒**：`running` 落下，或宿主 `completed` 绿点升沿；并经 `turn/end` 事件的宿主投影区分**完成 / 被中断 / 请求失败**三种结局，失败通知附截断的错误摘要。
- **交互提醒**：会话开始等待你的审批 / 计划确认 / 模型提问——与侧边栏黄点同一数据源 `pendingInteraction`。

三个独立通道：

- **标题闪烁**：`(2) 🔔 原标题` 交替闪烁未读计数，回到页面自动恢复原标题并清零。
- **系统通知**（Web Notifications API）：桌面级通知，**点击直达对应会话**；权限申请挂在设置开关的点击手势上（桌面端自动授予，不会弹授权框）；系统响铃与自有提示音互斥，绝不双重响。
- **提示音**：WebAudio 现场合成的双音动机——上行 = 完成、下行 = 需要你处理，无音频资源文件。

防打扰：首帧快照只武装不触发（刷新页面不刷屏）；只在跳变沿触发；同会话同类事件 2 秒冷却（防重连抖动）；同一完成在 30 秒内不重复播报；子代理子会话不计（父会话承载整轮）。「仅页面不可见时」默认开启——正盯着页面时不打扰。设置里有「测试」按钮，一键预览权限与三个通道的效果。

## 设置与配置

设置入口：**设置 → 界面调整**。左侧导航里另有三个独立页面——**归档管理**、**MCP 管理**、**网络搜索**——各自随对应开关实时出现 / 消失。

同一份配置也可以直接手改。DSH 0.1.7 起 `settings.yaml` 已退役，配置写在 profile 的 `cordis.patch.yml`（设置页保存时写入的就是这份文件）：

```yaml
# $DSH_HOME/profiles/<profile>/cordis.patch.yml
- id: ui-tweaks
  name: dsh-ui-tweaks
  config:
    themeStyle: particles         # 默认 default（DSH 原生外观，可随时恢复），particles 为柔光皮肤
    particleColor: mint           # 光晕色：mint/electric/violet/sky/amber/coral/rose/silver（默认 mint）
    preciseCacheHitEnabled: true  # 默认 false，缓存命中率两位小数
    searchEnabled: true           # 默认 false，接管内置 web_search 并显示「网络搜索」页
    searchEngine: exa             # 默认 bing；bing/ddg/exa/tavily/keenable/perplexity/deepseek
    bingMarket: zh-CN             # 默认 zh-CN，仅对 Bing 生效
    gitBarEnabled: true           # 默认 false，开启 GitBar
    archiveManagerEnabled: true   # 默认 false，显示「归档管理」页与会话菜单删除入口
    mcpManagerEnabled: true       # 默认 false，显示「MCP 管理」页
    initCommandEnabled: true      # 默认 false，注册 /init 斜杠命令
    notificationsEnabled: true    # 默认 false，开启任务提醒（通道与事件在设置里逐项开关）
    notifyOnlyWhenHidden: true    # 默认 true，仅页面不可见时提醒
    notifyOnComplete: true        # 默认 true，完成提醒
    notifyOnInteraction: true     # 默认 true，交互提醒
    notifyTitleFlash: true        # 默认 true，标题闪烁
    notifySystemNotification: true # 默认 true，系统通知
    notifySound: false            # 默认 false，提示音
```

## 安装

```bash
# 方式一：从 npm 安装（推荐，预构建产物，一条命令装好）
npx -y @deepseek-ai/dsh plugin --profile desktop add dsh-ui-tweaks

# 方式二：从 GitHub 仓库安装（源码，安装时由 prepare 自动构建）
npx -y @deepseek-ai/dsh plugin --profile desktop add github:wlj521/dsh-ui-tweaks
```

> **方式二需要放行构建脚本**：`lib/` 不在仓库里（构建产物），靠 `prepare` 在安装时生成；而 pnpm ≥ 10.26 出于供应链安全**默认不允许 git 依赖执行 `prepare`**。先在 profile 的 `pnpm-workspace.yaml` 里放行，否则装完没有 `lib/`，插件加载即失败：
>
> ```yaml
> allowBuilds:
>   dsh-ui-tweaks: true
> ```
>
> 不想在本机构建就用方式一（npm 包内已含预构建产物）。

`add` 后面的包说明会**原样转发给 pnpm**，因此可以指定版本——npm 包用 `@版本号`，GitHub 源码用 `#tag`：

```bash
npx -y @deepseek-ai/dsh plugin --profile desktop add dsh-ui-tweaks@0.23.0                    # 锁定 npm 版本
npx -y @deepseek-ai/dsh plugin --profile desktop add github:wlj521/dsh-ui-tweaks#v0.23.0     # 锁定 git tag
```

### 方式三：本地目录（在桌面端点选，无需命令行）

```bash
git clone https://github.com/wlj521/dsh-ui-tweaks.git
cd dsh-ui-tweaks
pnpm install          # prepare 会自动构建出 lib/
```

然后在桌面端打开 **插件 → 添加插件**，填入该目录的**绝对路径**（例如 `D:\dsh-project\dsh-ui-tweaks`）。

> **先跑 `pnpm install` 是必需的**：本地目录安装走 `link:` 软链，pnpm **不会**为它执行 `prepare`，也不会安装它自己的依赖。所以目录里必须已经存在构建产物 `lib/`（`main` 指向的文件）和 `node_modules/`（运行时依赖 `yaml`）。缺了的话安装会「成功」、命令也不报错，但启动时 DSH 会报 `ui-tweaks (dsh-ui-tweaks): failed to import`，插件不生效。
>
> 路径必须是**绝对路径**——相对路径会被拒绝（宿主的当前工作目录对浏览器里输入的人没有意义）。命令行等价做法：`npx -y @deepseek-ai/dsh plugin --profile desktop add <绝对路径>`。

安装完成后**重启一次 DSH 桌面端**（bundle 插件在进程启动时扫描）。

> 若 pnpm 报符号链接/hoist 相关错误，可在 profile 的 `pnpm-workspace.yaml` 中设置 `nodeLinker: hoisted`。

## 开发

```bash
pnpm install
pnpm build          # tsc（服务端）+ tsc（客户端）+ 打包 lib/client.js
pnpm typecheck
```

本地加载（覆盖层）或作为 bundle 安装：

```bash
npx -y @deepseek-ai/dsh plugin --profile desktop add .    # 从本目录作为 bundle 安装
# 开发覆盖层：直接编辑桌面端 profile 的 cordis.patch.yml（$DSH_HOME/profiles/desktop/cordis.patch.yml），DSH 会热重载
```

## 工作原理

- **服务端**（`src/index.ts`）：导出 `Config` 设置 schema——0.1.7 起设置表单由宿主从插件导出的 `Config` 自动派生（旧的 `settings.register()` 已移除），插件再以 `configure({ auto: false })` 抑制自动生成页、由客户端各分区接管展示；并挂载同源路由 `/_dsh/ui-tweaks/settings`——自 rc.6 起，Web 设置 RPC 只暴露固定白名单命名空间，因此自定义路由是插件拥有配置页的方式。
- **浏览器端**（`src/client/index.tsx`）：读写该路由、渲染设置页，并通过运行时 `<style>` 元素实时应用样式，覆盖稳定的 DSH 锚点（`body` 上的主题变量、`[data-slot="conversation.chat.node"]` 内的表格 / 行内代码 / 代码块）。四个页面注册进 `settings.section` 插槽（order 40 / 50 / 60 / 70）；需要开关控制的三页（归档 / MCP / 搜索）通过 `installConditionalSection` 只在对应开关打开时注册，所以导航行会随开关实时出现 / 消失。
- **Git 后端**（`src/git.ts` + `src/git-web.ts`）：通过 `ctx.get('sessions')`（可选服务）解析会话 header 的 `cwd` 作为「当前项目」，用 `child_process.execFile('git', …)`（无 shell、cwd 固定、超时 + 中止传播）执行只读/写操作；同源路由 `/_dsh/ui-tweaks/git/*` 提供 status / branches / tags / diff（hunk 或完整文件，含绝对行号）/ graph（结构化提交行，含父哈希，供前端排布分支 lane）/ commit / push / pull（仅快进）/ checkout / create / branch-rename / branch-delete / remote-delete / tag-create / tag-delete / tag-push。
- **GitBar**（`src/client/gitbar.tsx`）：分支胶囊挂在 `conversation.session.header.actions`（会话标题旁），代码差异则注册为右侧边栏原生标签页（`ctx.sidebarRightTabs` 注册类型与指南入口，`sidebar.right.pane.tab` 按类型 id 注册内容，代码差异另注册标题席位在页签上补未提交改动的小黄点，随 `gitBarEnabled` 开关按需挂载）。视图是全高 flex 列：文件列表 / diff / 提交区三段高度分配采用「只给被拖的那一段显式高度、diff 段 `flex:1` 吃掉余量」的方式，配合 45% 上限，拖动永远不会撑破视图。`conversation.input.dock` 里另有一个零渲染的预热座位，会话切换时就把 git status 预取好，胶囊一出现即读到热缓存。提交图谱的 lane 布局与 SVG 渲染拆在 `src/client/graphlayout.ts`（纯函数模块：父哈希 → 每行 lane / 边段，经典 first-parent 路由——第一父提交沿用原 lane 让线性历史始终一条线，合并与 fork 画贝塞尔弧线；`parents` 字段可选，兼容尚未重载的旧服务端）。
- **归档管理**（服务端 `src/archive.ts` + 浏览器端 `src/client/archive.tsx`）：列表数据直接来自框架标准 hook `useSessions` + `useWorkspaces`（`archivedSessionIds`），无需额外查询；操作走同源路由 `/_dsh/ui-tweaks/archive`。**恢复**把会话 id 从工作区存储域的 `archivedSessionIds` 全局单例中移除（DSH 只暴露单向 `archiveSession`，无公开的取消归档 API，故直接写活体存储域句柄并同步工作区注册表的内存缓存）。**彻底删除**依次：拒绝正在运行的会话（agent `status === 'running'` 才拒绝，空闲会话先 `cancel` + `whenIdle`）→ 用持久化后端自身的 `findLog` 定位并 `rm` 会话日志目录 → 调用公开的 `WorkspaceEntity.detachSession` 摘除工作区记账 → 从归档集合移除并同步注册表内存缓存与 header 索引 → 清理 `session_projcache` → 从内存 SessionStore 摘除该会话（触发 `host/session-removed` 实时消失）。侧边栏会话行「…」菜单里的**删除会话**（`src/client/session-menu.tsx`）注册进宿主的 `sidebar.workspaces.session.menu.item` 列表槽位（order 500，正好排在 pin / rename / fork / archive 之后；宿主没有会话删除 API，所以它复用同一条同源路由），点击两次删除、第一次点击后 3 秒未再点击自动撤销，运行中的会话被服务端拒绝时菜单保持打开并就地显示原因；它与「归档管理」页面共用 `archiveManagerEnabled` 开关。
- **设置导航图标**（`src/client/nav-icons.ts`）：宿主的设置导航是**按 section id 硬编码图标**的（账号 / 模型 / 内置插件 / Agent 预设 / 归档各有专属 artwork，其余一律回退齿轮），而 `settings.section` 的注册项只有 `id / order / label`、没有图标位，所以本插件的四个页面原本都显示同一个齿轮。该模块用 MutationObserver 扫描设置对话框里的导航行，按**行的标签文字**（即本插件自己注册的 i18n 文案）认领自己的行，给命中的行打上 `data-dut-nav-icon`，再由注入的 CSS 隐藏宿主齿轮、用 mask 画出对应图标（界面调整 = 滑杆、归档管理 = 归档箱、MCP 管理 = 插头、网络搜索 = 地球；滑杆 / 归档箱 / 地球的路径直接取自 `ui-primitives` 自己的 artwork）。按标签匹配让补丁自愈：语言切换或宿主重绘后会重新认领，宿主不渲染这些行时标记自动摘掉，任何不属于本插件的行原样不动。
- **MCP 管理**（服务端 `src/mcp.ts` + 浏览器端 `src/client/mcp.tsx`）：同源路由 `/_dsh/ui-tweaks/mcp`。**列表**枚举 `ctx.loader.entries()` 中 `@deepseek-ai/dsh-mcp-client` 实例（id / config / fiber 状态：active=2、failed=3 等）并按 `mcp__<serverName>__` 前缀从工具注册表统计工具。**重启**调用 `entry.fiber.restart()`（仅运行时）。**添加 / 编辑 / 删除 / 启用停用**通过 `yaml`（eemeli）的 Document API 直接编辑 profile 的 `cordis.patch.yml`（保留注释与未知补丁结构，原子写 tmp+rename），随后由 DSH 内置的 `watchUserPatches` 热重载监视器重新应用补丁——`cordis-plugin-include` 对根组做**增量** `root.update`，因此只有被改动的 MCP 实例会重启，其它不受影响；环境变量值返回给同源浏览器（本机配置编辑需要），YAML 模式在服务端用 `yaml.parse` + 白名单校验。
- **网络搜索**（服务端 `src/search.ts` + `src/search-web.ts` + 浏览器端 `src/client/search.tsx`）：`createSearchProvider` 注册进 `ctx.web` 的搜索接缝，引擎从 `ui-tweaks.searchEngine` 实时读取，失败按 `ENGINE_ORDER` 逐个回退；API key 只经凭据中心解析（`~/.dsh/.credentials.yaml` → 环境变量），从不进设置文档。同源路由 `/_dsh/ui-tweaks/search` 负责密钥读写、引擎连通性测试，以及把开关同步到 profile 补丁里 `web` 条目的 `searchProvider`（写入前先比对目标状态，避免启动自检触发重载循环）。
- **任务提醒**（`src/client/notifier.ts`）：纯逻辑模块（无 React），在 `ctx.effect` 中直订 `ctx.sessions.list` 快照流，对全部非空、非子代理会话做前后对比：`running` true→false 且无挂起交互 → 完成事件；`pendingInteraction`（'approval' / 'plan-review' / 'question'，即侧边栏黄点分类）出现 → 交互事件；后台会话的宿主 `completed` 绿点升沿同样计为完成。结束原因来自服务端 [`dshTurnOutcome` 投影](src/turn-outcome.ts)（last-wins fold 会话日志的 `turn/end.reason`）并随列表行 `projectionValues` 下发——completed/max-tokens 按「任务完成」、aborted/interrupted 按「任务已中断」、error 按「请求失败」（附截断错误消息）播报；投影缺失或未随本次跳变更新时退回普通完成播报。三通道各自静默降级——标题闪烁用 `setInterval` 交替写 `document.title`，`focus`/`visibilitychange` 时恢复；系统通知带 `tag` 去重、`onclick` 里 `window.focus()` + `openSession(id)` 直达会话、`silent` 跟随提示音开关避免双重响铃；提示音由 WebAudio 振荡器现场合成双音包络。防打扰：首帧只武装基线、只在跳变沿触发、同会话同类 2s 冷却、同完成 30s 内不重复；「仅页面不可见时」等开关经 `readState` 每拍重读实时生效，改动无需重装监视器。
- **缓存命中率两位小数**（`src/client/cachehit.tsx`）：挂在 `conversation.composer.dock`（输入框卡片下方承载原生统计条的横条）的**空渲染座位**——组件本身不画任何东西，只通过框架第五标准 hook `useProjection('tokenUsage')` 读取会话的 token 用量投影（未缓存输入 / 缓存读取 / 缓存写入 / 输出四个不相交桶），按 `缓存读取 ÷ (未缓存输入 + 缓存读取 + 缓存写入)` 算出精确占比后 `.toFixed(2)`，再把统计条里匹配「缓存命中 N%」/ "Cache hit N%" 的文本原地改写为两位小数——新版 DSH 的用量 pill 把该数字渲染为分隔符后的裸文本节点（附带按钮 `aria-label` 与点开的用量对话框里的同值行，一并改写；按回合的用量对话框用自己的分母，不碰）——布局、截断省略与 tooltip 行为全部保留 DSH 原样。一个 MutationObserver 监听文档子树，React 重绘统计行或打开对话框时自动重打（写入幂等，改写一次后即收敛）；开关关闭或会话切换时恢复原始文本并断开监听。

## 协议

MIT
