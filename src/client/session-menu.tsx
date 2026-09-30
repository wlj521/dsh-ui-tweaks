/**
 * dsh-ui-tweaks — session-row delete row (browser half).
 *
 * One entry of the host's session "..." menu in the left sidebar, the
 * `sidebar.workspaces.session.menu.item` slot declared by
 * `@deepseek-ai/dsh-client-ui-workspace`. The slot is a `list` whose owner
 * passes `{ sessionId, displayTitle }` and whose declared hooks bind
 * `useMenuOpenState`; the shipped rows (pin 100, rename 200, fork 300,
 * archive 400) are ordinary entries of the same list, so this row lands after
 * them by its own `order` and joins the menu's DOM-driven keyboard walk as a
 * plain `role="menuitem"` button.
 *
 * The action is the SAME permanent delete the Archive settings section
 * exposes: the host has no session-delete API at any layer (client services,
 * RPC, the persistence seam), so the row posts to the plugin's own same-origin
 * archive route (`/_dsh/ui-tweaks/archive`, `{ action: 'delete' }`).
 *
 * Two clicks, no dialog: the first arms the row ("确认删除?"), the second one
 * deletes. The armed state expires after {@link CONFIRM_TIMEOUT_MS}, mirroring
 * the Archive panel's own two-step delete. A running session is refused by the
 * server (`session-live`) — the menu then stays OPEN and the reason is printed
 * under the row, because a closed menu could not show it.
 *
 * The row reproduces `ui-primitives`' `MenuItemButton` markup and styling
 * (that package is outside this plugin's `dsh.client.inject` whitelist, so the
 * recipe is re-implemented from `Menu.module.css` with the same theme tokens).
 * @module dsh-ui-tweaks/client/session-menu
 */

import { useEffect, useState } from 'react'
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only import activates the ui-workspace slot declarations, including the
// `sidebar.workspaces.session.menu.item` contract this entry fills.
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type { SettingsClient } from './index.tsx'
import { archiveErrorCode, deleteSessionForever, refreshSessions } from './archive.tsx'

/** Registration id: package-namespaced, so it never shadows a shipped row. */
export const SESSION_DELETE_MENU_ID = 'dsh-ui-tweaks/session-delete'

/** Order after the shipped rows (pin 100 / rename 200 / fork 300 / archive 400). */
export const SESSION_DELETE_MENU_ORDER = 500

/** How long the armed ("确认删除?") state holds before reverting. */
const CONFIRM_TIMEOUT_MS = 3000

/** Business share this entry's own inject face hands the component. */
export interface SessionDeleteInjected {
  /** Injected: the ui-tweaks settings store (reads `archiveManagerEnabled`). */
  controller: SettingsClient
  /** Injected: the client sessions service, re-pulled after a delete. */
  sessionsService: ISessions
}

/** Slot props: owner share + the bound menu hook + this entry's inject share + locale. */
export type SessionDeleteMenuProps = PropsRuntime<'sidebar.workspaces.session.menu.item'>
  & InjectFace<SessionDeleteInjected>
  & PropsLocale<'ui-tweaks'>

export const SESSION_MENU_CSS = `
/* One row of the host's session "..." menu, matching ui-primitives'
 * MenuItemButton markup (Menu.module.css .itemWrap/.item/.itemIcon/.itemLabel)
 * so this row is indistinguishable from the shipped pin / rename / fork /
 * archive rows around it. */
.dut-sdm-wrap{position:relative}
.dut-sdm-item{display:flex;align-items:center;gap:6px;width:100%;min-height:34px;padding:6px 8px;border:none;border-radius:var(--dsw-radius-md);background:transparent;cursor:pointer;font:inherit;font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary);text-align:left}
.dut-sdm-item:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.dut-sdm-item:focus-visible:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);outline:none}
.dut-sdm-item:disabled{opacity:.4;cursor:not-allowed}
.dut-sdm-icon{display:inline-flex;flex:none;width:14px;height:14px;align-items:center;justify-content:center;color:var(--dsw-alias-menu-icon)}
.dut-sdm-icon svg{width:14px;height:14px}
.dut-sdm-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dut-sdm-sep{height:.5px;margin:3px 2px;background:var(--dsw-alias-border-l2)}
/* Destructive row: the host's own danger recipe (Menu.module.css .danger). */
.dut-sdm-danger{color:var(--dsw-alias-state-error-primary)}
.dut-sdm-danger .dut-sdm-icon{color:var(--dsw-alias-state-error-primary)}
.dut-sdm-danger:hover:not(:disabled),.dut-sdm-danger:focus-visible:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-danger)}
/* Inline refusal: the menu stays open when the delete is rejected, so the
 * reason has to live in the row that was clicked (the icon column's width plus
 * the row's padding indents it under the label). */
.dut-sdm-note{padding:0 8px 6px 28px;font-size:11px;line-height:15px;color:var(--dsw-alias-state-error-primary)}
`

/** Install the session-menu stylesheet once (idempotent); returns the disposer. */
export function installSessionMenuStyles(): () => void {
  const id = 'dsh-ui-tweaks-session-menu'
  const existing = document.querySelector(`style[data-plugin-css="${id}"]`)
  if (existing !== null) return () => {}
  const style = document.createElement('style')
  style.dataset.plugin = 'dsh-ui-tweaks'
  style.dataset.pluginCss = id
  style.textContent = SESSION_MENU_CSS
  document.head.appendChild(style)
  return () => { style.remove() }
}

/**
 * The trash glyph from `ui-primitives`' `IconTrashOutlineRegular` (16px viewBox,
 * `currentColor`, 1px stroke), redrawn here because that package is not
 * injectable; the artwork paths are copied verbatim so the row's icon matches
 * the host's own destructive rows.
 */
function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" strokeWidth="1">
      <path d="M1.28149 3.88831H14.7187" stroke="currentColor" />
      <path d="M5.41602 3.88833V2.47962C5.41602 2.29282 5.52492 2.11366 5.71876 1.98157C5.9126 1.84948 6.17551 1.77527 6.44964 1.77527H9.55053C9.82466 1.77527 10.0876 1.84948 10.2814 1.98157C10.4753 2.11366 10.5842 2.29282 10.5842 2.47962V3.88833" stroke="currentColor" />
      <path d="M2.57349 3.88831L3.19366 13.2943C3.21937 13.5502 3.33952 13.7872 3.53065 13.9593C3.72178 14.1313 3.97016 14.2259 4.22729 14.2246H11.7728C12.0299 14.2259 12.2783 14.1313 12.4694 13.9593C12.6605 13.7872 12.7807 13.5502 12.8064 13.2943L13.4266 3.88831" stroke="currentColor" />
      <path d="M6.44946 6.98926V11.1238" stroke="currentColor" />
      <path d="M9.55054 6.98926V11.1238" stroke="currentColor" />
    </svg>
  )
}

/**
 * One "删除会话" row: first click arms the confirmation, the second deletes.
 * A rejection keeps the menu open and prints the reason under the row.
 * @param props - owner share, the bound menu-open hook, the injected share and the translator.
 * @returns the menu row (plus a hairline before it and the refusal note when present).
 */
export function SessionDeleteMenuItem({ sessionId, useMenuOpenState, sessionsService, t }: SessionDeleteMenuProps) {
  const [, setMenuOpen] = useMenuOpenState()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  // Disarm on timeout, like the Archive panel's own two-step delete. The row
  // unmounts with the menu, so leaving the menu clears the state anyway.
  useEffect(() => {
    if (!confirming) return
    const timer = window.setTimeout(() => { setConfirming(false) }, CONFIRM_TIMEOUT_MS)
    return () => { window.clearTimeout(timer) }
  }, [confirming])

  const activate = (): void => {
    if (busy) return
    if (!confirming) {
      setNote(null)
      setConfirming(true)
      return
    }
    setConfirming(false)
    setBusy(true)
    void deleteSessionForever(String(sessionId)).then(() => {
      // The row leaves with the menu; the host then relays the removal to the
      // list, and the refresh covers the archival/accounting side effects.
      setMenuOpen(false)
      refreshSessions(sessionsService)
    }).catch((reason: unknown) => {
      setBusy(false)
      // Keep the menu open: the reason has to stay readable.
      setNote(archiveErrorCode(reason) === 'session-live' ? t('menuDeleteRunning') : t('menuDeleteFailed'))
    })
  }

  const label = busy ? t('menuDeleting') : confirming ? t('menuDeleteConfirm') : t('menuDeleteSession')
  return (
    <div className="dut-sdm-wrap">
      <div className="dut-sdm-sep" role="separator" />
      <button
        type="button"
        role="menuitem"
        className="dut-sdm-item dut-sdm-danger"
        disabled={busy}
        onClick={activate}
      >
        <span className="dut-sdm-icon"><TrashIcon /></span>
        <span className="dut-sdm-label">{label}</span>
      </button>
      {note !== null ? <div className="dut-sdm-note" role="alert">{note}</div> : null}
    </div>
  )
}
