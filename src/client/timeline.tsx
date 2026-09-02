/**
 * dsh-ui-tweaks — conversation timeline rail (browser half).
 *
 * A port of the DeepSeek official web app's ScrollNav interaction
 * (architecture reference: jjxjjjjiik-bot/dsh-chat-timeline, MIT) with two
 * deliberate fixes:
 *
 * 1. **Theme-aware styling** — the upstream plugin hardcoded light-on-dark
 *    colors (`rgba(255,255,255,…)`), which made the collapsed rail invisible
 *    in light mode. Every color here rides the DSH theme tokens
 *    (`--dsw-alias-*`), so the rail renders correctly in light and dark.
 *
 * 2. **Message-area anchoring** — the upstream plugin is `position: fixed;
 *    right: 12px` against the *viewport*, so an installed right sidebar
 *    (e.g. dsh-better-sidebar, whose layout push shrinks the conversation
 *    column via `#root { margin-right: var(--dsh-sidebar-width) }`) overlaps
 *    it. This rail measures `[data-conversation-scroll]` (the message area)
 *    and anchors to *its* right edge and vertical center, so it always sits at
 *    the right of the message area — beside the sidebar, never under it.
 *
 * Data source: the host `dshChatTimeline` session projection — a complete
 * server-side fold of the whole log, so it lists every user message whether
 * or not the browser has paged it into the loaded window. Jumping pages
 * history in through `ISession.loadOlder` until the target row paints, then
 * lands with measured geometry. Mounted in `conversation.input.dock` and
 * portaled to `document.body`.
 * @module dsh-ui-tweaks/client/timeline
 */

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import type { ISessions, UseProjection } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SettingsClient } from './index.tsx'

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionMap {
    /** Enumeration of direct user-sent messages, for the timeline rail. */
    dshChatTimeline: { messages: Array<{ seq: number; time: number; text: string; id?: string }> }
  }
}

/** Projection key matching the host half (src/timeline.ts). */
export const TIMELINE_PROJECTION_KEY = 'dshChatTimeline'

/** Gap between the rail and the message area's right edge, in px. */
const EDGE_GAP = 12

/** Expanded panel width — keep in sync with `.dutl-wrap.dutl-show` (240px). */
const PANEL_WIDTH = 240

/**
 * Horizontal slot of the detail bubble: this many px left of the EXPANDED
 * panel's left edge. Computed from constants instead of measuring the hovered
 * row — the row's rect mid-expansion-animation (first hover!) reflects the
 * still-narrow panel, which made the bubble hug the rail on first hover and
 * then jump left once the animation settled. A constant slot is stable from
 * the very first frame.
 */
const BUBBLE_GAP = 14

/** Locale keys the rail reads off the `ui-tweaks` dictionary. */
type RailLabelKey = 'railLabel' | 'roleUser' | 'noText'
type Translate = (key: RailLabelKey) => string

/** One normalized timeline entry. */
interface TimelineEntryLike {
  seq: number
  time: number
  text: string
  id?: string
}

// ---------------------------------------------------------------------------
// Timeline styles — theme-token based (works in light AND dark mode).
// ---------------------------------------------------------------------------

export const TIMELINE_CSS = `
.dutl-nav{-webkit-user-select:none;-moz-user-select:none;-ms-user-select:none;user-select:none;z-index:100;display:flex;position:fixed;align-items:center;justify-content:flex-end;pointer-events:auto}
.dutl-wrap{position:relative;z-index:2;border-radius:16px;width:24px;max-width:240px;transition:width .28s cubic-bezier(0.32,0.72,0,1),background-color .22s ease,box-shadow .22s ease,border-color .22s ease;display:flex;flex-direction:column;overflow:hidden;box-sizing:border-box;border:1px solid transparent;background:transparent}
.dutl-wrap.dutl-show{width:240px;background:color-mix(in srgb,var(--dsw-alias-bg-layer-2) 88%,transparent);-webkit-backdrop-filter:blur(18px) saturate(1.35);backdrop-filter:blur(18px) saturate(1.35);border:1px solid var(--dsw-alias-border-l1);box-shadow:var(--dsw-shadow-lv1),0 0 0 1px color-mix(in srgb,var(--dsw-alias-border-l1) 55%,transparent)}
.dutl-page{max-height:340px;padding:6px 0;box-sizing:border-box;overscroll-behavior:contain;display:flex;flex-direction:column;align-items:stretch;width:100%;overflow:hidden}
.dutl-wrap.dutl-show .dutl-page{overflow-y:auto;overflow-x:hidden;scrollbar-width:thin;scrollbar-color:color-mix(in srgb,var(--dsw-alias-label-tertiary) 35%,transparent) transparent}
.dutl-page::-webkit-scrollbar{width:5px}
.dutl-page::-webkit-scrollbar-track{background:transparent}
.dutl-page::-webkit-scrollbar-thumb{background:color-mix(in srgb,var(--dsw-alias-label-tertiary) 35%,transparent);border-radius:4px}
.dutl-page::-webkit-scrollbar-thumb:hover{background:color-mix(in srgb,var(--dsw-alias-label-tertiary) 60%,transparent)}
.dutl-item{flex-shrink:0;cursor:pointer;height:30px;min-height:30px;width:100%;padding:0 2px 0 12px;box-sizing:border-box;display:flex;align-items:center;justify-content:flex-end;background:none;border:none;font:inherit;text-align:right;border-radius:10px;transition:color .18s ease,background-color .18s ease;color:var(--dsw-alias-label-secondary)}
.dutl-wrap.dutl-show .dutl-item{padding:0 8px 0 12px}
.dutl-item:hover{color:var(--dsw-alias-label-primary);background:color-mix(in srgb,var(--dsw-alias-interactive-bg-hover) 72%,transparent)}
.dutl-item.dutl-active{color:var(--dsw-alias-state-business-primary)}
.dutl-item.dutl-active:hover{background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 9%,transparent)}
.dutl-title{font-size:12.5px;line-height:20px;text-overflow:ellipsis;white-space:nowrap;opacity:0;margin-right:10px;flex:1;min-width:0;text-align:right;overflow:hidden;color:inherit;transform:translateX(5px);transition:opacity .18s ease,color .18s ease,transform .22s cubic-bezier(0.32,0.72,0,1)}
.dutl-title.dutl-show{opacity:1;transform:translateX(0)}
.dutl-item.dutl-active .dutl-title{color:inherit;font-weight:500}
.dutl-ind{flex-shrink:0;width:22px;height:22px;display:flex;justify-content:center;align-items:center}
.dutl-line{position:relative;background-color:color-mix(in srgb,var(--dsw-alias-label-tertiary) 55%,transparent);border-radius:3px;flex-shrink:0;width:8px;height:2px;transition:background-color .2s ease,width .24s cubic-bezier(0.34,1.56,0.64,1),height .24s cubic-bezier(0.34,1.56,0.64,1),box-shadow .2s ease}
.dutl-item:hover .dutl-line{background-color:var(--dsw-alias-state-business-primary);width:18px;height:3px;box-shadow:0 0 8px color-mix(in srgb,var(--dsw-alias-state-business-primary) 55%,transparent);animation:dutl-pop .32s cubic-bezier(0.34,1.56,0.64,1)}
.dutl-item.dutl-active .dutl-line{background-color:var(--dsw-alias-state-business-primary);width:12px;height:3px;box-shadow:0 0 6px color-mix(in srgb,var(--dsw-alias-state-business-primary) 38%,transparent)}
.dutl-item.dutl-active:hover .dutl-line{width:18px}
@keyframes dutl-pop{0%{transform:scaleY(1)}45%{transform:scaleY(1.55)}100%{transform:scaleY(1)}}
.dutl-bubble{position:fixed;z-index:200;max-width:280px;max-height:230px;box-sizing:border-box;padding:10px 12px;border-radius:12px;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);box-shadow:var(--dsw-shadow-lv1);color:var(--dsw-alias-label-primary);pointer-events:none;display:flex;flex-direction:column;gap:5px;transform:translateY(-50%);animation:dutl-bubble-in .16s cubic-bezier(0.32,0.72,0,1)}
.dutl-bubble::after{content:"";position:absolute;right:-5px;top:50%;width:8px;height:8px;margin-top:-4px;background:inherit;border-right:1px solid var(--dsw-alias-border-l1);border-top:1px solid var(--dsw-alias-border-l1);border-top-right-radius:2px;transform:rotate(45deg)}
.dutl-bubble-head{display:flex;align-items:center;gap:6px;font-size:11px;font-weight:500;color:var(--dsw-alias-label-tertiary)}
.dutl-bubble-user{display:inline-flex;align-items:center;gap:5px}
.dutl-bubble-dot{width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-state-business-primary);box-shadow:0 0 5px color-mix(in srgb,var(--dsw-alias-state-business-primary) 60%,transparent)}
.dutl-bubble-time{margin-left:auto;font-variant-numeric:tabular-nums;font-weight:400}
.dutl-bubble-text{font-size:12.5px;line-height:1.55;white-space:pre-wrap;word-break:break-word;overflow-y:auto;max-height:150px;color:var(--dsw-alias-label-primary)}
.dutl-bubble-text::-webkit-scrollbar{width:4px}
.dutl-bubble-text::-webkit-scrollbar-track{background:transparent}
.dutl-bubble-text::-webkit-scrollbar-thumb{background:color-mix(in srgb,var(--dsw-alias-label-tertiary) 35%,transparent);border-radius:4px}
@keyframes dutl-bubble-in{from{opacity:0;transform:translateY(-50%) translateX(6px)}to{opacity:1;transform:translateY(-50%) translateX(0)}}
@media (prefers-reduced-motion:reduce){.dutl-wrap,.dutl-title,.dutl-line,.dutl-bubble{transition:none;animation:none}}
`

/** Install the rail stylesheet once (idempotent); returns the disposer. */
export function installTimelineStyles(): () => void {
  const id = 'dsh-ui-tweaks-timeline'
  const existing = document.querySelector(`style[data-plugin-css="${id}"]`)
  if (existing !== null) return () => {}
  const style = document.createElement('style')
  style.dataset.plugin = 'dsh-ui-tweaks'
  style.dataset.pluginCss = id
  style.textContent = TIMELINE_CSS
  document.head.appendChild(style)
  return () => { style.remove() }
}

// ---------------------------------------------------------------------------
// Data collection, position tracking & jumping.
// ---------------------------------------------------------------------------

/** Normalize one record to { seq, time, text, id? }. */
function normalize(m: unknown): TimelineEntryLike | null {
  if (m === null || typeof m !== 'object') return null
  const record = m as Record<string, unknown>
  if (typeof record.seq !== 'number') return null
  return {
    seq: record.seq,
    time: typeof record.time === 'number' ? record.time : 0,
    text: typeof record.text === 'string' ? record.text : '',
    ...(typeof record.id === 'string' ? { id: record.id } : {}),
  }
}

/**
 * Resolve the chat node's `data-chat-anchor-key` from the durable message id:
 * the conversation engine keys a Context as `${kind.length}:${kind}${id}`
 * (`conversationContextKey`), and user messages ride the `input-message`
 * definition — 13 letters — so the anchor is `13:input-message{id}`.
 * Id-less entries (logs older than the durable-id era) cannot be keyed.
 */
function anchorKeyOf(m: TimelineEntryLike): string | undefined {
  if (typeof m.id === 'string' && m.id !== '') return `13:input-message${m.id}`
  return undefined
}

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/** One animation frame, or a small timeout fallback when rAF is unavailable. */
const nextFrame = (): Promise<void> =>
  typeof requestAnimationFrame === 'function'
    ? new Promise((resolve) => requestAnimationFrame(() => resolve()))
    : delay(16)

/** Compact, locale-aware timestamp for the detail bubble. */
function formatTime(ms: number): string {
  const date = new Date(ms)
  const now = new Date()
  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return date.toDateString() === now.toDateString()
    ? time
    : `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${time}`
}

/** Resolvable jump target: durable anchor key when known, plus its log seq. */
interface JumpTarget {
  key?: string | undefined
  seq?: number | undefined
}

/**
 * Whether the session's loaded event window already covers `seq` — the jump
 * loop's termination signal. The Conversation assembly consumes the SAME
 * window (binding.eventSource), so a covered seq means the chat rows built
 * from it exist or are one commit away. `SessionSeq` is a brand, but the
 * window exposes plain event seqs, so a plain number comparison suffices.
 */
function windowCoversSeq(
  sessionsService: ISessions,
  sessionId: SessionId,
  seq: number,
): boolean {
  const source = sessionsService.binding(sessionId)?.eventSource
  if (source === undefined) return false
  const entries = source.getSnapshot().entries
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i]
    if (entry !== undefined && entry.type === 'event' && entry.event.seq === seq) return true
  }
  return false
}

/** Ensure the message node is loaded, its row painted and stable, then scroll. */
async function jumpToMessage(sessionsService: ISessions, sessionId: SessionId, target: JumpTarget): Promise<boolean> {
  const session = sessionsService.binding(sessionId)?.session
  // A missing binding is the expected transient around session switches — stay
  // quiet so switch storms don't spam; every other failure below announces
  // itself (this whole function's failure modes used to be totally silent).
  if (session === undefined) return false
  if (typeof document === 'undefined') return false

  // Devtools aid: set window.__dutTimelineDebug = true to trace jump stages.
  const dbg = Boolean((window as unknown as { __dutTimelineDebug?: unknown }).__dutTimelineDebug)
  const log = (...args: unknown[]): void => { if (dbg) console.debug('[dsh-ui-tweaks timeline]', ...args) }

  // Pull history pages until the target row can exist. The binding's event
  // window mirrors the Conversation assembly's input, so "the window covers
  // the target seq" is exactly "the store holds the node the row renders
  // from". Idle polls are NOT charged against the budget anymore: the old
  // guard counted them together with real page loads against one shared
  // limit, so long sessions hit the cap mid-load and silently aborted with
  // the target still missing; only a second click worked because that retry
  // reused data pulled in the meantime.
  // Deep history pages arrive 50 events at a time over sequential round
  // trips (dsh caps maxMessages: 50), so a far entry legitimately takes
  // dozens of loads — budget generously instead of "two clicks then give up".
  const deadline = Date.now() + 150_000
  const key = target.key
  if (key === undefined) {
    // Id-less entries (logs older than the durable-id era) cannot rebuild a
    // chat anchor — the engine itself keys every row off the message id.
    console.info('[dsh-ui-tweaks timeline] jump aborted: entry has no durable message id', { seq: target.seq })
    return false
  }
  let loads = 0
  while (Date.now() < deadline && loads < 2500) {
    if (target.seq === undefined || windowCoversSeq(sessionsService, sessionId, target.seq)) break
    const snapshot = session.getSnapshot()
    if (snapshot.openState === 'error') return false
    if (snapshot.hasMore !== true) {
      log('no more history', { loads })
      return false
    }
    if (snapshot.loadingOlder === true) { await delay(60); continue }
    loads += 1
    await session.loadOlder()
    log('loadOlder resolved', { loads })
  }
  if (target.seq !== undefined && !windowCoversSeq(sessionsService, sessionId, target.seq)) {
    console.info('[dsh-ui-tweaks timeline] jump aborted: target still outside loaded window', { seq: target.seq, loads })
    return false
  }

  // Wait for the painted row AND settled geometry. React paints new rows on
  // a later commit than the store update, and after a big prepend the seats
  // around the target keep growing over several hydration chunks — a
  // measurement taken during that settle is stale by the next commit.
  // Require the computed centering top to repeat across three consecutive
  // frames before trusting it; this also outlives post-prepend anchors.
  let frames = 0
  let scrollport: HTMLElement | null = null
  let row: Element | null = null
  // `measuredTop` tracks the trusted landing position. It must never double as
  // an "unset" sentinel: the FIRST message's centered scrollTop clamps to 0,
  // and comparing that against a -1 sentinel looks like "unchanged" (|0-(-1)|=1),
  // settling the loop without ever storing the position — then the `< 0`
  // completeness check silently discarded the whole jump. That was exactly the
  // "clicking the first timeline entry does nothing" defect.
  let measuredTop = -1
  let lastCandidate: number | null = null
  let stableRuns = 0
  let settled = false
  while (frames++ < 360) {
    scrollport = document.querySelector<HTMLElement>('[data-conversation-scroll]')
    row = scrollport === null ? null : scrollport.querySelector(`[data-chat-anchor-key="${CSS.escape(key)}"]`)
    if (scrollport === null || row === null) { stableRuns = 0; await nextFrame(); continue }
    const spRect = scrollport.getBoundingClientRect()
    const rowRect = row.getBoundingClientRect()
    const candidate = Math.min(
      Math.max(scrollport.scrollTop + (rowRect.top - spRect.top) - (spRect.height - rowRect.height) / 2, 0),
      Math.max(0, scrollport.scrollHeight - scrollport.clientHeight),
    )
    if (lastCandidate !== null && Math.abs(candidate - lastCandidate) <= 1) {
      stableRuns += 1
    } else {
      stableRuns = 0
    }
    // Record EVERY candidate — including 0 — so the settled value is always the
    // real geometry, sentinel-free.
    measuredTop = candidate
    lastCandidate = candidate
    if (stableRuns >= 2) { settled = true; break }
    await nextFrame()
  }
  if (!settled) console.info('[dsh-ui-tweaks timeline] jump: layout did not settle in time, applying best effort', { frames })
  if (row === null || scrollport === null || measuredTop < 0) {
    console.info('[dsh-ui-tweaks timeline] jump aborted: layout never revealed the target row', { key, frames })
    return false
  }

  // Position directly on the measured scrollport instead of relying on
  // scrollIntoView: the DOM contract picks the nearest scrolling ancestor,
  // which in deeply nested layouts can resolve to an inner overflow-clipped
  // wrapper rather than the visible message scroller, moving nothing. Own
  // geometry gives one deterministic target element per click.
  const far = Math.abs(row.getBoundingClientRect().top - scrollport.getBoundingClientRect().top) > scrollport.clientHeight * 2
  // Always apply as one instant write. Smooth animations keep producing
  // frames AFTER later programmatic writes, silently retargeting the view;
  // a synchronous scrollTo with behavior 'auto' also cancels any running
  // smooth animation on this element first, so nothing can override the
  // landing position afterwards. Quiescence was already verified above.
  scrollport.scrollTo({ top: measuredTop, behavior: 'auto' })
  // One self-check pass two frames later: anything that rewrites the view
  // after our landing (a straggler at-bottom snap, a clamp transition after
  // huge prepends, a late image decode shift) moves the row far off center.
  // Recompute fresh and reassert once — invisible when everything behaved.
  await nextFrame(); await nextFrame()
  const verifySp = document.querySelector<HTMLElement>('[data-conversation-scroll]')
  const verifyRow = verifySp === null ? null : verifySp.querySelector(`[data-chat-anchor-key="${CSS.escape(key)}"]`)
  if (verifySp !== null && verifyRow !== null) {
    const vRect = verifySp.getBoundingClientRect()
    const rRect = verifyRow.getBoundingClientRect()
    const offCenter = Math.abs((rRect.top + rRect.height / 2) - (vRect.top + vRect.height / 2))
    if (offCenter > vRect.height * 0.5) {
      const retargeted = Math.min(
        Math.max(verifySp.scrollTop + (rRect.top - vRect.top) - (vRect.height - rRect.height) / 2, 0),
        Math.max(0, verifySp.scrollHeight - verifySp.clientHeight),
      )
      verifySp.scrollTo({ top: retargeted, behavior: 'auto' })
      log('self-check corrected', { top: retargeted })
    }
  }
  log('jump applied', { far, loads, frames, top: measuredTop })
  return true
}

// ---------------------------------------------------------------------------
// The rail component.
// ---------------------------------------------------------------------------

export interface TimelineRailProps {
  /** Framework seat (PropsRuntime): key-addressed projection reader. */
  useProjection: UseProjection
  /** Framework seat (PropsRuntime): current session id. */
  sessionId: SessionId | undefined
  /** Injected: the client sessions service (live Session handles). */
  sessionsService: ISessions
  /** Injected: the ui-tweaks settings store (reads `timelineStyle`). */
  controller: SettingsClient
  /** Locale-bound translator for the rail labels. */
  t: Translate
}

export function TimelineRail({ useProjection, sessionId, sessionsService, controller, t }: TimelineRailProps) {
  const settingsState = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot)
  const enabled = settingsState.value?.timelineStyle === 'web'

  const projected = useProjection(TIMELINE_PROJECTION_KEY)

  // Memoize the entry list: the projection value is reference-stable between
  // its own changes, so this re-runs only when the underlying data moved —
  // never on an unrelated re-render.
  const messages = useMemo<TimelineEntryLike[]>(() => {
    if (!Array.isArray(projected?.messages)) return []
    return projected.messages.map(normalize).filter((m): m is TimelineEntryLike => m !== null)
  }, [projected])

  const [activeIndex, setActiveIndex] = useState(-1)
  const [show, setShow] = useState(false)
  const [anchor, setAnchor] = useState<{ top: number; right: number } | null>(null)
  const [bubble, setBubble] = useState<{ top: number; entry: TimelineEntryLike } | null>(null)
  const pageRef = useRef<HTMLDivElement | null>(null)
  const navRef = useRef<HTMLDivElement | null>(null)

  // Keep the active (blue) line visible. With many messages the rail page
  // scrolls (max-height 340px), and a freshly remounted rail — e.g. after
  // switching away and back to a session — starts at scrollTop 0, leaving the
  // current item clipped below the fold. While the panel is collapsed (nothing
  // fights the user's own scrolling) bring the active item into view whenever
  // it changes.
  //
  // The adjustment is "nearest edge" (scroll just enough that the item fits),
  // NOT re-centering: re-centering scrolls the page
  // even while the active item is already visible, and near the end of a long
  // conversation that shoves the EARLIEST entries out through the top clip —
  // their pixels then belong to nothing (elementsFromPoint on a clipped row
  // resolved to the chat scrollport behind the rail), so a trusted click on
  // "the first entry" hit empty space / the conversation and never reached the
  // button. Minimal scrolling keeps earlier entries on-panel far more often,
  // and the wheel handler below guarantees reachability for what remains
  // clipped anyway. Deferred to the next frame; cancelled on a newer change,
  // so a fast scroll never issues more than one layout write per frame.
  useEffect(() => {
    if (activeIndex < 0) return
    const raf = requestAnimationFrame(() => {
      const page = pageRef.current
      if (page === null) return
      if (page.scrollHeight <= page.clientHeight + 1) return
      const item = page.children[activeIndex] as HTMLElement | undefined
      if (item === undefined) return
      const pageRect = page.getBoundingClientRect()
      const itemRect = item.getBoundingClientRect()
      // Pure nearest-edge fit (scrollIntoView block:'nearest' semantics): touch
      // scrollTop only when the item is actually clipped, and only by the
      // clipped amount. Any standing breathing-room margin here would betray
      // terminal rows — guaranteeing a trailing gap below the LAST entry pins
      // the page to its maximum on every re-run, re-clipping the first entries
      // right after a manual scrub. Flush-at-edge is fine: rows are one hop in
      // either direction.
      if (itemRect.bottom > pageRect.bottom) {
        page.scrollTop += itemRect.bottom - pageRect.bottom
      } else if (itemRect.top < pageRect.top) {
        page.scrollTop -= pageRect.top - itemRect.top
      }
    })
    return () => { cancelAnimationFrame(raf) }
  }, [show, activeIndex])

  // Wheel anywhere over the rail scrubs its internal page — collapsed strip
  // included. The collapsed wrap is overflow:hidden, so a native wheel over it
  // scrolled NOTHING and instead bubbled straight through the fixed rail into
  // `[data-conversation-scroll]`, scrolling the chat BEHIND the cursor's rail
  // position. Worse, any row pushed outside the 340px window by the follower
  // above was permanently unreachable: its area belongs to the wrap's clip or
  // whatever sits behind (see the follower comment), so no pointer action —
  // hover to preview, click to jump — could ever address it. Manual scrubbing
  // restores that access everywhere: wheel up/down moves the internal page,
  // preventDefault keeps the gesture from leaking into the chat scroller, and
  // hard ends fall through untouched. The listener is non-passive because
  // preventDefault requires it.
  const railRendered = enabled && sessionId !== undefined && messages.length >= 2
  useEffect(() => {
    const nav = navRef.current
    if (!railRendered || nav === null) return
    const onWheel = (event: WheelEvent): void => {
      const page = pageRef.current
      if (page === null || event.deltaY === 0) return
      const max = page.scrollHeight - page.clientHeight
      if (max <= 0) return
      const before = page.scrollTop
      const after = Math.min(max, Math.max(0, before + event.deltaY))
      if (after === before) return
      event.preventDefault()
      event.stopPropagation()
      page.scrollTop = after
    }
    nav.addEventListener('wheel', onWheel, { passive: false })
    return () => { nav.removeEventListener('wheel', onWheel) }
  }, [railRendered])

  // Anchor the rail to the message area's right edge & vertical center. The
  // scrollport's right edge tracks both the built-in DSH column grid and any
  // right-sidebar layout push (e.g. dsh-better-sidebar), so the rail always
  // sits at the right of the message area — never under a sidebar.
  useEffect(() => {
    if (!enabled) return
    const measure = (): void => {
      const sp = document.querySelector('[data-conversation-scroll]')
      if (sp === null) return
      const rect = sp.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return
      const top = Math.round(rect.top + rect.height / 2)
      const right = Math.max(0, Math.round(window.innerWidth - rect.right + EDGE_GAP))
      setAnchor((prev) => {
        if (prev !== null && Math.abs(prev.top - top) < 2 && Math.abs(prev.right - right) < 2) return prev
        return { top, right }
      })
    }
    measure()
    let raf = 0
    const scrollport = document.querySelector('[data-conversation-scroll]')
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(measure)
    })
    if (scrollport !== null) observer.observe(scrollport)
    observer.observe(document.body)
    window.addEventListener('resize', measure)
    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [enabled, sessionId])

  // Track the reading position (the highlighted timeline item). Cost scales
  // with the conversation, so it must stay cheap on huge sessions: the user
  // rows are cached (never a full-subtree querySelectorAll per update), scroll
  // updates are coalesced to one per frame via rAF, and the old 2s polling
  // interval is replaced by a ResizeObserver — zero idle cost.
  //
  // The cache is resolved LAZILY: the projection delivers its full message
  // list before the chat window paints its rows (and the chat view can also
  // remount without a sessionId change — view-tab switches etc.), so
  // `updateActive` re-resolves whenever the cache is empty or the scrollport
  // identity changed. Without this, a rail mounted before the rows exist
  // would cache an empty map and never show a blue line again.
  useEffect(() => {
    if (messages.length === 0) return
    const messageIndexByKey = new Map<string, number>()
    for (let i = 0; i < messages.length; i++) {
      const message = messages[i]
      if (message === undefined) continue
      const key = anchorKeyOf(message)
      if (key !== undefined) messageIndexByKey.set(key, i)
    }
    // Rendered user rows, resolved on demand (see the comment above).
    let scrollport: Element | null = null
    let rows = new Map<string, HTMLElement>()
    const resolveRows = (): void => {
      const sp = document.querySelector('[data-conversation-scroll]')
      scrollport = sp
      const next = new Map<string, HTMLElement>()
      if (sp !== null) {
        for (const row of sp.querySelectorAll('[data-chat-anchor-key^="13:input-message"]')) {
          const key = row.getAttribute('data-chat-anchor-key')
          if (key !== null) next.set(key, row as HTMLElement)
        }
      }
      rows = next
    }
    const updateActive = (): void => {
      const sp = document.querySelector('[data-conversation-scroll]')
      if (sp === null) return
      if (sp !== scrollport || rows.size === 0) resolveRows()
      if (sp === null || sp !== scrollport || rows.size === 0) return
      const rect = sp.getBoundingClientRect()
      if (rect.height === 0) return
      const line = rect.top + rect.height * 0.4
      let best = -1
      let bestDist = Infinity
      for (const [key, row] of rows) {
        const idx = messageIndexByKey.get(key) ?? -1
        if (idx === -1) continue
        const r = row.getBoundingClientRect()
        const dist = Math.abs(r.top + r.height / 2 - line)
        if (dist < bestDist) { bestDist = dist; best = idx }
      }
      setActiveIndex(best)
    }
    // The chat window may paint its rows a beat after the rail mounts (the
    // projection is ready before the DOM). Retry for a short budget until the
    // rows resolve, then evaluate once.
    let retries = 0
    const retry = (): void => {
      if (rows.size === 0 && ++retries <= 120) {
        requestAnimationFrame(() => { resolveRows(); retry() })
        return
      }
      updateActive()
    }
    retry()
    // Coalesce scroll bursts into at most one update per frame. The listener
    // rides the document (capture) so it survives chat-view remounts that
    // replace the scrollport without a sessionId change.
    let scrollRaf = 0
    const onScroll = (): void => {
      if (scrollRaf !== 0) return
      scrollRaf = requestAnimationFrame(() => { scrollRaf = 0; updateActive() })
    }
    document.addEventListener('scroll', onScroll, { passive: true, capture: true })
    // Re-evaluate when the viewport or its content grows without a scroll
    // (composer expansion, image loads, sidebar toggles) — this replaces the
    // old fixed-interval poll with an event-driven, idle-free equivalent.
    const observer = new ResizeObserver(() => { updateActive() })
    observer.observe(document.body)
    return () => {
      if (scrollRaf !== 0) cancelAnimationFrame(scrollRaf)
      document.removeEventListener('scroll', onScroll, { capture: true })
      observer.disconnect()
    }
  }, [sessionId, messages.length])

  if (!enabled || sessionId === undefined || messages.length < 2) return null

  const railRight = anchor === null ? EDGE_GAP : anchor.right
  const railStyle: CSSProperties = anchor === null
    ? { top: '50%', right: EDGE_GAP, transform: 'translateY(-50%)' }
    : { top: anchor.top, right: anchor.right, transform: 'translateY(-50%)' }
  // Stable horizontal slot: always left of the fully-expanded panel, never
  // measured from the animating rows (see BUBBLE_GAP above).
  const bubbleStyle: CSSProperties = { top: bubble === null ? 0 : bubble.top, right: railRight + PANEL_WIDTH + BUBBLE_GAP }

  return createPortal(
    <>
      <div
        className="dutl-nav"
        role="navigation"
        aria-label={t('railLabel')}
        ref={navRef}
        onMouseEnter={() => { setShow(true) }}
        onMouseLeave={() => { setShow(false) }}
        style={railStyle}
      >
        <div className={'dutl-wrap' + (show ? ' dutl-show' : '')}>
          <div className="dutl-page" ref={pageRef}>
            {messages.map((m, i) => {
              return (
                <button
                  key={m.seq}
                  type="button"
                  className={'dutl-item' + (activeIndex === i ? ' dutl-active' : '')}
                  aria-label={`${t('roleUser')}: ${m.text.slice(0, 60) || t('noText')}`}
                  aria-current={activeIndex === i ? 'location' : undefined}
                  onClick={() => { void jumpToMessage(sessionsService, sessionId, { key: anchorKeyOf(m), seq: m.seq }).catch(() => {}) }}
                  onMouseEnter={(event) => {
                    // Vertical: follow the hovered row (clamped into the
                    // viewport). Horizontal: the constant slot next to the
                    // expanded panel — identical on first hover and after.
                    const rect = event.currentTarget.getBoundingClientRect()
                    const top = Math.min(Math.max(rect.top + rect.height / 2, 150), window.innerHeight - 150)
                    setBubble({ top, entry: m })
                  }}
                  onMouseLeave={() => { setBubble(null) }}
                >
                  <span className={'dutl-title' + (show ? ' dutl-show' : '')}>{m.text === '' ? t('noText') : m.text}</span>
                  <span className="dutl-ind" aria-hidden>
                    <span className="dutl-line" />
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </div>
      {/* Detail bubble: replaces the native title tooltip with a themed
          bubble (user label + timestamp + message text). Horizontally it
          occupies a FIXED slot just left of the expanded panel — stable from
          the first hover, never covering the list; vertically it follows the
          hovered row so the bubble stays associated with the point under the
          cursor. Only while the panel is open — a collapsed rail isn't meant
          for point-level browsing. */}
      {bubble !== null && show ? (
        <div
          className="dutl-bubble"
          style={bubbleStyle}
          role="tooltip"
        >
          <div className="dutl-bubble-head">
            <span className="dutl-bubble-user"><span className="dutl-bubble-dot" />{t('roleUser')}</span>
            <span className="dutl-bubble-time">{formatTime(bubble.entry.time)}</span>
          </div>
          <div className="dutl-bubble-text">{bubble.entry.text === '' ? t('noText') : bubble.entry.text}</div>
        </div>
      ) : null}
    </>,
    document.body,
  )
}
