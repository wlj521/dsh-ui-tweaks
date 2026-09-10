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
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Document, parseDocument, YAMLMap, YAMLSeq } from 'yaml';
import { createSearchProvider, ENGINE_ORDER, SEARCH_PROVIDER_ID } from "./search.js";
import { isRecord, json, messageOf, readJson, requestError, sameOriginPost } from "./web.js";
/** Exact route used by the browser search settings page. */
export const SEARCH_ROUTE = '/_dsh/ui-tweaks/search';
/** Engines with an API key slot, and the credentials-file entry for each. */
export const KEY_ENV_NAMES = {
    exa: 'EXA_API_KEY',
    tavily: 'TAVILY_API_KEY',
    keenable: 'KEENABLE_API_KEY',
    perplexity: 'PERPLEXITY_API_KEY',
    deepseek: 'DEEPSEEK_API_KEY',
};
const ENGINE_KEYS = Object.keys(KEY_ENV_NAMES);
/** The credentials center schema: secrets live under `refs.<ENV_NAME>`. */
const REFS_SECTION = 'refs';
/**
 * Credentials file path; `DSH_CREDENTIALS_FILE` overrides it for tests.
 * The observed center schema is `{ version, refs, records }` where every
 * secret sits at `refs.<ENV_NAME>: <value>` — writing top-level keys
 * corrupts the schema and breaks the credentials service.
 */
function credentialsPath() {
    return process.env.DSH_CREDENTIALS_FILE ?? join(homedir(), '.dsh', '.credentials.yaml');
}
/** Read the credentials document; an absent file yields an empty document. */
async function readCredentials() {
    try {
        return parseDocument(await readFile(credentialsPath(), 'utf8'), { keepSourceTokens: false });
    }
    catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
            return new Document({});
        throw error;
    }
}
/** Parse one credentials entry; non-string scalars are treated as absent. */
function hasKey(doc, envName) {
    const value = doc.getIn([REFS_SECTION, envName]);
    return typeof value === 'string' && value.trim().length > 0;
}
/** Atomically persist the document: tmp file + rename, like the MCP manager. */
async function writeCredentials(doc) {
    const target = credentialsPath();
    await mkdir(dirname(target), { recursive: true });
    const tmp = `${target}.tmp`;
    await writeFile(tmp, doc.toString({ lineWidth: 0 }), 'utf8');
    await rename(tmp, target);
}
export class SearchBackend {
    ctx;
    constructor(ctx) {
        this.ctx = ctx;
    }
    // -----------------------------------------------------------------------
    // Provider activation (the profile's cordis.patch.yml, MCP-manager style)
    // -----------------------------------------------------------------------
    /**
     * The `searchProvider` id this plugin registers (matches provider.id).
     * Named after the plugin so other ddg-style plugins writing `ddg` into the
     * shared profile patch can never collide with it.
     */
    static PROVIDER_ID = SEARCH_PROVIDER_ID;
    /** Structural face of the Cordis loader service (duck-typed). */
    loader() {
        return this.ctx.get('loader');
    }
    /** Resolve the profile directory from the root Include entry (see mcp.ts). */
    profileDir() {
        const loader = this.loader();
        if (loader === undefined)
            return undefined;
        for (const entry of loader.entries()) {
            if (entry.options.name === 'cordis:include') {
                const rawPath = entry.options.config?.path;
                if (typeof rawPath === 'string' && rawPath.length > 0) {
                    try {
                        return dirname(fileURLToPath(rawPath));
                    }
                    catch {
                        return dirname(rawPath);
                    }
                }
            }
        }
        const baseUrl = loader.config?.baseUrl;
        if (typeof baseUrl === 'string' && baseUrl.length > 0)
            return baseUrl;
        return undefined;
    }
    patchFilePath() {
        const dir = this.profileDir();
        if (dir === undefined)
            throw new Error('cannot locate the profile directory');
        return join(dir, 'cordis.patch.yml');
    }
    /**
     * Add or remove `searchProvider` on the profile patch's `web` entry so the
     * harness's built-in web_search routes to this plugin (on) or falls back to
     * the stock provider (off). DSH's patch watcher hot-reloads the change.
     */
    async syncSearchPatch(enabled) {
        const path = this.patchFilePath();
        let doc;
        try {
            doc = parseDocument(await readFile(path, 'utf8'));
        }
        catch (error) {
            if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
                doc = new Document([]);
            }
            else {
                throw new Error(`failed to read profile patch file: ${messageOf(error)}`);
            }
        }
        if (!(doc.contents instanceof YAMLSeq) || doc.contents.items.length === 0) {
            doc.contents = doc.createNode([]);
        }
        const contents = doc.contents;
        // IMPORTANT: `- id: web` is a TOP-LEVEL config-override patch (it patches
        // the existing web node's config), NOT an insert-section entry — nesting
        // it inside `- insert:` would be read as a duplicate loader insert.
        let webEntry;
        for (const patch of contents.items) {
            if (patch instanceof YAMLMap && patch.get('id', false) === 'web') {
                webEntry = patch;
                break;
            }
        }
        // Repair: drop `id: web` entries that earlier versions wrongly nested in
        // insert sections, together with insert sections left empty by that.
        for (const patch of contents.items) {
            if (!(patch instanceof YAMLMap))
                continue;
            const insert = patch.get('insert');
            if (!(insert instanceof YAMLSeq))
                continue;
            for (let index = insert.items.length - 1; index >= 0; index -= 1) {
                const entry = insert.items[index];
                if (entry instanceof YAMLMap && entry.get('id', false) === 'web')
                    insert.items.splice(index, 1);
            }
            if (insert.items.length === 0) {
                const patchIndex = contents.items.indexOf(patch);
                if (patchIndex >= 0)
                    contents.items.splice(patchIndex, 1);
            }
        }
        // No-op guard: writing the patch triggers DSH's patch watcher, which
        // hot-reloads the `web` node and restarts this plugin (it injects `web`).
        // Skip the write entirely when the document already matches the target
        // state so startup reconciliation cannot cause a reload loop.
        const hasProvider = webEntry !== undefined && (() => {
            const config = webEntry?.get('config');
            return config instanceof YAMLMap && config.get('searchProvider', false) === SearchBackend.PROVIDER_ID;
        })();
        if (hasProvider === enabled)
            return;
        if (enabled) {
            if (webEntry === undefined) {
                webEntry = doc.createNode({ id: 'web', config: { searchProvider: SearchBackend.PROVIDER_ID, fetchProvider: 'http' } });
                contents.add(webEntry);
            }
            else {
                const configNode = webEntry.get('config');
                let config;
                if (configNode instanceof YAMLMap) {
                    config = configNode;
                }
                else {
                    config = doc.createNode({});
                    webEntry.set('config', config);
                }
                config.set('searchProvider', SearchBackend.PROVIDER_ID);
                // Patch semantics replace the whole web config: keep fetchProvider so
                // the base bundle's web-fetch-http is not silently double-registered.
                if (!config.has('fetchProvider'))
                    config.set('fetchProvider', 'http');
            }
        }
        else if (webEntry !== undefined) {
            const config = webEntry.get('config');
            if (config instanceof YAMLMap && config.get('searchProvider', false) === SearchBackend.PROVIDER_ID) {
                config.delete('searchProvider');
                // fetchProvider: http is the harness default; if that is all that is
                // left after removing searchProvider, the whole entry is noise.
                if (config.items.length === 1 && config.get('fetchProvider', false) === 'http')
                    config.delete('fetchProvider');
                if (config.items.length === 0) {
                    webEntry.delete('config');
                    // "Empty" means nothing but the id marker: the entry is ours.
                    const otherKeys = webEntry.items.filter(item => String(item.key?.value) !== 'id');
                    if (otherKeys.length === 0) {
                        const index = contents.items.indexOf(webEntry);
                        if (index >= 0)
                            contents.items.splice(index, 1);
                    }
                }
            }
        }
        const tmp = `${path}.${process.pid}.tmp`;
        await writeFile(tmp, doc.toString(), 'utf8');
        await rename(tmp, path);
        this.ctx.logger.info('dsh-ui-tweaks: web searchProvider %s (searchEnabled=%s)', enabled ? 'activated' : 'removed', String(enabled));
    }
    async snapshot() {
        const keys = {};
        for (const engine of ENGINE_KEYS)
            keys[engine] = false;
        const doc = await readCredentials();
        for (const engine of ENGINE_KEYS)
            keys[engine] = hasKey(doc, KEY_ENV_NAMES[engine]);
        return { credentialsPath: credentialsPath(), keys };
    }
    async saveKey(engine, value) {
        const trimmed = value.trim();
        if (trimmed.length === 0)
            throw new Error('key value must not be empty');
        if (trimmed.length > 4096)
            throw new Error('key value is too long');
        const doc = await readCredentials();
        let refs = doc.get(REFS_SECTION);
        if (refs === undefined || refs === null || typeof refs !== 'object' || typeof refs.set !== 'function') {
            refs = doc.createNode({});
            doc.set(REFS_SECTION, refs);
        }
        ;
        refs.set(KEY_ENV_NAMES[engine], trimmed);
        await writeCredentials(doc);
        this.ctx.logger.info('dsh-ui-tweaks: %s updated in the credentials center', KEY_ENV_NAMES[engine]);
    }
    async clearKey(engine) {
        const doc = await readCredentials();
        if (doc.hasIn([REFS_SECTION, KEY_ENV_NAMES[engine]])) {
            doc.deleteIn([REFS_SECTION, KEY_ENV_NAMES[engine]]);
            await writeCredentials(doc);
        }
    }
    /** Live end-to-end engine test: one real search through the provider. */
    async testEngine(engine) {
        const row = this.ctx.settings.describe().find(candidate => candidate.ns === 'ui-tweaks');
        const value = row?.value;
        const credentials = this.ctx.get?.('credentials');
        const resolveApiKey = async (envName) => {
            if (credentials) {
                try {
                    const resolved = await credentials.resolve(envName);
                    if (resolved?.value)
                        return resolved.value;
                }
                catch {
                    // Fall through to the process environment.
                }
            }
            return process.env[envName];
        };
        const provider = createSearchProvider({
            readConfig: () => ({
                searchEnabled: true,
                searchEngine: engine,
                bingMarket: typeof value?.bingMarket === 'string' ? value.bingMarket : undefined,
            }),
            resolveApiKey,
        });
        await provider.search({ query: 'DeepSeek Harness', maxResults: 1 });
    }
    /** Handle the exact search-key route. */
    async handle(req, res) {
        if (req.method === 'GET') {
            try {
                json(res, 200, { ok: true, value: await this.snapshot() });
            }
            catch (error) {
                this.ctx.logger.warn('dsh-ui-tweaks search snapshot failed: %s', messageOf(error));
                requestError(res, 503, 'search-unavailable', 'Search key manager is unavailable');
            }
            return;
        }
        if (req.method !== 'POST') {
            res.setHeader('Allow', 'GET, POST');
            requestError(res, 405, 'method-not-allowed', 'Use GET or POST');
            return;
        }
        if (!sameOriginPost(req)) {
            requestError(res, 403, 'origin-rejected', 'The request must originate from this DSH Web application');
            return;
        }
        let request;
        try {
            request = parseRequest(await readJson(req));
        }
        catch (error) {
            requestError(res, 400, 'invalid-request', messageOf(error));
            return;
        }
        try {
            if (request.action === 'save-key')
                await this.saveKey(request.engine, request.value);
            else if (request.action === 'clear-key')
                await this.clearKey(request.engine);
            // The toggle passes its target state explicitly: the settings write and
            // this sync run concurrently, so reading the document here could race
            // and re-apply the stale value.
            else if (request.action === 'sync-patch')
                await this.syncSearchPatch(request.enabled);
            else
                await this.testEngine(request.engine);
            json(res, 200, { ok: true, value: await this.snapshot() });
        }
        catch (error) {
            this.ctx.logger.warn('dsh-ui-tweaks search key mutation failed: %s', messageOf(error));
            requestError(res, 400, 'search-rejected', messageOf(error));
        }
    }
}
function parseRequest(value) {
    if (!isRecord(value) || typeof value.action !== 'string')
        throw new TypeError('action is required');
    if (value.action === 'sync-patch') {
        if (typeof value.enabled !== 'boolean')
            throw new TypeError('enabled must be a boolean');
        return { action: 'sync-patch', enabled: value.enabled };
    }
    const engine = value.engine;
    const validEngines = value.action === 'test' ? ENGINE_ORDER : ENGINE_KEYS;
    if (typeof engine !== 'string' || !validEngines.includes(engine)) {
        throw new TypeError(`engine must be one of: ${validEngines.join(', ')}`);
    }
    if (value.action === 'clear-key') {
        return { action: 'clear-key', engine: engine };
    }
    if (value.action === 'test') {
        return { action: 'test', engine };
    }
    if (value.action === 'save-key') {
        if (typeof value.value !== 'string')
            throw new TypeError('value must be a string');
        return { action: 'save-key', engine: engine, value: value.value };
    }
    throw new TypeError(`unsupported action: ${value.action}`);
}
/**
 * Attach the search-key route whenever a webServer service is present.
 * @param ctx - plugin context owning route effects.
 * @param backend - search key handler.
 */
export function installSearchWeb(ctx, backend) {
    ctx.inject(['webServer'], (webCtx) => {
        webCtx.effect(() => {
            return webCtx.webServer.register({
                kind: 'exact',
                path: SEARCH_ROUTE,
                handler: (req, res) => backend.handle(req, res),
            });
        }, 'dsh-ui-tweaks: search key routes');
    });
}
//# sourceMappingURL=search-web.js.map