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
import type { Context } from '@deepseek-ai/cordis';
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection';
/** Projection key the browser notifier reads through list-row `projectionValues`. */
export declare const TURN_OUTCOME_PROJECTION_KEY = "dshTurnOutcome";
/** The stock `TurnEndReason` kinds (the map is merge-extensible upstream). */
export type TurnOutcomeKind = 'completed' | 'aborted' | 'blocked' | 'error' | 'max-tokens' | 'interrupted';
/** Whole projection value: why the latest turn ended. */
export interface TurnOutcomeValue {
    kind: TurnOutcomeKind;
    /** Unix epoch ms of the `turn/end` event. */
    time: number;
    /** Turn number carried by the same event. */
    turn?: number;
    /** Truncated human-readable failure text; present only on `error` outcomes. */
    errorMessage?: string;
}
declare module '@deepseek-ai/dsh-session-projection/types' {
    interface SessionProjectionMap {
        /** Outcome of the session's most recent agent turn; null before the first one ends. */
        dshTurnOutcome: TurnOutcomeValue | null;
    }
    interface SessionProjectionStateMap {
        /** Host fold state for the turn-outcome key (same shape as the wire value). */
        dshTurnOutcome: TurnOutcomeValue | null;
    }
}
/** Registration-ready unit type with the client-visible `wire` block narrowed in. */
type TurnOutcomeProjectionUnit = Omit<ProjectionDefinition<'dshTurnOutcome', TurnOutcomeValue | null>, 'wire'> & {
    wire: NonNullable<ProjectionDefinition<'dshTurnOutcome', TurnOutcomeValue | null>['wire']>;
};
/** The `dshTurnOutcome` projection unit: last-wins fold over `turn/end`. */
export declare const turnOutcomeProjectionDefinition: TurnOutcomeProjectionUnit;
/**
 * Register the projection whenever the `sessionProjections` service is
 * present. Headless assemblies without the registry stay unaffected.
 * @param ctx - plugin context owning the registration effect.
 */
export declare function installTurnOutcomeProjection(ctx: Context): void;
export {};
//# sourceMappingURL=turn-outcome.d.ts.map