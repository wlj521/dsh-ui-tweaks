/**
 * dsh-ui-tweaks — Git Web routes.
 *
 * Same-origin JSON endpoints backing the GitBar browser half. Every mutating
 * action is a POST guarded by the same origin/same-site checks as the Settings
 * route; the session id arrives as a query/body field and the backend resolves
 * the working directory from the session header.
 * @module dsh-ui-tweaks/git-web
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
// Type-only import activates the optional webServer Context declaration.
import type {} from '@deepseek-ai/dsh-host-webserver'
import { sameOriginPost } from './web.ts'
import { GitBackend } from './git.ts'

/** Route prefix shared with the browser half. */
export const GIT_ROUTE = '/_dsh/ui-tweaks/git'

const MAX_BODY_BYTES = 64 * 1024

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

/** URL-decoded session + file query params, with a sane file length cap. */
function queryParams(req: IncomingMessage): { session?: string | undefined; file?: string | undefined; mode?: string | undefined } {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const file = url.searchParams.get('file')
  return {
    session: str(url.searchParams.get('session')),
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
      const { session, file, mode } = queryParams(req)
      try {
        const cwd = this.backend.resolveCwd(session)
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

    try {
      if (path === `${GIT_ROUTE}/commit`) {
        const fields = requireFields(body, ['message'])
        const push = isRecord(body) && body.push === true
        const exclude = isRecord(body) && Array.isArray(body.exclude)
          ? body.exclude.filter((entry): entry is string => typeof entry === 'string' && entry !== '')
          : undefined
        const cwd = this.requireCwd(session)
        ok(res, await this.backend.commit(cwd, fields.message, {
          push,
          ...(exclude !== undefined && exclude.length > 0 ? { exclude } : {}),
        }))
        return
      }
      if (path === `${GIT_ROUTE}/push`) {
        const cwd = this.requireCwd(session)
        await this.backend.push(cwd)
        ok(res, { pushed: true })
        return
      }
      if (path === `${GIT_ROUTE}/checkout`) {
        const fields = requireFields(body, ['branch'])
        const cwd = this.requireCwd(session)
        await this.backend.checkout(cwd, fields.branch)
        ok(res, { branch: fields.branch })
        return
      }
      if (path === `${GIT_ROUTE}/create`) {
        const fields = requireFields(body, ['name'])
        const base = isRecord(body) ? str(body.base) : undefined
        const pushRemote = isRecord(body) && body.push === true
        const cwd = this.requireCwd(session)
        await this.backend.createBranch(cwd, fields.name, base, pushRemote)
        ok(res, { branch: fields.name, pushed: pushRemote })
        return
      }
      if (path === `${GIT_ROUTE}/branch-delete`) {
        const fields = requireFields(body, ['name'])
        const cwd = this.requireCwd(session)
        await this.backend.deleteBranch(cwd, fields.name)
        ok(res, { branch: fields.name })
        return
      }
      if (path === `${GIT_ROUTE}/remote-delete`) {
        const fields = requireFields(body, ['name'])
        const cwd = this.requireCwd(session)
        await this.backend.deleteRemoteBranch(cwd, fields.name)
        ok(res, { branch: fields.name })
        return
      }
      if (path === `${GIT_ROUTE}/suggest`) {
        const cwd = this.requireCwd(session)
        ok(res, { message: await this.backend.suggest(cwd) })
        return
      }
    } catch (error) {
      fail(res, 400, 'git-action-failed', messageOf(error))
      return
    }
    fail(res, 404, 'not-found', 'unknown git endpoint')
  }

  private requireCwd(session: string | undefined): string {
    const cwd = this.backend.resolveCwd(session)
    if (cwd === undefined) throw new Error('no working directory for this session')
    return cwd
  }
}

/**
 * Attach the Git routes whenever a webServer service is present.
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
  })
}
