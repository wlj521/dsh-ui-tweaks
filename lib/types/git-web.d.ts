/**
 * dsh-ui-tweaks — Git Web routes.
 *
 * Same-origin JSON endpoints backing the GitBar browser half. Every mutating
 * action is a POST guarded by the same origin/same-site checks as the Settings
 * route; the session id arrives as a query/body field and the backend resolves
 * the working directory from the session header.
 *
 * @module dsh-ui-tweaks/git-web
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Context } from '@deepseek-ai/cordis';
import { GitBackend } from './git.ts';
/** Route prefix shared with the browser half. */
export declare const GIT_ROUTE = "/_dsh/ui-tweaks/git";
/**
 * Same-origin Git endpoints. GETs are read-only; POSTs mutate the repository
 * and reject cross-site requests.
 */
export declare class GitWebHandler {
    private readonly backend;
    constructor(backend: GitBackend);
    handle(req: IncomingMessage, res: ServerResponse): Promise<void>;
    private requireCwd;
}
/**
 * Attach the Git routes whenever a webServer service is present.
 * @param ctx - plugin context owning route effects.
 * @param backend - Git backend.
 */
export declare function installGitWeb(ctx: Context, backend: GitBackend): void;
//# sourceMappingURL=git-web.d.ts.map