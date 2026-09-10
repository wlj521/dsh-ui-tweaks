/**
 * dsh-ui-tweaks — server half.
 *
 * Registers the `ui-tweaks` settings namespace so users can tune the
 * conversation UI either from the Settings panel or by editing the settings
 * document directly (settings.yaml `ui-tweaks:` section). All rendering work
 * happens in the browser bundle (`src/client`), which reads and writes this
 * namespace through the same-origin route mounted here — the Web settings RPC
 * only exposes a fixed allowlist of namespaces since rc.6, so a custom route is
 * the supported way for a plugin to own a configuration page.
 * @module dsh-ui-tweaks
 */
import type { Context } from '@deepseek-ai/cordis';
export declare const name = "dsh-ui-tweaks";
/** Required services: the settings seam is the whole server-side surface. */
export declare const inject: string[];
export declare function apply(ctx: Context): void;
//# sourceMappingURL=index.d.ts.map