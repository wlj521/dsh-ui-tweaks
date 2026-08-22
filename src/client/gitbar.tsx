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

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { createRoot } from 'react-dom/client'
import type { ConversationSnapshot, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type { SettingsClient } from './index.tsx'
import { APP_ICONS } from './appicons.ts'

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
  | 'commitBusy'
  | 'dirty' | 'clean' | 'noChanges' | 'loading' | 'branchDelete' | 'branchDeleteConfirm'
  | 'includeFile' | 'excludeFile' | 'branchPushRemote'
  | 'branchRemoteDelete' | 'branchFrom' | 'branchFromHead' | 'branchGraph'
  | 'branchRefresh' | 'branchCancel' | 'graphTitle'
  | 'graphColGraph' | 'graphColCommit' | 'graphColSubject' | 'graphColAuthor' | 'graphColDate'
  | 'openProject' | 'terminal' | 'openExplorer' | 'openVscode' | 'openIdea'
  | 'openGoland' | 'openWebstorm' | 'openPycharm'
  | 'termConnecting' | 'termExited' | 'termUnavailable' | 'termLost'

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

/**
 * Where git ops resolve their working directory: a real session id, or a
 * workspace title for the hero/new-session screen (which has no materialized
 * session yet — the server resolves the picked workspace's path instead).
 */
export interface GitTarget { session?: string; ws?: string }

function targetQuery(t: GitTarget): string {
  if (t.session !== undefined) return `session=${encodeURIComponent(t.session)}`
  if (t.ws !== undefined) return `ws=${encodeURIComponent(t.ws)}`
  return ''
}

function targetFields(t: GitTarget): Record<string, string> {
  const out: Record<string, string> = {}
  if (t.session !== undefined) out.session = t.session
  if (t.ws !== undefined) out.ws = t.ws
  return out
}

/** Basename of a cwd path ('' / undefined → '—'), for the chip's folder label. */
function basenameOf(path: string | undefined): string {
  if (path === undefined || path === '') return '—'
  const norm = path.replace(/[\\/]+$/, '')
  const idx = Math.max(norm.lastIndexOf('\\'), norm.lastIndexOf('/'))
  return idx >= 0 ? norm.slice(idx + 1) : norm
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
.gbar{position:relative;display:inline-flex;align-items:center;gap:6px;flex:0 1 auto;min-width:0}
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

/* branch popup — the chip lives in the session HEADER now, so the menu opens
   DOWNWARD (top-anchored, small arrow pointing up). Pinned header (current
   branch + worktree state) and pinned action bar surround a freely scrolling
   branch list. */
.gbar-pop{
  position:absolute;left:0;top:calc(100% + 8px);z-index:120;
  width:300px;
  background:var(--dsw-alias-bg-layer-1);
  border:1px solid var(--dsw-alias-border-l2);border-radius:14px;
  box-shadow:var(--dsw-shadow-lv2);
  display:flex;flex-direction:column;overflow:hidden;
  animation:gpop-down .16s cubic-bezier(.32,.72,0,1);
}
.gbar-pop::before{content:"";position:absolute;top:-5px;left:22px;width:9px;height:9px;
  background:var(--dsw-alias-bg-layer-1);border-left:1px solid var(--dsw-alias-border-l2);
  border-top:1px solid var(--dsw-alias-border-l2);transform:rotate(45deg)}
@keyframes gpop-down{from{opacity:0;transform:translateY(-5px)}to{opacity:1;transform:none}}
.gbar-pop-head{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-module-platform)}
.gbar-pop-head .gbar-bicon{width:14px;height:14px;flex:none}
.gbar-pop-head .gbar-curname{display:flex;align-items:center;gap:7px;min-width:0;font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary)}
.gbar-pop-head .gbar-curname .gbar-bicon{color:var(--dsw-alias-state-business-primary)}
.gbar-pop-head .gbar-curname>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gbar-pop-head .gbar-state{margin-left:auto;flex:none;display:flex;align-items:center;gap:6px;font-size:11px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}
.gbar-pop-head .gbar-dot{width:6px;height:6px;border-radius:50%;flex:none}
.gbar-pop-head .gbar-dot.gbar-dirty{background:var(--dsw-alias-state-warn-primary)}
.gbar-pop-head .gbar-dot.gbar-clean{background:var(--dsw-alias-state-success-primary)}
.gbar-pop-body{max-height:min(330px,calc(100vh - 250px));overflow-y:auto;padding:3px 6px 5px;scrollbar-width:thin;scrollbar-color:color-mix(in srgb,var(--dsw-alias-label-tertiary) 35%,transparent) transparent}
.gbar-pop-body::-webkit-scrollbar{width:5px}
.gbar-pop-body::-webkit-scrollbar-track{background:transparent}
.gbar-pop-body::-webkit-scrollbar-thumb{background:color-mix(in srgb,var(--dsw-alias-label-tertiary) 35%,transparent);border-radius:4px}
.gbar-pop .gbar-sec{display:flex;align-items:center;gap:6px;font-size:10.5px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--dsw-alias-label-tertiary);padding:8px 9px 3px}
.gbar-pop .gbar-sec .gbar-count{margin-left:auto;font-size:10px;font-weight:500;letter-spacing:0;line-height:15px;color:var(--dsw-alias-label-tertiary);background:var(--dsw-alias-bg-module-platform);border-radius:999px;padding:0 7px}
.gbar-pop .gbar-loading{display:flex;align-items:center;justify-content:center;gap:8px;padding:14px 9px;font-size:12px;color:var(--dsw-alias-label-tertiary)}
.gbar-pop .gbar-row{
  display:flex;align-items:center;gap:8px;width:100%;
  padding:6px 8px;border:none;border-radius:8px;
  background:transparent;color:var(--dsw-alias-label-primary);
  font:inherit;font-size:12.5px;cursor:pointer;text-align:left;
  transition:background .12s ease;
}
.gbar-pop .gbar-row:hover{background:var(--dsw-alias-interactive-bg-hover)}
.gbar-pop .gbar-row.gbar-cur{color:var(--dsw-alias-state-business-primary);font-weight:600}
.gbar-pop .gbar-row .gbar-bicon{width:13px;height:13px;flex:none;color:var(--dsw-alias-label-tertiary);opacity:.85}
.gbar-pop .gbar-row.gbar-cur .gbar-bicon{color:var(--dsw-alias-state-business-primary);opacity:1}
.gbar-pop .gbar-row .gbar-check{margin-left:auto;color:var(--dsw-alias-state-business-primary);font-weight:700}
.gbar-pop .gbar-row .gbar-rm{flex:none;font-size:10px;line-height:15px;color:var(--dsw-alias-label-tertiary);background:var(--dsw-alias-bg-module-platform);border-radius:999px;padding:0 7px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:90px}
/* branch row wrapper: main switch button + delete button */
.gbar-pop .gbar-rowwrap{display:flex;align-items:center;gap:2px;border-radius:8px;transition:background .12s ease}
.gbar-pop .gbar-rowwrap:hover{background:var(--dsw-alias-interactive-bg-hover)}
.gbar-pop .gbar-rowwrap .gbar-row{background:transparent}
.gbar-pop .gbar-del{
  flex:none;display:inline-flex;align-items:center;justify-content:center;
  width:26px;height:26px;border:none;background:transparent;color:var(--dsw-alias-label-tertiary);
  font:inherit;font-size:10.5px;cursor:pointer;border-radius:7px;margin-right:4px;
  transition:color .12s ease,background .12s ease;
}
.gbar-pop .gbar-del svg{width:13px;height:13px;display:block}
.gbar-pop .gbar-del:hover{color:var(--dsw-alias-state-error-primary);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 10%,transparent)}
.gbar-pop .gbar-del.gbar-arm{width:auto;padding:0 8px;color:var(--dsw-alias-state-error-primary);font-weight:600;background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 10%,transparent)}
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

/* branch popup action entries (new branch / graph) — pinned below the
   scrolling list; the border-top separates it from the body. */
.gbar-actions{display:flex;gap:6px;padding:8px;border-top:1px solid var(--dsw-alias-border-l1)}
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
.gbar-modal .gbar-head{padding-bottom:10px;border-bottom:1px solid var(--dsw-alias-border-l1)}
/* "push to remote" row becomes an inset card so it reads as one option group. */
.gbar-modal .gbar-pushrow{padding:9px 11px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-2)}
.gbar-modal .gbar-pushrow .gbar-pushlabel{font-size:12.5px;color:var(--dsw-alias-label-primary)}
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
.gbar-graph-row{display:grid;grid-template-columns:62px 1fr 96px 90px;align-items:center;gap:8px;padding:5px 12px;border-bottom:1px solid var(--dsw-alias-border-l1);transition:background .12s ease}
.gbar-graph-row:last-child{border-bottom:none}
/* Zebra striping for scanability; the hover rule matches its specificity and
   comes later in the sheet, so pointing at a row still wins. */
.gbar-graph-row:not(.gbar-graph-head):nth-child(odd){background:color-mix(in srgb,var(--dsw-alias-bg-module-platform) 35%,transparent)}
.gbar-graph-row:not(.gbar-graph-head):hover{background:var(--dsw-alias-interactive-bg-hover)}
.gbar-graph-head{position:sticky;top:0;background:var(--dsw-alias-bg-module-platform);font-size:10.5px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--dsw-alias-label-tertiary);z-index:1;border-bottom:1px solid var(--dsw-alias-border-l1)}
.gbar-c-hash code{font-family:var(--dsw-font-markdown-code-font-family,"SF Mono",Consolas,monospace);font-size:11px;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-module-platform);border-radius:6px;padding:2px 6px}
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
.gbar-side-head .gbar-sub{font-size:12px;color:var(--dsw-alias-label-tertiary);flex:none;font-variant-numeric:tabular-nums}
.gbar-side-head .gbar-sub .gbar-a{color:var(--dsw-alias-state-success-primary)}
.gbar-side-head .gbar-sub .gbar-d{color:var(--dsw-alias-state-error-primary)}
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
.gbar-files{flex:none;overflow-y:auto;scrollbar-width:thin;scrollbar-color:color-mix(in srgb,var(--dsw-alias-label-tertiary) 35%,transparent) transparent}
.gbar-files::-webkit-scrollbar{width:5px}
.gbar-files::-webkit-scrollbar-thumb{background:color-mix(in srgb,var(--dsw-alias-label-tertiary) 35%,transparent);border-radius:4px}
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
.gbar-file.gbar-on .gbar-file-main{background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 9%,transparent);box-shadow:inset 2px 0 0 var(--dsw-alias-state-business-primary)}
.gbar-file.gbar-excl{opacity:.55}
.gbar-chk{
  flex:none;width:16px;height:16px;padding:0;
  border:1px solid var(--dsw-alias-border-l2);border-radius:5px;
  background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-state-business-primary);
  font-size:11px;line-height:1;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;
}
.gbar-chk:hover{border-color:var(--dsw-alias-state-business-primary)}
.gbar-chk.gbar-off{color:transparent}
.gbar-file .gbar-st{
  flex:none;min-width:17px;height:17px;padding:0 4px;
  display:inline-flex;align-items:center;justify-content:center;
  font-weight:700;font-size:10.5px;border-radius:5px;
}
.gbar-file .gbar-st.gbar-m{color:var(--dsw-alias-state-warn-primary);background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 13%,transparent)}
.gbar-file .gbar-st.gbar-a{color:var(--dsw-alias-state-success-primary);background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 13%,transparent)}
.gbar-file .gbar-st.gbar-d{color:var(--dsw-alias-state-error-primary);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 12%,transparent)}
.gbar-file .gbar-st.gbar-u{color:var(--dsw-alias-label-tertiary);background:var(--dsw-alias-bg-module-platform)}
.gbar-file .gbar-path{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:var(--dsw-font-markdown-code-font-family,"SF Mono",Consolas,monospace);font-size:12px}
/* Directory part dims, filename stays bright — GitHub-style path rendering. */
.gbar-file .gbar-path .gbar-dir{color:var(--dsw-alias-label-tertiary)}
.gbar-file .gbar-nums{flex:none;font-variant-numeric:tabular-nums;font-size:11.5px}
.gbar-file .gbar-nums .gbar-a{color:var(--dsw-alias-state-success-primary)}
.gbar-file .gbar-nums .gbar-d{color:var(--dsw-alias-state-error-primary)}
.gbar-diff{
  flex:1;min-height:0;overflow:auto;
  font-family:var(--dsw-font-markdown-code-font-family,"SF Mono",Consolas,monospace);font-size:12px;line-height:1.7;padding:8px 0;
  scrollbar-width:thin;scrollbar-color:color-mix(in srgb,var(--dsw-alias-label-tertiary) 35%,transparent) transparent;
}
.gbar-diff::-webkit-scrollbar{width:5px;height:5px}
.gbar-diff::-webkit-scrollbar-thumb{background:color-mix(in srgb,var(--dsw-alias-label-tertiary) 35%,transparent);border-radius:4px}
/* Hunk header: a centered pill strip (GitHub-style), gutter numbers hidden but
   still occupying space so the code column stays aligned. */
.gbar-diff .gbar-line.gbar-hunk{background:transparent;padding-top:7px;padding-bottom:3px}
.gbar-diff .gbar-line.gbar-hunk .gbar-ln{visibility:hidden}
.gbar-diff .gbar-line.gbar-hunk .gbar-code{color:var(--dsw-alias-state-business-primary)}
.gbar-diff .gbar-line{display:flex;align-items:center;min-height:21px;padding:0 14px 0 0;white-space:pre}
.gbar-diff .gbar-line .gbar-ln{flex:none;width:34px;text-align:right;padding-right:8px;color:var(--dsw-alias-label-tertiary);font-size:11px;-webkit-user-select:none;user-select:none}
.gbar-diff .gbar-line .gbar-ln+.gbar-ln{border-right:1px solid var(--dsw-alias-border-l1);margin-right:10px}
.gbar-diff .gbar-line .gbar-code{flex:1;white-space:pre;color:var(--dsw-alias-label-primary);padding-right:14px}
.gbar-diff .gbar-line.gbar-add{background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 13%,transparent);box-shadow:inset 2px 0 0 color-mix(in srgb,var(--dsw-alias-state-success-primary) 55%,transparent)}
.gbar-diff .gbar-line.gbar-add .gbar-ln{color:var(--dsw-alias-state-success-primary)}
.gbar-diff .gbar-line.gbar-del{background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 10%,transparent);box-shadow:inset 2px 0 0 color-mix(in srgb,var(--dsw-alias-state-error-primary) 50%,transparent)}
.gbar-diff .gbar-line.gbar-del .gbar-ln{color:var(--dsw-alias-state-error-primary)}
.gbar-diff .gbar-line.gbar-ctx .gbar-code{color:var(--dsw-alias-label-secondary)}
.gbar-diff .gbar-empty{display:flex;align-items:center;justify-content:center;min-height:140px;font-size:12px;color:var(--dsw-alias-label-tertiary)}
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
.gbar-btn.gbar-ghost:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-solid)}
.gbar-btn.gbar-soft{background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 12%,transparent);color:var(--dsw-alias-state-business-primary)}
.gbar-btn.gbar-soft:hover:not(:disabled){background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 18%,transparent)}
.gbar-btn.gbar-primary{background:var(--dsw-alias-state-business-primary);color:#fff;font-weight:500}
.gbar-btn.gbar-primary:hover:not(:disabled){opacity:.92}
/* Disabled buttons (e.g. while a task is running) must NOT light up on hover —
   they keep their muted look, though the tooltip hint still shows. */
.gbar-btn:disabled{opacity:.5;cursor:default}
.gbar-btn:disabled:hover{opacity:.5}
.gbar-notice{
  position:fixed;z-index:150;left:50%;bottom:28px;transform:translateX(-50%);
  max-width:min(520px,90vw);padding:9px 16px;border-radius:10px;font-size:12.5px;line-height:1.5;
  box-shadow:var(--dsw-shadow-lv2);animation:gbar-in .18s cubic-bezier(.32,.72,0,1);
}
.gbar-notice.gbar-ok{background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 16%,var(--dsw-alias-bg-layer-1));color:var(--dsw-alias-state-success-primary)}
.gbar-notice.gbar-err{background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 14%,var(--dsw-alias-bg-layer-1));color:var(--dsw-alias-state-error-primary)}
.gbar-spin{width:12px;height:12px;border-radius:50%;border:2px solid color-mix(in srgb,var(--dsw-alias-label-tertiary) 30%,transparent);border-top-color:currentColor;animation:gbar-spin .7s linear infinite}
@keyframes gbar-spin{to{transform:rotate(360deg)}}

/* branch capsule — the only interactive half of the header seat: 22px tall
   like the resident agent-preset badge (same 12px type), fully-rounded,
   quiet fill on hover, active tint while the popup is open. */
.gbar-chip{position:relative;display:inline-flex;align-items:center;gap:4px;height:22px;padding:0 9px;
  border:none;border-radius:16px;background:transparent;color:var(--dsw-alias-label-secondary);
  font:inherit;font-size:12px;font-weight:400;line-height:22px;cursor:pointer;white-space:nowrap;
  -webkit-user-select:none;user-select:none;transition:background .15s ease}
.gbar-chip:hover,.gbar-chip:focus-visible{background:var(--dsw-alias-interactive-bg-hover)}
.gbar-chip.gbar-open{background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 12%,var(--dsw-alias-bg-module-platform));color:var(--dsw-alias-state-business-primary)}
.gbar-chip svg{width:14px;height:14px;flex:none;opacity:.9}
.gbar-chip .gbar-bname{max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
/* folder label — plain context beside the capsule: NO background (not a
   capsule), not clickable and no hover, so only the branch carries the pill.
   Same 22px / 12px type as the agent-preset badge beside it, and like that
   label the folder name stays selectable so it can be copied with the mouse;
   cursor:auto lets the browser show the text caret over the selectable name,
   exactly like that label. */
.gbar-fchip{display:inline-flex;align-items:center;gap:4px;height:22px;padding:0 2px;
  color:var(--dsw-alias-label-secondary);
  font:inherit;font-size:12px;font-weight:400;line-height:22px;white-space:nowrap;
  -webkit-user-select:text;user-select:text;cursor:auto}
.gbar-fchip svg{width:14px;height:14px;flex:none;opacity:.9}
.gbar-fchip .gbar-folder{max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
/* wraps the interactive branch capsule so its popup anchors to the capsule,
   not to the whole folder + branch row */
.gbar-bwrap{position:relative;display:inline-flex;align-items:center}

/* header utilities row: 打开项目 / 终端 / 差异 */
.gbar-hicons{margin-left:auto;display:inline-flex;align-items:center;gap:2px;position:relative}
/* The three header utility icons are injected into the title row's utilities
   slot (beside "Session log"), but they belong in the view-tabs row (对话 /
   轨迹) right below it. The session header is their containing block: anchor
   them to the right edge, vertically centred on the 16px tab text line that
   starts under the 32px title row (12px header top padding + 32px title row
   + 4px tab margin). The 24px button starts exactly at the title row's
   bottom edge so its hover surface never touches "Session log" above. The
   :has() guard keeps the in-flow position for the rare header without a
   tablist, and z-index keeps them above the tabs' own stacking context. */
header:has([role="tablist"]) .gbar-hicons{
  position:absolute;
  top:calc(12px + 32px + 4px + (16px - 24px)/2);
  right:28px;
  z-index:2;
}
.gbar-hicon{position:relative;width:32px;height:24px;display:inline-flex;align-items:center;justify-content:center;
  border:none;background:transparent;border-radius:8px;color:var(--dsw-alias-label-secondary);cursor:pointer;
  transition:background .14s ease,color .14s ease}
.gbar-hicon:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.gbar-hicon.gbar-on{background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 12%,transparent);color:var(--dsw-alias-state-business-primary)}
.gbar-hicon svg{width:16px;height:16px}
/* uncommitted-changes dot on the diff icon — warn-primary, the same color
   the branch chip / diff footer use for the dirty state */
.gbar-hicon-dot{position:absolute;top:2.5px;right:2.5px;width:6px;height:6px;border-radius:50%;
  background:var(--dsw-alias-state-warn-primary);pointer-events:none}

/* 「打开项目」menu — a flat dropdown opening leftward from the icon group:
   right edge sits 20px inside the window (the group anchors 28px from the
   edge, so right:-8px), no bubble tail, compact rows, width fits content */
.gbar-openmenu{position:absolute;top:calc(100% + 6px);right:-8px;min-width:150px;max-width:260px;width:max-content;z-index:130;
  background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);border-radius:10px;
  box-shadow:var(--dsw-shadow-lv2);padding:4px;text-align:left;animation:gpop-down .16s cubic-bezier(.32,.72,0,1)}
.gbar-omrow{display:flex;align-items:center;gap:9px;width:100%;padding:5px 8px;border:none;border-radius:7px;
  background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px;line-height:1.2;cursor:pointer;text-align:left;
  white-space:nowrap}
.gbar-omrow:hover{background:var(--dsw-alias-interactive-bg-hover)}
/* brand app icons (official full-color SVGs) — fixed slot, sized by CSS */
.gbar-omrow .gbar-aicon{width:15px;height:15px;flex:none;display:inline-flex}
.gbar-aicon svg{width:100%;height:100%;display:block}

/* terminal panel body — follows the app theme surface (tokens live on body,
   and the panel portal renders inside body, so the var resolves); the xterm
   viewport is transparent, so this is also the terminal's own backdrop */
.gbar-term{flex:1;min-height:0;background:var(--dsw-alias-bg-base,#16161b);color:var(--dsw-alias-label-primary,#d6d6dc);cursor:text;
  font-family:var(--dsw-font-markdown-code-font-family,"SF Mono",Consolas,monospace);font-size:12px;line-height:1.75;
  padding:10px 14px;overflow:auto;scrollbar-width:thin}
.gbar-term:focus-visible{outline:none}
.gbar-term .gbar-ps1{color:#7d94ff}
.gbar-term .gbar-tcmd{color:#ffffff}
.gbar-term .gbar-tout{white-space:pre-wrap;word-break:break-all;opacity:.88}
.gbar-term .gbar-tdim{opacity:.45}
.gbar-term .gbar-terr{color:#ef6b70}
.gbar-term .gbar-tin{display:flex;align-items:baseline}
.gbar-term .gbar-tin input{flex:1;min-width:0;background:transparent;border:none;outline:none;color:#ffffff;
  font:inherit;font-size:12px;line-height:1.75;caret-color:#7d94ff;padding:0}

/* xterm host variant — the emulator fills the body and sizes itself via the
   fit addon, so the container clips instead of scrolling. */
.gbar-xterm{padding:4px 6px;overflow:hidden;cursor:normal}
.gbar-xterm .xterm{height:100%}
.gbar-xterm .xterm .xterm-viewport{background:transparent !important}

/* fatal terminal error banner (pty unavailable / socket refused) */
.gbar-term-error{position:absolute;left:12px;right:12px;bottom:12px;z-index:6;display:flex;align-items:center;gap:10px;
  padding:9px 12px;border-radius:10px;border:1px solid color-mix(in srgb,#ef6b70 45%,transparent);
  background:var(--dsw-alias-bg-base,#16161b);box-shadow:0 8px 24px rgba(0,0,0,.25)}
.gbar-term-error-text{flex:1;min-width:0;font-size:12px;color:var(--dsw-alias-label-primary);
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gbar-term-error button{border:1px solid var(--dsw-alias-border-l1);background:transparent;border-radius:7px;
  color:var(--dsw-alias-label-secondary);width:26px;height:26px;cursor:pointer;flex:none;font-size:13px}
.gbar-term-error button:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}

/* half-screen toggle button in side-panel heads */
.gbar-side-half{border:1px solid var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-tertiary);
  width:28px;height:28px;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;
  cursor:pointer;flex:none;transition:background .15s ease,color .15s ease,border-color .15s ease}
.gbar-side-half:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.gbar-side-half.gbar-on{background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 12%,transparent);
  color:var(--dsw-alias-state-business-primary);border-color:color-mix(in srgb,var(--dsw-alias-state-business-primary) 40%,transparent)}
.gbar-side-half svg{width:15px;height:15px;display:block}

/* hero (new-session) floating chip wrapper */
.gbar-hero{position:fixed;z-index:110;transform:translateY(-50%);display:inline-flex;align-items:center;gap:6px}
@media (prefers-reduced-motion:reduce){.gbar-side,.gbar-modal,.gbar-notice,.gbar-pop,.gbar-openmenu{animation:none}}
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
// Git status polling hook (shared by both pills and both panels).
// ---------------------------------------------------------------------------

/**
 * Module-level snapshot cache keyed by target. Every useGitStatus instance
 * (header icons, diff panel, terminal panel) reads and writes through it, so
 * a panel mounting on click starts from the warm snapshot the header poller
 * already fetched instead of a blank state — this is what makes the diff
 * panel paint instantly instead of waiting for its own /status round-trip.
 */
const snapshotCache = new Map<string, GitSnapshot>()

/** Load the git snapshot on session change, then poll; returns [snapshot, refresh]. */
function useGitStatus(enabled: boolean, target: GitTarget): [GitSnapshot | null, () => Promise<void>] {
  const key = target.session ?? target.ws ?? ''
  // Lazy initializer: a freshly mounted panel is warm on its very first render.
  const [snapshot, setSnapshot] = useState<GitSnapshot | null>(() => snapshotCache.get(key) ?? null)

  useEffect(() => {
    if (!enabled || key === '') {
      setSnapshot(null)
      return
    }
    // A remount (panel open) must not regress to blank when the cache is warm.
    setSnapshot(snapshotCache.get(key) ?? null)
    let cancelled = false
    let timer: number | undefined
    const refresh = async (): Promise<void> => {
      try {
        const next = await apiGet<GitSnapshot>(`${GIT_ROUTE}/status?${targetQuery(target)}`)
        snapshotCache.set(key, next)
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
  }, [enabled, key])

  const refresh = useCallback(async (): Promise<void> => {
    if (key === '') return
    try {
      const next = await apiGet<GitSnapshot>(`${GIT_ROUTE}/status?${targetQuery(target)}`)
      snapshotCache.set(key, next)
      setSnapshot(next)
    } catch {
      // Keep the previous snapshot on transient failures.
    }
  }, [target.session, target.ws])

  return [snapshot, refresh]
}

// ---------------------------------------------------------------------------
// Branch chip — `conversation.session.header.actions` (beside the title,
// before the mode badge). Native header-seat styling; the menu opens DOWNWARD
// from the chip. The folder label comes from the snapshot's cwd.
// ---------------------------------------------------------------------------

export interface BranchChipProps {
  /** Framework session kit: the definite current session id. */
  sessionId: SessionId
  /** Injected: the ui-tweaks settings store (reads `gitBarEnabled`). */
  controller: SettingsClient
  /** Locale-bound translator for the GitBar labels. */
  t: Translate
}

export function BranchChipEntry({ sessionId, controller, t }: BranchChipProps) {
  const settingsState = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot)
  const enabled = settingsState.value?.gitBarEnabled ?? true
  const sessionStr = String(sessionId)
  const target: GitTarget = { session: sessionStr }

  const [snapshot, refresh] = useGitStatus(enabled, target)
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
    void apiGet<GitBranches>(`${GIT_ROUTE}/branches?${targetQuery(target)}`)
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
      {/* Folder label — plain (no capsule), not clickable */}
      <span className="gbar-fchip" title={snapshot.cwd}>
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M1.5 4A1.5 1.5 0 0 1 3 2.5h3l1.5 2H13A1.5 1.5 0 0 1 14.5 6v6A1.5 1.5 0 0 1 13 13.5H3A1.5 1.5 0 0 1 1.5 12V4Z" />
        </svg>
        <span className="gbar-folder">{basenameOf(snapshot.cwd)}</span>
      </span>
      {/* Branch capsule — clickable, opens the branch popup */}
      <span className="gbar-bwrap">
        <button
          type="button"
          ref={branchRef}
          className={'gbar-chip' + (branchOpen ? ' gbar-open' : '')}
          onClick={toggleBranch}
          title={dirty ? t('dirty') : t('clean')}
          aria-expanded={branchOpen}
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="4.5" cy="3.5" r="1.8" />
            <circle cx="4.5" cy="12.5" r="1.8" />
            <circle cx="12" cy="5.5" r="1.8" />
            <path d="M4.5 5.3v5.4" />
            <path d="M12 7.3c0 3-3.5 4.8-7.5 3.4" />
          </svg>
          <span className="gbar-bname">{snapshot.branch ?? snapshot.detachedHead ?? '—'}</span>
        </button>

        {/* Branch popup — pinned header (current branch + worktree state),
            scrolling local/remote lists, pinned action entries */}
        {branchOpen ? (
          <div className="gbar-pop" role="menu" aria-label={snapshot.branch ?? 'git'} ref={branchPopRef}>
          <div className="gbar-pop-head">
            <span className="gbar-curname" title={dirty ? t('dirty') : t('clean')}>
              <svg className="gbar-bicon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="4.5" cy="3.5" r="1.8" />
                <circle cx="4.5" cy="12.5" r="1.8" />
                <circle cx="12" cy="5.5" r="1.8" />
                <path d="M4.5 5.3v5.4" />
                <path d="M12 7.3c0 3-3.5 4.8-7.5 3.4" />
              </svg>
              <span>{snapshot.branch ?? snapshot.detachedHead ?? '—'}</span>
            </span>
            <span className="gbar-state">
              <span className={'gbar-dot ' + (dirty ? 'gbar-dirty' : 'gbar-clean')} aria-hidden />
              {snapshot.ahead > 0 ? <span>↑{snapshot.ahead}</span> : null}
              {snapshot.behind > 0 ? <span>↓{snapshot.behind}</span> : null}
            </span>
          </div>
          <div className="gbar-pop-body">
            <div className="gbar-sec">{t('branchLocal')}{branches !== null ? <span className="gbar-count">{branches.local.length}</span> : null}</div>
            {branches === null ? (
              <div className="gbar-loading"><span className="gbar-spin" />{t('loading')}</div>
            ) : branches.local.map(name => (
              <div key={name} className="gbar-rowwrap">
                <button
                  type="button"
                  className={'gbar-row' + (name === branches.current ? ' gbar-cur' : '')}
                  onClick={() => { pickBranch(name) }}
                >
                  <svg className="gbar-bicon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <circle cx="4.5" cy="3.5" r="1.8" />
                    <circle cx="4.5" cy="12.5" r="1.8" />
                    <path d="M4.5 5.3v5.4" />
                    <path d="M11.5 3.7v3a2.6 2.6 0 0 1-2.6 2.6H4.5" />
                  </svg>
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
                    {confirmDelete === name ? t('branchDeleteConfirm') : (
                      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M2.5 4.5h11" />
                        <path d="M5.5 4.5V3.3c0-.44.36-.8.8-.8h3.4c.44 0 .8.36.8.8v1.2" />
                        <path d="M4 4.5l.6 8.2c.04.5.45.8.95.8h4.9c.5 0 .91-.3.95-.8l.6-8.2" />
                      </svg>
                    )}
                  </button>
                ) : null}
              </div>
            ))}
            <div className="gbar-sec">{t('branchRemote')}{branches !== null ? <span className="gbar-count">{branches.remote.length}</span> : null}</div>
            {branches?.remote.map(name => (
              <div key={name} className="gbar-rowwrap">
                <button
                  type="button"
                  className={'gbar-row' + (name === branches.current ? ' gbar-cur' : '')}
                  onClick={() => { pickBranch(name) }}
                >
                  <svg className="gbar-bicon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M5.2 13a3.2 3.2 0 1 1 .5-6.36 4 4 0 0 1 7.75 1.06 2.65 2.65 0 0 1-.55 5.3H5.2Z" />
                  </svg>
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
                    {confirmDelete === name ? t('branchDeleteConfirm') : (
                      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M2.5 4.5h11" />
                        <path d="M5.5 4.5V3.3c0-.44.36-.8.8-.8h3.4c.44 0 .8.36.8.8v1.2" />
                        <path d="M4 4.5l.6 8.2c.04.5.45.8.95.8h4.9c.5 0 .91-.3.95-.8l.6-8.2" />
                      </svg>
                    )}
                  </button>
                ) : null}
              </div>
            ))}
          </div>
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
      </span>

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
// Diff panel — opened from the header utilities' diff icon (always available,
// even on a clean tree). Slide-over on the right; commit band at its foot.
// ---------------------------------------------------------------------------

export interface DiffPanelProps {
  /** Framework session kit: the definite current session id. */
  sessionId: SessionId
  /** Framework session kit: live conversation snapshot selector. */
  useSession: <T>(selector: (snapshot: ConversationSnapshot) => T) => T
  /** Injected: the ui-tweaks settings store (reads `gitBarEnabled`). */
  controller: SettingsClient
  /** Locale-bound translator for the GitBar labels. */
  t: Translate
  /** Parent closes the panel (icon toggles; outside clicks route here too). */
  onClose: () => void
}

/**
 * Shared side-panel layout: anchor the panel below the session header, and
 * while it is open push ONLY the message area (the conversation scrollport)
 * left by `width`. Never touch `#root`: in the DSH 0.1.1 column grid `#root`
 * wraps the whole app (left sidebar + center + details), so a `#root` margin
 * collapses the left sidebar and shoves the top header — the "showing the
 * panel moves the top" bug. The scrollport is the center column's message
 * region; pushing only it leaves the sidebar and header untouched, and the
 * timeline rail (anchored to the scrollport right edge) stays visible.
 *
 * @param width - panel width; the scrollport gets this much right margin.
 * @param active - whether the panel is actually showing; when false (e.g. a
 *   non-repo session opened the diff icon) no layout is pushed.
 * @returns the panel top (scrollport top) for `style.top`.
 */
function useSidePanelLayout(width: number, active = true): number {
  const [panelTop, setPanelTop] = useState(0)

  useEffect(() => {
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
  }, [])

  useEffect(() => {
    if (!active) return
    const scrollport = document.querySelector('[data-conversation-scroll]') as HTMLElement | null
    if (scrollport !== null) scrollport.style.marginRight = `${width}px`
    return () => { if (scrollport !== null) scrollport.style.marginRight = '' }
  }, [width, active])

  return panelTop
}

export function DiffPanel({ sessionId, useSession, controller, t, onClose }: DiffPanelProps) {
  const settingsState = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot)
  const enabled = settingsState.value?.gitBarEnabled ?? true
  const sessionStr = String(sessionId)
  const agentRunning = useSession(snapshot => snapshot.running) ?? false

  const [snapshot, refresh] = useGitStatus(enabled, { session: sessionStr })
  const [diff, setDiff] = useState<GitDiffResult | null>(null)
  const [diffMode, setDiffMode] = useState<'hunk' | 'full'>('hunk')
  const [diffPath, setDiffPath] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(new Set())
  const [diffWidth, setDiffWidth] = useState(440)
  const panelTop = useSidePanelLayout(diffWidth, enabled && sessionStr !== undefined && snapshot !== null && snapshot.isRepo)
  const [filesHeight, setFilesHeight] = useState<number | null>(null)
  const [commitHeight, setCommitHeight] = useState<number | null>(null)
  const [dragging, setDragging] = useState<'files' | 'commit' | null>(null)

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

  // Auto-select the first changed file so the panel opens with a diff. Runs
  // when the snapshot first arrives (it is null on mount), and again only if
  // the user has not picked a file yet.
  useEffect(() => {
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    setDiffPath(current => current ?? snapshot?.files[0]?.path ?? null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot])

  const selectDiffFile = (path: string): void => {
    setDiffPath(path)
  }

  const switchDiffMode = (mode: 'hunk' | 'full'): void => {
    setDiffMode(mode)
  }

  // Load the selected file's diff when the selection/mode changes.
  useEffect(() => {
    if (sessionStr === undefined || diffPath === null) return
    let cancelled = false
    setDiff(null)
    void apiGet<GitDiffResult>(
      `${GIT_ROUTE}/diff?${targetQuery({ session: sessionStr })}&file=${encodeURIComponent(diffPath)}&mode=${diffMode}`,
    ).then(result => {
      if (!cancelled) setDiff(result)
    }).catch(cause => {
      if (!cancelled) showNotice('err', cause instanceof Error ? cause.message : String(cause))
    })
    return () => { cancelled = true }
  }, [sessionStr, diffPath, diffMode])

  const doCommit = (push: boolean): void => {
    if (agentRunning) return
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
      onClose()
      setMessage('')
      setExcluded(new Set())
      await refresh()
      showNotice('ok', push ? `✓ ${result.hash ?? 'committed'} · pushed` : `✓ ${result.hash ?? 'committed'}`)
    })
  }

  // Close the diff panel when clicking outside it (the 差异 icon toggles).
  // The icon lives in `.gbar-hicons`, which is NOT a descendant of `.gbar`,
  // so that container must be excluded too — otherwise mousedown on the icon
  // fires onClose() and the following click re-opens the panel ("sometimes
  // it opens by itself").
  useEffect(() => {
    const onDown = (event: MouseEvent): void => {
      const target = event.target as Node | null
      if (target === null) return
      if (document.querySelector('.gbar-side')?.contains(target)) return
      if (document.querySelector('.gbar-hicons')?.contains(target)) return
      if (document.querySelector('.gbar')?.contains(target)) return
      onClose()
    }
    document.addEventListener('mousedown', onDown)
    return () => { document.removeEventListener('mousedown', onDown) }
  }, [onClose])

  // Drag the panel's left edge to resize it. A press WITHOUT any drag counts
  // as a click: it snaps the panel to half the screen (or back to the width
  // it had before expanding), so the edge doubles as a one-button maximize.
  const prevWidthRef = useRef<number | null>(null)
  const toggleHalfWidth = (): void => {
    const half = Math.round(window.innerWidth / 2)
    if (diffWidth >= half - 4) {
      const restore = prevWidthRef.current ?? 440
      prevWidthRef.current = null
      setDiffWidth(restore)
    } else {
      prevWidthRef.current = diffWidth
      setDiffWidth(half)
    }
  }

  const startResize = (event: { clientX: number; preventDefault: () => void }): void => {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = diffWidth
    // Manual drags may reach half the screen too — otherwise an expanded
    // half-screen panel would instantly clamp back to the old 900px ceiling.
    const maxWidth = Math.max(900, Math.round(window.innerWidth / 2))
    let moved = false
    const onMove = (move: PointerEvent): void => {
      if (!moved && Math.abs(move.clientX - startX) > 3) moved = true
      setDiffWidth(Math.min(maxWidth, Math.max(320, startWidth - (move.clientX - startX))))
    }
    const onUp = (): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      if (!moved) toggleHalfWidth()
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

  if (!enabled || sessionStr === undefined) return null
  // Not a repo: no panel at all (the pills hide for non-repos too).
  if (snapshot !== null && !snapshot.isRepo) return null

  // Cold start (no cached snapshot yet): paint the panel SHELL at once with a
  // loading body instead of returning null — the click must give immediate
  // feedback even while the first /status round-trip is in flight. With the
  // shared snapshot cache this state is rare and brief.
  if (snapshot === null) {
    return createPortal(
      <div className="gbar-side" role="dialog" aria-label={t('diffTitle')} style={{ width: `${diffWidth}px`, top: `${panelTop}px` }}>
        <div className="gbar-resize" onPointerDown={startResize} title="拖动调整宽度 · 点击展开到半屏" />
        <div className="gbar-side-head">
          <span className="gbar-title">{t('diffTitle')}</span>
          <span className="gbar-spacer" />
          <button type="button" className="gbar-side-x" onClick={onClose} aria-label="✕">✕</button>
        </div>
        <div className="gbar-side-body">
          <div className="gbar-diff"><div className="gbar-empty"><span className="gbar-spin" /> {t('loading')}</div></div>
        </div>
      </div>,
      document.body,
    )
  }

  const dirty = !snapshot.clean
  const halfActive = diffWidth >= Math.round(window.innerWidth / 2) - 4

  return createPortal(
    <>
    <div className="gbar-side" role="dialog" aria-label={t('diffTitle')} style={{ width: `${diffWidth}px`, top: `${panelTop}px` }}>
      <div className="gbar-resize" onPointerDown={startResize} title="拖动调整宽度 · 点击展开到半屏" />
      <div className="gbar-side-head">
        <span className="gbar-title">{diffPath ?? t('diffTitle')}</span>
        <span className="gbar-sub">
          {snapshot.files.length} {t('diffFiles')} · <span className="gbar-a">+{snapshot.totalAdded}</span> <span className="gbar-d">−{snapshot.totalDeleted}</span>
        </span>
        <span className="gbar-spacer" />
        <div className="gbar-seg" role="group">
          <button type="button" className={diffMode === 'hunk' ? 'gbar-on' : ''} onClick={() => { switchDiffMode('hunk') }}>{t('diffOnly')}</button>
          <button type="button" className={diffMode === 'full' ? 'gbar-on' : ''} onClick={() => { switchDiffMode('full') }}>{t('diffFull')}</button>
        </div>
        <button
          type="button"
          className={'gbar-side-half' + (halfActive ? ' gbar-on' : '')}
          onClick={toggleHalfWidth}
          title="展开到半屏 / 恢复宽度"
          aria-pressed={halfActive}
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 3H3v3" /><path d="M10 13h3v-3" /><path d="M3 3l4 4" /><path d="M13 13L9 9" />
          </svg>
        </button>
        <button type="button" className="gbar-side-x" onClick={onClose} aria-label="✕">✕</button>
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
                // Split the path so the directory renders dim and the filename
                // bright — the eye scans by filename, not by folder.
                const slash = file.path.lastIndexOf('/')
                const dir = slash >= 0 ? file.path.slice(0, slash + 1) : ''
                const base = slash >= 0 ? file.path.slice(slash + 1) : file.path
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
                      title={file.path}
                    >
                      <span className={'gbar-st ' + statusClass(file.status)}>{statusLetter(file.status)}</span>
                      <span className="gbar-path">{dir !== '' ? <span className="gbar-dir">{dir}</span> : null}<span>{base}</span></span>
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
              <div className="gbar-diff"><div className="gbar-empty">{snapshot.clean || snapshot.files.length === 0 ? t('clean') : t('loading')}</div></div>
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
                <button
                  type="button"
                  className="gbar-btn gbar-soft"
                  onClick={() => { doCommit(false) }}
                  disabled={busy !== null || agentRunning}
                  title={agentRunning ? t('commitBusy') : undefined}
                >
                  {busy === 'commit' ? <span className="gbar-spin" /> : null} {t('commitSubmit')}
                </button>
                <button
                  type="button"
                  className="gbar-btn gbar-primary"
                  onClick={() => { doCommit(true) }}
                  disabled={busy !== null || agentRunning}
                  title={agentRunning ? t('commitBusy') : undefined}
                >
                  {busy === 'commit-push' ? <span className="gbar-spin" /> : null} {t('commitSubmitPush')}
                </button>
              </div>
            </div>
          ) : null}
        </div>
        {/* Transient notice */}
        {notice !== null ? (
          <div className={'gbar-notice gbar-' + notice.kind} role="status">{notice.text}</div>
        ) : null}
      </>,
      document.body,
    )
  }

// ---------------------------------------------------------------------------
// Terminal panel — a REAL terminal: xterm.js in the browser over a WebSocket
// to the host's persistent node-pty shell (the dsh-better-sidebar design,
// its src/pty-manager.ts + TerminalView.tsx). Full emulation: colors, cursor
// control, Ctrl+C, command history, interactive apps. The xterm UMD builds
// and stylesheet are vendored by the plugin and lazy-loaded on first panel
// open, so the always-resident GitBar bundle stays lean.
//
// Session lifetime mirrors better-sidebar tabs: closing the panel only drops
// the socket — the host keeps the shell alive behind a reconnect grace, so
// re-opening the panel reattaches to the SAME session with its transcript
// replayed. Page refreshes recover the same way.
// ---------------------------------------------------------------------------

/** Vendored xterm assets served by the host half (src/git-web.ts). */
const VENDOR_BASE = `${GIT_ROUTE}/vendor`

/** Duck-typed face of the xterm Terminal instance this panel touches. */
interface XTermLike {
  cols: number
  rows: number
  /** Live option updates (`theme` re-render is supported by xterm 5). */
  options: { theme?: Record<string, string> | undefined }
  open(host: HTMLElement): void
  write(data: string): void
  focus(): void
  resize(cols: number, rows: number): void
  dispose(): void
  loadAddon(addon: unknown): void
  onData(listener: (data: string) => void): { dispose(): void }
  onResize(listener: (dims: { cols: number; rows: number }) => void): { dispose(): void }
}

/** Duck-typed face of @xterm/addon-fit. */
interface FitAddonLike {
  fit(): void
}

type XTermCtor = new (options: Record<string, unknown>) => XTermLike
type FitAddonCtor = new () => FitAddonLike

interface XTermGlobals { Terminal: XTermCtor; FitAddon: FitAddonCtor }

let xtermGlobalsPromise: Promise<XTermGlobals> | null = null

/** Inject one vendored script exactly once; resolves on load, rejects on error. */
function loadVendorScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-gbar-vendor="${CSS.escape(src)}"]`)
    if (existing !== null) {
      // An already-complete script never fires `load` again.
      if (existing.getAttribute('data-gbar-loaded') === '1') {
        resolve()
        return
      }
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', () => reject(new Error(`failed to load ${src}`)))
      return
    }
    const script = document.createElement('script')
    script.src = src
    script.async = true
    script.dataset.gbarVendor = src
    script.addEventListener('load', () => {
      script.setAttribute('data-gbar-loaded', '1')
      resolve()
    })
    script.addEventListener('error', () => reject(new Error(`failed to load ${src}`)))
    document.head.appendChild(script)
  })
}

/** Load the vendored xterm UMD builds once per page; caches the globals. */
function loadXterm(): Promise<XTermGlobals> {
  xtermGlobalsPromise ??= (async () => {
    try {
      if (document.querySelector('link[data-gbar-xterm-css]') === null) {
        const link = document.createElement('link')
        link.rel = 'stylesheet'
        link.href = `${VENDOR_BASE}/xterm.css`
        link.dataset.gbarXtermCss = '1'
        document.head.appendChild(link)
      }
      await loadVendorScript(`${VENDOR_BASE}/xterm.js`)
      await loadVendorScript(`${VENDOR_BASE}/addon-fit.js`)
      const win = window as unknown as Record<string, unknown>
      const TerminalCtor = win.Terminal as XTermCtor | undefined
      const fitNamespace = win.FitAddon as { FitAddon?: FitAddonCtor } | undefined
      if (typeof TerminalCtor !== 'function' || typeof fitNamespace?.FitAddon !== 'function') {
        throw new Error('xterm assets loaded but globals are missing')
      }
      return { Terminal: TerminalCtor, FitAddon: fitNamespace.FitAddon }
    } catch (cause) {
      // Allow a retry on the next panel open instead of caching the failure.
      xtermGlobalsPromise = null
      throw cause
    }
  })()
  return xtermGlobalsPromise
}

// Curated ANSI palettes (one-dark / one-light families), matching the
// dsh-better-sidebar terminal so both plugins render shells identically.
const ANSI_DARK: Record<string, string> = {
  black: '#282c34', red: '#e06c75', green: '#98c379', yellow: '#e5c07b',
  blue: '#61afef', magenta: '#c678dd', cyan: '#56b6c2', white: '#abb2bf',
  brightBlack: '#5c6370', brightRed: '#e06c75', brightGreen: '#98c379',
  brightYellow: '#e5c07b', brightBlue: '#61afef', brightMagenta: '#c678dd',
  brightCyan: '#56b6c2', brightWhite: '#ffffff',
}
const ANSI_LIGHT: Record<string, string> = {
  black: '#383a42', red: '#e45649', green: '#50a14f', yellow: '#c18401',
  blue: '#0184bc', magenta: '#a626a4', cyan: '#0997b3', white: '#a0a1a7',
  brightBlack: '#4f525e', brightRed: '#e45649', brightGreen: '#50a14f',
  brightYellow: '#c18401', brightBlue: '#0184bc', brightMagenta: '#a626a4',
  brightCyan: '#0997b3', brightWhite: '#fafafa',
}

/**
 * Whether the DSH app is currently in its dark theme. The real switch is the
 * `data-ds-dark-theme` attribute the theme plugin puts on <body> — the same
 * signal the DSW token stylesheet keys on (`body[data-ds-dark-theme]{…}`), so
 * it is correct no matter how the theme was chosen (app setting or system
 * follow). Tokens being readable without the attribute means the light block
 * is active; only a composition with neither falls back to the system media
 * query.
 */
function isDarkScheme(): boolean {
  if (document.body.hasAttribute('data-ds-dark-theme')) return true
  const style = getComputedStyle(document.body)
  if (style.getPropertyValue('--dsw-alias-bg-base').trim() !== '') return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

/**
 * The xterm theme for the current scheme (surface from tokens, curated ANSI).
 * The DSW alias tokens are defined on <body> (not :root), and custom
 * properties inherit downward only — reading them off documentElement always
 * yields '', so read the body's computed values.
 */
function xtermTheme(): Record<string, string> & { background: string; foreground: string } {
  const dark = isDarkScheme()
  const style = getComputedStyle(document.body)
  const background = style.getPropertyValue('--dsw-alias-bg-base').trim() || (dark ? '#151517' : '#ffffff')
  const foreground = style.getPropertyValue('--dsw-alias-label-primary').trim() || (dark ? '#e6e6e6' : '#1a1a1a')
  return {
    background,
    foreground,
    cursor: foreground,
    cursorAccent: background,
    selectionBackground: dark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.12)',
    ...(dark ? ANSI_DARK : ANSI_LIGHT),
  }
}

export function TerminalPanel({ sessionId, controller, t, onClose }: {
  sessionId: SessionId
  controller: SettingsClient
  t: Translate
  onClose: () => void
}) {
  const settingsState = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot)
  const enabled = settingsState.value?.gitBarEnabled ?? true
  const target: GitTarget = { session: String(sessionId) }
  // Warm from the shared snapshot cache, so the cwd label paints instantly.
  const [snapshot] = useGitStatus(enabled, target)
  const [width, setWidth] = useState(520)
  const [status, setStatus] = useState<'boot' | 'connecting' | 'live' | 'exited' | 'error'>('boot')
  const [errorText, setErrorText] = useState('')
  const [retryNonce, setRetryNonce] = useState(0)
  const panelTop = useSidePanelLayout(width, enabled)
  const prevWidthRef = useRef<number | null>(null)
  const hostRef = useRef<HTMLDivElement | null>(null)

  const toggleHalfWidth = (): void => {
    const half = Math.round(window.innerWidth / 2)
    if (width >= half - 4) {
      const restore = prevWidthRef.current ?? 520
      prevWidthRef.current = null
      setWidth(restore)
    } else {
      prevWidthRef.current = width
      setWidth(half)
    }
  }

  // Attach xterm + the WebSocket bridge. Re-runs on retryNonce (manual retry
  // after a fatal error). Teardown closes the socket WITHOUT a close frame,
  // so the host's reconnect grace keeps the shell alive for the next panel
  // open — exactly like switching tabs in dsh-better-sidebar.
  useEffect(() => {
    const host = hostRef.current
    if (!enabled || host === null) return
    let disposed = false
    let socket: WebSocket | null = null
    let retryTimer: number | undefined
    let failures = 0
    let term: XTermLike | null = null
    const cleanups: Array<() => void> = []

    const sendFrame = (frame: Record<string, unknown>): void => {
      if (socket !== null && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(frame))
    }

    const connect = (): void => {
      if (disposed || term === null) return
      setStatus('connecting')
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
      socket = new WebSocket(`${proto}//${location.host}${GIT_ROUTE}/terminal-ws?${targetQuery(target)}&cols=${term.cols}&rows=${term.rows}`)
      socket.onopen = () => {
        failures = 0
        setStatus('live')
        setErrorText('')
        if (term !== null) sendFrame({ type: 'resize', cols: term.cols, rows: term.rows })
      }
      socket.onmessage = (event) => {
        if (typeof event.data !== 'string' || term === null) return
        if (event.data.startsWith('{')) {
          try {
            const frame = JSON.parse(event.data) as { type?: unknown }
            if (frame.type === 'exit') {
              setStatus('exited')
              return
            }
          } catch {
            // Literal braces typed into the shell — render them.
          }
        }
        term.write(event.data)
      }
      socket.onclose = (event) => {
        socket = null
        if (disposed) return
        // A reasoned 1011 refusal is fatal (spawn failure / pty missing);
        // every other drop recovers with backoff — the host replays the
        // transcript on reconnect, so the retry is seamless.
        if (event.code === 1011 && event.reason !== '') {
          setStatus('error')
          setErrorText(event.reason === 'pty-unavailable' ? t('termUnavailable') : event.reason)
          return
        }
        failures += 1
        if (failures > 5) {
          setStatus('error')
          setErrorText(`${t('termLost')} (${event.code})`)
          return
        }
        retryTimer = window.setTimeout(connect, Math.min(8000, 400 * failures))
      }
    }

    void (async () => {
      try {
        const globals = await loadXterm()
        if (disposed) return
        // Surface colors track the app theme: the host backdrop matches the
        // theme background exactly (the xterm viewport is transparent), and a
        // theme flip while the panel is open re-applies live.
        const applyTheme = (): void => {
          const theme = xtermTheme()
          host.style.backgroundColor = theme.background
          if (term !== null) term.options.theme = theme
        }
        term = new globals.Terminal({
          cursorBlink: true,
          fontSize: 12.5,
          fontFamily: '"SF Mono",ui-monospace,Consolas,"Courier New",monospace',
          scrollback: 4000,
          theme: xtermTheme(),
        })
        applyTheme()
        const fit = new globals.FitAddon()
        term.loadAddon(fit)
        term.open(host)
        try { fit.fit() } catch { /* zero-size host before layout settles */ }
        term.onData(data => sendFrame({ type: 'input', data }))
        term.onResize(dims => sendFrame({ type: 'resize', cols: dims.cols, rows: dims.rows }))
        const observer = new ResizeObserver(() => { try { fit.fit() } catch { /* mid-layout */ } })
        observer.observe(host)
        // DSH flips themes by toggling body's data-ds-dark-theme attribute.
        const themeObserver = new MutationObserver(applyTheme)
        themeObserver.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] })
        cleanups.push(() => observer.disconnect(), () => themeObserver.disconnect(), () => term?.dispose())
        connect()
      } catch (cause) {
        if (disposed) return
        setStatus('error')
        setErrorText(cause instanceof Error ? cause.message : String(cause))
      }
    })()

    return () => {
      disposed = true
      if (retryTimer !== undefined) clearTimeout(retryTimer)
      socket?.close()
      for (const cleanup of cleanups.reverse()) cleanup()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, retryNonce])

  if (!enabled) return null

  return createPortal(
    <div className="gbar-side" role="dialog" aria-label={t('terminal')} style={{ width: `${width}px`, top: `${panelTop}px` }}>
      <div className="side-head gbar-side-head">
        <span className="stitle gbar-title">{t('terminal')}</span>
        <span className="ssub gbar-sub" style={{ fontFamily: '"SF Mono",ui-monospace,Consolas,monospace' }}>{basenameOf(snapshot?.cwd)}</span>
        <span className="sp gbar-spacer" />
        {status !== 'live' && status !== 'error' ? (
          <span className="ssub gbar-sub">{status === 'exited' ? t('termExited') : t('loading')}</span>
        ) : null}
        <button
          type="button"
          className={'gbar-side-half' + (width >= Math.round(window.innerWidth / 2) - 4 ? ' gbar-on' : '')}
          onClick={toggleHalfWidth}
          title="展开到半屏 / 恢复宽度"
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 3H3v3" /><path d="M10 13h3v-3" /><path d="M3 3l4 4" /><path d="M13 13L9 9" />
          </svg>
        </button>
        <button type="button" className="gbar-side-x" onClick={onClose} aria-label="✕">✕</button>
      </div>
      <div className="gbar-term gbar-xterm" ref={hostRef} />
      {status === 'error' ? (
        <div className="gbar-term-error" role="alert">
          <span className="gbar-term-error-text">{errorText}</span>
          <button type="button" onClick={() => { setStatus('boot'); setErrorText(''); setRetryNonce(n => n + 1) }}>↻</button>
        </div>
      ) : null}
    </div>,
    document.body,
  )
}

// ---------------------------------------------------------------------------
// Header utilities — `conversation.session.header.utilities` (right-aligned):
// 打开项目 / 终端 / 差异. The two panels are INDEPENDENT (same position, one
// at a time); each icon toggles its own.
// ---------------------------------------------------------------------------

export interface HeaderUtilitiesProps {
  sessionId: SessionId
  useSession: <T>(selector: (snapshot: ConversationSnapshot) => T) => T
  controller: SettingsClient
  t: Translate
}

export function HeaderUtilities({ sessionId, useSession, controller, t }: HeaderUtilitiesProps) {
  const settingsState = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot)
  const enabled = settingsState.value?.gitBarEnabled ?? true
  const target: GitTarget = { session: String(sessionId) }
  const [snapshot] = useGitStatus(enabled, target)

  const [openMenu, setOpenMenu] = useState(false)
  const [diffOpen, setDiffOpen] = useState(false)
  const [termOpen, setTermOpen] = useState(false)
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const wrapRef = useRef<HTMLSpanElement | null>(null)
  const iconRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const dirty = snapshot !== null && snapshot.isRepo && !snapshot.clean

  // Close the open-project menu on outside click / Escape.
  useEffect(() => {
    if (!openMenu) return
    const onDown = (event: MouseEvent): void => {
      const node = event.target as Node | null
      if (node === null) return
      if (wrapRef.current?.contains(node) || menuRef.current?.contains(node)) return
      setOpenMenu(false)
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpenMenu(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [openMenu])

  const showNotice = (kind: 'ok' | 'err', text: string): void => {
    setNotice({ kind, text })
    window.setTimeout(() => setNotice(null), 4000)
  }

  const runOpen = async (app: 'explorer' | 'vscode' | 'idea' | 'goland' | 'webstorm' | 'pycharm'): Promise<void> => {
    try {
      await apiPost(`${GIT_ROUTE}/open`, { ...targetFields(target), target: app })
      setOpenMenu(false)
      showNotice('ok', `✓ ${app}`)
    } catch (cause) {
      showNotice('err', cause instanceof Error ? cause.message : String(cause))
    }
  }

  if (!enabled) return null

  return (
    <span className="gbar-hicons" ref={wrapRef}>
      <button
        type="button"
        ref={iconRef}
        className={'gbar-hicon' + (openMenu ? ' gbar-on' : '')}
        onClick={() => { setOpenMenu(value => !value); setTermOpen(false); setDiffOpen(false) }}
        title={t('openProject')}
        aria-expanded={openMenu}
      >
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M1.5 4A1.5 1.5 0 0 1 3 2.5h3l1.5 2H13A1.5 1.5 0 0 1 14.5 6v6A1.5 1.5 0 0 1 13 13.5H3A1.5 1.5 0 0 1 1.5 12V4Z" />
          <path d="M9.5 8.25l2.2 1.35-2.2 1.35v-2.7Z" fill="currentColor" stroke="none" />
        </svg>
      </button>
      <button
        type="button"
        className={'gbar-hicon' + (termOpen ? ' gbar-on' : '')}
        onClick={() => { setTermOpen(value => !value); setDiffOpen(false); setOpenMenu(false) }}
        title={t('terminal')}
        aria-expanded={termOpen}
      >
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
          <rect x="1.5" y="2.5" width="13" height="11" rx="2" />
          <path d="M4.5 6l2.5 2-2.5 2" />
          <path d="M8.5 10h3" />
        </svg>
      </button>
      <button
        type="button"
        className={'gbar-hicon' + (diffOpen ? ' gbar-on' : '')}
        onClick={() => { setDiffOpen(value => !value); setTermOpen(false); setOpenMenu(false) }}
        title={t('diffTitle')}
        aria-expanded={diffOpen}
      >
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9.5 1.5H4A1.5 1.5 0 0 0 2.5 3v10A1.5 1.5 0 0 0 4 14.5h8A1.5 1.5 0 0 0 13.5 13V5.5l-4-4Z" />
          <path d="M9.5 1.5V5.5h4" />
          <path d="M5.75 10h4.5M5.75 7.5h2" />
        </svg>
        {/* Uncommitted-changes dot — the same dirty signal the branch chip's
            tooltip carries, surfaced on the icon so the state reads at a
            glance without hovering or opening the diff panel. */}
        {dirty ? <span className="gbar-hicon-dot" aria-hidden /> : null}
      </button>

      {openMenu ? (
        <div className="gbar-openmenu" ref={menuRef} role="menu">
          <button type="button" className="gbar-omrow" onClick={() => { void runOpen('explorer') }}>
            <span className="gbar-aicon" aria-hidden dangerouslySetInnerHTML={{ __html: APP_ICONS.explorer }} />
            {t('openExplorer')}
          </button>
          <button type="button" className="gbar-omrow" onClick={() => { void runOpen('vscode') }}>
            <span className="gbar-aicon" aria-hidden dangerouslySetInnerHTML={{ __html: APP_ICONS.vscode }} />
            {t('openVscode')}
          </button>
          <button type="button" className="gbar-omrow" onClick={() => { void runOpen('idea') }}>
            <span className="gbar-aicon" aria-hidden dangerouslySetInnerHTML={{ __html: APP_ICONS.idea }} />
            {t('openIdea')}
          </button>
          <button type="button" className="gbar-omrow" onClick={() => { void runOpen('goland') }}>
            <span className="gbar-aicon" aria-hidden dangerouslySetInnerHTML={{ __html: APP_ICONS.goland }} />
            {t('openGoland')}
          </button>
          <button type="button" className="gbar-omrow" onClick={() => { void runOpen('webstorm') }}>
            <span className="gbar-aicon" aria-hidden dangerouslySetInnerHTML={{ __html: APP_ICONS.webstorm }} />
            {t('openWebstorm')}
          </button>
          <button type="button" className="gbar-omrow" onClick={() => { void runOpen('pycharm') }}>
            <span className="gbar-aicon" aria-hidden dangerouslySetInnerHTML={{ __html: APP_ICONS.pycharm }} />
            {t('openPycharm')}
          </button>
        </div>
      ) : null}

      {termOpen ? <TerminalPanel sessionId={sessionId} controller={controller} t={t} onClose={() => { setTermOpen(false) }} /> : null}
      {/* The diff panel opens even while the model is running (it only reads
          git state; committing inside stays disabled while the agent works). */}
      {diffOpen ? <DiffPanel sessionId={sessionId} useSession={useSession} controller={controller} t={t} onClose={() => { setDiffOpen(false) }} /> : null}

      {notice !== null ? createPortal(
        <div className={'gbar-notice gbar-' + notice.kind} role="status">{notice.text}</div>,
        document.body,
      ) : null}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Hero (new-session) branch chip — the session header does not mount on the
// blank/new-session screen, so the chip floats there instead: anchored just
// left of the workspace picker (`[class$="_workspace"]`, CSS-module suffix is
// stable within a pinned build). Git ops resolve via the workspace title
// (`ws` target); if there is no repo, nothing renders.
// ---------------------------------------------------------------------------

const HERO_ANCHOR_SELECTOR = '[class$="_workspace"]'

function HeroBranchChip({ t, right, top }: {
  t: Translate
  right: number
  top: number
}) {
  const wsName = useMemo(
    () => document.querySelector<HTMLElement>(HERO_ANCHOR_SELECTOR)?.textContent?.trim() ?? '',
    [],
  )
  const [snapshot, refresh] = useGitStatus(true, { ws: wsName })
  const [branchOpen, setBranchOpen] = useState(false)
  const [branches, setBranches] = useState<GitBranches | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const chipRef = useRef<HTMLButtonElement | null>(null)
  const popRef = useRef<HTMLDivElement | null>(null)

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
    void apiGet<GitBranches>(`${GIT_ROUTE}/branches?${targetQuery({ ws: wsName })}`)
      .then(setBranches)
      .catch(cause => { showNotice('err', cause instanceof Error ? cause.message : String(cause)) })
  }

  const pickBranch = (name: string): void => {
    if (name === branches?.current) return
    void run('checkout', async () => {
      await apiPost(`${GIT_ROUTE}/checkout`, { ws: wsName, branch: name })
      setBranchOpen(false)
      await refresh()
      loadBranches()
      showNotice('ok', `→ ${name}`)
    })
  }

  const deleteLocal = (name: string): void => {
    if (confirmDelete === name) {
      setConfirmDelete(null)
      void run('branch-delete', async () => {
        await apiPost(`${GIT_ROUTE}/branch-delete`, { ws: wsName, name })
        loadBranches()
        showNotice('ok', `🗑 ${name}`)
      })
    } else {
      setConfirmDelete(name)
      window.setTimeout(() => { setConfirmDelete(current => (current === name ? null : current)) }, 3000)
    }
  }

  const deleteRemote = (name: string): void => {
    if (confirmDelete === name) {
      setConfirmDelete(null)
      void run('remote-delete', async () => {
        await apiPost(`${GIT_ROUTE}/remote-delete`, { ws: wsName, name })
        loadBranches()
        showNotice('ok', `🗑 ${name}`)
      })
    } else {
      setConfirmDelete(name)
      window.setTimeout(() => { setConfirmDelete(current => (current === name ? null : current)) }, 3000)
    }
  }

  // Close on outside click / Escape.
  useEffect(() => {
    if (!branchOpen) return
    const onDown = (event: MouseEvent): void => {
      const node = event.target as Node | null
      if (node === null) return
      if (chipRef.current?.contains(node) || popRef.current?.contains(node)) return
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

  if (snapshot === null || !snapshot.isRepo) return null

  const dirty = !snapshot.clean

  return (
    <div className="gbar-hero" style={{ top, right }}>
      <span className="gbar-fchip" title={snapshot.cwd}>
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M1.5 4A1.5 1.5 0 0 1 3 2.5h3l1.5 2H13A1.5 1.5 0 0 1 14.5 6v6A1.5 1.5 0 0 1 13 13.5H3A1.5 1.5 0 0 1 1.5 12V4Z" />
        </svg>
        <span className="gbar-folder">{basenameOf(snapshot.cwd)}</span>
      </span>
      <span className="gbar-bwrap">
        <button
          type="button"
          ref={chipRef}
          className={'gbar-chip' + (branchOpen ? ' gbar-open' : '')}
          onClick={() => { setBranchOpen(value => { if (!value) loadBranches(); return !value }) }}
          title={dirty ? t('dirty') : t('clean')}
          aria-expanded={branchOpen}
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="4.5" cy="3.5" r="1.8" />
            <circle cx="4.5" cy="12.5" r="1.8" />
            <circle cx="12" cy="5.5" r="1.8" />
            <path d="M4.5 5.3v5.4" />
            <path d="M12 7.3c0 3-3.5 4.8-7.5 3.4" />
          </svg>
          <span className="gbar-bname">{snapshot.branch ?? snapshot.detachedHead ?? '—'}</span>
        </button>
        {branchOpen ? (
          <div className="gbar-pop" ref={popRef} role="menu">
          <div className="gbar-pop-head">
            <svg style={{ width: 14, height: 14, color: 'var(--dsw-alias-state-business-primary)', flex: 'none' }} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"><circle cx="4.5" cy="3.5" r="1.8" /><circle cx="4.5" cy="12.5" r="1.8" /><circle cx="12" cy="5.5" r="1.8" /><path d="M4.5 5.3v5.4" /><path d="M12 7.3c0 3-3.5 4.8-7.5 3.4" /></svg>
            <span className="cname">{snapshot.branch ?? snapshot.detachedHead ?? '—'}</span>
            <span className="state">
              <span style={{ width: 6, height: 6, borderRadius: 999, background: dirty ? 'var(--dsw-alias-state-warn-primary)' : 'var(--dsw-alias-state-success-primary)' }} />
              {snapshot.ahead > 0 ? <span>↑{snapshot.ahead}</span> : null}
              {snapshot.behind > 0 ? <span>↓{snapshot.behind}</span> : null}
            </span>
          </div>
          <div className="gbar-pop-body">
            <div className="gbar-sec">{t('branchLocal')}{branches !== null ? <span className="gbar-count">{branches.local.length}</span> : null}</div>
            {branches === null ? (
              <div className="gbar-loading"><span className="gbar-spin" />{t('loading')}</div>
            ) : branches.local.map(name => (
              <div key={name} className="gbar-rowwrap">
                <button type="button" className={'gbar-row' + (name === branches.current ? ' gbar-cur' : '')} onClick={() => { pickBranch(name) }}>
                  <span>{name}</span>
                  {name === branches.current ? <span className="gbar-check" aria-hidden>✓</span> : null}
                </button>
                {name !== branches.current && !isProtectedBranch(name) ? (
                  <button type="button" className={'gbar-del' + (confirmDelete === name ? ' gbar-arm' : '')} onClick={() => { deleteLocal(name) }} title={t('branchDelete')}>
                    {confirmDelete === name ? t('branchDeleteConfirm') : '🗑'}
                  </button>
                ) : null}
              </div>
            ))}
            <div className="gbar-sec">{t('branchRemote')}{branches !== null ? <span className="gbar-count">{branches.remote.length}</span> : null}</div>
            {branches?.remote.map(name => (
              <div key={name} className="gbar-rowwrap">
                <button type="button" className="gbar-row" onClick={() => { pickBranch(shortBranch(name)) }}>
                  <span>{shortBranch(name)}</span>
                  <span className="gbar-rm">{name.split('/')[0]}</span>
                </button>
                {!isProtectedBranch(shortBranch(name)) ? (
                  <button type="button" className={'gbar-del' + (confirmDelete === name ? ' gbar-arm' : '')} onClick={() => { deleteRemote(name) }} title={t('branchRemoteDelete')}>
                    {confirmDelete === name ? t('branchDeleteConfirm') : '🗑'}
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
      </span>
      {notice !== null ? createPortal(
        <div className={'gbar-notice gbar-' + notice.kind} role="status">{notice.text}</div>,
        document.body,
      ) : null}
    </div>
  )
}

/**
 * Mount the hero floating chip: watch for the workspace picker appearing
 * (hero mounts/unmounts as sessions open and close), keep a fixed-position
 * React root anchored just left of it, and re-render on settings changes.
 */
export function installHeroChip(controller: SettingsClient, t: Translate): () => void {
  const host = document.createElement('div')
  host.dataset.plugin = 'dsh-ui-tweaks-gitbar-hero'
  document.body.appendChild(host)
  const root = createRoot(host)
  let rect: { right: number; top: number } | null = null

  const render = (): void => {
    const enabled = controller.getSnapshot().value?.gitBarEnabled ?? true
    root.render(rect === null || !enabled
      ? null
      : <HeroBranchChip t={t} right={rect.right} top={rect.top} />)
  }
  const measure = (): void => {
    const el = document.querySelector<HTMLElement>(HERO_ANCHOR_SELECTOR)
    rect = el === null
      ? null
      : (() => {
          const box = el.getBoundingClientRect()
          return { right: Math.max(0, Math.round(window.innerWidth - box.left + 8)), top: Math.round(box.top + box.height / 2) }
        })()
    render()
  }
  let raf = 0
  const observer = new MutationObserver(() => {
    cancelAnimationFrame(raf)
    raf = requestAnimationFrame(measure)
  })
  observer.observe(document.body, { childList: true, subtree: true })
  window.addEventListener('resize', measure)
  const unsubscribe = controller.subscribe(render)
  measure()

  return () => {
    observer.disconnect()
    cancelAnimationFrame(raf)
    window.removeEventListener('resize', measure)
    unsubscribe()
    root.render(null)
    host.remove()
  }
}