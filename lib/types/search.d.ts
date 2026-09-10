/**
 * dsh-ui-tweaks — configurable free/keyed web search provider.
 *
 * Implements the DSH WebSearchProvider contract: a `{ id, available, search }`
 * object registered through `ctx.web.registerSearchProvider` becomes the
 * backend of the harness's built-in `web_search` tool. The engine is picked
 * live from the `ui-tweaks.searchEngine` setting and falls back through the
 * remaining engines on failure. API keys are never stored in settings: they
 * resolve through the DSH credentials center (`~/.dsh/.credentials.yaml`)
 * first, then the process environment.
 *
 * Engine lineup and the credentials-priority pattern follow the
 * dsh-free-search plugin (MIT, DDDMUC).
 * @module dsh-ui-tweaks/search
 */
/** One search result handed back to the harness's web_search tool. */
export interface SearchSource {
    url: string;
    title?: string;
    snippet?: string;
}
/** Result shape expected by the harness web.search provider contract. */
export interface SearchResult {
    sources: SearchSource[];
    truncated: boolean;
    /** Engine that actually produced the result (informational). */
    engine?: string;
    /** Fallback note when the preferred engine failed (informational). */
    content?: string;
}
/** Supported engine ids; mirrors the `searchEngine` settings field. */
export type SearchEngineId = 'bing' | 'ddg' | 'exa' | 'tavily' | 'keenable' | 'perplexity' | 'deepseek';
/** Fallback order after the preferred engine. */
export declare const ENGINE_ORDER: readonly SearchEngineId[];
/**
 * Id of the search provider registered into `ctx.web` and written as
 * `searchProvider` in the profile's cordis.patch.yml. Named after the plugin
 * (not after an engine like `ddg`) so it can never collide with another
 * plugin's provider id in the same profile.
 */
export declare const SEARCH_PROVIDER_ID = "dsh-ui-tweaks";
/** Credential resolver face (dsh credentials service, duck-typed). */
export type CredentialResolver = (envName: string) => Promise<string | undefined>;
/** Per-search engine options. */
export interface SearchOptions {
    bingMarket?: string | undefined;
    resolveApiKey?: CredentialResolver | undefined;
}
/** The `web` seam services mounted by the DSH harness at runtime. */
export interface WebSearchSeam {
    registerSearchProvider(provider: {
        id: string;
        available(): boolean;
        search(request: {
            query: string;
            maxResults?: number;
        }, signal?: AbortSignal): Promise<SearchResult>;
    }): void;
    searchProviderId?: string | undefined;
}
export declare function searchBing(query: string, maxResults: number, options?: {
    bingMarket?: string | undefined;
}, signal?: AbortSignal): Promise<SearchResult>;
export declare function searchDdgLite(query: string, maxResults: number, signal?: AbortSignal): Promise<SearchResult>;
/** Exa via its anonymous public MCP endpoint (no key). */
export declare function searchExaMcp(query: string, maxResults: number, signal?: AbortSignal): Promise<SearchResult>;
export declare function searchExa(query: string, maxResults: number, options?: SearchOptions, signal?: AbortSignal): Promise<SearchResult>;
/** Tavily: keyless anonymous quota without a key, account quota with one. */
export declare function searchTavily(query: string, maxResults: number, options?: SearchOptions, signal?: AbortSignal): Promise<SearchResult>;
export declare function searchKeenable(query: string, maxResults: number, options?: SearchOptions, signal?: AbortSignal): Promise<SearchResult>;
export declare function searchPerplexity(query: string, maxResults: number, options?: SearchOptions, signal?: AbortSignal): Promise<SearchResult>;
export declare function searchDeepSeekOfficial(query: string, maxResults: number, options?: SearchOptions, signal?: AbortSignal): Promise<SearchResult>;
/** Live view of the search-related settings fields. */
export interface SearchProviderConfig {
    searchEnabled?: boolean | undefined;
    searchEngine?: SearchEngineId | undefined;
    bingMarket?: string | undefined;
}
export interface SearchProviderOptions {
    /** Reads the current settings document (called per search, so edits apply live). */
    readConfig(): SearchProviderConfig;
    /** Resolves engine keys from the credentials center, then the environment. */
    resolveApiKey?: CredentialResolver;
}
/**
 * Build the provider registered into `ctx.web`. The preferred engine comes
 * from settings; any engine that fails (rate limit, invalid key, network)
 * falls through to the next one, so search never hard-fails on one engine.
 */
export declare function createSearchProvider(options: SearchProviderOptions): {
    id: string;
    available(): boolean;
    search(request: {
        query: string;
        maxResults?: number;
    }, signal?: AbortSignal): Promise<SearchResult>;
};
//# sourceMappingURL=search.d.ts.map