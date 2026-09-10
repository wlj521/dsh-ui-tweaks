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
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Context } from '@deepseek-ai/cordis';
import { GitBackend } from './git.ts';
/** Route prefix shared with the browser half. */
export declare const GIT_ROUTE = "/_dsh/ui-tweaks/git";
/** Exact path of the terminal WebSocket upgrade route. */
export declare const TERMINAL_WS_PATH = "/_dsh/ui-tweaks/git/terminal-ws";
/**
 * Same-origin Git endpoints. GETs are read-only; POSTs mutate the repository
 * and reject cross-site requests.
 */
export declare class GitWebHandler {
    private readonly backend;
    constructor(backend: GitBackend);
    handle(req: IncomingMessage, res: ServerResponse): Promise<void>;
    private requireCwd;
    /** Serve one whitelisted vendored asset; anything else is a 404. */
    private serveVendor;
}
/**
 * Attach the Git routes plus the terminal WebSocket whenever a webServer
 * service is present.
 * @param ctx - plugin context owning route effects.
 * @param backend - Git backend.
 */
export declare function installGitWeb(ctx: Context, backend: GitBackend): void;
//# sourceMappingURL=git-web.d.ts.map