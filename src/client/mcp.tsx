/**
 * dsh-ui-tweaks — MCP manager (browser half).
 *
 * Renders the "MCP 管理" settings section (usable when the mcpManagerEnabled
 * toggle in 界面调整 is on — otherwise it shows an invite card). The section
 * lists every configured MCP server with its status (active / failed / loading
 * / stopped / disabled), command / url, env names, registered tools, and
 * offers per-server actions: **重启** (runtime reload), **启用/停用**,
 * **编辑**, and **删除** (two-click confirm). An **添加服务器** button opens
 * the editor, which supports BOTH a structured **表单** and a raw **YAML**
 * mode (the config is validated on the server before the profile's
 * `cordis.patch.yml` is rewritten; DSH's patch watcher then hot-reloads the
 * loader so the server starts/stops live).
 * @module dsh-ui-tweaks/client/mcp
 */

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import type { SettingsClient } from './index.tsx'

/** Route matching the host half (src/mcp.ts). */
const MCP_ROUTE = '/_dsh/ui-tweaks/mcp'

/** Locale keys the MCP manager reads off the `ui-tweaks` dictionary. */
type McpLabelKey =
  | 'mcpTitle' | 'mcpEmpty' | 'mcpStatusActive' | 'mcpStatusFailed' | 'mcpStatusLoading'
  | 'mcpStatusStopped' | 'mcpStatusDisabled' | 'mcpTools' | 'mcpEnv' | 'mcpUnavailable'
  | 'mcpDisabledHint' | 'mcpEnable' | 'mcpServerDetail' | 'mcpAdd' | 'mcpAddTitle' | 'mcpEditTitle'
  | 'mcpEdit' | 'mcpDelete' | 'mcpEnabledAction' | 'mcpDisabledAction' | 'mcpSaved' | 'mcpRemoved'
  | 'mcpFormTab' | 'mcpYamlTab' | 'mcpYamlHint' | 'mcpYamlPlaceholder' | 'mcpFieldId'
  | 'mcpFieldIdHint' | 'mcpFieldName' | 'mcpFieldNameHint' | 'mcpFieldType' | 'mcpFieldTimeout'
  | 'mcpFieldCommand' | 'mcpFieldCommandPlaceholder' | 'mcpFieldArgs' | 'mcpFieldEnv'
  | 'mcpFieldUrl' | 'mcpFieldHeaders' | 'mcpFieldEnabled' | 'mcpSave' | 'mcpCancel'
  | 'mcpInvalidId' | 'mcpInvalidName' | 'mcpInvalidTimeout' | 'mcpInvalidUrl' | 'mcpInvalidCommand'
  | 'unavailable' | 'loading'

type Translate = (key: McpLabelKey) => string

interface ApiSuccess<T> { ok: true; value: T }
interface ApiFailure { ok: false; error: { code: string; message: string } }

interface McpServerView {
  id: string
  serverName: string
  transport: string
  command?: string
  args: string[]
  url?: string
  headers: Record<string, string>
  env: Record<string, string>
  toolCallTimeoutMs?: number
  /** The server's config rendered as YAML (prefills the YAML editor). */
  yaml: string
  disabled: boolean
  status: 'disabled' | 'stopped' | 'active' | 'failed' | 'loading'
  toolCount: number
  tools: string[]
}

interface McpSnapshot {
  servers: McpServerView[]
}

async function mcpRequest<T>(init?: RequestInit): Promise<T> {
  const response = await fetch(MCP_ROUTE, { credentials: 'same-origin', ...init })
  let body: ApiSuccess<T> | ApiFailure | undefined
  try {
    body = await response.json() as ApiSuccess<T> | ApiFailure
  } catch {
    body = undefined
  }
  if (!response.ok || body === undefined || !body.ok) {
    const failure = body as ApiFailure | undefined
    const message = body === undefined
      ? `MCP route unavailable (HTTP ${response.status}; restart DSH to load the plugin server code)`
      : failure?.error?.message ?? `UI Tweaks MCP request failed with HTTP ${response.status}`
    const error = new Error(message) as Error & { code: string | undefined }
    error.code = failure?.error?.code
    throw error
  }
  return body.value
}

/** Split a textarea into one trimmed entry per non-empty line. */
function linesToArray(text: string): string[] {
  return text.split(/\r?\n/u).map(line => line.trim()).filter(line => line.length > 0)
}

/** Parse `KEY=value` (or `Key: value`) lines into a record; throws on malformed lines. */
function linesToRecord(text: string, separator: '=' | ':'): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of text.split(/\r?\n/u)) {
    const trimmed = line.trim()
    if (trimmed.length === 0) continue
    const at = trimmed.indexOf(separator)
    if (at <= 0) throw new Error(`格式不正确：${trimmed}`)
    const key = trimmed.slice(0, at).trim()
    const value = trimmed.slice(at + 1).trim()
    if (key.length === 0) throw new Error(`格式不正确：${trimmed}`)
    out[key] = value
  }
  return out
}

function recordToLines(record: Record<string, string>, separator: '=' | ':'): string {
  return Object.entries(record).map(([key, value]) => `${key}${separator}${value}`).join('\n')
}

export const MCP_CSS = `
.dut-mcp{display:grid;gap:12px;max-width:680px;padding:6px 2px 36px}
.dut-mcp-head{display:flex;align-items:center;gap:10px;padding:14px 16px 0}
.dut-mcp-head h2{margin:0;font-size:15px;font-weight:600;letter-spacing:-.01em;color:var(--dsw-alias-label-primary)}
.dut-mcp-count{font-size:11.5px;color:var(--dsw-alias-label-secondary);padding:2px 8px;border-radius:999px;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1)}
.dut-mcp-spacer{flex:1}
.dut-mcp-btn{display:inline-flex;align-items:center;height:28px;padding:0 12px;border-radius:999px;border:1px solid var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;cursor:pointer;transition:background .15s ease,color .15s ease,border-color .15s ease}
.dut-mcp-btn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dut-mcp-btn:disabled{opacity:.5;cursor:default}
.dut-mcp-btn.dut-mcp-del:hover{border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary) 55%,transparent);color:var(--dsw-alias-state-error-primary);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 10%,transparent)}
.dut-mcp-btn.dut-mcp-confirm{border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary) 55%,transparent);color:var(--dsw-alias-state-error-primary);font-weight:600}
.dut-mcp-body{display:grid;gap:2px;margin-top:4px}
.dut-mcp-row{display:grid;gap:6px;padding:10px 16px;border-radius:12px}
.dut-mcp-row:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dut-mcp-row-main{display:flex;align-items:center;gap:8px;min-width:0}
.dut-mcp-name{font-size:13.5px;font-weight:600;color:var(--dsw-alias-label-primary);white-space:nowrap;text-overflow:ellipsis;overflow:hidden}
.dut-mcp-badge{flex:none;font-size:11px;line-height:1;padding:4px 9px;border-radius:999px;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary)}
.dut-mcp-badge.dut-mcp-ok{background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 12%,transparent);border-color:transparent;color:var(--dsw-alias-state-success-primary)}
.dut-mcp-badge.dut-mcp-err{background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 12%,transparent);border-color:transparent;color:var(--dsw-alias-state-error-primary)}
.dut-mcp-badge.dut-mcp-warn{background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 14%,transparent);border-color:transparent;color:var(--dsw-alias-state-warn-label)}
.dut-mcp-sub{font-size:11.5px;color:var(--dsw-alias-label-secondary);white-space:nowrap;text-overflow:ellipsis;overflow:hidden}
.dut-mcp-toggle{flex:none;font-size:11.5px;color:var(--dsw-alias-label-tertiary);background:transparent;border:none;padding:0;cursor:pointer;text-align:left}
.dut-mcp-toggle:hover{color:var(--dsw-alias-label-primary)}
.dut-mcp-tools{margin-left:2px;display:flex;flex-wrap:wrap;gap:4px}
.dut-mcp-tool{font-size:11px;line-height:1;padding:3px 8px;border-radius:999px;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary)}
.dut-mcp-note{margin:2px 16px 0;padding:8px 12px;border-radius:10px;font-size:11.5px;line-height:1.55;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1)}
.dut-mcp-empty{padding:32px 16px;text-align:center;font-size:12.5px;color:var(--dsw-alias-label-secondary)}
.dut-mcp-alert{margin:8px 16px 0;padding:8px 12px;border-radius:10px;font-size:12px;line-height:1.5;background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 10%,transparent);color:var(--dsw-alias-state-error-primary)}
.dut-mcp-notice{margin:8px 16px 0;padding:8px 12px;border-radius:10px;font-size:12px;line-height:1.5;background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 12%,transparent);color:var(--dsw-alias-state-success-primary)}
.dut-mcp-off{padding:20px 16px;display:grid;gap:12px}
.dut-mcp-off p{margin:0;font-size:12.5px;line-height:1.6;color:var(--dsw-alias-label-secondary)}
.dut-mcp-overlay{z-index:1100;justify-content:center;align-items:center;display:flex;position:fixed;inset:0}
.dut-mcp-mask{background:var(--dsw-alias-bg-mask-1);backdrop-filter:var(--dsw-mask-blur);position:absolute;inset:0}
.dut-mcp-panel{z-index:1;background:var(--dsw-alias-bg-layer-2);box-sizing:border-box;width:720px;max-width:calc(100vw - 48px);height:min(700px,100vh - 48px);box-shadow:var(--dsw-shadow-lv3);--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2);border-radius:20px;display:flex;flex-direction:column;overflow:hidden}
.dut-mcp-panel-head{box-sizing:border-box;flex:none;display:flex;align-items:center;gap:10px;height:52px;padding:0 12px 0 20px}
.dut-mcp-panel-head h2{margin:0;font-size:16px;font-weight:600;letter-spacing:-.01em;color:var(--dsw-alias-label-primary)}
.dut-mcp-panel-close{cursor:pointer;width:28px;height:28px;color:var(--dsw-alias-label-primary);background:transparent;border:none;border-radius:28px;display:inline-flex;justify-content:center;align-items:center;padding:0;font-size:13px}
.dut-mcp-panel-close:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dut-mcp-tabs{flex:none;display:inline-flex;padding:3px;gap:3px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-2);margin:0 20px 10px;align-self:flex-start}
.dut-mcp-tabs button{border:none;border-radius:7px;padding:5px 14px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12.5px;cursor:pointer}
.dut-mcp-tabs button.dut-mcp-tab-on{background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 12%,transparent);color:var(--dsw-alias-state-business-primary);font-weight:600}
.dut-mcp-form{flex:1;min-height:0;overflow-y:auto;padding:0 20px 20px;display:grid;gap:12px;align-content:start}
.dut-mcp-field{display:grid;gap:6px}
.dut-mcp-field>span{font-size:12px;font-weight:600;color:var(--dsw-alias-label-primary)}
.dut-mcp-field small{font-size:11px;line-height:1.5;color:var(--dsw-alias-label-tertiary)}
.dut-mcp-input{box-sizing:border-box;width:100%;height:34px;padding:0 10px;border-radius:9px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px}
.dut-mcp-input:focus{outline:none;border-color:color-mix(in srgb,var(--dsw-alias-state-business-primary) 55%,transparent)}
.dut-mcp-input:disabled{opacity:.55;cursor:not-allowed}
textarea.dut-mcp-input{height:auto;min-height:72px;padding:8px 10px;line-height:1.5;resize:vertical;font-family:var(--dsw-font-markdown-code-block-font-family, Consolas, monospace);font-size:12px}
textarea.dut-mcp-input-lg{min-height:120px}
textarea.dut-mcp-yaml{min-height:320px}
.dut-mcp-row2{display:grid;grid-template-columns:1fr 1fr;gap:12px;align-items:start}
.dut-mcp-field .dut-seg{width:fit-content}
.dut-mcp-row2 .dut-seg{height:34px;box-sizing:border-box;align-items:center}
.dut-mcp-row2 .dut-seg button{flex:none;white-space:nowrap;padding:0 16px;height:26px}
.dut-mcp-foot{flex:none;display:flex;align-items:center;gap:8px;justify-content:flex-end;padding:12px 20px 16px;border-top:1px solid var(--dsw-alias-border-l1)}
.dut-mcp-error{margin:0 20px 10px;padding:8px 12px;border-radius:10px;font-size:12px;line-height:1.5;background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 10%,transparent);color:var(--dsw-alias-state-error-primary)}
`

/** Install the MCP stylesheet once (idempotent); returns the disposer. */
export function installMcpStyles(): () => void {
  const id = 'dsh-ui-tweaks-mcp'
  const existing = document.querySelector(`style[data-plugin-css="${id}"]`)
  if (existing !== null) return () => {}
  const style = document.createElement('style')
  style.dataset.plugin = 'dsh-ui-tweaks'
  style.dataset.pluginCss = id
  style.textContent = MCP_CSS
  document.head.appendChild(style)
  return () => { style.remove() }
}

function statusLabel(status: McpServerView['status'], t: Translate): string {
  switch (status) {
    case 'active': return t('mcpStatusActive')
    case 'failed': return t('mcpStatusFailed')
    case 'loading': return t('mcpStatusLoading')
    case 'stopped': return t('mcpStatusStopped')
    case 'disabled': return t('mcpStatusDisabled')
  }
}

function statusClass(status: McpServerView['status']): string {
  switch (status) {
    case 'active': return ' dut-mcp-ok'
    case 'failed': return ' dut-mcp-err'
    case 'loading': return ' dut-mcp-warn'
    default: return ''
  }
}

export interface McpSectionProps {
  controller: SettingsClient
  t: Translate
}

export function McpSection({ controller, t }: McpSectionProps) {
  const settingsState = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot)
  const enabled = settingsState.value?.mcpManagerEnabled === true
  const [servers, setServers] = useState<McpServerView[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [editing, setEditing] = useState<McpServerView | 'new' | null>(null)
  const generation = useMemo(() => ({ current: 0 }), [])

  const load = (): void => {
    const gen = ++generation.current
    setError(null)
    void mcpRequest<McpSnapshot>().then((snapshot) => {
      if (gen !== generation.current) return
      setServers(snapshot.servers)
    }).catch((reason: unknown) => {
      if (gen !== generation.current) return
      setError(reason instanceof Error ? reason.message : String(reason))
      setServers([])
    })
  }

  useEffect(() => {
    if (!enabled) return
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled])

  const run = (key: string, body: unknown, after?: () => void): void => {
    setBusy(key)
    setError(null)
    setNotice(null)
    void mcpRequest<McpSnapshot>({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(() => { after?.() }).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : String(reason))
    }).finally(() => { setBusy(current => (current === key ? null : current)) })
  }

  /** Re-fetch the list every `interval` ms until `stop` returns true (or attempts run out).
   * The DSH patch watcher applies changes asynchronously and an MCP server takes
   * time to spawn/connect, so a single delayed reload can miss the transition. */
  const pollAfter = (stop: (servers: McpServerView[]) => boolean, attempts = 12, interval = 1000): void => {
    let left = attempts
    const tick = (): void => {
      const gen = ++generation.current
      void mcpRequest<McpSnapshot>().then((snapshot) => {
        if (gen !== generation.current) return
        setServers(snapshot.servers)
        left -= 1
        if (left <= 0 || stop(snapshot.servers)) return
        window.setTimeout(tick, interval)
      }).catch(() => {
        left -= 1
        if (left > 0) window.setTimeout(tick, interval)
      })
    }
    tick()
  }

  const remove = (id: string): void => {
    if (confirmId !== id) {
      setConfirmId(id)
      window.setTimeout(() => { setConfirmId(current => (current === id ? null : current)) }, 3000)
      return
    }
    setConfirmId(null)
    run(`remove:${id}`, { action: 'remove', id }, () => {
      setNotice(t('mcpRemoved'))
      pollAfter(servers => !servers.some(server => server.id === id), 10)
    })
  }

  const setEnabled = (id: string, enabled: boolean): void => {
    run(`set-enabled:${id}`, { action: 'set-enabled', id, enabled }, () => {
      // Keep refreshing until the target reaches a TERMINAL status. The
      // `disabled` flag flips within ~1s, but the MCP spawn + connect takes
      // longer — stopping at the flag would freeze the row mid-transition.
      pollAfter(servers => {
        const target = servers.find(server => server.id === id)
        if (target === undefined) return true
        return enabled
          ? target.status === 'active' || target.status === 'failed'
          : target.status === 'disabled'
      }, 45, 1000)
    })
  }

  if (!enabled) {
    return (
      <div className="dut-mcp">
        <div className="dut-panel dut-mcp-off">
          <p>{t('mcpDisabledHint')}</p>
          <div>
            <button type="button" className="dut-btn dut-btn-active" onClick={() => {
              void controller.set('mcpManagerEnabled', true).catch(() => { setError(t('unavailable')) })
            }}>{t('mcpEnable')}</button>
          </div>
        </div>
      </div>
    )
  }

  const list = servers ?? []
  return (
    <div className="dut-mcp">
      <div className="dut-panel">
        <div className="dut-mcp-head">
          <h2>{t('mcpTitle')}</h2>
          <span className="dut-mcp-count">{list.length} · {list.filter(s => s.status === 'active').length} {t('mcpStatusActive')}</span>
          <span className="dut-mcp-spacer" />
          <button type="button" className="dut-mcp-btn" onClick={() => { setEditing('new') }}>{t('mcpAdd')}</button>
        </div>
        <div className="dut-mcp-note">{t('mcpServerDetail')}</div>
        {error !== null ? <div className="dut-mcp-alert">{error}</div> : null}
        {notice !== null ? <div className="dut-mcp-notice">{notice}</div> : null}
        <div className="dut-mcp-body">
          {servers === null ? (
            <div className="dut-mcp-empty">{t('loading')}</div>
          ) : list.length === 0 ? (
            <div className="dut-mcp-empty">{t('mcpEmpty')}</div>
          ) : list.map(server => {
            const command = server.url !== undefined ? server.url : [server.command, ...server.args].filter(Boolean).join(' ')
            const open = expanded === server.id
            return (
              <div className="dut-mcp-row" key={server.id}>
                <div className="dut-mcp-row-main">
                  <span className="dut-mcp-name">{server.serverName}</span>
                  <span className={'dut-mcp-badge' + statusClass(server.status)}>{statusLabel(server.status, t)}</span>
                  <span className="dut-mcp-sub">· {server.toolCount} {t('mcpTools')}</span>
                  <span className="dut-mcp-spacer" />
                  <button type="button" className="dut-mcp-btn" disabled={busy !== null} onClick={() => { setEnabled(server.id, server.disabled) }}>{server.disabled ? t('mcpEnabledAction') : t('mcpDisabledAction')}</button>
                  <button type="button" className="dut-mcp-btn" disabled={busy !== null} onClick={() => { setEditing(server) }}>{t('mcpEdit')}</button>
                  <button
                    type="button"
                    className={'dut-mcp-btn dut-mcp-del' + (confirmId === server.id ? ' dut-mcp-confirm' : '')}
                    disabled={busy !== null}
                    onClick={() => { remove(server.id) }}
                  >
                    {confirmId === server.id ? t('mcpDelete') + '?' : t('mcpDelete')}
                  </button>
                </div>
                <div className="dut-mcp-sub" title={command}>{server.id} · {server.transport} · {command}</div>
                <button
                  type="button"
                  className="dut-mcp-toggle"
                  onClick={() => { setExpanded(open ? null : server.id) }}
                >
                  {open ? '▾ ' : '▸ '}{server.toolCount} {t('mcpTools')}{server.env && Object.keys(server.env).length > 0 ? ` · ${t('mcpEnv')}: ${Object.keys(server.env).join(', ')}` : ''}
                </button>
                {open ? (
                  <div className="dut-mcp-tools">
                    {server.tools.length === 0 ? <span className="dut-mcp-sub">—</span> : server.tools.map(tool => <span className="dut-mcp-tool" key={tool}>{tool}</span>)}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      </div>
      {editing !== null ? (
        <McpEditor
          key={editing === 'new' ? 'new' : editing.id}
          initial={editing === 'new' ? null : editing}
          t={t}
          onClose={() => { setEditing(null) }}
          onSaved={() => { setEditing(null); setNotice(t('mcpSaved')); pollAfter(() => false, 10) }}
        />
      ) : null}
    </div>
  )
}

interface McpEditorProps {
  initial: McpServerView | null
  t: Translate
  onClose: () => void
  onSaved: () => void
}

function McpEditor({ initial, t, onClose, onSaved }: McpEditorProps) {
  const isEdit = initial !== null
  const [mode, setMode] = useState<'form' | 'yaml'>('form')
  const [id, setId] = useState(initial?.id ?? '')
  const [serverName, setServerName] = useState(initial?.serverName ?? '')
  const [transport, setTransport] = useState<'stdio' | 'streamable-http'>(initial?.transport === 'streamable-http' ? 'streamable-http' : 'stdio')
  const [timeoutText, setTimeoutText] = useState(initial?.toolCallTimeoutMs !== undefined ? String(initial.toolCallTimeoutMs) : '')
  const [command, setCommand] = useState(initial?.command ?? '')
  const [argsText, setArgsText] = useState(initial ? initial.args.join('\n') : '')
  const [envText, setEnvText] = useState(initial ? recordToLines(initial.env, '=') : '')
  const [url, setUrl] = useState(initial?.url ?? '')
  const [headersText, setHeadersText] = useState(initial ? recordToLines(initial.headers, ':') : '')
  const [disabled, setDisabled] = useState(initial?.disabled ?? false)
  const [yamlText, setYamlText] = useState(initial?.yaml ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('keydown', onKeyDown) }
  }, [onClose])

  const validateForm = (): string | null => {
    if (!/^[A-Za-z0-9_-]{1,64}$/u.test(id)) return t('mcpInvalidId')
    if (!/^[A-Za-z0-9_-]{1,32}$/u.test(serverName)) return t('mcpInvalidName')
    if (timeoutText !== '' && (!/^\d+$/u.test(timeoutText) || Number(timeoutText) <= 0)) return t('mcpInvalidTimeout')
    if (transport === 'streamable-http') {
      if (!/^https?:\/\//u.test(url)) return t('mcpInvalidUrl')
    } else if (command.trim().length === 0) {
      return t('mcpInvalidCommand')
    }
    return null
  }

  const save = (): void => {
    setError(null)
    setBusy(true)
    let payload: unknown
    if (mode === 'yaml') {
      payload = { action: 'save', server: { id, disabled }, yaml: yamlText }
    } else {
      const invalid = validateForm()
      if (invalid !== null) {
        setError(invalid)
        setBusy(false)
        return
      }
      let env: Record<string, string> = {}
      let headers: Record<string, string> = {}
      try {
        env = linesToRecord(envText, '=')
        headers = linesToRecord(headersText, ':')
      } catch (parseError) {
        setError(parseError instanceof Error ? parseError.message : String(parseError))
        setBusy(false)
        return
      }
      payload = {
        action: 'save',
        server: {
          id,
          serverName,
          transport,
          command,
          args: linesToArray(argsText),
          env,
          url,
          headers,
          ...(timeoutText !== '' ? { toolCallTimeoutMs: Number(timeoutText) } : {}),
          disabled,
        },
      }
    }
    void mcpRequest<McpSnapshot>({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(() => { onSaved() }).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : String(reason))
    }).finally(() => { setBusy(false) })
  }

  return createPortal(
    <div className="dut-mcp-overlay" role="presentation">
      <div className="dut-mcp-mask" aria-hidden="true" onClick={onClose} />
      <div className="dut-mcp-panel" role="dialog" aria-modal="true" aria-label={isEdit ? t('mcpEditTitle') : t('mcpAddTitle')}>
        <div className="dut-mcp-panel-head">
          <h2>{isEdit ? t('mcpEditTitle') : t('mcpAddTitle')}</h2>
          <span className="dut-mcp-spacer" />
          <button type="button" className="dut-mcp-panel-close" onClick={onClose} aria-label="✕">✕</button>
        </div>
        <div className="dut-mcp-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={mode === 'form'} className={mode === 'form' ? 'dut-mcp-tab-on' : ''} onClick={() => { setMode('form') }}>{t('mcpFormTab')}</button>
          <button type="button" role="tab" aria-selected={mode === 'yaml'} className={mode === 'yaml' ? 'dut-mcp-tab-on' : ''} onClick={() => { setMode('yaml') }}>{t('mcpYamlTab')}</button>
        </div>
        {error !== null ? <div className="dut-mcp-error">{error}</div> : null}
        {mode === 'yaml' ? (
          <div className="dut-mcp-form">
            <div className="dut-mcp-row2">
              <div className="dut-mcp-field">
                <span>{t('mcpFieldId')}</span>
                <input className="dut-mcp-input" value={id} disabled={isEdit} onChange={event => { setId(event.target.value) }} />
                <small>{t('mcpFieldIdHint')}</small>
              </div>
              <div className="dut-mcp-field">
                <span>{t('mcpFieldEnabled')}</span>
                <div className="dut-seg">
                  <button type="button" className={!disabled ? 'dut-seg-active' : ''} onClick={() => { setDisabled(false) }}>{t('mcpEnabledAction')}</button>
                  <button type="button" className={disabled ? 'dut-seg-active' : ''} onClick={() => { setDisabled(true) }}>{t('mcpDisabledAction')}</button>
                </div>
              </div>
            </div>
            <div className="dut-mcp-field">
              <span>{t('mcpYamlTab')}</span>
              <textarea className="dut-mcp-input dut-mcp-yaml" value={yamlText} placeholder={t('mcpYamlPlaceholder')} spellCheck={false} onChange={event => { setYamlText(event.target.value) }} />
              <small>{t('mcpYamlHint')}</small>
            </div>
          </div>
        ) : (
          <div className="dut-mcp-form">
            <div className="dut-mcp-row2">
              <div className="dut-mcp-field">
                <span>{t('mcpFieldId')}</span>
                <input className="dut-mcp-input" value={id} disabled={isEdit} onChange={event => { setId(event.target.value) }} />
                <small>{t('mcpFieldIdHint')}</small>
              </div>
              <div className="dut-mcp-field">
                <span>{t('mcpFieldEnabled')}</span>
                <div className="dut-seg">
                  <button type="button" className={!disabled ? 'dut-seg-active' : ''} onClick={() => { setDisabled(false) }}>{t('mcpEnabledAction')}</button>
                  <button type="button" className={disabled ? 'dut-seg-active' : ''} onClick={() => { setDisabled(true) }}>{t('mcpDisabledAction')}</button>
                </div>
              </div>
            </div>
            <div className="dut-mcp-row2">
              <div className="dut-mcp-field">
                <span>{t('mcpFieldName')}</span>
                <input className="dut-mcp-input" value={serverName} onChange={event => { setServerName(event.target.value) }} />
                <small>{t('mcpFieldNameHint')}</small>
              </div>
              <div className="dut-mcp-field">
                <span>{t('mcpFieldType')}</span>
                <div className="dut-seg">
                  <button type="button" className={transport === 'stdio' ? 'dut-seg-active' : ''} onClick={() => { setTransport('stdio') }}>stdio</button>
                  <button type="button" className={transport === 'streamable-http' ? 'dut-seg-active' : ''} onClick={() => { setTransport('streamable-http') }}>HTTP</button>
                </div>
              </div>
            </div>
            <div className="dut-mcp-field">
              <span>{t('mcpFieldTimeout')}</span>
              <input className="dut-mcp-input" inputMode="numeric" value={timeoutText} placeholder="60000" onChange={event => { setTimeoutText(event.target.value) }} />
            </div>
            {transport === 'stdio' ? (
              <>
                <div className="dut-mcp-field">
                  <span>{t('mcpFieldCommand')}</span>
                  <input className="dut-mcp-input" value={command} placeholder={t('mcpFieldCommandPlaceholder')} onChange={event => { setCommand(event.target.value) }} />
                </div>
                <div className="dut-mcp-field">
                  <span>{t('mcpFieldArgs')}</span>
                  <textarea className="dut-mcp-input" value={argsText} placeholder={'-y\n@some/mcp-server'} spellCheck={false} onChange={event => { setArgsText(event.target.value) }} />
                </div>
                <div className="dut-mcp-field">
                  <span>{t('mcpFieldEnv')}</span>
                  <textarea className="dut-mcp-input dut-mcp-input-lg" value={envText} placeholder={'KEY=value'} spellCheck={false} onChange={event => { setEnvText(event.target.value) }} />
                </div>
              </>
            ) : (
              <>
                <div className="dut-mcp-field">
                  <span>{t('mcpFieldUrl')}</span>
                  <input className="dut-mcp-input" value={url} placeholder="https://mcp.example.com/sse" onChange={event => { setUrl(event.target.value) }} />
                </div>
                <div className="dut-mcp-field">
                  <span>{t('mcpFieldHeaders')}</span>
                  <textarea className="dut-mcp-input dut-mcp-input-lg" value={headersText} placeholder={'Authorization: Bearer …'} spellCheck={false} onChange={event => { setHeadersText(event.target.value) }} />
                </div>
              </>
            )}
          </div>
        )}
        <div className="dut-mcp-foot">
          <button type="button" className="dut-mcp-btn" disabled={busy} onClick={onClose}>{t('mcpCancel')}</button>
          <button type="button" className="dut-btn dut-btn-active" disabled={busy} onClick={save}>{t('mcpSave')}</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
