# dsh-ui-tweaks

> **版本要求**：本版本（v0.12.0）需要 **DSH v0.1.2-alpha.1 及以上**——对话时间线与对话框宽度已由 DSH 原生提供，插件因此移除了自带的重复实现。宿主暂未升级时，可指定安装旧版继续使用这两项功能：`npx -y @deepseek-ai/dsh plugin --profile web add dsh-ui-tweaks@0.11.2`。

[DeepSeek Harness](https://deepseek-harness.github.io/deepseek-harness/)（DSH）Web UI 插件：在设置面板中实时调整对话界面——字体大小、表格样式、**GitBar**（输入框工具行内的 git 状态胶囊：分支在权限旁、差异在模型前），可开关的**归档管理**（设置中的「归档」页面：查看、恢复或彻底删除已归档会话），可开关的**任务提醒**（会话完成或需要交互时，通过标签页标题闪烁 / 系统通知 / 提示音把你唤回来），以及**缓存命中率两位小数**（把输入框下方统计条的缓存命中百分比改写为精确值）。

## 预览

| | |
|---|---|
| ![Claude Desktop 表格样式](assets/table.png) | ![设置面板](assets/settings.png) |
| **表格样式**：Claude Desktop 浅灰圆角卡片风格 | **设置面板**：字体大小 / 代码字号 / 行高 / 表格样式 / Git 状态栏 / 鲸鱼指示器等功能开关 |
| ![GitBar](assets/git.png) | ![分支面板](assets/branch.png) |
| **GitBar**：输入框工具行内的 git 状态胶囊（分支在权限旁、差异在模型前），支持分支切换、删除、推送到远程，差异面板内可直接提交 | **分支面板**：点击分支胶囊向上弹出——本地 / 远程分支列表，点击即切换，支持删除、拉取、推送远程，底部可新建分支，菜单里可打开**提交图谱**（彩色 SVG 分叉图） |
| ![差异面板](assets/gitdiff.png) | ![终端面板](assets/terminal.png) |
| **差异面板**：文件列表 + 逐文件 diff（默认只显示有差异的 hunk），底部提交区可提交 / 提交并推送，宽度可拖动 | **终端面板**：真 PTY 终端（xterm.js + WebSocket），完整终端交互，宽度可拖动、一键半屏 |
| ![打开项目](assets/explorer.png) | |
| **打开项目**：会话头部的图标菜单——用资源管理器 / VS Code / IDEA / GoLand / WebStorm / PyCharm 打开当前项目；旁边的终端、差异图标一键唤出对应面板 | |
| ![归档管理](assets/archive.png) | ![MCP 管理](assets/mcp.png) |
| **归档管理**：设置中的「归档」页面，列出所有已归档会话（标题 / 工作区 / 相对时间），支持恢复与彻底删除 | **MCP 管理**：设置中的「MCP 管理」页面，列出所有配置的 MCP 服务器及其运行状态，支持添加 / 编辑 / 启用停用 / 删除 / 重启 |

## 功能

- **消息字体大小（px）**：直接输入数字（10–32），作用于消息正文、标题、表格与代码。**代码字号**可单独设置（8–32px 绝对值，默认 13；行内代码按比例跟随）——旧版的百分比配置（`codeFontScale`）仍然兼容，一旦设置新的 px 值即以其为准。
- **表格样式**：可选 `默认` 或 **Claude Desktop** 风格（浅灰圆角单元格卡片、单元格间有间隙、无边框、单元格与行内代码同底色、表头不加粗）。Claude 风格下表格默认撑满列宽；放不下的宽表保持自然宽度、在表格内横向滚动（悬停出现滚动条），不会被挤压换行或裁掉后面的列。
- **GitBar（默认关闭，可在设置中开启）**：当会话的工作目录是一个 git 仓库时，在**输入框工具行内**显示两颗与输入框原生控件（权限 / 模型选择）同款样式的紧凑胶囊——不再占用输入框上方单独一行，输入区因此更矮：
  - **分支胶囊**：位于权限（访问模式）控件之后；显示当前分支名（有未提交改动时在标题提示）。点击**向上**弹出分支面板——本地 / 远程分支列表（点击即 `git switch`），底部可**新建分支**（`git switch -c` 并自动切换）。**头部当前分支右侧是拉取按钮**（`git pull --ff-only`：只快进，分叉时中止并显示 git 报错而不悄悄合并；无 upstream 的分支不显示该按钮），拉的就是头部显示的那个分支。菜单里的**图谱**打开**提交图谱**对话框：最近 150 条提交（`git log --date-order --all`）按拓扑自动分 lane，渲染成彩色 SVG 分叉图——圆点是提交、曲线是 fork/merge，各分支线独立着色，合并弧线汇入目标分支并采用其颜色；行悬停高亮，右上角可刷新。
  - **差异胶囊**：位于模型选择之前；显示 `+N −M · K 个文件`。点击从右侧滑出**差异面板**：文件列表 + 逐文件 diff（默认**只显示有差异的 hunk**，右上可切“完整文件”视图）。面板**支持拖动拉伸宽度**，展开时**自动把对话区往左挤**；面板内三段（文件列表 / diff 内容 / 提交区）之间的分隔线**可上下拖动调整高度**（双击复位；提交说明框随提交区高度拉伸，可写多行，Shift+Enter 换行）。**提交区保留在差异面板底部**（提交 / 提交并推送，说明留空自动生成）——原来的独立 commit 胶囊已移除。
  - **挤压自适应**：输入框工具行变窄时（例如差异面板拉宽把对话列挤小），胶囊像原生控件一样自动降级——先隐藏“· K 个文件”元信息，行再窄时**收敛为纯图标**，分支名与差异文字绝不会和权限、模型选择重叠。
  - 非 git 仓库或无会话 cwd 时胶囊自动隐藏；所有操作走服务端 `execFile('git', …)`（无 shell、带超时）。
- **归档管理（可开关，默认关闭）**：设置面板中的「归档」页面，列出所有已归档会话（标题 / 所在工作区 / 相对时间），支持**恢复**与**彻底删除**：
  - **恢复**：把会话移出归档——日志与工作区槽位原样保留，会话回到侧边栏列表。
  - **删除**：**彻底删除**该会话——服务端将其 JSONL 日志从磁盘移除、从工作区记账与归档集合中清除、并清理投影缓存，会话永久消失（不可恢复）。只有**正在运行**（有任务在跑）的会话会被拒绝；已打开但空闲的会话也会从内存中移除，删除后实时从列表消失。
  - 顶部另有**全部恢复 / 全部删除**批量操作（删除类操作需二次确认）。列表随 `host/archived-sessions-changed` 事件与客户端会话列表刷新实时更新，无需刷新页面。
- **MCP 管理（可开关，默认关闭）**：设置面板中的「MCP 管理」页面，展示 profile 里配置的所有 MCP 服务器（`@deepseek-ai/dsh-mcp-client` 实例）及其状态（运行中 / 错误 / 加载中 / 未运行 / 已停用）、命令、环境变量、已注册工具，并支持完整管理：
  - **添加 / 编辑**：编辑器支持**表单**（实例 ID / 名称 / 类型 stdio 或 HTTP / 超时时间 ms / 命令 / 参数 / 环境变量 / URL / 请求头）或直接**粘贴 YAML** 两种方式，保存前会做格式校验（名称与 ID 字符集、超时正整数、URL 协议、命令非空、未知 YAML 字段等）。
  - **启用 / 停用 / 删除 / 重启**：改动直接写入 profile 的 `cordis.patch.yml`（保持注释与结构），DSH 内置补丁监视器热重载加载器——被改动的那个服务器**实时**启动/停止/重启，不影响其它服务器；重启单独运行时生效、不改配置。环境变量值仅在本机浏览器可见，用于编辑。
  - 新增后请确认服务器能成功连接（状态为「运行中」并注册了工具）；启动失败的实例会显示「错误」并可重启重试。
- **`/init` 斜杠命令（可开关，默认关闭）**：在输入框键入 `/init`（斜杠菜单中可见「分析当前项目并生成 AGENTS.md」），回车或点击后弹出语言选择——**中文提示词 / 英文提示词**，选中即向当前会话提交一段完整的 AGENTS.md 引导提示词：代理会自行探索项目（README、清单文件、构建脚本、关键目录），然后在仓库根目录**生成或改进**一份面向未来 AI 编码代理的 `AGENTS.md`（项目简介、常用命令、代码风格约定、目录导览、注意事项；已存在时原地改进不丢内容）。纯客户端实现；在「界面调整」中开启后生效。
- **鲸鱼指示器（可开关，默认关闭）**：输入框卡片**右上角**停一只品牌小鲸鱼（侧边栏同款 FishLogo，Claude Desktop 小螃蟹的同款位置），身下有**蓝色海浪**缓缓漂移。鲸鱼**常驻原色**（主题主标签色，浅色模式即黑色）：**空闲时静静浮在海浪上，悬停或点击它也会游起来（彩蛋）**；**模型工作时开始游泳动画**（原地上下浮动 + 左右轻摆），并在**蓝色与原色之间呼吸变幻**——上扬到顶点时最蓝、落回时归黑，与游泳同周期，直到干完活。模型工作状态取自当前会话的 `running` 标志，并叠加输入机的 claimed/submitting 阶段，覆盖「按下回车到代理真正开跑」的间隙。鲸鱼几何为内置的 FishLogo 路径（与 DSH 主程序逐字节一致），挂载时仍会尝试从侧边栏实时徽标抓取最新版以跟随官方换标；动画纯 CSS、颜色走 DSH 主题变量（深浅色模式均正常），`prefers-reduced-motion` 时降级为静止。
- **任务提醒（可开关，默认关闭）**：挂着任务切去干别的时，让浏览器把你喊回来。监听**所有会话**（含后台），两类事件：**完成提醒**（`running` 落下，或宿主 `completed` 绿点升沿；并经 `turn/end` 事件的宿主投影区分**完成 / 被中断 / 请求失败**三种结局，失败通知附截断的错误摘要）与**交互提醒**（会话开始等待你的审批 / 计划确认 / 模型提问——与侧边栏黄点同一数据源 `pendingInteraction`）。三个独立通道：
  - **标题闪烁**：`(2) 🔔 原标题` 交替闪烁未读计数，回到页面自动恢复原标题并清零；
  - **系统通知**（Web Notifications API）：桌面级通知，**点击直达对应会话**；权限申请挂在设置开关的点击手势上；系统响铃与自有提示音互斥，绝不双重响；
  - **提示音**：WebAudio 现场合成的双音动机——上行=完成、下行=需要你处理，无音频资源文件。
  - 「仅页面不可见时」默认开启（正盯着页面时不打扰）；首帧快照只武装不触发（刷新页面不刷屏）；只在跳变沿触发 + 同会话同类事件 2 秒冷却（防重连抖动）；子代理子会话不计（父会话承载整轮）。设置里有「测试」按钮，一键预览权限申请与通道效果。
- **缓存命中率两位小数（可开关，默认关闭）**：DSH 原生统计条里的缓存命中只显示整数百分比（如「缓存命中 96%」）。开启后改写为两位小数（如「缓存命中 96.35%」），且**直接用原始 token 数计算**——缓存读取 ÷ 计费输入（未缓存输入 + 缓存读取 + 缓存写入），与原生数字同源、但不再取整；完全命中显示 100.00%，无计费输入时该组本就不显示。开关位于设置的「布局」区，关闭即恢复原样。

所有修改**即时生效**，无需刷新。同一份配置也可以直接在设置文档里手改：

```yaml
ui-tweaks:
  fontSize: 16
  tableStyle: claude
  gitBarEnabled: true     # 默认 false（关闭），设为 true 开启 GitBar
  archiveManagerEnabled: true   # 默认 false（关闭），设为 true 开启「归档」页面
  initCommandEnabled: true      # 默认 false（关闭），设为 true 开启 /init 斜杠命令
  whaleIndicatorEnabled: true   # 默认 false（关闭），设为 true 开启鲸鱼指示器
  preciseCacheHitEnabled: true  # 默认 false（关闭），设为 true 开启缓存命中率两位小数
  notificationsEnabled: true    # 默认 false（关闭），设为 true 开启任务提醒（事件过滤与三个通道在设置里逐项开关）
  # suggestModel: 'provider:model'   # 可选：指定生成提交说明的模型
```

设置入口：**设置 → 界面调整**。

## 安装

```bash
# 方式一：从 npm 安装（推荐，预构建产物，一条命令装好）
npx -y @deepseek-ai/dsh plugin --profile web add dsh-ui-tweaks

# 方式二：从 GitHub 仓库安装（源码，会运行自包含的 prepare 构建）
npx -y @deepseek-ai/dsh plugin --profile web add github:wlj521/dsh-ui-tweaks
```

`add` 后面的包说明会**原样转发给 pnpm**，因此可以指定版本——npm 包用 `@版本号`，GitHub 源码用 `#tag`：

```bash
npx -y @deepseek-ai/dsh plugin --profile web add dsh-ui-tweaks@0.11.2                    # 锁定 npm 版本
npx -y @deepseek-ai/dsh plugin --profile web add github:wlj521/dsh-ui-tweaks#v0.11.2     # 锁定 git tag
```

从 GitHub 安装时，pnpm 可能要求批准该包的构建脚本——把提示的包键加进该 profile 的 `pnpm-workspace.yaml`：

```yaml
allowBuilds:
  dsh-ui-tweaks: true
```

然后重新执行 `add`。安装完成后**重启一次 `dsh web`**（bundle 插件在进程启动时扫描）。

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
- **Git 后端**（`src/git.ts` + `src/git-web.ts`）：通过 `ctx.get('sessions')`（可选服务）解析会话 header 的 `cwd` 作为“当前项目”，用 `child_process.execFile('git', …)`（无 shell、cwd 固定、超时 + 中止传播）执行只读/写操作；同源路由 `/_dsh/ui-tweaks/git/*` 提供 status / branches / diff（hunk 或完整文件，含绝对行号）/ graph（结构化提交行，含父哈希，供前端排布分支 lane）/ suggest / commit / push / pull（仅快进）/ checkout / create / branch-delete / remote-delete。提交说明生成优先走 `ctx.get('llm')`（可选服务，收集 `text-delta` 流），不可用时回退到启发式规则（按文件类型推断 conventional commit 类型与 scope）。
- **浏览器端**（`src/client/index.tsx`）：读写该路由、渲染设置页，并通过运行时 `<style>` 元素实时应用样式，覆盖稳定的 DSH 锚点（`[data-chat-flow]`、`[data-composer-card]`、`body` 上的 markdown 字体 token、`[data-slot="conversation.chat.node"]` 内的 markdown 表格）。
- **GitBar**（`src/client/gitbar.tsx`）：拆成两个组件，分别挂在 composer 工具行**内部**的 `conversation.input.left`（分支，位于权限控件之后）与 `conversation.input.right`（差异，位于模型选择之前）插槽——输入区不再有独立的一行胶囊。样式与输入框原生控件一致（28px 高、radius 24px、`--dsw-alias-label-secondary` 颜色、hover 用 `--dsw-alias-interactive-bg-hover`）。工具行是 DSH 的 inline-size 容器（`container-type:inline-size`），胶囊用 `@container` 查询做挤压降级：行宽 <700px 隐藏差异的“· K 个文件”元信息，<620px 全部收敛为纯图标，避免与权限 / 模型选择重叠；分支名另加 `text-overflow:ellipsis` 上限。差异面板展开时通过 `#root { margin-right }` 把对话区往左挤，面板不会与消息列重叠；面板内的高度分配采用「只给被拖的那一段显式高度、diff 段 `flex:1` 吃掉余量」的方式，配合 45% 上限，拖动永远不会撑破面板。独立 commit 胶囊已移除，提交保留在差异面板底部的提交区。提交图谱对话框的 lane 布局与 SVG 渲染拆在 `src/client/graphlayout.ts`（纯函数模块：父哈希 → 每行 lane / 边段，经典 first-parent 路由——第一父提交沿用原 lane 让线性历史始终一条线，合并与 fork 画贝塞尔弧线；`parents` 字段可选，兼容宿主里尚未重载的旧服务端）。
- **归档管理**（服务端 `src/archive.ts` + 浏览器端 `src/client/archive.tsx`）：作为 `settings.section` 插槽（设置面板中的「归档」页面）。列表数据直接来自框架标准 hook `useSessions` + `useWorkspaces`（`archivedSessionIds`），无需额外查询；操作走同源路由 `/_dsh/ui-tweaks/archive`。**恢复**把会话 id 从工作区存储域的 `archivedSessionIds` 全局单例中移除（DSH 只暴露单向 `archiveSession`，无公开的取消归档 API，故直接写活体存储域句柄并同步工作区注册表的内存缓存）。**彻底删除**依次：拒绝正在运行的会话（agent `status === 'running'` 才拒绝，空闲会话先 `cancel` + `whenIdle`）→ 用持久化后端自身的 `findLog` 定位并 `rm` 会话日志目录 → 调用公开的 `WorkspaceEntity.detachSession` 摘除工作区记账 → 从归档集合移除并同步注册表内存缓存与 header 索引 → 清理 `session_projcache` → 从内存 SessionStore 摘除该会话（触发 `host/session-removed` 实时消失）。
- **MCP 管理**（服务端 `src/mcp.ts` + 浏览器端 `src/client/mcp.tsx`）：同源路由 `/_dsh/ui-tweaks/mcp`。**列表**枚举 `ctx.loader.entries()` 中 `@deepseek-ai/dsh-mcp-client` 实例（id / config / fiber 状态：active=2、failed=3 等）并按 `mcp__<serverName>__` 前缀从工具注册表统计工具。**重启**调用 `entry.fiber.restart()`（仅运行时）。**添加 / 编辑 / 删除 / 启用停用**通过 `yaml`（eemeli）的 Document API 直接编辑 profile 的 `cordis.patch.yml`（保留注释与未知补丁结构，原子写 tmp+rename），随后由 DSH 内置的 `watchUserPatches` 热重载监视器重新应用补丁——`cordis-plugin-include` 对根组做**增量** `root.update`，因此只有被改动的 MCP 实例会重启，其它不受影响；环境变量值返回给同源浏览器（本机配置编辑需要），YAML 模式在服务端用 `yaml.parse` + 白名单校验。
- **鲸鱼指示器**（`src/client/whale.tsx`）：挂在 `conversation.input.dock`（输入框卡片上方的整行插槽）。dock 行本身比卡片宽（卡片被 InputBar root 以 `--dsh-composer-card-max-width` 封顶居中、两侧留 `--dsh-composer-side-clearance`），因此鲸鱼行**复刻卡片的几何**——同 max-width、同样居中、同样侧留白——再右对齐 + 6px `translateY`，鲸鱼恰好「骑」在卡片右上角（Claude Desktop 小螃蟹位置）。开关走与 /init 相同的「按需注册」编排——`whaleIndicatorEnabled` 打开时才注册插槽与样式，关闭即卸载。工作状态 = 会话列表 feed 中当前会话的 `running`（`useSyncExternalStore` 直订）∪ 输入机 `phase` 的 claimed/submitting；鲸鱼 SVG 路径内置为常量，挂载时以 `[class*="brandMark"]` 从侧边栏实时徽标尝试刷新（class 前缀是构建哈希，按后缀匹配以抗版本变化），取不到则回退内置几何。
- **任务提醒**（`src/client/notifier.ts`）：纯逻辑模块（无 React），在 `ctx.effect` 中直订 `ctx.sessions.list` 快照流（鲸鱼同款数据源），对全部非空、非子代理会话做前后对比：`running` true→false 且无挂起交互 → 完成事件；`pendingInteraction`（'approval' / 'plan-review' / 'question'，即侧边栏黄点分类）出现 → 交互事件；后台会话的宿主 `completed` 绿点升沿同样计为完成。结束原因来自服务端 [`dshTurnOutcome` 投影](D:/dsh-project/dsh-ui-tweaks/src/turn-outcome.ts)（last-wins fold 会话日志的 `turn/end.reason`）并随列表行 `projectionValues` 下发——completed/max-tokens 按「任务完成」、aborted/interrupted 按「任务已中断」、error 按「请求失败」（附截断错误消息）播报；投影缺失或未随本次跳变更新时退回普通完成播报。三通道各自静默降级——标题闪烁用 `setInterval` 交替写 `document.title`，`focus`/`visibilitychange` 时恢复；系统通知带 `tag` 去重、`onclick` 里 `window.focus()` + `sessionsService.open(id)` 直达会话、`silent` 跟随提示音开关避免双重响铃；提示音由 WebAudio 振荡器现场合成双音包络。防打扰：首帧只武装基线、只在跳变沿触发、同会话同类 2s 冷却；「仅页面不可见时」等开关经 `readState` 每拍重读实时生效，改动无需重装监视器。
- **缓存命中率两位小数**（`src/client/cachehit.tsx`）：挂在 `conversation.composer.dock`（输入框卡片下方承载原生统计条的横条）的**空渲染座位**——组件本身不画任何东西，只通过框架第五标准 hook `useProjection('tokenUsage')` 读取会话的 token 用量投影（未缓存输入 / 缓存读取 / 缓存写入 / 输出四个不相交桶），按 `缓存读取 ÷ (未缓存输入 + 缓存读取 + 缓存写入)` 算出精确占比后 `.toFixed(2)`，再把统计条里匹配「缓存命中 N%」/ "Cache hit N%" 的 span 原地改写为两位小数——布局、截断省略与 tooltip 行为全部保留 DSH 原样。一个 MutationObserver 监听统计条子树，React 重绘统计行时自动重打（写入幂等，改写一次后即收敛）；开关关闭或会话切换时恢复原始文本并断开监听。注册编排与鲸鱼一致：`preciseCacheHitEnabled` 打开才挂载，关闭即卸载。

## 协议

MIT
