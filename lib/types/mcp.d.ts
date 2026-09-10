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
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Context } from '@deepseek-ai/cordis';
/** Exact route used by the browser MCP manager. */
export declare const MCP_ROUTE = "/_dsh/ui-tweaks/mcp";
/** Lifecycle status of one MCP server instance. */
export type McpStatus = 'disabled' | 'stopped' | 'active' | 'failed' | 'loading';
/** Public view of one configured MCP server. */
export interface McpServerView {
    /** Loader entry id (e.g. `mcp-mysql-local`). */
    id: string;
    /** The server's tool namespace (`mcp__<serverName>__*`). */
    serverName: string;
    transport: string;
    command?: string;
    args: string[];
    url?: string;
    headers: Record<string, string>;
    env: Record<string, string>;
    /** Per-tool-call timeout in milliseconds. */
    toolCallTimeoutMs?: number;
    /** The server's config rendered as YAML (for the YAML editor). */
    yaml: string;
    disabled: boolean;
    status: McpStatus;
    toolCount: number;
    /** Raw tool names registered by this server, sorted. */
    tools: string[];
}
/** Editor payload for add/edit/set-enabled. */
export interface McpServerInput {
    id: string;
    serverName: string;
    transport: 'stdio' | 'streamable-http';
    command?: string;
    args?: string[];
    url?: string;
    headers?: Record<string, string>;
    env?: Record<string, string>;
    toolCallTimeoutMs?: number;
    disabled: boolean;
}
export interface McpSnapshot {
    servers: McpServerView[];
}
/** Same-origin MCP read/write handler. */
export declare class McpBackend {
    private readonly ctx;
    constructor(ctx: Context);
    private loader;
    /** Best-effort enumeration of the global tool registry (no public list API). */
    private toolNames;
    private snapshot;
    /** Resolve the profile directory: the root Include entry's config.path is
     * the profile's `cordis.yml` (a `file://` URL), whose parent IS the profile
     * directory. Falls back to the loader's baseUrl. */
    private profileDir;
    private patchFilePath;
    /** Find one MCP entry in the patch document; also reports its insert seq, index, and owning patch. */
    private findPatchEntry;
    /** The insert seq new MCP entries should join (first one already holding MCP entries, else the first insert). */
    private insertTarget;
    private entryNode;
    private mutatePatchFile;
    private validateInput;
    /** Add or edit one server (upsert by id), persisting to the profile patch file. */
    private save;
    /** Delete one server from the profile patch file. */
    private remove;
    /** Enable or disable one server in the profile patch file. */
    private setEnabled;
    /** Handle the exact MCP route. */
    handle(req: IncomingMessage, res: ServerResponse): Promise<void>;
}
/**
 * Attach the MCP route whenever a webServer service is present.
 * @param ctx - plugin context owning route effects.
 * @param backend - MCP handler.
 */
export declare function installMcpWeb(ctx: Context, backend: McpBackend): void;
//# sourceMappingURL=mcp.d.ts.map