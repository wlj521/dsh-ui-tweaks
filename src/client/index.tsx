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
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'

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
}

interface ResolvedTweaks {
  fontSize: number
  tableStyle: 'default' | 'claude'
  dialogWidth: number
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
  settingsIntro: 'Tune the conversation UI: message font size (px), markdown table style, and dialog width. Changes apply live.',
  fontSize: 'Message font size (px)',
  fontSizeHint: `Number between ${MIN_FONT_SIZE} and ${MAX_FONT_SIZE}; applies to message text, headings, tables and code.`,
  tableStyle: 'Table style',
  tableStyleDefault: 'Default',
  tableStyleClaude: 'Claude Desktop',
  dialogWidth: 'Dialog width (px)',
  dialogWidthHint: `Number between ${MIN_DIALOG_WIDTH} and ${MAX_DIALOG_WIDTH}; 748 is the default column, 880 was the previous "Wider" preset.`,
  reset: 'Reset',
  resetDone: 'Reset to default.',
  applied: 'Applied',
  unavailable: 'Settings unavailable.',
  loading: 'Loading…',
  readOnly: 'The active Settings provider is read-only.',
  saved: 'Saved.',
} as const

type LocaleKey = keyof typeof en

const zh: Record<LocaleKey, string> = {
  nav: '界面调整',
  settingsTitle: '界面调整',
  settingsIntro: '调整对话界面：消息字体大小（像素）、Markdown 表格样式、对话框宽度。修改即时生效。',
  fontSize: '消息字体大小（px）',
  fontSizeHint: `取值 ${MIN_FONT_SIZE}–${MAX_FONT_SIZE}，作用于消息正文、标题、表格与代码。`,
  tableStyle: '表格样式',
  tableStyleDefault: '默认',
  tableStyleClaude: 'Claude Desktop',
  dialogWidth: '对话框宽度（px）',
  dialogWidthHint: `取值 ${MIN_DIALOG_WIDTH}–${MAX_DIALOG_WIDTH}；748 为默认列宽，880 为原"稍宽"预设。`,
  reset: '重置',
  resetDone: '已重置为默认。',
  applied: '已应用',
  unavailable: '设置暂不可用。',
  loading: '加载中…',
  readOnly: '当前设置提供方为只读。',
  saved: '已保存。',
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
 * small gaps, no borders. Backgrounds are theme-aware (label-primary tinted),
 * so light and dark modes both stay legible.
 */
const CLAUDE_TABLE_CSS = `
div[data-slot="conversation.chat.node"] table{
  border-collapse:separate !important;
  border-spacing:3px !important;
  width:100% !important;
  border:none !important;
}
div[data-slot="conversation.chat.node"] table thead th{
  background:color-mix(in srgb,var(--dsw-alias-label-primary) 6%,transparent) !important;
  color:inherit !important;
  font-weight:600 !important;
  text-align:left !important;
  padding:7px 10px !important;
  border:none !important;
  border-radius:6px !important;
}
div[data-slot="conversation.chat.node"] table tbody td{
  background:color-mix(in srgb,var(--dsw-alias-label-primary) 4%,transparent) !important;
  color:inherit !important;
  padding:7px 10px !important;
  vertical-align:top !important;
  border:none !important;
  border-radius:6px !important;
}
`

function buildRuntimeCss(value: ResolvedTweaks): string {
  const rules: string[] = []
  rules.push(buildFontCss(value.fontSize))
  if (value.dialogWidth !== DEFAULT_DIALOG_WIDTH) {
    const width = value.dialogWidth
    rules.push(`[data-chat-flow]{max-width:${width}px !important}`)
    // The composer card carries the same column + 32px padding (748→780);
    // widen it through its stable data attribute so the input bar matches.
    rules.push(`[data-composer-card="true"]{max-width:${width + 32}px !important}`)
    // The conversation stats line under the composer (conversation.composer.dock)
    // keeps its own 748px column; widen it together with the dialog.
    rules.push(`[data-slot="conversation.composer.dock"] > div{max-width:${width + 32}px !important}`)
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
.dut-settings{display:grid;gap:14px;max-width:720px;padding:8px 2px 32px;color:var(--dsw-alias-label-primary)}
.dut-settings-header{padding:8px 2px}
.dut-settings-header h2{font-size:22px;letter-spacing:-.02em;margin:3px 0 6px}
.dut-settings-header p{max-width:620px;margin:0;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:1.55}
.dut-panel{display:grid;gap:14px;padding:15px;border:1px solid var(--dsw-alias-border-l1);border-radius:14px;background:var(--dsw-alias-bg-layer-1);box-shadow:var(--dsw-shadow-lv1)}
.dut-field{display:grid;gap:7px}
.dut-field>span{font-size:13px;font-weight:600}
.dut-field small{font-size:11px;line-height:1.45;color:var(--dsw-alias-label-secondary)}
.dut-row{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
.dut-controls{display:flex;align-items:center;gap:8px}
.dut-input{box-sizing:border-box;height:32px;padding:0 10px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);color:inherit;font:inherit;font-size:13px;width:110px}
.dut-input:focus{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}
.dut-select{box-sizing:border-box;height:32px;padding:0 8px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);color:inherit;font:inherit;font-size:13px}
.dut-btn{display:inline-flex;align-items:center;height:30px;padding:0 12px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);background:transparent;color:inherit;font:inherit;font-size:12px;cursor:pointer}
.dut-btn:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dut-btn:disabled{opacity:.45;cursor:default}
.dut-status{font-size:11px;color:var(--dsw-alias-state-success-primary)}
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
class SettingsClient {
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

/** Required client services: slots (settings.section) and locale. */
export const inject = ['slots', 'locale']

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

  const reset = (field: 'fontSize' | 'tableStyle' | 'dialogWidth'): void => {
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
        <h2>{t('settingsTitle')}</h2>
        <p>{t('settingsIntro')}</p>
      </header>
      {!writable ? <div className="dut-alert warning">{t('readOnly')}</div> : null}
      {status === undefined ? null : <div className="dut-status">{t(status)}</div>}

      <section className="dut-panel">
        <div className="dut-field">
          <span>{t('fontSize')}</span>
          <div className="dut-row">
            <small>{t('fontSizeHint')}</small>
            <div className="dut-controls">
              <input
                className="dut-input"
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
              <button type="button" className="dut-btn" disabled={!writable} onClick={() => { reset('fontSize') }}>{t('reset')}</button>
            </div>
          </div>
        </div>
      </section>

      <section className="dut-panel">
        <div className="dut-field">
          <span>{t('tableStyle')}</span>
          <div className="dut-row">
            <div className="dut-controls">
              <select className="dut-select" value={resolved.tableStyle} disabled={!writable} onChange={(event) => { pickTableStyle(event.target.value) }}>
                <option value="default">{t('tableStyleDefault')}</option>
                <option value="claude">{t('tableStyleClaude')}</option>
              </select>
              <button type="button" className="dut-btn" disabled={!writable} onClick={() => { reset('tableStyle') }}>{t('reset')}</button>
            </div>
          </div>
        </div>
      </section>

      <section className="dut-panel">
        <div className="dut-field">
          <span>{t('dialogWidth')}</span>
          <div className="dut-row">
            <small>{t('dialogWidthHint')}</small>
            <div className="dut-controls">
              <input
                className="dut-input"
                type="number"
                min={MIN_DIALOG_WIDTH}
                max={MAX_DIALOG_WIDTH}
                step={1}
                value={widthDraft}
                disabled={!writable}
                onChange={(event) => { setWidthDraft(event.target.value) }}
                onBlur={(event) => { commitDialogWidth(event.target.value) }}
                onKeyDown={(event) => { if (event.key === 'Enter') commitDialogWidth((event.target as HTMLInputElement).value) }}
              />
              <button type="button" className="dut-btn" disabled={!writable} onClick={() => { reset('dialogWidth') }}>{t('reset')}</button>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

export function apply(ctx: ClientContext): void {
  ctx.effect(installBaseStyles, 'dsh-ui-tweaks: base styles')
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
}
