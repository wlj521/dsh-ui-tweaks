/**
 * dsh-ui-tweaks — task notifications (browser half).
 *
 * Watches the sessions list feed (the same store the sidebar's running flag,
 * amber interaction dot and green "done" reminder project from) and raises a
 * browser-side heads-up when a session finishes its turn or starts blocking
 * on the user — so a backgrounded tab can call you back:
 *
 * - "Finished" = a session's `running` flag drops (true → false) without an
 *   interaction taking over, or its host-tracked `completed` reminder rises
 *   (finished while not selected).
 * - "Interaction" = a session gains `pendingInteraction`
 *   ('approval' | 'plan-review' | 'question') — exactly the sidebar's
 *   amber-dot classification.
 *
 * Three independent channels, each silently degrading when unavailable:
 * - Title flash: alternates `(N) 🔔 <title>` ↔ `(N) <title>` until the page
 *   is visible and focused again, then restores the captured title. DSH may
 *   rewrite `document.title` independently; while flashing our ticks win,
 *   and on stop we restore the pre-flash capture (worst case a stale base).
 * - System notification: the Web Notifications API; permission is requested
 *   from the settings toggle's user gesture (`requestNotifyPermission`).
 *   Clicking one focuses the window and opens that session. `silent` tracks
 *   the chime channel so the two never double-beep.
 * - Chime: a tiny WebAudio two-note motif (rising = done, falling = needs
 *   you), synthesized in-process — no audio assets. Autoplay policy allows
 *   this once the user has interacted with the origin (sticky activation),
 *   which the settings-toggle clicks provide.
 *
 * Anti-spam: the first snapshot after install only arms the baseline (a page
 * load never fires a burst); events fire on transitions only; a short
 * per-session+kind cooldown absorbs reconnect re-pull flicker. Subagent child
 * rows are skipped — their parent carries the turn, and mid-turn subagent
 * completions would be noise.
 * @module dsh-ui-tweaks/client/notifier
 */

import type { ISessions, SessionId } from '@deepseek-ai/dsh-client-runtime/client'

/** Interaction kinds the host reports while a session blocks on the user. */
export type NotifyPendingKind = 'approval' | 'plan-review' | 'question'

/** Event classes the notifier can raise. */
type NotifyEventKind = 'complete' | 'interaction'

/** Localized copy snapshot the notifier needs (resolved once at install). */
export interface NotifierText {
  /** System-notification heading for completion events. */
  notifyTitleDone: string
  /** System-notification heading for interaction events. */
  notifyTitlePending: string
  /** Completion body template; `{title}` becomes the session display title. */
  bodyComplete: string
  /** Approval body template. */
  bodyApproval: string
  /** Plan-review body template. */
  bodyPlan: string
  /** Question body template. */
  bodyQuestion: string
}

/**
 * Live-read behavior switches — read through {@link TaskNotifierInput.readState}
 * on every feed tick so settings-panel flips apply without reinstalling.
 */
export interface NotifierOptions {
  /** Raise alerts only while the page is hidden or unfocused. */
  onlyWhenHidden: boolean
  /** Alert when a session finishes its turn. */
  onComplete: boolean
  /** Alert when a session starts waiting on the user. */
  onInteraction: boolean
}

/** Output channels, each independently toggleable. */
export interface NotifierChannels {
  titleFlash: boolean
  systemNotification: boolean
  sound: boolean
}

/** Install-time wiring for {@link installTaskNotifier}. */
export interface TaskNotifierInput {
  /** The client sessions service whose list feed carries the watch states. */
  sessionsService: ISessions
  /** Localized copy snapshot used across the notifier's lifetime. */
  text: NotifierText
  /** Fresh behavior switches + channel toggles, read on every tick. */
  readState(): { options: NotifierOptions; channels: NotifierChannels }
}

/** Per-session state the transition detector compares against. */
interface WatchState {
  running: boolean
  pending: NotifyPendingKind | undefined
  completed: boolean
}

/** Same event kind for one session never repeats inside this window. */
const COOLDOWN_MS = 2000
/**
 * A background session's finish usually announces via the running-drop; the
 * host's green `completed` reminder often lands a re-pull later — treat it as
 * the SAME completion inside this window instead of re-toasting it.
 */
const COMPLETE_RENOTIFY_MS = 30000
/** Title-flash blink period. */
const FLASH_INTERVAL_MS = 900

/**
 * `NotificationOptions` plus Chrome's `renotify` (re-alert on tag replace).
 * The option is real and supported at runtime, but this project's DOM lib
 * predates its type declaration, so it is declared locally.
 */
interface RealertableNotificationOptions extends NotificationOptions {
  renotify?: boolean
}

/** Replace the `{title}` placeholder (split/join — no regex escaping worries). */
function fill(template: string, title: string): string {
  return template.split('{title}').join(title)
}

/**
 * Ask the browser for desktop-notification permission. Must run inside a user
 * gesture (the settings toggle's click) to avoid a denied or ignored prompt;
 * repeated calls are cheap no-ops once decided.
 */
export function requestNotifyPermission(): void {
  try {
    if (typeof Notification === 'undefined') return
    if (Notification.permission === 'default') void Notification.requestPermission()
  } catch {
    // Notifications unsupported — the other channels carry on.
  }
}

/**
 * Forced title-flash preview for the settings panel's 测试 button: the real
 * flash auto-clears the moment its page is visible AND focused — which is
 * exactly the tester's situation, so a plain preview would heal instantly and
 * show nothing. Instead this blinks unconditionally for a few seconds, then
 * restores whatever title was current at click time.
 */
let previewBlinkTimer: number | undefined
let previewStopTimer: number | undefined

export function previewTitleFlash(durationMs = 6000): void {
  // Restart cleanly on rapid re-clicks.
  if (previewBlinkTimer !== undefined) window.clearInterval(previewBlinkTimer)
  if (previewStopTimer !== undefined) window.clearTimeout(previewStopTimer)
  const base = document.title
  let tick = false
  const blink = (): void => {
    tick = !tick
    document.title = tick ? `(1) 🔔 ${base}` : `(1) ${base}`
  }
  blink()
  previewBlinkTimer = window.setInterval(blink, FLASH_INTERVAL_MS)
  previewStopTimer = window.setTimeout(() => {
    if (previewBlinkTimer !== undefined) {
      window.clearInterval(previewBlinkTimer)
      previewBlinkTimer = undefined
    }
    previewStopTimer = undefined
    document.title = base
  }, durationMs)
}

/**
 * One-shot self-test for the settings panel's 测试 button: previews every
 * enabled channel — a forced ~6s title-flash blink (the real one would clear
 * instantly on a focused page), the falling (needs-you) chime, and, when
 * permission is already granted, one sample system notification.
 */
export function previewAlerts(channels: NotifierChannels, text: NotifierText): void {
  requestNotifyPermission()
  if (channels.titleFlash) previewTitleFlash()
  if (channels.sound) playChime('down')
  if (!channels.systemNotification || typeof Notification === 'undefined') return
  if (Notification.permission !== 'granted') return
  try {
    const sample = fill(text.bodyComplete, 'dsh-ui-tweaks')
    new Notification(text.notifyTitleDone, { body: sample, tag: 'dsh-ui-tweaks:preview', silent: true })
  } catch {
    // Construction can throw on some platforms — degrade quietly.
  }
}

// ---------------------------------------------------------------------------
// Chime — WebAudio two-note motif, synthesized, no assets.
// ---------------------------------------------------------------------------

let audioCtx: AudioContext | undefined

function playChime(shape: 'up' | 'down'): void {
  try {
    audioCtx ??= new AudioContext()
    const ctx = audioCtx
    // Sticky activation from earlier clicks usually suffices; resume is best effort.
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {})
    const now = ctx.currentTime
    const notes = shape === 'up' ? [880, 1318.51] : [1174.66, 783.99]
    // 240ms between notes with a long decay each: tight spacing read as ONE
    // blip in listening tests; this wide a gap keeps the two tones distinct
    // (rising = done, falling = needs you).
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      const t0 = now + i * 0.24
      gain.gain.setValueAtTime(0.0001, t0)
      gain.gain.exponentialRampToValueAtTime(0.22, t0 + 0.03)
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.2)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(t0)
      osc.stop(t0 + 0.24)
    })
  } catch {
    // Audio unavailable (autoplay policy, missing AudioContext) — stay silent.
  }
}

// ---------------------------------------------------------------------------
// Installer.
// ---------------------------------------------------------------------------

/**
 * Install the task notifier against the sessions list feed.
 * @returns disposer — unsubscribes, restores the tab title and tears the channels down.
 */
export function installTaskNotifier(input: TaskNotifierInput): () => void {
  const { sessionsService, text, readState } = input
  const list = sessionsService.list

  // --- detector state ------------------------------------------------------
  const watch = new Map<SessionId, WatchState>()
  const lastFired = new Map<string, number>()

  // --- title flash ---------------------------------------------------------
  let originalTitle: string | null = null
  let flashTimer: number | undefined
  let flashTick = false
  let unread = 0

  const visibleAndFocused = (): boolean => document.visibilityState === 'visible' && document.hasFocus()

  const startTitleFlash = (): void => {
    if (flashTimer !== undefined) return
    originalTitle = document.title
    flashTimer = window.setInterval(() => {
      flashTick = !flashTick
      const base = originalTitle ?? ''
      document.title = flashTick ? `(${unread}) 🔔 ${base}` : `(${unread}) ${base}`
    }, FLASH_INTERVAL_MS)
  }

  const stopTitleFlash = (): void => {
    if (flashTimer !== undefined) {
      window.clearInterval(flashTimer)
      flashTimer = undefined
    }
    if (originalTitle !== null) document.title = originalTitle
    originalTitle = null
    unread = 0
  }

  /** Coming back to a visible, focused page acknowledges everything. */
  const settleIfBack = (): void => {
    if (visibleAndFocused()) stopTitleFlash()
  }
  const onVisibilityChange = (): void => {
    settleIfBack()
  }
  window.addEventListener('focus', settleIfBack)
  document.addEventListener('visibilitychange', onVisibilityChange)

  // --- system notification -------------------------------------------------
  const fireSystemNotification = (
    kind: NotifyEventKind,
    sessionId: SessionId,
    heading: string,
    body: string,
    chimeOn: boolean,
  ): void => {
    if (typeof Notification === 'undefined') return
    if (Notification.permission !== 'granted') return
    try {
      // `silent` mirrors the chime channel: our motif is THE sound, so mute
      // the OS bark while it will play; otherwise let the platform ring.
      // `renotify` forces a fresh banner when this tag REPLACES an existing
      // toast — without it Chrome swaps the old toast silently and Windows
      // collapses it into the notification center.
      const options: RealertableNotificationOptions = {
        body,
        tag: `dsh-ui-tweaks:${sessionId}:${kind}`,
        silent: chimeOn,
        renotify: true,
      }
      const n = new Notification(heading, options)
      n.onclick = (): void => {
        try { window.focus() } catch { /* ignore */ }
        try { sessionsService.open(sessionId) } catch { /* session already gone — focus alone is fine */ }
        n.close()
      }
    } catch {
      // Construction can throw on some platforms — degrade quietly.
    }
  }

  // --- delivery ------------------------------------------------------------
  const deliver = (
    sessionId: SessionId,
    displayTitle: string,
    kind: NotifyEventKind,
    pending: NotifyPendingKind | undefined,
    channels: NotifierChannels,
    now: number,
  ): void => {
    const cooldownKey = `${sessionId}:${kind}`
    const last = lastFired.get(cooldownKey)
    if (last !== undefined && now - last < COOLDOWN_MS) return
    lastFired.set(cooldownKey, now)

    unread += 1
    if (channels.titleFlash) startTitleFlash()
    if (!channels.systemNotification && !channels.sound) return

    const heading = kind === 'complete' ? text.notifyTitleDone : text.notifyTitlePending
    let body = text.bodyComplete
    if (kind === 'interaction') {
      body = pending === 'approval'
        ? text.bodyApproval
        : pending === 'plan-review'
          ? text.bodyPlan
          : text.bodyQuestion
    }
    fireSystemNotification(kind, sessionId, heading, fill(body, displayTitle), channels.sound)
    if (channels.sound) playChime(kind === 'complete' ? 'up' : 'down')
  }

  // --- baseline arming -----------------------------------------------------
  /** Seed the watch map without firing: fresh installs and reloads stay quiet. */
  const armBaseline = (): void => {
    watch.clear()
    for (const row of Object.values(list.getSnapshot().byId)) {
      if (row.parentId !== undefined || row.blank) continue
      watch.set(row.id, { running: row.running, pending: row.pendingInteraction, completed: row.completed === true })
    }
  }

  // --- feed tick -----------------------------------------------------------
  const check = (): void => {
    const { options, channels } = readState()
    const deliverable = !options.onlyWhenHidden || !visibleAndFocused()
    const now = Date.now()
    const snap = list.getSnapshot()
    const seen = new Set<SessionId>()

    for (const row of Object.values(snap.byId)) {
      if (row.parentId !== undefined || row.blank) continue
      seen.add(row.id)
      const prev = watch.get(row.id)
      watch.set(row.id, { running: row.running, pending: row.pendingInteraction, completed: row.completed === true })
      if (prev === undefined) continue

      // Interaction outranks completion: a turn ending ON a question must
      // announce the question, not a completion.
      if (prev.pending === undefined && row.pendingInteraction !== undefined) {
        if (options.onInteraction && deliverable) {
          deliver(row.id, row.displayTitle, 'interaction', row.pendingInteraction, channels, now)
        }
        continue
      }

      const finished = prev.running && !row.running && row.pendingInteraction === undefined
      const completedReminder = !prev.completed && row.completed === true
      if (finished || completedReminder) {
        // The green `completed` reminder often arrives a re-pull AFTER the
        // running-drop already announced the same finish — inside the
        // re-notify window it is a duplicate, not a new completion.
        let shouldFire = finished
        if (!shouldFire) {
          const lastComplete = lastFired.get(`${row.id}:complete`)
          shouldFire = lastComplete === undefined || now - lastComplete >= COMPLETE_RENOTIFY_MS
        }
        if (shouldFire && options.onComplete && deliverable) {
          deliver(row.id, row.displayTitle, 'complete', undefined, channels, now)
        }
      }
    }

    // Forget removed sessions so a re-added id arms fresh instead of comparing
    // against stale pre-removal state.
    for (const id of watch.keys()) {
      if (!seen.has(id)) watch.delete(id)
    }
  }

  armBaseline()
  const disposeFeed = list.subscribe(check)

  return () => {
    disposeFeed()
    stopTitleFlash()
    window.removeEventListener('focus', settleIfBack)
    document.removeEventListener('visibilitychange', onVisibilityChange)
    watch.clear()
    lastFired.clear()
    if (audioCtx !== undefined) {
      void audioCtx.close().catch(() => {})
      audioCtx = undefined
    }
  }
}
