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

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Document, parseDocument, YAMLMap, YAMLSeq } from 'yaml'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
// Type-only import activates the webServer Context declaration.
import type {} from '@deepseek-ai/dsh-host-webserver'
import { createSearchProvider, ENGINE_ORDER, type SearchEngineId } from './search.ts'
import { isRecord, json, messageOf, readJson, requestError, sameOriginPost } from './web.ts'

/** Exact route used by the browser search settings page. */
export const SEARCH_ROUTE = '/_dsh/ui-tweaks/search'

/** Engines with an API key slot, and the credentials-file entry for each. */
export const KEY_ENV_NAMES: Record<EngineKey, string> = {
  exa: 'EXA_API_KEY',
  tavily: 'TAVILY_API_KEY',
  keenable: 'KEENABLE_API_KEY',
  perplexity: 'PERPLEXITY_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
}

export type EngineKey = 'exa' | 'tavily' | 'keenable' | 'perplexity' | 'deepseek'

const ENGINE_KEYS = Object.keys(KEY_ENV_NAMES) as EngineKey[]

/** Public view: which engines have a key configured (never the key itself). */
export interface SearchKeysSnapshot {
  /** Absolute credentials file path, for the page's hint line. */
  credentialsPath: string
  keys: Record<EngineKey, boolean>
}

type SearchRequest =
  | { action: 'save-key'; engine: EngineKey; value: string }
  | { action: 'clear-key'; engine: EngineKey }
  | { action: 'test'; engine: string }
  | { action: 'sync-patch'; enabled: boolean }

/** The credentials center schema: secrets live under `refs.<ENV_NAME>`. */
const REFS_SECTION = 'refs'

/**
 * Credentials file path; `DSH_CREDENTIALS_FILE` overrides it for tests.
 * The observed center schema is `{ version, refs, records }` where every
 * secret sits at `refs.<ENV_NAME>: <value>` — writing top-level keys
 * corrupts the schema and breaks the credentials service.
 */
function credentialsPath(): string {
  return process.env.DSH_CREDENTIALS_FILE ?? join(homedir(), '.dsh', '.credentials.yaml')
}

/** Read the credentials document; an absent file yields an empty document. */
async function readCredentials(): Promise<Document> {
  try {
    return parseDocument(await readFile(credentialsPath(), 'utf8'), { keepSourceTokens: false })
  } catch (error) {
    if (error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT') return new Document({})
    throw error
  }
}

/** Parse one credentials entry; non-string scalars are treated as absent. */
function hasKey(doc: Document, envName: string): boolean {
  const value = doc.getIn([REFS_SECTION, envName])
  return typeof value === 'string' && value.trim().length > 0
}

/** Atomically persist the document: tmp file + rename, like the MCP manager. */
async function writeCredentials(doc: Document): Promise<void> {
  const target = credentialsPath()
  await mkdir(dirname(target), { recursive: true })
  const tmp = `${target}.tmp`
  await writeFile(tmp, doc.toString({ lineWidth: 0 }), 'utf8')
  await rename(tmp, target)
}

export class SearchBackend {
  constructor(private readonly ctx: Context) {}

  // -----------------------------------------------------------------------
  // Provider activation (the profile's cordis.patch.yml, MCP-manager style)
  // -----------------------------------------------------------------------

  /** The `searchProvider` id this plugin registers (matches provider.id). */
  private static readonly PROVIDER_ID = 'ddg'

  /** Structural face of the Cordis loader service (duck-typed). */
  private loader(): { entries(): Iterable<{ options: { id?: string; name?: string; config?: Record<string, unknown> } }>; config?: { baseUrl?: string } } | undefined {
    return this.ctx.get('loader') as
      | { entries(): Iterable<{ options: { id?: string; name?: string; config?: Record<string, unknown> } }>; config?: { baseUrl?: string } }
      | undefined
  }

  /** Resolve the profile directory from the root Include entry (see mcp.ts). */
  private profileDir(): string | undefined {
    const loader = this.loader()
    if (loader === undefined) return undefined
    for (const entry of loader.entries()) {
      if (entry.options.name === 'cordis:include') {
        const rawPath = entry.options.config?.path
        if (typeof rawPath === 'string' && rawPath.length > 0) {
          try {
            return dirname(fileURLToPath(rawPath))
          } catch {
            return dirname(rawPath)
          }
        }
      }
    }
    const baseUrl = loader.config?.baseUrl
    if (typeof baseUrl === 'string' && baseUrl.length > 0) return baseUrl
    return undefined
  }

  private patchFilePath(): string {
    const dir = this.profileDir()
    if (dir === undefined) throw new Error('cannot locate the profile directory')
    return join(dir, 'cordis.patch.yml')
  }

  /**
   * Add or remove `searchProvider` on the profile patch's `web` entry so the
   * harness's built-in web_search routes to this plugin (on) or falls back to
   * the stock provider (off). DSH's patch watcher hot-reloads the change.
   */
  async syncSearchPatch(enabled: boolean): Promise<void> {
    const path = this.patchFilePath()
    let doc: Document
    try {
      doc = parseDocument(await readFile(path, 'utf8'))
    } catch (error) {
      if (error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
        doc = new Document([])
      } else {
        throw new Error(`failed to read profile patch file: ${messageOf(error)}`)
      }
    }
    if (!(doc.contents instanceof YAMLSeq) || doc.contents.items.length === 0) {
      doc.contents = doc.createNode([])
    }
    const contents = doc.contents
    // IMPORTANT: `- id: web` is a TOP-LEVEL config-override patch (it patches
    // the existing web node's config), NOT an insert-section entry — nesting
    // it inside `- insert:` would be read as a duplicate loader insert.
    let webEntry: YAMLMap | undefined
    for (const patch of contents.items) {
      if (patch instanceof YAMLMap && patch.get('id', false) === 'web') {
        webEntry = patch
        break
      }
    }
    // Repair: drop `id: web` entries that earlier versions wrongly nested in
    // insert sections, together with insert sections left empty by that.
    for (const patch of contents.items) {
      if (!(patch instanceof YAMLMap)) continue
      const insert = patch.get('insert')
      if (!(insert instanceof YAMLSeq)) continue
      for (let index = insert.items.length - 1; index >= 0; index -= 1) {
        const entry = insert.items[index]
        if (entry instanceof YAMLMap && entry.get('id', false) === 'web') insert.items.splice(index, 1)
      }
      if (insert.items.length === 0) {
        const patchIndex = (contents.items as unknown[]).indexOf(patch)
        if (patchIndex >= 0) contents.items.splice(patchIndex, 1)
      }
    }
    // No-op guard: writing the patch triggers DSH's patch watcher, which
    // hot-reloads the `web` node and restarts this plugin (it injects `web`).
    // Skip the write entirely when the document already matches the target
    // state so startup reconciliation cannot cause a reload loop.
    const hasProvider = webEntry !== undefined && (() => {
      const config = webEntry?.get('config')
      return config instanceof YAMLMap && config.get('searchProvider', false) === SearchBackend.PROVIDER_ID
    })()
    if (hasProvider === enabled) return
    if (enabled) {
      if (webEntry === undefined) {
        webEntry = doc.createNode({ id: 'web', config: { searchProvider: SearchBackend.PROVIDER_ID, fetchProvider: 'http' } }) as YAMLMap
        ;(contents as YAMLSeq<unknown>).add(webEntry)
      } else {
        const configNode = webEntry.get('config')
        let config: YAMLMap
        if (configNode instanceof YAMLMap) {
          config = configNode
        } else {
          config = doc.createNode({}) as YAMLMap
          webEntry.set('config', config)
        }
        config.set('searchProvider', SearchBackend.PROVIDER_ID)
        // Patch semantics replace the whole web config: keep fetchProvider so
        // the base bundle's web-fetch-http is not silently double-registered.
        if (!config.has('fetchProvider')) config.set('fetchProvider', 'http')
      }
    } else if (webEntry !== undefined) {
      const config = webEntry.get('config')
      if (config instanceof YAMLMap && config.get('searchProvider', false) === SearchBackend.PROVIDER_ID) {
        config.delete('searchProvider')
        // fetchProvider: http is the harness default; if that is all that is
        // left after removing searchProvider, the whole entry is noise.
        if (config.items.length === 1 && config.get('fetchProvider', false) === 'http') config.delete('fetchProvider')
        if (config.items.length === 0) {
          webEntry.delete('config')
          // "Empty" means nothing but the id marker: the entry is ours.
          const otherKeys = webEntry.items.filter(item => String((item.key as { value?: unknown } | undefined)?.value) !== 'id')
          if (otherKeys.length === 0) {
            const index = (contents.items as unknown[]).indexOf(webEntry)
            if (index >= 0) contents.items.splice(index, 1)
          }
        }
      }
    }
    const tmp = `${path}.${process.pid}.tmp`
    await writeFile(tmp, doc.toString(), 'utf8')
    await rename(tmp, path)
    this.ctx.logger.info('dsh-ui-tweaks: web searchProvider %s (searchEnabled=%s)', enabled ? 'activated' : 'removed', String(enabled))
  }

  private async snapshot(): Promise<SearchKeysSnapshot> {
    const keys = {} as Record<EngineKey, boolean>
    for (const engine of ENGINE_KEYS) keys[engine] = false
    const doc = await readCredentials()
    for (const engine of ENGINE_KEYS) keys[engine] = hasKey(doc, KEY_ENV_NAMES[engine])
    return { credentialsPath: credentialsPath(), keys }
  }

  private async saveKey(engine: EngineKey, value: string): Promise<void> {
    const trimmed = value.trim()
    if (trimmed.length === 0) throw new Error('key value must not be empty')
    if (trimmed.length > 4096) throw new Error('key value is too long')
    const doc = await readCredentials()
    let refs = doc.get(REFS_SECTION)
    if (refs === undefined || refs === null || typeof refs !== 'object' || typeof (refs as { set?: unknown }).set !== 'function') {
      refs = doc.createNode({})
      doc.set(REFS_SECTION, refs)
    }
    ;(refs as { set(name: string, value: string): void }).set(KEY_ENV_NAMES[engine], trimmed)
    await writeCredentials(doc)
    this.ctx.logger.info('dsh-ui-tweaks: %s updated in the credentials center', KEY_ENV_NAMES[engine])
  }

  private async clearKey(engine: EngineKey): Promise<void> {
    const doc = await readCredentials()
    if (doc.hasIn([REFS_SECTION, KEY_ENV_NAMES[engine]])) {
      doc.deleteIn([REFS_SECTION, KEY_ENV_NAMES[engine]])
      await writeCredentials(doc)
    }
  }

  /** Live end-to-end engine test: one real search through the provider. */
  private async testEngine(engine: string): Promise<void> {
    const row = this.ctx.settings.describe().find(candidate => candidate.ns === 'ui-tweaks')
    const value = row?.value as { bingMarket?: unknown } | undefined
    const credentials = (this.ctx as Context & { get?(name: string): unknown }).get?.('credentials') as
      | { resolve(envName: string): Promise<{ value?: string | undefined }> }
      | undefined
    const resolveApiKey = async (envName: string): Promise<string | undefined> => {
      if (credentials) {
        try {
          const resolved = await credentials.resolve(envName)
          if (resolved?.value) return resolved.value
        } catch {
          // Fall through to the process environment.
        }
      }
      return process.env[envName]
    }
    const provider = createSearchProvider({
      readConfig: () => ({
        searchEnabled: true,
        searchEngine: engine as SearchEngineId,
        bingMarket: typeof value?.bingMarket === 'string' ? value.bingMarket : undefined,
      }),
      resolveApiKey,
    })
    await provider.search({ query: 'DeepSeek Harness', maxResults: 1 })
  }

  /** Handle the exact search-key route. */
  async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method === 'GET') {
      try {
        json(res, 200, { ok: true, value: await this.snapshot() })
      } catch (error) {
        this.ctx.logger.warn('dsh-ui-tweaks search snapshot failed: %s', messageOf(error))
        requestError(res, 503, 'search-unavailable', 'Search key manager is unavailable')
      }
      return
    }
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST')
      requestError(res, 405, 'method-not-allowed', 'Use GET or POST')
      return
    }
    if (!sameOriginPost(req)) {
      requestError(res, 403, 'origin-rejected', 'The request must originate from this DSH Web application')
      return
    }
    let request: SearchRequest
    try {
      request = parseRequest(await readJson(req))
    } catch (error) {
      requestError(res, 400, 'invalid-request', messageOf(error))
      return
    }
    try {
      if (request.action === 'save-key') await this.saveKey(request.engine, request.value)
      else if (request.action === 'clear-key') await this.clearKey(request.engine)
      // The toggle passes its target state explicitly: the settings write and
      // this sync run concurrently, so reading the document here could race
      // and re-apply the stale value.
      else if (request.action === 'sync-patch') await this.syncSearchPatch(request.enabled)
      else await this.testEngine(request.engine)
      json(res, 200, { ok: true, value: await this.snapshot() })
    } catch (error) {
      this.ctx.logger.warn('dsh-ui-tweaks search key mutation failed: %s', messageOf(error))
      requestError(res, 400, 'search-rejected', messageOf(error))
    }
  }
}

function parseRequest(value: unknown): SearchRequest {
  if (!isRecord(value) || typeof value.action !== 'string') throw new TypeError('action is required')
  if (value.action === 'sync-patch') {
    if (typeof value.enabled !== 'boolean') throw new TypeError('enabled must be a boolean')
    return { action: 'sync-patch', enabled: value.enabled }
  }
  const engine = value.engine
  const validEngines: readonly string[] = value.action === 'test' ? ENGINE_ORDER : ENGINE_KEYS
  if (typeof engine !== 'string' || !validEngines.includes(engine)) {
    throw new TypeError(`engine must be one of: ${validEngines.join(', ')}`)
  }
  if (value.action === 'clear-key') {
    return { action: 'clear-key', engine: engine as EngineKey }
  }
  if (value.action === 'test') {
    return { action: 'test', engine }
  }
  if (value.action === 'save-key') {
    if (typeof value.value !== 'string') throw new TypeError('value must be a string')
    return { action: 'save-key', engine: engine as EngineKey, value: value.value }
  }
  throw new TypeError(`unsupported action: ${value.action}`)
}

/**
 * Attach the search-key route whenever a webServer service is present.
 * @param ctx - plugin context owning route effects.
 * @param backend - search key handler.
 */
export function installSearchWeb(ctx: Context, backend: SearchBackend): void {
  ctx.inject(['webServer'], (webCtx) => {
    webCtx.effect(() => {
      return webCtx.webServer.register({
        kind: 'exact',
        path: SEARCH_ROUTE,
        handler: (req, res) => backend.handle(req, res),
      })
    }, 'dsh-ui-tweaks: search key routes')
  })
}
