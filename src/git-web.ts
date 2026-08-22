/**
 * dsh-ui-tweaks — Git Web routes.
 *
 * Same-origin JSON endpoints backing the GitBar browser half. Every mutating
 * action is a POST guarded by the same origin/same-site checks as the Settings
 * route; the session id arrives as a query/body field and the backend resolves
 * the working directory from the session header.
 *
 * The terminal panel rides two extra surfaces on the same prefix:
 * - `GET /vendor/<file>` serves the vendored xterm.js UMD builds the browser
 *   half lazy-loads on first panel open (whitelist only — no path traversal).
 * - `WS /terminal-ws` upgrades into the persistent PTY bridge: server→client
 *   frames are RAW pty output (plus one JSON `{"type":"exit"}` notice),
 *   client→server frames are JSON (`input` / `resize` / `close`) so a pasted
 *   brace can never be mistaken for a control frame.
 * @module dsh-ui-tweaks/git-web
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { readFileSync } from 'node:fs'
import type { Duplex } from 'node:stream'
import type { Context } from '@deepseek-ai/cordis'
// Type-only import activates the optional webServer Context declaration.
import type {} from '@deepseek-ai/dsh-host-webserver'
import { WebSocketServer, WebSocket } from 'ws'
import { sameOriginPost } from './web.ts'
import { GitBackend, type TerminalClient } from './git.ts'

/** Route prefix shared with the browser half. */
export const GIT_ROUTE = '/_dsh/ui-tweaks/git'

/** Exact path of the terminal WebSocket upgrade route. */
export const TERMINAL_WS_PATH = `${GIT_ROUTE}/terminal-ws`

const MAX_BODY_BYTES = 64 * 1024

/** Vendored browser assets served from the plugin's `vendor/` directory. */
const VENDOR_FILES: Record<string, { type: string }> = {
  'xterm.js': { type: 'text/javascript; charset=utf-8' },
  'addon-fit.js': { type: 'text/javascript; charset=utf-8' },
  'xterm.css': { type: 'text/css; charset=utf-8' },
}

function json<T>(res: ServerResponse, status: number, body: { ok: true; value: T } | { ok: false; error: { code: string; message: string } }): void {
  const bytes = Buffer.from(JSON.stringify(body))
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Content-Length', String(bytes.length))
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.writeHead(status)
  res.end(bytes)
}

function ok<T>(res: ServerResponse, value: T): void {
  json(res, 200, { ok: true, value })
}

function fail(res: ServerResponse, status: number, code: string, message: string): void {
  json(res, status, { ok: false, error: { code, message } })
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

/** Read a bounded JSON POST body. */
async function readJson(req: IncomingMessage): Promise<unknown> {
  const contentType = req.headers['content-type']?.split(';', 1)[0]?.trim().toLowerCase()
  if (contentType !== 'application/json') throw new TypeError('Content-Type must be application/json')
  const chunks: Buffer[] = []
  let bytes = 0
  for await (const chunk of req) {
    const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    bytes += part.length
    if (bytes > MAX_BODY_BYTES) throw new RangeError('request body too large')
    chunks.push(part)
  }
  if (chunks.length === 0) throw new TypeError('request body is empty')
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined
}

/** URL-decoded session/workspace + file query params, with a sane file length cap. */
function queryParams(req: IncomingMessage): { session?: string | undefined; ws?: string | undefined; file?: string | undefined; mode?: string | undefined } {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const file = url.searchParams.get('file')
  return {
    session: str(url.searchParams.get('session')),
    ws: str(url.searchParams.get('ws')),
    file: file !== null && file.length <= 4096 ? file : undefined,
    mode: str(url.searchParams.get('mode')),
  }
}

/** Validate that a POST body carries the expected string fields. */
function requireFields<K extends string>(body: unknown, fields: readonly K[]): Record<K, string> {
  if (!isRecord(body)) throw new TypeError('request body must be an object')
  const out = {} as Record<K, string>
  for (const field of fields) {
    const value = body[field]
    if (typeof value !== 'string' || value === '') throw new TypeError(`field "${field}" must be a non-empty string`)
    out[field] = value
  }
  return out
}

/**
 * Same-origin Git endpoints. GETs are read-only; POSTs mutate the repository
 * and reject cross-site requests.
 */
export class GitWebHandler {
  constructor(private readonly backend: GitBackend) {}

  async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const path = url.pathname

    if (req.method === 'GET') {
      // Vendored xterm builds for the terminal panel (exact-name whitelist).
      if (path.startsWith(`${GIT_ROUTE}/vendor/`)) {
        this.serveVendor(res, path.slice(`${GIT_ROUTE}/vendor/`.length))
        return
      }

      const { session, ws, file, mode } = queryParams(req)

      try {
        const cwd = this.backend.resolveTargetCwd({ session, ws })
        if (cwd === undefined) {
          ok(res, { isRepo: false })
          return
        }
        if (path === `${GIT_ROUTE}/status`) {
          ok(res, await this.backend.snapshot(cwd))
          return
        }
        if (path === `${GIT_ROUTE}/branches`) {
          ok(res, await this.backend.branches(cwd))
          return
        }
        if (path === `${GIT_ROUTE}/diff`) {
          if (file === undefined) throw new TypeError('file query parameter is required')
          if (mode !== 'hunk' && mode !== 'full') throw new TypeError('mode must be "hunk" or "full"')
          ok(res, await this.backend.diff(cwd, file, mode))
          return
        }
        if (path === `${GIT_ROUTE}/graph`) {
          const raw = url.searchParams.get('limit')
          const limit = raw === null ? undefined : Number(raw)
          ok(res, await this.backend.graph(cwd, limit))
          return
        }
      } catch (error) {
        fail(res, 400, 'git-request-failed', messageOf(error))
        return
      }
      fail(res, 404, 'not-found', 'unknown git endpoint')
      return
    }

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST')
      fail(res, 405, 'method-not-allowed', 'Use GET or POST')
      return
    }
    if (!sameOriginPost(req)) {
      fail(res, 403, 'origin-rejected', 'The request must originate from this DSH Web application')
      return
    }

    let body: unknown
    try {
      body = await readJson(req)
    } catch (error) {
      fail(res, error instanceof RangeError ? 413 : 400, 'invalid-request', messageOf(error))
      return
    }
    const session = isRecord(body) ? str(body.session) : undefined
    const ws = isRecord(body) ? str(body.ws) : undefined

    try {
      if (path === `${GIT_ROUTE}/open`) {
        const fields = requireFields(body, ['target'])
        if (fields.target !== 'explorer' && fields.target !== 'vscode' && fields.target !== 'idea'
          && fields.target !== 'goland' && fields.target !== 'webstorm' && fields.target !== 'pycharm') {
          throw new TypeError('target must be "explorer", "vscode", "idea", "goland", "webstorm" or "pycharm"')
        }
        const cwd = this.requireCwd({ session, ws })
        await this.backend.openFolder(cwd, fields.target as 'explorer' | 'vscode' | 'idea' | 'goland' | 'webstorm' | 'pycharm')
        ok(res, { opened: fields.target })
        return
      }
      if (path === `${GIT_ROUTE}/commit`) {
        const fields = requireFields(body, ['message'])
        const push = isRecord(body) && body.push === true
        const exclude = isRecord(body) && Array.isArray(body.exclude)
          ? body.exclude.filter((entry): entry is string => typeof entry === 'string' && entry !== '')
          : undefined
        const cwd = this.requireCwd({ session, ws })
        ok(res, await this.backend.commit(cwd, fields.message, {
          push,
          ...(exclude !== undefined && exclude.length > 0 ? { exclude } : {}),
        }))
        return
      }
      if (path === `${GIT_ROUTE}/push`) {
        const cwd = this.requireCwd({ session, ws })
        await this.backend.push(cwd)
        ok(res, { pushed: true })
        return
      }
      if (path === `${GIT_ROUTE}/checkout`) {
        const fields = requireFields(body, ['branch'])
        const cwd = this.requireCwd({ session, ws })
        await this.backend.checkout(cwd, fields.branch)
        ok(res, { branch: fields.branch })
        return
      }
      if (path === `${GIT_ROUTE}/create`) {
        const fields = requireFields(body, ['name'])
        const base = isRecord(body) ? str(body.base) : undefined
        const pushRemote = isRecord(body) && body.push === true
        const cwd = this.requireCwd({ session, ws })
        await this.backend.createBranch(cwd, fields.name, base, pushRemote)
        ok(res, { branch: fields.name, pushed: pushRemote })
        return
      }
      if (path === `${GIT_ROUTE}/branch-delete`) {
        const fields = requireFields(body, ['name'])
        const cwd = this.requireCwd({ session, ws })
        await this.backend.deleteBranch(cwd, fields.name)
        ok(res, { branch: fields.name })
        return
      }
      if (path === `${GIT_ROUTE}/remote-delete`) {
        const fields = requireFields(body, ['name'])
        const cwd = this.requireCwd({ session, ws })
        await this.backend.deleteRemoteBranch(cwd, fields.name)
        ok(res, { branch: fields.name })
        return
      }
      if (path === `${GIT_ROUTE}/suggest`) {
        const cwd = this.requireCwd({ session, ws })
        // `via` / `reason` let the UI say when the offline heuristic wrote the
        // message; `message` stays the first-class field.
        ok(res, await this.backend.suggestDetailed(cwd))
        return
      }
    } catch (error) {
      fail(res, 400, 'git-action-failed', messageOf(error))
      return
    }
    fail(res, 404, 'not-found', 'unknown git endpoint')
  }

  private requireCwd(target: { session?: string | undefined; ws?: string | undefined }): string {
    const cwd = this.backend.resolveTargetCwd(target)
    if (cwd === undefined) throw new Error('no working directory for this session')
    return cwd
  }

  /** Serve one whitelisted vendored asset; anything else is a 404. */
  private serveVendor(res: ServerResponse, name: string): void {
    const entry = VENDOR_FILES[name]
    if (entry === undefined) {
      fail(res, 404, 'not-found', 'unknown vendor asset')
      return
    }
    try {
      // import.meta.url = <packageRoot>/lib/git-web.js → ../vendor = package
      // root's vendor/ directory (ships in the npm `files` list).
      const body = readFileSync(new URL(`../vendor/${name}`, import.meta.url))
      res.setHeader('Content-Type', entry.type)
      res.setHeader('Content-Length', String(body.length))
      res.setHeader('Cache-Control', 'public, max-age=86400')
      res.setHeader('X-Content-Type-Options', 'nosniff')
      res.writeHead(200)
      res.end(body)
    } catch (error) {
      fail(res, 500, 'vendor-read-failed', messageOf(error))
    }
  }
}

/** Registry key for one target's terminal: `session:<id>` or `ws:<name>`. */
function terminalKeyOf(session: string | undefined, ws: string | undefined): string | undefined {
  if (session !== undefined) return `session:${session}`
  if (ws !== undefined) return `ws:${ws}`
  return undefined
}

/** Clamp an integer query param into [min, max], falling back to `fallback`. */
function intParam(url: URL, name: string, fallback: number, min: number, max: number): number {
  const raw = url.searchParams.get(name)
  const parsed = raw === null ? Number.NaN : Number(raw)
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) return fallback
  return parsed
}

/**
 * Attach the Git routes plus the terminal WebSocket whenever a webServer
 * service is present.
 * @param ctx - plugin context owning route effects.
 * @param backend - Git backend.
 */
export function installGitWeb(ctx: Context, backend: GitBackend): void {
  ctx.inject(['webServer'], (webCtx) => {
    webCtx.effect(() => {
      const handler = new GitWebHandler(backend)
      return webCtx.webServer.register({
        kind: 'prefix',
        path: GIT_ROUTE,
        handler: (req, res) => handler.handle(req, res),
      })
    }, 'dsh-ui-tweaks: Git routes')

    // ── Terminal WebSocket ────────────────────────────────────────────────
    // One upgrade endpoint bridges xterm.js in the browser to the target's
    // persistent PTY. Wire protocol (mirrors dsh-better-sidebar):
    //   server → client: raw pty output chunks; one JSON {"type":"exit"} line
    //                    when the shell dies.
    //   client → server: JSON frames only — {"type":"input","data":...},
    //                    {"type":"resize",cols,rows}, {"type":"close"}.
    // On connect the host replays the session's transcript ring before live
    // data, so a panel reopen / page refresh restores the exact screen.
    webCtx.effect(() => {
      const wss = new WebSocketServer({ noServer: true })
      return webCtx.webServer.registerUpgrade({
        path: TERMINAL_WS_PATH,
        handler: (req, socket, head) => {
          const url = new URL(req.url ?? '/', 'http://localhost')
          const session = str(url.searchParams.get('session'))
          const wsName = str(url.searchParams.get('ws'))
          const key = terminalKeyOf(session, wsName)
          const cwd = key === undefined ? undefined : backend.resolveTargetCwd({ session, ws: wsName })
          if (key === undefined || cwd === undefined) {
            socket.destroy()
            return
          }
          wss.handleUpgrade(req as IncomingMessage, socket as unknown as Duplex, head as Buffer, (ws) => {
            attachTerminalSocket(backend, key, cwd, {
              cols: intParam(url, 'cols', 80, 2, 500),
              rows: intParam(url, 'rows', 24, 2, 200),
            }, ws)
          })
        },
      })
    }, 'dsh-ui-tweaks: terminal WebSocket')

    webCtx.effect(() => () => {
      backend.terminals.disposeAll()
    }, 'dsh-ui-tweaks: terminal teardown')
  })
}

/** Bridge one upgraded browser socket to the target's PTY session. */
function attachTerminalSocket(backend: GitBackend, key: string, cwd: string, dims: { cols: number; rows: number }, ws: WebSocket): void {
  if (backend.terminals.unavailable) {
    ws.close(1011, 'pty-unavailable')
    return
  }
  const client: TerminalClient = {
    send: (text) => { ws.send(text) },
    get alive(): boolean { return ws.readyState === WebSocket.OPEN },
  }
  let session
  try {
    session = backend.terminals.attach(key, cwd, dims.cols, dims.rows, client)
  } catch (error) {
    ws.close(1011, messageOf(error).slice(0, 120))
    return
  }
  // Replay what the shell printed before this socket attached (a fresh spawn
  // has an empty ring). Synchronous, so it lands ahead of any live chunk.
  if (session.transcript !== '') ws.send(session.transcript)

  ws.on('message', (raw) => {
    const text = typeof raw === 'string' ? raw : raw.toString('utf8')
    if (text.startsWith('{')) {
      try {
        const frame = JSON.parse(text) as { type?: unknown; data?: unknown; cols?: unknown; rows?: unknown }
        if (frame.type === 'input' && typeof frame.data === 'string') {
          backend.terminals.input(key, frame.data)
          return
        }
        if (frame.type === 'resize' && typeof frame.cols === 'number' && typeof frame.rows === 'number') {
          backend.terminals.resize(key, frame.cols, frame.rows)
          return
        }
        if (frame.type === 'close') {
          backend.terminals.close(key)
          ws.close(1000)
          return
        }
      } catch {
        // Malformed JSON that starts with '{' falls through as literal input —
        // a user pasting braces into the shell must still work.
      }
    }
    backend.terminals.input(key, text)
  })
  ws.on('close', () => {
    backend.terminals.detach(key, client)
  })
  ws.on('error', () => {
    // 'close' always follows; nothing else to clean here.
  })
}
