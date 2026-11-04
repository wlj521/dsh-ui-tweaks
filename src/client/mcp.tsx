/**
 * dsh-ui-tweaks — MCP manager (browser half).
 *
 * Renders the "MCP 管理" settings section (usable when the mcpManagerEnabled
 * toggle in 界面调整 is on — otherwise it shows an invite card). The section
 * lists every configured MCP server with its status (active / failed / loading
 * / stopped / stopping / disabled), transport, command / URL and tool count,
 * and offers per-server actions: **启用/停用**, **编辑**, and **删除**
 * (two-click confirm). An **添加服务器** button opens the editor, which
 * supports BOTH a structured **表单** and a raw **YAML** mode (the config is
 * validated on the server before the profile's `cordis.patch.yml` is
 * rewritten; DSH's patch watcher then hot-reloads the loader so the server
 * starts/stops live). Environment variables and HTTP headers use a scrollable
 * key/value row editor so long configs stay readable.
 *
 * Every mutation rewrites the profile patch, which kicks off an asynchronous
 * chain (patch watcher → loader reload → MCP process spawn/teardown). The UI
 * treats that as first-class: the clicked row enters a pending state until a
 * poll observes a terminal status, and `mcpRequest` rides out the patch-reload
 * restart window instead of alarming the user mid-toggle.
 * @module dsh-ui-tweaks/client/mcp
 */

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import type { SettingsClient } from './index.tsx'

/** Route matching the host half (src/mcp.ts). */
const MCP_ROUTE = '/_dsh/ui-tweaks/mcp'

/** Locale keys the MCP manager reads off the `ui-tweaks` dictionary. */
type McpLabelKey =
  | 'mcpTitle' | 'mcpEmpty' | 'mcpStatusActive' | 'mcpStatusFailed' | 'mcpStatusLoading'
  | 'mcpStatusStopped' | 'mcpStatusStopping' | 'mcpStatusDisabled' | 'mcpTools' | 'mcpUnavailable'
  | 'mcpDisabledHint' | 'mcpEnable' | 'mcpServerDetail' | 'mcpAdd' | 'mcpAddTitle' | 'mcpEditTitle'
  | 'mcpEdit' | 'mcpDelete' | 'mcpEnabledAction' | 'mcpDisabledAction' | 'mcpSaved' | 'mcpRemoved'
  | 'mcpFormTab' | 'mcpYamlTab' | 'mcpYamlHint' | 'mcpYamlPlaceholder' | 'mcpFieldId'
  | 'mcpFieldIdHint' | 'mcpFieldName' | 'mcpFieldNameHint' | 'mcpFieldType' | 'mcpFieldTimeout'
  | 'mcpFieldCommand' | 'mcpFieldCommandPlaceholder' | 'mcpFieldArgs' | 'mcpFieldEnv'
  | 'mcpFieldUrl' | 'mcpFieldHeaders' | 'mcpFieldEnabled' | 'mcpSave' | 'mcpCancel'
  | 'mcpInvalidId' | 'mcpInvalidName' | 'mcpInvalidTimeout' | 'mcpInvalidUrl' | 'mcpInvalidCommand'
  | 'mcpBasicSection' | 'mcpConnectionSection' | 'mcpEnvHint' | 'mcpHeadersHint'
  | 'mcpAddEnv' | 'mcpAddHeader' | 'mcpEnvEmpty' | 'mcpHeadersEmpty'
  | 'mcpKeyPlaceholder' | 'mcpValuePlaceholder' | 'mcpHeaderKeyPlaceholder'
  | 'mcpRemoveRow' | 'mcpDuplicateKey' | 'mcpEmptyKey' | 'mcpEditorHint'
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
  status: 'disabled' | 'stopped' | 'active' | 'failed' | 'loading' | 'stopping'
  toolCount: number
  tools: string[]
}

interface McpSnapshot {
  servers: McpServerView[]
}

/** Retryable-capable request failure: carries the HTTP status for the retry policy. */
class McpRequestError extends Error {
  constructor(message: string, readonly status: number, readonly code: string | undefined) {
    super(message)
    this.name = 'McpRequestError'
  }
}

/**
 * Fetch one MCP route round trip, riding out the patch-reload window.
 *
 * Every MCP mutation (set-enabled / save / remove) rewrites the profile's
 * `cordis.patch.yml`, and the patch watcher hot-reloads the `web` node — the
 * same restart window the Settings route rides out with 502/503 retries
 * (`apiRequest` in index.tsx). Without the retry here, a toggle landing inside
 * that window surfaced the scary "restart DSH to load the plugin server code"
 * alert even though the patch write had already succeeded. Non-502/503 refusals
 * fail fast: replaying them unchanged can only fail again.
 */
async function mcpRequest<T>(init?: RequestInit): Promise<T> {
  let lastError: unknown
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    try {
      const response = await fetch(MCP_ROUTE, { credentials: 'same-origin', ...init })
      let body: ApiSuccess<T> | ApiFailure | undefined
      try {
        body = await response.json() as ApiSuccess<T> | ApiFailure
      } catch {
        body = undefined
      }
      if (response.ok && body !== undefined && body.ok) return body.value
      const failure = body as ApiFailure | undefined
      const message = body === undefined
        ? `MCP route unavailable (HTTP ${response.status}; restart DSH to load the plugin server code)`
        : failure?.error?.message ?? `UI Tweaks MCP request failed with HTTP ${response.status}`
      const error = new McpRequestError(message, response.status, failure?.error?.code)
      if (response.status !== 502 && response.status !== 503) throw error
      lastError = error
    } catch (error) {
      if (error instanceof McpRequestError) throw error
      // Transport-level failures (network, non-JSON body) are worth a retry.
      lastError = error
    }
    if (attempt < 6) await new Promise((resolve) => { setTimeout(resolve, attempt * 250) })
  }
  throw lastError ?? new Error('UI Tweaks MCP request failed')
}

/** Split a textarea into one trimmed entry per non-empty line. */
function linesToArray(text: string): string[] {
  return text.split(/\r?\n/u).map(line => line.trim()).filter(line => line.length > 0)
}

/** One editable key/value pair in the environment-variable or header editor. */
interface KeyValueRow {
  /** Stable React key; the key/value strings themselves may be empty. */
  uid: number
  key: string
  value: string
}

let nextKeyValueUid = 1

function newKeyValueRow(): KeyValueRow {
  return { uid: nextKeyValueUid++, key: '', value: '' }
}

/** Turn a persisted record into editable rows, preserving its insertion order. */
function recordToRows(record: Record<string, string>): KeyValueRow[] {
  return Object.entries(record).map(([key, value]) => ({ uid: nextKeyValueUid++, key, value }))
}

/** Build the saved record; blank rows are ignored, blank keys and duplicates are rejected. */
function rowsToRecord(rows: KeyValueRow[], t: Translate): Record<string, string> {
  const out: Record<string, string> = {}
  for (const row of rows) {
    const key = row.key.trim()
    const value = row.value.trim()
    if (key === '') {
      if (value !== '') throw new Error(t('mcpEmptyKey'))
      continue
    }
    if (Object.prototype.hasOwnProperty.call(out, key)) {
      throw new Error(`${t('mcpDuplicateKey')}: ${key}`)
    }
    out[key] = value
  }
  return out
}

/** Scrollable key/value row editor shared by env vars and HTTP headers. */
function KeyValueEditor(props: {
  rows: KeyValueRow[]
  onChange: (rows: KeyValueRow[]) => void
  keyTitle: string
  valueTitle: string
  keyPlaceholder: string
  valuePlaceholder: string
  emptyText: string
  addText: string
  removeText: string
}) {
  const update = (uid: number, patch: Partial<Pick<KeyValueRow, 'key' | 'value'>>): void => {
    props.onChange(props.rows.map(row => (row.uid === uid ? { ...row, ...patch } : row)))
  }
  const listRef = useRef<HTMLDivElement>(null)
  const previousCount = useRef(props.rows.length)
  useEffect(() => {
    if (props.rows.length > previousCount.current) {
      const list = listRef.current
      if (list !== null) list.scrollTop = list.scrollHeight
    }
    previousCount.current = props.rows.length
  }, [props.rows.length])
  return (
    <div className="dut-mcp-kv">
      <div className="dut-mcp-kv-head" aria-hidden>
        <span>{props.keyTitle}</span>
        <span>{props.valueTitle}</span>
        <span />
      </div>
      <div className="dut-mcp-kv-list" ref={listRef}>
        {props.rows.length === 0 ? (
          <div className="dut-mcp-kv-empty">{props.emptyText}</div>
        ) : props.rows.map(row => (
          <div className="dut-mcp-kv-row" key={row.uid}>
            <input
              className="dut-mcp-input"
              value={row.key}
              placeholder={props.keyPlaceholder}
              spellCheck={false}
              autoComplete="off"
              onChange={event => { update(row.uid, { key: event.target.value }) }}
            />
            <input
              className="dut-mcp-input"
              value={row.value}
              placeholder={props.valuePlaceholder}
              spellCheck={false}
              autoComplete="off"
              onChange={event => { update(row.uid, { value: event.target.value }) }}
            />
            <button
              type="button"
              className="dut-mcp-kv-del"
              title={props.removeText}
              aria-label={props.removeText}
              onClick={() => { props.onChange(props.rows.filter(item => item.uid !== row.uid)) }}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      <button type="button" className="dut-mcp-addrow" onClick={() => { props.onChange([...props.rows, newKeyValueRow()]) }}>
        + {props.addText}
      </button>
    </div>
  )
}

export const MCP_CSS = `.dut-mcp{display:grid;gap:14px;width:100%;max-width:820px;padding:4px 2px 36px}
.dut-mcp-shell{overflow:hidden}
.dut-mcp-head{display:flex;align-items:flex-start;gap:16px;padding:20px 20px 16px;border-bottom:1px solid var(--dsw-alias-border-l1)}
.dut-mcp-heading{display:grid;gap:6px;flex:1;min-width:0}
.dut-mcp-titleline{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0}
.dut-mcp-head h2{margin:0;font-size:17px;line-height:1.3;font-weight:650;letter-spacing:-.015em;color:var(--dsw-alias-label-primary)}
.dut-mcp-desc{margin:0;font-size:12px;line-height:1.55;color:var(--dsw-alias-label-tertiary)}
.dut-mcp-count{display:inline-flex;align-items:center;height:22px;padding:0 9px;border-radius:999px;font-size:11px;white-space:nowrap;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1)}
.dut-mcp-count.dut-mcp-count-ok{color:var(--dsw-alias-state-success-primary);background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 11%,transparent);border-color:transparent}
.dut-mcp-add{display:inline-flex;align-items:center;gap:6px;flex:none;height:32px;padding:0 14px;border-radius:9px;border:1px solid color-mix(in srgb,var(--dsw-alias-state-business-primary) 45%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 12%,transparent);color:var(--dsw-alias-state-business-primary);font:inherit;font-size:12px;font-weight:600;cursor:pointer;transition:background .15s ease,border-color .15s ease}
.dut-mcp-add:hover{background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 19%,transparent);border-color:color-mix(in srgb,var(--dsw-alias-state-business-primary) 60%,transparent)}
.dut-mcp-btn{display:inline-flex;align-items:center;justify-content:center;height:26px;padding:0 10px;border-radius:7px;border:1px solid transparent;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11.5px;cursor:pointer;white-space:nowrap;transition:background .15s ease,color .15s ease,border-color .15s ease}
.dut-mcp-btn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l1)}
.dut-mcp-btn:disabled{opacity:.45;cursor:default}
.dut-mcp-btn.dut-mcp-del:hover{border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary) 55%,transparent);color:var(--dsw-alias-state-error-primary);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 10%,transparent)}
.dut-mcp-btn.dut-mcp-confirm{border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary) 55%,transparent)!important;color:var(--dsw-alias-state-error-primary)!important;font-weight:600;background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 9%,transparent)!important}
.dut-mcp-body{display:grid;gap:8px;padding:14px 16px 18px}
.dut-mcp-card{display:grid;gap:8px;padding:12px 14px;border:1px solid var(--dsw-alias-border-l1);border-radius:14px;background:var(--dsw-alias-bg-layer-1);transition:border-color .15s ease,box-shadow .15s ease,background .15s ease}
.dut-mcp-card:hover{border-color:var(--dsw-alias-border-l2);box-shadow:var(--dsw-shadow-lv1);background:color-mix(in srgb,var(--dsw-alias-bg-layer-1) 82%,var(--dsw-alias-interactive-bg-hover))}
.dut-mcp-card-top{display:flex;align-items:center;gap:12px;min-width:0}
.dut-mcp-card-info{display:flex;align-items:center;gap:7px;min-width:0;flex:1;flex-wrap:wrap}
.dut-mcp-name{font-size:14px;font-weight:650;color:var(--dsw-alias-label-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:260px}
.dut-mcp-badge{flex:none;font-size:10.5px;line-height:1;padding:4px 8px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary)}
.dut-mcp-badge.dut-mcp-ok{background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 12%,transparent);border-color:transparent;color:var(--dsw-alias-state-success-primary)}
.dut-mcp-badge.dut-mcp-err{background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 12%,transparent);border-color:transparent;color:var(--dsw-alias-state-error-primary)}
.dut-mcp-badge.dut-mcp-warn{background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 14%,transparent);border-color:transparent;color:var(--dsw-alias-state-warn-label)}
.dut-mcp-tools-count{font-size:11px;color:var(--dsw-alias-label-tertiary);white-space:nowrap}
.dut-mcp-actions{display:flex;align-items:center;gap:2px;flex:none}
.dut-mcp-card-bottom{display:flex;align-items:center;gap:8px;min-width:0}
.dut-mcp-transport{flex:none;font-size:9.5px;font-weight:650;letter-spacing:.06em;text-transform:uppercase;color:var(--dsw-alias-label-tertiary);background:var(--dsw-alias-bg-module-platform);border-radius:5px;padding:2px 6px}
.dut-mcp-cmd{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:var(--dsw-font-markdown-code-block-font-family,Consolas,monospace);font-size:11px;color:var(--dsw-alias-label-tertiary)}
.dut-mcp-empty{padding:38px 16px;text-align:center;font-size:12.5px;line-height:1.6;color:var(--dsw-alias-label-secondary)}
.dut-mcp-alert{margin:12px 16px 0;padding:8px 12px;border-radius:10px;font-size:12px;line-height:1.5;background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 10%,transparent);color:var(--dsw-alias-state-error-primary)}
.dut-mcp-notice{margin:12px 16px 0;padding:8px 12px;border-radius:10px;font-size:12px;line-height:1.5;background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 12%,transparent);color:var(--dsw-alias-state-success-primary)}
.dut-mcp-off{padding:24px 20px;display:grid;gap:14px}
.dut-mcp-off p{margin:0;font-size:12.5px;line-height:1.6;color:var(--dsw-alias-label-secondary)}
.dut-mcp-overlay{z-index:1100;display:flex;position:fixed;inset:0;align-items:center;justify-content:center;padding:24px}
.dut-mcp-mask{position:absolute;inset:0;background:var(--dsw-alias-bg-mask-1);backdrop-filter:var(--dsw-mask-blur)}
.dut-mcp-panel{z-index:1;box-sizing:border-box;display:flex;flex-direction:column;width:800px;max-width:calc(100vw - 48px);height:min(840px,calc(100vh - 48px));overflow:hidden;border-radius:18px;background:var(--dsw-alias-bg-layer-2);box-shadow:var(--dsw-shadow-lv3);--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2)}
.dut-mcp-panel-head{box-sizing:border-box;flex:none;display:flex;align-items:flex-start;gap:12px;padding:20px 18px 10px 22px}
.dut-mcp-panel-heading{display:grid;gap:4px;min-width:0;flex:1}
.dut-mcp-panel-head h2{margin:0;font-size:17px;line-height:1.3;font-weight:650;letter-spacing:-.015em;color:var(--dsw-alias-label-primary)}
.dut-mcp-panel-sub{margin:0;font-size:11.5px;line-height:1.5;color:var(--dsw-alias-label-tertiary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dut-mcp-panel-close{flex:none;display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;padding:0;border:none;border-radius:50%;background:transparent;color:var(--dsw-alias-label-secondary);font-size:13px;cursor:pointer}
.dut-mcp-panel-close:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dut-mcp-tabs{flex:none;display:inline-flex;align-self:flex-start;gap:3px;margin:0 22px 10px;padding:3px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1)}
.dut-mcp-tabs button{border:none;border-radius:7px;padding:5px 14px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12.5px;cursor:pointer}
.dut-mcp-tabs button.dut-mcp-tab-on{background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 12%,transparent);color:var(--dsw-alias-state-business-primary);font-weight:600}
.dut-mcp-form{flex:1;min-height:0;overflow-y:auto;display:grid;align-content:start;gap:12px;padding:2px 22px 20px}
.dut-mcp-section{display:grid;gap:12px;padding:14px 15px 15px;border:1px solid var(--dsw-alias-border-l1);border-radius:14px;background:color-mix(in srgb,var(--dsw-alias-bg-layer-1) 62%,transparent)}
.dut-mcp-section-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0}
.dut-mcp-section-head h3{margin:0;font-size:12.5px;font-weight:650;letter-spacing:.01em;color:var(--dsw-alias-label-primary)}
.dut-mcp-section-hint{flex:1;min-width:180px;font-size:11px;line-height:1.45;color:var(--dsw-alias-label-tertiary)}
.dut-mcp-section .dut-mcp-count{height:20px;padding:0 8px;font-size:10.5px}
.dut-mcp-grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px;align-items:start}
.dut-mcp-grid3{display:grid;grid-template-columns:1.1fr .8fr 1fr;gap:12px;align-items:start}
.dut-mcp-field{display:grid;gap:6px;min-width:0}
.dut-mcp-field>span{font-size:12px;font-weight:600;color:var(--dsw-alias-label-primary)}
.dut-mcp-field small{font-size:11px;line-height:1.5;color:var(--dsw-alias-label-tertiary)}
.dut-mcp-input{box-sizing:border-box;width:100%;height:34px;padding:0 10px;border-radius:9px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px}
.dut-mcp-input:focus{outline:none;border-color:color-mix(in srgb,var(--dsw-alias-state-business-primary) 55%,transparent);box-shadow:0 0 0 2px color-mix(in srgb,var(--dsw-alias-state-business-primary) 10%,transparent)}
.dut-mcp-input:disabled{opacity:.55;cursor:not-allowed}
textarea.dut-mcp-input{height:auto;min-height:70px;padding:8px 10px;line-height:1.5;resize:vertical;font-family:var(--dsw-font-markdown-code-block-font-family,Consolas,monospace);font-size:12px}
textarea.dut-mcp-yaml{min-height:360px}
.dut-mcp-field .dut-seg{width:fit-content;height:34px;box-sizing:border-box;align-items:center}
.dut-mcp-field .dut-seg button{flex:none;height:26px;padding:0 14px;white-space:nowrap}
.dut-mcp-kv{display:grid;gap:6px}
.dut-mcp-kv-head{display:grid;grid-template-columns:minmax(150px,.9fr) minmax(0,1.5fr) 30px;gap:8px;padding:0 2px;font-size:10px;font-weight:650;letter-spacing:.06em;text-transform:uppercase;color:var(--dsw-alias-label-tertiary)}
.dut-mcp-kv-list{display:grid;gap:6px;max-height:238px;overflow-y:auto;padding:2px;scrollbar-width:thin;scrollbar-color:color-mix(in srgb,var(--dsw-alias-label-tertiary) 35%,transparent) transparent}
.dut-mcp-kv-list::-webkit-scrollbar{width:5px}
.dut-mcp-kv-list::-webkit-scrollbar-thumb{background:color-mix(in srgb,var(--dsw-alias-label-tertiary) 35%,transparent);border-radius:4px}
.dut-mcp-kv-row{display:grid;grid-template-columns:minmax(150px,.9fr) minmax(0,1.5fr) 30px;gap:8px;align-items:center}
.dut-mcp-kv-row .dut-mcp-input{height:32px;font-family:var(--dsw-font-markdown-code-block-font-family,Consolas,monospace);font-size:12px}
.dut-mcp-kv-del{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;padding:0;border:none;border-radius:7px;background:transparent;color:var(--dsw-alias-label-tertiary);font-size:11px;cursor:pointer;transition:background .15s ease,color .15s ease}
.dut-mcp-kv-del:hover{color:var(--dsw-alias-state-error-primary);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 10%,transparent)}
.dut-mcp-kv-empty{grid-column:1 / -1;padding:18px 12px;text-align:center;font-size:11.5px;color:var(--dsw-alias-label-tertiary);border:1px dashed var(--dsw-alias-border-l2);border-radius:10px}
.dut-mcp-addrow{display:inline-flex;align-items:center;width:fit-content;height:26px;padding:0 9px;border:1px dashed var(--dsw-alias-border-l2);border-radius:7px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11.5px;cursor:pointer;transition:background .15s ease,color .15s ease,border-color .15s ease}
.dut-mcp-addrow:hover{border-color:color-mix(in srgb,var(--dsw-alias-state-business-primary) 55%,transparent);color:var(--dsw-alias-state-business-primary);background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 7%,transparent)}
.dut-mcp-foot{flex:none;display:flex;align-items:center;justify-content:flex-end;gap:8px;padding:12px 22px 16px;border-top:1px solid var(--dsw-alias-border-l1)}
.dut-mcp-foot .dut-btn{height:30px;padding:0 15px;font-size:12px}
.dut-mcp-error{margin:0 22px 10px;padding:8px 12px;border-radius:10px;font-size:12px;line-height:1.5;background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 10%,transparent);color:var(--dsw-alias-state-error-primary)}`

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
    case 'stopping': return t('mcpStatusStopping')
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
  const [editing, setEditing] = useState<McpServerView | 'new' | null>(null)
  /** Rows with an in-flight enable / disable / remove, held from the click
   * until the poll observes a terminal status. The patch write, the loader
   * reload and the MCP spawn all happen asynchronously (seconds), so without
   * this marker the row looks untouched right after a click. */
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(() => new Set())
  const generation = useMemo(() => ({ current: 0 }), [])
  /** Per-row poll tokens: a new action on one row supersedes its own older
   * poll instead of both polling for the full attempt budget. */
  const pollSeq = useMemo(() => new Map<string, number>(), [])

  const setPending = (id: string, on: boolean): void => {
    setPendingIds(current => {
      if (current.has(id) === on) return current
      const next = new Set(current)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }

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

  // A hand-edited profile patch (or another client's change) reaches the list
  // on the next focus / tab return instead of going stale until remount.
  // Skipped while a row is mid-transition — that row's own poll is refreshing.
  useEffect(() => {
    if (!enabled) return
    const refresh = (): void => {
      if (document.visibilityState === 'visible' && pendingIds.size === 0) load()
    }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, pendingIds])

  const run = (key: string, body: unknown, after?: () => void, onError?: () => void): void => {
    setBusy(key)
    setError(null)
    setNotice(null)
    void mcpRequest<McpSnapshot>({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(() => { after?.() }).catch((reason: unknown) => {
      onError?.()
      setError(reason instanceof Error ? reason.message : String(reason))
    }).finally(() => { setBusy(current => (current === key ? null : current)) })
  }

  /** Re-fetch the list until `stop` reports a settled state (or attempts run
   * out). The DSH patch watcher applies changes asynchronously and an MCP
   * server takes time to spawn/connect, so a single delayed reload can miss the
   * transition. A non-null `id` marks the row's in-flight transition: its token
   * supersedes any older poll for the same row, the delay backs off 500ms→2s,
   * and the pending marker clears when the poll settles (either way). */
  const pollAfter = (id: string | null, stop: (servers: McpServerView[]) => boolean, attempts = 12, interval = 500): void => {
    const token = (pollSeq.get(id ?? '*') ?? 0) + 1
    pollSeq.set(id ?? '*', token)
    const superseded = (): boolean => (pollSeq.get(id ?? '*') ?? 0) !== token
    const settle = (): void => { if (id !== null) setPending(id, false) }
    let left = attempts
    let delay = interval
    const tick = (): void => {
      const gen = ++generation.current
      void mcpRequest<McpSnapshot>().then((snapshot) => {
        if (gen !== generation.current || superseded()) return
        setServers(snapshot.servers)
        left -= 1
        if (left <= 0 || stop(snapshot.servers)) { settle(); return }
        delay = Math.min(delay * 2, 2000)
        window.setTimeout(tick, delay)
      }).catch(() => {
        if (superseded()) return
        left -= 1
        if (left <= 0) { settle(); return }
        delay = Math.min(delay * 2, 2000)
        window.setTimeout(tick, delay)
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
    setPending(id, true)
    run(`remove:${id}`, { action: 'remove', id }, () => {
      setNotice(t('mcpRemoved'))
      pollAfter(id, servers => !servers.some(server => server.id === id), 10)
    }, () => { setPending(id, false) })
  }

  const setEnabled = (id: string, enabled: boolean): void => {
    if (pendingIds.has(id)) return
    setPending(id, true)
    run(`set-enabled:${id}`, { action: 'set-enabled', id, enabled }, () => {
      // Keep refreshing until the target reaches a TERMINAL status. The
      // `disabled` flag flips within ~1s, but the MCP spawn + connect takes
      // longer — stopping at the flag would freeze the row mid-transition.
      pollAfter(id, servers => {
        const target = servers.find(server => server.id === id)
        if (target === undefined) return true
        return enabled
          ? target.status === 'active' || target.status === 'failed'
          : target.status === 'disabled' || target.status === 'stopped'
      }, 45)
    }, () => { setPending(id, false) })
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
  const activeCount = list.filter(server => server.status === 'active').length
  return (
    <div className="dut-mcp">
      <div className="dut-panel dut-mcp-shell">
        <div className="dut-mcp-head">
          <div className="dut-mcp-heading">
            <div className="dut-mcp-titleline">
              <h2>{t('mcpTitle')}</h2>
              <span className="dut-mcp-count dut-mcp-count-ok">{activeCount} {t('mcpStatusActive')}</span>
            </div>
            <p className="dut-mcp-desc">{t('mcpServerDetail')}</p>
          </div>
          <button type="button" className="dut-mcp-add" onClick={() => { setEditing('new') }}>+ {t('mcpAdd')}</button>
        </div>
        {error !== null ? <div className="dut-mcp-alert">{error}</div> : null}
        {notice !== null ? <div className="dut-mcp-notice">{notice}</div> : null}
        <div className="dut-mcp-body">
          {servers === null ? (
            <div className="dut-mcp-empty">{t('loading')}</div>
          ) : list.length === 0 ? (
            <div className="dut-mcp-empty">{t('mcpEmpty')}</div>
          ) : list.map(server => {
            const command = server.url !== undefined ? server.url : [server.command, ...server.args].filter(Boolean).join(' ')
            const pending = pendingIds.has(server.id)
            return (
              <article className="dut-mcp-card" key={server.id}>
                <div className="dut-mcp-card-top">
                  <div className="dut-mcp-card-info">
                    <span className="dut-mcp-name" title={server.serverName}>{server.serverName}</span>
                    <span className={'dut-mcp-badge' + statusClass(server.status)}>{statusLabel(server.status, t)}</span>
                    <span
                      className="dut-mcp-tools-count"
                      title={server.tools.length > 0 ? server.tools.join('\n') : undefined}
                    >
                      {server.toolCount} {t('mcpTools')}
                    </span>
                  </div>
                  <div className="dut-mcp-actions">
                    <button type="button" className="dut-mcp-btn" disabled={busy !== null || pending} onClick={() => { setEnabled(server.id, server.disabled) }}>{pending ? '…' : server.disabled ? t('mcpEnabledAction') : t('mcpDisabledAction')}</button>
                    <button type="button" className="dut-mcp-btn" disabled={busy !== null || pending} onClick={() => { setEditing(server) }}>{t('mcpEdit')}</button>
                    <button
                      type="button"
                      className={'dut-mcp-btn dut-mcp-del' + (confirmId === server.id ? ' dut-mcp-confirm' : '')}
                      disabled={busy !== null || pending}
                      onClick={() => { remove(server.id) }}
                    >
                      {confirmId === server.id ? t('mcpDelete') + '?' : t('mcpDelete')}
                    </button>
                  </div>
                </div>
                <div className="dut-mcp-card-bottom">
                  <span className="dut-mcp-transport">{server.transport === 'streamable-http' ? 'HTTP' : 'STDIO'}</span>
                  <code className="dut-mcp-cmd" title={command}>{command}</code>
                </div>
              </article>
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
          onSaved={() => { setEditing(null); setNotice(t('mcpSaved')); pollAfter(null, () => false, 10) }}
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
  const [envRows, setEnvRows] = useState<KeyValueRow[]>(() => recordToRows(initial?.env ?? {}))
  const [url, setUrl] = useState(initial?.url ?? '')
  const [headerRows, setHeaderRows] = useState<KeyValueRow[]>(() => recordToRows(initial?.headers ?? {}))
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
        if (transport === 'stdio') env = rowsToRecord(envRows, t)
        else headers = rowsToRecord(headerRows, t)
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
          <div className="dut-mcp-panel-heading">
            <h2>{isEdit ? t('mcpEditTitle') : t('mcpAddTitle')}</h2>
            <p className="dut-mcp-panel-sub">{isEdit ? `${initial.id} · ${initial.transport}` : t('mcpEditorHint')}</p>
          </div>
          <button type="button" className="dut-mcp-panel-close" onClick={onClose} aria-label="✕">✕</button>
        </div>
        <div className="dut-mcp-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={mode === 'form'} className={mode === 'form' ? 'dut-mcp-tab-on' : ''} onClick={() => { setMode('form') }}>{t('mcpFormTab')}</button>
          <button type="button" role="tab" aria-selected={mode === 'yaml'} className={mode === 'yaml' ? 'dut-mcp-tab-on' : ''} onClick={() => { setMode('yaml') }}>{t('mcpYamlTab')}</button>
        </div>
        {error !== null ? <div className="dut-mcp-error">{error}</div> : null}
        {mode === 'yaml' ? (
          <div className="dut-mcp-form">
            <div className="dut-mcp-section">
              <div className="dut-mcp-grid2">
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
          </div>
        ) : (
          <div className="dut-mcp-form">
            <section className="dut-mcp-section">
              <div className="dut-mcp-section-head">
                <h3>{t('mcpBasicSection')}</h3>
              </div>
              <div className="dut-mcp-grid2">
                <div className="dut-mcp-field">
                  <span>{t('mcpFieldId')}</span>
                  <input className="dut-mcp-input" value={id} disabled={isEdit} onChange={event => { setId(event.target.value) }} />
                  <small>{t('mcpFieldIdHint')}</small>
                </div>
                <div className="dut-mcp-field">
                  <span>{t('mcpFieldName')}</span>
                  <input className="dut-mcp-input" value={serverName} onChange={event => { setServerName(event.target.value) }} />
                  <small>{t('mcpFieldNameHint')}</small>
                </div>
              </div>
              <div className="dut-mcp-grid3">
                <div className="dut-mcp-field">
                  <span>{t('mcpFieldType')}</span>
                  <div className="dut-seg">
                    <button type="button" className={transport === 'stdio' ? 'dut-seg-active' : ''} onClick={() => { setTransport('stdio') }}>stdio</button>
                    <button type="button" className={transport === 'streamable-http' ? 'dut-seg-active' : ''} onClick={() => { setTransport('streamable-http') }}>HTTP</button>
                  </div>
                </div>
                <div className="dut-mcp-field">
                  <span>{t('mcpFieldTimeout')}</span>
                  <input className="dut-mcp-input" inputMode="numeric" value={timeoutText} placeholder="60000" onChange={event => { setTimeoutText(event.target.value) }} />
                </div>
                <div className="dut-mcp-field">
                  <span>{t('mcpFieldEnabled')}</span>
                  <div className="dut-seg">
                    <button type="button" className={!disabled ? 'dut-seg-active' : ''} onClick={() => { setDisabled(false) }}>{t('mcpEnabledAction')}</button>
                    <button type="button" className={disabled ? 'dut-seg-active' : ''} onClick={() => { setDisabled(true) }}>{t('mcpDisabledAction')}</button>
                  </div>
                </div>
              </div>
            </section>
            <section className="dut-mcp-section">
              <div className="dut-mcp-section-head">
                <h3>{t('mcpConnectionSection')}</h3>
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
                </>
              ) : (
                <>
                  <div className="dut-mcp-field">
                    <span>{t('mcpFieldUrl')}</span>
                    <input className="dut-mcp-input" value={url} placeholder="https://mcp.example.com/sse" onChange={event => { setUrl(event.target.value) }} />
                  </div>
                  <div className="dut-mcp-field">
                    <div className="dut-mcp-section-head">
                      <span>{t('mcpFieldHeaders')}</span>
                      <span className="dut-mcp-count">{headerRows.length}</span>
                      <span className="dut-mcp-section-hint">{t('mcpHeadersHint')}</span>
                    </div>
                    <KeyValueEditor
                      rows={headerRows}
                      onChange={setHeaderRows}
                      keyTitle="HEADER"
                      valueTitle="VALUE"
                      keyPlaceholder={t('mcpHeaderKeyPlaceholder')}
                      valuePlaceholder={t('mcpValuePlaceholder')}
                      emptyText={t('mcpHeadersEmpty')}
                      addText={t('mcpAddHeader')}
                      removeText={t('mcpRemoveRow')}
                    />
                  </div>
                </>
              )}
            </section>
            {transport === 'stdio' ? (
              <section className="dut-mcp-section">
                <div className="dut-mcp-section-head">
                  <h3>{t('mcpFieldEnv')}</h3>
                  <span className="dut-mcp-count">{envRows.length}</span>
                  <span className="dut-mcp-section-hint">{t('mcpEnvHint')}</span>
                </div>
                <KeyValueEditor
                  rows={envRows}
                  onChange={setEnvRows}
                  keyTitle="KEY"
                  valueTitle="VALUE"
                  keyPlaceholder={t('mcpKeyPlaceholder')}
                  valuePlaceholder={t('mcpValuePlaceholder')}
                  emptyText={t('mcpEnvEmpty')}
                  addText={t('mcpAddEnv')}
                  removeText={t('mcpRemoveRow')}
                />
              </section>
            ) : null}
          </div>
        )}
        <div className="dut-mcp-foot">
          <button type="button" className="dut-mcp-btn" disabled={busy} onClick={onClose}>{t('mcpCancel')}</button>
          <button type="button" className="dut-btn dut-btn-active" disabled={busy} onClick={save}>{busy ? '…' : t('mcpSave')}</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
