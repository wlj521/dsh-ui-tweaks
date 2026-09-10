/**
 * dsh-ui-tweaks — conversation timeline projection (host half).
 *
 * Registers the `dshChatTimeline` session projection unit: a complete,
 * durable enumeration of the session's USER-sent messages. The browser
 * timeline rail only needs user turns; assistant replies, tool results, and
 * plugin/tool-injected context would crowd the rail, so they are excluded —
 * exactly as the chat view's node assembler classifies direct user input.
 *
 * Each entry carries `seq` (ordering), `time`, a short preview text, and the
 * durable message `id` the browser uses to reconstruct the chat node's
 * `data-chat-anchor-key` for jumping.
 *
 * Compaction deliberately does NOT drop user messages: dsh renders a
 * compaction marker row at the checkpoint position but keeps the transcript
 * above it intact, so every user-sent message stays visible in the
 * conversation view — and on the timeline.
 *
 * Architecture reference: asukasec/dsh-message-preview and
 * jjxjjjjiik-bot/dsh-chat-timeline (both MIT).
 * @module dsh-ui-tweaks/timeline
 */
import type { Context } from '@deepseek-ai/cordis';
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection';
/** Projection key the browser timeline reads through `useProjection`. */
export declare const TIMELINE_PROJECTION_KEY = "dshChatTimeline";
declare module '@deepseek-ai/dsh-session-projection/types' {
    interface SessionProjectionMap {
        /** Enumeration of direct user-sent messages, for the timeline rail. */
        dshChatTimeline: TimelineProjectionValue;
    }
    interface SessionProjectionStateMap {
        /** Host fold state for the timeline key (same shape as the wire value). */
        dshChatTimeline: TimelineProjectionValue;
    }
}
/** One timeline entry: ordering, time, short preview, and jump identity. */
export interface TimelineEntry {
    seq: number;
    /** Unix epoch ms of the user message. */
    time: number;
    /** Trimmed preview text (<= 80 chars); may be empty for attachment-only turns. */
    text: string;
    /** Durable message id used to rebuild `data-chat-anchor-key`. */
    id?: string;
}
/** Whole projection value for the timeline key. */
export interface TimelineProjectionValue {
    messages: TimelineEntry[];
}
/**
 * Registration-ready unit type: the client-visible `register` overload demands
 * a present `wire` block, so narrow the optional field away up front.
 */
type TimelineProjectionUnit = Omit<ProjectionDefinition<'dshChatTimeline', TimelineProjectionValue>, 'wire'> & {
    wire: NonNullable<ProjectionDefinition<'dshChatTimeline', TimelineProjectionValue>['wire']>;
};
/** The `dshChatTimeline` projection unit: fold user messages over the log. */
export declare const timelineProjectionDefinition: TimelineProjectionUnit;
/**
 * Register the projection whenever the `sessionProjections` service is
 * present. Headless assemblies without the registry stay unaffected.
 * @param ctx - plugin context owning the registration effect.
 */
export declare function installTimelineProjection(ctx: Context): void;
export {};
//# sourceMappingURL=timeline.d.ts.map