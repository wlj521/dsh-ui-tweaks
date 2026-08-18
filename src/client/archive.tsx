/**
 * dsh-ui-tweaks — Archive manager (browser half).
 *
 * Renders the "归档" settings section (shown in the Settings dialog; usable
 * when the `archiveManagerEnabled` toggle in 界面调整 is on — otherwise it
 * shows an invite card with a one-click enable). The section lists every
 * archived session — enriched from the framework `useSessions` /
 * `useWorkspaces` feeds — with per-row actions and batch actions that go
 * through the same-origin archive route (`/_dsh/ui-tweaks/archive`):
 *
 * - **恢复** (Restore): remove the session from the archive set — its log and
 *   workspace slot are kept, so the conversation reappears in the normal
 *   sidebar list.
 * - **删除** (Delete): PERMANENTLY delete the session — the server removes its
 *   durable log, workspace accounting, archive-set entry and caches; the list
 *   then refreshes so the row (and the session itself) disappear.
 * - **全部恢复 / 全部删除**: the same actions for every archived session.
 *
 * Live (open/running) sessions are refused by the server; the client maps the
 * `session-live` error code to localized copy.
 * @module dsh-ui-tweaks/client/archive
 */

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { ISessions, SessionListState, SessionSummary, WorkspaceListState } from '@deepseek-ai/dsh-client-runtime/client'
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import type { SettingsClient } from './index.tsx'

/** Route matching the host half (src/archive.ts). */
const ARCHIVE_ROUTE = '/_dsh/ui-tweaks/archive'

/** Locale keys the Archive manager reads off the `ui-tweaks` dictionary. */
type ArchiveLabelKey =
  | 'archiveNav' | 'archiveTitle' | 'archiveEmpty' | 'archiveRestore' | 'archiveRestoring'
  | 'archiveDelete' | 'archiveDeleteAll' | 'archiveRestoreAll'
  | 'archiveCount' | 'archiveUnavailable' | 'archiveLiveError' | 'archiveDisabledHint'
  | 'archiveEnable' | 'archiveRestored' | 'unavailable'

type Translate = (key: ArchiveLabelKey) => string

interface ApiSuccess<T> { ok: true; value: T }
interface ApiFailure { ok: false; error: { code: string; message: string } }

interface ArchiveSnapshot {
  archivedSessionIds: string[]
}

/** Fetch one archive route call, attaching the server error code when present. */
async function archiveRequest<T>(init?: RequestInit): Promise<T> {
  const response = await fetch(ARCHIVE_ROUTE, { credentials: 'same-origin', ...init })
  let body: ApiSuccess<T> | ApiFailure | undefined
  try {
    body = await response.json() as ApiSuccess<T> | ApiFailure
  } catch {
    // Non-JSON response (e.g. the route is not mounted yet) — fall through to
    // a clean error instead of a JSON-parse exception.
    body = undefined
  }
  if (!response.ok || body === undefined || !body.ok) {
    const failure = body as ApiFailure | undefined
    const error = new Error(failure?.error?.message ?? `UI Tweaks archive request failed with HTTP ${response.status}`) as Error & { code: string | undefined }
    error.code = failure?.error?.code
    throw error
  }
  return body.value
}

/** Map a thrown archive error to user-facing copy. */
function errorMessage(error: unknown, t: Translate): string {
  const code = (error as { code?: string } | null)?.code
  if (code === 'session-live') return t('archiveLiveError')
  return error instanceof Error ? error.message : String(error)
}

/** Re-pull the host session list after a permanent delete (the outward
 * ISessions face omits refresh; the concrete runtime provides it). */
function refreshSessions(sessionsService: ISessions): void {
  void (sessionsService as unknown as { refresh(): Promise<void> }).refresh()
}

/** Workspace display title: the path's last non-empty segment. */
function basenameOf(path: string | undefined): string {
  if (path === undefined || path === '') return ''
  const cleaned = path.replace(/[\\/]+$/u, '')
  const segments = cleaned.split(/[\\/]/u)
  return segments.at(-1) ?? ''
}

/** Locale-aware relative time for a past timestamp, e.g. "3小时前". */
function relativeTime(ms: number, now: number, formatter: Intl.RelativeTimeFormat): string {
  const diffSeconds = Math.round((ms - now) / 1000)
  const abs = Math.abs(diffSeconds)
  if (abs < 60) return formatter.format(diffSeconds, 'second')
  if (abs < 3600) return formatter.format(Math.round(diffSeconds / 60), 'minute')
  if (abs < 86400) return formatter.format(Math.round(diffSeconds / 3600), 'hour')
  if (abs < 604800) return formatter.format(Math.round(diffSeconds / 86400), 'day')
  return formatter.format(Math.round(diffSeconds / 604800), 'week')
}

export const ARCHIVE_CSS = `
.dut-arc{display:grid;gap:12px;max-width:680px;padding:6px 2px 36px}
.dut-arc-head{display:flex;align-items:center;gap:10px;padding:14px 16px 0}
.dut-arc-head h2{margin:0;font-size:15px;font-weight:600;letter-spacing:-.01em;color:var(--dsw-alias-label-primary)}
.dut-arc-count{font-size:11.5px;color:var(--dsw-alias-label-secondary);padding:2px 8px;border-radius:999px;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1)}
.dut-arc-spacer{flex:1}
.dut-arc-btn{display:inline-flex;align-items:center;height:28px;padding:0 12px;border-radius:999px;border:1px solid var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;cursor:pointer;transition:background .15s ease,color .15s ease,border-color .15s ease}
.dut-arc-btn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dut-arc-btn:disabled{opacity:.5;cursor:default}
.dut-arc-btn.dut-arc-del:hover{border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary) 55%,transparent);color:var(--dsw-alias-state-error-primary);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 10%,transparent)}
.dut-arc-btn.dut-arc-confirm{border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary) 55%,transparent);color:var(--dsw-alias-state-error-primary);font-weight:600}
.dut-arc-body{display:grid;gap:2px;margin-top:4px}
.dut-arc-row{display:flex;align-items:center;gap:8px;padding:10px 16px;border-radius:12px}
.dut-arc-row:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dut-arc-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;text-align:left;background:transparent;border:none;padding:0;cursor:default;color:var(--dsw-alias-label-primary);font:inherit}
.dut-arc-title{font-size:13.5px;font-weight:600;white-space:nowrap;text-overflow:ellipsis;overflow:hidden}
.dut-arc-sub{font-size:11.5px;color:var(--dsw-alias-label-secondary);white-space:nowrap;text-overflow:ellipsis;overflow:hidden}
.dut-arc-empty{padding:32px 16px;text-align:center;font-size:12.5px;color:var(--dsw-alias-label-secondary)}
.dut-arc-alert{margin:8px 16px 0;padding:8px 12px;border-radius:10px;font-size:12px;line-height:1.5;background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 10%,transparent);color:var(--dsw-alias-state-error-primary)}
.dut-arc-off{padding:20px 16px;display:grid;gap:12px}
.dut-arc-off p{margin:0;font-size:12.5px;line-height:1.6;color:var(--dsw-alias-label-secondary)}
`

/** Install the Archive stylesheet once (idempotent); returns the disposer. */
export function installArchiveStyles(): () => void {
  const id = 'dsh-ui-tweaks-archive'
  const existing = document.querySelector(`style[data-plugin-css="${id}"]`)
  if (existing !== null) return () => {}
  const style = document.createElement('style')
  style.dataset.plugin = 'dsh-ui-tweaks'
  style.dataset.pluginCss = id
  style.textContent = ARCHIVE_CSS
  document.head.appendChild(style)
  return () => { style.remove() }
}

/** One archived session row: the id plus the enriched session summary, when listed. */
interface ArchiveRow {
  id: string
  summary: SessionSummary | undefined
}

export interface ArchiveSectionProps {
  controller: SettingsClient
  t: Translate
  sessionsService: ISessions
  /** Framework standard feeds: session list + workspace archive set. */
  useSessions: SnapshotSelectorHook<SessionListState>
  useWorkspaces: SnapshotSelectorHook<WorkspaceListState>
}

export function ArchiveSection({ controller, t, sessionsService, useSessions, useWorkspaces }: ArchiveSectionProps) {
  const settingsState = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot)
  const enabled = settingsState.value?.archiveManagerEnabled === true
  const sessions = useSessions(state => state)
  const workspaces = useWorkspaces(state => state)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [confirmAll, setConfirmAll] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const timeFormatter = useMemo(() => new Intl.RelativeTimeFormat(navigator.language, { numeric: 'auto' }), [])
  const now = Date.now()

  useEffect(() => {
    if (confirmId === null) return
    const timer = window.setTimeout(() => { setConfirmId(current => (current === confirmId ? null : current)) }, 3000)
    return () => { window.clearTimeout(timer) }
  }, [confirmId])
  useEffect(() => {
    if (!confirmAll) return
    const timer = window.setTimeout(() => { setConfirmAll(false) }, 3000)
    return () => { window.clearTimeout(timer) }
  }, [confirmAll])

  const rows: ArchiveRow[] = useMemo(() => {
    const byId = sessions.byId
    return workspaces.archivedSessionIds.map(id => ({ id, summary: byId[id] })).sort((a, b) => {
      const ta = a.summary?.updatedAt ?? 0
      const tb = b.summary?.updatedAt ?? 0
      return tb - ta
    })
  }, [workspaces.archivedSessionIds, sessions.byId])

  const run = (key: string, body: unknown, after?: () => void): void => {
    setBusy(key)
    setError(null)
    void archiveRequest<ArchiveSnapshot>({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(() => { after?.() }).catch((reason: unknown) => {
      setError(errorMessage(reason, t))
    }).finally(() => { setBusy(current => (current === key ? null : current)) })
  }

  const restore = (id: string): void => {
    run(`restore:${id}`, { action: 'restore', sessionId: id })
  }

  const remove = (id: string): void => {
    if (confirmId !== id) {
      setConfirmId(id)
      return
    }
    setConfirmId(null)
    run(`delete:${id}`, { action: 'delete', sessionId: id }, () => { refreshSessions(sessionsService) })
  }

  const restoreAll = (): void => {
    run('restore-all', { action: 'restore-all' })
  }

  const removeAll = (): void => {
    if (!confirmAll) {
      setConfirmAll(true)
      return
    }
    setConfirmAll(false)
    run('delete-all', { action: 'delete-all' }, () => { refreshSessions(sessionsService) })
  }

  if (!enabled) {
    return (
      <div className="dut-arc">
        <div className="dut-panel dut-arc-off">
          <p>{t('archiveDisabledHint')}</p>
          <div>
            <button type="button" className="dut-btn dut-btn-active" onClick={() => {
              void controller.set('archiveManagerEnabled', true).catch(() => { setError(t('unavailable')) })
            }}>{t('archiveEnable')}</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="dut-arc">
      <div className="dut-panel">
        <div className="dut-arc-head">
          <h2>{t('archiveTitle')}</h2>
          <span className="dut-arc-count">{rows.length} {t('archiveCount')}</span>
          <span className="dut-arc-spacer" />
          {rows.length > 1 ? (
            <>
              <button type="button" className="dut-arc-btn" disabled={busy !== null} onClick={restoreAll}>{busy === 'restore-all' ? t('archiveRestoring') : t('archiveRestoreAll')}</button>
              <button type="button" className={'dut-arc-btn dut-arc-del' + (confirmAll ? ' dut-arc-confirm' : '')} disabled={busy !== null} onClick={removeAll}>{busy === 'delete-all' ? t('archiveDeleteAll') + '…' : confirmAll ? t('archiveDeleteAll') + '?' : t('archiveDeleteAll')}</button>
            </>
          ) : null}
        </div>
        {error !== null ? <div className="dut-arc-alert">{error}</div> : null}
        <div className="dut-arc-body">
          {rows.length === 0 ? (
            <div className="dut-arc-empty">{t('archiveEmpty')}</div>
          ) : rows.map(row => {
            const summary = row.summary
            const title = summary?.displayTitle ?? row.id
            const sub = [basenameOf(summary?.cwd), summary !== undefined ? relativeTime(summary.updatedAt, now, timeFormatter) : ''].filter(Boolean).join(' · ')
            return (
              <div className="dut-arc-row" key={row.id}>
                <div className="dut-arc-main" title={title}>
                  <span className="dut-arc-title">{title}</span>
                  {sub !== '' ? <span className="dut-arc-sub">{sub}</span> : null}
                </div>
                <button type="button" className="dut-arc-btn" disabled={busy !== null} onClick={() => { restore(row.id) }}>{busy === `restore:${row.id}` ? t('archiveRestoring') : t('archiveRestore')}</button>
                <button
                  type="button"
                  className={'dut-arc-btn dut-arc-del' + (confirmId === row.id ? ' dut-arc-confirm' : '')}
                  disabled={busy !== null}
                  onClick={() => { remove(row.id) }}
                >
                  {busy === `delete:${row.id}` ? t('archiveDelete') + '…' : confirmId === row.id ? t('archiveDelete') + '?' : t('archiveDelete')}
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
