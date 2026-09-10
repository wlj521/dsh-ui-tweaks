/**
 * dsh-ui-tweaks — Git backend (host half).
 *
 * Executes read-only and mutating git commands in a session's working
 * directory (the "current project", resolved from the session header's cwd)
 * for the GitBar: status snapshot (branch, ahead/behind, changed files with
 * ±line counts), branch enumeration, per-file diff views, and the commit /
 * push / switch / create actions.
 *
 * Every command runs through `child_process.execFile` — never a shell, args
 * as an argv array, cwd pinned, bounded timeout, abort propagation — so
 * repo-controlled strings cannot escape into a shell and a hung remote cannot
 * wedge the plugin.
 *
 * The terminal panel additionally runs a PERSISTENT REAL PTY per target
 * (node-pty — conpty on Windows), streamed to the browser over a WebSocket
 * and rendered with xterm.js: shell state, colors, Ctrl+C and interactive
 * apps work exactly like the DSH-better-sidebar terminal, whose pty-manager
 * design (transcript ring replay + reconnect grace) this follows.
 * @module dsh-ui-tweaks/git
 */
import type { Context } from '@deepseek-ai/cordis';
/** One changed file with its ±line counts. */
export interface GitFileChange {
    path: string;
    /** Display status: M / A / D / R / C / U (untracked). */
    status: string;
    added: number;
    deleted: number;
    untracked: boolean;
}
/** Full status snapshot for one session cwd. */
export interface GitSnapshot {
    isRepo: boolean;
    /** Absolute working directory, when resolvable. */
    cwd?: string;
    /** Current branch name, or null when detached. */
    branch: string | null;
    /** Short HEAD sha while detached. */
    detachedHead?: string;
    /** Upstream ref name (e.g. `origin/main`), when tracked. */
    upstream?: string;
    /** Commits ahead of the upstream. */
    ahead: number;
    /** Commits behind the upstream. */
    behind: number;
    hasRemote: boolean;
    clean: boolean;
    files: GitFileChange[];
    totalAdded: number;
    totalDeleted: number;
}
/** Local + remote branch enumeration. */
export interface GitBranches {
    current: string | null;
    local: string[];
    remote: string[];
}
/** One tag: its name plus the commit it points at. */
export interface GitTag {
    name: string;
    /** Short hash of the tagged commit. */
    hash: string;
    /** Subject line of the tagged commit. */
    subject: string;
}
/** Tag enumeration, newest creation date first. */
export interface GitTags {
    tags: GitTag[];
}
/** One commit row of the graph table. */
export interface GitGraphCommit {
    /** Full hashes of the parent commits, first parent first (empty at root commits). */
    parents: string[];
    /** Full commit hash. */
    fullHash: string;
    /** Short hash (7 chars). */
    hash: string;
    /** Subject line. */
    subject: string;
    /** Author name. */
    author: string;
    /** ISO-8601 commit date. */
    date: string;
    /** Relative date, e.g. "3 days ago". */
    dateRelative: string;
    /** Ref decorations, e.g. `HEAD -> main, origin/main` (outer parens stripped). */
    refs: string;
}
/** Git commit graph table (structured rows across all refs; the client lays
 *  out the branch lanes and draws the fork/merge SVG itself from `parents`). */
export interface GitGraph {
    commits: GitGraphCommit[];
    /** Whether the requested commit window was cut off by the limit. */
    truncated: boolean;
}
/** One rendered line of a per-file diff view. */
export interface DiffLine {
    type: 'hunk' | 'add' | 'del' | 'ctx';
    /** Old-file line number (null for added lines). */
    old: number | null;
    /** New-file line number (null for deleted lines). */
    new: number | null;
    /** Content after the +/-/space prefix; hunk lines carry the full `@@` header. */
    text: string;
}
/** Structured per-file diff for the GitBar side panel. */
export interface GitDiffResult {
    path: string;
    /** `hunk` = changed ranges only; `full` = whole file with added lines marked. */
    mode: 'hunk' | 'full';
    lines: DiffLine[];
    truncated: boolean;
}
/**
 * The Git service: resolves a session's cwd and runs git on its behalf.
 * @param ctx - plugin context (sessions is read structurally, never required).
 */
export declare class GitBackend {
    private readonly ctx;
    /** Persistent PTY shell sessions for the terminal panel (WebSocket-streamed). */
    readonly terminals: TerminalSessionManager;
    constructor(ctx: Context);
    /** Resolve the session's working directory, or undefined when absent. */
    resolveCwd(sessionId: string | undefined): string | undefined;
    /**
     * Resolve a workspace title (the hero/new-session screen has no real session
     * yet, only the picked workspace) to its directory. Matches the display
     * title exactly first, then a basename suffix — titles may duplicate, so an
     * exact hit always wins. Optional-service read like resolveCwd.
     */
    resolveWorkspaceCwd(name: string | undefined): string | undefined;
    /** Resolve either target form to a cwd (session id first, then workspace title). */
    resolveTargetCwd(target: {
        session?: string | undefined;
        ws?: string | undefined;
    }): string | undefined;
    /** Full status snapshot for a session's cwd. One merged `status -z --branch
     *  --untracked-files=all` call carries branch/upstream/tracking and the
     *  per-file untracked list (no ls-files expansion pass), and every read —
     *  repo probe included — runs in one parallel batch. The previous nine
     *  sequential process spawns cost ~700ms on Windows, this costs one spawn. */
    snapshot(cwd: string, signal?: AbortSignal): Promise<GitSnapshot>;
    /** Local + remote branch enumeration. */
    branches(cwd: string, signal?: AbortSignal): Promise<GitBranches>;
    /**
     * Per-file diff for the side panel. `mode: 'hunk'` returns only the changed
     * ranges (untracked files render as whole-file additions); `mode: 'full'`
     * returns the whole file with added lines marked.
     */
    diff(cwd: string, path: string, mode: 'hunk' | 'full', signal?: AbortSignal): Promise<GitDiffResult>;
    /**
     * Stage and commit; optionally push afterwards. Returns the short hash.
     * When `exclude` names changed files, they are unstaged and left out of the
     * commit (they stay in the working tree); otherwise everything is staged
     * with `git add -A`.
     */
    commit(cwd: string, message: string, opts?: {
        push?: boolean;
        exclude?: readonly string[];
        tag?: string;
        signal?: AbortSignal;
    }): Promise<{
        hash?: string;
        pushed: boolean;
        tag?: string;
    }>;
    /** Delete a local branch (force; the UI confirms first). Protected branches cannot be deleted. */
    deleteBranch(cwd: string, name: string, signal?: AbortSignal): Promise<void>;
    /**
     * Delete a remote branch (`origin/foo` → `git push origin --delete foo`).
     * Protected branches cannot be deleted. The local remote-tracking ref is
     * pruned afterwards so the branch list refreshes without waiting for a fetch.
     */
    deleteRemoteBranch(cwd: string, name: string, signal?: AbortSignal): Promise<void>;
    /**
     * Rename a branch (`git branch -m`). Renaming the current branch moves HEAD
     * with it; a remote upstream keeps its old name — pushing the new name and
     * deleting the old remote branch stays an explicit separate step.
     */
    renameBranch(cwd: string, name: string, newName: string, signal?: AbortSignal): Promise<void>;
    /** Tags newest-first, each with the short hash + subject of its commit. */
    tags(cwd: string, signal?: AbortSignal): Promise<GitTags>;
    /**
     * Create a tag on HEAD, or on `ref` (any hash/branch the rev-parse accepts)
     * for back-tagger duty. With a message the tag is annotated, otherwise it is
     * a lightweight pointer. Refuses an already-taken name (git enforces this
     * too — the check just makes the API error readable).
     */
    createTag(cwd: string, name: string, opts?: {
        message?: string;
        ref?: string;
        signal?: AbortSignal;
    }): Promise<void>;
    /** Delete a local tag (`git tag -d`). Remote tags stay untouched. */
    deleteTag(cwd: string, name: string, signal?: AbortSignal): Promise<void>;
    /** Push one tag to `origin` — git never ships tags with a plain push. */
    pushTag(cwd: string, name: string, signal?: AbortSignal): Promise<void>;
    /**
     * Recent commits across all refs (`git log --date-order --all`), bounded by
     * `limit`. Parent hashes ride along so the client can lay out branch lanes
     * and render the fork/merge graph as SVG.
     */
    graph(cwd: string, limit: number | undefined, signal?: AbortSignal): Promise<GitGraph>;
    /** Push the current branch; a branch without upstream gets `-u origin <branch>`. */
    push(cwd: string, signal?: AbortSignal): Promise<void>;
    /**
     * Pull the current branch, fast-forward only: a diverged branch aborts with
     * git's own message instead of silently creating a merge commit, and a
     * branch without upstream fails with git's tracking-information error.
     */
    pull(cwd: string, signal?: AbortSignal): Promise<void>;
    /** Switch to an existing branch (git switch, falling back to checkout). */
    checkout(cwd: string, branch: string, signal?: AbortSignal): Promise<void>;
    /**
     * Create a branch from `base` (default: current HEAD) and switch to it.
     * When `pushRemote` is true, the new branch is also pushed to `origin`
     * with `-u`, creating it on the remote.
     */
    createBranch(cwd: string, name: string, base: string | undefined, pushRemote: boolean, signal?: AbortSignal): Promise<void>;
}
/**
 * Duck-typed face of the `node-pty` module — only what this plugin touches.
 * Kept structural so a broken native install degrades into a clear
 * "pty unavailable" error instead of crashing plugin activation.
 */
interface NodePtyModule {
    spawn(file: string, args: readonly string[], options: {
        name: string;
        cols: number;
        rows: number;
        cwd: string;
        env: NodeJS.ProcessEnv;
    }): IPtyLike;
}
/** Duck-typed face of one node-pty terminal handle. */
interface IPtyLike {
    pid: number;
    write(data: string): void;
    resize(cols: number, rows: number): void;
    kill(): void;
    onData(listener: (data: string) => void): unknown;
    onExit(listener: (event: {
        exitCode: number;
        signal?: number;
    }) => void): unknown;
}
/** A browser socket attached to one terminal (the WebSocket adapter). */
export interface TerminalClient {
    /** Push one chunk to the browser: raw pty bytes or a JSON control frame. */
    send(text: string): void;
    /** Whether the connection can still carry frames. */
    readonly alive: boolean;
}
interface TerminalSession {
    key: string;
    cwd: string;
    pty: IPtyLike;
    /** Output accumulated since spawn (bounded; head dropped when over the limit). */
    transcript: string;
    exited: boolean;
    exitCode: number | null;
    clients: Set<TerminalClient>;
    closeTimer: ReturnType<typeof setTimeout> | null;
}
/**
 * Owns the terminal shells, keyed by target (`session:<id>` / `ws:<name>`).
 * One live process per key: re-attach reuses it (transcript replay makes the
 * panel reopen seamless), an exited or cwd-changed handle is replaced with a
 * fresh spawn. Socket drops schedule a grace close that a timely re-attach
 * cancels; only the explicit close frame and teardown kill immediately.
 */
export declare class TerminalSessionManager {
    private readonly sessions;
    private readonly nodePty;
    constructor(loadPty?: () => NodePtyModule | undefined);
    /** Whether the native pty module could not be loaded (degraded mode). */
    get unavailable(): boolean;
    /**
     * Attach one browser client to the target's terminal, opening (or replacing)
     * the underlying shell as needed.
     * @returns the session whose `transcript` must be replayed to the client
     *   before live data (empty on a fresh spawn).
     */
    attach(key: string, cwd: string, cols: number, rows: number, client: TerminalClient): TerminalSession;
    /** Remove one client; when the last one leaves, arm the reconnect grace. */
    detach(key: string, client: TerminalClient): void;
    /** Forward raw stdin bytes from the browser to the shell. */
    input(key: string, data: string): void;
    /** Propagate the xterm viewport size to the pty. */
    resize(key: string, cols: number, rows: number): void;
    /** Kill the target's shell now (explicit close frame / teardown path). */
    close(key: string): void;
    /** Kill every shell (plugin teardown). */
    disposeAll(): void;
    private spawn;
    /** Fan one pty chunk out to every attached, still-open client. */
    private broadcast;
    /** Make room for a new shell: drop exited records first, then detached ones. */
    private evictForNewSession;
    /** Arm (or re-arm) the delayed destruction used for bare socket drops. */
    private scheduleClose;
    /** Cancel a pending scheduled close (a client re-attached in time). */
    private cancelClose;
}
export {};
//# sourceMappingURL=git.d.ts.map