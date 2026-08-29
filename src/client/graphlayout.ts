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
export const GRAPH_PALETTE = ['#4c8dff', '#8b5cf6', '#10b981', '#f59e0b', '#ec4899', '#06b6d4', '#f97316', '#84cc16'] as const
/** Horizontal distance between two lane centers (px). */
export const GRAPH_LANE_W = 13
/** Fixed row height (px) — the per-row SVGs must tile exactly for lanes to read as continuous lines. */
export const GRAPH_ROW_H = 28

/** One commit row as returned by the `git/graph` endpoint (client-side copy of the wire shape).
 *  `parents` is optional on purpose: the server half is loaded once at host boot while the
 *  browser bundle is served fresh, so a just-updated client can briefly talk to an older
 *  server that still returns the pre-parents shape — the layout must not crash on that. */
export interface GraphCommit {
  /** Parent hashes, first parent first (empty at root commits). */
  parents?: string[]
  fullHash: string
}

/** One edge segment crossing a graph row. */
export interface GraphEdge {
  /** Lane at the top of the row. */
  from: number
  /** Lane at the bottom of the row. */
  to: number
  /** Stroke color. */
  color: string
  /** `pass` spans the full row; `in` ends at the dot (top half); `out` starts at the dot (bottom half). */
  kind: 'pass' | 'in' | 'out'
}

/** Laid-out graph row: where the dot sits and which segments cross the row. */
export interface GraphRow {
  dot: number
  color: string
  edges: GraphEdge[]
}

export interface GraphLayout {
  rows: GraphRow[]
  /** Number of lanes ever used — the uniform SVG width is `lanes * GRAPH_LANE_W`. */
  lanes: number
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
export function layoutCommitGraph(commits: GraphCommit[]): GraphLayout {
  /** Hash each open lane's incoming edge points at (null = free lane). */
  const targets: (string | null)[] = []
  /** Stroke color of each open lane's incoming edge (null = free lane). */
  const laneColor: (string | null)[] = []
  let colorCursor = 0
  const freshColor = (): string => GRAPH_PALETTE[colorCursor++ % GRAPH_PALETTE.length] as string

  const rows: GraphRow[] = []
  let lanes = 0
  for (const commit of commits) {
    const edges: GraphEdge[] = []
    // Locate the incoming edge terminating at this commit. A hash appears at
    // most once among targets, so indexOf is exact.
    let dot = targets.indexOf(commit.fullHash)
    let color: string
    const hasIncoming = dot !== -1
    if (dot === -1) {
      // A tip no visible child extends (another branch head, or a parent cut
      // off by the limit): claim the first free lane, else grow the grid.
      dot = targets.indexOf(null)
      if (dot === -1) {
        dot = targets.length
        targets.push(null)
        laneColor.push(null)
      }
      color = freshColor()
      laneColor[dot] = color
    } else {
      color = laneColor[dot] ?? freshColor()
    }
    targets[dot] = null // consumed; the lane is free for the parents below
    // The incoming edge runs from the row top down to the dot, continuing the
    // child's outgoing edge from the row above. A fresh tip (no visible child)
    // has none — its dot starts the line.
    if (hasIncoming) edges.push({ from: dot, to: dot, color, kind: 'in' })

    // Pass-through: lanes already open before this row, except the one that
    // terminates at the dot — they cross the full row height.
    for (let lane = 0; lane < targets.length; lane++) {
      if (lane !== dot && targets[lane] !== null) {
        edges.push({ from: lane, to: lane, color: laneColor[lane] ?? freshColor(), kind: 'pass' })
      }
    }
    // Outgoing: one edge per parent, first parent first. `parents` may be
    // absent when the client runs against a pre-parents server (see above).
    for (const [parentIndex, parent] of (commit.parents ?? []).entries()) {
      let lane = targets.indexOf(parent)
      let edgeColor: string
      if (lane !== -1) {
        // The parent is already pointed at — the edge merges into that lane
        // and adopts its color.
        edgeColor = laneColor[lane] ?? freshColor()
      } else if (parentIndex === 0 && targets[dot] === null) {
        // First parent keeps the commit's lane (and color) so linear history
        // stays one continuous line.
        lane = dot
        edgeColor = color
        laneColor[lane] = color
      } else {
        lane = targets.indexOf(null)
        if (lane === -1) {
          lane = targets.length
          targets.push(null)
          laneColor.push(null)
        }
        // Reusing the just-freed dot lane keeps the line's color; any other
        // lane starts a genuinely new line.
        edgeColor = lane === dot ? color : freshColor()
        laneColor[lane] = edgeColor
      }
      targets[lane] = parent
      edges.push({ from: dot, to: lane, color: edgeColor, kind: 'out' })
    }
    lanes = Math.max(lanes, targets.length)
    rows.push({ dot, color, edges })
  }
  return { rows, lanes }
}
