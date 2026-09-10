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
/** Projection key the browser timeline reads through `useProjection`. */
export const TIMELINE_PROJECTION_KEY = 'dshChatTimeline';
/** Cap preview text so projection payloads stay compact (240 chars ≈ 3–4 lines). */
const MAX_TEXT_CHARS = 240;
/** Join the text blocks of a ContentBlock list (host-side message content). */
function textOf(content) {
    if (!Array.isArray(content))
        return '';
    let out = '';
    for (const block of content) {
        if (block !== null && typeof block === 'object') {
            const record = block;
            if (record.type === 'text' && typeof record.text === 'string')
                out += record.text;
        }
    }
    return out.trim().slice(0, MAX_TEXT_CHARS);
}
/**
 * Wire-schema shim: the projection value is plain JSON by construction, and
 * pulling the real zod dependency in just to re-validate it would be waste.
 * `parse` is the only member the registry calls.
 */
const messageIndexSchema = {
    parse: (value) => value,
};
/** The `dshChatTimeline` projection unit: fold user messages over the log. */
export const timelineProjectionDefinition = {
    key: TIMELINE_PROJECTION_KEY,
    stateSchema: messageIndexSchema,
    init: () => ({ messages: [] }),
    apply: (state, event) => {
        // Only DIRECT user-sent messages shape the timeline. Plugin- and
        // tool-injected context rides the same `user/message` event type with a
        // different `source.kind` (job completions, tool notices, cron
        // notifications, agent.inject context...) — those are context rows in the
        // conversation, not turns the user sent, so they are excluded here.
        if (event.type !== 'user/message')
            return state;
        const source = event.data.source;
        if (source === null || typeof source !== 'object' || source.kind !== 'user')
            return state;
        const text = textOf(event.data.content);
        const entry = {
            seq: event.seq,
            time: event.time,
            text,
            ...(typeof event.data.id === 'string' ? { id: event.data.id } : {}),
        };
        return { messages: [...state.messages, entry] };
    },
    wire: {
        viewSchema: messageIndexSchema,
        view: (state) => state,
    },
    stateVersion: 5,
};
/**
 * Register the projection whenever the `sessionProjections` service is
 * present. Headless assemblies without the registry stay unaffected.
 * @param ctx - plugin context owning the registration effect.
 */
export function installTimelineProjection(ctx) {
    ctx.inject(['sessionProjections'], (projectionCtx) => {
        projectionCtx.sessionProjections.register(timelineProjectionDefinition);
    });
}
//# sourceMappingURL=timeline.js.map