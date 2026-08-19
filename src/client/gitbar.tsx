/**
 * dsh-ui-tweaks — GitBar (browser half).
 *
 * Two compact DSH-native pills that live INSIDE the composer's tool row
 * (`conversation.input.left` / `.right`), styled to match the input bar's
 * resident chrome (access mode / model select):
 *
 * - **branch** (`conversation.input.left`, right after the access-mode
 *   control): current branch; opens a popup with local/remote branches and a
 *   new-branch field.
 * - **diff** (`conversation.input.right`, just before the model select): ±line
 *   counts; opens a right slide-over panel with the changed-file list and
 *   per-file diff (changed hunks by default, whole file on toggle). The panel
 *   keeps its commit band at the foot, so committing still works from the diff
 *   view.
 *
 * The standalone commit pill (a third pill on its own row above the composer)
 * is gone — the input area no longer carries a separate GitBar row above the
 * card, which is what kept it tall.
 *
 * All colors ride the DSH theme tokens (`--dsw-alias-*`), so light and dark
 * both work. Each pill renders nothing when the setting is off, the session
 * has no cwd, or the directory is not a git repository.
 * @module dsh-ui-tweaks/client/gitbar
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import type { SettingsClient } from './index.tsx'

/** Route prefix matching the host half (src/git-web.ts). */
const GIT_ROUTE = '/_dsh/ui-tweaks/git'

/** Poll interval for the status snapshot, in ms. */
const POLL_MS = 10000

/** Default cap of the file list while its height is still automatic, in px. */
const FILES_AUTO_MAX = 150
/** Floors for the two resizable diff-panel sections, in px. */
const MIN_FILES_H = 30
const MIN_DIFF_H = 60
const MIN_COMMIT_H = 62
/** Share of the panel a dragged section may never exceed, so the diff survives. */
const SECTION_MAX = '45%'

/** Locale keys the GitBar reads off the `ui-tweaks` dictionary. */
type GitBarLabelKey =
  | 'commitMessage' | 'diffFiles' | 'branchLocal' | 'branchRemote' | 'branchNew'
  | 'branchNewPlaceholder' | 'branchCreate' | 'diffTitle' | 'diffOnly' | 'diffFull'
  | 'commitTitle' | 'commitPlaceholder' | 'commitHint' | 'commitWillCommit' | 'commitViewDiff'
  | 'commitEmpty' | 'commitCancel' | 'commitSubmit' | 'commitSubmitPush'
  | 'dirty' | 'clean' | 'noChanges' | 'loading' | 'branchDelete' | 'branchDeleteConfirm'
  | 'includeFile' | 'excludeFile' | 'branchPushRemote'
  | 'branchRemoteDelete' | 'branchFrom' | 'branchFromHead' | 'branchGraph'
  | 'branchRefresh' | 'branchCancel' | 'graphTitle'
  | 'graphColGraph' | 'graphColCommit' | 'graphColSubject' | 'graphColAuthor' | 'graphColDate'

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

/** One commit row of the graph dialog. */
interface GitGraphCommit {
  graph: string
  fullHash: string
  hash: string
  subject: string
  author: string
  date: string
  dateRelative: string
  refs: string
}

/** Git commit graph table returned by the `git/graph` endpoint. */
interface GitGraph {
  commits: GitGraphCommit[]
  truncated: boolean
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
/* Anchor around each pill inside the composer tool row
   (conversation.input.left / .right): the branch pill's containing block, so
   its popup opens from the pill itself. flex:0 1 auto + min-width:0 let the
   pill compress when the row is squeezed instead of spilling over neighbours. */
.gbar{position:relative;display:inline-flex;align-items:center;flex:0 1 auto;min-width:0}
/* Pills match the input bar's resident chrome (access mode / model select):
   28px tall, fully-rounded, transparent at rest with a soft hover fill.
   overflow:hidden clips the pill's content while it compresses. */
.gbar-pill{
  display:inline-flex;align-items:center;gap:6px;
  height:28px;padding:0 8px;min-width:0;overflow:hidden;
  background:transparent;
  border:none;
  border-radius:24px;
  color:var(--dsw-alias-label-secondary);
  font:inherit;font-size:13px;font-weight:500;line-height:20px;
  cursor:pointer;
  transition:background .15s ease;
  white-space:nowrap;
  -webkit-user-select:none;user-select:none;
}
.gbar-pill:hover{background:var(--dsw-alias-interactive-bg-hover)}
.gbar-pill:focus-visible{background:var(--dsw-alias-interactive-bg-hover)}
/* Long branch names ellipsize instead of stretching the row. */
.gbar-pill .gbar-branch{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;max-width:140px}
/* Icons match the resident access-mode trigger exactly: 14px, full color,
   no fade, and box-centered (same vertical centre as the access icon). */
.gbar-pill .gbar-ico{width:14px;height:14px;flex:none;opacity:1}
.gbar-pill .gbar-caret{font-size:8px;color:var(--dsw-alias-label-tertiary);margin-left:1px}
.gbar-pill .gbar-dot{width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-state-warn-primary);flex:none}
.gbar-pill .gbar-add{color:var(--dsw-alias-state-success-primary);font-weight:600;font-variant-numeric:tabular-nums}
.gbar-pill .gbar-del{color:var(--dsw-alias-state-error-primary);font-weight:600;font-variant-numeric:tabular-nums}
.gbar-pill .gbar-meta{color:var(--dsw-alias-label-secondary)}
.gbar-pill .gbar-hint{color:var(--dsw-alias-label-tertiary);font-weight:400}
.gbar-pill.gbar-active{background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 12%,var(--dsw-alias-bg-module-platform));color:var(--dsw-alias-state-business-primary)}
.gbar-pill.gbar-active .gbar-hint{color:var(--dsw-alias-state-business-primary)}
.gbar-pill:disabled{opacity:.5;cursor:default}
/* The composer tool row is an inline-size container (DSH sets
   container-type:inline-size on it), so these container queries track the
   row's actual width. When the stretched diff panel pushes the conversation
   column and the row tightens — the same squeeze that makes the resident
   access / model chrome collapse its labels to icons — the pills follow suit
   instead of ever overlapping their neighbours: first drop the "· K 个文件"
   meta, then go icon-only (before the row gets narrow enough for the branch
   name to collide with the access control). */
@container (max-width: 700px){
  .gbar-pill .gbar-meta{display:none}
}
@container (max-width: 620px){
  .gbar-pill .gbar-text{display:none}
  .gbar-pill .gbar-caret{display:none}
}

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

/* branch popup action entries (new branch / graph) */
.gbar-actions{display:flex;gap:6px;padding:8px 6px 4px;border-top:1px solid var(--dsw-alias-border-l1);margin-top:4px}
.gbar-act{
  flex:1;display:inline-flex;align-items:center;justify-content:center;gap:7px;
  height:34px;border:none;border-radius:10px;
  background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-primary);
  font:inherit;font-size:12.5px;font-weight:500;cursor:pointer;
}
.gbar-act:hover{background:var(--dsw-alias-interactive-bg-hover-solid)}
.gbar-act svg{width:14px;height:14px;opacity:.9;flex:none}
/* base-branch selector (new-branch dialog) */
.gbar-baserow{display:flex;align-items:center;gap:7px;padding:0}
.gbar-baselabel{font-size:12px;color:var(--dsw-alias-label-secondary);flex:none}
.gbar-base{
  flex:1;min-width:0;height:32px;padding:0 10px;
  border:1px solid var(--dsw-alias-border-l2);border-radius:9px;
  background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);
  font:inherit;font-size:12.5px;outline:none;cursor:pointer;
}
.gbar-base:focus{border-color:var(--dsw-alias-state-business-primary)}
.gbar-modal input{
  width:100%;height:38px;padding:0 13px;
  border:1px solid var(--dsw-alias-border-l2);border-radius:10px;
  background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);
  font:inherit;font-size:13.5px;outline:none;
}
.gbar-modal input:focus{border-color:var(--dsw-alias-state-business-primary)}
.gbar-modal input::placeholder{color:var(--dsw-alias-label-tertiary)}
.gbar-modal .gbar-pushrow{padding:0}
.gbar-x:disabled{opacity:.5;cursor:default}
/* commit-graph dialog */
.gbar-modal.gbar-graph-modal{width:min(760px,calc(100vw - 40px));gap:10px}
/* Refresh sits immediately left of close, both pinned to the right edge: the
   refresh takes the auto margin (specificity .gbar-x.gbar-refresh beats the
   .gbar-x override below), close drops it so they stay adjacent. */
.gbar-modal.gbar-graph-modal .gbar-head .gbar-x.gbar-refresh{margin-left:auto}
.gbar-modal.gbar-graph-modal .gbar-head .gbar-x{margin-left:0}
.gbar-modal.gbar-graph-modal .gbar-x svg{width:15px;height:15px;display:block}
.gbar-graph-empty{padding:28px 12px;text-align:center;font-size:13px;color:var(--dsw-alias-label-tertiary)}
.gbar-graph-table{display:flex;flex-direction:column;max-height:min(60vh,540px);overflow:auto;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-2)}
.gbar-graph-row{display:grid;grid-template-columns:62px 1fr 96px 90px;align-items:center;gap:8px;padding:5px 12px;border-bottom:1px solid var(--dsw-alias-border-l1)}
.gbar-graph-row:last-child{border-bottom:none}
.gbar-graph-row:hover{background:var(--dsw-alias-interactive-bg-hover)}
.gbar-graph-head{position:sticky;top:0;background:var(--dsw-alias-bg-module-platform);font-size:10.5px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--dsw-alias-label-tertiary);z-index:1}
.gbar-graph-head:hover{background:var(--dsw-alias-bg-module-platform)}
.gbar-c-hash code{font-family:var(--dsw-font-markdown-code-font-family,"SF Mono",Consolas,monospace);font-size:11px;color:var(--dsw-alias-label-secondary)}
.gbar-c-subject{min-width:0;display:flex;align-items:center;gap:8px}
.gbar-subject{font-size:12.5px;color:var(--dsw-alias-label-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gbar-refs{flex:none;font-size:10.5px;color:var(--dsw-alias-state-business-primary);background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 12%,transparent);border-radius:999px;padding:1px 8px;white-space:nowrap;max-width:220px;overflow:hidden;text-overflow:ellipsis}
.gbar-c-author{font-size:12px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gbar-c-date{font-size:11.5px;color:var(--dsw-alias-label-tertiary);text-align:right;white-space:nowrap}

/* diff side panel — fixed on the right; the conversation is pushed left via
   #root { margin-right } so the timeline rail stays visible. */
.gbar-side{
  position:fixed;right:0;top:0;bottom:0;z-index:80;
  display:flex;flex-direction:column;overflow:hidden;
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
/* The three stacked sections (files / diff / commit) are sized by drag: the two
   neighbours carry an explicit inline height and the diff pane absorbs whatever
   is left, so a drag can never overflow the panel. The dividing hairlines are
   painted by the splitters, not by the sections' own borders. */
.gbar-files{flex:none;overflow-y:auto}
/* horizontal drag splitters between the sections */
.gbar-vsplit{
  flex:none;position:relative;height:7px;
  cursor:row-resize;touch-action:none;-webkit-user-select:none;user-select:none;
}
.gbar-vsplit::after{
  content:"";position:absolute;left:0;right:0;top:3px;height:1px;
  background:var(--dsw-alias-border-l1);transition:background .15s ease,height .15s ease;
}
.gbar-vsplit:hover::after{background:var(--dsw-alias-border-l2);height:2px}
.gbar-vsplit.gbar-dragging::after{background:var(--dsw-alias-state-business-primary);height:2px}
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
.gbar-diff{flex:1;min-height:0;overflow:auto;font-family:var(--dsw-font-markdown-code-font-family,"SF Mono",Consolas,monospace);font-size:12px;line-height:1.7;padding:8px 0}
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
/* The hairline above the foot is drawn by the commit splitter that precedes it. */
.gbar-side-foot{flex:none;padding:8px 14px;font-size:11.5px;color:var(--dsw-alias-label-tertiary);display:flex;gap:8px;align-items:center}
.gbar-side-foot .gbar-dot{width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-state-warn-primary);flex:none}
/* commit row inside the diff panel — height is drag-adjustable, so the message
   field stretches to fill whatever the user gives this section. */
.gbar-side-commit{flex:none;min-height:0;overflow:hidden;display:flex;flex-direction:column;gap:7px;padding:9px 12px;border-top:1px solid var(--dsw-alias-border-l1)}
.gbar-side-commit .gbar-crow{flex:1;min-height:0;display:flex;align-items:stretch;gap:6px}
.gbar-side-commit textarea{
  flex:1;min-width:0;min-height:30px;padding:6px 10px;resize:none;
  border:1px solid var(--dsw-alias-border-l2);border-radius:8px;
  background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);
  font:inherit;font-size:12px;line-height:1.6;outline:none;overflow-y:auto;
}
.gbar-side-commit textarea:focus{border-color:var(--dsw-alias-state-business-primary)}
.gbar-side-commit textarea::placeholder{color:var(--dsw-alias-label-tertiary)}
.gbar-side-commit .gbar-actions{flex:none;display:flex;align-items:center;justify-content:flex-end;gap:6px}
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

/** Branch names that must never be deletable (main/master). */
function isProtectedBranch(name: string): boolean {
  return name === 'main' || name === 'master'
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
// Git status polling hook (shared by both pills).
// ---------------------------------------------------------------------------

/** Load the git snapshot on session change, then poll; returns [snapshot, refresh]. */
function useGitStatus(enabled: boolean, session: string | undefined): [GitSnapshot | null, () => Promise<void>] {
  const [snapshot, setSnapshot] = useState<GitSnapshot | null>(null)

  useEffect(() => {
    if (!enabled || session === undefined) {
      setSnapshot(null)
      return
    }
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

  const refresh = useCallback(async (): Promise<void> => {
    if (session === undefined) return
    try {
      setSnapshot(await apiGet<GitSnapshot>(`${GIT_ROUTE}/status?session=${encodeURIComponent(session)}`))
    } catch {
      // Keep the previous snapshot on transient failures.
    }
  }, [session])

  return [snapshot, refresh]
}

// ---------------------------------------------------------------------------
// Branch pill — `conversation.input.left` (inside the composer tool row, right
// after the access-mode control).
// ---------------------------------------------------------------------------

export interface GitBarBranchProps {
  /** InputZone owner share: the live conversation snapshot (sessionId, running). */
  session: ConversationSnapshot
  /** Injected: the ui-tweaks settings store (reads `gitBarEnabled`). */
  controller: SettingsClient
  /** Locale-bound translator for the GitBar labels. */
  t: Translate
}

export function GitBarBranch({ session, controller, t }: GitBarBranchProps) {
  const settingsState = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot)
  const enabled = settingsState.value?.gitBarEnabled ?? true
  const sessionStr = session === undefined ? undefined : String(session.sessionId)

  const [snapshot, refresh] = useGitStatus(enabled, sessionStr)
  const [branchOpen, setBranchOpen] = useState(false)
  const [branches, setBranches] = useState<GitBranches | null>(null)
  const [newBranchName, setNewBranchName] = useState('')
  const [pushToRemote, setPushToRemote] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [baseBranch, setBaseBranch] = useState('')
  const [newBranchOpen, setNewBranchOpen] = useState(false)
  const [graphOpen, setGraphOpen] = useState(false)
  const [graph, setGraph] = useState<GitGraph | null>(null)
  const [graphBusy, setGraphBusy] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const branchRef = useRef<HTMLButtonElement | null>(null)
  const branchPopRef = useRef<HTMLDivElement | null>(null)

  // Drop any open popup/dialog when the session or the toggle changes.
  useEffect(() => {
    if (!enabled || sessionStr === undefined) {
      setBranchOpen(false)
      setNewBranchOpen(false)
      setGraphOpen(false)
    }
  }, [enabled, sessionStr])

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
    if (sessionStr === undefined) return
    void apiGet<GitBranches>(`${GIT_ROUTE}/branches?session=${encodeURIComponent(sessionStr)}`)
      .then(setBranches)
      .catch(cause => { showNotice('err', cause instanceof Error ? cause.message : String(cause)) })
  }

  const toggleBranch = (): void => {
    const next = !branchOpen
    setBranchOpen(next)
    if (next) loadBranches()
  }

  const pickBranch = (name: string): void => {
    if (sessionStr === undefined || name === branches?.current) return
    void run('checkout', async () => {
      await apiPost(`${GIT_ROUTE}/checkout`, { session: sessionStr, branch: name })
      setBranchOpen(false)
      await refresh()
      showNotice('ok', `→ ${name}`)
    })
  }

  const createBranch = (): void => {
    if (sessionStr === undefined || newBranchName.trim() === '') return
    void run(pushToRemote ? 'create-push' : 'create', async () => {
      await apiPost(`${GIT_ROUTE}/create`, {
        session: sessionStr,
        name: newBranchName.trim(),
        base: baseBranch === '' ? undefined : baseBranch,
        push: pushToRemote,
      })
      setBranchOpen(false)
      setNewBranchOpen(false)
      setNewBranchName('')
      setPushToRemote(false)
      setBaseBranch('')
      await refresh()
      if (pushToRemote) showNotice('ok', `☁ ${newBranchName.trim()}`)
    })
  }

  const openNewBranch = (): void => {
    setNewBranchName('')
    setBaseBranch('')
    setPushToRemote(false)
    setNewBranchOpen(true)
  }

  // Two-step branch deletion: first click arms a confirm, second click deletes.
  const deleteBranch = (name: string): void => {
    if (sessionStr === undefined) return
    if (confirmDelete === name) {
      setConfirmDelete(null)
      void run('branch-delete', async () => {
        await apiPost(`${GIT_ROUTE}/branch-delete`, { session: sessionStr, name })
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

  // Two-step remote-branch deletion (`git push origin --delete <branch>`).
  const deleteRemoteBranch = (name: string): void => {
    if (sessionStr === undefined) return
    if (confirmDelete === name) {
      setConfirmDelete(null)
      void run('remote-delete', async () => {
        await apiPost(`${GIT_ROUTE}/remote-delete`, { session: sessionStr, name })
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

  // --- git commit graph dialog ------------------------------------------------
  const fetchGraph = (): void => {
    if (sessionStr === undefined) return
    setGraphBusy(true)
    void apiGet<GitGraph>(`${GIT_ROUTE}/graph?session=${encodeURIComponent(sessionStr)}&limit=150`)
      .then(setGraph)
      .catch(cause => { showNotice('err', cause instanceof Error ? cause.message : String(cause)) })
      .finally(() => { setGraphBusy(false) })
  }

  const openGraph = (): void => {
    setGraphOpen(true)
    fetchGraph()
  }

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

  if (!enabled || sessionStr === undefined) return null
  if (snapshot === null || !snapshot.isRepo) return null

  const dirty = !snapshot.clean

  return (
    <span className="gbar" data-slot-plugin="dsh-ui-tweaks-gitbar">
      {/* Branch pill */}
      <button
        type="button"
        ref={branchRef}
        className={'gbar-pill' + (branchOpen ? ' gbar-active' : '')}
        onClick={toggleBranch}
        title={dirty ? t('dirty') : t('clean')}
        aria-expanded={branchOpen}
      >
        {/* Outline git-branch mark, same stroke style as the resident access-mode
            shield: circles at top and bottom balance the optical weight, so the
            icon reads as vertically centered in the pill. */}
        <svg className="gbar-ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="4.5" cy="3.5" r="1.8" />
          <circle cx="4.5" cy="12.5" r="1.8" />
          <circle cx="12" cy="5.5" r="1.8" />
          <path d="M4.5 5.3v5.4" />
          <path d="M12 7.3c0 3-3.5 4.8-7.5 3.4" />
        </svg>
        <span className="gbar-text gbar-branch">{snapshot.branch ?? snapshot.detachedHead ?? '—'}</span>
        <span className="gbar-caret" aria-hidden>▾</span>
      </button>

      {/* Branch popup — branch list + action entries (new branch / graph) */}
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
              {name !== branches.current && !isProtectedBranch(name) ? (
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
            <div key={name} className="gbar-rowwrap">
              <button
                type="button"
                className={'gbar-row' + (name === branches.current ? ' gbar-cur' : '')}
                onClick={() => { pickBranch(name) }}
              >
                <span>{shortBranch(name)}</span>
                <span className="gbar-rm">{name.split('/')[0]}</span>
              </button>
              {!isProtectedBranch(shortBranch(name)) ? (
                <button
                  type="button"
                  className={'gbar-del' + (confirmDelete === name ? ' gbar-arm' : '')}
                  onClick={() => { deleteRemoteBranch(name) }}
                  title={t('branchRemoteDelete')}
                >
                  {confirmDelete === name ? t('branchDeleteConfirm') : '🗑'}
                </button>
              ) : null}
            </div>
          ))}
          <div className="gbar-actions">
            <button type="button" className="gbar-act" onClick={openNewBranch}>
              <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden>
                <path d="M7.4 2.6a1.2 1.2 0 1 1 2.2 0l3.2 1.6a1.2 1.2 0 1 1-1.1 2.1l-2.3-1.2a2.6 2.6 0 0 1-1.1.8l.6 4.2a1.2 1.2 0 1 1-1.7.2l-.6-4.2a2.6 2.6 0 0 1-1.2-.7l-2.9 1.5a1.2 1.2 0 1 1-1.1-2.1l2.9-1.5a2.6 2.6 0 0 1 .2-1.5l-3.2-1.6a1.2 1.2 0 1 1 1.1-2.1z" />
              </svg>
              {t('branchNew')}
            </button>
            <button type="button" className="gbar-act" onClick={openGraph}>
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                <path d="M3 1.5v3.4a4.4 4.4 0 0 0 4.4 4.4h5.1" />
                <path d="M13 1.5v4.9a3.2 3.2 0 0 1-3.2 3.2H3" />
                <circle cx="3" cy="1.5" r="1.2" fill="currentColor" stroke="none" />
                <circle cx="13" cy="12" r="1.2" fill="currentColor" stroke="none" />
              </svg>
              {t('branchGraph')}
            </button>
          </div>
        </div>
      ) : null}

      {/* New-branch dialog */}
      {newBranchOpen ? createPortal(
        <div className="gbar-modal-wrap" onMouseDown={event => { if (event.target === event.currentTarget) setNewBranchOpen(false) }}>
          <div className="gbar-modal" role="dialog" aria-label={t('branchNew')}>
            <div className="gbar-head">
              <span className="gbar-title">{t('branchNew')}</span>
              <span className="gbar-branch">{snapshot.branch ?? snapshot.detachedHead ?? '—'}</span>
              <button type="button" className="gbar-x" onClick={() => { setNewBranchOpen(false) }} aria-label="✕">✕</button>
            </div>
            <input
              value={newBranchName}
              onChange={event => { setNewBranchName(event.target.value) }}
              onKeyDown={event => { if (event.key === 'Enter') createBranch() }}
              placeholder={t('branchNewPlaceholder')}
              aria-label={t('branchNew')}
              autoFocus
            />
            <div className="gbar-baserow">
              <label className="gbar-baselabel" htmlFor="gbar-base-dlg">{t('branchFrom')}</label>
              <select
                id="gbar-base-dlg"
                className="gbar-base"
                value={baseBranch}
                onChange={event => { setBaseBranch(event.target.value) }}
                aria-label={t('branchFrom')}
              >
                <option value="">{t('branchFromHead')}</option>
                {branches?.local.map(name => <option key={name} value={name}>{name}</option>)}
                {branches?.remote.map(name => <option key={name} value={name}>{name}</option>)}
              </select>
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
            <div className="gbar-foot">
              <button type="button" className="gbar-btn gbar-ghost" onClick={() => { setNewBranchOpen(false) }}>{t('branchCancel')}</button>
              <button type="button" className="gbar-btn gbar-primary" onClick={createBranch} disabled={busy !== null || newBranchName.trim() === ''}>
                {busy === 'create' || busy === 'create-push' ? <span className="gbar-spin" /> : null} {t('branchCreate')}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      ) : null}

      {/* Commit-graph dialog */}
      {graphOpen ? createPortal(
        <div className="gbar-modal-wrap" onMouseDown={event => { if (event.target === event.currentTarget) setGraphOpen(false) }}>
          <div className="gbar-modal gbar-graph-modal" role="dialog" aria-label={t('graphTitle')}>
            <div className="gbar-head">
              <span className="gbar-title">{t('graphTitle')}</span>
              <span className="gbar-branch">{snapshot.branch ?? snapshot.detachedHead ?? '—'}</span>
              <span className="gbar-spacer" />
              <button type="button" className="gbar-x gbar-refresh" onClick={fetchGraph} aria-label={t('branchRefresh')} title={t('branchRefresh')} disabled={graphBusy}>
                {graphBusy ? <span className="gbar-spin" /> : (
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M13.4 8a5.4 5.4 0 1 1-1.6-3.8" />
                    <path d="M13.4 1.5v3h-3" />
                  </svg>
                )}
              </button>
              <button type="button" className="gbar-x" onClick={() => { setGraphOpen(false) }} aria-label="✕">✕</button>
            </div>
            {graph === null ? (
              <div className="gbar-graph-empty">{graphBusy ? t('loading') : t('noChanges')}</div>
            ) : graph.commits.length === 0 ? (
              <div className="gbar-graph-empty">{t('noChanges')}</div>
            ) : (
              <div className="gbar-graph-table" role="table" aria-label={t('graphTitle')}>
                <div className="gbar-graph-row gbar-graph-head" role="row">
                  <span className="gbar-c-hash" role="columnheader">{t('graphColCommit')}</span>
                  <span className="gbar-c-subject" role="columnheader">{t('graphColSubject')}</span>
                  <span className="gbar-c-author" role="columnheader">{t('graphColAuthor')}</span>
                  <span className="gbar-c-date" role="columnheader">{t('graphColDate')}</span>
                </div>
                {graph.commits.map(commit => (
                  <div key={commit.fullHash} className="gbar-graph-row" role="row">
                    <span className="gbar-c-hash" role="cell"><code className="gbar-hash">{commit.hash}</code></span>
                    <span className="gbar-c-subject" role="cell">
                      <span className="gbar-subject">{commit.subject}</span>
                      {commit.refs !== '' ? <span className="gbar-refs">{commit.refs}</span> : null}
                    </span>
                    <span className="gbar-c-author" role="cell">{commit.author}</span>
                    <span className="gbar-c-date" role="cell" title={commit.date}>{commit.dateRelative}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>,
        document.body,
      ) : null}

      {/* Transient notice */}
      {notice !== null ? createPortal(
        <div className={'gbar-notice gbar-' + notice.kind} role="status">{notice.text}</div>,
        document.body,
      ) : null}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Diff pill — `conversation.input.right` (inside the composer tool row, just
// before the model select). Opens the slide-over diff panel, which keeps the
// commit band at its foot.
// ---------------------------------------------------------------------------

export interface GitBarDiffProps {
  /** InputZone owner share: the live conversation snapshot (sessionId, running). */
  session: ConversationSnapshot
  /** Injected: the ui-tweaks settings store (reads `gitBarEnabled`). */
  controller: SettingsClient
  /** Locale-bound translator for the GitBar labels. */
  t: Translate
}

export function GitBarDiff({ session, controller, t }: GitBarDiffProps) {
  const settingsState = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot)
  const enabled = settingsState.value?.gitBarEnabled ?? true
  const sessionStr = session === undefined ? undefined : String(session.sessionId)
  const agentRunning = session.running === true

  const [snapshot, refresh] = useGitStatus(enabled, sessionStr)
  const [diffOpen, setDiffOpen] = useState(false)
  const [diff, setDiff] = useState<GitDiffResult | null>(null)
  const [diffMode, setDiffMode] = useState<'hunk' | 'full'>('hunk')
  const [diffPath, setDiffPath] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(new Set())
  const [diffWidth, setDiffWidth] = useState(440)
  const [panelTop, setPanelTop] = useState(0)
  const [filesHeight, setFilesHeight] = useState<number | null>(null)
  const [commitHeight, setCommitHeight] = useState<number | null>(null)
  const [dragging, setDragging] = useState<'files' | 'commit' | null>(null)

  // Close the panel and drop selections when the session or the toggle changes.
  useEffect(() => {
    if (!enabled || sessionStr === undefined) {
      setDiffOpen(false)
      setDiffPath(null)
    }
  }, [enabled, sessionStr])

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

  const selectDiffFile = (path: string): void => {
    setDiffPath(path)
  }

  const switchDiffMode = (mode: 'hunk' | 'full'): void => {
    setDiffMode(mode)
  }

  // Load the selected file's diff when the panel opens or the selection/mode changes.
  useEffect(() => {
    if (!diffOpen || sessionStr === undefined || diffPath === null) return
    let cancelled = false
    setDiff(null)
    void apiGet<GitDiffResult>(
      `${GIT_ROUTE}/diff?session=${encodeURIComponent(sessionStr)}&file=${encodeURIComponent(diffPath)}&mode=${diffMode}`,
    ).then(result => {
      if (!cancelled) setDiff(result)
    }).catch(cause => {
      if (!cancelled) showNotice('err', cause instanceof Error ? cause.message : String(cause))
    })
    return () => { cancelled = true }
  }, [diffOpen, sessionStr, diffPath, diffMode])

  const doCommit = (push: boolean): void => {
    if (sessionStr === undefined || agentRunning) return
    void run(push ? 'commit-push' : 'commit', async () => {
      const msg = message.trim()
      if (msg === '') {
        showNotice('err', t('commitEmpty'))
        return
      }
      const result = await apiPost<{ hash?: string; pushed: boolean }>(`${GIT_ROUTE}/commit`, {
        session: sessionStr,
        message: msg,
        push,
        exclude: [...excluded],
      })
      setDiffOpen(false)
      setMessage('')
      setExcluded(new Set())
      await refresh()
      showNotice('ok', push ? `✓ ${result.hash ?? 'committed'} · pushed` : `✓ ${result.hash ?? 'committed'}`)
    })
  }

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

  // Close the diff panel when clicking outside it (the pill's own onClick toggles).
  useEffect(() => {
    if (!diffOpen) return
    const onDown = (event: MouseEvent): void => {
      const target = event.target as Node | null
      if (target === null) return
      if (document.querySelector('.gbar-side')?.contains(target)) return
      if (document.querySelector('.gbar')?.contains(target)) return
      setDiffOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => { document.removeEventListener('mousedown', onDown) }
  }, [diffOpen])

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

  // Drag a horizontal splitter to redistribute height between the panel's
  // sections. Only the dragged section gets an explicit height; the diff pane is
  // the flexible one, so every pixel a neighbour gains comes out of the diff and
  // the total never exceeds the panel. Double-click restores automatic sizing.
  const startVResize = (
    target: 'files' | 'commit',
    event: { clientY: number; preventDefault: () => void },
  ): void => {
    event.preventDefault()
    const panel = document.querySelector('.gbar-side')
    const measure = (selector: string): number => {
      const el = panel?.querySelector(selector) ?? null
      return el === null ? 0 : el.getBoundingClientRect().height
    }
    const startY = event.clientY
    const startFiles = measure('.gbar-files')
    const startCommit = measure('.gbar-side-commit')
    const startDiff = measure('.gbar-diff')
    setDragging(target)
    const onMove = (move: PointerEvent): void => {
      const delta = move.clientY - startY
      if (target === 'files') {
        // Dragging down grows the file list and shrinks the diff.
        const ceiling = Math.max(MIN_FILES_H, startFiles + startDiff - MIN_DIFF_H)
        setFilesHeight(Math.round(Math.min(ceiling, Math.max(MIN_FILES_H, startFiles + delta))))
      } else {
        // Dragging up grows the commit band and shrinks the diff.
        const ceiling = Math.max(MIN_COMMIT_H, startCommit + startDiff - MIN_DIFF_H)
        setCommitHeight(Math.round(Math.min(ceiling, Math.max(MIN_COMMIT_H, startCommit - delta))))
      }
    }
    const onUp = (): void => {
      setDragging(null)
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

  if (!enabled || sessionStr === undefined) return null
  if (snapshot === null || !snapshot.isRepo) return null

  const dirty = !snapshot.clean

  return (
    <span className="gbar" data-slot-plugin="dsh-ui-tweaks-gitbar">
      {/* Diff pill */}
      <button
        type="button"
        className={'gbar-pill' + (diffOpen ? ' gbar-active' : '')}
        onClick={openDiff}
        title={t('diffTitle')}
      >
        <svg className="gbar-ico" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
          <path d="M5 1.5h4l3 3V13a1.5 1.5 0 0 1-1.5 1.5h-5A1.5 1.5 0 0 1 4 13V3A1.5 1.5 0 0 1 5 1.5zM5 2.5V13h5V5.2L8.8 3.5H5zm.5 4.5a.75.75 0 1 1 0 1.5.75.75 0 0 1 0-1.5zm3.25.25h-1.5v1.5h1.5V7.25zm.25 2.5H5.75v1.5h3.25v-1.5z" />
        </svg>
        <span className="gbar-text">
          {dirty ? (
            <>
              <span className="gbar-add">+{snapshot.totalAdded}</span>
              <span className="gbar-del">−{snapshot.totalDeleted}</span>
              <span className="gbar-meta">· {snapshot.files.length} {t('diffFiles')}</span>
            </>
          ) : (
            <span className="gbar-hint">{t('clean')}</span>
          )}
        </span>
      </button>

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
            <div
              className="gbar-files"
              style={filesHeight === null
                ? { maxHeight: FILES_AUTO_MAX }
                : { height: filesHeight, maxHeight: SECTION_MAX }}
            >
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
            <div
              className={'gbar-vsplit' + (dragging === 'files' ? ' gbar-dragging' : '')}
              role="separator"
              aria-orientation="horizontal"
              title="拖动调整文件列表高度（双击复位）"
              onPointerDown={event => { startVResize('files', event) }}
              onDoubleClick={() => { setFilesHeight(null) }}
            />
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
            {dirty ? (
              <div
                className={'gbar-vsplit' + (dragging === 'commit' ? ' gbar-dragging' : '')}
                role="separator"
                aria-orientation="horizontal"
                title="拖动调整提交区高度（双击复位）"
                onPointerDown={event => { startVResize('commit', event) }}
                onDoubleClick={() => { setCommitHeight(null) }}
              />
            ) : null}
          </div>
          <div className="gbar-side-foot">
            <span className="gbar-dot" />
            {snapshot.branch ?? '—'} · {dirty ? t('dirty') : t('clean')}
          </div>
          {dirty ? (
            <div
              className="gbar-side-commit"
              style={commitHeight === null ? undefined : { height: commitHeight, maxHeight: SECTION_MAX }}
            >
              <div className="gbar-crow">
                <textarea
                  value={message}
                  onChange={event => { setMessage(event.target.value) }}
                  onKeyDown={event => {
                    // Enter commits; Shift+Enter adds a line, now that this field
                    // can be dragged tall enough for a multi-line message.
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault()
                      doCommit(false)
                    }
                  }}
                  placeholder={t('commitPlaceholder')}
                  aria-label={t('commitMessage')}
                  rows={1}
                />
              </div>
              <div className="gbar-actions">
                <button type="button" className="gbar-btn gbar-soft" onClick={() => { doCommit(false) }} disabled={busy !== null || agentRunning}>
                  {t('commitSubmit')}
                </button>
                <button type="button" className="gbar-btn gbar-primary" onClick={() => { doCommit(true) }} disabled={busy !== null || agentRunning}>
                  {t('commitSubmitPush')}
                </button>
              </div>
            </div>
          ) : null}
        </div>,
        document.body,
      ) : null}

      {/* Transient notice */}
      {notice !== null ? createPortal(
        <div className={'gbar-notice gbar-' + notice.kind} role="status">{notice.text}</div>,
        document.body,
      ) : null}
    </span>
  )
}