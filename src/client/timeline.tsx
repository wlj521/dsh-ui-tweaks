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
 * Data sources, fastest first: host `dshChatTimeline` session projection →
 * loaded chat nodes → a background `loadOlder` loop (stopped as soon as a
 * faster source delivers). Mounted in `conversation.input.dock` and portaled
 * to `document.body`.
 * @module dsh-ui-tweaks/client/timeline
 */

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import type { ConversationSnapshot, ISessions, SessionId, UseProjection } from '@deepseek-ai/dsh-client-runtime/client'
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
  key?: string
  id?: string
}

/** Snapshot source shared by the live Session and the no-session no-op. */
interface SnapshotSource {
  getSnapshot(): ConversationSnapshot | undefined
  subscribe(fn: () => void): () => void
}

const NOOP_STORE: SnapshotSource = {
  getSnapshot: () => undefined,
  subscribe: () => () => {},
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

/** Extract preview text from a user message's ContentBlock list. */
function userTextOf(content: unknown): string {
  if (!Array.isArray(content)) return ''
  let out = ''
  for (const block of content) {
    if (block !== null && typeof block === 'object') {
      const record = block as { type?: unknown; text?: unknown }
      if (record.type === 'text' && typeof record.text === 'string') out += record.text
    }
  }
  return out.trim().slice(0, 240)
}

/** Normalize one record to { seq, time, text, key?, id? }. */
function normalize(m: unknown): TimelineEntryLike | null {
  if (m === null || typeof m !== 'object') return null
  const record = m as Record<string, unknown>
  if (typeof record.seq !== 'number') return null
  return {
    seq: record.seq,
    time: typeof record.time === 'number' ? record.time : 0,
    text: typeof record.text === 'string' ? record.text : '',
    ...(typeof record.key === 'string' ? { key: record.key } : {}),
    ...(typeof record.id === 'string' ? { id: record.id } : {}),
  }
}

/** Minimal shape of a user node's data, read off the chat snapshot. */
interface UserNodeData {
  time?: unknown
  content?: unknown
}

/** Fallback collector: enumerate user messages from the loaded chat nodes. */
function collectFromNodes(snapshot: ConversationSnapshot | undefined): TimelineEntryLike[] {
  const out: TimelineEntryLike[] = []
  if (snapshot === undefined) return out
  for (const node of snapshot.chat.nodes.values()) {
    if (node.kind !== 'user') continue
    const data = node.data as UserNodeData | null | undefined
    if (data === null || typeof data !== 'object') continue
    if (typeof data.time !== 'number' || !Array.isArray(data.content)) continue
    out.push({ seq: node.anchorSeq, time: data.time, text: userTextOf(data.content), key: node.key })
  }
  out.sort((a, b) => a.seq - b.seq)
  return out
}

/** Resolve the chat node's data-chat-anchor-key (direct key, or rebuilt from id). */
function anchorKeyOf(m: TimelineEntryLike): string | undefined {
  if (typeof m.key === 'string' && m.key !== '') return m.key
  if (typeof m.id === 'string' && m.id !== '') return `13:input-message${m.id}`
  return undefined
}

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/** Compact, locale-aware timestamp for the detail bubble. */
function formatTime(ms: number): string {
  const date = new Date(ms)
  const now = new Date()
  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return date.toDateString() === now.toDateString()
    ? time
    : `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${time}`
}

/** Ensure the message node is loaded into the window, then scroll to its row. */
async function jumpToMessage(sessionsService: ISessions, sessionId: SessionId, key: string): Promise<boolean> {
  const session = sessionsService.binding(sessionId)?.session
  if (session === undefined) return false
  let guard = 0
  while (guard++ < 120) {
    const snapshot = session.getSnapshot()
    if (snapshot?.chat?.nodes?.get(key) !== undefined) break
    if (snapshot?.hasMore !== true) return false
    if (snapshot.loadingOlder === true) { await delay(50); continue }
    await session.loadOlder()
  }
  const scrollport = typeof document !== 'undefined' ? document.querySelector('[data-conversation-scroll]') : null
  const row = scrollport === null ? null : scrollport.querySelector(`[data-chat-anchor-key="${CSS.escape(key)}"]`)
  if (row === null || scrollport === null) return false
  const reducedMotion = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  // Smooth only for nearby targets. Smooth-scrolling tens of thousands of
  // pixels of a huge conversation reflows the whole page every frame for
  // seconds — the exact "timeline is laggy" symptom — so long jumps snap
  // instantly instead.
  const distance = Math.abs(row.getBoundingClientRect().top - scrollport.getBoundingClientRect().top)
  const far = distance > scrollport.clientHeight * 2
  row.scrollIntoView({ behavior: reducedMotion || far ? 'auto' : 'smooth', block: 'center' })
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
  /** Injected: the ui-tweaks settings store (reads `timelineEnabled`). */
  controller: SettingsClient
  /** Locale-bound translator for the rail labels. */
  t: Translate
}

export function TimelineRail({ useProjection, sessionId, sessionsService, controller, t }: TimelineRailProps) {
  const settingsState = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot)
  const enabled = settingsState.value?.timelineEnabled ?? false

  const projected = useProjection(TIMELINE_PROJECTION_KEY)
  const session = sessionId === undefined ? undefined : sessionsService.binding(sessionId)?.session
  const fallbackStore: SnapshotSource = session === undefined ? NOOP_STORE : session
  const subscribe = useMemo(() => (fn: () => void) => fallbackStore.subscribe(fn), [fallbackStore])
  const getSnapshot = useMemo(() => () => fallbackStore.getSnapshot(), [fallbackStore])
  const nodeSnapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  // Memoize the entry list: the projection value and the session snapshot are
  // reference-stable between their own changes, so this re-runs only when the
  // underlying data moved — never on an unrelated re-render (the session store
  // notifies on every chat event, which would otherwise re-scan every node).
  const { messages, source } = useMemo<{ messages: TimelineEntryLike[]; source: 'projection' | 'nodes' }>(() => {
    if (Array.isArray(projected?.messages) && projected.messages.length > 0) {
      return {
        messages: projected.messages.map(normalize).filter((m): m is TimelineEntryLike => m !== null),
        source: 'projection',
      }
    }
    return { messages: collectFromNodes(nodeSnapshot), source: 'nodes' }
  }, [projected, nodeSnapshot])

  const [activeIndex, setActiveIndex] = useState(-1)
  const [show, setShow] = useState(false)
  const [anchor, setAnchor] = useState<{ top: number; right: number } | null>(null)
  const [bubble, setBubble] = useState<{ top: number; entry: TimelineEntryLike } | null>(null)
  const pageRef = useRef<HTMLDivElement | null>(null)

  // Keep the active (blue) line visible. With many messages the rail page
  // scrolls (max-height 340px), and a freshly remounted rail — e.g. after
  // switching away and back to a session — starts at scrollTop 0, leaving the
  // current item clipped below the fold. While the panel is collapsed (nothing
  // fights the user's own scrolling) re-centre the page on the active item
  // whenever it changes, like a scrollbar thumb following the reading
  // position. The collapsed rail thus always shows the blue line, and
  // hovering opens the panel already at the current item. The adjustment is
  // deferred to the next frame and cancelled on a newer active change, so a
  // fast scroll never issues more than one layout write per frame.
  useEffect(() => {
    if (show || activeIndex < 0) return
    const raf = requestAnimationFrame(() => {
      const page = pageRef.current
      if (page === null) return
      const item = page.children[activeIndex] as HTMLElement | undefined
      if (item === undefined) return
      const pageRect = page.getBoundingClientRect()
      const itemRect = item.getBoundingClientRect()
      if (itemRect.top >= pageRect.top - 1 && itemRect.bottom <= pageRect.bottom + 1) return
      page.scrollTop += itemRect.top - pageRect.top - (pageRect.height - itemRect.height) / 2
    })
    return () => { cancelAnimationFrame(raf) }
  }, [show, activeIndex])

  // Background full-history load: follow the runtime's authoritative hasMore
  // flag, but STOP as soon as the projection delivers. Wait for the session's
  // first window (openState 'open') before judging hasMore — a freshly
  // binding session reads cold/loading with hasMore=false and no nodes, and
  // bailing there would leave the rail on the few loaded messages forever.
  useEffect(() => {
    if (!enabled || session === undefined) return
    if (Array.isArray(projected?.messages) && projected.messages.length > 0) return
    let cancelled = false
    const run = async (): Promise<void> => {
      let guard = 0
      while (!cancelled && guard++ < 120) {
        if (Array.isArray(projected?.messages) && projected.messages.length > 0) return
        const snap = session.getSnapshot()
        if (snap === undefined) { await delay(100); continue }
        if (snap.openState !== 'open') {
          if (snap.openState === 'error') return
          await delay(100)
          continue
        }
        if (snap.hasMore !== true) return
        if (snap.loadingOlder === true) { await delay(50); continue }
        await session.loadOlder()
      }
    }
    run().catch(() => {})
    return () => { cancelled = true }
  }, [enabled, sessionId, session === undefined ? 'none' : 'ready', Array.isArray(projected?.messages) && projected.messages.length > 0 ? 'have' : 'none'])

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
  }, [sessionId, messages.length, source])

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
        onMouseEnter={() => { setShow(true) }}
        onMouseLeave={() => { setShow(false) }}
        style={railStyle}
      >
        <div className={'dutl-wrap' + (show ? ' dutl-show' : '')}>
          <div className="dutl-page" ref={pageRef}>
            {messages.map((m, i) => {
              const key = anchorKeyOf(m)
              return (
                <button
                  key={m.seq}
                  type="button"
                  className={'dutl-item' + (activeIndex === i ? ' dutl-active' : '')}
                  aria-label={`${t('roleUser')}: ${m.text.slice(0, 60) || t('noText')}`}
                  aria-current={activeIndex === i ? 'location' : undefined}
                  onClick={() => { if (key !== undefined) void jumpToMessage(sessionsService, sessionId, key).catch(() => {}) }}
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
