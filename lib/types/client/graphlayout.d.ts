/**
 * Commit-graph lane layout — pure computation, no React, no host imports.
 *
 * The server returns commits with parent hashes (`git log --date-order --all`);
 * this module assigns each commit a lane (column) and derives the SVG edge
 * segments per row, so the GitBar dialog renders a colored fork/merge graph
 * (VS Code Git Graph style) without any dependency.
 * @module dsh-ui-tweaks/client/graphlayout
 */
/** Stroke palette for lanes — mid-tones chosen to read on light and dark themes. */
export declare const GRAPH_PALETTE: readonly ["#4c8dff", "#8b5cf6", "#10b981", "#f59e0b", "#ec4899", "#06b6d4", "#f97316", "#84cc16"];
/** Horizontal distance between two lane centers (px). */
export declare const GRAPH_LANE_W = 13;
/** Fixed row height (px) — the per-row SVGs must tile exactly for lanes to read as continuous lines. */
export declare const GRAPH_ROW_H = 28;
/** One commit row as returned by the `git/graph` endpoint (client-side copy of the wire shape).
 *  `parents` is optional on purpose: the server half is loaded once at host boot while the
 *  browser bundle is served fresh, so a just-updated client can briefly talk to an older
 *  server that still returns the pre-parents shape — the layout must not crash on that. */
export interface GraphCommit {
    /** Parent hashes, first parent first (empty at root commits). */
    parents?: string[];
    fullHash: string;
}
/** One edge segment crossing a graph row. */
export interface GraphEdge {
    /** Lane at the top of the row. */
    from: number;
    /** Lane at the bottom of the row. */
    to: number;
    /** Stroke color. */
    color: string;
    /** `pass` spans the full row; `in` ends at the dot (top half); `out` starts at the dot (bottom half). */
    kind: 'pass' | 'in' | 'out';
}
/** Laid-out graph row: where the dot sits and which segments cross the row. */
export interface GraphRow {
    dot: number;
    color: string;
    edges: GraphEdge[];
}
export interface GraphLayout {
    rows: GraphRow[];
    /** Number of lanes ever used — the uniform SVG width is `lanes * GRAPH_LANE_W`. */
    lanes: number;
}
/**
 * Assign lanes to commits in log order and derive per-row edge segments.
 *
 * Classic first-parent lane routing: each commit's incoming edge terminates at
 * its dot; the freed lane is reused by the first parent (linear history stays
 * on one line), later parents either join a lane that already points at them
 * (merges) or claim the nearest free lane (forks). Colors follow the branch
 * line: joining an existing lane adopts its color, reusing the dot lane keeps
 * the commit's own color.
 */
export declare function layoutCommitGraph(commits: GraphCommit[]): GraphLayout;
//# sourceMappingURL=graphlayout.d.ts.map