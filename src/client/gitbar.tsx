/**
 * dsh-ui-tweaks — GitBar (browser half).
 *
 * Three compact DSH-native pills above the composer (`conversation.input.dock`):
 *
 * - **branch** (left): current branch; opens a popup with local/remote branches
 *   and a new-branch field.
 * - **diff** (right): ±line counts; opens a right slide-over panel with the
 *   changed-file list and per-file diff (changed hunks by default, whole file
 *   on toggle).
 * - **commit message** (right): opens a dialog with a message field, the list
 *   of files to commit, and 提交 / 提交并推送 actions; clicking a file opens the
 *   diff panel focused on it.
 *
 * All colors ride the DSH theme tokens (`--dsw-alias-*`), so light and dark
 * both work. The bar renders nothing when the setting is off, the session has
 * no cwd, or the directory is not a git repository.
 * @module dsh-ui-tweaks/client/gitbar
 */

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type { SettingsClient } from './index.tsx'

/** Route prefix matching the host half (src/git-web.ts). */
const GIT_ROUTE = '/_dsh/ui-tweaks/git'

/** Poll interval for the status snapshot, in ms. */
const POLL_MS = 10000

/** Locale keys the GitBar reads off the `ui-tweaks` dictionary. */
type GitBarLabelKey =
  | 'commitMessage' | 'diffFiles' | 'branchLocal' | 'branchRemote' | 'branchNew'
  | 'branchNewPlaceholder' | 'branchCreate' | 'diffTitle' | 'diffOnly' | 'diffFull'
  | 'commitTitle' | 'commitPlaceholder' | 'commitHint' | 'commitWillCommit' | 'commitViewDiff'
  | 'commitGenerate' | 'commitCancel' | 'commitSubmit' | 'commitSubmitPush'
  | 'dirty' | 'clean' | 'noChanges' | 'loading' | 'branchDelete' | 'branchDeleteConfirm'
  | 'includeFile' | 'excludeFile' | 'branchPushRemote'

type Translate = (key: GitBarLabelKey) => string

interface ApiSuccess<T> { ok: true; value: T }
interface ApiFailure { ok: false; error: { code: string; message: string } }

interface GitFileChange {
  path: string
  status: string
  added: number
  deleted: number
  untracked: boolean
}

interface GitSnapshot {
  isRepo: boolean
  cwd?: string
  branch: string | null
  detachedHead?: string
  upstream?: string
  ahead: number
  behind: number
  hasRemote: boolean
  clean: boolean
  files: GitFileChange[]
  totalAdded: number
  totalDeleted: number
}

interface GitBranches {
  current: string | null
  local: string[]
  remote: string[]
}

interface DiffLine {
  type: 'hunk' | 'add' | 'del' | 'ctx'
  old: number | null
  new: number | null
  text: string
}

interface GitDiffResult {
  path: string
  mode: 'hunk' | 'full'
  lines: DiffLine[]
  truncated: boolean
}

async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(path, { credentials: 'same-origin' })
  const body = await response.json() as ApiSuccess<T> | ApiFailure
  if (!response.ok || !body.ok) {
    const failure = body as ApiFailure
    throw new Error(failure.error?.message ?? `Git request failed with HTTP ${response.status}`)
  }
  return body.value
}

async function apiPost<T>(path: string, payload: unknown): Promise<T> {
  const response = await fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const body = await response.json() as ApiSuccess<T> | ApiFailure
  if (!response.ok || !body.ok) {
    const failure = body as ApiFailure
    throw new Error(failure.error?.message ?? `Git action failed with HTTP ${response.status}`)
  }
  return body.value
}

// ---------------------------------------------------------------------------
// GitBar styles — DSH theme tokens only (light + dark).
// ---------------------------------------------------------------------------

export const GITBAR_CSS = `
/* DSH does not force border-box globally; normalize it for the whole GitBar
   subtree (including the body-portaled panels/modal), or widths overflow. */
.gbar,.gbar *,.gbar-side,.gbar-side *,.gbar-modal-wrap,.gbar-modal-wrap *,.gbar-notice,.gbar-notice *{box-sizing:border-box}
.gbar{
  display:flex;align-items:center;gap:6px;flex-wrap:wrap;position:relative;justify-content:space-between;padding:0 6px 0 0;
  /* Align the pill row inside the composer's tool row: the branch pill's left
     sits near the "+" button's right edge and the commit pill's right near the
     send button's left edge. The composer card is inset 16px from the column
     and its tool row adds the button widths — about 60px of inset per side
     here. buildRuntimeCss overrides the cap (!important) when the dialog
     width changes. */
  width:calc(100% - 120px);max-width:706px;margin-inline:auto;
  /* Solid background: messages scroll behind the sticky composer seat, and a
     transparent row would let text show through the pills. */
  background:var(--dsw-alias-bg-layer-1);
}
.gbar-right{display:inline-flex;align-items:center;gap:6px;flex-wrap:wrap}
.gbar-pill{
  display:inline-flex;align-items:center;gap:6px;
  height:26px;padding:0 10px;
  background:var(--dsw-alias-bg-module-platform);
  border:1px solid var(--dsw-alias-border-l2);
  border-radius:8px;
  color:var(--dsw-alias-label-primary);
  font:inherit;font-size:12.5px;line-height:1;
  cursor:pointer;
  transition:background .15s ease,border-color .15s ease;
  white-space:nowrap;
  -webkit-user-select:none;user-select:none;
}
.gbar-pill:hover{background:var(--dsw-alias-interactive-bg-hover-solid)}
.gbar-pill .gbar-ico{width:13px;height:13px;flex:none;opacity:.85}
.gbar-pill .gbar-caret{font-size:8px;color:var(--dsw-alias-label-tertiary);margin-left:1px}
.gbar-pill .gbar-dot{width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-state-warn-primary);flex:none}
.gbar-pill .gbar-add{color:var(--dsw-alias-state-success-primary);font-weight:600;font-variant-numeric:tabular-nums}
.gbar-pill .gbar-del{color:var(--dsw-alias-state-error-primary);font-weight:600;font-variant-numeric:tabular-nums}
.gbar-pill .gbar-meta{color:var(--dsw-alias-label-secondary)}
.gbar-pill .gbar-hint{color:var(--dsw-alias-label-tertiary);font-weight:400}
.gbar-pill.gbar-active{background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 12%,var(--dsw-alias-bg-module-platform));color:var(--dsw-alias-state-business-primary)}
.gbar-pill.gbar-active .gbar-hint{color:var(--dsw-alias-state-business-primary)}
.gbar-pill:disabled{opacity:.5;cursor:default}

/* branch popup — opens upward so the composer below stays uncovered */
.gbar-pop{
  position:absolute;left:0;bottom:calc(100% + 6px);z-index:90;
  width:286px;max-height:min(360px,calc(100vh - 140px));overflow:hidden auto;
  background:var(--dsw-alias-bg-layer-1);
  border:1px solid var(--dsw-alias-border-l2);border-radius:14px;
  box-shadow:var(--dsw-shadow-lv2);
  padding:6px;display:flex;flex-direction:column;gap:1px;
}
.gbar-pop .gbar-sec{font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--dsw-alias-label-tertiary);padding:7px 9px 3px}
.gbar-pop .gbar-row{
  display:flex;align-items:center;gap:8px;width:100%;
  padding:7px 9px;border:none;border-radius:8px;
  background:transparent;color:var(--dsw-alias-label-primary);
  font:inherit;font-size:13px;cursor:pointer;text-align:left;
}
.gbar-pop .gbar-row:hover{background:var(--dsw-alias-interactive-bg-hover)}
.gbar-pop .gbar-row.gbar-cur{color:var(--dsw-alias-state-business-primary);font-weight:600}
.gbar-pop .gbar-row .gbar-check{margin-left:auto;color:var(--dsw-alias-state-business-primary);font-weight:700}
.gbar-pop .gbar-row .gbar-rm{font-size:10.5px;color:var(--dsw-alias-label-tertiary);flex:none}
/* branch row wrapper: main switch button + delete button */
.gbar-pop .gbar-rowwrap{display:flex;align-items:center;gap:2px;border-radius:8px}
.gbar-pop .gbar-rowwrap:hover{background:var(--dsw-alias-interactive-bg-hover)}
.gbar-pop .gbar-rowwrap .gbar-row{background:transparent}
.gbar-pop .gbar-del{
  flex:none;border:none;background:transparent;color:var(--dsw-alias-label-tertiary);
  font:inherit;font-size:12px;cursor:pointer;padding:6px 8px;border-radius:6px;margin-right:3px;
}
.gbar-pop .gbar-del:hover{color:var(--dsw-alias-state-error-primary);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 10%,transparent)}
.gbar-pop .gbar-del.gbar-arm{color:var(--dsw-alias-state-error-primary);font-weight:600}
.gbar-pushrow{display:flex;align-items:center;gap:7px;padding:0 8px 7px}
.gbar-pushrow .gbar-pushlabel{font-size:12px;color:var(--dsw-alias-label-secondary)}
.gbar-pop .gbar-newrow{display:flex;gap:6px;padding:8px 6px 6px}
.gbar-pop input{
  flex:1;min-width:0;height:32px;padding:0 11px;
  border:1px solid var(--dsw-alias-border-l2);border-radius:9px;
  background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);
  font:inherit;font-size:13px;outline:none;
}
.gbar-pop input:focus{border-color:var(--dsw-alias-state-business-primary)}
.gbar-pop input::placeholder{color:var(--dsw-alias-label-tertiary)}
.gbar-mini{
  flex:none;height:32px;padding:0 14px;border:none;border-radius:9px;
  background:var(--dsw-alias-state-business-primary);color:#fff;
  font:inherit;font-size:13px;font-weight:500;cursor:pointer;
}
.gbar-mini:hover{opacity:.92}
.gbar-mini:disabled{opacity:.5;cursor:default}

/* diff side panel — fixed on the right; the conversation is pushed left via
   #root { margin-right } so the timeline rail stays visible. */
.gbar-side{
  position:fixed;right:0;top:0;bottom:0;z-index:80;
  display:flex;flex-direction:column;
  background:var(--dsw-alias-bg-layer-1);
  border-left:1px solid var(--dsw-alias-border-l2);
  box-shadow:var(--dsw-shadow-lv2);
  animation:gbar-in .18s cubic-bezier(.32,.72,0,1);
}
/* drag handle on the panel's left edge */
.gbar-resize{
  position:absolute;left:-5px;top:0;bottom:0;width:10px;cursor:col-resize;
  touch-action:none;
}
.gbar-resize::after{
  content:"";position:absolute;left:4px;top:0;bottom:0;width:2px;
  background:transparent;transition:background .15s ease;
}
.gbar-side:hover .gbar-resize::after{background:var(--dsw-alias-border-l2)}
.gbar-resize:active::after{background:var(--dsw-alias-state-business-primary)}
@keyframes gbar-in{from{opacity:0;transform:translateX(14px)}to{opacity:1;transform:none}}
.gbar-side-head{display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid var(--dsw-alias-border-l1)}
.gbar-side-head .gbar-title{font-size:13.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gbar-side-head .gbar-sub{font-size:12px;color:var(--dsw-alias-label-tertiary);flex:none}
.gbar-side-head .gbar-spacer{flex:1}
.gbar-seg{display:inline-flex;padding:3px;gap:2px;border-radius:10px;background:var(--dsw-alias-bg-module-platform);flex:none}
.gbar-seg button{border:none;border-radius:8px;padding:4px 10px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;cursor:pointer}
.gbar-seg button.gbar-on{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);box-shadow:var(--dsw-shadow-lv1)}
.gbar-side-x{border:none;background:transparent;color:var(--dsw-alias-label-tertiary);font-size:15px;cursor:pointer;width:28px;height:28px;border-radius:8px;flex:none}
.gbar-side-x:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.gbar-side-body{flex:1;overflow:hidden;display:flex;flex-direction:column;min-height:0}
.gbar-files{overflow-y:auto;border-bottom:1px solid var(--dsw-alias-border-l1);max-height:150px}
.gbar-file{
  display:flex;align-items:center;gap:6px;width:100%;
  padding:3px 14px;background:transparent;
}
.gbar-file .gbar-file-main{
  flex:1;min-width:0;display:flex;align-items:center;gap:9px;
  padding:5px 4px;border:none;border-radius:7px;background:transparent;
  color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px;cursor:pointer;text-align:left;
}
.gbar-file .gbar-file-main:hover{background:var(--dsw-alias-interactive-bg-hover)}
.gbar-file.gbar-on .gbar-file-main{background:var(--dsw-alias-interactive-bg-hover)}
.gbar-file.gbar-excl{opacity:.55}
.gbar-chk{
  flex:none;width:16px;height:16px;padding:0;
  border:1px solid var(--dsw-alias-border-l2);border-radius:5px;
  background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-state-business-primary);
  font-size:11px;line-height:1;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;
}
.gbar-chk:hover{border-color:var(--dsw-alias-state-business-primary)}
.gbar-chk.gbar-off{color:transparent}
.gbar-file .gbar-st{flex:none;width:16px;font-weight:700;font-size:12px}
.gbar-file .gbar-st.gbar-m{color:var(--dsw-alias-state-warn-primary)}
.gbar-file .gbar-st.gbar-a{color:var(--dsw-alias-state-success-primary)}
.gbar-file .gbar-st.gbar-d{color:var(--dsw-alias-state-error-primary)}
.gbar-file .gbar-st.gbar-u{color:var(--dsw-alias-label-tertiary)}
.gbar-file .gbar-path{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:var(--dsw-font-markdown-code-font-family,"SF Mono",Consolas,monospace);font-size:12px}
.gbar-file .gbar-nums{flex:none;font-variant-numeric:tabular-nums;font-size:11.5px}
.gbar-file .gbar-nums .gbar-a{color:var(--dsw-alias-state-success-primary)}
.gbar-file .gbar-nums .gbar-d{color:var(--dsw-alias-state-error-primary)}
.gbar-diff{flex:1;overflow:auto;font-family:var(--dsw-font-markdown-code-font-family,"SF Mono",Consolas,monospace);font-size:12px;line-height:1.7;padding:8px 0}
.gbar-diff .gbar-hunk{display:flex;align-items:center;height:24px;color:var(--dsw-alias-label-tertiary);background:var(--dsw-alias-markdown-inline-code);padding:0 14px;font-size:11.5px;white-space:nowrap}
.gbar-diff .gbar-line{display:flex;align-items:center;min-height:21px;padding:0 14px 0 0;white-space:pre}
.gbar-diff .gbar-line .gbar-ln{flex:none;width:46px;text-align:right;padding-right:12px;color:var(--dsw-alias-label-tertiary);font-size:11px;-webkit-user-select:none;user-select:none}
.gbar-diff .gbar-line .gbar-code{flex:1;white-space:pre;color:var(--dsw-alias-label-primary)}
.gbar-diff .gbar-line.gbar-add{background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 14%,transparent)}
.gbar-diff .gbar-line.gbar-add .gbar-ln{color:var(--dsw-alias-state-success-primary)}
.gbar-diff .gbar-line.gbar-del{background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 10%,transparent)}
.gbar-diff .gbar-line.gbar-del .gbar-ln{color:var(--dsw-alias-state-error-primary)}
.gbar-diff .gbar-line.gbar-ctx .gbar-code{color:var(--dsw-alias-label-secondary)}
.gbar-diff .gbar-empty{padding:18px 16px;font-size:12px;color:var(--dsw-alias-label-tertiary)}
.gbar-side-foot{padding:8px 14px;border-top:1px solid var(--dsw-alias-border-l1);font-size:11.5px;color:var(--dsw-alias-label-tertiary);display:flex;gap:8px;align-items:center}
.gbar-side-foot .gbar-dot{width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-state-warn-primary);flex:none}
/* commit row inside the diff panel */
.gbar-side-commit{display:flex;flex-direction:column;gap:7px;padding:9px 12px;border-top:1px solid var(--dsw-alias-border-l1)}
.gbar-side-commit .gbar-crow{display:flex;align-items:center;gap:6px}
.gbar-side-commit input{
  flex:1;min-width:0;height:28px;padding:0 10px;
  border:1px solid var(--dsw-alias-border-l2);border-radius:8px;
  background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);
  font:inherit;font-size:12px;outline:none;
}
.gbar-side-commit input:focus{border-color:var(--dsw-alias-state-business-primary)}
.gbar-side-commit input::placeholder{color:var(--dsw-alias-label-tertiary)}
.gbar-side-commit .gbar-actions{display:flex;align-items:center;justify-content:flex-end;gap:6px}
.gbar-side-commit .gbar-btn{height:28px;padding:0 12px;font-size:12px;border-radius:8px}

/* commit modal */
.gbar-modal-wrap{
  position:fixed;inset:0;z-index:120;
  display:flex;align-items:center;justify-content:center;
  background:rgba(0,0,0,.35);
}
.gbar-modal{
  width:min(520px,calc(100vw - 40px));max-height:calc(100vh - 48px);overflow:hidden auto;
  background:var(--dsw-alias-bg-layer-1);
  border:1px solid var(--dsw-alias-border-l2);border-radius:16px;
  box-shadow:var(--dsw-shadow-lv2);
  padding:18px;
  display:flex;flex-direction:column;gap:12px;
  animation:gbar-in .18s cubic-bezier(.32,.72,0,1);
}
.gbar-modal .gbar-head{display:flex;align-items:center;gap:10px}
.gbar-modal .gbar-head .gbar-title{font-size:15px;font-weight:600}
.gbar-modal .gbar-head .gbar-branch{font-size:12px;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-module-platform);border-radius:999px;padding:3px 10px}
.gbar-modal .gbar-head .gbar-x{margin-left:auto;border:none;background:transparent;color:var(--dsw-alias-label-tertiary);font-size:16px;cursor:pointer;width:28px;height:28px;border-radius:8px}
.gbar-modal .gbar-head .gbar-x:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.gbar-modal textarea{
  width:100%;min-height:64px;height:auto;max-height:220px;resize:none;
  overflow-y:auto;scrollbar-width:none;
  border:1px solid var(--dsw-alias-border-l2);border-radius:12px;
  background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);
  font:inherit;font-size:14px;line-height:1.6;padding:10px 14px;outline:none;
}
.gbar-modal textarea::-webkit-scrollbar{display:none}
.gbar-modal textarea:focus{border-color:var(--dsw-alias-state-business-primary)}
.gbar-modal textarea::placeholder{color:var(--dsw-alias-label-tertiary)}
.gbar-modal .gbar-hint{font-size:12px;color:var(--dsw-alias-label-tertiary);line-height:1.6}
.gbar-modal .gbar-files-head{display:flex;align-items:center;gap:8px;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--dsw-alias-label-tertiary);margin-top:2px}
.gbar-modal .gbar-files-head .gbar-hint{font-size:11px;font-weight:400;text-transform:none;letter-spacing:0}
.gbar-modal .gbar-files{
  display:flex;flex-direction:column;gap:1px;max-height:132px;overflow-y:auto;
  border:1px solid var(--dsw-alias-border-l1);border-radius:10px;
  background:var(--dsw-alias-bg-layer-2);padding:4px;
}
.gbar-modal .gbar-file{
  display:flex;align-items:center;gap:6px;width:100%;
  padding:2px 6px;border-radius:7px;background:transparent;
}
.gbar-modal .gbar-file .gbar-file-main{
  padding:4px 4px;font-size:12px;border-radius:6px;
}
.gbar-modal .gbar-file .gbar-file-main:hover{background:var(--dsw-alias-interactive-bg-hover)}
.gbar-modal .gbar-file.gbar-on .gbar-file-main{background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 10%,transparent)}
.gbar-modal .gbar-file .gbar-path{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:var(--dsw-font-markdown-code-font-family,"SF Mono",Consolas,monospace);font-size:11.5px}
.gbar-modal .gbar-file .gbar-goto{flex:none;color:var(--dsw-alias-label-tertiary);font-size:10px}
.gbar-modal .gbar-file.gbar-on .gbar-goto{color:var(--dsw-alias-state-business-primary)}
.gbar-modal .gbar-foot{display:flex;align-items:center;justify-content:flex-end;gap:8px;margin-top:2px;flex-wrap:wrap}
.gbar-btn{
  height:34px;padding:0 16px;border:none;border-radius:10px;
  font:inherit;font-size:13.5px;cursor:pointer;
  display:inline-flex;align-items:center;gap:6px;
}
.gbar-btn.gbar-ghost{background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-primary)}
.gbar-btn.gbar-ghost:hover{background:var(--dsw-alias-interactive-bg-hover-solid)}
.gbar-btn.gbar-soft{background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 12%,transparent);color:var(--dsw-alias-state-business-primary)}
.gbar-btn.gbar-soft:hover{background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 18%,transparent)}
.gbar-btn.gbar-primary{background:var(--dsw-alias-state-business-primary);color:#fff;font-weight:500}
.gbar-btn.gbar-primary:hover{opacity:.92}
.gbar-btn:disabled{opacity:.5;cursor:default}
.gbar-notice{
  position:fixed;z-index:150;left:50%;bottom:28px;transform:translateX(-50%);
  max-width:min(520px,90vw);padding:9px 16px;border-radius:10px;font-size:12.5px;line-height:1.5;
  box-shadow:var(--dsw-shadow-lv2);animation:gbar-in .18s cubic-bezier(.32,.72,0,1);
}
.gbar-notice.gbar-ok{background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 16%,var(--dsw-alias-bg-layer-1));color:var(--dsw-alias-state-success-primary)}
.gbar-notice.gbar-err{background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 14%,var(--dsw-alias-bg-layer-1));color:var(--dsw-alias-state-error-primary)}
.gbar-spin{width:12px;height:12px;border-radius:50%;border:2px solid color-mix(in srgb,var(--dsw-alias-label-tertiary) 30%,transparent);border-top-color:currentColor;animation:gbar-spin .7s linear infinite}
@keyframes gbar-spin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){.gbar-side,.gbar-modal,.gbar-notice{animation:none}}
`

/** Install the GitBar stylesheet once (idempotent); returns the disposer. */
export function installGitBarStyles(): () => void {
  const id = 'dsh-ui-tweaks-gitbar'
  const existing = document.querySelector(`style[data-plugin-css="${id}"]`)
  if (existing !== null) return () => {}
  const style = document.createElement('style')
  style.dataset.plugin = 'dsh-ui-tweaks'
  style.dataset.pluginCss = id
  style.textContent = GITBAR_CSS
  document.head.appendChild(style)
  return () => { style.remove() }
}

// ---------------------------------------------------------------------------
// Status / data plumbing.
// ---------------------------------------------------------------------------

/** Extract a short branch name for display (origin/main → main). */
function shortBranch(name: string): string {
  const idx = name.lastIndexOf('/')
  return idx >= 0 && name.startsWith('origin/') ? name.slice(idx + 1) : name
}

function statusLetter(status: string): string {
  if (status === 'U') return 'U'
  return status.length > 1 ? status[0] ?? 'M' : status
}

function statusClass(status: string): string {
  const s = statusLetter(status)
  if (s === 'A') return 'gbar-a'
  if (s === 'D') return 'gbar-d'
  if (s === 'U') return 'gbar-u'
  return 'gbar-m'
}

// ---------------------------------------------------------------------------
// The GitBar component.
// ---------------------------------------------------------------------------

export interface GitBarProps {
  /** Framework seat (PropsRuntime): current session id. */
  sessionId: SessionId | undefined
  /** Injected: the ui-tweaks settings store (reads `gitBarEnabled`). */
  controller: SettingsClient
  /** Locale-bound translator for the GitBar labels. */
  t: Translate
}

export function GitBar({ sessionId, controller, t }: GitBarProps) {
  const settingsState = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot)
  const enabled = settingsState.value?.gitBarEnabled ?? true

  const [snapshot, setSnapshot] = useState<GitSnapshot | null>(null)
  const [branchOpen, setBranchOpen] = useState(false)
  const [branches, setBranches] = useState<GitBranches | null>(null)
  const [diffOpen, setDiffOpen] = useState(false)
  const [diff, setDiff] = useState<GitDiffResult | null>(null)
  const [diffMode, setDiffMode] = useState<'hunk' | 'full'>('hunk')
  const [commitOpen, setCommitOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const commitInputRef = useRef<HTMLTextAreaElement | null>(null)

  // Auto-grow the commit message textarea so it never shows a scrollbar
  // (capped at 220px; beyond that the scrollbar is hidden entirely).
  const autoGrowCommitInput = (): void => {
    const el = commitInputRef.current
    if (el === null) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`
  }
  useEffect(() => {
    if (commitOpen) autoGrowCommitInput()
  }, [commitOpen, message])

  const session = sessionId === undefined ? undefined : String(sessionId)

  // Status snapshot: load on session change, then poll.
  useEffect(() => {
    if (!enabled || session === undefined) {
      setSnapshot(null)
      return
    }
    setExcluded(new Set())
    setDiffPath(null)
    setDiffOpen(false)
    setCommitOpen(false)
    let cancelled = false
    let timer: number | undefined
    const refresh = async (): Promise<void> => {
      try {
        const next = await apiGet<GitSnapshot>(`${GIT_ROUTE}/status?session=${encodeURIComponent(session)}`)
        if (!cancelled) setSnapshot(next)
      } catch {
        // Transient git failure: keep the previous snapshot.
      }
    }
    void refresh()
    timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh()
    }, POLL_MS)
    return () => {
      cancelled = true
      if (timer !== undefined) clearInterval(timer)
    }
  }, [enabled, session])

  const refresh = async (): Promise<void> => {
    if (session === undefined) return
    try {
      setSnapshot(await apiGet<GitSnapshot>(`${GIT_ROUTE}/status?session=${encodeURIComponent(session)}`))
    } catch {
      // Keep the previous snapshot on transient failures.
    }
  }

  const showNotice = (kind: 'ok' | 'err', text: string): void => {
    setNotice({ kind, text })
    window.setTimeout(() => setNotice(null), 4000)
  }

  const run = async (label: string, fn: () => Promise<void>): Promise<boolean> => {
    if (busy !== null) return false
    setBusy(label)
    try {
      await fn()
      return true
    } catch (cause) {
      showNotice('err', cause instanceof Error ? cause.message : String(cause))
      return false
    } finally {
      setBusy(null)
    }
  }

  const loadBranches = (): void => {
    if (session === undefined) return
    void apiGet<GitBranches>(`${GIT_ROUTE}/branches?session=${encodeURIComponent(session)}`)
      .then(setBranches)
      .catch(cause => { showNotice('err', cause instanceof Error ? cause.message : String(cause)) })
  }

  const toggleBranch = (): void => {
    const next = !branchOpen
    setBranchOpen(next)
    if (next) loadBranches()
  }

  const pickBranch = (name: string): void => {
    if (session === undefined || name === branches?.current) return
    void run('checkout', async () => {
      await apiPost(`${GIT_ROUTE}/checkout`, { session, branch: name })
      setBranchOpen(false)
      await refresh()
      showNotice('ok', `→ ${name}`)
    })
  }

  const createBranch = (): void => {
    if (session === undefined || newBranchName.trim() === '') return
    void run(pushToRemote ? 'create-push' : 'create', async () => {
      await apiPost(`${GIT_ROUTE}/create`, { session, name: newBranchName.trim(), push: pushToRemote })
      setBranchOpen(false)
      setNewBranchName('')
      setPushToRemote(false)
      await refresh()
      if (pushToRemote) showNotice('ok', `☁ ${newBranchName.trim()}`)
    })
  }

  const [newBranchName, setNewBranchName] = useState('')
  const [pushToRemote, setPushToRemote] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  // Two-step branch deletion: first click arms a confirm, second click deletes.
  const deleteBranch = (name: string): void => {
    if (session === undefined) return
    if (confirmDelete === name) {
      setConfirmDelete(null)
      void run('branch-delete', async () => {
        await apiPost(`${GIT_ROUTE}/branch-delete`, { session, name })
        loadBranches()
        await refresh()
        showNotice('ok', `🗑 ${name}`)
      })
    } else {
      setConfirmDelete(name)
      window.setTimeout(() => {
        setConfirmDelete(current => (current === name ? null : current))
      }, 3000)
    }
  }

  // --- commit exclusions ----------------------------------------------------
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(new Set())

  const toggleExclude = (path: string): void => {
    setExcluded(current => {
      const next = new Set(current)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const openDiff = (): void => {
    const next = !diffOpen
    setDiffOpen(next)
    if (next) {
      void refresh()
      // Auto-select the first changed file so the panel opens with a diff.
      setDiffPath(current => current ?? snapshot?.files[0]?.path ?? null)
    }
  }

  const [diffPath, setDiffPath] = useState<string | null>(null)

  // Load the selected file's diff when the panel opens or the selection/mode changes.
  useEffect(() => {
    if (!diffOpen || session === undefined || diffPath === null) return
    let cancelled = false
    setDiff(null)
    void apiGet<GitDiffResult>(
      `${GIT_ROUTE}/diff?session=${encodeURIComponent(session)}&file=${encodeURIComponent(diffPath)}&mode=${diffMode}`,
    ).then(result => {
      if (!cancelled) setDiff(result)
    }).catch(cause => {
      if (!cancelled) showNotice('err', cause instanceof Error ? cause.message : String(cause))
    })
    return () => { cancelled = true }
  }, [diffOpen, session, diffPath, diffMode])

  const selectDiffFile = (path: string): void => {
    setDiffPath(path)
  }

  const switchDiffMode = (mode: 'hunk' | 'full'): void => {
    setDiffMode(mode)
  }

  // --- resizable diff panel -------------------------------------------------
  const [diffWidth, setDiffWidth] = useState(440)
  const [panelTop, setPanelTop] = useState(0)
  const branchRef = useRef<HTMLButtonElement | null>(null)
  const branchPopRef = useRef<HTMLDivElement | null>(null)

  // The panel never covers the session header / message-area top edge: anchor
  // its top to the message scrollport's top.
  useEffect(() => {
    if (!diffOpen) return
    const measure = (): void => {
      const sp = document.querySelector('[data-conversation-scroll]')
      const top = sp === null ? 0 : Math.round(sp.getBoundingClientRect().top)
      setPanelTop(prev => Math.abs(prev - top) < 2 ? prev : top)
    }
    measure()
    window.addEventListener('resize', measure)
    const observer = new ResizeObserver(measure)
    const sp = document.querySelector('[data-conversation-scroll]')
    if (sp !== null) observer.observe(sp)
    return () => {
      window.removeEventListener('resize', measure)
      observer.disconnect()
    }
  }, [diffOpen])

  // Close the diff panel when clicking outside it (clicks on the pill row and
  // the commit modal are excluded — the pill's own onClick toggles instead).
  useEffect(() => {
    if (!diffOpen) return
    const onDown = (event: MouseEvent): void => {
      const target = event.target as Node | null
      if (target === null) return
      if (document.querySelector('.gbar-side')?.contains(target)) return
      if (document.querySelector('.gbar-modal-wrap')?.contains(target)) return
      if (document.querySelector('.gbar')?.contains(target)) return
      setDiffOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => { document.removeEventListener('mousedown', onDown) }
  }, [diffOpen])

  // Close the branch popup when clicking outside it or pressing Escape.
  useEffect(() => {
    if (!branchOpen) return
    const onDown = (event: MouseEvent): void => {
      const target = event.target as Node | null
      if (target === null) return
      if (branchRef.current?.contains(target) || branchPopRef.current?.contains(target)) return
      setBranchOpen(false)
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setBranchOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [branchOpen])

  // Drag the panel's left edge to resize it.
  const startResize = (event: { clientX: number; preventDefault: () => void }): void => {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = diffWidth
    const onMove = (move: PointerEvent): void => {
      setDiffWidth(Math.min(900, Math.max(320, startWidth - (move.clientX - startX))))
    }
    const onUp = (): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  // Push the conversation column left while the panel is open, so the user's
  // timeline rail (anchored to the message-area right edge) stays visible.
  useEffect(() => {
    const root = document.querySelector('#root') as HTMLElement | null
    if (!diffOpen) return
    if (root !== null) root.style.marginRight = `${diffWidth}px`
    return () => { if (root !== null) root.style.marginRight = '' }
  }, [diffOpen, diffWidth])


  const openCommit = (): void => {
    setCommitOpen(true)
    void refresh()
  }

  const generateMessage = (): void => {
    if (session === undefined || busy !== null) return
    void run('suggest', async () => {
      const result = await apiPost<{ message: string }>(`${GIT_ROUTE}/suggest`, { session })
      setMessage(result.message)
    })
  }

  const doCommit = (push: boolean): void => {
    if (session === undefined) return
    void run(push ? 'commit-push' : 'commit', async () => {
      let msg = message.trim()
      if (msg === '') {
        const result = await apiPost<{ message: string }>(`${GIT_ROUTE}/suggest`, { session })
        msg = result.message
      }
      const result = await apiPost<{ hash?: string; pushed: boolean }>(`${GIT_ROUTE}/commit`, {
        session,
        message: msg,
        push,
        exclude: [...excluded],
      })
      setCommitOpen(false)
      setDiffOpen(false)
      setMessage('')
      setExcluded(new Set())
      await refresh()
      showNotice('ok', push ? `✓ ${result.hash ?? 'committed'} · pushed` : `✓ ${result.hash ?? 'committed'}`)
    })
  }

  if (!enabled || session === undefined) return null
  if (snapshot === null || !snapshot.isRepo) return null

  const dirty = !snapshot.clean
  const diffPillOpen = diffOpen

  return (
    <div className="gbar" data-slot-plugin="dsh-ui-tweaks-gitbar">
      {/* Branch pill (left) */}
      <button
        type="button"
        ref={branchRef}
        className={'gbar-pill' + (branchOpen ? ' gbar-active' : '')}
        onClick={toggleBranch}
        title={dirty ? t('dirty') : t('clean')}
        aria-expanded={branchOpen}
      >
        <svg className="gbar-ico" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
          <path d="M7.4 2.6a1.2 1.2 0 1 1 2.2 0l3.2 1.6a1.2 1.2 0 1 1-1.1 2.1l-2.3-1.2a2.6 2.6 0 0 1-1.1.8l.6 4.2a1.2 1.2 0 1 1-1.7.2l-.6-4.2a2.6 2.6 0 0 1-1.2-.7l-2.9 1.5a1.2 1.2 0 1 1-1.1-2.1l2.9-1.5a2.6 2.6 0 0 1 .2-1.5l-3.2-1.6a1.2 1.2 0 1 1 1.1-2.1z" />
        </svg>
        <span>{snapshot.branch ?? snapshot.detachedHead ?? '—'}</span>
        {dirty ? <span className="gbar-dot" aria-hidden /> : null}
        <span className="gbar-caret" aria-hidden>▾</span>
      </button>

      {/* Diff + commit pills (right) */}
      <span className="gbar-right">
        <button
          type="button"
          className={'gbar-pill' + (diffPillOpen ? ' gbar-active' : '')}
          onClick={openDiff}
          title={t('diffTitle')}
        >
          <svg className="gbar-ico" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
            <path d="M5 1.5h4l3 3V13a1.5 1.5 0 0 1-1.5 1.5h-5A1.5 1.5 0 0 1 4 13V3A1.5 1.5 0 0 1 5 1.5zM5 2.5V13h5V5.2L8.8 3.5H5zm.5 4.5a.75.75 0 1 1 0 1.5.75.75 0 0 1 0-1.5zm3.25.25h-1.5v1.5h1.5V7.25zm.25 2.5H5.75v1.5h3.25v-1.5z" />
          </svg>
          {dirty ? (
            <>
              <span className="gbar-add">+{snapshot.totalAdded}</span>
              <span className="gbar-del">−{snapshot.totalDeleted}</span>
              <span className="gbar-meta">· {snapshot.files.length} {t('diffFiles')}</span>
            </>
          ) : (
            <span className="gbar-hint">{t('clean')}</span>
          )}
        </button>

        <button type="button" className="gbar-pill" onClick={openCommit} title={t('commitTitle')}>
          <svg className="gbar-ico" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
            <path d="M11.4 1.6a2.12 2.12 0 0 1 3 3l-8 8-3.4.8.8-3.4 7.6-8.4zM12.1 2.3l.9.9-7.6 8.3-.8.2.2-.8 7.3-8.6z" />
          </svg>
          <span className="gbar-hint">{t('commitMessage')}</span>
        </button>
      </span>

      {/* Branch popup */}
      {branchOpen ? (
        <div className="gbar-pop" role="menu" aria-label={snapshot.branch ?? 'git'} ref={branchPopRef}>
          <div className="gbar-sec">{t('branchLocal')}</div>
          {branches?.local.map(name => (
            <div key={name} className="gbar-rowwrap">
              <button
                type="button"
                className={'gbar-row' + (name === branches.current ? ' gbar-cur' : '')}
                onClick={() => { pickBranch(name) }}
              >
                <span>{name}</span>
                {name === branches.current ? <span className="gbar-check" aria-hidden>✓</span> : null}
              </button>
              {name !== branches.current ? (
                <button
                  type="button"
                  className={'gbar-del' + (confirmDelete === name ? ' gbar-arm' : '')}
                  onClick={() => { deleteBranch(name) }}
                  title={t('branchDelete')}
                >
                  {confirmDelete === name ? t('branchDeleteConfirm') : '🗑'}
                </button>
              ) : null}
            </div>
          ))}
          <div className="gbar-sec">{t('branchRemote')}</div>
          {branches?.remote.map(name => (
            <button
              key={name}
              type="button"
              className={'gbar-row' + (name === branches.current ? ' gbar-cur' : '')}
              onClick={() => { pickBranch(name) }}
            >
              <span>{shortBranch(name)}</span>
              <span className="gbar-rm">{name.split('/')[0]}</span>
            </button>
          ))}
          <div className="gbar-sec">{t('branchNew')}</div>
          <div className="gbar-newrow">
            <input
              value={newBranchName}
              onChange={event => { setNewBranchName(event.target.value) }}
              onKeyDown={event => { if (event.key === 'Enter') createBranch() }}
              placeholder={t('branchNewPlaceholder')}
              aria-label={t('branchNew')}
            />
            <button type="button" className="gbar-mini" onClick={createBranch} disabled={busy !== null || newBranchName.trim() === ''}>
              {t('branchCreate')}
            </button>
          </div>
          <div className="gbar-pushrow">
            <button
              type="button"
              className={'gbar-chk' + (pushToRemote ? '' : ' gbar-off')}
              onClick={() => { setPushToRemote(value => !value) }}
              aria-label={t('branchPushRemote')}
            >
              {pushToRemote ? '✓' : '✕'}
            </button>
            <span className="gbar-pushlabel">{t('branchPushRemote')}</span>
          </div>
        </div>
      ) : null}

      {/* Diff side panel */}
      {diffOpen ? createPortal(
        <div className="gbar-side" role="dialog" aria-label={t('diffTitle')} style={{ width: `${diffWidth}px`, top: `${panelTop}px` }}>
          <div className="gbar-resize" onPointerDown={startResize} title="拖动调整宽度" />
          <div className="gbar-side-head">
            <span className="gbar-title">{diffPath ?? t('diffTitle')}</span>
            <span className="gbar-sub">
              {snapshot.files.length} {t('diffFiles')} · +{snapshot.totalAdded} −{snapshot.totalDeleted}
            </span>
            <span className="gbar-spacer" />
            <div className="gbar-seg" role="group">
              <button type="button" className={diffMode === 'hunk' ? 'gbar-on' : ''} onClick={() => { switchDiffMode('hunk') }}>{t('diffOnly')}</button>
              <button type="button" className={diffMode === 'full' ? 'gbar-on' : ''} onClick={() => { switchDiffMode('full') }}>{t('diffFull')}</button>
            </div>
            <button type="button" className="gbar-side-x" onClick={() => { setDiffOpen(false) }} aria-label="✕">✕</button>
          </div>
          <div className="gbar-side-body">
            <div className="gbar-files">
              {snapshot.files.map(file => {
                const isExcluded = excluded.has(file.path)
                return (
                  <div key={file.path} className={'gbar-file' + (diffPath === file.path ? ' gbar-on' : '') + (isExcluded ? ' gbar-excl' : '')}>
                    <button
                      type="button"
                      className={'gbar-chk' + (isExcluded ? ' gbar-off' : '')}
                      onClick={() => { toggleExclude(file.path) }}
                      aria-label={isExcluded ? t('excludeFile') : t('includeFile')}
                    >
                      {isExcluded ? '✕' : '✓'}
                    </button>
                    <button
                      type="button"
                      className="gbar-file-main"
                      onClick={() => { selectDiffFile(file.path) }}
                    >
                      <span className={'gbar-st ' + statusClass(file.status)}>{statusLetter(file.status)}</span>
                      <span className="gbar-path">{file.path}</span>
                      <span className="gbar-nums">
                        <span className="gbar-a">+{file.added}</span> <span className="gbar-d">−{file.deleted}</span>
                      </span>
                    </button>
                  </div>
                )
              })}
            </div>
            {diff === null ? (
              <div className="gbar-diff"><div className="gbar-empty">{t('loading')}</div></div>
            ) : diff.lines.length === 0 ? (
              <div className="gbar-diff"><div className="gbar-empty">{t('noChanges')}</div></div>
            ) : (
              <div className="gbar-diff">
                {diff.lines.map((line, i) => (
                  <div key={i} className={'gbar-line gbar-' + line.type}>
                    <span className="gbar-ln">{line.old ?? ''}</span>
                    <span className="gbar-ln">{line.new ?? ''}</span>
                    <span className="gbar-code">{line.text}</span>
                  </div>
                ))}
                {diff.truncated ? <div className="gbar-empty">…</div> : null}
              </div>
            )}
          </div>
          <div className="gbar-side-foot">
            <span className="gbar-dot" />
            {snapshot.branch ?? '—'} · {dirty ? t('dirty') : t('clean')}
          </div>
          {dirty ? (
            <div className="gbar-side-commit">
              <div className="gbar-crow">
                <input
                  value={message}
                  onChange={event => { setMessage(event.target.value) }}
                  onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) doCommit(false) }}
                  placeholder={t('commitPlaceholder')}
                  aria-label={t('commitMessage')}
                />
              </div>
              <div className="gbar-actions">
                <button type="button" className="gbar-btn gbar-ghost" onClick={generateMessage} disabled={busy !== null}>
                  {busy === 'suggest' ? <span className="gbar-spin" /> : null}{t('commitGenerate')}
                </button>
                <button type="button" className="gbar-btn gbar-soft" onClick={() => { doCommit(false) }} disabled={busy !== null}>
                  {t('commitSubmit')}
                </button>
                <button type="button" className="gbar-btn gbar-primary" onClick={() => { doCommit(true) }} disabled={busy !== null}>
                  {t('commitSubmitPush')}
                </button>
              </div>
            </div>
          ) : null}
        </div>,
        document.body,
      ) : null}

      {/* Commit modal */}
      {commitOpen ? createPortal(
        <div className="gbar-modal-wrap" onMouseDown={event => { if (event.target === event.currentTarget) setCommitOpen(false) }}>
          <div className="gbar-modal" role="dialog" aria-label={t('commitTitle')}>
            <div className="gbar-head">
              <span className="gbar-title">{t('commitTitle')}</span>
              <span className="gbar-branch">{snapshot.branch ?? snapshot.detachedHead ?? '—'}</span>
              <button type="button" className="gbar-x" onClick={() => { setCommitOpen(false) }} aria-label="✕">✕</button>
            </div>
            <textarea
              ref={commitInputRef}
              value={message}
              onChange={event => { setMessage(event.target.value) }}
              placeholder={t('commitPlaceholder')}
              autoFocus
            />
            <div className="gbar-files-head">
              {t('commitWillCommit')}
              <span className="gbar-hint">· {snapshot.files.length - excluded.size} {t('diffFiles')}</span>
            </div>
            <div className="gbar-files">
              {snapshot.files.map(file => {
                const isExcluded = excluded.has(file.path)
                return (
                  <div key={file.path} className={'gbar-file' + (isExcluded ? ' gbar-excl' : '')}>
                    <button
                      type="button"
                      className={'gbar-chk' + (isExcluded ? ' gbar-off' : '')}
                      onClick={() => { toggleExclude(file.path) }}
                      aria-label={isExcluded ? t('excludeFile') : t('includeFile')}
                    >
                      {isExcluded ? '✕' : '✓'}
                    </button>
                    <button
                      type="button"
                      className="gbar-file-main"
                      onClick={() => {
                        setDiffPath(file.path)
                        setDiffMode('hunk')
                        setDiffOpen(true)
                        setCommitOpen(false)
                      }}
                    >
                      <span className={'gbar-st ' + statusClass(file.status)}>{statusLetter(file.status)}</span>
                      <span className="gbar-path">{file.path}</span>
                      <span className="gbar-nums">
                        <span className="gbar-a">+{file.added}</span> <span className="gbar-d">−{file.deleted}</span>
                      </span>
                      <span className="gbar-goto">{t('commitViewDiff')} ›</span>
                    </button>
                  </div>
                )
              })}
            </div>
            <div className="gbar-hint">{t('commitHint')}</div>
            <div className="gbar-foot">
              <button type="button" className="gbar-btn gbar-ghost" onClick={() => { setCommitOpen(false) }}>{t('commitCancel')}</button>
              <button type="button" className="gbar-btn gbar-ghost" onClick={generateMessage} disabled={busy !== null}>
                {busy === 'suggest' ? <span className="gbar-spin" /> : null}{t('commitGenerate')}
              </button>
              <button type="button" className="gbar-btn gbar-soft" onClick={() => { doCommit(false) }} disabled={busy !== null}>
                {busy === 'commit' ? <span className="gbar-spin" /> : null} {t('commitSubmit')}
              </button>
              <button type="button" className="gbar-btn gbar-primary" onClick={() => { doCommit(true) }} disabled={busy !== null}>
                {busy === 'commit-push' ? <span className="gbar-spin" /> : null} {t('commitSubmitPush')}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      ) : null}

      {/* Transient notice */}
      {notice !== null ? createPortal(
        <div className={'gbar-notice gbar-' + notice.kind} role="status">{notice.text}</div>,
        document.body,
      ) : null}
    </div>
  )
}
