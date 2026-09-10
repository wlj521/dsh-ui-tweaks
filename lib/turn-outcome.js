/**
 * dsh-ui-tweaks — turn outcome projection (host half).
 *
 * Registers the `dshTurnOutcome` session projection unit: the outcome of the
 * session's most recent agent turn, folded from the log's `turn/end` events.
 * The task notifier reads it off each sessions-list row (`projectionValues`)
 * so it can announce WHY a turn ended — completed vs user-aborted vs failed —
 * instead of announcing every running-drop as a plain finish.
 *
 * Whole-value rule: every `turn/end` replaces the previous value outright
 * (last-wins), and `null` means no completed turn yet. Error turns keep a
 * truncated copy of the structured failure message for notification bodies.
 *
 * `TurnEndReason` is merge-extensible upstream; unknown future kinds flow
 * through as their literal kind string and the client falls back to a generic
 * finish announcement.
 * @module dsh-ui-tweaks/turn-outcome
 */
/** Projection key the browser notifier reads through list-row `projectionValues`. */
export const TURN_OUTCOME_PROJECTION_KEY = 'dshTurnOutcome';
/** Cap the embedded error message so projection payloads stay small. */
const MAX_ERROR_CHARS = 160;
/**
 * Wire-schema shim: the projection value is plain JSON by construction, and
 * pulling the real zod dependency in just to re-validate it would be waste.
 */
const outcomeSchema = {
    parse: (value) => value,
};
/** The `dshTurnOutcome` projection unit: last-wins fold over `turn/end`. */
export const turnOutcomeProjectionDefinition = {
    key: TURN_OUTCOME_PROJECTION_KEY,
    stateSchema: outcomeSchema,
    init: () => null,
    apply: (_state, event) => {
        if (event.type !== 'turn/end')
            return _state;
        const { reason } = event.data;
        const value = {
            kind: reason.kind,
            time: event.time,
            turn: event.data.turn,
            ...(reason.kind === 'error' && reason.error.message !== ''
                ? { errorMessage: reason.error.message.slice(0, MAX_ERROR_CHARS) }
                : {}),
        };
        return value;
    },
    wire: {
        viewSchema: outcomeSchema,
        view: (state) => state,
    },
    stateVersion: 1,
};
/**
 * Register the projection whenever the `sessionProjections` service is
 * present. Headless assemblies without the registry stay unaffected.
 * @param ctx - plugin context owning the registration effect.
 */
export function installTurnOutcomeProjection(ctx) {
    ctx.inject(['sessionProjections'], (projectionCtx) => {
        projectionCtx.sessionProjections.register(turnOutcomeProjectionDefinition);
    });
}
//# sourceMappingURL=turn-outcome.js.map