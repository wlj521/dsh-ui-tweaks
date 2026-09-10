/**
 * dsh-ui-tweaks — optional Web routes.
 *
 * The browser Settings panel reads and writes the `ui-tweaks` namespace through
 * this same-origin route, because the Web settings RPC only exposes a fixed
 * allowlist of namespaces (hardcoded in dsh-host-apiproxy since rc.6). The route
 * proxies to the real `ctx.settings` service, so the settings document
 * (settings.yaml) stays the single source of truth and hand edits keep working.
 * @module dsh-ui-tweaks/web
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Context } from '@deepseek-ai/cordis';
/** Exact route used by the browser Settings page. */
export declare const SETTINGS_ROUTE = "/_dsh/ui-tweaks/settings";
/** Public Settings snapshot; no secrets exist in this namespace. */
export interface UITweaksSnapshot {
    writable: boolean;
    value: unknown;
    revision: number;
}
type JsonResponse<T> = {
    ok: true;
    value: T;
} | {
    ok: false;
    error: {
        code: string;
        message: string;
    };
};
/** Accept state-changing requests only from the DSH Web application's origin. */
export declare function sameOriginPost(req: IncomingMessage): boolean;
export declare function isRecord(value: unknown): value is Record<string, unknown>;
export declare function json<T>(res: ServerResponse, status: number, body: JsonResponse<T>): void;
export declare function requestError(res: ServerResponse, status: number, code: string, message: string): void;
export declare function readJson(req: IncomingMessage, maxBytes?: number): Promise<unknown>;
export declare function messageOf(error: unknown): string;
/** Same-origin Settings read/write handler. */
export declare class UITweaksWebBackend {
    private readonly ctx;
    constructor(ctx: Context);
    private descriptor;
    private snapshot;
    /** Handle the exact Settings route. */
    handle(req: IncomingMessage, res: ServerResponse): Promise<void>;
}
/**
 * Attach the Settings route whenever a webServer service is present.
 * @param ctx - plugin context owning route effects.
 * @param backend - Settings handler.
 */
export declare function installUITweaksWeb(ctx: Context, backend: UITweaksWebBackend): void;
export {};
//# sourceMappingURL=web.d.ts.map