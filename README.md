# dsh-ui-tweaks

> **依赖版本**：当前依赖 **DSH v0.1.5-alpha.2**。

[DeepSeek Harness](https://deepseek-harness.github.io/deepseek-harness/)（DSH）Web UI 插件：在设置面板中实时调整对话界面——代码字号、**主题皮肤**（荧光海报风）、**时间线切换**（原生回合导航轨 / 经典网页时间线）、**GitBar**（会话头部的分支胶囊 + 右侧边栏里的终端 / 代码差异标签页），可开关的**归档管理**（设置中的「归档」页面：查看、恢复或彻底删除已归档会话），可开关的**任务提醒**（会话完成或需要交互时，通过标签页标题闪烁 / 系统通知 / 提示音把你唤回来），以及**缓存命中率两位小数**（把输入框下方统计条的缓存命中百分比改写为精确值）。

## 预览

| | |
|---|---|
| ![设置面板](assets/settings.png) | ![分支面板](assets/git.png) |
| **设置面板**：代码字号 / 荧光海报主题 / 缓存两位小数 / 网络搜索 / 时间线 / Git 状态栏等功能开关，左侧另有「归档」「MCP 管理」「搜索」页面 | **分支面板**：点击会话头部的分支胶囊向下弹出——本地 / 远程分支列表，点击即切换；头部右侧是拉取按钮（只快进），底部可新建分支，菜单里可打开**提交图谱**（彩色 SVG 分叉图）与 **Tag** 管理 |
| ![差异面板](assets/gitdiff.png) | ![终端面板](assets/terminal.png) |
| **代码差异**：右侧边栏里的代码差异标签页——文件列表（逐文件勾选，可部分提交）+ 逐文件 diff（默认只显示有差异的 hunk，右上可切“完整文件”），底部提交区可写提交说明、打 Tag，提交 / 提交并推送 | **终端**：边栏里的真 PTY 终端（xterm.js + WebSocket），完整终端交互 |
| ![归档管理](assets/archive.png) | ![MCP 管理](assets/mcp.png) |
| **归档管理**：设置中的「归档」页面，列出所有已归档会话（标题 / 工作区 / 相对时间），支持恢复与彻底删除，顶部可全部恢复 / 全部删除 | **MCP 管理**：设置中的「MCP 管理」页面，列出所有配置的 MCP 服务器及其运行状态与工具数，支持添加 / 编辑 / 启用停用 / 删除 / 重启 |

## 功能

- **代码字号（px）**：绝对值 8–32，默认 13（正文 16 时的 DSH 原生代码块字号）；作用于代码块，行内代码按比例跟随——旧版的百分比配置（`codeFontScale`）仍然兼容，一旦设置新的 px 值即以其为准。消息正文保持 DSH 原生字号。
- **主题（布局区单选，默认即原生外观）**：可选 `默认` 或 **荧光海报**——海报风双方案皮肤：浅色模式纸白底 + 黑粗线条，深色模式近黑底 + 浅色粗线条，都配荧光黄高亮 + Anthropic 红点缀（按钮、链接、选中态跟随主题变量自动变色，代码块与输入框卡片带硬阴影贴纸效果），输入框模型旁的**推理等级**按强度着色（绿 / 琥珀 / 蓝 / 紫，悬停选项行时同色底从左扫过），切换即时生效。后续皮肤会以同样方式追加为新选项。
- **时间线（功能区内单选）**：一个开关两档，选一个：
  - **原生（默认）**：DSH 自带的回合导航轨（消息右侧的小圆点条），即官方默认行为。
  - **网页（经典）**：找回 v0.11 的经典右侧导航轨——消息区右缘垂直居中，收起时是一列细线，悬停展开为 240px 面板（消息预览 + 高亮当前位），悬停单项弹出带时间戳的详情气泡，**点击跳转**到对应消息（深历史会自动连续翻页加载后落点，带落点自校验）；滚轮可在轨上直接翻阅被裁剪的条目。数据来自服务端 `dshChatTimeline` 会话投影（全量用户消息，与浏览器已加载窗口无关），少于两条用户消息的会话自动隐藏；切换到网页档时，原生回合导航轨由插件用一条主题无关的 CSS 规则（命中其 `--turn-natural-height` 内联变量）隐藏，两个不会同时出现。
- **GitBar（默认关闭，可在设置中开启）**：git 仓库会话的标配三件套——会话头部的**分支胶囊**，加上右侧边栏（文件旁）的**终端**与**代码差异**标签页（在边栏指南里点开，有未提交改动时分支胶囊和代码差异页签上都带小黄点）：
  - **分支胶囊**：位于会话标题旁；显示当前分支名（有未提交改动时在标题提示）。点击**向下**弹出分支面板——本地 / 远程分支列表（点击即 `git switch`），底部可**新建分支**（`git switch -c` 并自动切换）。**头部当前分支右侧是拉取按钮**（`git pull --ff-only`：只快进，分叉时中止并显示 git 报错而不悄悄合并；无 upstream 的分支不显示该按钮），拉的就是头部显示的那个分支。菜单里的**图谱**打开**提交图谱**对话框：最近 150 条提交（`git log --date-order --all`）按拓扑自动分 lane，渲染成彩色 SVG 分叉图——圆点是提交、曲线是 fork/merge，各分支线独立着色，合并弧线汇入目标分支并采用其颜色；行悬停高亮，右上角可刷新。
  - **终端**：边栏里的真 PTY 终端（xterm.js + WebSocket 直连会话工作目录的常驻 shell）：完整终端交互、颜色跟随主题。切走标签页只断开前端连接，shell 在服务端保活并重播 transcript，回来还是同一个会话。
  - **代码差异**：文件列表 + 逐文件 diff（默认**只显示有差异的 hunk**，右上可切“完整文件”视图）。三段（文件列表 / diff 内容 / 提交区）之间的分隔线**可上下拖动调整高度**（双击复位；提交说明框随提交区高度拉伸，可写多行，Shift+Enter 换行）。**提交区保留在视图底部**（提交 / 提交并推送，提交说明必须自行填写）。非 git 仓库时该页显示提示而不隐藏。
  - 在外部应用中打开项目走 DSH 自带的「在本地打开」按钮，本插件不再重复提供；所有 git 操作走服务端 `execFile('git', …)`（无 shell、带超时）。
- **归档管理（可开关，默认关闭）**：设置面板中的「归档」页面，列出所有已归档会话（标题 / 所在工作区 / 相对时间），支持**恢复**与**彻底删除**：
  - **恢复**：把会话移出归档——日志与工作区槽位原样保留，会话回到侧边栏列表。
  - **删除**：**彻底删除**该会话——服务端将其 JSONL 日志从磁盘移除、从工作区记账与归档集合中清除、并清理投影缓存，会话永久消失（不可恢复）。只有**正在运行**（有任务在跑）的会话会被拒绝；已打开但空闲的会话也会从内存中移除，删除后实时从列表消失。
  - 顶部另有**全部恢复 / 全部删除**批量操作（删除类操作需二次确认）。列表随 `host/archived-sessions-changed` 事件与客户端会话列表刷新实时更新，无需刷新页面。
- **MCP 管理（可开关，默认关闭）**：设置面板中的「MCP 管理」页面，展示 profile 里配置的所有 MCP 服务器（`@deepseek-ai/dsh-mcp-client` 实例）及其状态（运行中 / 错误 / 加载中 / 未运行 / 已停用）、命令、环境变量、已注册工具，并支持完整管理：
  - **添加 / 编辑**：编辑器支持**表单**（实例 ID / 名称 / 类型 stdio 或 HTTP / 超时时间 ms / 命令 / 参数 / 环境变量 / URL / 请求头）或直接**粘贴 YAML** 两种方式，保存前会做格式校验（名称与 ID 字符集、超时正整数、URL 协议、命令非空、未知 YAML 字段等）。
  - **启用 / 停用 / 删除 / 重启**：改动直接写入 profile 的 `cordis.patch.yml`（保持注释与结构），DSH 内置补丁监视器热重载加载器——被改动的那个服务器**实时**启动/停止/重启，不影响其它服务器；重启单独运行时生效、不改配置。环境变量值仅在本机浏览器可见，用于编辑。
  - 新增后请确认服务器能成功连接（状态为「运行中」并注册了工具）；启动失败的实例会显示「错误」并可重启重试。
- **`/init` 斜杠命令（可开关，默认关闭）**：在输入框键入 `/init`（斜杠菜单中可见「分析当前项目并生成 AGENTS.md」），回车或点击后弹出语言选择——**中文提示词 / 英文提示词**，选中即向当前会话提交一段完整的 AGENTS.md 引导提示词：代理会自行探索项目（README、清单文件、构建脚本、关键目录），然后在仓库根目录**生成或改进**一份面向未来 AI 编码代理的 `AGENTS.md`（项目简介、常用命令、代码风格约定、目录导览、注意事项；已存在时原地改进不丢内容）。纯客户端实现；在「界面调整」中开启后生效。
- **任务提醒（可开关，默认关闭）**：挂着任务切去干别的时，让浏览器把你喊回来。监听**所有会话**（含后台），两类事件：**完成提醒**（`running` 落下，或宿主 `completed` 绿点升沿；并经 `turn/end` 事件的宿主投影区分**完成 / 被中断 / 请求失败**三种结局，失败通知附截断的错误摘要）与**交互提醒**（会话开始等待你的审批 / 计划确认 / 模型提问——与侧边栏黄点同一数据源 `pendingInteraction`）。三个独立通道：
  - **标题闪烁**：`(2) 🔔 原标题` 交替闪烁未读计数，回到页面自动恢复原标题并清零；
  - **系统通知**（Web Notifications API）：桌面级通知，**点击直达对应会话**；权限申请挂在设置开关的点击手势上；系统响铃与自有提示音互斥，绝不双重响；
  - **提示音**：WebAudio 现场合成的双音动机——上行=完成、下行=需要你处理，无音频资源文件。
  - 「仅页面不可见时」默认开启（正盯着页面时不打扰）；首帧快照只武装不触发（刷新页面不刷屏）；只在跳变沿触发 + 同会话同类事件 2 秒冷却（防重连抖动）；子代理子会话不计（父会话承载整轮）。设置里有「测试」按钮，一键预览权限申请与通道效果。
- **缓存命中率两位小数（可开关，默认关闭）**：DSH 原生统计条里的缓存命中只显示整数百分比（如「缓存命中 96%」）。开启后改写为两位小数（如「缓存命中 96.35%」），且**直接用原始 token 数计算**——缓存读取 ÷ 计费输入（未缓存输入 + 缓存读取 + 缓存写入），与原生数字同源、但不再取整；完全命中显示 100.00%，无计费输入时该组本就不显示。开关位于设置的「布局」区，关闭即恢复原样。

所有修改**即时生效**，无需刷新。同一份配置也可以直接在设置文档里手改：

```yaml
ui-tweaks:
  timelineStyle: web            # 默认 native（DSH 自带回合导航轨），web 为经典网页时间线
  themeStyle: neon-lime           # 默认 default（DSH 原生外观），neon-lime 为荧光海报皮肤
  gitBarEnabled: true     # 默认 false（关闭），设为 true 开启 GitBar
  archiveManagerEnabled: true   # 默认 false（关闭），设为 true 开启「归档」页面
  initCommandEnabled: true      # 默认 false（关闭），设为 true 开启 /init 斜杠命令
  preciseCacheHitEnabled: true  # 默认 false（关闭），设为 true 开启缓存命中率两位小数
  notificationsEnabled: true    # 默认 false（关闭），设为 true 开启任务提醒（事件过滤与三个通道在设置里逐项开关）
```

设置入口：**设置 → 界面调整**。

## 安装

```bash
# 方式一：从 npm 安装（推荐，预构建产物，一条命令装好）
npx -y @deepseek-ai/dsh plugin --profile web add dsh-ui-tweaks

# 方式二：从 GitHub 仓库安装（源码 + 预构建产物，无需本地构建）
npx -y @deepseek-ai/dsh plugin --profile web add github:wlj521/dsh-ui-tweaks
```

`add` 后面的包说明会**原样转发给 pnpm**，因此可以指定版本——npm 包用 `@版本号`，GitHub 源码用 `#tag`：

```bash
npx -y @deepseek-ai/dsh plugin --profile web add dsh-ui-tweaks@0.12.0                    # 锁定 npm 版本
npx -y @deepseek-ai/dsh plugin --profile web add github:wlj521/dsh-ui-tweaks#v0.12.0     # 锁定 git tag
```

安装完成后**重启一次 `dsh web`**（bundle 插件在进程启动时扫描）。

> 若 pnpm 报符号链接/hoist 相关错误，可在 profile 的 `pnpm-workspace.yaml` 中设置 `nodeLinker: hoisted`。

## 开发

```bash
pnpm install
pnpm build          # tsc（服务端）+ tsc（客户端）+ 打包 lib/client.js
pnpm typecheck
```

本地加载（覆盖层）或作为 bundle 安装：

```bash
npx -y @deepseek-ai/dsh web --patch ./cordis.patch.yml   # 开发覆盖层
npx -y @deepseek-ai/dsh plugin --profile web add .        # 从本目录作为 bundle 安装
```

## 工作原理

- **服务端**（`src/index.ts`）：注册 `ui-tweaks` 设置命名空间，并挂载同源路由 `/_dsh/ui-tweaks/settings`——自 rc.6 起，Web 设置 RPC 只暴露固定白名单命名空间，因此自定义路由是插件拥有配置页的方式。
- **Git 后端**（`src/git.ts` + `src/git-web.ts`）：通过 `ctx.get('sessions')`（可选服务）解析会话 header 的 `cwd` 作为“当前项目”，用 `child_process.execFile('git', …)`（无 shell、cwd 固定、超时 + 中止传播）执行只读/写操作；同源路由 `/_dsh/ui-tweaks/git/*` 提供 status / branches / diff（hunk 或完整文件，含绝对行号）/ graph（结构化提交行，含父哈希，供前端排布分支 lane）/ commit / push / pull（仅快进）/ checkout / create / branch-delete / remote-delete。
- **浏览器端**（`src/client/index.tsx`）：读写该路由、渲染设置页，并通过运行时 `<style>` 元素实时应用样式，覆盖稳定的 DSH 锚点（`body` 上的 markdown 代码字体 token 与主题变量、`[data-slot="conversation.chat.node"]` 内的代码块 / 表头）。
- **GitBar**（`src/client/gitbar.tsx`）：分支胶囊挂在 `conversation.session.header.actions`（会话标题旁），终端与代码差异则注册为右侧边栏原生标签页（page 类型：`ctx.sidebarRightTabs` 注册类型与指南入口，`sidebar.right.pane.tab` 按类型 id 注册内容，代码差异另注册标题席位在页签上补未提交改动的小黄点，随 `gitBarEnabled` 开关按需挂载）。视图是全高 flex 列：文件列表 / diff / 提交区三段高度分配采用「只给被拖的那一段显式高度、diff 段 `flex:1` 吃掉余量」的方式，配合 45% 上限，拖动永远不会撑破视图；终端的 xterm 宿主同样 `flex:1` 吃掉页体高度，fit 插件 + ResizeObserver 自适应。提交保留在代码差异页底部的提交区。在外部应用中打开项目是 DSH 自带的 open-in-app 按钮，本插件的 `/open` 路由与 `openFolder` 后端已随之移除。提交图谱对话框的 lane 布局与 SVG 渲染拆在 `src/client/graphlayout.ts`（纯函数模块：父哈希 → 每行 lane / 边段，经典 first-parent 路由——第一父提交沿用原 lane 让线性历史始终一条线，合并与 fork 画贝塞尔弧线；`parents` 字段可选，兼容宿主里尚未重载的旧服务端）。
- **归档管理**（服务端 `src/archive.ts` + 浏览器端 `src/client/archive.tsx`）：作为 `settings.section` 插槽（设置面板中的「归档」页面）。列表数据直接来自框架标准 hook `useSessions` + `useWorkspaces`（`archivedSessionIds`），无需额外查询；操作走同源路由 `/_dsh/ui-tweaks/archive`。**恢复**把会话 id 从工作区存储域的 `archivedSessionIds` 全局单例中移除（DSH 只暴露单向 `archiveSession`，无公开的取消归档 API，故直接写活体存储域句柄并同步工作区注册表的内存缓存）。**彻底删除**依次：拒绝正在运行的会话（agent `status === 'running'` 才拒绝，空闲会话先 `cancel` + `whenIdle`）→ 用持久化后端自身的 `findLog` 定位并 `rm` 会话日志目录 → 调用公开的 `WorkspaceEntity.detachSession` 摘除工作区记账 → 从归档集合移除并同步注册表内存缓存与 header 索引 → 清理 `session_projcache` → 从内存 SessionStore 摘除该会话（触发 `host/session-removed` 实时消失）。
- **MCP 管理**（服务端 `src/mcp.ts` + 浏览器端 `src/client/mcp.tsx`）：同源路由 `/_dsh/ui-tweaks/mcp`。**列表**枚举 `ctx.loader.entries()` 中 `@deepseek-ai/dsh-mcp-client` 实例（id / config / fiber 状态：active=2、failed=3 等）并按 `mcp__<serverName>__` 前缀从工具注册表统计工具。**重启**调用 `entry.fiber.restart()`（仅运行时）。**添加 / 编辑 / 删除 / 启用停用**通过 `yaml`（eemeli）的 Document API 直接编辑 profile 的 `cordis.patch.yml`（保留注释与未知补丁结构，原子写 tmp+rename），随后由 DSH 内置的 `watchUserPatches` 热重载监视器重新应用补丁——`cordis-plugin-include` 对根组做**增量** `root.update`，因此只有被改动的 MCP 实例会重启，其它不受影响；环境变量值返回给同源浏览器（本机配置编辑需要），YAML 模式在服务端用 `yaml.parse` + 白名单校验。
- **任务提醒**（`src/client/notifier.ts`）：纯逻辑模块（无 React），在 `ctx.effect` 中直订 `ctx.sessions.list` 快照流，对全部非空、非子代理会话做前后对比：`running` true→false 且无挂起交互 → 完成事件；`pendingInteraction`（'approval' / 'plan-review' / 'question'，即侧边栏黄点分类）出现 → 交互事件；后台会话的宿主 `completed` 绿点升沿同样计为完成。结束原因来自服务端 [`dshTurnOutcome` 投影](D:/dsh-project/dsh-ui-tweaks/src/turn-outcome.ts)（last-wins fold 会话日志的 `turn/end.reason`）并随列表行 `projectionValues` 下发——completed/max-tokens 按「任务完成」、aborted/interrupted 按「任务已中断」、error 按「请求失败」（附截断错误消息）播报；投影缺失或未随本次跳变更新时退回普通完成播报。三通道各自静默降级——标题闪烁用 `setInterval` 交替写 `document.title`，`focus`/`visibilitychange` 时恢复；系统通知带 `tag` 去重、`onclick` 里 `window.focus()` + `sessionsService.open(id)` 直达会话、`silent` 跟随提示音开关避免双重响铃；提示音由 WebAudio 振荡器现场合成双音包络。防打扰：首帧只武装基线、只在跳变沿触发、同会话同类 2s 冷却；「仅页面不可见时」等开关经 `readState` 每拍重读实时生效，改动无需重装监视器。
- **缓存命中率两位小数**（`src/client/cachehit.tsx`）：挂在 `conversation.composer.dock`（输入框卡片下方承载原生统计条的横条）的**空渲染座位**——组件本身不画任何东西，只通过框架第五标准 hook `useProjection('tokenUsage')` 读取会话的 token 用量投影（未缓存输入 / 缓存读取 / 缓存写入 / 输出四个不相交桶），按 `缓存读取 ÷ (未缓存输入 + 缓存读取 + 缓存写入)` 算出精确占比后 `.toFixed(2)`，再把统计条里匹配「缓存命中 N%」/ "Cache hit N%" 的文本原地改写为两位小数——新版 DSH 的用量 pill 把该数字渲染为分隔符后的裸文本节点（附带按钮 `aria-label` 与点开的用量对话框里的同值行，一并改写；按回合的用量对话框用自己的分母，不碰）——布局、截断省略与 tooltip 行为全部保留 DSH 原样。一个 MutationObserver 监听文档子树，React 重绘统计行或打开对话框时自动重打（写入幂等，改写一次后即收敛）；开关关闭或会话切换时恢复原始文本并断开监听。注册编排与 /init 命令一致：`preciseCacheHitEnabled` 打开才挂载，关闭即卸载。

## 协议

MIT
