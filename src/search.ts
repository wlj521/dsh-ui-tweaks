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
  url: string
  title?: string
  snippet?: string
}

/** Result shape expected by the harness web.search provider contract. */
export interface SearchResult {
  sources: SearchSource[]
  truncated: boolean
  /** Engine that actually produced the result (informational). */
  engine?: string
  /** Fallback note when the preferred engine failed (informational). */
  content?: string
}

/** Supported engine ids; mirrors the `searchEngine` settings field. */
export type SearchEngineId = 'bing' | 'ddg' | 'exa' | 'tavily' | 'keenable' | 'perplexity' | 'deepseek'

/** Fallback order after the preferred engine. */
export const ENGINE_ORDER: readonly SearchEngineId[] = ['bing', 'ddg', 'exa', 'tavily', 'keenable', 'perplexity', 'deepseek']

/**
 * Id of the search provider registered into `ctx.web` and written as
 * `searchProvider` in the profile's cordis.patch.yml. Named after the plugin
 * (not after an engine like `ddg`) so it can never collide with another
 * plugin's provider id in the same profile.
 */
export const SEARCH_PROVIDER_ID = 'dsh-ui-tweaks'

/** Credential file env names for engines that REQUIRE a key. */
const REQUIRED_API_KEYS: Partial<Record<SearchEngineId, string>> = {
  perplexity: 'PERPLEXITY_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
}

/** Credential resolver face (dsh credentials service, duck-typed). */
export type CredentialResolver = (envName: string) => Promise<string | undefined>

/** Per-search engine options. */
export interface SearchOptions {
  bingMarket?: string | undefined
  resolveApiKey?: CredentialResolver | undefined
}

/** The `web` seam services mounted by the DSH harness at runtime. */
export interface WebSearchSeam {
  registerSearchProvider(provider: {
    id: string
    available(): boolean
    search(request: { query: string; maxResults?: number }, signal?: AbortSignal): Promise<SearchResult>
  }): void
  searchProviderId?: string | undefined
}

const BING_URL = 'https://www.bing.com/search'
const DDG_LITE_URL = 'https://lite.duckduckgo.com/lite/'
const TAVILY_URL = 'https://api.tavily.com/search'
const KEENABLE_URL = 'https://api.keenable.ai/v1/search'
const KEENABLE_MCP_URL = 'https://api.keenable.ai/mcp'
const EXA_REST_URL = 'https://api.exa.ai/search'
const EXA_MCP_URL = 'https://mcp.exa.ai/mcp'
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
const ACCEPT_LANG = 'zh-CN,zh;q=0.9,en;q=0.8'
const FETCH_TIMEOUT_MS = 12_000
const FETCH_ATTEMPTS = 3
const FETCH_RETRY_DELAY_MS = 1_500
const SNIPPET_MAX = 300

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&ensp;|&emsp;/g, ' ')
    .replace(/&middot;/g, '·')
    .replace(/&mdash;/g, '—')
    .replace(/&hellip;/g, '…')
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&lsquo;|&rsquo;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
}

function cleanSnippet(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, SNIPPET_MAX)
}

function uniqueSources(sources: SearchSource[], limit: number): SearchSource[] {
  const seen = new Set<string>()
  const out: SearchSource[] = []
  for (const s of sources) {
    if (s.url && !seen.has(s.url)) {
      seen.add(s.url)
      out.push(s)
    }
    if (out.length >= limit) break
  }
  return out
}

/** Run with an extra timeout layered onto the caller's abort signal. */
async function withTimeout<T>(ms: number, signal: AbortSignal | undefined, run: (effSignal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  const onAbort = () => controller.abort()
  signal?.addEventListener('abort', onAbort)
  try {
    return await run(controller.signal)
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}

async function fetchHtml(url: string, signal?: AbortSignal): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  const onAbort = () => controller.abort()
  signal?.addEventListener('abort', onAbort)
  let response: Response
  try {
    response = await fetch(url, {
      headers: { 'user-agent': USER_AGENT, 'accept-language': ACCEPT_LANG },
      signal: controller.signal,
      redirect: 'follow',
    })
  } catch (error) {
    if (signal?.aborted) throw error
    throw new Error(`connection error: ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${url.split('?')[0] ?? url}`)
  const html = await response.text()
  // DuckDuckGo answers the actual results page with 202 when it raises its
  // anti-bot challenge; treat that as a rate-limit error so the caller can
  // fall through to the next engine instead of parsing an empty result list.
  if (response.status === 202 || /anomaly|captcha|unusual traffic|robot check/i.test(html.slice(0, 4000))) {
    throw new Error('DuckDuckGo is rate-limited right now (anti-bot challenge, usually temporary)')
  }
  return html
}

async function fetchHtmlWithRetry(url: string, signal?: AbortSignal): Promise<string> {
  let lastError: unknown = new Error('fetch failed')
  for (let attempt = 1; attempt <= FETCH_ATTEMPTS; attempt++) {
    try {
      const html = await fetchHtml(url, signal)
      if (html.length > 500) return html
      lastError = new Error(`empty response (${html.length} bytes)`)
    } catch (error) {
      lastError = error
    }
    if (attempt < FETCH_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, FETCH_RETRY_DELAY_MS))
    }
  }
  throw lastError
}

export async function searchBing(
  query: string,
  maxResults: number,
  options?: { bingMarket?: string | undefined },
  signal?: AbortSignal,
): Promise<SearchResult> {
  const params = new URLSearchParams({ q: query, mkt: options?.bingMarket ?? 'zh-CN' })
  const html = await fetchHtmlWithRetry(`${BING_URL}?${params}`, signal)
  const blocks = html.match(/<li class="b_algo"[\s\S]*?<\/li>/g) ?? []
  const sources: SearchSource[] = []
  for (const block of blocks) {
    const hrefMatch = block.match(/<a[^>]*href="(https?:\/\/[^"]+)"/)
    const titleMatch = block.match(/<h2[^>]*>[\s\S]*?<a[^>]*>(.*?)<\/a>[\s\S]*?<\/h2>/)
    const snippetMatch = block.match(/<p[^>]*>([\s\S]*?)<\/p>/)
    if (!hrefMatch?.[1]) continue
    const source: SearchSource = { url: hrefMatch[1] }
    const title = titleMatch?.[1]
    const snippet = snippetMatch?.[1]
    if (title) source.title = stripTags(title)
    if (snippet) source.snippet = cleanSnippet(stripTags(snippet))
    sources.push(source)
  }
  return { sources: uniqueSources(sources, maxResults), truncated: false }
}

function extractDdgUrl(rel: string): string | null {
  if (!rel) return null
  const m = rel.match(/uddg=([^&]+)/)
  if (m?.[1]) {
    try {
      return decodeURIComponent(m[1])
    } catch {
      return m[1]
    }
  }
  return rel.startsWith('//') ? `https:${rel}` : rel
}

export async function searchDdgLite(
  query: string,
  maxResults: number,
  signal?: AbortSignal,
): Promise<SearchResult> {
  const params = new URLSearchParams({ q: query })
  const html = await fetchHtmlWithRetry(`${DDG_LITE_URL}?${params}`, signal)
  const linkMatches = html.match(/<a[^>]*class=['"]result-link['"][^>]*>[\s\S]*?<\/a>/g) ?? []
  const snippetMatches = html.match(/class=['"]result-snippet['"][^>]*>([\s\S]*?)<\/td>/g) ?? []
  const sources: SearchSource[] = []
  for (let i = 0; i < linkMatches.length; i++) {
    const hrefMatch = linkMatches[i]?.match(/href="([^"]*)"/)
    const titleMatch = linkMatches[i]?.match(/class=['"]result-link['"][^>]*>(.*?)<\/a>/)
    if (!hrefMatch?.[1]) continue
    const url = extractDdgUrl(hrefMatch[1])
    if (!url) continue
    const source: SearchSource = { url }
    const title = titleMatch?.[1]
    const snippet = snippetMatches[i]?.match(/class=['"]result-snippet['"][^>]*>([\s\S]*?)<\/td>/)?.[1]
    if (title) source.title = stripTags(title)
    if (snippet) source.snippet = cleanSnippet(stripTags(snippet))
    sources.push(source)
  }
  return { sources: uniqueSources(sources, maxResults), truncated: false }
}

/** JSON-RPC tools/call body shared by the keyless MCP endpoints. */
function mcpCallTool(toolName: string, args: Record<string, unknown>): { jsonrpc: '2.0'; id: number; method: 'tools/call'; params: { name: string; arguments: Record<string, unknown> } } {
  return { jsonrpc: '2.0', id: Date.now(), method: 'tools/call', params: { name: toolName, arguments: args } }
}

interface McpContentBlock {
  type?: string
  text?: string
}

interface McpResponse {
  error?: { message?: string }
  result?: { content?: McpContentBlock[]; isError?: boolean }
}

function parseMcpTextBlocks(data: McpResponse): string {
  return (data.result?.content ?? [])
    .filter(b => b.type === 'text' && typeof b.text === 'string')
    .map(b => b.text as string)
    .join('\n')
}

/** Parse MCP "Title: / URL: / <snippet-label>:" text blocks into sources. */
function parseTitleUrlBlocks(text: string, maxResults: number, snippetLabel: 'Highlights' | 'Snippets'): SearchSource[] {
  const sources: SearchSource[] = []
  for (const block of text.split(/\n(?=Title:)/)) {
    const title = block.match(/^Title: (.+)$/m)?.[1]
    const url = block.match(/^URL: (\S+)$/m)?.[1]
    const snippet = block.split(new RegExp(`^${snippetLabel}:$`, 'm'))[1]
      ?.split('\n').filter(l => l.trim() && !l.trim().startsWith('...')).slice(0, 3).join(' ')
    if (!url) continue
    const source: SearchSource = { url }
    if (title) source.title = title
    if (snippet) source.snippet = cleanSnippet(snippet)
    sources.push(source)
  }
  return uniqueSources(sources, maxResults)
}

/** Exa via its anonymous public MCP endpoint (no key). */
export async function searchExaMcp(query: string, maxResults: number, signal?: AbortSignal): Promise<SearchResult> {
  return withTimeout(20_000, signal, async (effSignal) => {
    const response = await fetch(EXA_MCP_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify(mcpCallTool('web_search_exa', { query, numResults: maxResults })),
      signal: effSignal,
    })
    if (!response.ok) throw new Error(`Exa MCP error (HTTP ${response.status})`)
    const text = await response.text()
    let json: McpResponse | null = null
    for (const line of text.split('\n')) {
      if (line.startsWith('data: ')) {
        try { json = JSON.parse(line.slice(6)) as McpResponse; break } catch { /* keep scanning */ }
      }
    }
    if (!json || json.error) throw new Error(`Exa MCP error: ${json?.error?.message ?? 'no data'}`)
    return { sources: parseTitleUrlBlocks(parseMcpTextBlocks(json), maxResults, 'Highlights'), truncated: false }
  })
}

/** Exa REST with an API key (higher quota than the anonymous MCP). */
async function searchExaRest(query: string, maxResults: number, apiKey: string, signal?: AbortSignal): Promise<SearchResult> {
  return withTimeout(20_000, signal, async (effSignal) => {
    const response = await fetch(EXA_REST_URL, {
      method: 'POST',
      redirect: 'error',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ query, type: 'auto', numResults: maxResults, contents: { highlights: { highlightsPerUrl: 1 } } }),
      signal: effSignal,
    })
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      if (response.status === 401) throw new Error('Exa API key is invalid (HTTP 401)')
      throw new Error(`Exa API error (HTTP ${response.status}): ${detail.slice(0, 200)}`)
    }
    const data = await response.json() as { results?: Array<{ url?: string; title?: string; highlights?: string[] }> }
    const sources: SearchSource[] = []
    for (const result of data.results ?? []) {
      if (!result.url) continue
      const source: SearchSource = { url: result.url }
      if (result.title) source.title = String(result.title)
      const snippet = (result.highlights ?? []).find(h => h.trim().length > 0)
      if (snippet) source.snippet = cleanSnippet(snippet)
      sources.push(source)
    }
    return { sources: uniqueSources(sources, maxResults), truncated: false }
  })
}

export async function searchExa(
  query: string,
  maxResults: number,
  options: SearchOptions = {},
  signal?: AbortSignal,
): Promise<SearchResult> {
  const apiKey = (await options.resolveApiKey?.('EXA_API_KEY')) ?? ''
  if (apiKey) return searchExaRest(query, maxResults, apiKey, signal)
  return searchExaMcp(query, maxResults, signal)
}

/** Tavily: keyless anonymous quota without a key, account quota with one. */
export async function searchTavily(
  query: string,
  maxResults: number,
  options: SearchOptions = {},
  signal?: AbortSignal,
): Promise<SearchResult> {
  return withTimeout(15_000, signal, async (effSignal) => {
    const apiKey = (await options.resolveApiKey?.('TAVILY_API_KEY')) ?? ''
    const response = await fetch(TAVILY_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        ...(apiKey ? { authorization: `Bearer ${apiKey}` } : { 'x-tavily-access-mode': 'keyless' }),
      },
      body: JSON.stringify({ query, max_results: Math.min(maxResults, 20), search_depth: 'basic' }),
      signal: effSignal,
      redirect: 'error',
    })
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      if (response.status === 401) throw new Error('Tavily API key is invalid (HTTP 401)')
      throw new Error(`Tavily API error (HTTP ${response.status}): ${detail.slice(0, 200)}`)
    }
    const data = await response.json() as { results?: Array<{ url?: string; title?: string | undefined; content?: string | undefined }> }
    const sources = (data.results ?? [])
      .filter((r): r is { url: string; title?: string | undefined; content?: string | undefined } => Boolean(r.url))
      .map(r => {
        const s: SearchSource = { url: r.url }
        if (r.title) s.title = String(r.title)
        if (r.content) s.snippet = cleanSnippet(String(r.content))
        return s
      })
    return { sources: uniqueSources(sources, maxResults), truncated: false }
  })
}

export async function searchKeenable(
  query: string,
  maxResults: number,
  options: SearchOptions = {},
  signal?: AbortSignal,
): Promise<SearchResult> {
  const apiKey = (await options.resolveApiKey?.('KEENABLE_API_KEY')) ?? ''
  if (apiKey) {
    return withTimeout(20_000, signal, async (effSignal) => {
      const response = await fetch(KEENABLE_URL, {
        method: 'POST',
        headers: { 'x-api-key': apiKey, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ query, mode: 'realtime' }),
        signal: effSignal,
      })
      if (!response.ok) {
        const detail = await response.text().catch(() => '')
        if (response.status === 401) throw new Error('Keenable API key is invalid (HTTP 401)')
        throw new Error(`Keenable API error (HTTP ${response.status}): ${detail.slice(0, 200)}`)
      }
      const data = await response.json() as { results?: Array<{ url?: string; title?: string | undefined; snippet?: string | undefined; description?: string | undefined }> }
      const sources = (data.results ?? [])
        .filter((r): r is { url: string; title?: string | undefined; snippet?: string | undefined; description?: string | undefined } => Boolean(r.url))
        .map(r => {
          const s: SearchSource = { url: r.url }
          if (r.title) s.title = String(r.title)
          if (r.snippet ?? r.description) s.snippet = cleanSnippet(String(r.snippet ?? r.description))
          return s
        })
      return { sources: uniqueSources(sources, maxResults), truncated: false }
    })
  }
  return withTimeout(25_000, signal, async (effSignal) => {
    const response = await fetch(KEENABLE_MCP_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify(mcpCallTool('search_web_pages', { query })),
      signal: effSignal,
    })
    if (!response.ok) throw new Error(`Keenable MCP error (HTTP ${response.status})`)
    const data = await response.json() as McpResponse
    if (data.error) throw new Error(`Keenable MCP error: ${data.error.message ?? 'unknown'}`)
    const text = parseMcpTextBlocks(data)
    if (data.result?.isError) throw new Error(`Keenable MCP error: ${text.slice(0, 200)}`)
    return { sources: parseTitleUrlBlocks(text, maxResults, 'Snippets'), truncated: false }
  })
}

export async function searchPerplexity(
  query: string,
  maxResults: number,
  options: SearchOptions = {},
  signal?: AbortSignal,
): Promise<SearchResult> {
  const apiKey = (await options.resolveApiKey?.('PERPLEXITY_API_KEY')) ?? ''
  if (!apiKey) throw new Error('Perplexity requires PERPLEXITY_API_KEY in ~/.dsh/.credentials.yaml')
  return withTimeout(20_000, signal, async (effSignal) => {
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      redirect: 'error',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ model: 'sonar', max_tokens: 1024, messages: [{ role: 'user', content: query }] }),
      signal: effSignal,
    })
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      if (response.status === 401) throw new Error('Perplexity API key is invalid (HTTP 401)')
      throw new Error(`Perplexity API error (HTTP ${response.status}): ${detail.slice(0, 200)}`)
    }
    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }>; citations?: string[] }
    const answer = data.choices?.[0]?.message?.content ?? ''
    const sources = (data.citations ?? []).map(url => {
      const s: SearchSource = { url }
      if (answer) s.snippet = cleanSnippet(answer).slice(0, 200)
      return s
    })
    return { sources: uniqueSources(sources, maxResults), truncated: false }
  })
}

export async function searchDeepSeekOfficial(
  query: string,
  maxResults: number,
  options: SearchOptions = {},
  signal?: AbortSignal,
): Promise<SearchResult> {
  const apiKey = (await options.resolveApiKey?.('DEEPSEEK_API_KEY')) ?? ''
  if (!apiKey) throw new Error('DeepSeek requires DEEPSEEK_API_KEY in ~/.dsh/.credentials.yaml')
  return withTimeout(20_000, signal, async (effSignal) => {
    const response = await fetch('https://api.deepseek.com/anthropic/v1/messages', {
      method: 'POST',
      redirect: 'error',
      headers: {
        'x-api-key': apiKey,
        authorization: `Bearer ${apiKey}`,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        model: 'deepseek-v4-flash',
        max_tokens: 4096,
        messages: [{ role: 'user', content: [{ type: 'text', text: `Perform a web search for the query: ${query}` }] }],
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 1 }],
      }),
      signal: effSignal,
    })
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      if (response.status === 401) throw new Error('DeepSeek API key is invalid (HTTP 401)')
      throw new Error(`DeepSeek API error (HTTP ${response.status}): ${detail.slice(0, 200)}`)
    }
    const data = await response.json() as {
      content?: Array<
        | { type: 'web_search_tool_result'; content?: Array<{ type?: string; url?: string; title?: string }> }
        | { type: 'text'; citations?: Array<{ url?: string; cited_text?: string }> }
      >
    }
    const snippets = new Map<string, string>()
    for (const block of data.content ?? []) {
      if (block.type !== 'text') continue
      for (const cite of block.citations ?? []) {
        if (cite.url && cite.cited_text && !snippets.has(cite.url)) snippets.set(cite.url, cite.cited_text)
      }
    }
    const sources: SearchSource[] = []
    for (const block of data.content ?? []) {
      if (block.type !== 'web_search_tool_result') continue
      for (const item of block.content ?? []) {
        if (item.type !== 'web_search_result' || !item.url) continue
        if (sources.some(s => s.url === item.url)) continue
        const s: SearchSource = { url: item.url }
        if (item.title) s.title = item.title
        const snip = snippets.get(item.url)
        if (snip) s.snippet = cleanSnippet(snip)
        sources.push(s)
      }
    }
    return { sources: uniqueSources(sources, maxResults), truncated: false }
  })
}

const CACHE_MAX_ENTRIES = 50
const CACHE_TTL_MS = 5 * 60 * 1000
const cache = new Map<string, { value: SearchResult; expiresAt: number }>()

function cacheGet(key: string): SearchResult | null {
  const hit = cache.get(key)
  if (!hit) return null
  if (hit.expiresAt <= Date.now()) {
    cache.delete(key)
    return null
  }
  cache.delete(key)
  cache.set(key, hit)
  return { ...hit.value, sources: hit.value.sources.slice() }
}

function cacheSet(key: string, value: SearchResult): void {
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS })
  if (cache.size > CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value
    if (oldest !== undefined) cache.delete(oldest)
  }
}

/** Live view of the search-related settings fields. */
export interface SearchProviderConfig {
  searchEnabled?: boolean | undefined
  searchEngine?: SearchEngineId | undefined
  bingMarket?: string | undefined
}

export interface SearchProviderOptions {
  /** Reads the current settings document (called per search, so edits apply live). */
  readConfig(): SearchProviderConfig
  /** Resolves engine keys from the credentials center, then the environment. */
  resolveApiKey?: CredentialResolver
}

type EngineCall = (query: string, maxResults: number, options: SearchOptions, signal?: AbortSignal) => Promise<SearchResult>

/**
 * Build the provider registered into `ctx.web`. The preferred engine comes
 * from settings; any engine that fails (rate limit, invalid key, network)
 * falls through to the next one, so search never hard-fails on one engine.
 */
export function createSearchProvider(options: SearchProviderOptions): {
  id: string
  available(): boolean
  search(request: { query: string; maxResults?: number }, signal?: AbortSignal): Promise<SearchResult>
} {
  const engines: Record<SearchEngineId, EngineCall> = {
    bing: (q, n, o, s) => searchBing(q, n, { bingMarket: o.bingMarket }, s),
    ddg: (q, n, _o, s) => searchDdgLite(q, n, s),
    exa: (q, n, o, s) => searchExa(q, n, o, s),
    tavily: (q, n, o, s) => searchTavily(q, n, o, s),
    keenable: (q, n, o, s) => searchKeenable(q, n, o, s),
    perplexity: (q, n, o, s) => searchPerplexity(q, n, o, s),
    deepseek: (q, n, o, s) => searchDeepSeekOfficial(q, n, o, s),
  }
  return {
    id: SEARCH_PROVIDER_ID,
    available(): boolean {
      // Live gate: the harness consults this before exposing web_search, so
      // turning the feature off in Settings removes the takeover instantly.
      return options.readConfig().searchEnabled === true
    },
    async search(request: { query: string; maxResults?: number }, signal?: AbortSignal): Promise<SearchResult> {
      if (options.readConfig().searchEnabled !== true) {
        throw new Error('Web search is disabled in UI Tweaks settings')
      }
      if (typeof request?.query !== 'string' || request.query.trim().length === 0) {
        throw new Error('query is required')
      }
      const query = request.query.trim()
      const maxResults = Math.min(Math.max(request.maxResults ?? 5, 1), 10)
      const config = options.readConfig()
      // An invalid stored engine id (e.g. hand-edited settings.yaml) falls
      // back to Bing instead of producing a bogus chain entry.
      const configured = config.searchEngine
      const preferred = configured !== undefined && ENGINE_ORDER.includes(configured) ? configured : 'bing'
      const chain = [preferred, ...ENGINE_ORDER.filter(id => id !== preferred)]
      const searchOptions: SearchOptions = { bingMarket: config.bingMarket, resolveApiKey: options.resolveApiKey }
      const cacheKey = `${query}\u0000${maxResults}\u0000${preferred}`
      const hit = cacheGet(cacheKey)
      if (hit) return hit

      let lastError: unknown
      for (const engine of chain) {
        // Engines without a keyless fallback are skipped before any request
        // when their key is missing, so the chain moves on without noise.
        const requiredKey = REQUIRED_API_KEYS[engine]
        if (requiredKey !== undefined && options.resolveApiKey !== undefined) {
          const key = await options.resolveApiKey(requiredKey)
          if (!key) continue
        }
        try {
          const result = await engines[engine](query, maxResults, searchOptions, signal)
          if (result.sources.length > 0) {
            cacheSet(cacheKey, { sources: result.sources, truncated: false })
            return {
              sources: result.sources,
              truncated: false,
              engine,
              ...(engine !== preferred ? { content: `Note: ${preferred} unavailable or failed, using ${engine}.` } : {}),
            }
          }
          lastError = new Error(`engine "${engine}" returned 0 results`)
        } catch (error) {
          lastError = error
        }
      }
      throw lastError ?? new Error('all search engines failed')
    },
  }
}
