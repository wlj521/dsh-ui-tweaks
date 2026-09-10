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
 *   (finished while not selected). The host `dshTurnOutcome` session
 *   projection (`src/turn-outcome.ts`, folded from `turn/end` reasons) says
 *   WHY it finished, so the copy distinguishes a clean completion from a
 *   user abort and from a failed request (with the error text); when the
 *   projection is missing or stale, falls back to a plain-finish announce.
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
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
/** Client-side view of the host `dshTurnOutcome` fold (see src/turn-outcome.ts). */
interface TurnOutcomeSnapshot {
    /** Literal `TurnEndReason` kind; unknown merged variants stay strings. */
    kind: string;
    /** Unix epoch ms of the `turn/end` event. */
    time: number;
    /** Truncated failure text; present only on error outcomes. */
    errorMessage?: string;
}
declare module '@deepseek-ai/dsh-session-projection/types' {
    interface SessionProjectionMap {
        dshTurnOutcome: TurnOutcomeSnapshot | null;
    }
}
/** Interaction kinds the host reports while a session blocks on the user. */
export type NotifyPendingKind = 'approval' | 'plan-review' | 'question';
/** Localized copy snapshot the notifier needs (resolved once at install). */
export interface NotifierText {
    /** System-notification heading for completion events. */
    notifyTitleDone: string;
    /** System-notification heading for user-interrupted turns. */
    notifyTitleAborted: string;
    /** System-notification heading for failed requests. */
    notifyTitleFailed: string;
    /** System-notification heading for interaction events. */
    notifyTitlePending: string;
    /** Completion body template; `{title}` becomes the session display title. */
    bodyComplete: string;
    /** Interruption body template. */
    bodyAborted: string;
    /** Failure body template; `{error}` becomes the truncated failure message. */
    bodyFailed: string;
    /** Approval body template. */
    bodyApproval: string;
    /** Plan-review body template. */
    bodyPlan: string;
    /** Question body template. */
    bodyQuestion: string;
}
/**
 * Live-read behavior switches — read through {@link TaskNotifierInput.readState}
 * on every feed tick so settings-panel flips apply without reinstalling.
 */
export interface NotifierOptions {
    /** Raise alerts only while the page is hidden or unfocused. */
    onlyWhenHidden: boolean;
    /** Alert when a session finishes its turn. */
    onComplete: boolean;
    /** Alert when a session starts waiting on the user. */
    onInteraction: boolean;
}
/** Output channels, each independently toggleable. */
export interface NotifierChannels {
    titleFlash: boolean;
    systemNotification: boolean;
    sound: boolean;
}
/** Install-time wiring for {@link installTaskNotifier}. */
export interface TaskNotifierInput {
    /** The client sessions service whose list feed carries the watch states. */
    sessionsService: ISessions;
    /** Localized copy snapshot used across the notifier's lifetime. */
    text: NotifierText;
    /** Fresh behavior switches + channel toggles, read on every tick. */
    readState(): {
        options: NotifierOptions;
        channels: NotifierChannels;
    };
    /** Per-session pending-user-interaction map (alpha.2 `useSessionPendingInteraction` source). */
    pendingInteractions: {
        getSnapshot(): ReadonlyMap<SessionId, {
            kind: string;
        }>;
        subscribe(listener: () => void): () => void;
    };
}
/**
 * Ask the browser for desktop-notification permission. Must run inside a user
 * gesture (the settings toggle's click) to avoid a denied or ignored prompt;
 * repeated calls are cheap no-ops once decided.
 */
export declare function requestNotifyPermission(): void;
export declare function previewTitleFlash(durationMs?: number): void;
/**
 * One-shot self-test for the settings panel's 测试 button: previews every
 * enabled channel — a forced ~6s title-flash blink (the real one would clear
 * instantly on a focused page), the falling (needs-you) chime, and, when
 * permission is already granted, one sample system notification.
 */
export declare function previewAlerts(channels: NotifierChannels, text: NotifierText): void;
/**
 * Install the task notifier against the sessions list feed.
 * @returns disposer — unsubscribes, restores the tab title and tears the channels down.
 */
export declare function installTaskNotifier(input: TaskNotifierInput): () => void;
export {};
//# sourceMappingURL=notifier.d.ts.map