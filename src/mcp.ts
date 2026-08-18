/**
 * dsh-ui-tweaks — MCP manager (host half).
 *
 * The browser MCP manager (the "MCP 管理" settings section, shown when the
 * mcpManagerEnabled setting is on) manages the configured MCP servers through
 * this same-origin route:
 *
 * - **list** — every `@deepseek-ai/dsh-mcp-client` loader entry with its live
 *   fiber status (active / failed / loading / stopped / disabled), its config
 *   (serverName, transport, command / url, env), a YAML rendering of the
 *   config (for the YAML editor), and the tools it registered
 *   (`mcp__<serverName>__*`) counted from the tool registry.
 * - **save / remove / set-enabled** — ADD, EDIT, DELETE, and ENABLE/DISABLE a
 *   server durably by editing the profile's own `cordis.patch.yml` (the same
 *   file the user edits by hand): the entry is inserted / replaced / removed /
 *   flagged `disabled`, the file is written atomically, and DSH's built-in
 *   patch watcher (`watchUserPatches`, Cordis HMR) hot-reloads the loader, so
 *   the MCP server starts / stops / restarts live. The loader tree itself is
 *   never rewritten, so the patch file stays the single source of truth.
 *
 * Env values are returned to the same-origin browser (the user's own machine
 * and config) because the editor must be able to show and modify them.
 * @module dsh-ui-tweaks/mcp
 */

import { readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse, parseDocument, stringify, Document, YAMLMap, YAMLSeq } from 'yaml'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
// Type-only import activates the webServer Context declaration.
import type {} from '@deepseek-ai/dsh-host-webserver'
import { isRecord, json, messageOf, readJson, requestError, sameOriginPost } from './web.ts'

/** Exact route used by the browser MCP manager. */
export const MCP_ROUTE = '/_dsh/ui-tweaks/mcp'

/** Module specifier of the MCP client plugin; its loader entries are the MCP servers. */
const MCP_MODULE = '@deepseek-ai/dsh-mcp-client'

/** Lifecycle status of one MCP server instance. */
export type McpStatus = 'disabled' | 'stopped' | 'active' | 'failed' | 'loading'

/** Public view of one configured MCP server. */
export interface McpServerView {
  /** Loader entry id (e.g. `mcp-mysql-local`). */
  id: string
  /** The server's tool namespace (`mcp__<serverName>__*`). */
  serverName: string
  transport: string
  command?: string
  args: string[]
  url?: string
  headers: Record<string, string>
  env: Record<string, string>
  /** Per-tool-call timeout in milliseconds. */
  toolCallTimeoutMs?: number
  /** The server's config rendered as YAML (for the YAML editor). */
  yaml: string
  disabled: boolean
  status: McpStatus
  toolCount: number
  /** Raw tool names registered by this server, sorted. */
  tools: string[]
}

/** Editor payload for add/edit/set-enabled. */
export interface McpServerInput {
  id: string
  serverName: string
  transport: 'stdio' | 'streamable-http'
  command?: string
  args?: string[]
  url?: string
  headers?: Record<string, string>
  env?: Record<string, string>
  toolCallTimeoutMs?: number
  disabled: boolean
}

export interface McpSnapshot {
  servers: McpServerView[]
}

type McpRequest =
  | { action: 'remove'; id: string }
  | { action: 'set-enabled'; id: string; enabled: boolean }
  | { action: 'save'; server: McpServerInput }

/** Structural face of one Cordis loader entry (see cordis-plugin-loader). */
interface LoaderEntryLike {
  id: string
  options: { id?: string; name?: string; config?: Record<string, unknown> }
  fiber?: { state?: number } | null
  disabled: boolean
}

/** Structural face of the Cordis Loader service. */
interface LoaderLike {
  config?: { baseUrl?: string }
  entries(): Iterable<LoaderEntryLike>
}

function statusOf(disabled: boolean, fiber: LoaderEntryLike['fiber']): McpStatus {
  if (disabled) return 'disabled'
  if (fiber === undefined || fiber === null) return 'stopped'
  // Cordis FiberState: 0 pending, 1 loading, 2 active, 3 failed, 4 disposed, 5 unloading.
  if (fiber.state === 2) return 'active'
  if (fiber.state === 3) return 'failed'
  return 'loading'
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function asStringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {}
  const out: Record<string, string> = {}
  for (const [key, val] of Object.entries(value)) if (typeof val === 'string') out[key] = val
  return out
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

/** Same-origin MCP read/write handler. */
export class McpBackend {
  constructor(private readonly ctx: Context) {}

  private loader(): LoaderLike | undefined {
    return this.ctx.get('loader') as unknown as LoaderLike | undefined
  }

  /** Best-effort enumeration of the global tool registry (no public list API). */
  private toolNames(): Set<string> {
    const tools = this.ctx.get('tools') as unknown as { layers?: { global?: { tools?: Map<string, unknown> } } } | undefined
    try {
      return new Set(tools?.layers?.global?.tools?.keys() ?? [])
    } catch {
      return new Set()
    }
  }

  private snapshot(): McpSnapshot {
    const loader = this.loader()
    const tools = this.toolNames()
    const servers: McpServerView[] = []
    if (loader === undefined) return { servers }
    for (const entry of loader.entries()) {
      if (entry.options.name !== MCP_MODULE) continue
      // The loader entry id carries the tree path (e.g. `include:mcp-mysql-local`);
      // the raw `options.id` is the patch-file identity (`mcp-mysql-local`).
      const id = entry.options.id ?? entry.id
      const config = entry.options.config ?? {}
      const serverName = asString(config.serverName) ?? id
      const transport = asString(config.transport) ?? 'stdio'
      const prefix = `mcp__${serverName}__`
      const serverTools: string[] = []
      for (const name of tools) if (name.startsWith(prefix)) serverTools.push(name.slice(prefix.length))
      serverTools.sort()
      const command = asString(config.command)
      const url = asString(config.url)
      const toolCallTimeoutMs = typeof config.toolCallTimeoutMs === 'number' && Number.isFinite(config.toolCallTimeoutMs)
        ? config.toolCallTimeoutMs
        : undefined
      let yamlText = ''
      try {
        yamlText = stringify(config)
      } catch {
        yamlText = ''
      }
      servers.push({
        id,
        serverName,
        transport,
        ...(command !== undefined ? { command } : {}),
        args: asStringArray(config.args),
        ...(url !== undefined ? { url } : {}),
        headers: asStringRecord(config.headers),
        env: asStringRecord(config.env),
        ...(toolCallTimeoutMs !== undefined ? { toolCallTimeoutMs } : {}),
        yaml: yamlText,
        disabled: entry.disabled,
        status: statusOf(entry.disabled, entry.fiber),
        toolCount: serverTools.length,
        tools: serverTools,
      })
    }
    return { servers }
  }

  // -------------------------------------------------------------------------
  // Durable patch-file persistence (the profile's cordis.patch.yml)
  // -------------------------------------------------------------------------

  /** Resolve the profile directory: the root Include entry's config.path is
   * the profile's `cordis.yml` (a `file://` URL), whose parent IS the profile
   * directory. Falls back to the loader's baseUrl. */
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

  /** Find one MCP entry in the patch document; also reports its insert seq, index, and owning patch. */
  private findPatchEntry(doc: Document, id: string): { entry: YAMLMap; seq: YAMLSeq; index: number; patch: YAMLMap } | undefined {
    const contents = doc.contents
    if (!(contents instanceof YAMLSeq)) return undefined
    for (const patch of contents.items) {
      if (!(patch instanceof YAMLMap)) continue
      const insert = patch.get('insert', true)
      if (!(insert instanceof YAMLSeq)) continue
      for (let index = 0; index < insert.items.length; index += 1) {
        const entry = insert.items[index]
        if (!(entry instanceof YAMLMap)) continue
        if (entry.get('id', false) === id) return { entry, seq: insert, index, patch }
      }
    }
    return undefined
  }

  /** The insert seq new MCP entries should join (first one already holding MCP entries, else the first insert). */
  private insertTarget(doc: Document): YAMLSeq {
    const contents = doc.contents
    if (!(contents instanceof YAMLSeq)) throw new Error('profile patch file is not a YAML array')
    let firstInsert: YAMLSeq | undefined
    for (const patch of contents.items) {
      if (!(patch instanceof YAMLMap)) continue
      const insert = patch.get('insert', true)
      if (!(insert instanceof YAMLSeq)) continue
      firstInsert ??= insert
      for (const entry of insert.items) {
        if (entry instanceof YAMLMap && entry.get('name', false) === MCP_MODULE) return insert
      }
    }
    if (firstInsert !== undefined) return firstInsert
    // No insert section at all: append a new patch `- insert:` with one entry.
    const fresh = doc.createNode({ insert: [] }) as YAMLMap
    contents.add(fresh)
    const insert = fresh.get('insert', true)
    if (!(insert instanceof YAMLSeq)) throw new Error('failed to create an insert section in the profile patch file')
    return insert
  }

  private entryNode(doc: Document, input: McpServerInput): unknown {
    const entry: Record<string, unknown> = {
      id: input.id,
      name: MCP_MODULE,
      config: buildConfig(input),
    }
    if (input.disabled) entry.disabled = true
    return doc.createNode(entry)
  }

  private async mutatePatchFile(mutate: (doc: Document) => void): Promise<void> {
    const path = this.patchFilePath()
    let doc: Document
    try {
      doc = parseDocument(await readFile(path, 'utf8'))
    } catch (error) {
      throw new Error(`failed to read profile patch file: ${messageOf(error)}`)
    }
    if (!(doc.contents instanceof YAMLSeq) || doc.contents.items.length === 0) {
      doc.contents = doc.createNode([])
    }
    mutate(doc)
    const tmp = `${path}.${process.pid}.tmp`
    try {
      await writeFile(tmp, doc.toString(), 'utf8')
      await rename(tmp, path)
    } catch (error) {
      throw new Error(`failed to write profile patch file: ${messageOf(error)}`)
    }
  }

  private validateInput(input: McpServerInput): void {
    if (!isRecord(input)) throw new TypeError('server must be an object')
    if (typeof input.id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/u.test(input.id)) {
      throw new TypeError('实例 ID 只能包含字母、数字、- 和 _（1–64 字符）')
    }
    if (typeof input.serverName !== 'string' || !/^[A-Za-z0-9_-]{1,32}$/u.test(input.serverName)) {
      throw new TypeError('服务器名称只能包含字母、数字、- 和 _（1–32 字符）')
    }
    if (input.transport !== 'stdio' && input.transport !== 'streamable-http') {
      throw new TypeError('transport 必须是 stdio 或 streamable-http')
    }
    if (input.toolCallTimeoutMs !== undefined && (!Number.isInteger(input.toolCallTimeoutMs) || input.toolCallTimeoutMs <= 0)) {
      throw new TypeError('超时时间必须是正整数（毫秒）')
    }
    if (input.transport === 'streamable-http') {
      if (typeof input.url !== 'string' || !/^https?:\/\//u.test(input.url)) {
        throw new TypeError('URL 必须以 http:// 或 https:// 开头')
      }
    } else {
      if (typeof input.command !== 'string' || input.command.trim().length === 0) {
        throw new TypeError('启动命令不能为空')
      }
    }
  }

  /** Add or edit one server (upsert by id), persisting to the profile patch file. */
  private async save(input: McpServerInput): Promise<void> {
    this.validateInput(input)
    const serverNameTaken = (this.snapshot().servers.some(server =>
      server.serverName === input.serverName && server.id !== input.id))
    if (serverNameTaken) throw new Error(`服务器名称 ${input.serverName} 已被其他实例使用`)
    await this.mutatePatchFile((doc) => {
      const found = this.findPatchEntry(doc, input.id)
      if (found !== undefined) {
        // Replace the entry in place (edit), preserving its position.
        found.seq.items[found.index] = this.entryNode(doc, input) as YAMLMap
      } else {
        this.insertTarget(doc).add(this.entryNode(doc, input))
      }
    })
  }

  /** Delete one server from the profile patch file. */
  private async remove(id: string): Promise<void> {
    await this.mutatePatchFile((doc) => {
      const found = this.findPatchEntry(doc, id)
      if (found === undefined) throw new Error(`MCP server instance not found in patch file: ${id}`)
      found.seq.items.splice(found.index, 1)
      // Clean up an insert section / patch that became empty.
      const contents = doc.contents
      if (contents instanceof YAMLSeq) {
        const patchIndex = contents.items.findIndex(item => item === found.patch)
        if (found.seq.items.length === 0 && patchIndex >= 0) contents.items.splice(patchIndex, 1)
        // Keep the file a valid top-level array.
        if (contents.items.length === 0) doc.contents = doc.createNode([])
      }
    })
  }

  /** Enable or disable one server in the profile patch file. */
  private async setEnabled(id: string, enabled: boolean): Promise<void> {
    await this.mutatePatchFile((doc) => {
      const found = this.findPatchEntry(doc, id)
      if (found === undefined) throw new Error(`MCP server instance not found in patch file: ${id}`)
      if (enabled) found.entry.delete('disabled')
      else found.entry.set('disabled', true)
    })
  }

  /** Handle the exact MCP route. */
  async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method === 'GET') {
      try {
        json(res, 200, { ok: true, value: this.snapshot() })
      } catch (error) {
        this.ctx.logger.warn('dsh-ui-tweaks MCP snapshot failed: %s', messageOf(error))
        requestError(res, 503, 'mcp-unavailable', 'MCP manager is unavailable')
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
    let request: McpRequest
    try {
      request = parseRequest(await readJson(req))
    } catch (error) {
      requestError(res, 400, 'invalid-request', messageOf(error))
      return
    }
    try {
      if (request.action === 'remove') await this.remove(request.id)
      else if (request.action === 'set-enabled') await this.setEnabled(request.id, request.enabled)
      else await this.save(request.server)
      json(res, 200, { ok: true, value: this.snapshot() })
    } catch (error) {
      this.ctx.logger.warn('dsh-ui-tweaks MCP mutation failed: %s', messageOf(error))
      requestError(res, 400, 'mcp-rejected', messageOf(error))
    }
  }
}

function buildConfig(input: McpServerInput): Record<string, unknown> {
  const base: Record<string, unknown> = {
    transport: input.transport,
    serverName: input.serverName,
  }
  if (input.toolCallTimeoutMs !== undefined) base.toolCallTimeoutMs = input.toolCallTimeoutMs
  if (input.transport === 'streamable-http') {
    return {
      ...base,
      url: input.url ?? '',
      headers: input.headers ?? {},
    }
  }
  return {
    ...base,
    command: input.command ?? '',
    args: input.args ?? [],
    env: input.env ?? {},
  }
}

/** Config keys the MCP client plugin accepts; anything else is a typo and rejected. */
const ALLOWED_CONFIG_KEYS = new Set([
  'serverName', 'transport', 'command', 'args', 'env', 'cwd',
  'toolCallTimeoutMs', 'failOnStartupError', 'reconnect', 'url', 'headers',
])

/** Parse and validate one server config given as raw YAML text. */
function parseYamlConfig(source: string): Omit<McpServerInput, 'id' | 'disabled'> {
  let raw: unknown
  try {
    raw = parse(source)
  } catch (error) {
    throw new TypeError(`YAML 解析失败：${messageOf(error)}`)
  }
  if (!isRecord(raw)) throw new TypeError('YAML 必须是对象（一段 MCP 配置）')
  const unknownKeys = Object.keys(raw).filter(key => !ALLOWED_CONFIG_KEYS.has(key))
  if (unknownKeys.length > 0) {
    throw new TypeError(`YAML 包含未知字段：${unknownKeys.join(', ')}（允许：serverName, transport, command, args, env, cwd, toolCallTimeoutMs, failOnStartupError, reconnect, url, headers）`)
  }
  const transport = raw.transport === 'streamable-http' ? 'streamable-http' : raw.transport === 'stdio' ? 'stdio' : undefined
  if (transport === undefined) throw new TypeError('transport 必须是 stdio 或 streamable-http')
  if (typeof raw.serverName !== 'string' || !/^[A-Za-z0-9_-]{1,32}$/u.test(raw.serverName)) {
    throw new TypeError('serverName 只能包含字母、数字、- 和 _（1–32 字符）')
  }
  let toolCallTimeoutMs: number | undefined
  if (raw.toolCallTimeoutMs !== undefined) {
    if (typeof raw.toolCallTimeoutMs !== 'number' || !Number.isInteger(raw.toolCallTimeoutMs) || raw.toolCallTimeoutMs <= 0) {
      throw new TypeError('toolCallTimeoutMs 必须是正整数（毫秒）')
    }
    toolCallTimeoutMs = raw.toolCallTimeoutMs
  }
  if (transport === 'streamable-http') {
    if (typeof raw.url !== 'string' || !/^https?:\/\//u.test(raw.url)) throw new TypeError('url 必须以 http:// 或 https:// 开头')
    return {
      serverName: raw.serverName,
      transport,
      url: raw.url,
      headers: asStringRecord(raw.headers),
      ...(toolCallTimeoutMs !== undefined ? { toolCallTimeoutMs } : {}),
    }
  }
  if (typeof raw.command !== 'string' || raw.command.trim().length === 0) throw new TypeError('command 不能为空')
  return {
    serverName: raw.serverName,
    transport,
    command: raw.command,
    args: asStringArray(raw.args),
    env: asStringRecord(raw.env),
    ...(toolCallTimeoutMs !== undefined ? { toolCallTimeoutMs } : {}),
  }
}

function parseRequest(value: unknown): McpRequest {
  if (!isRecord(value)) throw new TypeError('request body must be an object')
  if (value.action === 'remove') {
    const id = value.id
    if (typeof id !== 'string' || id.length === 0) throw new TypeError('id must be a non-empty string')
    return { action: 'remove', id }
  }
  if (value.action === 'set-enabled') {
    const id = value.id
    if (typeof id !== 'string' || id.length === 0) throw new TypeError('id must be a non-empty string')
    if (typeof value.enabled !== 'boolean') throw new TypeError('enabled must be a boolean')
    return { action: 'set-enabled', id, enabled: value.enabled }
  }
  if (value.action === 'save') {
    const server = isRecord(value.server) ? value.server : undefined
    const disabled = server?.disabled === true
    const idRaw = typeof server?.id === 'string' ? server.id : undefined
    if (typeof value.yaml === 'string') {
      // YAML-mode save: the config is written as raw YAML text.
      if (typeof idRaw !== 'string' || idRaw.length === 0) throw new TypeError('save (yaml) requires server.id')
      return { action: 'save', server: { ...parseYamlConfig(value.yaml), id: idRaw, disabled } }
    }
    if (server === undefined) throw new TypeError('server must be an object')
    const input: McpServerInput = {
      id: server.id as string,
      serverName: server.serverName as string,
      transport: server.transport === 'streamable-http' ? 'streamable-http' : 'stdio',
      command: typeof server.command === 'string' ? server.command : '',
      args: Array.isArray(server.args) ? server.args.filter((arg): arg is string => typeof arg === 'string') : [],
      url: typeof server.url === 'string' ? server.url : '',
      headers: isRecord(server.headers) ? asStringRecord(server.headers) : {},
      env: isRecord(server.env) ? asStringRecord(server.env) : {},
      ...(typeof server.toolCallTimeoutMs === 'number' ? { toolCallTimeoutMs: server.toolCallTimeoutMs } : {}),
      disabled,
    }
    return { action: 'save', server: input }
  }
  throw new TypeError('action must be "remove", "set-enabled" or "save"')
}

/**
 * Attach the MCP route whenever a webServer service is present.
 * @param ctx - plugin context owning route effects.
 * @param backend - MCP handler.
 */
export function installMcpWeb(ctx: Context, backend: McpBackend): void {
  ctx.inject(['webServer'], (webCtx) => {
    webCtx.effect(() => {
      return webCtx.webServer.register({
        kind: 'exact',
        path: MCP_ROUTE,
        handler: (req, res) => backend.handle(req, res),
      })
    }, 'dsh-ui-tweaks: MCP routes')
  })
}
