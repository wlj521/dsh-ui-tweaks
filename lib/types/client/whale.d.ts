/**
 * dsh-ui-tweaks — whale working indicator (browser half).
 *
 * A little brand whale (the sidebar's FishLogo mark) perched on the composer
 * card's top-right corner over drifting blue waves — Claude Desktop's little
 * crab, but a whale — resident the whole time the feature is on. Idle: the
 * whale keeps its original colour and floats still on the waves; hovering or
 * clicking it swims it too (easter egg). Working: it swims and breathes
 * between its original colour and the waves' blue until the model finishes.
 *
 * - Mounted in `conversation.input.dock` (the full-width row stacked by the
 *   composer column right above the card), registered only while the
 *   `whaleIndicatorEnabled` toggle is on — off costs nothing. The dock row is
 *   WIDER than the card (the card is capped at
 *   `--dsh-composer-card-max-width` and centered with
 *   `--dsh-composer-side-clearance` side padding by the InputBar root), so
 *   the row replicates that exact geometry — same max-width, centered, same
 *   side padding — before right-aligning; a 6px `translateY` then straddles
 *   the card's top edge. The extra 14px right inset centers the whale over
 *   the send button (34px round button, 8px tool-row padding → its center
 *   sits 25px from the card's right edge; the 22px whale's right edge at
 *   14px puts its center at 25px).
 * - "Working" = the current session's `running` flag on the sessions list
 *   feed, OR the input machine's claimed/submitting phases (the window
 *   between pressing Enter and the agent actually starting to run).
 * - The whale geometry is the stock FishLogo path embedded as a constant, so
 *   the indicator never depends on DOM timing; at mount we still try to lift
 *   a fresher path from the live sidebar brand mark (`[class*="brandMark"]`)
 *   so a DSH logo update is followed without a plugin release.
 * @module dsh-ui-tweaks/client/whale
 */
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
export declare const WHALE_CSS = "\n.duwi-row{box-sizing:border-box;width:100%;max-width:calc(var(--dsh-composer-card-max-width) + 2 * var(--dsh-composer-side-clearance, 0px));margin:0 auto;padding:0 calc(var(--dsh-composer-side-clearance, 0px) + 14px) 0 var(--dsh-composer-side-clearance, 0px);display:flex;align-items:flex-end;justify-content:flex-end;height:27px;pointer-events:none;-webkit-user-select:none;-moz-user-select:none;-ms-user-select:none;user-select:none}\n.duwi-stack{display:flex;flex-direction:column;align-items:center;transform:translateY(6px)}\n.duwi-whale{display:block;color:var(--dsw-alias-label-primary);transform-origin:50% 60%;pointer-events:auto;cursor:pointer}\n.duwi-row.duwi-swim .duwi-whale{animation:duwi-swim 1.9s ease-in-out infinite,duwi-breathe 1.9s ease-in-out infinite}\n.duwi-whale:hover{animation:duwi-swim 1.9s ease-in-out infinite}\n.duwi-waves{display:block;width:26px;height:9px;margin-top:-3px;overflow:hidden}\n.duwi-wave-back{stroke:#3d8bfd;opacity:.35}\n.duwi-wave-front{stroke:#3d8bfd;opacity:.8}\n.duwi-wave-front,.duwi-wave-back{animation:duwi-drift-front 1.9s linear infinite}\n.duwi-wave-back{animation-duration:3.4s;animation-direction:reverse}\n@keyframes duwi-swim{\n0%,100%{transform:translateY(0) rotate(-4deg)}\n50%{transform:translateY(-3.5px) rotate(4deg)}\n}\n@keyframes duwi-breathe{\n0%,100%{color:var(--dsw-alias-label-primary)}\n50%{color:#3d8bfd}\n}\n@keyframes duwi-drift-front{\nfrom{transform:translateX(0)}\nto{transform:translateX(-8px)}\n}\n@media (prefers-reduced-motion:reduce){\n.duwi-row.duwi-swim .duwi-whale,.duwi-whale:hover{animation:none}\n.duwi-wave-front,.duwi-wave-back{animation:none}\n}\n";
/** Idempotent installer for the indicator styles (same pattern as the other features). */
export declare function installWhaleStyles(): () => void;
/**
 * Structural slice of the framework `InputState` (not re-exported by the
 * package's client entry) — exactly the fields the indicator reads off the
 * dock's owner share.
 */
interface InputPhaseSnapshot {
    phase: 'plain' | 'adjudicating' | 'claimed' | 'submitting';
}
export interface WhaleIndicatorProps {
    /** Framework seat (PropsRuntime): current session id. */
    sessionId: SessionId | undefined;
    /** Owner share (InputZone): live input-machine snapshot — covers the send → run window. */
    input: InputPhaseSnapshot;
    /** Injected: the client sessions service (list feed carrying `running`). */
    sessionsService: ISessions;
}
export declare function WhaleIndicator({ sessionId, input, sessionsService }: WhaleIndicatorProps): import("react").JSX.Element;
export {};
//# sourceMappingURL=whale.d.ts.map