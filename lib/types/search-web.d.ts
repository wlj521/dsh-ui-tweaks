/**
 * dsh-ui-tweaks — search key manager (host half).
 *
 * The browser "搜索" Settings page (usable while the searchEnabled toggle is
 * on) manages engine API keys through this same-origin route. Keys are stored
 * in the DSH credentials center file `~/.dsh/.credentials.yaml` — the same
 * place the harness LLM provider keys live — so the settings document never
 * holds secrets and both the search provider and other tooling resolve them
 * through the credentials service. Reads return only boolean presence, never
 * key material; writes are parsed with yaml's Document API (comments kept)
 * and persisted atomically, like the MCP manager's patch-file writes.
 * @module dsh-ui-tweaks/search-web
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Context } from '@deepseek-ai/cordis';
/** Exact route used by the browser search settings page. */
export declare const SEARCH_ROUTE = "/_dsh/ui-tweaks/search";
/** Engines with an API key slot, and the credentials-file entry for each. */
export declare const KEY_ENV_NAMES: Record<EngineKey, string>;
export type EngineKey = 'exa' | 'tavily' | 'keenable' | 'perplexity' | 'deepseek';
/** Public view: which engines have a key configured (never the key itself). */
export interface SearchKeysSnapshot {
    /** Absolute credentials file path, for the page's hint line. */
    credentialsPath: string;
    keys: Record<EngineKey, boolean>;
}
export declare class SearchBackend {
    private readonly ctx;
    constructor(ctx: Context);
    /**
     * The `searchProvider` id this plugin registers (matches provider.id).
     * Named after the plugin so other ddg-style plugins writing `ddg` into the
     * shared profile patch can never collide with it.
     */
    private static readonly PROVIDER_ID;
    /** Structural face of the Cordis loader service (duck-typed). */
    private loader;
    /** Resolve the profile directory from the root Include entry (see mcp.ts). */
    private profileDir;
    private patchFilePath;
    /**
     * Add or remove `searchProvider` on the profile patch's `web` entry so the
     * harness's built-in web_search routes to this plugin (on) or falls back to
     * the stock provider (off). DSH's patch watcher hot-reloads the change.
     */
    syncSearchPatch(enabled: boolean): Promise<void>;
    private snapshot;
    private saveKey;
    private clearKey;
    /** Live end-to-end engine test: one real search through the provider. */
    private testEngine;
    /** Handle the exact search-key route. */
    handle(req: IncomingMessage, res: ServerResponse): Promise<void>;
}
/**
 * Attach the search-key route whenever a webServer service is present.
 * @param ctx - plugin context owning route effects.
 * @param backend - search key handler.
 */
export declare function installSearchWeb(ctx: Context, backend: SearchBackend): void;
//# sourceMappingURL=search-web.d.ts.map