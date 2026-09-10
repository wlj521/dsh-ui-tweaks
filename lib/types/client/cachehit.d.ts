/**
 * dsh-ui-tweaks — precise cache-hit readout (browser half).
 *
 * Rewrites the cache-hit figure in the composer stats line under the input
 * box ("缓存命中 96%" / "Cache hit 96%") to two decimal places ("96.35%").
 * DSH rounds the share before display (adding decimals only to avoid a false
 * 100%); the exact figure needs the raw token buckets, which this seat reads
 * through the framework's per-session projection hook
 * (`useProjection('tokenUsage')`) — the same durable whole-log totals the
 * stock number is computed from.
 *
 * - Mounted in `conversation.composer.dock` (the band under the composer card
 *   that hosts the shipped stats line), registered only while the
 *   `preciseCacheHitEnabled` toggle is on — off costs nothing. The entry
 *   renders nothing itself: it is a live reader that patches the stock text
 *   in place, so layout, truncation and tooltip behavior stay DSH's own.
 * - Since the stats-line redesign the figure is no longer wrapped in its own
 *   span: the usage pill renders it as a bare text node after a `·` separator
 *   inside the pill label (e.g. `105 tok·Cache hit 90%`), with the full
 *   reading mirrored on the pill button's `aria-label`, and the click-open
 *   usage dialog (portaled to `document.body`) repeats the figure in a
 *   `dl[data-session-stats-usage]` row. All three are patched; the per-turn
 *   `dl[data-turn-usage-details]` dialog is deliberately left alone — it uses
 *   its own per-turn denominator, not the session totals read here.
 * - A MutationObserver re-applies the precise figure whenever React repaints
 *   anything (token updates, pill churn, dialog open); writes are idempotent
 *   — a rewrite only happens when the text actually differs — so the loop
 *   settles after one pass. Toggling off restores the original texts.
 * @module dsh-ui-tweaks/client/cachehit
 */
import type { UseProjection } from '@deepseek-ai/dsh-api-session-controller/client';
export interface PreciseCacheHitEntryProps {
    /** Framework seat (PropsRuntime): key-addressed per-session projection reader. */
    useProjection: UseProjection;
}
/** Session-scoped composer-dock seat that keeps the stock cache-hit figure at two decimals. */
export declare function PreciseCacheHitEntry({ useProjection }: PreciseCacheHitEntryProps): null;
//# sourceMappingURL=cachehit.d.ts.map