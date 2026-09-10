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
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Context } from '@deepseek-ai/cordis';
/** Exact route used by the browser Archive panel. */
export declare const ARCHIVE_ROUTE = "/_dsh/ui-tweaks/archive";
/** Public Archive snapshot. Only session ids cross this boundary — the browser
 * enriches them with titles / paths from its own session list feed. */
export interface ArchiveSnapshot {
    archivedSessionIds: string[];
}
/** A live session was targeted by a permanent delete. */
export declare class SessionLiveError extends Error {
    readonly code = "session-live";
    constructor();
}
/** Same-origin Archive read/write handler. */
export declare class ArchiveBackend {
    private readonly ctx;
    constructor(ctx: Context);
    private registry;
    private storageDomain;
    private snapshot;
    /** Remove one (or all) ids from the durable archive set, syncing the
     * registry's in-memory cache in the same write. */
    private writeArchiveSet;
    /** Restore one session: remove it from the durable archive set. */
    private restore;
    /** Restore every archived session at once. */
    private restoreAll;
    /** Permanently delete one session: log, accounting, archive set, and caches. */
    private deleteSession;
    /** Permanently delete every archived session (live ones are skipped). */
    private deleteAll;
    /** Handle the exact Archive route. */
    handle(req: IncomingMessage, res: ServerResponse): Promise<void>;
}
/**
 * Attach the Archive route whenever a webServer service is present.
 * @param ctx - plugin context owning route effects.
 * @param backend - Archive handler.
 */
export declare function installArchiveWeb(ctx: Context, backend: ArchiveBackend): void;
//# sourceMappingURL=archive.d.ts.map