/**
 * dsh-ui-tweaks — thinking-effort tint for the composer model seat (browser half).
 *
 * Tags every rendered thinking-effort label with its intensity band, so the
 * poster skin can paint it in a solid band color (Low green, Medium amber,
 * High blue, Max Codex-violet), and wash the hovered option row with a
 * left-to-right gradient in the same hue. Three surfaces are covered — the
 * `model · effort` trigger in `conversation.input.model`, the Effort cell
 * value in its dropdown menu root, and every option row in the menu's
 * effort pane (label span plus row button, the button carrying the band for
 * the background wash). Off / provider-Default / unrecognized names stay
 * the stock caption gray — a level we cannot place gets no color rather
 * than a wrong one; extend BAND_WORDS when a new adapter ships new names.
 *
 * - Effort levels are adapter-owned: DeepSeek advertises Off/Low/High/Max,
 *   pi-ai-backed providers offer off/minimal/low/medium/high/xhigh/max
 *   (shown capitalized), others e.g. Standard. Classification reads the
 *   rendered label text, never a fixed id vocabulary.
 * - The trigger renders model-name and effort spans in order (the chevron is
 *   an svg), so the trailing span is the effort label when present. The menu
 *   is portaled to document.body, outside the seat: each trigger's
 *   `aria-controls` names its menu element, which is how the watcher reaches
 *   it. Inside the menu, radios beside group sections are the model list
 *   (left alone); radios without sections are effort options.
 * - One MutationObserver re-tags on React repaints (model switch, effort
 *   change, session switch, menu open); writes are idempotent — an attribute
 *   is only touched when it actually changes — so the loop settles after one
 *   pass. Removed nodes take their tags with them; cleanup clears the rest.
 * - Mounted only while the neon-poster theme is active (see the effect in
 *   index.tsx): other themes have no rules for the tag and stay stock.
 * @module dsh-ui-tweaks/client/effort
 */
/** Intensity bands, each painted in its own gradient by the skin. */
export type EffortBand = 'low' | 'medium' | 'high' | 'max';
/**
 * Place a rendered effort label on the intensity scale.
 * @param name - the effort label as shown (e.g. 'High').
 * @returns its band, or null to leave the stock caption untouched.
 */
export declare function classifyEffort(name: string): EffortBand | null;
/**
 * Watch every composer model trigger (and its open dropdown menu) and keep
 * the effort band tags current.
 * @returns cleanup: stops the observer and removes all tags set here.
 */
export declare function installEffortTag(): () => void;
//# sourceMappingURL=effort.d.ts.map