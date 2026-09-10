/**
 * dsh-ui-tweaks — archive manager (host half).
 *
 * The browser Archive manager (the "归档" settings section, shown when the
 * archiveManagerEnabled setting is on) lists archived sessions and offers
 * two per-session actions plus batch actions through this same-origin route:
 *
 * - **restore** / **restore-all**: move a session out of the archive set. The
 *   session log and its workspace accounting slot are kept untouched, so the
 *   conversation reappears in the normal sidebar list.
 * - **delete** / **delete-all**: PERMANENTLY delete a session — its durable
 *   JSONL log is removed from disk, it is detached from every workspace's
 *   accounting, removed from the archive set, dropped from the workspace
 *   registry's in-memory header index, and best-effort-cleaned from the
 *   session projection cache. Only a genuinely RUNNING agent is refused;
 *   opened-but-idle sessions are also removed from the in-memory SessionStore
 *   so they vanish from the live list immediately (the host relays
 *   `session/disposed` as `host/session-removed`).
 *
 * DSH has no public API for either operation. The archive set lives in the
 * `workspace` storage domain's global singleton (the same record
 * `WorkspaceRegistry` keeps in memory), so this backend writes the filtered
 * set through the live domain handle (`ctx.storageDomain.get('workspace')`)
 * and keeps the registry's in-memory cache coherent in the same write, so the
 * registry's next mutation cannot resurrect a restored id. Session-log
 * deletion uses the persistence backend's own locator (`findLog`) so only the
 * exact encoded session directory is removed; workspace accounting removal
 * uses the registry's public `WorkspaceEntity.detachSession`.
 * @module dsh-ui-tweaks/archive
 */
import { rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { workspaceDomainState } from '@deepseek-ai/dsh-workspace';
import { isRecord, json, messageOf, readJson, requestError, sameOriginPost } from "./web.js";
/** Exact route used by the browser Archive panel. */
export const ARCHIVE_ROUTE = '/_dsh/ui-tweaks/archive';
/** A live session was targeted by a permanent delete. */
export class SessionLiveError extends Error {
    code = 'session-live';
    constructor() {
        super('cannot permanently delete a live session: close it first');
        this.name = 'SessionLiveError';
    }
}
function parseRequest(value) {
    if (!isRecord(value))
        throw new TypeError('request body must be an object');
    if (value.action === 'restore' || value.action === 'delete') {
        const sessionId = value.sessionId;
        if (typeof sessionId !== 'string' || sessionId.length === 0)
            throw new TypeError('sessionId must be a non-empty string');
        return { action: value.action, sessionId };
    }
    if (value.action === 'restore-all' || value.action === 'delete-all')
        return { action: value.action };
    throw new TypeError('action must be "restore", "delete", "restore-all" or "delete-all"');
}
/** Same-origin Archive read/write handler. */
export class ArchiveBackend {
    ctx;
    constructor(ctx) {
        this.ctx = ctx;
    }
    registry() {
        return this.ctx.get('workspaceRegistry');
    }
    storageDomain() {
        return this.ctx.get('storageDomain');
    }
    snapshot() {
        const archivedSessionIds = [...(this.registry()?.archivedSessionIds ?? [])];
        return { archivedSessionIds };
    }
    /** Remove one (or all) ids from the durable archive set, syncing the
     * registry's in-memory cache in the same write. */
    async writeArchiveSet(registry, keep) {
        const global = this.storageDomain()?.get('workspace')?.global;
        if (global === undefined)
            throw new Error('workspace storage domain is unavailable');
        const state = workspaceDomainState.parse(global.get());
        const next = {
            ...state,
            archivedSessionIds: state.archivedSessionIds.filter(keep),
        };
        if (next.archivedSessionIds.length === state.archivedSessionIds.length)
            return;
        await global.set(next);
        // Keep the registry's in-memory cache coherent so its next write (e.g.
        // another archive, a workspace create) does not resurrect the ids.
        registry.state = next;
    }
    /** Restore one session: remove it from the durable archive set. */
    async restore(sessionId) {
        const registry = this.registry();
        if (registry === undefined)
            throw new Error('workspace registry is unavailable');
        if (!registry.archivedSessionIds.includes(sessionId))
            return;
        await this.writeArchiveSet(registry, id => id !== sessionId);
    }
    /** Restore every archived session at once. */
    async restoreAll() {
        const registry = this.registry();
        if (registry === undefined)
            throw new Error('workspace registry is unavailable');
        if (registry.archivedSessionIds.length === 0)
            return;
        await this.writeArchiveSet(registry, () => false);
    }
    /** Permanently delete one session: log, accounting, archive set, and caches. */
    async deleteSession(sessionId) {
        // Refuse only a genuinely RUNNING agent. Sessions that were merely opened
        // (and archived) stay attached to the in-memory SessionStore while idle —
        // refusing every attached session would make most archived sessions
        // undeletable.
        const agents = this.ctx.get('agents');
        const agent = agents?.get(sessionId);
        if (agent !== undefined && agent.status === 'running')
            throw new SessionLiveError();
        if (agent !== undefined) {
            // Clear any queued work and let the (idle) agent settle before the log
            // is removed.
            agent.cancel({ kind: 'user' });
            await agent.whenIdle();
        }
        // 1. Remove the durable session log (its parent directory) from disk.
        const persistence = this.ctx.get('sessionPersistence');
        if (persistence?.findLog !== undefined) {
            const found = await persistence.findLog(sessionId);
            // Older backends resolve a path string; generation-aware ones resolve a
            // record whose `sourcePath` names the authoritative generation file.
            const logPath = typeof found === 'string' ? found : found?.sourcePath;
            if (logPath !== undefined)
                await rm(dirname(logPath), { recursive: true, force: true });
        }
        // 2. Detach from every workspace's accounting (public entity API), then
        //    remove from the archive set, then forget it in the registry's
        //    in-memory header index so membership checks drop it without restart.
        const registry = this.registry();
        if (registry !== undefined) {
            for (const workspace of registry.list()) {
                if (workspace.sessionIds.includes(sessionId))
                    await workspace.detachSession(sessionId);
            }
            await this.writeArchiveSet(registry, id => id !== sessionId);
            registry.headers?.delete(sessionId);
            registry.sessionPaths?.delete(sessionId);
        }
        // 3. Best-effort: drop the session's projection-cache checkpoint.
        const table = this.storageDomain()?.get('session_projcache')?.table?.('sessions');
        if (table?.delete !== undefined)
            await table.delete(sessionId);
        // 4. Drop the (idle) session from the in-memory SessionStore so it
        //    vanishes from the live list immediately: the store's entry detach
        //    fires `session/disposed`, which the host relays as
        //    `host/session-removed` and the browser forgets the session. The
        //    agent's own lifecycle stays registered until process end — it is
        //    idle, unreachable, and cleared by the next restart.
        const sessions = this.ctx.get('sessions');
        sessions?.store?.get(sessionId)?.detach?.();
    }
    /** Permanently delete every archived session (live ones are skipped). */
    async deleteAll() {
        const registry = this.registry();
        if (registry === undefined)
            throw new Error('workspace registry is unavailable');
        const archived = [...registry.archivedSessionIds];
        let deleted = 0;
        let skipped = 0;
        for (const id of archived) {
            try {
                await this.deleteSession(id);
                deleted += 1;
            }
            catch (error) {
                skipped += 1;
                this.ctx.logger.warn('dsh-ui-tweaks archive delete skipped %s: %s', id, messageOf(error));
            }
        }
        return { deleted, skipped };
    }
    /** Handle the exact Archive route. */
    async handle(req, res) {
        if (req.method === 'GET') {
            try {
                json(res, 200, { ok: true, value: this.snapshot() });
            }
            catch (error) {
                this.ctx.logger.warn('dsh-ui-tweaks Archive snapshot failed: %s', messageOf(error));
                requestError(res, 503, 'archive-unavailable', 'UI Tweaks archive is unavailable');
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
            if (request.action === 'restore')
                await this.restore(request.sessionId);
            else if (request.action === 'restore-all')
                await this.restoreAll();
            else if (request.action === 'delete')
                await this.deleteSession(request.sessionId);
            else
                await this.deleteAll();
            json(res, 200, { ok: true, value: this.snapshot() });
        }
        catch (error) {
            const live = error instanceof SessionLiveError;
            this.ctx.logger.warn('dsh-ui-tweaks Archive mutation failed: %s', messageOf(error));
            requestError(res, live ? 409 : 400, live ? 'session-live' : 'archive-rejected', messageOf(error));
        }
    }
}
/**
 * Attach the Archive route whenever a webServer service is present.
 * @param ctx - plugin context owning route effects.
 * @param backend - Archive handler.
 */
export function installArchiveWeb(ctx, backend) {
    ctx.inject(['webServer'], (webCtx) => {
        webCtx.effect(() => {
            return webCtx.webServer.register({
                kind: 'exact',
                path: ARCHIVE_ROUTE,
                handler: (req, res) => backend.handle(req, res),
            });
        }, 'dsh-ui-tweaks: Archive routes');
    });
}
//# sourceMappingURL=archive.js.map