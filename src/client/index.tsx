/**
 * dsh-ui-tweaks — browser half.
 *
 * Reads and writes the `ui-tweaks` settings namespace through the same-origin
 * route served by the server half, applies the chosen code font size / table
 * style live via a runtime `<style>` element, and renders the Settings
 * panel section that edits them.
 */

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only imports activate the client-service Context declarations this
// entry drives: `ctx.sessions` (api-session-controller), `ctx.slots`
// (ui-renderer), `ctx.locale` (locale), `ctx.commandUi` (ui-commands),
// `ctx.conversation` (ui-conversation) and the `settings.section` slot contract.
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only import activates the dsh-client-ui-settings slot declarations
// (`settings.section`) and the client-side settings scope contract.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only import activates the dsh-client-ui-conversation slot declarations
// (`conversation.input.dock`) that host the git-bar warmup seat and the
// timeline rail, and the Context declaration for
// `ctx.conversation` (the /init command's scope-addressed send / input registry).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only import activates the Context declaration for `ctx.commandUi`
// (client slash-command contributions) and provides the contribution types.
import type { SelectOption } from '@deepseek-ai/dsh-client-ui-commands/client'
// Type-only import activates the Context declarations for
// `ctx.sidebarRightTabs` (right-sidebar tab-type registry) and the
// `sidebar.right.pane.tab` keyed seat the terminal/diff bodies render into.
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { BranchChipEntry, DiffPanel, DiffTabTitle, GitWarmup, TerminalPanel, installGitBarStyles, installHeroChip } from './gitbar.tsx'
import { DiffIcon, TerminalIcon } from './icons.tsx'
import { ArchiveSection, installArchiveStyles } from './archive.tsx'
import { McpSection, installMcpStyles } from './mcp.tsx'
import { SearchSection } from './search.tsx'
import { TimelineRail, installTimelineStyles } from './timeline.tsx'
import { PreciseCacheHitEntry } from './cachehit.tsx'
import { installTaskNotifier, previewAlerts, requestNotifyPermission } from './notifier.ts'

const NS = 'ui-tweaks'
const SETTINGS_ROUTE = '/_dsh/ui-tweaks/settings'

/** Legacy: code font as a percentage of the stock 16px body (81% = stock 13/16). */
const DEFAULT_CODE_FONT_SCALE = 81
/** Absolute code font size (px): 13 is the stock DSH code block at a 16px body. */
const DEFAULT_CODE_FONT_SIZE = 13
const MIN_CODE_FONT_SIZE = 8
const MAX_CODE_FONT_SIZE = 32

interface TweaksValue {
  /** Code font size as a percentage of the stock 16px body (81 = stock). Legacy input. */
  codeFontScale?: number
  /** Absolute code font size in px; wins over the legacy percentage. */
  codeFontSize?: number
  tableStyle?: 'default' | 'claude'
  /** Which timeline to show: 'native' (DSH built-in rail) or 'web' (plugin classic rail). Keep in sync with src/config.ts. */
  timelineStyle?: 'native' | 'web'
  /** Conversation theme: 'default' keeps the stock look; any other value applies that skin. Keep in sync with src/config.ts. */
  themeStyle?: 'default' | 'neon-lime'
  /** Preferred web-search engine (bing | ddg | exa | tavily | keenable | perplexity | deepseek). */
  searchEngine?: string
  /** Bing market code (e.g. zh-CN). */
  bingMarket?: string
  /** Whether the GitBar (branch / diff / commit pills) is shown. */
  gitBarEnabled?: boolean
  /** Whether the Archive manager (sidebar entry above Settings) is shown. */
  archiveManagerEnabled?: boolean
  /** Whether the MCP manager (Settings page listing MCP servers) is shown. */
  mcpManagerEnabled?: boolean
  /** Whether the web-search takeover + 搜索 settings page are enabled. */
  searchEnabled?: boolean
  /** Whether the /init slash command (AGENTS.md bootstrap prompt) is registered. */
  initCommandEnabled?: boolean
  /** Whether the stats-line cache-hit figure keeps two decimals. Keep in sync with src/config.ts. */
  preciseCacheHitEnabled?: boolean
  /** Whether task notifications are active. Keep in sync with src/config.ts. */
  notificationsEnabled?: boolean
  /** Alert only while the tab is hidden or unfocused. */
  notifyOnlyWhenHidden?: boolean
  /** Alert when a session completes its turn. */
  notifyOnComplete?: boolean
  /** Alert when a session blocks on an approval, plan review or question. */
  notifyOnInteraction?: boolean
  /** Blink an unread counter into the tab title. */
  notifyTitleFlash?: boolean
  /** Fire desktop-level Web Notifications. */
  notifySystemNotification?: boolean
  /** Play the synthesized two-note chime. */
  notifySound?: boolean
}

interface ResolvedTweaks {
  /** Effective absolute code font size in px (codeFontSize, else legacy %, else stock). */
  codeFontSize: number
  tableStyle: 'default' | 'claude'
  timelineStyle: 'native' | 'web'
  themeStyle: 'default' | 'neon-lime'
  searchEngine: string
  bingMarket: string
  gitBarEnabled: boolean
  archiveManagerEnabled: boolean
  mcpManagerEnabled: boolean
  searchEnabled: boolean
  initCommandEnabled: boolean
  preciseCacheHitEnabled: boolean
  notificationsEnabled: boolean
  notifyOnlyWhenHidden: boolean
  notifyOnComplete: boolean
  notifyOnInteraction: boolean
  notifyTitleFlash: boolean
  notifySystemNotification: boolean
  notifySound: boolean
}

interface UITweaksSnapshot {
  writable: boolean
  value: TweaksValue
  revision: number
}

interface ApiSuccess<T> { ok: true; value: T }
interface ApiFailure { ok: false; error: { code: string; message: string } }

const en = {
  nav: 'UI Tweaks',
  settingsTitle: 'UI Tweaks',
  settingsIntro: 'Tune the conversation UI — code size, tables and layout, plus optional features: git bar, archive & MCP managers and the /init command. Changes apply live.',
  sectionText: 'Text & tables',
  sectionLayout: 'Layout',
  sectionFeatures: 'Features',
  codeFontSize: 'Code font size',
  codeFontSizeHint: `Absolute code size in px (${MIN_CODE_FONT_SIZE}–${MAX_CODE_FONT_SIZE}); ${DEFAULT_CODE_FONT_SIZE}px is DSH's default at a 16px body. Applies to code blocks; inline code follows proportionally.`,
  tableStyle: 'Table style',
  tableStyleHint: 'Cell look for markdown tables: stock borders, or the Claude Desktop card style.',
  tableStyleDefault: 'Default',
  tableStyleClaude: 'Claude Desktop',
  timeline: 'Timeline',
  timelineHint: 'Native: DSH\u2019s built-in turn rail at the right edge (stock). Web (classic): the v0.11 right-side navigation rail — hover to preview, click to jump; auto-hidden in short conversations.',
  timelineNative: 'Native',
  timelineWeb: 'Web (classic)',
  theme: 'Theme',
  themeHint: 'Conversation skin. Default keeps DSH\u2019s stock look; Neon lime is a poster skin — paper-white with ink-black hairlines in light mode, near-black with light hairlines in dark mode, lime highlights and a magenta action accent, applied live.',
  themeDefault: 'Default',
  themeNeonLime: 'Neon lime',
  sectionSearch: 'Web search',
  searchOn: 'On',
  searchOff: 'Off',
  searchEnabled: 'Web search',
  searchEnabledHint: 'Takes over the built-in web_search tool with this plugin\u2019s multi-engine provider, and adds a "搜索" settings page for the engine picker and per-platform API keys. Off restores the stock backend.',
  searchNav: 'Search',
  searchTitle: 'Web search',
  searchIntro: 'Pick the preferred engine for the built-in web_search tool; any engine that fails falls through to the next one automatically.',
  sectionKeys: 'API keys',
  keyFree: 'FREE',
  keyOptional: 'KEY OPTIONAL',
  keyRequired: 'KEY REQUIRED',
  keyConfigured: 'Configured',
  keyNotConfigured: 'Not configured',
  keySave: 'Save',
  keyClear: 'Clear',
  keySaved: 'Key saved.',
  keyCleared: 'Key cleared.',
  keyEnvHint: 'Keys are stored in the credentials center, one per line:',
  searchTest: 'Test engine',
  searchTesting: 'Testing…',
  searchTestOk: 'Engine works',
  searchTestFail: 'Engine failed',
  searchEngine: 'Search engine',
  searchEngineHint: 'Backend for the built-in web_search tool. Free engines (Bing, DuckDuckGo) need no key; Exa / Tavily / Keenable use their keyless anonymous quota without one; Perplexity and DeepSeek require a key.',
  searchEngineBing: 'Bing (free)',
  searchEngineDdg: 'DuckDuckGo (free)',
  searchEngineExa: 'Exa',
  searchEngineTavily: 'Tavily',
  searchEngineKeenable: 'Keenable',
  searchEnginePerplexity: 'Perplexity',
  searchEngineDeepseek: 'DeepSeek',
  bingMarket: 'Bing market',
  bingMarketHint: 'Market code for Bing results, e.g. zh-CN or en-US.',
  searchKeysHint: 'API keys live in ~/.dsh/.credentials.yaml, one per line: EXA_API_KEY / TAVILY_API_KEY / KEENABLE_API_KEY / PERPLEXITY_API_KEY / DEEPSEEK_API_KEY: sk-.... Keys resolve from the credentials center first, then environment variables.',
  gitBar: 'Git bar',
  gitBarHint: 'Branch / diff pills above the input inside git repos, with branch management and commit & push; auto-hidden outside git.',
  gitBarOn: 'On',
  gitBarOff: 'Off',
  archiveManager: 'Archive manager',
  archiveManagerHint: 'An Archive settings page to restore or permanently delete archived sessions.',
  archiveManagerOn: 'On',
  archiveManagerOff: 'Off',
  mcpManager: 'MCP manager',
  mcpManagerHint: 'An MCP settings page listing servers with status and tools; edit and restart them.',
  mcpManagerOn: 'On',
  mcpManagerOff: 'Off',
  mcpNav: 'MCP',
  mcpTitle: 'MCP servers',
  mcpEmpty: 'No MCP servers configured.',
  mcpStatusActive: 'Running',
  mcpStatusFailed: 'Failed',
  mcpStatusLoading: 'Loading',
  mcpStatusStopped: 'Stopped',
  mcpStatusDisabled: 'Disabled',
  mcpTools: 'tools',
  mcpEnv: 'Env',
  mcpAdd: 'Add server',
  mcpAddTitle: 'Add MCP server',
  mcpEditTitle: 'Edit MCP server',
  mcpEdit: 'Edit',
  mcpDelete: 'Delete',
  mcpEnabledAction: 'Enable',
  mcpDisabledAction: 'Disable',
  mcpSaved: 'Saved.',
  mcpRemoved: 'Removed.',
  mcpFormTab: 'Form',
  mcpYamlTab: 'YAML',
  mcpYamlHint: 'Fill in the MCP config directly (serverName / transport / command / args / env / toolCallTimeoutMs / url / headers …). It is validated before saving.',
  mcpYamlPlaceholder: 'serverName: my-server\ntransport: stdio\ncommand: npx\nargs:\n  - "-y"\n  - "@some/mcp-server"\nenv:\n  KEY: value\ntoolCallTimeoutMs: 60000',
  mcpFieldId: 'Instance ID',
  mcpFieldIdHint: 'Loader entry id (letters, digits, - and _ only); it must be unique.',
  mcpFieldName: 'Name',
  mcpFieldNameHint: 'Tool namespace `mcp__<name>__*`; letters, digits, - and _ (1–32).',
  mcpFieldType: 'Type',
  mcpFieldTimeout: 'Timeout (ms)',
  mcpFieldCommand: 'Command',
  mcpFieldCommandPlaceholder: 'e.g. npx',
  mcpFieldArgs: 'Arguments (one per line)',
  mcpFieldEnv: 'Environment vars (optional, KEY=value per line)',
  mcpFieldUrl: 'URL',
  mcpFieldHeaders: 'Headers (optional, Key: value per line)',
  mcpFieldEnabled: 'Enabled',
  mcpSave: 'Save',
  mcpCancel: 'Cancel',
  mcpInvalidId: 'Instance ID may only contain letters, digits, - and _.',
  mcpInvalidName: 'Name may only contain letters, digits, - and _ (1–32 chars).',
  mcpInvalidTimeout: 'Timeout must be a positive integer (ms).',
  mcpInvalidUrl: 'URL must start with http:// or https://.',
  mcpInvalidCommand: 'Command is required.',
  mcpUnavailable: 'MCP manager unavailable.',
  mcpDisabledHint: 'MCP management is off. Turn it on in 界面调整 (UI Tweaks) to view and restart MCP servers here.',
  mcpEnable: 'Enable MCP manager',
  initCommand: '/init command',
  initCommandHint: 'The /init slash command: pick a prompt language and the agent analyzes the project and writes AGENTS.md.',
  initCommandOn: 'On',
  initCommandOff: 'Off',
  preciseCacheHit: 'Precise cache hit',
  preciseCacheHitHint: 'Rewrites the cache-hit figure in the stats line under the input box to two decimal places (e.g. 96.35%), computed from the raw cached-read / cached-write / uncached-input token buckets instead of the stock rounded integer.',
  preciseCacheHitOn: 'On',
  preciseCacheHitOff: 'Off',
  sectionNotifications: 'Task alerts',
  notifications: 'Enable alerts',
  notificationsHint: 'Call you back while the tab is in the background: a session finishes its turn, or one starts waiting for your approval, plan review or answer. The switches below apply only while this is on.',
  notifyOn: 'On',
  notifyOff: 'Off',
  notifyOnComplete: 'Alert on finish',
  notifyOnCompleteHint: 'Fire when a session ends its turn — completed, interrupted or failed; the notification says which.',
  notifyOnInteraction: 'Alert on interaction',
  notifyOnInteractionHint: 'Fire when a session waits on you: an approval, a plan review, or a question from the agent.',
  notifyOnlyWhenHidden: 'Only when hidden',
  notifyOnlyWhenHiddenHint: 'Stay quiet while you are looking at this page; alert only once the tab is hidden or unfocused.',
  notifyTitleFlash: 'Tab title flash',
  notifyTitleFlashHint: 'Blink an unread counter into the tab title until you come back.',
  notifySystemNotification: 'System notifications',
  notifySystemNotificationHint: 'Desktop-level notifications; click one to jump straight to that session. Permission is requested when enabled.',
  notifySound: 'Chime',
  notifySoundHint: 'A soft two-note motif — rising when work finishes, falling when it needs you.',
  notifyTest: 'Test',
  notifyTitleDone: 'Task finished',
  notifyTitleAborted: 'Task interrupted',
  notifyTitleFailed: 'Request failed',
  notifyTitlePending: 'Needs you',
  bodyComplete: '✅ {title} finished its turn.',
  bodyAborted: '⏹ {title} was interrupted before finishing.',
  bodyFailed: '❌ {title} failed: {error}',
  bodyApproval: '⏸ {title} is waiting for your approval.',
  bodyPlan: '📋 {title} has a plan awaiting your review.',
  bodyQuestion: '❓ {title} asked you a question.',
  mcpServerDetail: 'Configured in the profile cordis.patch.yml as @deepseek-ai/dsh-mcp-client instances; add / edit / disable / delete write to that file and apply live.',
  archiveNav: 'Archive',
  archiveTitle: 'Archived sessions',
  archiveEmpty: 'No archived sessions.',
  archiveRestore: 'Restore',
  archiveRestoring: 'Working…',
  archiveDelete: 'Delete',
  archiveDeleteAll: 'Delete all',
  archiveRestoreAll: 'Restore all',
  archiveCount: 'sessions',
  archiveUnavailable: 'Archive unavailable.',
  archiveLiveError: 'This session is running; close it before permanently deleting it.',
  archiveDisabledHint: 'Archive management is off. Turn it on in 界面调整 (UI Tweaks) to restore or permanently delete archived sessions here.',
  archiveEnable: 'Enable archive management',
  archiveRestored: 'Restored.',
  railLabel: 'Chat timeline',
  roleUser: 'User',
  noText: '(no text)',
  defaultAction: 'Default',
  reset: 'Reset',
  resetDone: 'Reset to default.',
  applied: 'Applied',
  unavailable: 'Settings unavailable.',
  loading: 'Loading…',
  readOnly: 'The active Settings provider is read-only.',
  saved: 'Saved.',
  commitMessage: 'Commit',
  diffFiles: 'files',
  branchLocal: 'Local branches',
  branchRemote: 'Remote branches',
  branchNew: 'New branch',
  branchNewPlaceholder: 'Branch name, e.g. fix/typo',
  branchRename: 'Rename',
  tagsTitle: 'Tag',
  tagCreate: 'New Tag',
  tagCreatePlaceholder: 'Tag name, e.g. v1.2.0',
  tagMessagePlaceholder: 'Message (optional, makes it annotated)',
  tagPush: 'Push Tag',
  tagDelete: 'Delete Tag',
  tagCommitPlaceholder: 'Tag (optional)',
  branchCreate: 'Create',
  diffView: 'Code diff',
  diffOnly: 'Hunks',
  diffFull: 'Full file',
  commitTitle: 'Commit changes',
  commitPlaceholder: 'Describe your changes…',
  commitHint: 'Committing stages the checked files (untracked included) and commits; unchecked files are excluded from this commit. “Commit & push” also pushes; a new branch gets an -u upstream.',
  commitWillCommit: 'To commit',
  commitViewDiff: 'View',
  commitEmpty: 'Write a commit message first',
  commitCancel: 'Cancel',
  commitSubmit: 'Commit',
  commitSubmitPush: 'Commit & push',
  commitBusy: 'Task in progress — commit is unavailable while the agent is working.',
  dirty: 'Uncommitted changes',
  clean: 'Working tree clean',
  noChanges: 'No changes here.',
  branchDelete: 'Delete branch',
  branchDeleteConfirm: 'Confirm?',
  branchRemoteDelete: 'Delete remote branch',
  branchFrom: 'From branch',
  branchFromHead: 'Current HEAD (default)',
  branchGraph: 'Graph',
  branchCancel: 'Cancel',
  branchRefresh: 'Refresh',
  graphTitle: 'Commit graph',
  graphColGraph: 'Graph',
  graphColCommit: 'Commit',
  graphColSubject: 'Description',
  graphColAuthor: 'Author',
  graphColDate: 'Date',
  branchPushRemote: 'Push to remote',
  branchPull: 'Pull',
  includeFile: 'Include in commit',
  excludeFile: 'Exclude from commit',
  terminal: 'Terminal',
  terminalGuide: 'A persistent shell in the session working directory.',
  diffGuide: 'Review working-tree changes and commit.',
  notRepo: 'Not a git repository.',
  termConnecting: 'connecting…',
  termExited: 'shell exited',
  termUnavailable: 'PTY unavailable: node-pty failed to load on the host.',
  termLost: 'connection lost',
  initDesc: 'Analyze this project and generate an AGENTS.md for future coding agents',
  initOptionZh: 'AGENTS.md — Chinese prompt',
  initOptionZhDetail: 'Submit a Chinese prompt asking the agent to analyze the project and write or improve AGENTS.md.',
  initOptionEn: 'AGENTS.md — English prompt',
  initOptionEnDetail: 'Submit an English prompt asking the agent to analyze the project and write or improve AGENTS.md.',
  initFailed: '/init failed to send the prompt',
} as const

type LocaleKey = keyof typeof en

const zh: Record<LocaleKey, string> = {
  nav: '界面调整',
  settingsTitle: '界面调整',
  settingsIntro: '调整对话界面——代码字号、表格与布局，以及时间线、Git 状态栏、归档 / MCP 管理、/init 命令等功能开关，修改即时生效。',
  sectionText: '文本与表格',
  sectionLayout: '布局',
  sectionFeatures: '功能',
  codeFontSize: '代码字号',
  codeFontSizeHint: `代码绝对字号，取值 ${MIN_CODE_FONT_SIZE}–${MAX_CODE_FONT_SIZE}px；${DEFAULT_CODE_FONT_SIZE}px 为 DSH 默认（正文 16 时）。作用于代码块，行内代码按比例跟随。`,
  tableStyle: '表格样式',
  tableStyleHint: 'Markdown 表格的外观：默认边框，或 Claude Desktop 卡片风格。',
  tableStyleDefault: '默认',
  tableStyleClaude: 'Claude Desktop',
  timeline: '时间线',
  timelineHint: '原生：DSH 自带的回合导航轨（消息右侧小圆点，默认）。网页（经典）：找回 v0.11 的右侧导航轨——悬停预览、点击跳转；会话较短时自动隐藏。',
  timelineNative: '原生',
  timelineWeb: '网页（经典）',
  theme: '主题',
  themeHint: '对话皮肤。默认保持 DSH 原生外观；荧光黄是海报风双方案——浅色下纸白底黑粗线，深色下近黑底浅粗线，都配荧光黄高亮 + 品红点缀，切换即时生效。',
  themeDefault: '默认',
  themeNeonLime: '荧光黄',
  sectionSearch: '网络搜索',
  searchOn: '开',
  searchOff: '关',
  searchEnabled: '网络搜索',
  searchEnabledHint: '用本插件的多引擎 provider 接管内置 web_search 工具，并新增「搜索」设置页：选择引擎、按平台填写 API key。关闭后恢复官方搜索后端。',
  searchNav: '搜索',
  searchTitle: '网络搜索',
  searchIntro: '为内置 web_search 工具选择首选引擎；任一引擎失败会自动回退到下一个。',
  sectionKeys: 'API 密钥',
  keyFree: '免费',
  keyOptional: '可选',
  keyRequired: '必填',
  keyConfigured: '已配置',
  keyNotConfigured: '未配置',
  keySave: '保存',
  keyClear: '清除',
  keySaved: '已保存。',
  keyCleared: '已清除。',
  keyEnvHint: '密钥保存在凭据中心文件中，每行一个：',
  searchTest: '测试引擎',
  searchTesting: '测试中…',
  searchTestOk: '引擎可用',
  searchTestFail: '引擎失败',
  searchEngine: '搜索引擎',
  searchEngineHint: '内置 web_search 工具的后端。免费引擎（Bing、DuckDuckGo）无需 key；Exa / Tavily / Keenable 无 key 时走匿名免费额度；Perplexity 和 DeepSeek 需要配置 key。',
  searchEngineBing: 'Bing（免费）',
  searchEngineDdg: 'DuckDuckGo（免费）',
  searchEngineExa: 'Exa',
  searchEngineTavily: 'Tavily',
  searchEngineKeenable: 'Keenable',
  searchEnginePerplexity: 'Perplexity',
  searchEngineDeepseek: 'DeepSeek',
  bingMarket: 'Bing 市场',
  bingMarketHint: 'Bing 结果的市场代码，如 zh-CN 或 en-US。',
  searchKeysHint: 'API key 存放在 ~/.dsh/.credentials.yaml，每行一个：EXA_API_KEY / TAVILY_API_KEY / KEENABLE_API_KEY / PERPLEXITY_API_KEY / DEEPSEEK_API_KEY: sk-...。解析优先级：凭据中心 → 环境变量。',
  gitBar: 'Git 状态栏',
  gitBarHint: 'git 仓库内时在输入框上方显示 分支 / 差异 胶囊，支持分支管理与提交推送；非 git 目录自动隐藏。',
  gitBarOn: '开启',
  gitBarOff: '关闭',
  archiveManager: '归档管理',
  archiveManagerHint: '在设置中显示「归档」页面：恢复或彻底删除已归档会话。',
  archiveManagerOn: '开启',
  archiveManagerOff: '关闭',
  mcpManager: 'MCP 管理',
  mcpManagerHint: '在设置中显示「MCP 管理」页面：查看服务器状态与工具，可编辑并重启。',
  mcpManagerOn: '开启',
  mcpManagerOff: '关闭',
  mcpNav: 'MCP 管理',
  mcpTitle: 'MCP 服务器',
  mcpEmpty: '未配置任何 MCP 服务器。',
  mcpStatusActive: '运行中',
  mcpStatusFailed: '错误',
  mcpStatusLoading: '加载中',
  mcpStatusStopped: '未运行',
  mcpStatusDisabled: '已停用',
  mcpTools: '个工具',
  mcpEnv: '环境变量',
  mcpAdd: '添加服务器',
  mcpAddTitle: '添加 MCP 服务器',
  mcpEditTitle: '编辑 MCP 服务器',
  mcpEdit: '编辑',
  mcpDelete: '删除',
  mcpEnabledAction: '启用',
  mcpDisabledAction: '停用',
  mcpSaved: '已保存。',
  mcpRemoved: '已删除。',
  mcpFormTab: '表单',
  mcpYamlTab: 'YAML',
  mcpYamlHint: '直接填写 MCP 配置（serverName / transport / command / args / env / toolCallTimeoutMs / url / headers …），保存前会校验格式。',
  mcpYamlPlaceholder: 'serverName: my-server\ntransport: stdio\ncommand: npx\nargs:\n  - "-y"\n  - "@some/mcp-server"\nenv:\n  KEY: value\ntoolCallTimeoutMs: 60000',
  mcpFieldId: '实例 ID',
  mcpFieldIdHint: '加载器条目 ID（仅字母、数字、- 和 _），需唯一。',
  mcpFieldName: '名称',
  mcpFieldNameHint: '工具命名空间 `mcp__<名称>__*`；字母、数字、- 和 _（1–32 字符）。',
  mcpFieldType: '类型',
  mcpFieldTimeout: '超时时间 (ms)',
  mcpFieldCommand: '命令',
  mcpFieldCommandPlaceholder: '如 npx',
  mcpFieldArgs: '参数（每行一个）',
  mcpFieldEnv: '环境变量（可选，每行 KEY=值）',
  mcpFieldUrl: 'URL',
  mcpFieldHeaders: '请求头（可选，每行 Key: 值）',
  mcpFieldEnabled: '启用',
  mcpSave: '保存',
  mcpCancel: '取消',
  mcpInvalidId: '实例 ID 只能包含字母、数字、- 和 _。',
  mcpInvalidName: '名称只能包含字母、数字、- 和 _（1–32 字符）。',
  mcpInvalidTimeout: '超时时间必须是正整数（毫秒）。',
  mcpInvalidUrl: 'URL 必须以 http:// 或 https:// 开头。',
  mcpInvalidCommand: '命令不能为空。',
  mcpUnavailable: 'MCP 管理暂不可用。',
  mcpDisabledHint: 'MCP 管理尚未开启。在「界面调整」中开启“MCP 管理”后，可在此查看并重启 MCP 服务器。',
  mcpEnable: '开启 MCP 管理',
  initCommand: '/init 命令',
  initCommandHint: '注册 /init 斜杠命令：选择提示词语言后，让代理分析项目并生成 AGENTS.md。',
  initCommandOn: '开启',
  initCommandOff: '关闭',
  preciseCacheHit: '缓存命中率两位小数',
  preciseCacheHitHint: '把输入框下方统计条里的缓存命中百分比改写为两位小数（如 96.35%）——用原始 token 数（缓存读取 ÷ 计费输入）计算，而不是 DSH 取整后的整数。',
  preciseCacheHitOn: '开启',
  preciseCacheHitOff: '关闭',
  sectionNotifications: '任务提醒',
  notifications: '启用提醒',
  notificationsHint: '标签页在后台时唤你回来：会话完成了任务，或开始等待你的审批、计划确认或回答。下方开关仅在总开关开启时生效。',
  notifyOn: '开启',
  notifyOff: '关闭',
  notifyOnComplete: '完成提醒',
  notifyOnCompleteHint: '会话结束一轮任务时提醒——完成、被中断或出错都会通知，并注明是哪种情况。',
  notifyOnInteraction: '交互提醒',
  notifyOnInteractionHint: '会话等待你操作时提醒：审批、计划确认，或模型向你提问。',
  notifyOnlyWhenHidden: '仅页面不可见时',
  notifyOnlyWhenHiddenHint: '你正盯着本页时保持安静；切走标签页或最小化窗口后才开始提醒。',
  notifyTitleFlash: '标题闪烁',
  notifyTitleFlashHint: '在浏览器标签页标题中闪烁未读计数，直到你回到页面。',
  notifySystemNotification: '系统通知',
  notifySystemNotificationHint: '桌面级通知；点击通知可直达对应会话。开启时会向浏览器申请通知权限。',
  notifySound: '提示音',
  notifySoundHint: '轻柔的双音提示——上行表示完成，下行表示需要你处理。',
  notifyTest: '测试',
  notifyTitleDone: '任务完成',
  notifyTitleAborted: '任务已中断',
  notifyTitleFailed: '请求失败',
  notifyTitlePending: '需要你处理',
  bodyComplete: '✅ 「{title}」的任务已完成。',
  bodyAborted: '⏹ 「{title}」的任务被中断了。',
  bodyFailed: '❌ 「{title}」的任务出错了：{error}',
  bodyApproval: '⏸ 「{title}」正在等待你的审批。',
  bodyPlan: '📋 「{title}」有计划待确认。',
  bodyQuestion: '❓ 「{title}」向你提问了。',
  mcpServerDetail: 'MCP 服务器配置在 profile 的 cordis.patch.yml（@deepseek-ai/dsh-mcp-client 实例）；添加 / 编辑 / 停用 / 删除会写入该文件，改动实时生效。',
  archiveNav: '归档',
  archiveTitle: '已归档会话',
  archiveEmpty: '暂无归档会话。',
  archiveRestore: '恢复',
  archiveRestoring: '处理中…',
  archiveDelete: '删除',
  archiveDeleteAll: '全部删除',
  archiveRestoreAll: '全部恢复',
  archiveCount: '个会话',
  archiveUnavailable: '归档暂不可用。',
  archiveLiveError: '该会话正在运行，无法彻底删除，请先关闭该会话。',
  archiveDisabledHint: '归档管理尚未开启。在「界面调整」中开启“归档管理”后，可在此查看、恢复或彻底删除已归档会话。',
  archiveEnable: '开启归档管理',
  archiveRestored: '已恢复。',
  railLabel: '对话时间线',
  roleUser: '用户',
  noText: '（无文本内容）',
  defaultAction: '默认',
  reset: '重置',
  resetDone: '已重置为默认。',
  applied: '已应用',
  unavailable: '设置暂不可用。',
  loading: '加载中…',
  readOnly: '当前设置提供方为只读。',
  saved: '已保存。',
  commitMessage: 'Commit',
  diffFiles: '个文件',
  branchLocal: '本地分支',
  branchRemote: '远程分支',
  branchNew: '新建分支',
  branchNewPlaceholder: '分支名，如 fix/typo',
  branchRename: '重命名',
  tagsTitle: 'Tag',
  tagCreate: '新建 Tag',
  tagCreatePlaceholder: 'Tag 名，如 v1.2.0',
  tagMessagePlaceholder: '说明（可选，填写即 annotated tag）',
  tagPush: '推送 Tag',
  tagDelete: '删除 Tag',
  tagCommitPlaceholder: 'Tag（可选）',
  branchCreate: '创建',
  diffView: '代码差异',
  diffOnly: '仅差异',
  diffFull: '完整文件',
  commitTitle: '提交变更',
  commitPlaceholder: '描述你的改动…',
  commitHint: '提交会暂存勾选的文件（含未跟踪新文件）；取消勾选的文件将不包含在本次提交中。「提交并推送」提交后自动 push，新分支自动 -u 设上游。',
  commitWillCommit: '将提交',
  commitViewDiff: '查看',
  commitEmpty: '请先填写提交说明',
  commitCancel: '取消',
  commitSubmit: '提交',
  commitSubmitPush: '提交并推送',
  commitBusy: '任务进行中，暂不能提交。',
  dirty: '有未提交改动',
  clean: '工作区干净',
  noChanges: '这里没有差异。',
  branchDelete: '删除分支',
  branchDeleteConfirm: '确认删除?',
  branchRemoteDelete: '删除远程分支',
  branchFrom: '基于分支',
  branchFromHead: '当前 HEAD（默认）',
  branchGraph: '图谱',
  branchCancel: '取消',
  branchRefresh: '刷新',
  graphTitle: '提交图谱',
  graphColGraph: '图',
  graphColCommit: '提交',
  graphColSubject: '描述',
  graphColAuthor: '作者',
  graphColDate: '日期',
  branchPushRemote: '推送到远程',
  branchPull: '拉取',
  includeFile: '提交包含此文件',
  excludeFile: '提交排除此文件',
  terminal: '终端',
  terminalGuide: '在会话工作目录中打开常驻 shell。',
  diffGuide: '查看工作区改动并提交。',
  notRepo: '当前目录不是 git 仓库。',
  termConnecting: '连接中…',
  termExited: 'shell 已退出',
  termUnavailable: '终端不可用：宿主加载 node-pty 失败，无法启动 PTY 会话。',
  termLost: '连接已断开',
  initDesc: '分析当前项目并生成 AGENTS.md，供未来的 AI 编码代理使用',
  initOptionZh: 'AGENTS.md（中文提示词）',
  initOptionZhDetail: '向会话提交中文提示词，让代理分析项目并生成或改进 AGENTS.md。',
  initOptionEn: 'AGENTS.md（英文提示词）',
  initOptionEnDetail: '向会话提交英文提示词，让代理分析项目并生成或改进 AGENTS.md。',
  initFailed: '/init 提示词发送失败',
}

type Translate = (key: LocaleKey) => string

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** dsh-ui-tweaks Settings copy. */
    'ui-tweaks': LocaleKey
  }
}

function resolveValue(value: TweaksValue | undefined): ResolvedTweaks {
  // Effective code size: the absolute px input wins; otherwise derive px from
  // the legacy percentage at the stock 16px body; otherwise stock.
  const codeFontSize = typeof value?.codeFontSize === 'number'
    ? Math.min(MAX_CODE_FONT_SIZE, Math.max(MIN_CODE_FONT_SIZE, value.codeFontSize))
    : Math.max(8, Math.round(DEFAULT_CODE_FONT_SIZE * ((value?.codeFontScale ?? DEFAULT_CODE_FONT_SCALE) / DEFAULT_CODE_FONT_SCALE)))
  return {
    codeFontSize,
    tableStyle: value?.tableStyle === 'claude' ? 'claude' : 'default',
    timelineStyle: value?.timelineStyle === 'web' ? 'web' : 'native',
    themeStyle: value?.themeStyle === 'neon-lime' ? 'neon-lime' : 'default',
    searchEngine: value?.searchEngine ?? 'bing',
    bingMarket: value?.bingMarket ?? 'zh-CN',
    gitBarEnabled: value?.gitBarEnabled ?? false,
    archiveManagerEnabled: value?.archiveManagerEnabled ?? false,
    mcpManagerEnabled: value?.mcpManagerEnabled ?? false,
    searchEnabled: value?.searchEnabled ?? false,
    initCommandEnabled: value?.initCommandEnabled ?? false,
    preciseCacheHitEnabled: value?.preciseCacheHitEnabled ?? false,
    notificationsEnabled: value?.notificationsEnabled ?? false,
    notifyOnlyWhenHidden: value?.notifyOnlyWhenHidden ?? true,
    notifyOnComplete: value?.notifyOnComplete ?? true,
    notifyOnInteraction: value?.notifyOnInteraction ?? true,
    notifyTitleFlash: value?.notifyTitleFlash ?? true,
    notifySystemNotification: value?.notifySystemNotification ?? true,
    notifySound: value?.notifySound ?? false,
  }
}

/**
 * Rebuild the code font tokens for the chosen code-block size, keeping the
 * theme faces and the stock vertical rhythm. Returns an empty string at the
 * stock size so the theme's own tokens stay authoritative.
 */
function buildCodeFontCss(codeFontSize: number): string {
  if (codeFontSize === DEFAULT_CODE_FONT_SIZE) return ''
  const cs = getComputedStyle(document.body)
  const fam = (name: string, fallback: string): string => {
    const value = cs.getPropertyValue(name).trim()
    return value.length > 0 ? value : fallback
  }
  const code = fam('--dsw-font-markdown-code-font-family', '"SF Mono", Consolas, monospace')
  const codeBlock = fam('--dsw-font-markdown-code-block-font-family', '"SF Mono", Consolas, monospace')

  const parts: string[] = []
  // Code sizes hang off the absolute code-block size, with inline code slightly
  // larger and the small variant slightly smaller, preserving DSH's hierarchy
  // (14/13 and 12/13 of the block); line-heights stay at the stock values.
  const token = (shorthand: string, size: number, baseLine: number, family: string): void => {
    parts.push(`--${shorthand}:${size}px/${baseLine}px ${family}`)
    parts.push(`--${shorthand}-font-size:${size}px`)
    parts.push(`--${shorthand}-line-height:${baseLine}px`)
  }
  const codePx = (blockRatio: number): number => Math.max(8, Math.round(codeFontSize * blockRatio))
  token('dsw-font-markdown-code', codePx(14 / 13), 22, code)
  token('dsw-font-markdown-code-block', codePx(1), 22, codeBlock)
  token('dsw-font-markdown-code-block-small', codePx(12 / 13), 18, codeBlock)
  return `body{${parts.join(';')}}`
}

/**
 * Claude Desktop-ish markdown table look: light-gray rounded cell cards with
 * small gaps, no borders. Cells share the theme's inline-code background.
 * Alignment is left to the markdown renderer, so headers and cells always
 * match; font sizes stay DSH's stock values.
 */
const CLAUDE_TABLE_CSS = `
div[data-slot="conversation.chat.node"] table{
  border-collapse:separate !important;
  border-spacing:3px !important;
  width:100% !important;
  /* Fill the column like Claude Desktop, but never squeeze below the natural
     (no-wrap) width: a table too wide to fit keeps its real width and scrolls
     inside the stock table wrapper instead of hiding columns. */
  min-width:max-content !important;
  border:none !important;
}
div[data-slot="conversation.chat.node"] table thead th{
  background:var(--dsw-alias-markdown-inline-code) !important;
  color:inherit !important;
  font-weight:400 !important;
  font-size:inherit !important;
  padding:7px 10px !important;
  border:none !important;
  border-radius:6px !important;
}
div[data-slot="conversation.chat.node"] table tbody td{
  background:var(--dsw-alias-markdown-inline-code) !important;
  color:inherit !important;
  font-size:inherit !important;
  padding:7px 10px !important;
  vertical-align:top !important;
  border:none !important;
  border-radius:6px !important;
}
div[data-slot="conversation.chat.node"] table code,
div[data-slot="conversation.chat.node"] table pre{
  background:transparent !important;
  border:none !important;
  box-shadow:none !important;
}
`

/**
 * Fluorescent-lime poster skin (Bilibili tech-video look), in two schemes:
 * the paper-white poster (lime highlights, magenta action accent) in light
 * mode, and its dark twin in dark mode — near-black paper with the same
 * lime/magenta stickers. Popovers and menus (model switcher, open-in-app,
 * stat dialogs, context panel) ride the scheme's own paper so they never read
 * as a gray slab against the conversation.
 *
 * Every colour is a `--dut-*` design variable re-pointed per scheme, and the
 * DSW alias tokens map onto those variables in one place, so buttons, links,
 * selections, the sidebar and the plugin's own tinted controls follow
 * automatically in either host scheme. The host's own hairlines keep their
 * shipped subtle values (`--dut-line-*`); the bold ink frame is applied only
 * where this skin says so — code blocks, the composer card, the markdown
 * table header and the settings panels, all with hard offset shadows.
 * 'default' emits nothing and stays stock. Future skins add one union member
 * plus one block.
 */
const NEON_LIME_CSS = `
/* The host injects its theme sheets at runtime, so their <style> order against
   this one is not guaranteed; the id in :not() lifts the skin above the host's
   body[data-ds-dark-theme] palette (same specificity, later wins) without
   !important. The id never exists in the DOM. */
body:not(#dsh-ui-tweaks-theme-scope){
  color-scheme:light;
  --dut-paper:#ffffff;
  --dut-paper-2:#fafbfc;
  --dut-paper-3:#ffffff;
  --dut-pop:#ffffff;
  --dut-ink:#101418;
  --dut-on-ink:#c6ff00;
  --dut-code:#f7f8f9;
  --dut-text-1:#101418;
  --dut-text-2:#3d4750;
  --dut-text-3:#7a8791;
  --dut-text-4:#9aa4ad;
  --dut-btn-fg:#ffffff;
  --dut-lime:#c6ff00;
  --dut-lime-soft:#dcff4d;
  --dut-magenta:#e6007e;
  --dut-magenta-soft:rgba(230,0,126,.12);
  --dut-hover:rgba(230,0,126,.07);
  --dut-active:rgba(230,0,126,.13);
  --dut-sel-bg:#c6ff00;
  --dut-sel-fg:#101418;
  --dut-faint:rgba(0,0,0,.06);
  --dut-scroll-1:#e3e6ea;
  --dut-scroll-2:#c8cdd3;
  --dut-elev:#101418;
  /* the user bubble: the original pale pink in light mode; dark mode keeps the
     wine-red tone the user settled on (a lighter pink read as washed out) */
  --dut-bubble:#ffe4f1;
  --dut-shadow:#101418;
  --dut-drop:rgba(255,255,255,.7);
  /* Hairlines stay the host's own subtle values: the shipped 0.5px pills and
     dividers are designed around them, and painting them poster-ink read as
     "changed too much". The bold ink lives only in this skin's own explicit
     rules (code blocks, composer card, table header, panels). */
  --dut-line-1:rgba(0,0,0,.04);
  --dut-line-2:rgba(0,0,0,.10);
  --dut-line-3:rgba(0,0,0,.12);
  --dut-line-4:rgba(0,0,0,.16);
  --dut-error:var(--dsw-static-red-600);
  --dut-error-2:var(--dsw-static-red-400);
  --dut-success:var(--dsw-static-green-500);
  --dut-success-2:var(--dsw-static-green-400);
  --dut-success-3:var(--dsw-static-green-100);
  --dut-warn-3:var(--dsw-static-amber-100);
  --dsw-alias-bg-base:var(--dut-paper);
  --dsw-alias-bg-layer-1:var(--dut-paper);
  --dsw-alias-bg-layer-2:var(--dut-paper-2);
  --dsw-alias-bg-layer-3:var(--dut-paper-3);
  --dsw-alias-bg-mask-1:rgba(0,0,0,.24);
  --dsw-alias-bg-mask-2:rgba(0,0,0,.12);
  --dsw-alias-bg-mask-3:rgba(0,0,0,.48);
  --dsw-alias-bg-mask-photo:rgba(0,0,0,.88);
  --dsw-alias-bg-mask-drop:var(--dut-drop);
  --dsw-alias-bg-module-platform:var(--dut-paper-3);
  --dsw-alias-bg-multi-select:var(--dut-paper-2);
  --dsw-alias-bg-overlay:var(--dut-paper-3);
  --dsw-alias-bg-skeleton:var(--dut-faint);
  --dsw-alias-border-inverted:rgba(0,0,0,0);
  --dsw-alias-border-inverted2:rgba(0,0,0,0);
  --dsw-alias-border-l1:var(--dut-line-1);
  --dsw-alias-border-l2:var(--dut-line-2);
  --dsw-alias-border-l2-darkmode-thin:var(--dut-line-2);
  --dsw-alias-border-l3:var(--dut-line-3);
  --dsw-alias-border-l4:var(--dut-line-4);
  --dsw-alias-brand-primary:var(--dut-text-1);
  --dsw-alias-brand-primary-invert:var(--dut-paper);
  --dsw-alias-brand-text:var(--dut-text-1);
  --dsw-alias-brand-primary-new-colorprimary-new-color:var(--dut-magenta);
  --dsw-alias-button-contrast-fill:var(--dut-text-2);
  --dsw-alias-button-elevated-fill:var(--dut-paper);
  --dsw-alias-button-floating-fill:var(--dut-paper);
  --dsw-alias-button-floating-hover:var(--dut-paper-2);
  --dsw-alias-button-ghost-active-border:var(--dut-ink);
  --dsw-alias-button-ghost-active-fill:var(--dut-paper-3);
  --dsw-alias-button-ghost-active-hover:var(--dut-paper-3);
  --dsw-alias-button-info-fill:var(--dut-magenta);
  --dsw-alias-button-info-hover:var(--dut-magenta);
  --dsw-alias-button-primary-dimmed:var(--dut-paper-2);
  --dsw-alias-button-primary-fill:var(--dut-text-1);
  --dsw-alias-button-primary-hover:var(--dut-text-1);
  --dsw-alias-interactive-bg-active:var(--dut-active);
  --dsw-alias-interactive-bg-hover:var(--dut-hover);
  --dsw-alias-interactive-bg-hover-accent:var(--dut-active);
  --dsw-alias-interactive-bg-hover-danger:rgba(236,19,19,.05);
  --dsw-alias-interactive-bg-hover-solid:var(--dut-paper-3);
  --dsw-alias-label-caption:var(--dut-text-4);
  --dsw-alias-label-dimmed:var(--dut-text-4);
  --dsw-alias-label-primary:var(--dut-text-1);
  --dsw-alias-label-primary-bluish:var(--dut-text-1);
  --dsw-alias-label-primary-dimmed:var(--dut-text-1);
  --dsw-alias-label-primary-foreground:var(--dut-btn-fg);
  --dsw-alias-label-primary-inverted:var(--dut-btn-fg);
  --dsw-alias-label-secondary:var(--dut-text-2);
  --dsw-alias-label-tertiary:var(--dut-text-3);
  --dsw-alias-link:var(--dut-magenta);
  --dsw-alias-markdown-citation:var(--dut-paper-2);
  --dsw-alias-markdown-code-block:var(--dut-code);
  --dsw-alias-markdown-code-block-banner:var(--dut-paper-3);
  --dsw-alias-markdown-code-segment-selected:var(--dut-paper);
  --dsw-alias-markdown-code-segment-unselected:var(--dut-paper-2);
  --dsw-alias-markdown-inline-code:var(--dut-lime-soft);
  --dsw-alias-markdown-placeholder:var(--dut-paper-2);
  --dsw-alias-markdown-tag:var(--dut-paper-2);
  --dsw-alias-scrollbar-bg-l1:var(--dut-scroll-1);
  --dsw-alias-scrollbar-bg-l2:var(--dut-scroll-1);
  --dsw-alias-scrollbar-hover-l1:var(--dut-scroll-2);
  --dsw-alias-scrollbar-hover-l2:var(--dut-scroll-2);
  --dsw-alias-state-business-primary:var(--dut-magenta);
  --dsw-alias-state-business-tertiary:var(--dut-magenta-soft);
  --dsw-alias-state-error-primary:var(--dut-error);
  --dsw-alias-state-error-secondary:var(--dut-error-2);
  --dsw-alias-state-success-primary:var(--dut-success);
  --dsw-alias-state-success-secondary:var(--dut-success-2);
  --dsw-alias-state-success-tertiary:var(--dut-success-3);
  --dsw-alias-state-warn-label:var(--dsw-static-amber-600);
  --dsw-alias-state-warn-primary:var(--dsw-static-amber-500);
  --dsw-alias-state-warn-secondary:var(--dsw-static-amber-400);
  --dsw-alias-state-warn-tertiary:var(--dut-warn-3);
  --dsw-alias-toast-bg:var(--dut-elev);
  --dsw-alias-tooltip-bg:var(--dut-elev);
  --dsw-specific-bubble:var(--dut-bubble);
  --dsw-specific-bubble-highlight:var(--dut-lime-soft);
  --dsw-specific-input-major:var(--dut-pop);
  --dsw-specific-login-input:var(--dut-paper-2);
  --dsw-specific-selector:var(--dut-pop);
  --dsw-specific-menu:var(--dut-pop);
  --dsw-specific-sidebar-fill:var(--dut-paper);
  --dsw-specific-sidebar-nav-item-active:var(--dut-lime-soft);
  --dsw-specific-sidebar-nav-item-active-accent:var(--dut-lime);
  --dsw-specific-sidebar-nav-item-hover:var(--dut-paper-2);
  --dsw-specific-tip:var(--dut-paper-2);
}
/* Dark scheme: re-point the design variables only — every alias mapping and
   element rule follows through var() indirection, so the host's scheme toggle
   flips the whole skin without a second copy of the rules. */
body:not(#dsh-ui-tweaks-theme-scope)[data-ds-dark-theme]{
  color-scheme:dark;
  --dut-paper:#0b0d10;
  --dut-paper-2:#14181d;
  --dut-paper-3:#1e252c;
  --dut-pop:#161c22;
  --dut-ink:#e8ecef;
  --dut-on-ink:#101418;
  --dut-code:#171d24;
  --dut-text-1:#f2f5f3;
  --dut-text-2:#b9c3ca;
  --dut-text-3:#7f8d97;
  --dut-text-4:#66727c;
  --dut-btn-fg:#101418;
  --dut-lime:#c6ff00;
  --dut-lime-soft:#dcff4d;
  --dut-magenta:#ff3d9a;
  --dut-magenta-soft:rgba(255,61,154,.16);
  --dut-hover:rgba(255,61,154,.16);
  --dut-active:rgba(255,61,154,.26);
  --dut-sel-bg:#c6ff00;
  --dut-sel-fg:#101418;
  --dut-faint:rgba(255,255,255,.07);
  --dut-scroll-1:#2a3138;
  --dut-scroll-2:#3a444d;
  --dut-elev:#1f262c;
  --dut-bubble:#2a1220;
  /* the hard sticker offset rides the frame's own ink in both schemes: black
     under the white-paper card, white under the near-black one, so the border
     and its offset band read as one shape */
  --dut-shadow:#e8ecef;
  --dut-drop:rgba(39,39,48,.7);
  --dut-line-1:rgba(255,255,255,.06);
  --dut-line-2:rgba(255,255,255,.12);
  --dut-line-3:rgba(255,255,255,.16);
  --dut-line-4:rgba(255,255,255,.20);
  --dut-error:var(--dsw-static-red-400);
  --dut-error-2:var(--dsw-static-red-400);
  --dut-success:var(--dsw-static-green-400);
  --dut-success-2:var(--dsw-static-green-400);
  --dut-success-3:var(--dsw-static-green-900);
  --dut-warn-3:var(--dsw-static-amber-900);
}
::selection{background:var(--dut-sel-bg);color:var(--dut-sel-fg)}
/* table header: the screenshot's ink header strip with lime type; plain rules
   so the Claude table style can still win */
div[data-slot="conversation.chat.node"] table th{
  background:var(--dut-ink);
  color:var(--dut-on-ink);
}
div[data-slot="conversation.chat.node"] pre{
  border:2px solid var(--dut-ink) !important;
  border-radius:10px !important;
  box-shadow:5px 5px 0 var(--dut-shadow) !important;
  background:var(--dut-paper) !important;
}
div[data-slot="conversation.chat.node"] :not(pre)>code{
  background:var(--dut-lime-soft) !important;
  color:#101418 !important;
  border:none !important;
  border-radius:6px !important;
  padding:1px 6px !important;
}
/* composer card: white framed sticker (hard shadow, ink border) */
div[data-composer-card]{
  border:2px solid var(--dut-ink) !important;
  box-shadow:5px 5px 0 var(--dut-shadow) !important;
  background:var(--dut-paper) !important;
}
/* context-occupancy ring: the stock track/fill both read near-ink on this
   skin; give the track a quiet gray and the used arc the magenta accent
   (scoped to the composer's svg so the class-substring match stays safe) */
div[data-composer-card] svg [class*="track"]{stroke:var(--dut-scroll-1)}
div[data-composer-card] svg [class*="fill"]{stroke:var(--dut-magenta)}
/* sidebar new-session button: lime sticker. Matched by its CSS-module class,
   NOT the aria-label — the brand row button shares the same "新建会话"
   label (it doubles as the new-session shortcut) and must stay plain. */
button[class*="newSession"]{
  background:var(--dut-lime) !important;
  color:#101418 !important;
  border:2px solid var(--dut-ink) !important;
  border-radius:10px !important;
  box-shadow:3px 3px 0 var(--dut-shadow) !important;
}
button[class*="newSession"]:hover{background:#d4ff33 !important;color:#101418 !important}
/* dark scheme: invert the sticker to a lime-outlined dark pill — a full lime
   slab was the loudest thing in the column and the black label read as a
   mistake next to the dark chrome */
body:not(#dsh-ui-tweaks-theme-scope)[data-ds-dark-theme] button[class*="newSession"],
body:not(#dsh-ui-tweaks-theme-scope)[data-ds-dark-theme] button[class*="newSession"]:hover{
  background:var(--dut-paper) !important;
  color:var(--dut-lime) !important;
  border-color:var(--dut-lime) !important;
  box-shadow:3px 3px 0 var(--dut-lime) !important;
}
.dut-panel{border:2px solid var(--dut-ink) !important;box-shadow:5px 5px 0 var(--dut-shadow) !important}
.dut-seg button.dut-seg-active{background:var(--dut-lime) !important;color:#101418 !important}
.dut-btn.dut-btn-active{background:var(--dut-lime) !important;color:#101418 !important;border-color:var(--dut-ink) !important}
`

function buildRuntimeCss(value: ResolvedTweaks): string {
  const rules: string[] = []
  // Code font tokens, emitted only when the code size leaves the stock 13px;
  // the message body, headings, user messages and composer stay theme stock.
  const fontCss = buildCodeFontCss(value.codeFontSize)
  if (fontCss !== '') rules.push(fontCss)
  // Inline code is pinned by DSH to 0.875em of the surrounding text (it ignores
  // the code token); scale that em by how far the chosen code size sits from
  // the stock ratio (a 13px block at the stock 16px body).
  if (Math.abs(value.codeFontSize - DEFAULT_CODE_FONT_SIZE) > 0.5) {
    const em = (0.875 * (value.codeFontSize / DEFAULT_CODE_FONT_SIZE)).toFixed(3)
    rules.push(`div[data-slot="conversation.chat.node"] div[class*="_markdown_"] :not(pre)>code{font-size:${em}em !important}`)
  }
  if (value.tableStyle === 'claude') {
    rules.push(CLAUDE_TABLE_CSS)
  }
  // Hide the DSH built-in turn-navigation rail while the timeline switch is
  // on 'web'. The rail is a `<nav>` whose inline style carries the frame's
  // `--turn-natural-height` custom property — unique to TurnNavigator (not a
  // hashed CSS-modules class, not locale-dependent), so the attribute
  // selector survives rebuilds as long as the custom property does.
  if (value.timelineStyle === 'web') {
    rules.push('nav[style*="--turn-natural-height"]{display:none !important}')
  }
  if (value.themeStyle === 'neon-lime') {
    rules.push(NEON_LIME_CSS)
  }
  return rules.join('\n')
}

function runtimeStyleElement(): HTMLStyleElement {
  const id = 'dsh-ui-tweaks-runtime'
  let style = document.querySelector<HTMLStyleElement>(`style[data-plugin-css="${id}"]`)
  if (style === null) {
    style = document.createElement('style')
    style.dataset.plugin = 'dsh-ui-tweaks'
    style.dataset.pluginCss = id
    document.head.appendChild(style)
  }
  return style
}

const BASE_CSS = `
.dut-settings{display:grid;gap:8px;max-width:680px;padding:4px 2px 24px;color:var(--dsw-alias-label-primary)}
.dut-settings-header{display:flex;align-items:flex-start;gap:10px;padding:2px 2px 0}
.dut-logo{flex:none;display:grid;place-items:center;width:30px;height:30px;border-radius:9px;border:1px solid var(--dsw-alias-border-l1);background:linear-gradient(135deg,color-mix(in srgb,var(--dsw-alias-state-business-primary) 16%,transparent),transparent);font-size:15px;line-height:1}
.dut-settings-header h2{font-size:16px;letter-spacing:-.01em;margin:0 0 2px}
.dut-settings-header p{max-width:600px;margin:0;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1.45}
.dut-panel{display:grid;gap:0;border:1px solid var(--dsw-alias-border-l1);border-radius:14px;background:var(--dsw-alias-bg-layer-1);box-shadow:var(--dsw-shadow-lv1);overflow:hidden}
.dut-section-label{font-size:10.5px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--dsw-alias-label-tertiary);padding:9px 16px 4px}
.dut-field{display:grid;gap:6px;padding:7px 16px 10px}
.dut-field+.dut-field{border-top:1px solid var(--dsw-alias-border-l1)}
/* Two-column toggle grid: hairline dividers come from the 1px gap painting the
   panel's border color through; cells repaint the panel background above it. */
.dut-grid{grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:1px;background:var(--dsw-alias-border-l1)}
.dut-grid>.dut-section-label{grid-column:1/-1;background:var(--dsw-alias-bg-layer-1)}
.dut-grid .dut-field{background:var(--dsw-alias-bg-layer-1)}
.dut-grid .dut-field+.dut-field{border-top:none}
/* Subordinate rows (task-alert sub-toggles under the master switch): dimmed
   whole-row so the dependency reads at a glance; buttons disable separately. */
.dut-grid .dut-field.dut-sub-off{opacity:.5}
/* Task-alerts section packs its six sub-toggle cells TWO per row (the master
   row and the section label span all columns); very narrow panels fall back
   to a single column so nothing squeezes. */
.dut-grid.dut-grid-half{grid-template-columns:repeat(2,minmax(0,1fr))}
.dut-grid .dut-field.dut-span-all{grid-column:1/-1}
@media (max-width:640px){.dut-grid.dut-grid-half{grid-template-columns:minmax(0,1fr)}}
.dut-field-top{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
.dut-field-top>span{font-size:13.5px;font-weight:600}
.dut-label{display:inline-flex;align-items:center;gap:6px}
.dut-hint{flex:none;display:inline-grid;place-items:center;width:15px;height:15px;border-radius:50%;border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-tertiary);font-size:9.5px;font-weight:600;font-style:normal;line-height:1;cursor:help;user-select:none;transition:color .15s ease,border-color .15s ease}
.dut-hint:hover,.dut-hint:focus-visible{color:var(--dsw-alias-state-business-primary);border-color:var(--dsw-alias-state-business-primary)}
.dut-hint-pop{position:fixed;z-index:9999;width:max-content;max-width:300px;padding:8px 10px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-size:11.5px;line-height:1.5;box-shadow:0 4px 16px rgba(0,0,0,.14);pointer-events:none}
.dut-controls{display:flex;align-items:center;gap:8px}
.dut-stepper{display:inline-flex;align-items:center;border:1px solid var(--dsw-alias-border-l1);border-radius:9px;background:var(--dsw-alias-bg-layer-2);overflow:hidden}
.dut-stepper button{width:28px;height:28px;border:none;background:transparent;color:inherit;font-size:15px;font-weight:500;line-height:1;cursor:pointer;display:grid;place-items:center;transition:background .15s ease}
.dut-stepper button:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.dut-stepper button:disabled{opacity:.35;cursor:default}
.dut-stepper input{box-sizing:border-box;width:60px;height:28px;border:none;border-left:1px solid var(--dsw-alias-border-l1);border-right:1px solid var(--dsw-alias-border-l1);background:transparent;color:inherit;font:inherit;font-size:13px;text-align:center;-moz-appearance:textfield}
.dut-stepper input::-webkit-outer-spin-button,.dut-stepper input::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
.dut-stepper input:focus{outline:none}
.dut-seg{display:inline-flex;padding:3px;gap:3px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-2)}
.dut-seg button{border:none;border-radius:7px;padding:5px 12px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12.5px;cursor:pointer;transition:background .15s ease,color .15s ease}
.dut-seg button:hover:not(:disabled){color:var(--dsw-alias-label-primary)}
.dut-seg button.dut-seg-active{background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 12%,transparent);color:var(--dsw-alias-state-business-primary);font-weight:600;box-shadow:none}
.dut-seg button.dut-seg-active:hover:not(:disabled){color:var(--dsw-alias-state-business-primary)}
.dut-seg button:disabled{opacity:.45;cursor:default}
.dut-select{height:28px;padding:0 8px;border:1px solid var(--dsw-alias-border-l1);border-radius:9px;background:var(--dsw-alias-bg-layer-2);color:inherit;font:inherit;font-size:12.5px;cursor:pointer;color-scheme:light dark}
.dut-select:hover:not(:disabled){border-color:var(--dsw-alias-label-dimmed)}
.dut-select:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}
.dut-select:disabled{opacity:.45;cursor:default}
.dut-text-input{height:28px;width:110px;padding:0 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:9px;background:var(--dsw-alias-bg-layer-2);color:inherit;font:inherit;font-size:12.5px}
.dut-text-input:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}
.dut-text-input:disabled{opacity:.45}
.dut-note{padding:8px 16px 12px;font-size:11.5px;line-height:1.55;color:var(--dsw-alias-label-tertiary)}
/* The selected Settings-section tab — the stock shell paints a barely-there
   grey; brand-tint it so the selection reads clearly (and in the README shot). */
[role="dialog"] nav button[aria-selected="true"],[role="dialog"] nav button[aria-current="true"]{background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 12%,transparent);color:var(--dsw-alias-state-business-primary);font-weight:600}
.dut-btn{display:inline-flex;align-items:center;height:26px;padding:0 12px;border-radius:999px;border:1px solid var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11.5px;cursor:pointer;transition:background .15s ease,color .15s ease,border-color .15s ease}
.dut-btn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dut-btn.dut-btn-active{background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 12%,transparent);border-color:color-mix(in srgb,var(--dsw-alias-state-business-primary) 45%,transparent);color:var(--dsw-alias-state-business-primary)}
.dut-btn.dut-btn-active:hover{background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 18%,transparent);color:var(--dsw-alias-state-business-primary)}
.dut-btn:disabled{opacity:.4;cursor:default}
.dut-status{justify-self:start;font-size:11.5px;padding:3px 10px;border-radius:999px;background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 12%,transparent);color:var(--dsw-alias-state-success-primary);animation:dut-fadein .18s ease}
@keyframes dut-fadein{from{opacity:0;transform:translateY(-2px)}to{opacity:1;transform:none}}
.dut-loading{padding:16px;border-radius:12px;background:var(--dsw-alias-bg-layer-2);font-size:12px;color:var(--dsw-alias-label-secondary)}
.dut-alert{padding:10px 12px;border-radius:10px;font-size:12px;line-height:1.5}
.dut-alert.warning{background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 12%,transparent);color:var(--dsw-alias-state-warn-label)}
.dut-alert.error{background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 10%,transparent);color:var(--dsw-alias-state-error-primary)}
`

function installBaseStyles(): () => void {
  const id = 'dsh-ui-tweaks-base'
  const existing = document.querySelector<HTMLStyleElement>(`style[data-plugin-css="${id}"]`)
  if (existing !== null) return () => {}
  const style = document.createElement('style')
  style.dataset.plugin = 'dsh-ui-tweaks'
  style.dataset.pluginCss = id
  style.textContent = BASE_CSS
  document.head.appendChild(style)
  return () => { style.remove() }
}

/**
 * Settings requests retry briefly on 502/503: writing the profile patch
 * hot-reloads the `web` node and restarts this plugin for a moment (it
 * injects `web`), so a toggle click can land inside that window. The retry
 * rides it out instead of surfacing "settings unavailable".
 */
async function apiRequest<T>(init?: RequestInit): Promise<T> {
  let lastError: unknown
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      const response = await fetch(SETTINGS_ROUTE, { credentials: 'same-origin', ...init })
      const body = await response.json() as ApiSuccess<T> | ApiFailure
      if (response.ok && body.ok) return body.value
      const failure = body as ApiFailure
      const retryable = response.status === 502 || response.status === 503
      lastError = new Error(failure.error?.message ?? `UI Tweaks request failed with HTTP ${response.status}`)
      if (!retryable) throw lastError
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 250))
  }
  throw lastError ?? new Error('UI Tweaks request failed')
}

/** Client-side snapshot store fed by the same-origin Settings route. */
interface SettingsState {
  status: 'loading' | 'ready' | 'error'
  writable: boolean
  value: TweaksValue | undefined
  revision: number | undefined
  error?: string
}

/** Small external store shared by the Settings route and the CSS engine. */
export class SettingsClient {
  private state: SettingsState = { status: 'loading', writable: false, value: undefined, revision: undefined }
  private listeners = new Set<() => void>()
  private generation = 0

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  getSnapshot = (): SettingsState => this.state

  private publish(next: SettingsState): void {
    this.state = next
    for (const listener of this.listeners) listener()
  }

  async load(): Promise<void> {
    const generation = ++this.generation
    if (this.state.status === 'loading') this.publish({ ...this.state, status: 'loading' })
    try {
      const snapshot = await apiRequest<UITweaksSnapshot>()
      if (generation !== this.generation) return
      this.publish({
        status: 'ready',
        writable: snapshot.writable,
        value: snapshot.value,
        revision: snapshot.revision,
      })
    } catch (error) {
      if (generation !== this.generation) return
      this.publish({ ...this.state, status: 'error', error: error instanceof Error ? error.message : String(error) })
    }
  }

  private async post(payload: unknown): Promise<void> {
    const generation = ++this.generation
    const snapshot = await apiRequest<UITweaksSnapshot>({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (generation !== this.generation) return
    this.publish({
      status: 'ready',
      writable: snapshot.writable,
      value: snapshot.value,
      revision: snapshot.revision,
    })
  }

  async set(field: string, value: unknown): Promise<void> {
    await this.post({ action: 'set', field, value, expectedRevision: this.state.revision ?? 0 })
  }

  async unset(field: string): Promise<void> {
    await this.post({ action: 'unset', field, expectedRevision: this.state.revision ?? 0 })
  }
}

/** Required client services: slots (settings.section), locale, sessions (git bar, archive, notifier), the slash-command registry, and the scope-addressed conversation face. The right-sidebar tab registry (terminal/diff tabs) is resolved lazily — older hosts without it still load everything else. */
export const inject = ['slots', 'locale', 'sessions', 'commandUi', 'conversation', 'uiSession']

/**
 * Hover/focus hint: a small ⓘ next to the field label; the hint text renders
 * in a fixed-position bubble portaled to <body> (so panel `overflow:hidden`
 * can never clip it), measured in a layout effect to prefer the space above
 * the anchor and flip below near the viewport top. No layout shift: hints
 * never occupy flow height.
 */
function Hint({ text }: { text: string }) {
  const anchorRef = useRef<HTMLSpanElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: -9999, left: -9999 })
  useLayoutEffect(() => {
    if (!open) return
    const anchor = anchorRef.current?.getBoundingClientRect()
    const pop = popRef.current
    if (anchor === undefined || pop === null) return
    let left = Math.min(Math.max(8, anchor.left), window.innerWidth - pop.offsetWidth - 8)
    let top = anchor.top - pop.offsetHeight - 8
    if (top < 8) top = anchor.bottom + 8
    setPos({ top, left })
  }, [open])
  return (
    <>
      <span
        ref={anchorRef}
        className="dut-hint"
        role="note"
        aria-label={text}
        tabIndex={0}
        onMouseEnter={() => { setOpen(true) }}
        onMouseLeave={() => { setOpen(false) }}
        onFocus={() => { setOpen(true) }}
        onBlur={() => { setOpen(false) }}
      >i</span>
      {open && createPortal(
        <div ref={popRef} className="dut-hint-pop" style={{ top: pos.top, left: pos.left }}>{text}</div>,
        document.body,
      )}
    </>
  )
}

type SettingsSectionProps = PropsRuntime<'settings.section'> & {
  controller: SettingsClient
  t: Translate
}

function SettingsSection({ controller, t }: SettingsSectionProps) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot)
  const resolved = resolveValue(state.value)
  const writable = state.writable
  const [codeDraft, setCodeDraft] = useState<string>(String(resolved.codeFontSize))
  const [status, setStatus] = useState<LocaleKey | undefined>(undefined)

  useEffect(() => { if (state.status === 'loading' && state.value === undefined) void controller.load() }, [controller, state.status, state.value])
  useEffect(() => { setCodeDraft(String(resolved.codeFontSize)) }, [resolved.codeFontSize])
  useEffect(() => {
    if (status === undefined) return
    const timer = setTimeout(() => { setStatus(undefined) }, 1800)
    return () => { clearTimeout(timer) }
  }, [status])

  const commitCodeSize = (raw: string): void => {
    setCodeDraft(raw)
    const parsed = Number(raw)
    if (!Number.isFinite(parsed)) return
    const clamped = Math.min(MAX_CODE_FONT_SIZE, Math.max(MIN_CODE_FONT_SIZE, Math.round(parsed)))
    setCodeDraft(String(clamped))
    void controller.set('codeFontSize', clamped).then(() => { setStatus('applied') }).catch(() => { setStatus('unavailable') })
  }

  const pickTableStyle = (raw: string): void => {
    void controller.set('tableStyle', raw === 'claude' ? 'claude' : 'default').then(() => { setStatus('applied') }).catch(() => { setStatus('unavailable') })
  }

  const stepCodeSize = (delta: number): void => {
    const next = Math.min(MAX_CODE_FONT_SIZE, Math.max(MIN_CODE_FONT_SIZE, resolved.codeFontSize + delta))
    setCodeDraft(String(next))
    void controller.set('codeFontSize', next).then(() => { setStatus('applied') }).catch(() => { setStatus('unavailable') })
  }

  const setGitBar = (value: boolean): void => {
    void controller.set('gitBarEnabled', value).then(() => { setStatus('applied') }).catch(() => { setStatus('unavailable') })
  }

  const setArchiveManager = (value: boolean): void => {
    void controller.set('archiveManagerEnabled', value).then(() => { setStatus('applied') }).catch(() => { setStatus('unavailable') })
  }

  const setMcpManager = (value: boolean): void => {
    void controller.set('mcpManagerEnabled', value).then(() => { setStatus('applied') }).catch(() => { setStatus('unavailable') })
  }

  const setSearchEnabled = (value: boolean): void => {
    void controller.set('searchEnabled', value).then(() => {
      setStatus('applied')
      // Mirror the toggle into the profile patch AFTER the settings write
      // lands; the explicit `enabled` avoids racing the server-side read.
      // The patch write hot-reloads the web node (the plugin restarts with
      // it); the settings route's own retry absorbs the downtime.
      void fetch('/_dsh/ui-tweaks/search', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync-patch', enabled: value }),
      }).catch(() => { /* the startup reconcile also covers this */ })
    }).catch(() => { setStatus('unavailable') })
  }

  const setInitCommand = (value: boolean): void => {
    void controller.set('initCommandEnabled', value).then(() => { setStatus('applied') }).catch(() => { setStatus('unavailable') })
  }

  const setTimeline = (value: 'native' | 'web'): void => {
    void controller.set('timelineStyle', value).then(() => { setStatus('applied') }).catch(() => { setStatus('unavailable') })
  }

  const setPreciseCacheHit = (value: boolean): void => {
    void controller.set('preciseCacheHitEnabled', value).then(() => { setStatus('applied') }).catch(() => { setStatus('unavailable') })
  }

  const setTheme = (value: 'default' | 'neon-lime'): void => {
    void controller.set('themeStyle', value).then(() => { setStatus('applied') }).catch(() => { setStatus('unavailable') })
  }

  /** Master switch; enabling also asks for notification permission inside this click gesture. */
  const setNotifications = (value: boolean): void => {
    if (value) requestNotifyPermission()
    void controller.set('notificationsEnabled', value).then(() => { setStatus('applied') }).catch(() => { setStatus('unavailable') })
  }

  /** Channel/event toggles share one setter shape; the system-notification one requests permission too. */
  const setNotifyField = (field: 'notifyOnlyWhenHidden' | 'notifyOnComplete' | 'notifyOnInteraction' | 'notifyTitleFlash' | 'notifySystemNotification' | 'notifySound', value: boolean): void => {
    if (field === 'notifySystemNotification' && value) requestNotifyPermission()
    void controller.set(field, value).then(() => { setStatus('applied') }).catch(() => { setStatus('unavailable') })
  }

  const testNotifications = (): void => {
    requestNotifyPermission()
    previewAlerts(
      {
        titleFlash: resolved.notifyTitleFlash,
        systemNotification: resolved.notifySystemNotification,
        sound: resolved.notifySound,
      },
      {
        notifyTitleDone: t('notifyTitleDone'),
        notifyTitleAborted: t('notifyTitleAborted'),
        notifyTitleFailed: t('notifyTitleFailed'),
        notifyTitlePending: t('notifyTitlePending'),
        bodyComplete: t('bodyComplete'),
        bodyAborted: t('bodyAborted'),
        bodyFailed: t('bodyFailed'),
        bodyApproval: t('bodyApproval'),
        bodyPlan: t('bodyPlan'),
        bodyQuestion: t('bodyQuestion'),
      },
    )
  }

  /** Code size reset clears BOTH keys: the px input and the legacy percentage. */
  const resetCodeSize = (): void => {
    void (async () => {
      try {
        await controller.unset('codeFontSize')
        await controller.unset('codeFontScale')
        setStatus('resetDone')
      } catch {
        setStatus('unavailable')
      }
    })()
  }

  if (state.status === 'loading' && state.value === undefined) {
    return <div className="dut-settings"><div className="dut-loading">{t('loading')}</div></div>
  }
  if (state.status === 'error') {
    return <div className="dut-settings"><div className="dut-alert error">{t('unavailable')}</div></div>
  }

  return (
    <div className="dut-settings">
      <header className="dut-settings-header">
        <div className="dut-logo">🎨</div>
        <div>
          <h2>{t('settingsTitle')}</h2>
          <p>{t('settingsIntro')}</p>
        </div>
      </header>
      {!writable ? <div className="dut-alert warning">{t('readOnly')}</div> : null}
      {status === undefined ? null : <div className="dut-status">{t(status)}</div>}

      <section className="dut-panel">
        <div className="dut-section-label">{t('sectionText')}</div>
        <div className="dut-field">
          <div className="dut-field-top">
            <span className="dut-label">{t('codeFontSize')}<Hint text={t('codeFontSizeHint')} /></span>
            <div className="dut-controls">
              <div className="dut-stepper">
                <button type="button" aria-label="−" disabled={!writable || resolved.codeFontSize <= MIN_CODE_FONT_SIZE} onClick={() => { stepCodeSize(-1) }}>−</button>
                <input
                  type="number"
                  min={MIN_CODE_FONT_SIZE}
                  max={MAX_CODE_FONT_SIZE}
                  step={1}
                  value={codeDraft}
                  disabled={!writable}
                  onChange={(event) => { setCodeDraft(event.target.value) }}
                  onBlur={(event) => { commitCodeSize(event.target.value) }}
                  onKeyDown={(event) => { if (event.key === 'Enter') commitCodeSize((event.target as HTMLInputElement).value) }}
                />
                <button type="button" aria-label="+" disabled={!writable || resolved.codeFontSize >= MAX_CODE_FONT_SIZE} onClick={() => { stepCodeSize(1) }}>+</button>
              </div>
              <button type="button" className={'dut-btn' + (resolved.codeFontSize === DEFAULT_CODE_FONT_SIZE ? ' dut-btn-active' : '')} disabled={!writable} onClick={() => { resetCodeSize() }}>{t('defaultAction')}</button>
            </div>
          </div>
        </div>
        <div className="dut-field">
          <div className="dut-field-top">
            <span className="dut-label">{t('tableStyle')}<Hint text={t('tableStyleHint')} /></span>
            <div className="dut-controls">
              <div className="dut-seg">
                <button type="button" className={resolved.tableStyle === 'claude' ? 'dut-seg-active' : ''} disabled={!writable} onClick={() => { pickTableStyle('claude') }}>{t('tableStyleClaude')}</button>
                <button type="button" className={resolved.tableStyle === 'default' ? 'dut-seg-active' : ''} disabled={!writable} onClick={() => { pickTableStyle('default') }}>{t('tableStyleDefault')}</button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="dut-panel">
        <div className="dut-section-label">{t('sectionLayout')}</div>
        <div className="dut-field">
          <div className="dut-field-top">
            <span className="dut-label">{t('theme')}<Hint text={t('themeHint')} /></span>
            <div className="dut-controls">
              <div className="dut-seg">
                <button type="button" className={resolved.themeStyle === 'neon-lime' ? 'dut-seg-active' : ''} disabled={!writable} onClick={() => { setTheme('neon-lime') }}>{t('themeNeonLime')}</button>
                <button type="button" className={resolved.themeStyle === 'default' ? 'dut-seg-active' : ''} disabled={!writable} onClick={() => { setTheme('default') }}>{t('themeDefault')}</button>
              </div>
            </div>
          </div>
        </div>
        <div className="dut-field">
          <div className="dut-field-top">
            <span className="dut-label">{t('preciseCacheHit')}<Hint text={t('preciseCacheHitHint')} /></span>
            <div className="dut-controls">
              <div className="dut-seg">
                <button type="button" className={resolved.preciseCacheHitEnabled ? 'dut-seg-active' : ''} disabled={!writable} onClick={() => { setPreciseCacheHit(true) }}>{t('preciseCacheHitOn')}</button>
                <button type="button" className={!resolved.preciseCacheHitEnabled ? 'dut-seg-active' : ''} disabled={!writable} onClick={() => { setPreciseCacheHit(false) }}>{t('preciseCacheHitOff')}</button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="dut-panel">
        <div className="dut-section-label">{t('sectionSearch')}</div>
        <div className="dut-field">
          <div className="dut-field-top">
            <span className="dut-label">{t('searchEnabled')}<Hint text={t('searchEnabledHint')} /></span>
            <div className="dut-controls">
              <div className="dut-seg">
                <button type="button" className={resolved.searchEnabled ? 'dut-seg-active' : ''} disabled={!writable} onClick={() => { setSearchEnabled(true) }}>{t('searchOn')}</button>
                <button type="button" className={!resolved.searchEnabled ? 'dut-seg-active' : ''} disabled={!writable} onClick={() => { setSearchEnabled(false) }}>{t('searchOff')}</button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="dut-panel dut-grid">
        <div className="dut-section-label">{t('sectionFeatures')}</div>
        <div className="dut-field">
          <div className="dut-field-top">
            <span className="dut-label">{t('timeline')}<Hint text={t('timelineHint')} /></span>
            <div className="dut-controls">
              <div className="dut-seg">
                <button type="button" className={resolved.timelineStyle === 'native' ? 'dut-seg-active' : ''} disabled={!writable} onClick={() => { setTimeline('native') }}>{t('timelineNative')}</button>
                <button type="button" className={resolved.timelineStyle === 'web' ? 'dut-seg-active' : ''} disabled={!writable} onClick={() => { setTimeline('web') }}>{t('timelineWeb')}</button>
              </div>
            </div>
          </div>
        </div>
        <div className="dut-field">
          <div className="dut-field-top">
            <span className="dut-label">{t('gitBar')}<Hint text={t('gitBarHint')} /></span>
            <div className="dut-controls">
              <div className="dut-seg">
                <button type="button" className={resolved.gitBarEnabled ? 'dut-seg-active' : ''} disabled={!writable} onClick={() => { setGitBar(true) }}>{t('gitBarOn')}</button>
                <button type="button" className={!resolved.gitBarEnabled ? 'dut-seg-active' : ''} disabled={!writable} onClick={() => { setGitBar(false) }}>{t('gitBarOff')}</button>
              </div>
            </div>
          </div>
        </div>
        <div className="dut-field">
          <div className="dut-field-top">
            <span className="dut-label">{t('archiveManager')}<Hint text={t('archiveManagerHint')} /></span>
            <div className="dut-controls">
              <div className="dut-seg">
                <button type="button" className={resolved.archiveManagerEnabled ? 'dut-seg-active' : ''} disabled={!writable} onClick={() => { setArchiveManager(true) }}>{t('archiveManagerOn')}</button>
                <button type="button" className={!resolved.archiveManagerEnabled ? 'dut-seg-active' : ''} disabled={!writable} onClick={() => { setArchiveManager(false) }}>{t('archiveManagerOff')}</button>
              </div>
            </div>
          </div>
        </div>
        <div className="dut-field">
          <div className="dut-field-top">
            <span className="dut-label">{t('mcpManager')}<Hint text={t('mcpManagerHint')} /></span>
            <div className="dut-controls">
              <div className="dut-seg">
                <button type="button" className={resolved.mcpManagerEnabled ? 'dut-seg-active' : ''} disabled={!writable} onClick={() => { setMcpManager(true) }}>{t('mcpManagerOn')}</button>
                <button type="button" className={!resolved.mcpManagerEnabled ? 'dut-seg-active' : ''} disabled={!writable} onClick={() => { setMcpManager(false) }}>{t('mcpManagerOff')}</button>
              </div>
            </div>
          </div>
        </div>
        <div className="dut-field">
          <div className="dut-field-top">
            <span className="dut-label">{t('initCommand')}<Hint text={t('initCommandHint')} /></span>
            <div className="dut-controls">
              <div className="dut-seg">
                <button type="button" className={resolved.initCommandEnabled ? 'dut-seg-active' : ''} disabled={!writable} onClick={() => { setInitCommand(true) }}>{t('initCommandOn')}</button>
                <button type="button" className={!resolved.initCommandEnabled ? 'dut-seg-active' : ''} disabled={!writable} onClick={() => { setInitCommand(false) }}>{t('initCommandOff')}</button>
              </div>
            </div>
          </div>
        </div>
      </section>
      <section className="dut-panel dut-grid dut-grid-half">
        <div className="dut-section-label">{t('sectionNotifications')}</div>
        <div className="dut-field dut-span-all">
          <div className="dut-field-top">
            <span className="dut-label">{t('notifications')}<Hint text={t('notificationsHint')} /></span>
            <div className="dut-controls">
              <div className="dut-seg">
                <button type="button" className={resolved.notificationsEnabled ? 'dut-seg-active' : ''} disabled={!writable} onClick={() => { setNotifications(true) }}>{t('notifyOn')}</button>
                <button type="button" className={!resolved.notificationsEnabled ? 'dut-seg-active' : ''} disabled={!writable} onClick={() => { setNotifications(false) }}>{t('notifyOff')}</button>
              </div>
              <button type="button" className="dut-btn" disabled={!resolved.notificationsEnabled} onClick={() => { testNotifications() }}>{t('notifyTest')}</button>
            </div>
          </div>
        </div>
        <div className={'dut-field' + (!resolved.notificationsEnabled ? ' dut-sub-off' : '')}>
          <div className="dut-field-top">
            <span className="dut-label">{t('notifyOnComplete')}<Hint text={t('notifyOnCompleteHint')} /></span>
            <div className="dut-controls">
              <div className="dut-seg">
                <button type="button" className={resolved.notifyOnComplete ? 'dut-seg-active' : ''} disabled={!writable || !resolved.notificationsEnabled} onClick={() => { setNotifyField('notifyOnComplete', true) }}>{t('notifyOn')}</button>
                <button type="button" className={!resolved.notifyOnComplete ? 'dut-seg-active' : ''} disabled={!writable || !resolved.notificationsEnabled} onClick={() => { setNotifyField('notifyOnComplete', false) }}>{t('notifyOff')}</button>
              </div>
            </div>
          </div>
        </div>
        <div className={'dut-field' + (!resolved.notificationsEnabled ? ' dut-sub-off' : '')}>
          <div className="dut-field-top">
            <span className="dut-label">{t('notifyOnInteraction')}<Hint text={t('notifyOnInteractionHint')} /></span>
            <div className="dut-controls">
              <div className="dut-seg">
                <button type="button" className={resolved.notifyOnInteraction ? 'dut-seg-active' : ''} disabled={!writable || !resolved.notificationsEnabled} onClick={() => { setNotifyField('notifyOnInteraction', true) }}>{t('notifyOn')}</button>
                <button type="button" className={!resolved.notifyOnInteraction ? 'dut-seg-active' : ''} disabled={!writable || !resolved.notificationsEnabled} onClick={() => { setNotifyField('notifyOnInteraction', false) }}>{t('notifyOff')}</button>
              </div>
            </div>
          </div>
        </div>
        <div className={'dut-field' + (!resolved.notificationsEnabled ? ' dut-sub-off' : '')}>
          <div className="dut-field-top">
            <span className="dut-label">{t('notifyOnlyWhenHidden')}<Hint text={t('notifyOnlyWhenHiddenHint')} /></span>
            <div className="dut-controls">
              <div className="dut-seg">
                <button type="button" className={resolved.notifyOnlyWhenHidden ? 'dut-seg-active' : ''} disabled={!writable || !resolved.notificationsEnabled} onClick={() => { setNotifyField('notifyOnlyWhenHidden', true) }}>{t('notifyOn')}</button>
                <button type="button" className={!resolved.notifyOnlyWhenHidden ? 'dut-seg-active' : ''} disabled={!writable || !resolved.notificationsEnabled} onClick={() => { setNotifyField('notifyOnlyWhenHidden', false) }}>{t('notifyOff')}</button>
              </div>
            </div>
          </div>
        </div>
        <div className={'dut-field' + (!resolved.notificationsEnabled ? ' dut-sub-off' : '')}>
          <div className="dut-field-top">
            <span className="dut-label">{t('notifyTitleFlash')}<Hint text={t('notifyTitleFlashHint')} /></span>
            <div className="dut-controls">
              <div className="dut-seg">
                <button type="button" className={resolved.notifyTitleFlash ? 'dut-seg-active' : ''} disabled={!writable || !resolved.notificationsEnabled} onClick={() => { setNotifyField('notifyTitleFlash', true) }}>{t('notifyOn')}</button>
                <button type="button" className={!resolved.notifyTitleFlash ? 'dut-seg-active' : ''} disabled={!writable || !resolved.notificationsEnabled} onClick={() => { setNotifyField('notifyTitleFlash', false) }}>{t('notifyOff')}</button>
              </div>
            </div>
          </div>
        </div>
        <div className={'dut-field' + (!resolved.notificationsEnabled ? ' dut-sub-off' : '')}>
          <div className="dut-field-top">
            <span className="dut-label">{t('notifySystemNotification')}<Hint text={t('notifySystemNotificationHint')} /></span>
            <div className="dut-controls">
              <div className="dut-seg">
                <button type="button" className={resolved.notifySystemNotification ? 'dut-seg-active' : ''} disabled={!writable || !resolved.notificationsEnabled} onClick={() => { setNotifyField('notifySystemNotification', true) }}>{t('notifyOn')}</button>
                <button type="button" className={!resolved.notifySystemNotification ? 'dut-seg-active' : ''} disabled={!writable || !resolved.notificationsEnabled} onClick={() => { setNotifyField('notifySystemNotification', false) }}>{t('notifyOff')}</button>
              </div>
            </div>
          </div>
        </div>
        <div className={'dut-field' + (!resolved.notificationsEnabled ? ' dut-sub-off' : '')}>
          <div className="dut-field-top">
            <span className="dut-label">{t('notifySound')}<Hint text={t('notifySoundHint')} /></span>
            <div className="dut-controls">
              <div className="dut-seg">
                <button type="button" className={resolved.notifySound ? 'dut-seg-active' : ''} disabled={!writable || !resolved.notificationsEnabled} onClick={() => { setNotifyField('notifySound', true) }}>{t('notifyOn')}</button>
                <button type="button" className={!resolved.notifySound ? 'dut-seg-active' : ''} disabled={!writable || !resolved.notificationsEnabled} onClick={() => { setNotifyField('notifySound', false) }}>{t('notifyOff')}</button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

/**
 * The /init bootstrap prompts, submitted verbatim into the current session on
 * pick. Modeled after the classic coding-agent `/init`: explore the project,
 * then write (or improve) a root AGENTS.md addressed to future AI agents.
 */
const INIT_PROMPT_ZH = [
  '请为本项目生成一份面向 AI 编码代理的 AGENTS.md，放在仓库根目录：',
  '',
  '1. 先自行探索项目——阅读 README、清单文件（package.json / pyproject.toml 等）、构建脚本与关键源码目录，不要向我追问这些信息；',
  '2. AGENTS.md 用中文撰写，包含：项目简介、常用命令（安装 / 构建 / 测试 / 检查）、代码风格与约定、目录结构导览、已知注意事项；',
  '3. 只写从代码中验证过的事实，保持简洁（建议不超过 150 行），不要臆测；',
  '4. 如果已存在 AGENTS.md，在其基础上改进补充，不要丢失已有内容；',
  '5. 完成后简要汇报你写了什么。',
].join('\n')

const INIT_PROMPT_EN = [
  'Generate an AGENTS.md for this project at the repository root, addressed to future AI coding agents:',
  '',
  '1. Explore the project first — read the README, manifest files (package.json / pyproject.toml etc.), build scripts and key source directories; do not ask me about them.',
  '2. Write the AGENTS.md in English covering: project overview, common commands (install / build / test / lint), code style and conventions, a directory guide, and known gotchas.',
  '3. Only state facts verified from the code; keep it concise (~150 lines max); no speculation.',
  '4. If an AGENTS.md already exists, improve it in place without losing existing content.',
  '5. Briefly report what you wrote when done.',
].join('\n')

/**
 * Register the `/init` slash command: a client-owned contribution that pops a
 * language picker and submits the matching AGENTS.md bootstrap prompt into
 * the picked session via the scope-addressed conversation face
 * (`ctx.sessions.scope(id).conversation.send` — the same hop DSH's own
 * packages use). Contribution rows merge into the host catalog by name; the
 * description is a thunk so a mid-session language switch re-renders it live.
 */
function registerInitCommand(ctx: ClientContext): () => void {
  const t = ctx.locale.bind(NS)
  return ctx.commandUi.register({
    name: 'init',
    description: () => t('initDesc'),
    available: () => true,
    ui: {
      kind: 'popupSelect',
      options: (): Promise<readonly SelectOption[]> => Promise.resolve([
        { id: 'zh', label: t('initOptionZh'), detail: t('initOptionZhDetail') },
        { id: 'en', label: t('initOptionEn'), detail: t('initOptionEnDetail') },
      ]),
      onSelect: async (option, session) => {
        const prompt = option.id === 'en' ? INIT_PROMPT_EN : INIT_PROMPT_ZH
        const scoped = ctx.sessions.scope(session.sessionId)
        if (scoped === undefined) {
          console.error(`[dsh-ui-tweaks] ${t('initFailed')}: session ${session.sessionId} is not scoped`)
          return
        }
        // Route through the session's input facade (draft + submit) instead of
        // a bare conversation.send: the hub's own send choreography then
        // handles first-message materialization for a brand-new session, plus
        // queue/steer policy while a turn is running. A direct send cannot
        // start an unmaterialized session and fails silently there.
        const input = ctx.conversation.input.for(scoped)
        input.setDraft(prompt)
        input.submit()
      },
    },
  })
}

/**
 * Register a Settings section only while its enable flag is on, so the
 * Settings nav row appears / disappears live with the toggle in the UI Tweaks
 * section. Waits for the `settings.section` declaration (like the static
 * inject), then keeps the section registered exactly while
 * `isEnabled(controller value)` holds: toggling the switch in the UI Tweaks
 * section mounts or disposes the section, and the settings shell's nav
 * (projected from the section ledger) updates in place.
 */
function installConditionalSection(
  ctx: ClientContext,
  controller: SettingsClient,
  isEnabled: (value: TweaksValue | undefined) => boolean,
  registerSection: () => () => void,
): void {
  ctx.slots.inject('settings.section', () => {
    let dispose: (() => void) | undefined
    const sync = (): void => {
      const enabled = isEnabled(controller.getSnapshot().value)
      if (enabled && dispose === undefined) {
        dispose = registerSection()
      } else if (!enabled && dispose !== undefined) {
        dispose()
        dispose = undefined
      }
    }
    sync()
    const unsubscribe = controller.subscribe(sync)
    return () => {
      unsubscribe()
      dispose?.()
    }
  })
}

export function apply(ctx: ClientContext): void {
  ctx.effect(installBaseStyles, 'dsh-ui-tweaks: base styles')
  ctx.effect(installGitBarStyles, 'dsh-ui-tweaks: gitbar styles')
  ctx.effect(installArchiveStyles, 'dsh-ui-tweaks: archive styles')
  ctx.effect(installMcpStyles, 'dsh-ui-tweaks: mcp styles')
  ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'dsh-ui-tweaks: locale')
  const t = ctx.locale.bind(NS)

  const controller = new SettingsClient()

  ctx.effect(() => {
    const applyCss = (): void => {
      const state = controller.getSnapshot()
      if (state.status === 'ready') {
        runtimeStyleElement().textContent = buildRuntimeCss(resolveValue(state.value))
      }
    }
    applyCss()
    const dispose = controller.subscribe(applyCss)
    void controller.load()
    return dispose
  }, 'dsh-ui-tweaks: runtime css')

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: NS,
    order: 40,
    label: () => t('nav'),
    inject: () => ({ controller, t }),
  }, SettingsSection))

  // GitBar v3: the branch chip lives in the session header's action row
  // (beside the title, AFTER the mode badge); the terminal and diff tabs
  // below take the native right sidebar. Opening the project in
  // external apps is DSH's own open-in-app header button, so this plugin no
  // longer ships one.
  ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
    name: 'conversation.session.header.actions',
    id: 'gitbar-branch',
    order: 10,
    locale: NS,
    inject: () => ({ controller, sessionsService: ctx.sessions }),
  }, BranchChipEntry))

  // Warmup: the header chips mount only after the conversation projection
  // finishes loading (seconds on large inactive sessions). The input dock
  // mounts immediately on session switch, so a null-rendering seat there
  // prefetches the status into the shared cache right away — the chips then
  // paint folder+branch from the warm cache the moment they appear.
  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock',
    id: 'gitbar-warmup',
    order: 41,
    inject: () => ({}),
  }, GitWarmup))

  // Terminal + diff as native right-sidebar tabs (guide entries beside 文件;
  // picking one opens the tab in the sidebar), registered only while the
  // gitBarEnabled toggle in the UI Tweaks section is on. Each tab is a page
  // type (no address patterns): stage one registers the type with its guide
  // box, stage two the body under the type's id. The terminal reattaches to
  // its persistent host shell on every visit, and the diff tab keeps its
  // commit band. The tab registry is resolved lazily: hosts predating the
  // right sidebar simply skip these tabs while everything else keeps working.
  ctx.effect(() => {
    // Optional service: absent on hosts without the right sidebar (and on
    // plain version skew), in which case this whole effect is a no-op.
    // NOTE: must go through `ctx.get` — a direct `ctx.sidebarRightTabs`
    // property read throws "cannot get property without inject" when the
    // service is not listed in this entry's `inject` (and listing it there
    // would hard-require the sidebar on older hosts).
    const tabs = ctx.get('sidebarRightTabs') as typeof ctx.sidebarRightTabs | undefined
    if (tabs === undefined) return () => { /* no right sidebar on this host */ }
    const disposers: Array<() => void> = []
    const sync = (): void => {
      const enabled = controller.getSnapshot().value?.gitBarEnabled === true
      if (enabled && disposers.length === 0) {
        disposers.push(tabs.register({
          id: 'dsh-ui-tweaks/terminal',
          kind: 'ui-tweaks-terminal',
          title: () => t('terminal'),
          guide: [{ order: 20, title: () => t('terminal'), description: () => t('terminalGuide'), icon: TerminalIcon }],
        }))
        disposers.push(ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
          name: 'sidebar.right.pane.tab',
          key: 'dsh-ui-tweaks/terminal',
          locale: NS,
          inject: () => ({ controller }),
        }, TerminalPanel)))
        disposers.push(tabs.register({
          id: 'dsh-ui-tweaks/diff',
          kind: 'ui-tweaks-diff',
          title: () => t('diffView'),
          guide: [{ order: 30, title: () => t('diffView'), description: () => t('diffGuide'), icon: DiffIcon }],
        }))
        disposers.push(ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
          name: 'sidebar.right.pane.tab',
          key: 'dsh-ui-tweaks/diff',
          locale: NS,
          inject: () => ({ controller }),
        }, DiffPanel)))
        disposers.push(ctx.slots.inject('sidebar.right.pane.tab.title', () => ctx.slots.register({
          name: 'sidebar.right.pane.tab.title',
          key: 'dsh-ui-tweaks/diff',
          locale: NS,
          inject: () => ({ controller }),
        }, DiffTabTitle)))
      } else if (!enabled && disposers.length > 0) {
        for (const dispose of disposers.splice(0).reverse()) dispose()
      }
    }
    sync()
    const unsubscribe = controller.subscribe(sync)
    // The tab registry outlives this plugin: every id registered here must be
    // released on teardown, or the next apply (e.g. after a web hot-reload)
    // re-registers the same ids and the host throws "already registered".
    return () => {
      unsubscribe()
      for (const dispose of disposers.splice(0).reverse()) dispose()
    }
  }, 'dsh-ui-tweaks: sidebar tabs')

  // Hero (new-session screen): the session header does not mount there, so a
  // floating branch chip anchors beside the workspace picker instead — only
  // when the picked workspace is a git repo.
  ctx.effect(() => installHeroChip(controller, t), 'dsh-ui-tweaks: hero branch chip')

  // Archive manager: a Settings section ("归档") that lists archived sessions
  // and can restore or permanently delete them. Registered only while the
  // archiveManagerEnabled toggle in the UI Tweaks section is on, so the nav
  // row appears / disappears live with the switch (the settings shell
  // projects its nav from the section ledger).
  installConditionalSection(ctx, controller, (value) => value?.archiveManagerEnabled === true, () => ctx.slots.register({
    name: 'settings.section',
    id: 'archive',
    order: 50,
    label: () => t('archiveNav'),
    locale: NS,
    inject: () => ({ controller, t, sessionsService: ctx.sessions }),
  }, ArchiveSection))

  // MCP manager: a Settings section ("MCP 管理") that lists the configured MCP
  // servers with their status and tools, and restarts them. Registered only
  // while the mcpManagerEnabled toggle in the UI Tweaks section is on, so the
  // nav row appears / disappears live with the switch.
  installConditionalSection(ctx, controller, (value) => value?.mcpManagerEnabled === true, () => ctx.slots.register({
    name: 'settings.section',
    id: 'mcp',
    order: 60,
    label: () => t('mcpNav'),
    locale: NS,
    inject: () => ({ controller, t }),
  }, McpSection))

  // Web search manager: a Settings section ("搜索") with the engine picker and
  // per-engine API keys (credentials center). Mounted only while the
  // searchEnabled toggle in the UI Tweaks section is on.
  installConditionalSection(ctx, controller, (value) => value?.searchEnabled === true, () => ctx.slots.register({
    name: 'settings.section',
    id: 'search',
    order: 70,
    label: () => t('searchNav'),
    locale: NS,
    inject: () => ({ controller, t }),
  }, SearchSection))

  // /init slash command: registered only while the initCommandEnabled toggle
  // in the UI Tweaks section is on, so `/init` appears in the slash menu only
  // while the feature is enabled — same live register/dispose choreography as
  // the conditional Settings sections above.
  ctx.effect(() => {
    let dispose: (() => void) | undefined
    const sync = (): void => {
      const enabled = controller.getSnapshot().value?.initCommandEnabled === true
      if (enabled && dispose === undefined) {
        dispose = registerInitCommand(ctx)
      } else if (!enabled && dispose !== undefined) {
        dispose()
        dispose = undefined
      }
    }
    sync()
    const unsubscribe = controller.subscribe(sync)
    return () => {
      unsubscribe()
      dispose?.()
      dispose = undefined
    }
  }, 'dsh-ui-tweaks: /init command')

  // Conversation timeline rail (classic web rail): mounted per session,
  // registered only while the timeline switch is on 'web', so flipping the
  // choice applies live (the native DSH rail is hidden through the runtime
  // CSS in buildRuntimeCss on the same switch, never both or neither).
  ctx.effect(() => {
    let disposeEntry: (() => void) | undefined
    let disposeStyles: (() => void) | undefined
    const sync = (): void => {
      const enabled = controller.getSnapshot().value?.timelineStyle === 'web'
      if (enabled && disposeEntry === undefined) {
        disposeStyles = installTimelineStyles()
        disposeEntry = ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
          name: 'conversation.input.dock',
          id: 'timeline',
          order: 40,
          locale: NS,
          inject: () => ({ controller, sessionsService: ctx.sessions }),
        }, TimelineRail))
      } else if (!enabled && disposeEntry !== undefined) {
        disposeEntry()
        disposeEntry = undefined
        disposeStyles?.()
        disposeStyles = undefined
      }
    }
    sync()
    const unsubscribe = controller.subscribe(sync)
    return () => {
      unsubscribe()
      disposeEntry?.()
      disposeEntry = undefined
      disposeStyles?.()
      disposeStyles = undefined
    }
  }, 'dsh-ui-tweaks: timeline rail')

  // Precise cache hit: rewrites the stats line's cache-hit figure to two
  // decimals from the raw tokenUsage projection. The composer-dock entry
  // renders nothing itself — it is a live reader that patches the stock span
  // in place — and it is registered only while the preciseCacheHitEnabled
  // toggle is on, so off costs nothing and toggling restores the stock text.
  ctx.effect(() => {
    let disposeEntry: (() => void) | undefined
    const sync = (): void => {
      const enabled = controller.getSnapshot().value?.preciseCacheHitEnabled === true
      if (enabled && disposeEntry === undefined) {
        disposeEntry = ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
          name: 'conversation.composer.dock',
          id: 'precise-cache-hit',
          order: 90,
          inject: () => ({}),
        }, PreciseCacheHitEntry))
      } else if (!enabled && disposeEntry !== undefined) {
        disposeEntry()
        disposeEntry = undefined
      }
    }
    sync()
    const unsubscribe = controller.subscribe(sync)
    return () => {
      unsubscribe()
      disposeEntry?.()
      disposeEntry = undefined
    }
  }, 'dsh-ui-tweaks: precise cache hit')

  // Task notifications: watch every session on the list feed and raise
  // tab-title / system-notification / chime alerts when one finishes its turn
  // or starts blocking on the user. Registered only while the master toggle
  // is on; sub-toggles are re-read live through readState, so flipping them
  // never reinstalls the watcher.
  ctx.effect(() => {
    let disposeNotifier: (() => void) | undefined
    const sync = (): void => {
      const enabled = controller.getSnapshot().value?.notificationsEnabled === true
      if (enabled && disposeNotifier === undefined) {
        disposeNotifier = installTaskNotifier({
          sessionsService: ctx.sessions,
          pendingInteractions: ctx.uiSession.pendingInteractions,
          text: {
            notifyTitleDone: t('notifyTitleDone'),
            notifyTitleAborted: t('notifyTitleAborted'),
            notifyTitleFailed: t('notifyTitleFailed'),
            notifyTitlePending: t('notifyTitlePending'),
            bodyComplete: t('bodyComplete'),
            bodyAborted: t('bodyAborted'),
            bodyFailed: t('bodyFailed'),
            bodyApproval: t('bodyApproval'),
            bodyPlan: t('bodyPlan'),
            bodyQuestion: t('bodyQuestion'),
          },
          readState: () => {
            const value = controller.getSnapshot().value
            return {
              options: {
                onlyWhenHidden: value?.notifyOnlyWhenHidden ?? true,
                onComplete: value?.notifyOnComplete ?? true,
                onInteraction: value?.notifyOnInteraction ?? true,
              },
              channels: {
                titleFlash: value?.notifyTitleFlash ?? true,
                systemNotification: value?.notifySystemNotification ?? true,
                sound: value?.notifySound ?? false,
              },
            }
          },
        })
      } else if (!enabled && disposeNotifier !== undefined) {
        disposeNotifier()
        disposeNotifier = undefined
      }
    }
    sync()
    const unsubscribe = controller.subscribe(sync)
    return () => {
      unsubscribe()
      disposeNotifier?.()
      disposeNotifier = undefined
    }
  }, 'dsh-ui-tweaks: task notifications')
}
