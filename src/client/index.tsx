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
// `sidebar.right.pane.tab` keyed seat the diff body renders into.
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
// Type-only import activates the Context declaration for `ctx.uiWorkspace`,
// whose `openSession` replaced the removed `ctx.sessions.open` in DSH
// 0.1.6-alpha.2 — the notification click navigates through it.
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { BranchChipEntry, DiffPanel, DiffTabTitle, GitWarmup, installGitBarStyles, installHeroChip } from './gitbar.tsx'
import { DiffIcon } from './icons.tsx'
import { ArchiveSection, installArchiveStyles } from './archive.tsx'
import { SessionDeleteMenuItem, installSessionMenuStyles, SESSION_DELETE_MENU_ID, SESSION_DELETE_MENU_ORDER } from './session-menu.tsx'
import { McpSection, installMcpStyles } from './mcp.tsx'
import { SearchSection } from './search.tsx'
import { TimelineRail, installTimelineStyles } from './timeline.tsx'
import { PreciseCacheHitEntry } from './cachehit.tsx'
import { installTaskNotifier, previewAlerts, requestNotifyPermission } from './notifier.ts'
import { installSettingsNavIcons } from './nav-icons.ts'
import { isDesktopShell } from './shell.ts'

const NS = 'ui-tweaks'
const SETTINGS_ROUTE = '/_dsh/ui-tweaks/settings'

/** Legacy: code font as a percentage of the stock 14px body (81% resolves to the stock 11px code block). */
const DEFAULT_CODE_FONT_SCALE = 81
/**
 * Absolute code font size (px): 11 is the stock DSH code block at a 14px body.
 * Keep in sync with src/config.ts.
 */
const DEFAULT_CODE_FONT_SIZE = 11
const MIN_CODE_FONT_SIZE = 8
const MAX_CODE_FONT_SIZE = 32

/**
 * Stock DSH code-type metrics the scaled tokens preserve, read off
 * `dsh-client-ui-theme`'s `body{}` rule in DSH 0.1.6-alpha.2: inline code is
 * 12px against an 11px block, the small block variant keeps the block's own
 * size, and the two line-heights are 19px and 16px.
 */
const CODE_INLINE_RATIO = 12 / 11
const CODE_SMALL_RATIO = 1
/** Stock line-heights (px) for the code tokens; only the glyph size should move. */
const CODE_LINE_HEIGHT = 19
const CODE_SMALL_LINE_HEIGHT = 16
/**
 * Sentinel id that never exists in the DOM. The host declares the same tokens
 * on a plain `body{}` rule, so a plain `body{}` here would be a specificity
 * tie decided purely by `<style>` order — and the host re-appends its sheet
 * whenever its plugin re-activates. `:not(#id)` lifts this rule to (0,1,1) so
 * it wins regardless of order, the same guard PARTICLES_CSS uses.
 */
const CODE_FONT_SCOPE_ID = 'dsh-ui-tweaks-code-font-scope'

/**
 * Conversation skin ids mirrored from `src/config.ts`'s `ThemeStyle` — the two
 * type unions have to be spelled out here because the client bundle cannot
 * import the server module's types.
 */
type ThemeStyleValue = 'default' | 'particles'

/** Particle glow colours mirrored from `src/config.ts`'s `ParticleColor`. */
type ParticleColorValue = 'mint' | 'electric' | 'violet' | 'sky' | 'amber' | 'coral' | 'rose' | 'silver'

/** Default glow colour of the Soft glow skin. Keep in sync with src/config.ts. */
const DEFAULT_PARTICLE_COLOR: ParticleColorValue = 'mint'

/** Picker order. Keep in sync with src/config.ts's PARTICLE_COLOR_OPTIONS. */
const PARTICLE_COLORS: readonly ParticleColorValue[] = ['mint', 'electric', 'violet', 'sky', 'amber', 'coral', 'rose', 'silver']

/** Narrow an unknown persisted value to a known particle colour. */
function isParticleColor(x: unknown): x is ParticleColorValue {
  return typeof x === 'string' && (PARTICLE_COLORS as readonly string[]).includes(x)
}

/** Representative swatch hex per colour (the vivid value, legible on a light panel). */
const PARTICLE_SWATCH: Record<ParticleColorValue, string> = {
  mint: '#2dd4bf',
  electric: '#5b9dff',
  violet: '#a97bff',
  sky: '#38bdf8',
  amber: '#e0a458',
  coral: '#f0835a',
  rose: '#e08a9b',
  silver: '#c7d2e0',
}

/** Localized label key per colour. */
const PARTICLE_LABEL: Record<ParticleColorValue, LocaleKey> = {
  mint: 'colorMint',
  electric: 'colorElectric',
  violet: 'colorViolet',
  sky: 'colorSky',
  amber: 'colorAmber',
  coral: 'colorCoral',
  rose: 'colorRose',
  silver: 'colorSilver',
}

interface TweaksValue {
  /** Code font size as a percentage of the stock 14px body (81 = stock). Legacy input. */
  codeFontScale?: number
  /** Absolute code font size in px; wins over the legacy percentage. */
  codeFontSize?: number
  /** Which timeline to show: 'native' (DSH built-in rail) or 'web' (plugin classic rail). Keep in sync with src/config.ts. */
  timelineStyle?: 'native' | 'web'
  /** Conversation theme: 'default' keeps the stock look, 'particles' applies the Particle skin. Keep in sync with src/config.ts. */
  themeStyle?: ThemeStyleValue
  /** Glow colour of the Soft glow skin. Keep in sync with src/config.ts. */
  particleColor?: ParticleColorValue
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
  timelineStyle: 'native' | 'web'
  themeStyle: ThemeStyleValue
  particleColor: ParticleColorValue
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
  sectionText: 'Text',
  sectionLayout: 'Layout',
  sectionFeatures: 'Features',
  codeFontSize: 'Code font size',
  codeFontSizeHint: `Absolute code size in px (${MIN_CODE_FONT_SIZE}–${MAX_CODE_FONT_SIZE}); ${DEFAULT_CODE_FONT_SIZE}px is DSH's default at a 14px body. Applies to code blocks; inline code follows proportionally.`,
  timeline: 'Timeline',
  timelineHint: 'Native: DSH\u2019s built-in turn rail at the right edge (stock). Web (classic): the v0.11 right-side navigation rail — hover to preview, click to jump; auto-hidden in short conversations.',
  timelineNative: 'Native',
  timelineWeb: 'Web (classic)',
  theme: 'Theme',
  themeHint: 'Conversation skin. Default keeps DSH\u2019s stock look and can always be restored. Soft glow is a static skin: a tinted palette with soft accent glows radiating from the top and bottom edges toward the middle, selectable among mint, electric blue, violet, sky, amber, coral, rose or silver. No animation, so it costs nothing at runtime. Applied live.',
  themeDefault: 'Default',
  themeParticles: 'Soft glow',
  particleColor: 'Glow colour',
  particleColorHint: 'Glow colour of the accent halos and highlights. Only applies to the Soft glow skin.',
  colorMint: 'Mint',
  colorElectric: 'Electric blue',
  colorViolet: 'Violet',
  colorSky: 'Sky',
  colorAmber: 'Amber',
  colorCoral: 'Coral',
  colorRose: 'Rose',
  colorSilver: 'Silver',
  sectionSearch: 'Web search',
  searchOn: 'On',
  searchOff: 'Off',
  searchEnabled: 'Web search',
  searchEnabledHint: 'Takes over the built-in web_search tool with this plugin\u2019s multi-engine provider, and adds a "搜索" settings page for the engine picker and per-platform API keys. Off restores the stock backend.',
  searchNav: 'Web search',
  searchTitle: 'Web search',
  searchIntro: 'Pick the preferred engine for the built-in web_search tool; any engine that fails falls through to the next one automatically.',
  sectionKeys: 'API keys',
  keyFree: 'FREE',
  keyOptional: 'KEY OPTIONAL',
  keyRequired: 'KEY REQUIRED',
  keyConfigured: 'Configured',
  keyNotConfigured: 'Not configured',
  keyShow: 'Show',
  keyHide: 'Hide',
  keyCopy: 'Copy',
  keyCopied: 'Key copied.',
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
  mcpManagerHint: 'An MCP settings page listing server status and quick actions; edit and restart them.',
  mcpManagerOn: 'On',
  mcpManagerOff: 'Off',
  mcpNav: 'MCP manager',
  mcpTitle: 'MCP servers',
  mcpEmpty: 'No MCP servers configured yet. Add one to get started.',
  mcpStatusActive: 'Running',
  mcpStatusFailed: 'Failed',
  mcpStatusLoading: 'Loading',
  mcpStatusStopped: 'Stopped',
  mcpStatusStopping: 'Stopping',
  mcpStatusDisabled: 'Disabled',
  mcpTools: 'tools',
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
  mcpFieldEnv: 'Environment variables (optional)',
  mcpFieldUrl: 'URL',
  mcpFieldHeaders: 'Headers (optional)',
  mcpFieldEnabled: 'Enabled',
  mcpSave: 'Save',
  mcpCancel: 'Cancel',
  mcpInvalidId: 'Instance ID may only contain letters, digits, - and _.',
  mcpInvalidName: 'Name may only contain letters, digits, - and _ (1–32 chars).',
  mcpInvalidTimeout: 'Timeout must be a positive integer (ms).',
  mcpInvalidUrl: 'URL must start with http:// or https://.',
  mcpInvalidCommand: 'Command is required.',
  mcpBasicSection: 'Basics',
  mcpConnectionSection: 'Connection',
  mcpEnvHint: 'Passed to the server process. Scroll the list when there are many.',
  mcpHeadersHint: 'Sent with every HTTP request.',
  mcpAddEnv: 'Add variable',
  mcpAddHeader: 'Add header',
  mcpEnvEmpty: 'No environment variables yet',
  mcpHeadersEmpty: 'No headers yet',
  mcpKeyPlaceholder: 'KEY',
  mcpValuePlaceholder: 'value',
  mcpHeaderKeyPlaceholder: 'Header',
  mcpRemoveRow: 'Remove',
  mcpDuplicateKey: 'Duplicate key',
  mcpEmptyKey: 'Variable name cannot be empty',
  mcpEditorHint: 'Changes are written to the profile patch and applied live.',
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
  notifySystemNotificationHintDesktop: 'Desktop-level notifications; click one to jump straight to that session. Inside the desktop app they arrive as native OS notifications — no browser permission prompt appears.',
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
  mcpServerDetail: 'Servers are stored in this profile’s cordis.patch.yml; changes apply live.',
  archiveNav: 'Archive manager',
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
  menuDeleteSession: 'Delete session',
  menuDeleteConfirm: 'Delete session?',
  menuDeleting: 'Deleting…',
  menuDeleteRunning: 'This session is running — cannot delete.',
  menuDeleteFailed: 'Delete failed.',
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
  diffGuide: 'Review working-tree changes and commit.',
  notRepo: 'Not a git repository.',
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
  sectionText: '文本',
  sectionLayout: '布局',
  sectionFeatures: '功能',
  codeFontSize: '代码字号',
  codeFontSizeHint: `代码绝对字号，取值 ${MIN_CODE_FONT_SIZE}–${MAX_CODE_FONT_SIZE}px；${DEFAULT_CODE_FONT_SIZE}px 为 DSH 默认（正文 14 时）。作用于代码块，行内代码按比例跟随。`,
  timeline: '时间线',
  timelineHint: '原生：DSH 自带的回合导航轨（消息右侧小圆点，默认）。网页（经典）：找回 v0.11 的右侧导航轨——悬停预览、点击跳转；会话较短时自动隐藏。',
  timelineNative: '原生',
  timelineWeb: '网页（经典）',
  theme: '主题',
  themeHint: '对话皮肤。默认保持 DSH 原生外观，随时可恢复。柔光是一种静态皮肤：一套主题色 + 从顶部、底部向中间辐射的柔和光晕，发光色可选（薄荷青、电光蓝、紫罗兰、天空青、琥珀、珊瑚橙、玫瑰、月光银）。无动画，运行时几乎零开销。切换即时生效。',
  themeDefault: '默认',
  themeParticles: '柔光',
  particleColor: '光晕颜色',
  particleColorHint: '光晕与强调色的发光色，仅对「柔光」生效。',
  colorMint: '薄荷青',
  colorElectric: '电光蓝',
  colorViolet: '紫罗兰',
  colorSky: '天空青',
  colorAmber: '琥珀',
  colorCoral: '珊瑚橙',
  colorRose: '玫瑰',
  colorSilver: '月光银',
  sectionSearch: '网络搜索',
  searchOn: '开',
  searchOff: '关',
  searchEnabled: '网络搜索',
  searchEnabledHint: '用本插件的多引擎 provider 接管内置 web_search 工具，并新增「搜索」设置页：选择引擎、按平台填写 API key。关闭后恢复官方搜索后端。',
  searchNav: '网络搜索',
  searchTitle: '网络搜索',
  searchIntro: '为内置 web_search 工具选择首选引擎；任一引擎失败会自动回退到下一个。',
  sectionKeys: 'API 密钥',
  keyFree: '免费',
  keyOptional: '可选',
  keyRequired: '必填',
  keyConfigured: '已配置',
  keyNotConfigured: '未配置',
  keyShow: '显示',
  keyHide: '隐藏',
  keyCopy: '复制',
  keyCopied: '密钥已复制。',
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
  mcpManagerHint: '在设置中显示「MCP 管理」页面：查看服务器状态并进行启停、编辑等操作。',
  mcpManagerOn: '开启',
  mcpManagerOff: '关闭',
  mcpNav: 'MCP 管理',
  mcpTitle: 'MCP 服务器',
  mcpEmpty: '还没有配置 MCP 服务器，点击右上角添加。',
  mcpStatusActive: '运行中',
  mcpStatusFailed: '错误',
  mcpStatusLoading: '加载中',
  mcpStatusStopped: '未运行',
  mcpStatusStopping: '停止中',
  mcpStatusDisabled: '已停用',
  mcpTools: '个工具',
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
  mcpFieldEnv: '环境变量（可选）',
  mcpFieldUrl: 'URL',
  mcpFieldHeaders: '请求头（可选）',
  mcpFieldEnabled: '启用',
  mcpSave: '保存',
  mcpCancel: '取消',
  mcpInvalidId: '实例 ID 只能包含字母、数字、- 和 _。',
  mcpInvalidName: '名称只能包含字母、数字、- 和 _（1–32 字符）。',
  mcpInvalidTimeout: '超时时间必须是正整数（毫秒）。',
  mcpInvalidUrl: 'URL 必须以 http:// 或 https:// 开头。',
  mcpInvalidCommand: '命令不能为空。',
  mcpBasicSection: '基本信息',
  mcpConnectionSection: '连接配置',
  mcpEnvHint: '传递给 MCP 进程；变量较多时可在列表内滚动查看。',
  mcpHeadersHint: '随每个 HTTP 请求发送。',
  mcpAddEnv: '添加变量',
  mcpAddHeader: '添加请求头',
  mcpEnvEmpty: '还没有环境变量',
  mcpHeadersEmpty: '还没有请求头',
  mcpKeyPlaceholder: '变量名',
  mcpValuePlaceholder: '值',
  mcpHeaderKeyPlaceholder: '请求头名',
  mcpRemoveRow: '移除',
  mcpDuplicateKey: '变量名重复',
  mcpEmptyKey: '变量名不能为空',
  mcpEditorHint: '修改会写入 profile 配置并实时生效。',
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
  notifySystemNotificationHintDesktop: '桌面级通知；点击通知可直达对应会话。桌面端下直接以系统原生通知呈现，不会弹出浏览器授权请求。',
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
  mcpServerDetail: '服务器配置保存在当前 profile 的 cordis.patch.yml 中，修改会实时生效。',
  archiveNav: '归档管理',
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
  menuDeleteSession: '删除会话',
  menuDeleteConfirm: '确认删除？',
  menuDeleting: '删除中…',
  menuDeleteRunning: '会话运行中，无法删除。',
  menuDeleteFailed: '删除失败。',
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
  diffGuide: '查看工作区改动并提交。',
  notRepo: '当前目录不是 git 仓库。',
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
  // the legacy percentage at the stock 14px body; otherwise stock.
  const codeFontSize = typeof value?.codeFontSize === 'number'
    ? Math.min(MAX_CODE_FONT_SIZE, Math.max(MIN_CODE_FONT_SIZE, value.codeFontSize))
    : Math.max(8, Math.round(DEFAULT_CODE_FONT_SIZE * ((value?.codeFontScale ?? DEFAULT_CODE_FONT_SCALE) / DEFAULT_CODE_FONT_SCALE)))
  return {
    codeFontSize,
    timelineStyle: value?.timelineStyle === 'web' ? 'web' : 'native',
    // Only the two known skins are whitelisted: an unknown value falls back to
    // the stock look rather than half-applying a skin.
    themeStyle: value?.themeStyle === 'particles' ? 'particles' : 'default',
    particleColor: isParticleColor(value?.particleColor) ? value.particleColor : DEFAULT_PARTICLE_COLOR,
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
  // larger and the small variant the same size, preserving DSH's own hierarchy
  // (12/11 of the block for inline code, 1/1 for the small block). Line-heights
  // stay at the stock values, so only the glyph size moves.
  const token = (shorthand: string, size: number, baseLine: number, family: string): void => {
    parts.push(`--${shorthand}:${size}px/${baseLine}px ${family}`)
    parts.push(`--${shorthand}-font-size:${size}px`)
    parts.push(`--${shorthand}-line-height:${baseLine}px`)
  }
  const codePx = (blockRatio: number): number => Math.max(8, Math.round(codeFontSize * blockRatio))
  token('dsw-font-markdown-code', codePx(CODE_INLINE_RATIO), CODE_LINE_HEIGHT, code)
  token('dsw-font-markdown-code-block', codePx(1), CODE_LINE_HEIGHT, codeBlock)
  token('dsw-font-markdown-code-block-small', codePx(CODE_SMALL_RATIO), CODE_SMALL_LINE_HEIGHT, codeBlock)
  // See CODE_FONT_SCOPE_ID: the sentinel lifts this above the host's plain
  // `body{}` token rule so the override survives `<style>` reordering.
  return `body:not(#${CODE_FONT_SCOPE_ID}){${parts.join(';')}}`
}

/**
 * Soft glow skin — a tinted palette plus a static, soft accent glow behind the
 * conversation (centred under the composer). Neutral surfaces/ink are fixed per
 * scheme; the single accent (and therefore the glow) is chosen by the
 * `particleColor` setting and injected by `buildParticleColorCss` below, which
 * overrides `--dut-accent` on the same sentinel scope. Component rules give
 * inline code, code blocks, tables, links and list markers the accent
 * treatment promoted by the preview. Emitted only while the `particles` skin
 * is active; `default` emits nothing and stays stock.
 *
 * The `:not(#dsh-ui-tweaks-theme-scope)` sentinel lifts these rules above the
 * host's own `body{}` token declarations regardless of <style> order (the id
 * never exists in the DOM). As with the earlier skins, the host's settings
 * dialog (a body-level portal) is excluded so it keeps DSH's stock palette,
 * while the plugin's own settings pages are named back in.
 */
const PARTICLES_CSS = `
/* ---- palette: light ---- */
body:not(#dsh-ui-tweaks-theme-scope){
  color-scheme:light;
  --dut-paper:#ffffff;
  --dut-paper-2:#f5f7fa;
  --dut-paper-3:#ffffff;
  --dut-pop:#ffffff;
  --dut-ink:#10151b;
  --dut-th-bg:#f5f7fa;
  --dut-code:#f2f6f8;
  --dut-text-1:#10151b;
  --dut-text-2:#3c4650;
  --dut-text-3:#68737e;
  --dut-text-4:#8b959f;
  --dut-btn-fg:#ffffff;
  /* accent is overridden per particle colour; mint is the base/default */
  --dut-accent:#0e9e90;
  --dut-accent-soft:color-mix(in srgb, var(--dut-accent) 12%, transparent);
  --dut-accent-pale:color-mix(in srgb, var(--dut-accent) 22%, var(--dut-paper));
  --dut-hover:color-mix(in srgb, var(--dut-accent) 7%, transparent);
  --dut-active:color-mix(in srgb, var(--dut-accent) 13%, transparent);
  --dut-bubble:color-mix(in srgb, var(--dut-accent) 13%, var(--dut-paper));
  --dut-dot:color-mix(in srgb, var(--dut-accent) 45%, transparent);
  --dut-glow:color-mix(in srgb, var(--dut-accent) 14%, transparent);
  --dut-sel-bg:Highlight;
  --dut-sel-fg:HighlightText;
  --dut-faint:rgba(0,0,0,.06);
  --dut-scroll-1:#e3e7ec;
  --dut-scroll-2:#c8cfd6;
  --dut-elev:#10151b;
  --dut-line-1:rgba(16,25,35,.08);
  --dut-line-2:rgba(16,25,35,.14);
  --dut-line-3:rgba(16,25,35,.20);
  --dut-line-4:rgba(16,25,35,.28);
  --dut-error:var(--dsw-static-red-600);
  --dut-error-2:var(--dsw-static-red-400);
  --dut-success:var(--dsw-static-green-500);
  --dut-success-2:var(--dsw-static-green-400);
  --dut-success-3:var(--dsw-static-green-100);
  --dut-warn-3:var(--dsw-static-amber-100);
}
/* ---- palette: dark ---- */
body:not(#dsh-ui-tweaks-theme-scope)[data-ds-dark-theme]{
  color-scheme:dark;
  --dut-paper:#0a0c10;
  --dut-paper-2:#11151c;
  --dut-paper-3:#171c24;
  --dut-pop:#11161d;
  --dut-ink:#e6ecf5;
  --dut-th-bg:#171c24;
  --dut-code:#0e151b;
  --dut-text-1:#e6ecf5;
  --dut-text-2:#b7c1cc;
  --dut-text-3:#87919f;
  --dut-text-4:#6b7686;
  --dut-btn-fg:#0a0c10;
  --dut-accent:#2dd4bf;
  --dut-accent-soft:color-mix(in srgb, var(--dut-accent) 16%, transparent);
  --dut-accent-pale:color-mix(in srgb, var(--dut-accent) 26%, var(--dut-paper));
  --dut-hover:color-mix(in srgb, var(--dut-accent) 14%, transparent);
  --dut-active:color-mix(in srgb, var(--dut-accent) 22%, transparent);
  --dut-bubble:color-mix(in srgb, var(--dut-accent) 18%, var(--dut-paper));
  --dut-dot:color-mix(in srgb, var(--dut-accent) 60%, transparent);
  --dut-glow:color-mix(in srgb, var(--dut-accent) 18%, transparent);
  --dut-sel-bg:Highlight;
  --dut-sel-fg:HighlightText;
  --dut-faint:rgba(255,255,255,.07);
  --dut-scroll-1:#232a33;
  --dut-scroll-2:#333c47;
  --dut-elev:#161b22;
  --dut-line-1:rgba(255,255,255,.07);
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

/* ---- host token mapping (settings dialog stays stock) ---- */
body:not(#dsh-ui-tweaks-theme-scope) > :not(:has([data-shortcut-modal="settings"])),
body:not(#dsh-ui-tweaks-theme-scope) :is(.dut-settings,.dut-arc,.dut-mcp,.dut-search){
  --dsw-static-deepseek-200:var(--dut-accent-pale);
  --dsw-static-deepseek-450:var(--dut-accent);
  --dsw-static-deepseek-500:var(--dut-accent);
  --dsw-alias-bg-base:var(--dut-paper);
  --dsw-alias-bg-layer-1:var(--dut-paper);
  --dsw-alias-bg-layer-2:var(--dut-paper-2);
  --dsw-alias-bg-layer-3:var(--dut-paper-3);
  --dsw-alias-bg-mask-1:rgba(0,0,0,.24);
  --dsw-alias-bg-mask-2:rgba(0,0,0,.12);
  --dsw-alias-bg-mask-3:rgba(0,0,0,.48);
  --dsw-alias-bg-mask-photo:rgba(0,0,0,.88);
  --dsw-alias-bg-mask-drop:rgba(255,255,255,.7);
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
  --dsw-alias-brand-primary-new-colorprimary-new-color:var(--dut-accent);
  --dsw-alias-button-contrast-fill:var(--dut-text-2);
  --dsw-alias-button-elevated-fill:var(--dut-paper);
  --dsw-alias-button-floating-fill:var(--dut-paper);
  --dsw-alias-button-floating-hover:var(--dut-paper-2);
  --dsw-alias-button-ghost-active-border:var(--dut-line-3);
  --dsw-alias-button-ghost-active-fill:var(--dut-paper-2);
  --dsw-alias-button-ghost-active-hover:var(--dut-paper-2);
  --dsw-alias-button-info-fill:var(--dut-accent);
  --dsw-alias-button-info-hover:var(--dut-accent);
  --dsw-alias-button-primary-dimmed:var(--dut-paper-2);
  --dsw-alias-button-primary-fill:var(--dut-text-1);
  --dsw-alias-button-primary-hover:var(--dut-text-1);
  --dsw-alias-interactive-bg-active:var(--dut-active);
  --dsw-alias-interactive-bg-hover:var(--dut-hover);
  --dsw-alias-interactive-bg-hover-accent:var(--dut-active);
  --dsw-alias-interactive-bg-hover-danger:rgba(236,19,19,.05);
  --dsw-alias-interactive-bg-hover-solid:var(--dut-paper-3);
  --dsw-alias-label-caption:var(--dut-text-3);
  --dsw-alias-label-dimmed:var(--dut-text-4);
  --dsw-alias-label-primary:var(--dut-text-1);
  --dsw-alias-label-primary-bluish:var(--dut-text-1);
  --dsw-alias-label-primary-dimmed:var(--dut-text-1);
  --dsw-alias-label-primary-foreground:var(--dut-btn-fg);
  --dsw-alias-label-primary-inverted:var(--dut-btn-fg);
  --dsw-alias-label-secondary:var(--dut-text-2);
  --dsw-alias-label-tertiary:var(--dut-text-3);
  --dsw-alias-link:var(--dut-accent);
  --dsw-alias-markdown-citation:var(--dut-paper-2);
  --dsw-alias-markdown-code-block:var(--dut-code);
  --dsw-alias-markdown-code-block-banner:var(--dut-paper-3);
  --dsw-alias-markdown-code-segment-selected:var(--dut-paper);
  --dsw-alias-markdown-code-segment-unselected:var(--dut-paper-2);
  --dsw-alias-markdown-placeholder:var(--dut-paper-2);
  --dsw-alias-markdown-tag:var(--dut-paper-2);
  --dsw-alias-scrollbar-bg-l1:var(--dut-scroll-1);
  --dsw-alias-scrollbar-bg-l2:var(--dut-scroll-1);
  --dsw-alias-scrollbar-hover-l1:var(--dut-scroll-2);
  --dsw-alias-scrollbar-hover-l2:var(--dut-scroll-2);
  --dsw-alias-state-business-primary:var(--dut-accent);
  --dsw-alias-state-business-tertiary:var(--dut-accent-soft);
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
  --dsw-specific-bubble-highlight:var(--dut-accent-pale);
  --dsw-specific-input-major:var(--dut-pop);
  --dsw-specific-login-input:var(--dut-paper-2);
  --dsw-specific-selector:var(--dut-pop);
  --dsw-specific-menu:var(--dut-pop);
  --dsw-specific-sidebar-fill:var(--dut-paper);
  --dsw-specific-sidebar-nav-item-active:var(--dut-accent-soft);
  --dsw-specific-sidebar-nav-item-hover:var(--dut-paper-2);
  --dsw-specific-tip:var(--dut-paper-2);
}

/* ---- component accents ---- */
/* Inline code: accent type on a soft code pill. */
div[data-slot="conversation.chat.node"] :not(pre)>code{
  color:var(--dut-accent) !important;
  background:var(--dut-code) !important;
  border:1px solid var(--dut-line-1) !important;
  border-radius:6px !important;
  padding:1px 6px !important;
}
/* Code block: rounded hairline box, no heavy shadow. */
div[data-slot="conversation.chat.node"] pre{
  border:1px solid var(--dut-line-2) !important;
  border-radius:10px !important;
  box-shadow:none !important;
  background:var(--dut-code) !important;
}
/* Table: accent header type with an accent rule under it. */
div[data-slot="conversation.chat.node"] table th{
  background:var(--dut-th-bg);
  color:var(--dut-accent);
  border-bottom:1px solid var(--dut-accent);
}
div[data-slot="conversation.chat.node"] table td{border-bottom:1px solid var(--dut-line-1)}
/* Links and list markers ride the accent. */
div[data-slot="conversation.chat.node"] [class*="_markdown_"] a{
  color:var(--dut-accent);
  text-decoration:none;
  border-bottom:1px solid var(--dut-accent);
}
div[data-slot="conversation.chat.node"] [class*="_markdown_"] a:hover,
div[data-slot="conversation.chat.node"] [class*="_markdown_"] a:focus{text-decoration:underline}
div[data-slot="conversation.chat.node"] [class*="_markdown_"] :where(ul,ol)>li::marker{color:var(--dut-accent)}
/* Composer: soft framed card with an accent-tinted halo. */
div[data-composer-card]{
  border:1px solid var(--dut-line-2) !important;
  border-radius:16px !important;
  background:var(--dut-paper) !important;
  box-shadow:0 10px 30px color-mix(in srgb, var(--dut-accent) 10%, transparent) !important;
}
/* Context-occupancy ring: quiet track, accent arc. */
div[data-composer-card] svg [class*="track"]{stroke:var(--dut-scroll-1)}
div[data-composer-card] svg [class*="fill"]{stroke:var(--dut-accent)}

/* ---- ambient glow: static, no-animation background behind the messages ----
   Painted on the conversation scroll viewport ([data-conversation-scroll], a
   stable host attribute) so it sits behind the messages, not over them. Two
   soft accent glows radiate toward the middle — one bleeding down from the top
   edge, one rising from the bottom. The bottom glow is a wide ellipse (wider
   than the composer) so its light reaches both sides of the input card. Purely
   static: one cached paint, no per-frame work. Colours are kept light. */
[data-conversation-scroll]{
  background-color:var(--dut-paper);
  background-image:
    radial-gradient(85% 52% at 50% -10%, color-mix(in srgb, var(--dut-accent) 10%, transparent), transparent 62%),
    radial-gradient(120% 58% at 50% 112%, color-mix(in srgb, var(--dut-accent) 12%, transparent), transparent 66%);
  background-repeat:no-repeat;
}
body:not(#dsh-ui-tweaks-theme-scope)[data-ds-dark-theme] [data-conversation-scroll]{
  background-image:
    radial-gradient(85% 52% at 50% -10%, color-mix(in srgb, var(--dut-accent) 15%, transparent), transparent 62%),
    radial-gradient(120% 58% at 50% 112%, color-mix(in srgb, var(--dut-accent) 18%, transparent), transparent 66%);
}
`

/** Light/dark accent pair per particle colour. */
const PARTICLE_ACCENTS: Record<ParticleColorValue, { light: string; dark: string }> = {
  mint: { light: '#0e9e90', dark: '#2dd4bf' },
  electric: { light: '#2f6be0', dark: '#5b9dff' },
  violet: { light: '#7a4fe0', dark: '#a97bff' },
  sky: { light: '#0e8fc9', dark: '#38bdf8' },
  amber: { light: '#c07a2e', dark: '#e0a458' },
  coral: { light: '#d0603a', dark: '#f0835a' },
  rose: { light: '#c05f76', dark: '#e08a9b' },
  silver: { light: '#7e8ca0', dark: '#c7d2e0' },
}

/**
 * Emit the two `--dut-accent` overrides (light / dark) that recolour the whole
 * Soft glow skin, accent glow included. Appended after PARTICLES_CSS so it
 * wins on the same sentinel scope; every derived `--dut-accent-*` variable is
 * computed from this value at use time.
 */
function buildParticleColorCss(color: ParticleColorValue): string {
  const pair = PARTICLE_ACCENTS[color] ?? PARTICLE_ACCENTS.mint
  return `body:not(#dsh-ui-tweaks-theme-scope){--dut-accent:${pair.light}}\nbody:not(#dsh-ui-tweaks-theme-scope)[data-ds-dark-theme]{--dut-accent:${pair.dark}}`
}

function buildRuntimeCss(value: ResolvedTweaks): string {
  const rules: string[] = []
  // Code font tokens, emitted only when the code size leaves the stock 11px;
  // the message body, headings, user messages and composer stay theme stock.
  const fontCss = buildCodeFontCss(value.codeFontSize)
  if (fontCss !== '') rules.push(fontCss)
  // Inline code is pinned by DSH to 0.875em of the surrounding text (it ignores
  // the code token); scale that em by how far the chosen code size sits from
  // the stock ratio (an 11px block at the stock 14px body).
  if (Math.abs(value.codeFontSize - DEFAULT_CODE_FONT_SIZE) > 0.5) {
    const em = (0.875 * (value.codeFontSize / DEFAULT_CODE_FONT_SIZE)).toFixed(3)
    rules.push(`div[data-slot="conversation.chat.node"] div[class*="_markdown_"] :not(pre)>code{font-size:${em}em !important}`)
  }
  // Hide the DSH built-in turn-navigation rail while the timeline switch is
  // on 'web'. DSH 0.2.0-rc.2 dropped the `--turn-natural-height` inline
  // variable the rail's `<nav>` used to carry (its geometry moved to the
  // ancestor's `--dsh-conversation-viewport-height` and the module's
  // `--turn-rail-band`), so the attribute selector alone stopped matching
  // and both rails showed at once. The rail is now anchored structurally on
  // its CSS-modules shape, which survives hash rebuilds: the frame `<nav>`
  // owns a fade scroller (`nav > div.{hash}_scroller`) wrapping the marks
  // container (`div.{hash}_marks`). Either structural clause alone still
  // matches if the host renames the other, and the legacy inline-variable
  // selector is kept for hosts that still carry it. `_marks` (plural) is
  // deliberate — the singular `_mark` would also match the markdown
  // renderer's `_markdown_*` classes. Other host `<nav>`s (session crumbs,
  // settings sections, sidebar panels) hold plain text or buttons only, so
  // none of the clauses can reach them.
  if (value.timelineStyle === 'web') {
    rules.push('nav[style*="--turn-natural-height"],nav:has(> [class*="_scroller"]),nav:has([class*="_marks"]){display:none !important}')
  }
  if (value.themeStyle === 'particles') {
    // Base palette + component accents, then the chosen particle colour's
    // light/dark accent override (appended last so it wins on the same scope).
    rules.push(PARTICLES_CSS)
    rules.push(buildParticleColorCss(value.particleColor))
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
.dut-logo{flex:none;display:grid;place-items:center;width:30px;height:30px;border-radius:9px;border:1px solid var(--dsw-alias-border-l1);background-image:linear-gradient(135deg,color-mix(in srgb,var(--dsw-alias-state-business-primary) 16%,transparent),transparent);font-size:15px;line-height:1}
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
.dut-swatches{display:inline-flex;gap:8px;flex-wrap:wrap;align-items:center}
.dut-sw{width:26px;height:26px;box-sizing:border-box;border-radius:50%;border:1px solid var(--dsw-alias-border-l2);padding:3px;background:transparent;cursor:pointer;display:grid;place-items:center;transition:box-shadow .15s ease,border-color .15s ease}
.dut-sw>span{display:block;width:100%;height:100%;border-radius:50%}
.dut-sw:hover:not(:disabled){border-color:var(--dsw-alias-label-tertiary)}
.dut-sw.active{box-shadow:0 0 0 2px var(--dsw-alias-state-business-primary);border-color:transparent}
.dut-sw:disabled{opacity:.45;cursor:default}
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

/** Route failure that keeps the HTTP status so callers can react to a 409. */
class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | undefined,
  ) {
    super(message)
    this.name = 'ApiRequestError'
  }
}

/**
 * Settings requests retry briefly on 502/503: writing the profile patch
 * hot-reloads the `web` node and restarts this plugin for a moment (it
 * injects `web`), so a toggle click can land inside that window. The retry
 * rides it out instead of surfacing "settings unavailable". Every other
 * refusal — 409 included — fails fast: replaying it unchanged can only fail
 * again, and the write path owns the conflict recovery.
 */
async function apiRequest<T>(init?: RequestInit): Promise<T> {
  let lastError: unknown
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      const response = await fetch(SETTINGS_ROUTE, { credentials: 'same-origin', ...init })
      const body = await response.json() as ApiSuccess<T> | ApiFailure
      if (response.ok && body.ok) return body.value
      const failure = body as ApiFailure
      const error = new ApiRequestError(
        failure.error?.message ?? `UI Tweaks request failed with HTTP ${response.status}`,
        response.status,
        failure.error?.code,
      )
      if (error.status !== 502 && error.status !== 503) throw error
      lastError = error
    } catch (error) {
      if (error instanceof ApiRequestError) throw error
      // Transport-level failures (network, non-JSON body) are worth a retry.
      lastError = error
    }
    if (attempt < 6) await new Promise((resolve) => setTimeout(resolve, attempt * 250))
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

/**
 * Small external store shared by the Settings route and the CSS engine.
 *
 * Round trips run strictly one at a time. Toggle clicks outrun the patch write
 * they trigger, and two overlapping writes would carry the same
 * `expectedRevision`; the server refuses the later one with a 409 and the page
 * would stay pinned to a stale revision — every further click conflicting —
 * until a reload. A 409 still happens when the revision moves underneath the
 * page (the search toggle restarts this plugin, another tab writes, or the
 * patch is edited by hand), so a refused write refreshes the snapshot and
 * replays once against the new revision instead of locking the form.
 */
export class SettingsClient {
  private state: SettingsState = { status: 'loading', writable: false, value: undefined, revision: undefined }
  private listeners = new Set<() => void>()
  private operations: Promise<unknown> = Promise.resolve()

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  getSnapshot = (): SettingsState => this.state

  private publish(next: SettingsState): void {
    this.state = next
    for (const listener of this.listeners) listener()
  }

  private accept(snapshot: UITweaksSnapshot): void {
    this.publish({
      status: 'ready',
      writable: snapshot.writable,
      value: snapshot.value,
      revision: snapshot.revision,
    })
  }

  /** Serialize one round trip behind every earlier one. */
  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.operations.then(operation, operation)
    this.operations = next.then(() => undefined, () => undefined)
    return next
  }

  private fetchSnapshot(): Promise<UITweaksSnapshot> {
    return apiRequest<UITweaksSnapshot>()
  }

  async load(): Promise<void> {
    await this.enqueue(async () => {
      if (this.state.status === 'loading') this.publish({ ...this.state, status: 'loading' })
      try {
        this.accept(await this.fetchSnapshot())
      } catch (error) {
        this.publish({ ...this.state, status: 'error', error: error instanceof Error ? error.message : String(error) })
      }
    })
  }

  /**
   * Queue one field write. Must run inside {@link enqueue}: the conflict path
   * refreshes and replays while no other client write can interleave.
   */
  private async write(build: (expectedRevision: number) => unknown): Promise<void> {
    const send = (expectedRevision: number): Promise<UITweaksSnapshot> => apiRequest<UITweaksSnapshot>({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(build(expectedRevision)),
    })
    let snapshot: UITweaksSnapshot
    try {
      snapshot = await send(this.state.revision ?? 0)
    } catch (error) {
      if (!(error instanceof ApiRequestError) || error.status !== 409) throw error
      // Another writer moved the revision: adopt the server snapshot, then
      // replay the click against it.
      const fresh = await this.fetchSnapshot()
      this.accept(fresh)
      snapshot = await send(fresh.revision)
    }
    this.accept(snapshot)
  }

  async set(field: string, value: unknown): Promise<void> {
    await this.enqueue(() => this.write(revision => ({ action: 'set', field, value, expectedRevision: revision })))
  }

  async unset(field: string): Promise<void> {
    await this.enqueue(() => this.write(revision => ({ action: 'unset', field, expectedRevision: revision })))
  }
}

/** Required client services: slots (settings.section), locale, sessions (git bar, archive, notifier), the slash-command registry, the scope-addressed conversation face, the unified session-status source, and workspace navigation. The right-sidebar tab registry (diff tab) is resolved lazily — older hosts without it still load everything else. */
export const inject = ['slots', 'locale', 'sessions', 'commandUi', 'conversation', 'uiSession', 'uiWorkspace']

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

  const setTheme = (value: ThemeStyleValue): void => {
    void controller.set('themeStyle', value).then(() => { setStatus('applied') }).catch(() => { setStatus('unavailable') })
  }

  const setParticleColor = (value: ParticleColorValue): void => {
    void controller.set('particleColor', value).then(() => { setStatus('applied') }).catch(() => { setStatus('unavailable') })
  }

  /** Master switch; enabling also asks for notification permission inside this click gesture (a no-op in the desktop shell, which auto-grants it). */
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
      </section>

      <section className="dut-panel">
        <div className="dut-section-label">{t('sectionLayout')}</div>
        <div className="dut-field">
          <div className="dut-field-top">
            <span className="dut-label">{t('theme')}<Hint text={t('themeHint')} /></span>
            <div className="dut-controls">
              <div className="dut-seg">
                <button type="button" className={resolved.themeStyle === 'default' ? 'dut-seg-active' : ''} disabled={!writable} onClick={() => { setTheme('default') }}>{t('themeDefault')}</button>
                <button type="button" className={resolved.themeStyle === 'particles' ? 'dut-seg-active' : ''} disabled={!writable} onClick={() => { setTheme('particles') }}>{t('themeParticles')}</button>
              </div>
            </div>
          </div>
        </div>
        {resolved.themeStyle === 'particles' ? (
          <div className="dut-field">
            <div className="dut-field-top">
              <span className="dut-label">{t('particleColor')}<Hint text={t('particleColorHint')} /></span>
              <div className="dut-controls">
                <div className="dut-swatches">
                  {PARTICLE_COLORS.map(color => (
                    <button
                      key={color}
                      type="button"
                      className={'dut-sw' + (resolved.particleColor === color ? ' active' : '')}
                      disabled={!writable}
                      title={t(PARTICLE_LABEL[color])}
                      aria-label={t(PARTICLE_LABEL[color])}
                      aria-pressed={resolved.particleColor === color}
                      onClick={() => { setParticleColor(color) }}
                    ><span style={{ background: PARTICLE_SWATCH[color] }} /></button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : null}
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
            <span className="dut-label">{t('notifySystemNotification')}<Hint text={t(isDesktopShell() ? 'notifySystemNotificationHintDesktop' : 'notifySystemNotificationHint')} /></span>
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
  // The settings shell paints one hardcoded glyph per section id, so this
  // plugin's four sections would all show the generic gear; the patch swaps in
  // per-row glyphs, matching each nav row by the label registered here.
  ctx.effect(() => installSettingsNavIcons(() => ({
    'ui-tweaks': t('nav'),
    archive: t('archiveNav'),
    mcp: t('mcpNav'),
    search: t('searchNav'),
  })), 'dsh-ui-tweaks: settings nav icons')

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
  // (beside the title, AFTER the mode badge); the diff tab below takes the
  // native right sidebar. Opening the project in
  // external apps is DSH's own open-in-app header button, so this plugin no
  // longer ships one.
  ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
    name: 'conversation.session.header.actions',
    id: 'gitbar-branch',
    order: 10,
    locale: NS,
    inject: () => ({ controller }),
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

  // Diff as a native right-sidebar tab (guide entry beside 文件; picking it
  // opens the tab in the sidebar), registered only while the gitBarEnabled
  // toggle in the UI Tweaks section is on. The tab is a page type (no address
  // patterns): stage one registers the type with its guide capsule
  // (description shows while the guide lists ≤4 entries), stage two the body
  // under the type's id. The diff tab keeps its commit band. The tab registry
  // is resolved lazily: hosts predating the right sidebar simply skip this tab
  // while everything else keeps working.
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
          id: 'dsh-ui-tweaks/diff',
          kind: 'ui-tweaks-diff',
          title: () => t('diffView'),
          guide: [{ id: 'dsh-ui-tweaks/diff', order: 30, title: () => t('diffView'), description: () => t('diffGuide'), icon: DiffIcon }],
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

  // Session row "..." menu: a "删除会话" row that permanently deletes the
  // session with a two-click confirm, registered into the host's
  // `sidebar.workspaces.session.menu.item` list so it sits right after the
  // shipped pin / rename / fork / archive rows. It is the same delete the
  // Archive section performs (the host has no session-delete API), and it
  // rides the SAME `archiveManagerEnabled` switch, so the two entry points
  // come and go together.
  ctx.effect(() => {
    let disposeEntry: (() => void) | undefined
    let disposeStyles: (() => void) | undefined
    const sync = (): void => {
      const enabled = controller.getSnapshot().value?.archiveManagerEnabled === true
      if (enabled && disposeEntry === undefined) {
        disposeStyles = installSessionMenuStyles()
        // The slot is declared by ui-workspace; on a host without it the
        // callback simply never runs, and everything else keeps working.
        disposeEntry = ctx.slots.inject('sidebar.workspaces.session.menu.item', () => ctx.slots.register({
          name: 'sidebar.workspaces.session.menu.item',
          id: SESSION_DELETE_MENU_ID,
          order: SESSION_DELETE_MENU_ORDER,
          locale: NS,
          inject: () => ({ controller, sessionsService: ctx.sessions }),
        }, SessionDeleteMenuItem))
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
  }, 'dsh-ui-tweaks: session delete row')

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
          sessionStatus: ctx.uiSession.sessionStatus,
          openSession: (target) => { ctx.uiWorkspace.openSession(target) },
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
