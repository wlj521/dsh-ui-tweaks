/**
 * dsh-ui-tweaks — browser half.
 *
 * Reads and writes the `ui-tweaks` settings namespace through the same-origin
 * route served by the server half, applies the chosen font size / table style /
 * dialog width live via a runtime `<style>` element, and renders the Settings
 * panel section that edits them.
 */

import { useEffect, useState, useSyncExternalStore } from 'react'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only import activates the dsh-client-ui-settings slot declarations
// (`settings.section`) and the client-side settings scope contract.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only import activates the dsh-client-ui-conversation slot declarations
// (`conversation.input.dock`) that host the timeline rail.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { TimelineRail, installTimelineStyles } from './timeline.tsx'
import { GitBar, installGitBarStyles } from './gitbar.tsx'
import { ArchiveSection, installArchiveStyles } from './archive.tsx'
import { McpSection, installMcpStyles } from './mcp.tsx'

const NS = 'ui-tweaks'
const SETTINGS_ROUTE = '/_dsh/ui-tweaks/settings'

const DEFAULT_FONT_SIZE = 16
const MIN_FONT_SIZE = 10
const MAX_FONT_SIZE = 32
/** Code font as a percentage of the message font size (81% = stock 13/16). */
const DEFAULT_CODE_FONT_SCALE = 81
const MIN_CODE_FONT_SCALE = 50
const MAX_CODE_FONT_SCALE = 150
/** 行高 base unit (px): message/block gaps, text line-height, paragraph & list margins all scale from it. */
const DEFAULT_LINE_HEIGHT = 16
const MIN_LINE_HEIGHT = 0
const MAX_LINE_HEIGHT = 64
/** Dialog width in px. Keep in sync with src/config.ts. */
const DEFAULT_DIALOG_WIDTH = 748
const MIN_DIALOG_WIDTH = 600
const MAX_DIALOG_WIDTH = 1600

interface TweaksValue {
  fontSize?: number
  /** Code font size as a percentage of the message font size (81 = stock). */
  codeFontScale?: number
  /** 行高 base unit in px; scales message/block gaps, line-height and list/paragraph margins. */
  lineHeight?: number
  tableStyle?: 'default' | 'claude'
  /** px width; legacy 'default' | 'wide' strings accepted. */
  dialogWidth?: number | 'default' | 'wide'
  /** Whether the conversation timeline rail is shown. */
  timelineEnabled?: boolean
  /** Whether the GitBar (branch / diff / commit pills) is shown. */
  gitBarEnabled?: boolean
  /** Whether the Archive manager (sidebar entry above Settings) is shown. */
  archiveManagerEnabled?: boolean
  /** Whether the MCP manager (Settings page listing MCP servers) is shown. */
  mcpManagerEnabled?: boolean
}

interface ResolvedTweaks {
  fontSize: number
  codeFontScale: number
  lineHeight: number
  tableStyle: 'default' | 'claude'
  dialogWidth: number
  timelineEnabled: boolean
  gitBarEnabled: boolean
  archiveManagerEnabled: boolean
  mcpManagerEnabled: boolean
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
  settingsIntro: 'Tune the conversation UI: message font size, markdown table style, dialog width, the timeline rail and the git bar. Changes apply live.',
  sectionText: 'Text',
  sectionContent: 'Content',
  sectionLayout: 'Layout',
  fontSize: 'Message font size',
  fontSizeHint: `Number between ${MIN_FONT_SIZE} and ${MAX_FONT_SIZE}; applies to message text, headings, tables and code.`,
  codeFontScale: 'Code font size',
  codeFontScaleHint: `Code as a percentage of the message font size; ${DEFAULT_CODE_FONT_SCALE}% is DSH's default (13px code block at 16px body), 100% matches the body size.`,
  lineHeight: 'Line spacing',
  lineHeightHint: `Base vertical spacing in px: gaps between message rows (Think ↔ tool cards) and blocks inside one reply, plus text line-height, paragraph and list margins, all scale from it; ${DEFAULT_LINE_HEIGHT} is DSH's default.`,
  tableStyle: 'Table style',
  tableStyleDefault: 'Default',
  tableStyleClaude: 'Claude Desktop',
  dialogWidth: 'Dialog width',
  dialogWidthHint: `Number between ${MIN_DIALOG_WIDTH} and ${MAX_DIALOG_WIDTH}px; 748 is DSH's default column width, larger values widen it.`,
  presetDefault: 'Default',
  presetWide: 'Wide',
  presetWideXl: 'Extra wide',
  timeline: 'Timeline',
  timelineHint: 'Show a navigation rail on the right of the message area: hover to preview user messages, click to jump to them. Off by default; turn it on to enable. Automatically hidden in short conversations.',
  timelineOn: 'On',
  timelineOff: 'Off',
  gitBar: 'Git bar',
  gitBarHint: 'Show branch / diff / commit-message pills above the input when the session is inside a git repository. Off by default; turn it on to enable. The bar auto-hides outside git repos.',
  gitBarOn: 'On',
  gitBarOff: 'Off',
  archiveManager: 'Archive manager',
  archiveManagerHint: 'Show an Archive section in the Settings dialog where archived sessions can be restored or permanently deleted. Off by default; turn it on to enable.',
  archiveManagerOn: 'On',
  archiveManagerOff: 'Off',
  mcpManager: 'MCP manager',
  mcpManagerHint: 'Show an MCP management section in the Settings dialog listing the configured MCP servers with their status and tools, and let you restart them. Off by default; turn it on to enable.',
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
  branchCreate: 'Create',
  diffTitle: 'Changes',
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
  includeFile: 'Include in commit',
  excludeFile: 'Exclude from commit',
} as const

type LocaleKey = keyof typeof en

const zh: Record<LocaleKey, string> = {
  nav: '界面调整',
  settingsTitle: '界面调整',
  settingsIntro: '调整对话界面——消息字体、表格样式、对话框宽度、时间线与 Git 状态栏，修改即时生效。',
  sectionText: '文本',
  sectionContent: '内容',
  sectionLayout: '布局',
  fontSize: '消息字体大小',
  fontSizeHint: `取值 ${MIN_FONT_SIZE}–${MAX_FONT_SIZE}，作用于消息正文、标题、表格与代码。`,
  codeFontScale: '代码字号',
  codeFontScaleHint: `代码相对正文字号的百分比；${DEFAULT_CODE_FONT_SCALE}% 为 DSH 默认（正文 16 时代码块 13px），100% 与正文同大。`,
  lineHeight: '行高',
  lineHeightHint: `回复区垂直间距的基准值：消息之间（如 Think ↔ 工具卡片）、回复内块之间、正文行高、段落与列表边距都按它缩放；取值 ${MIN_LINE_HEIGHT}–${MAX_LINE_HEIGHT}px，${DEFAULT_LINE_HEIGHT} 为 DSH 默认。`,
  tableStyle: '表格样式',
  tableStyleDefault: '默认',
  tableStyleClaude: 'Claude Desktop',
  dialogWidth: '对话框宽度',
  dialogWidthHint: `取值 ${MIN_DIALOG_WIDTH}–${MAX_DIALOG_WIDTH}px；748 为 DSH 默认列宽，数字越大越宽。`,
  presetDefault: '默认',
  presetWide: '稍宽',
  presetWideXl: '更宽',
  timeline: '时间线',
  timelineHint: '在消息区右侧显示导航轨：悬停预览用户消息、点击跳转。默认关闭，需手动开启；会话较短时自动隐藏。',
  timelineOn: '开启',
  timelineOff: '关闭',
  gitBar: 'Git 状态栏',
  gitBarHint: '会话在 git 仓库内时，在输入框上方显示 分支 / 差异 / 提交说明 胶囊。默认关闭，需手动开启；非 git 仓库时自动隐藏。',
  gitBarOn: '开启',
  gitBarOff: '关闭',
  archiveManager: '归档管理',
  archiveManagerHint: '在设置中显示「归档」页面：可查看、恢复或彻底删除已归档会话。默认关闭，需手动开启。',
  archiveManagerOn: '开启',
  archiveManagerOff: '关闭',
  mcpManager: 'MCP 管理',
  mcpManagerHint: '在设置中显示「MCP 管理」页面：查看已配置的 MCP 服务器及其状态与工具，并可重启。默认关闭，需手动开启。',
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
  branchCreate: '创建',
  diffTitle: '变更',
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
  includeFile: '提交包含此文件',
  excludeFile: '提交排除此文件',
}

type Translate = (key: LocaleKey) => string

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** dsh-ui-tweaks Settings copy. */
    'ui-tweaks': LocaleKey
  }
}

function resolveDialogWidth(value: TweaksValue['dialogWidth'] | undefined): number {
  if (value === 'wide') return 880
  if (typeof value === 'number') return value
  return DEFAULT_DIALOG_WIDTH
}

function resolveValue(value: TweaksValue | undefined): ResolvedTweaks {
  return {
    fontSize: typeof value?.fontSize === 'number' ? value.fontSize : DEFAULT_FONT_SIZE,
    codeFontScale: typeof value?.codeFontScale === 'number' ? value.codeFontScale : DEFAULT_CODE_FONT_SCALE,
    lineHeight: typeof value?.lineHeight === 'number' ? value.lineHeight : DEFAULT_LINE_HEIGHT,
    tableStyle: value?.tableStyle === 'claude' ? 'claude' : 'default',
    dialogWidth: resolveDialogWidth(value?.dialogWidth),
    timelineEnabled: value?.timelineEnabled ?? false,
    gitBarEnabled: value?.gitBarEnabled ?? false,
    archiveManagerEnabled: value?.archiveManagerEnabled ?? false,
    mcpManagerEnabled: value?.mcpManagerEnabled ?? false,
  }
}

/** Scale one theme px value proportionally to the chosen base size. */
function rel(base: number, fontSize: number): number {
  return Math.max(8, Math.round((base / DEFAULT_FONT_SIZE) * fontSize))
}

/** Rebuild the markdown font tokens for the chosen base size, keeping the theme faces. */
function buildFontCss(fontSize: number, lineHeight: number, codeScale: number): string {
  const cs = getComputedStyle(document.body)
  const fam = (name: string, fallback: string): string => {
    const value = cs.getPropertyValue(name).trim()
    return value.length > 0 ? value : fallback
  }
  const base = fam('--dsw-font-markdown-base-font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif')
  const code = fam('--dsw-font-markdown-code-font-family', '"SF Mono", Consolas, monospace')
  const codeBlock = fam('--dsw-font-markdown-code-block-font-family', '"SF Mono", Consolas, monospace')

  const parts: string[] = []
  // `baseLine` is the token's line-height at the 16px baseline; it scales with
  // both the chosen font size and the 行高 unit, so at the default (16) it
  // reproduces the stock rhythm exactly.
  const token = (shorthand: string, size: number, baseLine: number, family: string): void => {
    const line = Math.max(12, Math.round((baseLine / DEFAULT_FONT_SIZE) * fontSize * (lineHeight / DEFAULT_LINE_HEIGHT)))
    parts.push(`--${shorthand}:${size}px/${line}px ${family}`)
    parts.push(`--${shorthand}-font-size:${size}px`)
    parts.push(`--${shorthand}-line-height:${line}px`)
  }
  // Code fonts are a percentage of the body size (stock: code block 13px at a
  // 16px body = 81%), with inline code slightly larger and the small variant
  // slightly smaller, preserving DSH's hierarchy. At the default 81% this is
  // exactly the stock scaling; 100% makes the code block match the body.
  const codePx = (stockRatio: number): number => Math.max(8, Math.round(fontSize * stockRatio * (codeScale / DEFAULT_CODE_FONT_SCALE)))
  token('dsw-font-markdown-base', fontSize, 28, base)
  token('dsw-font-markdown-base-strong', fontSize, 28, base)
  token('dsw-font-markdown-base-italic', fontSize, 28, base)
  token('dsw-font-markdown-base-strong-italic', fontSize, 28, base)
  token('dsw-font-markdown-h1', rel(24, fontSize), 34, base)
  token('dsw-font-markdown-h2', rel(22, fontSize), 32, base)
  token('dsw-font-markdown-h3', rel(20, fontSize), 30, base)
  token('dsw-font-markdown-h4', fontSize, 28, base)
  token('dsw-font-markdown-code', codePx(14 / 16), 22, code)
  token('dsw-font-markdown-code-block', codePx(13 / 16), 22, codeBlock)
  token('dsw-font-markdown-code-block-small', codePx(12 / 16), 18, codeBlock)
  return `body{${parts.join(';')}}`
}

/**
 * Claude Desktop-ish markdown table look: light-gray rounded cell cards with
 * small gaps, no borders. Cells share the theme's inline-code background and
 * follow the message font-size setting. Alignment is left to the markdown
 * renderer, so headers and cells always match.
 */
const CLAUDE_TABLE_CSS = `
div[data-slot="conversation.chat.node"] table{
  border-collapse:separate !important;
  border-spacing:3px !important;
  width:100% !important;
  border:none !important;
  font-size:var(--dsw-font-markdown-base-font-size) !important;
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

function buildRuntimeCss(value: ResolvedTweaks): string {
  const rules: string[] = []
  rules.push(buildFontCss(value.fontSize, value.lineHeight, value.codeFontScale))
  // User-sent messages use their own fixed font-size (not the markdown tokens);
  // route them through the same base so they follow the fontSize setting too.
  // `steering` messages are sent while the agent is busy (busyEnter: steer);
  // `[data-pending-steering]` is their in-flight bubble before it becomes durable.
  rules.push(`[data-chat-flow-kind="user"] [class^="_text_"],[data-chat-flow-kind="steering"] [class^="_text_"],[data-pending-steering] [class^="_text_"]{font-size:var(--dsw-font-markdown-base-font-size) !important}`)
  // Composer input follows the same base size. The visible text is rendered by
  // the hidden-textarea + backdrop/mirror pattern: the textarea is transparent,
  // the `data-input-backdrop` paints the text you see, and `data-input-mirror`
  // drives auto-grow. All three (plus the placeholder) must share the size.
  // Only font-size is touched: line-height is part of the auto-grow/caret
  // metrics, so overriding it misplaces the caret.
  rules.push(`[data-composer-card="true"] textarea,[data-composer-card="true"] [data-input-backdrop],[data-composer-card="true"] [data-input-mirror]{font-size:var(--dsw-font-markdown-base-font-size) !important}`)
  rules.push(`[data-composer-card="true"] textarea::placeholder{font-size:var(--dsw-font-markdown-base-font-size) !important}`)
  // Markdown table cells are pinned by DSH (15px); let every table style follow
  // the fontSize setting as well.
  rules.push(`div[data-slot="conversation.chat.node"] table th,div[data-slot="conversation.chat.node"] table td{font-size:var(--dsw-font-markdown-base-font-size) !important}`)
  // Inline code is pinned by DSH to 0.875em of the surrounding text (it ignores
  // the code token); scale that em with the code-font percentage.
  if (value.codeFontScale !== DEFAULT_CODE_FONT_SCALE) {
    const em = (0.875 * (value.codeFontScale / DEFAULT_CODE_FONT_SCALE)).toFixed(3)
    rules.push(`div[data-slot="conversation.chat.node"] div[class*="_markdown_"] :not(pre)>code{font-size:${em}em !important}`)
  }
  // 行高: the base vertical rhythm of the reply area. When it differs from
  // the stock 16px, every vertical spacing scales from it proportionally:
  //  ① gaps between message rows (Think ↔ tool cards like pwsh, user ↔
  //    assistant) — the chat flow column;
  //  ② gaps between content blocks inside one assistant reply (Think ↔ text) —
  //    the Assistant Markdown block container (`Sxvs8a_body`, CSS-module
  //    hashed, stable within the pinned rc.7 conversation package);
  //  ③ the markdown typography rhythm: paragraphs (`p` has a stock `margin:
  //    16px 0` that must be overridden on both axes, not just bottom, or it
  //    can never tighten below 16), list margins, list-item gaps (stock 6px),
  //    paragraphs inside list items (stock 8px), code blocks, headings and
  //    rules — all scaled from the 行高 unit.
  // Text line-height itself scales in buildFontCss above.
  if (value.lineHeight !== DEFAULT_LINE_HEIGHT) {
    const n = value.lineHeight
    const md = `div[data-slot="conversation.chat.node"] div[class*="_markdown_"]`
    const liGap = Math.max(2, Math.round((6 * n) / DEFAULT_LINE_HEIGHT))
    const liPGap = Math.max(2, Math.round((8 * n) / DEFAULT_LINE_HEIGHT))
    rules.push(`div[data-slot="conversation.view"] .Md3f7G_column{gap:${n}px !important}`)
    rules.push(`div[data-slot="conversation.chat.node"] .Sxvs8a_body{gap:${n}px !important}`)
    rules.push(`${md} p{margin:${n}px 0 !important}`)
    rules.push(`${md} ul,${md} ol{margin:${n}px 0 !important}`)
    rules.push(`${md} pre{margin:${n}px 0 !important}`)
    // Code blocks: the pre's inner vertical padding is stock 16px (shiki
    // default); scale it so the block's own height follows 行高 too. Only
    // top/bottom is touched, horizontal padding stays as the theme sets it.
    const codePad = Math.max(4, Math.round((16 * n) / DEFAULT_LINE_HEIGHT))
    rules.push(`${md} pre{padding-top:${codePad}px !important;padding-bottom:${codePad}px !important}`)
    // Table cells: vertical cell padding is stock 10px. Scale it for the
    // default table style; the Claude preset keeps its own compact 7px cell
    // padding (that look is the point of the preset).
    if (value.tableStyle !== 'claude') {
      const cellPad = Math.max(2, Math.round((10 * n) / DEFAULT_LINE_HEIGHT))
      rules.push(`${md} table th,${md} table td{padding-top:${cellPad}px !important;padding-bottom:${cellPad}px !important}`)
    }
    rules.push(`${md} li:not(:first-child){margin-top:${liGap}px !important}`)
    rules.push(`${md} li>p{margin:${liPGap}px 0 !important}`)
    rules.push(`${md} h1,${md} h2,${md} h3{margin:${2 * n}px 0 ${n}px !important}`)
    rules.push(`${md} h4,${md} h5,${md} h6{margin:${n}px 0 !important}`)
    rules.push(`${md} hr{margin:${2 * n}px 0 !important}`)
    rules.push(`${md} blockquote{margin:${n}px 0 0 !important}`)
    // Keep DSH's flush edges: the first/last block of a reply has zero outer
    // margin (stock `>*:first-child` / `>*:last-child`), so a message starts
    // and ends tight and the spacing to the next node stays the column gap.
    rules.push(`${md} > :first-child{margin-top:0 !important}`)
    rules.push(`${md} > :last-child{margin-bottom:0 !important}`)
  }
  if (value.dialogWidth !== DEFAULT_DIALOG_WIDTH) {
    const width = value.dialogWidth
    rules.push(`[data-chat-flow]{max-width:${width}px !important}`)
    // The composer card carries the same column + 32px padding (748→780);
    // widen it through its stable data attribute so the input bar matches.
    rules.push(`[data-composer-card="true"]{max-width:${width + 32}px !important}`)
    // The conversation stats line under the composer (conversation.composer.dock)
    // keeps its own 748px column; widen it together with the dialog.
    rules.push(`[data-slot="conversation.composer.dock"] > div{max-width:${width + 32}px !important}`)
    // The GitBar pill row (conversation.input.dock) sits inside the composer's
    // tool row (roughly between the "+" button's right and the send button's
    // left): composer +32px padding minus ~74px of tool-row chrome each side.
    rules.push(`[data-slot-plugin="dsh-ui-tweaks-gitbar"]{max-width:${width - 42}px !important}`)
    rules.push(`:root{--dsh-composer-card-max-width:${width + 32}px}`)
  }
  if (value.tableStyle === 'claude') {
    rules.push(CLAUDE_TABLE_CSS)
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
.dut-settings{display:grid;gap:12px;max-width:680px;padding:6px 2px 36px;color:var(--dsw-alias-label-primary)}
.dut-settings-header{display:flex;align-items:flex-start;gap:12px;padding:6px 2px 2px}
.dut-logo{flex:none;display:grid;place-items:center;width:38px;height:38px;border-radius:11px;border:1px solid var(--dsw-alias-border-l1);background:linear-gradient(135deg,color-mix(in srgb,var(--dsw-alias-state-business-primary) 16%,transparent),transparent);font-size:18px;line-height:1}
.dut-settings-header h2{font-size:19px;letter-spacing:-.01em;margin:2px 0 4px}
.dut-settings-header p{max-width:600px;margin:0;color:var(--dsw-alias-label-secondary);font-size:12.5px;line-height:1.55}
.dut-panel{display:grid;gap:0;border:1px solid var(--dsw-alias-border-l1);border-radius:14px;background:var(--dsw-alias-bg-layer-1);box-shadow:var(--dsw-shadow-lv1);overflow:hidden}
.dut-section-label{font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--dsw-alias-label-tertiary);padding:14px 16px 6px}
.dut-field{display:grid;gap:8px;padding:8px 16px 14px}
.dut-field+.dut-field{border-top:1px solid var(--dsw-alias-border-l1)}
.dut-field-top{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
.dut-field-top>span{font-size:13.5px;font-weight:600}
.dut-field small{font-size:11.5px;line-height:1.5;color:var(--dsw-alias-label-secondary)}
.dut-controls{display:flex;align-items:center;gap:8px}
.dut-stepper{display:inline-flex;align-items:center;border:1px solid var(--dsw-alias-border-l1);border-radius:9px;background:var(--dsw-alias-bg-layer-2);overflow:hidden}
.dut-stepper button{width:30px;height:32px;border:none;background:transparent;color:inherit;font-size:15px;font-weight:500;line-height:1;cursor:pointer;display:grid;place-items:center;transition:background .15s ease}
.dut-stepper button:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.dut-stepper button:disabled{opacity:.35;cursor:default}
.dut-stepper input{box-sizing:border-box;width:64px;height:32px;border:none;border-left:1px solid var(--dsw-alias-border-l1);border-right:1px solid var(--dsw-alias-border-l1);background:transparent;color:inherit;font:inherit;font-size:13px;text-align:center;-moz-appearance:textfield}
.dut-stepper input::-webkit-outer-spin-button,.dut-stepper input::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
.dut-stepper input:focus{outline:none}
.dut-seg{display:inline-flex;padding:3px;gap:3px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-2)}
.dut-seg button{border:none;border-radius:7px;padding:5px 12px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12.5px;cursor:pointer;transition:background .15s ease,color .15s ease}
.dut-seg button:hover:not(:disabled){color:var(--dsw-alias-label-primary)}
.dut-seg button.dut-seg-active{background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 12%,transparent);color:var(--dsw-alias-state-business-primary);font-weight:600;box-shadow:none}
.dut-seg button.dut-seg-active:hover:not(:disabled){color:var(--dsw-alias-state-business-primary)}
.dut-seg button:disabled{opacity:.45;cursor:default}
/* The selected Settings-section tab — the stock shell paints a barely-there
   grey; brand-tint it so the selection reads clearly (and in the README shot). */
[role="dialog"] nav button[aria-selected="true"],[role="dialog"] nav button[aria-current="true"]{background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 12%,transparent);color:var(--dsw-alias-state-business-primary);font-weight:600}
.dut-presets{display:inline-flex;flex-wrap:wrap;margin-top:2px}
.dut-btn{display:inline-flex;align-items:center;height:26px;padding:0 12px;border-radius:999px;border:1px solid var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11.5px;cursor:pointer;transition:background .15s ease,color .15s ease,border-color .15s ease}
.dut-btn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dut-btn.dut-btn-active{background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 12%,transparent);border-color:color-mix(in srgb,var(--dsw-alias-state-business-primary) 45%,transparent);color:var(--dsw-alias-state-business-primary)}
.dut-btn.dut-btn-active:hover{background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 18%,transparent);color:var(--dsw-alias-state-business-primary)}
.dut-btn:disabled{opacity:.4;cursor:default}
.dut-status{justify-self:start;font-size:11.5px;padding:3px 10px;border-radius:999px;background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 12%,transparent);color:var(--dsw-alias-state-success-primary);animation:dut-fadein .18s ease}
@keyframes dut-fadein{from{opacity:0;transform:translateY(-2px)}to{opacity:1;transform:none}}
.dut-loading{padding:24px;border-radius:12px;background:var(--dsw-alias-bg-layer-2);font-size:12px;color:var(--dsw-alias-label-secondary)}
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

async function apiRequest<T>(init?: RequestInit): Promise<T> {
  const response = await fetch(SETTINGS_ROUTE, { credentials: 'same-origin', ...init })
  const body = await response.json() as ApiSuccess<T> | ApiFailure
  if (!response.ok || !body.ok) {
    const failure = body as ApiFailure
    throw new Error(failure.error?.message ?? `UI Tweaks request failed with HTTP ${response.status}`)
  }
  return body.value
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

/** Required client services: slots (settings.section), locale, and sessions (timeline rail). */
export const inject = ['slots', 'locale', 'sessions']

type SettingsSectionProps = PropsRuntime<'settings.section'> & {
  controller: SettingsClient
  t: Translate
}

function SettingsSection({ controller, t }: SettingsSectionProps) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot)
  const resolved = resolveValue(state.value)
  const writable = state.writable
  const [draft, setDraft] = useState<string>(String(resolved.fontSize))
  const [codeDraft, setCodeDraft] = useState<string>(String(resolved.codeFontScale))
  const [lineHeightDraft, setLineHeightDraft] = useState<string>(String(resolved.lineHeight))
  const [widthDraft, setWidthDraft] = useState<string>(String(resolved.dialogWidth))
  const [status, setStatus] = useState<LocaleKey | undefined>(undefined)

  useEffect(() => { if (state.status === 'loading' && state.value === undefined) void controller.load() }, [controller, state.status, state.value])
  useEffect(() => { setDraft(String(resolved.fontSize)) }, [resolved.fontSize])
  useEffect(() => { setCodeDraft(String(resolved.codeFontScale)) }, [resolved.codeFontScale])
  useEffect(() => { setLineHeightDraft(String(resolved.lineHeight)) }, [resolved.lineHeight])
  useEffect(() => { setWidthDraft(String(resolved.dialogWidth)) }, [resolved.dialogWidth])
  useEffect(() => {
    if (status === undefined) return
    const timer = setTimeout(() => { setStatus(undefined) }, 1800)
    return () => { clearTimeout(timer) }
  }, [status])

  const commitFontSize = (raw: string): void => {
    setDraft(raw)
    const parsed = Number(raw)
    if (!Number.isFinite(parsed)) return
    const clamped = Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(parsed)))
    setDraft(String(clamped))
    void controller.set('fontSize', clamped).then(() => { setStatus('applied') }).catch(() => { setStatus('unavailable') })
  }

  const commitLineHeight = (raw: string): void => {
    setLineHeightDraft(raw)
    const parsed = Number(raw)
    if (!Number.isFinite(parsed)) return
    const clamped = Math.min(MAX_LINE_HEIGHT, Math.max(MIN_LINE_HEIGHT, Math.round(parsed)))
    setLineHeightDraft(String(clamped))
    void controller.set('lineHeight', clamped).then(() => { setStatus('applied') }).catch(() => { setStatus('unavailable') })
  }

  const commitCodeScale = (raw: string): void => {
    setCodeDraft(raw)
    const parsed = Number(raw)
    if (!Number.isFinite(parsed)) return
    const clamped = Math.min(MAX_CODE_FONT_SCALE, Math.max(MIN_CODE_FONT_SCALE, Math.round(parsed)))
    setCodeDraft(String(clamped))
    void controller.set('codeFontScale', clamped).then(() => { setStatus('applied') }).catch(() => { setStatus('unavailable') })
  }

  const pickTableStyle = (raw: string): void => {
    void controller.set('tableStyle', raw === 'claude' ? 'claude' : 'default').then(() => { setStatus('applied') }).catch(() => { setStatus('unavailable') })
  }

  const commitDialogWidth = (raw: string): void => {
    setWidthDraft(raw)
    const parsed = Number(raw)
    if (!Number.isFinite(parsed)) return
    const clamped = Math.min(MAX_DIALOG_WIDTH, Math.max(MIN_DIALOG_WIDTH, Math.round(parsed)))
    setWidthDraft(String(clamped))
    void controller.set('dialogWidth', clamped).then(() => { setStatus('applied') }).catch(() => { setStatus('unavailable') })
  }

  const stepFontSize = (delta: number): void => {
    const next = Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, resolved.fontSize + delta))
    setDraft(String(next))
    void controller.set('fontSize', next).then(() => { setStatus('applied') }).catch(() => { setStatus('unavailable') })
  }

  const stepLineHeight = (delta: number): void => {
    const next = Math.min(MAX_LINE_HEIGHT, Math.max(MIN_LINE_HEIGHT, resolved.lineHeight + delta))
    setLineHeightDraft(String(next))
    void controller.set('lineHeight', next).then(() => { setStatus('applied') }).catch(() => { setStatus('unavailable') })
  }

  const stepCodeScale = (delta: number): void => {
    const next = Math.min(MAX_CODE_FONT_SCALE, Math.max(MIN_CODE_FONT_SCALE, resolved.codeFontScale + delta))
    setCodeDraft(String(next))
    void controller.set('codeFontScale', next).then(() => { setStatus('applied') }).catch(() => { setStatus('unavailable') })
  }

  const stepDialogWidth = (delta: number): void => {
    const next = Math.min(MAX_DIALOG_WIDTH, Math.max(MIN_DIALOG_WIDTH, resolved.dialogWidth + delta))
    setWidthDraft(String(next))
    void controller.set('dialogWidth', next).then(() => { setStatus('applied') }).catch(() => { setStatus('unavailable') })
  }

  const applyWidthPreset = (width: number): void => {
    setWidthDraft(String(width))
    void controller.set('dialogWidth', width).then(() => { setStatus('applied') }).catch(() => { setStatus('unavailable') })
  }

  const setTimeline = (value: boolean): void => {
    void controller.set('timelineEnabled', value).then(() => { setStatus('applied') }).catch(() => { setStatus('unavailable') })
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

  const reset = (field: 'fontSize' | 'codeFontScale' | 'lineHeight' | 'tableStyle' | 'dialogWidth' | 'timelineEnabled' | 'gitBarEnabled' | 'archiveManagerEnabled' | 'mcpManagerEnabled'): void => {
    void controller.unset(field).then(() => { setStatus('resetDone') }).catch(() => { setStatus('unavailable') })
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
            <span>{t('fontSize')}</span>
            <div className="dut-controls">
              <div className="dut-stepper">
                <button type="button" aria-label="−" disabled={!writable || resolved.fontSize <= MIN_FONT_SIZE} onClick={() => { stepFontSize(-1) }}>−</button>
                <input
                  type="number"
                  min={MIN_FONT_SIZE}
                  max={MAX_FONT_SIZE}
                  step={1}
                  value={draft}
                  disabled={!writable}
                  onChange={(event) => { setDraft(event.target.value) }}
                  onBlur={(event) => { commitFontSize(event.target.value) }}
                  onKeyDown={(event) => { if (event.key === 'Enter') commitFontSize((event.target as HTMLInputElement).value) }}
                />
                <button type="button" aria-label="+" disabled={!writable || resolved.fontSize >= MAX_FONT_SIZE} onClick={() => { stepFontSize(1) }}>+</button>
              </div>
              <button type="button" className={'dut-btn' + (resolved.fontSize === DEFAULT_FONT_SIZE ? ' dut-btn-active' : '')} disabled={!writable} onClick={() => { reset('fontSize') }}>{t('defaultAction')}</button>
            </div>
          </div>
          <small>{t('fontSizeHint')}</small>
        </div>
        <div className="dut-field">
          <div className="dut-field-top">
            <span>{t('lineHeight')}</span>
            <div className="dut-controls">
              <div className="dut-stepper">
                <button type="button" aria-label="−" disabled={!writable || resolved.lineHeight <= MIN_LINE_HEIGHT} onClick={() => { stepLineHeight(-2) }}>−</button>
                <input
                  type="number"
                  min={MIN_LINE_HEIGHT}
                  max={MAX_LINE_HEIGHT}
                  step={2}
                  value={lineHeightDraft}
                  disabled={!writable}
                  onChange={(event) => { setLineHeightDraft(event.target.value) }}
                  onBlur={(event) => { commitLineHeight(event.target.value) }}
                  onKeyDown={(event) => { if (event.key === 'Enter') commitLineHeight((event.target as HTMLInputElement).value) }}
                />
                <button type="button" aria-label="+" disabled={!writable || resolved.lineHeight >= MAX_LINE_HEIGHT} onClick={() => { stepLineHeight(2) }}>+</button>
              </div>
              <button type="button" className={'dut-btn' + (resolved.lineHeight === DEFAULT_LINE_HEIGHT ? ' dut-btn-active' : '')} disabled={!writable} onClick={() => { reset('lineHeight') }}>{t('defaultAction')}</button>
            </div>
          </div>
          <small>{t('lineHeightHint')}</small>
        </div>
        <div className="dut-field">
          <div className="dut-field-top">
            <span>{t('codeFontScale')}</span>
            <div className="dut-controls">
              <div className="dut-stepper">
                <button type="button" aria-label="−" disabled={!writable || resolved.codeFontScale <= MIN_CODE_FONT_SCALE} onClick={() => { stepCodeScale(-1) }}>−</button>
                <input
                  type="number"
                  min={MIN_CODE_FONT_SCALE}
                  max={MAX_CODE_FONT_SCALE}
                  step={1}
                  value={codeDraft}
                  disabled={!writable}
                  onChange={(event) => { setCodeDraft(event.target.value) }}
                  onBlur={(event) => { commitCodeScale(event.target.value) }}
                  onKeyDown={(event) => { if (event.key === 'Enter') commitCodeScale((event.target as HTMLInputElement).value) }}
                />
                <button type="button" aria-label="+" disabled={!writable || resolved.codeFontScale >= MAX_CODE_FONT_SCALE} onClick={() => { stepCodeScale(1) }}>+</button>
              </div>
              <button type="button" className={'dut-btn' + (resolved.codeFontScale === DEFAULT_CODE_FONT_SCALE ? ' dut-btn-active' : '')} disabled={!writable} onClick={() => { reset('codeFontScale') }}>{t('defaultAction')}</button>
            </div>
          </div>
          <small>{t('codeFontScaleHint')}</small>
        </div>
      </section>

      <section className="dut-panel">
        <div className="dut-section-label">{t('sectionContent')}</div>
        <div className="dut-field">
          <div className="dut-field-top">
            <span>{t('tableStyle')}</span>
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
            <span>{t('dialogWidth')}</span>
            <div className="dut-controls">
              <div className="dut-stepper">
                <button type="button" aria-label="−" disabled={!writable || resolved.dialogWidth <= MIN_DIALOG_WIDTH} onClick={() => { stepDialogWidth(-20) }}>−</button>
                <input
                  type="number"
                  min={MIN_DIALOG_WIDTH}
                  max={MAX_DIALOG_WIDTH}
                  step={20}
                  value={widthDraft}
                  disabled={!writable}
                  onChange={(event) => { setWidthDraft(event.target.value) }}
                  onBlur={(event) => { commitDialogWidth(event.target.value) }}
                  onKeyDown={(event) => { if (event.key === 'Enter') commitDialogWidth((event.target as HTMLInputElement).value) }}
                />
                <button type="button" aria-label="+" disabled={!writable || resolved.dialogWidth >= MAX_DIALOG_WIDTH} onClick={() => { stepDialogWidth(20) }}>+</button>
              </div>
            </div>
          </div>
          <div className="dut-presets">
            <div className="dut-seg">
              <button type="button" className={resolved.dialogWidth === 880 ? 'dut-seg-active' : ''} disabled={!writable} onClick={() => { applyWidthPreset(880) }}>{t('presetWide')} · 880</button>
              <button type="button" className={resolved.dialogWidth === 1024 ? 'dut-seg-active' : ''} disabled={!writable} onClick={() => { applyWidthPreset(1024) }}>{t('presetWideXl')} · 1024</button>
              <button type="button" className={resolved.dialogWidth === 748 ? 'dut-seg-active' : ''} disabled={!writable} onClick={() => { applyWidthPreset(748) }}>{t('presetDefault')} · 748</button>
            </div>
          </div>
          <small>{t('dialogWidthHint')}</small>
        </div>
        <div className="dut-field">
          <div className="dut-field-top">
            <span>{t('timeline')}</span>
            <div className="dut-controls">
              <div className="dut-seg">
                <button type="button" className={resolved.timelineEnabled ? 'dut-seg-active' : ''} disabled={!writable} onClick={() => { setTimeline(true) }}>{t('timelineOn')}</button>
                <button type="button" className={!resolved.timelineEnabled ? 'dut-seg-active' : ''} disabled={!writable} onClick={() => { setTimeline(false) }}>{t('timelineOff')}</button>
              </div>
            </div>
          </div>
          <small>{t('timelineHint')}</small>
        </div>
        <div className="dut-field">
          <div className="dut-field-top">
            <span>{t('gitBar')}</span>
            <div className="dut-controls">
              <div className="dut-seg">
                <button type="button" className={resolved.gitBarEnabled ? 'dut-seg-active' : ''} disabled={!writable} onClick={() => { setGitBar(true) }}>{t('gitBarOn')}</button>
                <button type="button" className={!resolved.gitBarEnabled ? 'dut-seg-active' : ''} disabled={!writable} onClick={() => { setGitBar(false) }}>{t('gitBarOff')}</button>
              </div>
            </div>
          </div>
          <small>{t('gitBarHint')}</small>
        </div>
        <div className="dut-field">
          <div className="dut-field-top">
            <span>{t('archiveManager')}</span>
            <div className="dut-controls">
              <div className="dut-seg">
                <button type="button" className={resolved.archiveManagerEnabled ? 'dut-seg-active' : ''} disabled={!writable} onClick={() => { setArchiveManager(true) }}>{t('archiveManagerOn')}</button>
                <button type="button" className={!resolved.archiveManagerEnabled ? 'dut-seg-active' : ''} disabled={!writable} onClick={() => { setArchiveManager(false) }}>{t('archiveManagerOff')}</button>
              </div>
            </div>
          </div>
          <small>{t('archiveManagerHint')}</small>
        </div>
        <div className="dut-field">
          <div className="dut-field-top">
            <span>{t('mcpManager')}</span>
            <div className="dut-controls">
              <div className="dut-seg">
                <button type="button" className={resolved.mcpManagerEnabled ? 'dut-seg-active' : ''} disabled={!writable} onClick={() => { setMcpManager(true) }}>{t('mcpManagerOn')}</button>
                <button type="button" className={!resolved.mcpManagerEnabled ? 'dut-seg-active' : ''} disabled={!writable} onClick={() => { setMcpManager(false) }}>{t('mcpManagerOff')}</button>
              </div>
            </div>
          </div>
          <small>{t('mcpManagerHint')}</small>
        </div>
      </section>
    </div>
  )
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
  ctx.effect(installTimelineStyles, 'dsh-ui-tweaks: timeline styles')
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

  // Conversation timeline rail: mounted per session, reads `timelineEnabled`
  // off the same settings store so toggling the switch applies live.
  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock',
    id: NS,
    order: 40,
    locale: NS,
    inject: () => ({ controller, sessionsService: ctx.sessions }),
  }, TimelineRail))

  // GitBar: branch / diff / commit-message pills above the composer, mounted
  // in the same dock row (renders null for non-git sessions).
  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock',
    id: 'gitbar',
    order: 30,
    locale: NS,
    inject: () => ({ controller, sessionsService: ctx.sessions }),
  }, GitBar))

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
}
