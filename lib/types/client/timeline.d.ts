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
import type { ISessions, UseProjection } from '@deepseek-ai/dsh-api-session-controller/client';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import type { SettingsClient } from './index.tsx';
declare module '@deepseek-ai/dsh-session-projection/types' {
    interface SessionProjectionMap {
        /** Enumeration of direct user-sent messages, for the timeline rail. */
        dshChatTimeline: {
            messages: Array<{
                seq: number;
                time: number;
                text: string;
                id?: string;
            }>;
        };
    }
}
/** Projection key matching the host half (src/timeline.ts). */
export declare const TIMELINE_PROJECTION_KEY = "dshChatTimeline";
/** Locale keys the rail reads off the `ui-tweaks` dictionary. */
type RailLabelKey = 'railLabel' | 'roleUser' | 'noText';
type Translate = (key: RailLabelKey) => string;
export declare const TIMELINE_CSS = "\n.dutl-nav{-webkit-user-select:none;-moz-user-select:none;-ms-user-select:none;user-select:none;z-index:100;display:flex;position:fixed;align-items:center;justify-content:flex-end;pointer-events:auto}\n.dutl-wrap{position:relative;z-index:2;border-radius:16px;width:24px;max-width:240px;transition:width .28s cubic-bezier(0.32,0.72,0,1),background-color .22s ease,box-shadow .22s ease,border-color .22s ease;display:flex;flex-direction:column;overflow:hidden;box-sizing:border-box;border:1px solid transparent;background:transparent}\n.dutl-wrap.dutl-show{width:240px;background:color-mix(in srgb,var(--dsw-alias-bg-layer-2) 88%,transparent);-webkit-backdrop-filter:blur(18px) saturate(1.35);backdrop-filter:blur(18px) saturate(1.35);border:1px solid var(--dsw-alias-border-l1);box-shadow:var(--dsw-shadow-lv1),0 0 0 1px color-mix(in srgb,var(--dsw-alias-border-l1) 55%,transparent)}\n.dutl-page{max-height:340px;padding:6px 0;box-sizing:border-box;overscroll-behavior:contain;display:flex;flex-direction:column;align-items:stretch;width:100%;overflow:hidden}\n.dutl-wrap.dutl-show .dutl-page{overflow-y:auto;overflow-x:hidden;scrollbar-width:thin;scrollbar-color:color-mix(in srgb,var(--dsw-alias-label-tertiary) 35%,transparent) transparent}\n.dutl-page::-webkit-scrollbar{width:5px}\n.dutl-page::-webkit-scrollbar-track{background:transparent}\n.dutl-page::-webkit-scrollbar-thumb{background:color-mix(in srgb,var(--dsw-alias-label-tertiary) 35%,transparent);border-radius:4px}\n.dutl-page::-webkit-scrollbar-thumb:hover{background:color-mix(in srgb,var(--dsw-alias-label-tertiary) 60%,transparent)}\n.dutl-item{flex-shrink:0;cursor:pointer;height:30px;min-height:30px;width:100%;padding:0 2px 0 12px;box-sizing:border-box;display:flex;align-items:center;justify-content:flex-end;background:none;border:none;font:inherit;text-align:right;border-radius:10px;transition:color .18s ease,background-color .18s ease;color:var(--dsw-alias-label-secondary)}\n.dutl-wrap.dutl-show .dutl-item{padding:0 8px 0 12px}\n.dutl-item:hover{color:var(--dsw-alias-label-primary);background:color-mix(in srgb,var(--dsw-alias-interactive-bg-hover) 72%,transparent)}\n.dutl-item.dutl-active{color:var(--dsw-alias-state-business-primary)}\n.dutl-item.dutl-active:hover{background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 9%,transparent)}\n.dutl-title{font-size:12.5px;line-height:20px;text-overflow:ellipsis;white-space:nowrap;opacity:0;margin-right:10px;flex:1;min-width:0;text-align:right;overflow:hidden;color:inherit;transform:translateX(5px);transition:opacity .18s ease,color .18s ease,transform .22s cubic-bezier(0.32,0.72,0,1)}\n.dutl-title.dutl-show{opacity:1;transform:translateX(0)}\n.dutl-item.dutl-active .dutl-title{color:inherit;font-weight:500}\n.dutl-ind{flex-shrink:0;width:22px;height:22px;display:flex;justify-content:center;align-items:center}\n.dutl-line{position:relative;background-color:color-mix(in srgb,var(--dsw-alias-label-tertiary) 55%,transparent);border-radius:3px;flex-shrink:0;width:8px;height:2px;transition:background-color .2s ease,width .24s cubic-bezier(0.34,1.56,0.64,1),height .24s cubic-bezier(0.34,1.56,0.64,1),box-shadow .2s ease}\n.dutl-item:hover .dutl-line{background-color:var(--dsw-alias-state-business-primary);width:18px;height:3px;box-shadow:0 0 8px color-mix(in srgb,var(--dsw-alias-state-business-primary) 55%,transparent);animation:dutl-pop .32s cubic-bezier(0.34,1.56,0.64,1)}\n.dutl-item.dutl-active .dutl-line{background-color:var(--dsw-alias-state-business-primary);width:12px;height:3px;box-shadow:0 0 6px color-mix(in srgb,var(--dsw-alias-state-business-primary) 38%,transparent)}\n.dutl-item.dutl-active:hover .dutl-line{width:18px}\n@keyframes dutl-pop{0%{transform:scaleY(1)}45%{transform:scaleY(1.55)}100%{transform:scaleY(1)}}\n.dutl-bubble{position:fixed;z-index:200;max-width:280px;max-height:230px;box-sizing:border-box;padding:10px 12px;border-radius:12px;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);box-shadow:var(--dsw-shadow-lv1);color:var(--dsw-alias-label-primary);pointer-events:none;display:flex;flex-direction:column;gap:5px;transform:translateY(-50%);animation:dutl-bubble-in .16s cubic-bezier(0.32,0.72,0,1)}\n.dutl-bubble::after{content:\"\";position:absolute;right:-5px;top:50%;width:8px;height:8px;margin-top:-4px;background:inherit;border-right:1px solid var(--dsw-alias-border-l1);border-top:1px solid var(--dsw-alias-border-l1);border-top-right-radius:2px;transform:rotate(45deg)}\n.dutl-bubble-head{display:flex;align-items:center;gap:6px;font-size:11px;font-weight:500;color:var(--dsw-alias-label-tertiary)}\n.dutl-bubble-user{display:inline-flex;align-items:center;gap:5px}\n.dutl-bubble-dot{width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-state-business-primary);box-shadow:0 0 5px color-mix(in srgb,var(--dsw-alias-state-business-primary) 60%,transparent)}\n.dutl-bubble-time{margin-left:auto;font-variant-numeric:tabular-nums;font-weight:400}\n.dutl-bubble-text{font-size:12.5px;line-height:1.55;white-space:pre-wrap;word-break:break-word;overflow-y:auto;max-height:150px;color:var(--dsw-alias-label-primary)}\n.dutl-bubble-text::-webkit-scrollbar{width:4px}\n.dutl-bubble-text::-webkit-scrollbar-track{background:transparent}\n.dutl-bubble-text::-webkit-scrollbar-thumb{background:color-mix(in srgb,var(--dsw-alias-label-tertiary) 35%,transparent);border-radius:4px}\n@keyframes dutl-bubble-in{from{opacity:0;transform:translateY(-50%) translateX(6px)}to{opacity:1;transform:translateY(-50%) translateX(0)}}\n@media (prefers-reduced-motion:reduce){.dutl-wrap,.dutl-title,.dutl-line,.dutl-bubble{transition:none;animation:none}}\n";
/** Install the rail stylesheet once (idempotent); returns the disposer. */
export declare function installTimelineStyles(): () => void;
export interface TimelineRailProps {
    /** Framework seat (PropsRuntime): key-addressed projection reader. */
    useProjection: UseProjection;
    /** Framework seat (PropsRuntime): current session id. */
    sessionId: SessionId | undefined;
    /** Injected: the client sessions service (live Session handles). */
    sessionsService: ISessions;
    /** Injected: the ui-tweaks settings store (reads `timelineStyle`). */
    controller: SettingsClient;
    /** Locale-bound translator for the rail labels. */
    t: Translate;
}
export declare function TimelineRail({ useProjection, sessionId, sessionsService, controller, t }: TimelineRailProps): import("react").ReactPortal | null;
export {};
//# sourceMappingURL=timeline.d.ts.map