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

const NS = 'ui-tweaks'
const SETTINGS_ROUTE = '/_dsh/ui-tweaks/settings'

const DEFAULT_FONT_SIZE = 16
const MIN_FONT_SIZE = 10
const MAX_FONT_SIZE = 32
/** Dialog width in px. Keep in sync with src/config.ts. */
const DEFAULT_DIALOG_WIDTH = 748
const MIN_DIALOG_WIDTH = 600
const MAX_DIALOG_WIDTH = 1600

interface TweaksValue {
  fontSize?: number
  tableStyle?: 'default' | 'claude'
  /** px width; legacy 'default' | 'wide' strings accepted. */
  dialogWidth?: number | 'default' | 'wide'
  /** Whether the conversation timeline rail is shown. */
  timelineEnabled?: boolean
  /** Whether the GitBar (branch / diff / commit pills) is shown. */
  gitBarEnabled?: boolean
}

interface ResolvedTweaks {
  fontSize: number
  tableStyle: 'default' | 'claude'
  dialogWidth: number
  timelineEnabled: boolean
  gitBarEnabled: boolean
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
  tableStyle: 'Table style',
  tableStyleDefault: 'Default',
  tableStyleClaude: 'Claude Desktop',
  dialogWidth: 'Dialog width',
  dialogWidthHint: `Number between ${MIN_DIALOG_WIDTH} and ${MAX_DIALOG_WIDTH}px; 748 is DSH's default column width, larger values widen it.`,
  presetDefault: 'Default',
  presetWide: 'Wide',
  presetWideXl: 'Extra wide',
  timeline: 'Timeline',
  timelineHint: 'Show a navigation rail on the right of the message area: hover to preview user messages, click to jump to them. Off by default; automatically hidden in short conversations.',
  timelineOn: 'On',
  timelineDefault: 'Default',
  gitBar: 'Git bar',
  gitBarHint: 'Show branch / diff / commit-message pills above the input when the session is inside a git repository. On by default; the bar auto-hides outside git repos.',
  gitBarOn: 'On',
  gitBarOff: 'Off',
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
  commitPlaceholder: 'Describe your changes…\nLeave empty to auto-generate',
  commitHint: 'Committing stages the checked files (untracked included) and commits; unchecked files are excluded from this commit. “Commit & push” also pushes; a new branch gets an -u upstream.',
  commitWillCommit: 'To commit',
  commitViewDiff: 'View',
  commitGenerate: '✨ Generate',
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
  tableStyle: '表格样式',
  tableStyleDefault: '默认',
  tableStyleClaude: 'Claude Desktop',
  dialogWidth: '对话框宽度',
  dialogWidthHint: `取值 ${MIN_DIALOG_WIDTH}–${MAX_DIALOG_WIDTH}px；748 为 DSH 默认列宽，数字越大越宽。`,
  presetDefault: '默认',
  presetWide: '稍宽',
  presetWideXl: '更宽',
  timeline: '时间线',
  timelineHint: '在消息区右侧显示导航轨：悬停预览用户消息、点击跳转。默认关闭，会话较短时自动隐藏。',
  timelineOn: '开启',
  timelineDefault: '默认',
  gitBar: 'Git 状态栏',
  gitBarHint: '会话在 git 仓库内时，在输入框上方显示 分支 / 差异 / 提交说明 胶囊。默认开启；非 git 仓库时自动隐藏。',
  gitBarOn: '开启',
  gitBarOff: '关闭',
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
  commitPlaceholder: '描述你的改动…\n留空点「提交」将根据改动内容自动生成',
  commitHint: '提交会暂存勾选的文件（含未跟踪新文件）；取消勾选的文件将不包含在本次提交中。「提交并推送」提交后自动 push，新分支自动 -u 设上游。',
  commitWillCommit: '将提交',
  commitViewDiff: '查看',
  commitGenerate: '✨ 生成',
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
    tableStyle: value?.tableStyle === 'claude' ? 'claude' : 'default',
    dialogWidth: resolveDialogWidth(value?.dialogWidth),
    timelineEnabled: value?.timelineEnabled ?? false,
    gitBarEnabled: value?.gitBarEnabled ?? true,
  }
}

/** Scale one theme px value proportionally to the chosen base size. */
function rel(base: number, fontSize: number): number {
  return Math.max(8, Math.round((base / DEFAULT_FONT_SIZE) * fontSize))
}

/** Rebuild the markdown font tokens for the chosen base size, keeping the theme faces. */
function buildFontCss(fontSize: number): string {
  const cs = getComputedStyle(document.body)
  const fam = (name: string, fallback: string): string => {
    const value = cs.getPropertyValue(name).trim()
    return value.length > 0 ? value : fallback
  }
  const base = fam('--dsw-font-markdown-base-font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif')
  const code = fam('--dsw-font-markdown-code-font-family', '"SF Mono", Consolas, monospace')
  const codeBlock = fam('--dsw-font-markdown-code-block-font-family', '"SF Mono", Consolas, monospace')

  const parts: string[] = []
  const token = (shorthand: string, size: number, line: number, family: string): void => {
    parts.push(`--${shorthand}:${size}px/${line}px ${family}`)
    parts.push(`--${shorthand}-font-size:${size}px`)
    parts.push(`--${shorthand}-line-height:${line}px`)
  }
  token('dsw-font-markdown-base', fontSize, rel(28, fontSize), base)
  token('dsw-font-markdown-base-strong', fontSize, rel(28, fontSize), base)
  token('dsw-font-markdown-base-italic', fontSize, rel(28, fontSize), base)
  token('dsw-font-markdown-base-strong-italic', fontSize, rel(28, fontSize), base)
  token('dsw-font-markdown-h1', rel(24, fontSize), rel(34, fontSize), base)
  token('dsw-font-markdown-h2', rel(22, fontSize), rel(32, fontSize), base)
  token('dsw-font-markdown-h3', rel(20, fontSize), rel(30, fontSize), base)
  token('dsw-font-markdown-h4', fontSize, rel(28, fontSize), base)
  token('dsw-font-markdown-code', rel(14, fontSize), rel(22, fontSize), code)
  token('dsw-font-markdown-code-block', rel(13, fontSize), rel(22, fontSize), codeBlock)
  token('dsw-font-markdown-code-block-small', rel(12, fontSize), rel(18, fontSize), codeBlock)
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
  rules.push(buildFontCss(value.fontSize))
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
  const [widthDraft, setWidthDraft] = useState<string>(String(resolved.dialogWidth))
  const [status, setStatus] = useState<LocaleKey | undefined>(undefined)

  useEffect(() => { if (state.status === 'loading' && state.value === undefined) void controller.load() }, [controller, state.status, state.value])
  useEffect(() => { setDraft(String(resolved.fontSize)) }, [resolved.fontSize])
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

  const reset = (field: 'fontSize' | 'tableStyle' | 'dialogWidth' | 'timelineEnabled' | 'gitBarEnabled'): void => {
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
                <button type="button" className={!resolved.timelineEnabled ? 'dut-seg-active' : ''} disabled={!writable} onClick={() => { setTimeline(false) }}>{t('timelineDefault')}</button>
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
      </section>
    </div>
  )
}

export function apply(ctx: ClientContext): void {
  ctx.effect(installBaseStyles, 'dsh-ui-tweaks: base styles')
  ctx.effect(installTimelineStyles, 'dsh-ui-tweaks: timeline styles')
  ctx.effect(installGitBarStyles, 'dsh-ui-tweaks: gitbar styles')
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
}
