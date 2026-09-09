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

import { execFile } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { open, readFile, stat } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve, sep } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'

/** One changed file with its ±line counts. */
export interface GitFileChange {
  path: string
  /** Display status: M / A / D / R / C / U (untracked). */
  status: string
  added: number
  deleted: number
  untracked: boolean
}

/** Full status snapshot for one session cwd. */
export interface GitSnapshot {
  isRepo: boolean
  /** Absolute working directory, when resolvable. */
  cwd?: string
  /** Current branch name, or null when detached. */
  branch: string | null
  /** Short HEAD sha while detached. */
  detachedHead?: string
  /** Upstream ref name (e.g. `origin/main`), when tracked. */
  upstream?: string
  /** Commits ahead of the upstream. */
  ahead: number
  /** Commits behind the upstream. */
  behind: number
  hasRemote: boolean
  clean: boolean
  files: GitFileChange[]
  totalAdded: number
  totalDeleted: number
}

/** Local + remote branch enumeration. */
export interface GitBranches {
  current: string | null
  local: string[]
  remote: string[]
}

/** One tag: its name plus the commit it points at. */
export interface GitTag {
  name: string
  /** Short hash of the tagged commit. */
  hash: string
  /** Subject line of the tagged commit. */
  subject: string
}

/** Tag enumeration, newest creation date first. */
export interface GitTags {
  tags: GitTag[]
}

/** One commit row of the graph table. */
export interface GitGraphCommit {
  /** Full hashes of the parent commits, first parent first (empty at root commits). */
  parents: string[]
  /** Full commit hash. */
  fullHash: string
  /** Short hash (7 chars). */
  hash: string
  /** Subject line. */
  subject: string
  /** Author name. */
  author: string
  /** ISO-8601 commit date. */
  date: string
  /** Relative date, e.g. "3 days ago". */
  dateRelative: string
  /** Ref decorations, e.g. `HEAD -> main, origin/main` (outer parens stripped). */
  refs: string
}

/** Git commit graph table (structured rows across all refs; the client lays
 *  out the branch lanes and draws the fork/merge SVG itself from `parents`). */
export interface GitGraph {
  commits: GitGraphCommit[]
  /** Whether the requested commit window was cut off by the limit. */
  truncated: boolean
}

/** One rendered line of a per-file diff view. */
export interface DiffLine {
  type: 'hunk' | 'add' | 'del' | 'ctx'
  /** Old-file line number (null for added lines). */
  old: number | null
  /** New-file line number (null for deleted lines). */
  new: number | null
  /** Content after the +/-/space prefix; hunk lines carry the full `@@` header. */
  text: string
}

/** Structured per-file diff for the GitBar side panel. */
export interface GitDiffResult {
  path: string
  /** `hunk` = changed ranges only; `full` = whole file with added lines marked. */
  mode: 'hunk' | 'full'
  lines: DiffLine[]
  truncated: boolean
}

/** Empty snapshot for non-repo / unresolvable sessions. */
const NO_REPO: GitSnapshot = {
  isRepo: false,
  branch: null,
  ahead: 0,
  behind: 0,
  hasRemote: false,
  clean: true,
  files: [],
  totalAdded: 0,
  totalDeleted: 0,
}

/** Reasonable ceilings: line-count reads and full-file views stay bounded. */
const MAX_COUNT_FILE_BYTES = 512 * 1024
const MAX_DIFF_FILE_BYTES = 1024 * 1024
const MAX_FULL_LINES = 20000
/** Diff panel: upper bound on rendered hunk lines (a huge pnpm-lock.yaml diff
 *  can exceed 3000 lines, which freezes the GUI). */
const MAX_DIFF_ROWS = 500

const GIT_TIMEOUT_MS = 10000

interface RunResult {
  stdout: string
  stderr: string
}

interface RunOpts {
  signal?: AbortSignal | undefined
  timeoutMs?: number | undefined
}

/** Run one git command with cwd pinned, no shell, bounded timeout, abort propagation. */
function runGit(
  cwd: string,
  args: readonly string[],
  opts: RunOpts = {},
): Promise<RunResult> {
  return new Promise((resolvePromise, reject) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? GIT_TIMEOUT_MS)
    const onOuterAbort = (): void => { controller.abort() }
    opts.signal?.addEventListener('abort', onOuterAbort, { once: true })
    execFile('git', [...args], {
      cwd,
      encoding: 'utf8',
      windowsHide: true,
      signal: controller.signal,
      maxBuffer: 32 * 1024 * 1024,
    }, (error, stdout, stderr) => {
      clearTimeout(timer)
      opts.signal?.removeEventListener('abort', onOuterAbort)
      if (error !== null) {
        reject(Object.assign(new Error(error.message), {
          cause: error,
          code: (error as NodeJS.ErrnoException).code,
          stdout,
          stderr,
          aborted: controller.signal.aborted,
        }))
        return
      }
      resolvePromise({ stdout, stderr })
    })
  })
}

/** Parse `git status --porcelain=v1 -z --branch` output into XY entries with
 *  paths. The leading `## ` branch-header record (present because of
 *  `--branch`) is skipped here; `parseStatusHeader` decodes it. */
function parseStatusPorcelainZ(stdout: string): Array<{ index: string; worktree: string; path: string }> {
  const out: Array<{ index: string; worktree: string; path: string }> = []
  const parts = stdout.split('\0')
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    if (part === undefined || part.length < 3) continue
    if (part.startsWith('## ')) continue
    const xy = part.slice(0, 2)
    let path = part.slice(3)
    const index = xy.charAt(0)
    const worktree = xy.charAt(1)
    // Rename/copy entries list the source path then the destination path.
    if (index === 'R' || index === 'C') {
      const next = parts[i + 1]
      if (next !== undefined && next !== '') {
        path = next
        i++
      }
    }
    if (path !== '') out.push({ index, worktree, path })
  }
  return out
}

/** Branch/upstream/tracking info carried by the `## ` record of
 *  `git status --porcelain -z --branch` — replaces three separate git calls
 *  (branch --show-current, rev-parse @{upstream}, rev-list --count). */
interface StatusHeader {
  branch: string | null
  detached: boolean
  upstream?: string
  ahead: number
  behind: number
}

function parseStatusHeader(stdout: string): StatusHeader {
  const first = stdout.split('\0', 1)[0] ?? ''
  if (!first.startsWith('## ')) return { branch: null, detached: false, ahead: 0, behind: 0 }
  const header = first.slice(3)
  // Fresh repo before the first commit.
  const noCommits = 'No commits yet on '
  if (header.startsWith(noCommits)) {
    return { branch: header.slice(noCommits.length), detached: false, ahead: 0, behind: 0 }
  }
  // Detached HEAD — the caller resolves the short sha separately.
  if (header.startsWith('HEAD (no branch)')) return { branch: null, detached: true, ahead: 0, behind: 0 }
  // `main...origin/main [ahead 1, behind 2]` — the bracket is optional and so
  // is the `...upstream` half.
  const bracketStart = header.indexOf(' [')
  const refs = bracketStart >= 0 ? header.slice(0, bracketStart) : header
  const tracking = bracketStart >= 0 ? header.slice(bracketStart + 2, Math.max(bracketStart + 2, header.length - 1)) : ''
  const refParts = refs.split('...')
  const local = refParts[0] ?? ''
  const upstreamRef = refParts[1]
  const out: StatusHeader = { branch: local !== '' ? local : null, detached: false, ahead: 0, behind: 0 }
  if (upstreamRef !== undefined && upstreamRef !== '') out.upstream = upstreamRef
  for (const piece of tracking.split(',')) {
    const match = piece.trim().match(/^(ahead|behind)\s+(\d+)$/)
    if (match === null) continue
    if (match[1] === 'ahead') out.ahead = Number(match[2]) || 0
    else out.behind = Number(match[2]) || 0
  }
  return out
}

/** Parse `git diff --numstat` (non-z) into path → { added, deleted }. */
function parseNumstat(stdout: string): Map<string, { added: number; deleted: number }> {
  const out = new Map<string, { added: number; deleted: number }>()
  for (const line of stdout.split('\n')) {
    if (line === '') continue
    const tab1 = line.indexOf('\t')
    if (tab1 < 0) continue
    const tab2 = line.indexOf('\t', tab1 + 1)
    if (tab2 < 0) continue
    const addedRaw = line.slice(0, tab1)
    const deletedRaw = line.slice(tab1 + 1, tab2)
    let path = line.slice(tab2 + 1)
    // Rename records carry `old => new`.
    if (path.includes(' => ')) path = path.split(' => ')[1]?.trim() ?? path
    if (path === '') continue
    // Binary files report `-` in both numeric fields.
    const added = addedRaw === '-' ? 0 : Number(addedRaw) || 0
    const deleted = deletedRaw === '-' ? 0 : Number(deletedRaw) || 0
    out.set(path, { added, deleted })
  }
  return out
}

/** Merge numstat records into one map (later records win per path). */
function mergeNumstat(map: Map<string, { added: number; deleted: number }>, stdout: string): void {
  for (const [path, value] of parseNumstat(stdout)) map.set(path, value)
}

/** Resolve a repo-relative path safely: must stay inside the cwd. */
function resolveWithin(cwd: string, path: string): string {
  const full = resolve(cwd, path)
  if (full !== cwd && !full.startsWith(cwd + sep)) {
    throw new Error(`path escapes the working directory: ${path}`)
  }
  return full
}

/** Count newline-delimited lines of a small text file; 0 for binary/oversized.
 *  Async (fs/promises) so a batch of untracked files runs concurrently instead
 *  of blocking the plugin's event loop with one sync read per file. */
async function countFileLines(cwd: string, path: string): Promise<number> {
  try {
    const full = resolveWithin(cwd, path)
    const info = await stat(full)
    if (!info.isFile() || info.size > MAX_COUNT_FILE_BYTES) return 0
    const buf = await readFile(full)
    if (buf.includes(0)) return 0
    let lines = 0
    for (let i = 0; i < buf.length; i++) if (buf[i] === 10) lines++
    if (buf.length > 0 && buf[buf.length - 1] !== 10) lines++
    return lines
  } catch {
    return 0
  }
}

/** Read a text file (or a deleted file's HEAD content) with a size cap. */
function readFileContent(cwd: string, path: string, signal?: AbortSignal): Promise<{ content: string; truncated: boolean }> {
  return (async () => {
    const full = resolveWithin(cwd, path)
    if (existsSync(full)) {
      const stat = statSync(full)
      if (stat.size > MAX_DIFF_FILE_BYTES) {
        // Read the head of the file only; mark truncated.
        const fd = await open(full, 'r')
        try {
          const buf = Buffer.alloc(MAX_DIFF_FILE_BYTES)
          const { bytesRead } = await fd.read(buf, 0, MAX_DIFF_FILE_BYTES, 0)
          return { content: buf.subarray(0, bytesRead).toString('utf8'), truncated: stat.size > MAX_DIFF_FILE_BYTES }
        } finally {
          await fd.close()
        }
      }
      return { content: readFileSync(full, 'utf8'), truncated: false }
    }
    // Deleted (or renamed-away) file: read from HEAD.
    const { stdout } = await runGit(cwd, ['show', `HEAD:${path}`], { signal })
    const truncated = Buffer.byteLength(stdout) > MAX_DIFF_FILE_BYTES
    return { content: truncated ? stdout.slice(0, MAX_DIFF_FILE_BYTES) : stdout, truncated }
  })()
}

/** Parse a unified diff stream into typed lines with line numbers. */
function parseUnifiedDiff(text: string): DiffLine[] {
  const out: DiffLine[] = []
  let oldN = 0
  let newN = 0
  for (const raw of text.split('\n')) {
    if (raw === '') continue
    if (raw.startsWith('@@')) {
      out.push({ type: 'hunk', old: null, new: null, text: raw })
      // Seed the counters from the hunk header: `@@ -oldStart,oldCount +newStart,newCount @@`.
      const match = raw.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
      oldN = match !== null ? Number(match[1]) - 1 : 0
      newN = match !== null ? Number(match[2]) - 1 : 0
      continue
    }
    if (raw.startsWith('diff --git') || raw.startsWith('index ') || raw.startsWith('--- ') || raw.startsWith('+++ ') || raw.startsWith('\\ No newline')) {
      continue
    }
    if (raw.startsWith('+')) {
      newN++
      out.push({ type: 'add', old: null, new: newN, text: raw.slice(1) })
      continue
    }
    if (raw.startsWith('-')) {
      oldN++
      out.push({ type: 'del', old: oldN, new: null, text: raw.slice(1) })
      continue
    }
    oldN++
    newN++
    out.push({ type: 'ctx', old: oldN, new: newN, text: raw.slice(1) })
  }
  return out
}

/** Collect the new-file line numbers that are additions, from a unified diff. */
function addedNewLineNumbers(diff: DiffLine[]): Set<number> {
  const out = new Set<number>()
  for (const line of diff) {
    if (line.type === 'add' && line.new !== null) out.add(line.new)
  }
  return out
}

/**
 * The Git service: resolves a session's cwd and runs git on its behalf.
 * @param ctx - plugin context (sessions is read structurally, never required).
 */
export class GitBackend {
  /** Persistent PTY shell sessions for the terminal panel (WebSocket-streamed). */
  readonly terminals: TerminalSessionManager

  constructor(private readonly ctx: Context) {
    this.terminals = new TerminalSessionManager()
  }

  /** Resolve the session's working directory, or undefined when absent. */
  resolveCwd(sessionId: string | undefined): string | undefined {
    if (sessionId !== undefined) {
      // Optional-service read: sessions is absent in headless assemblies.
      const sessions = this.ctx.get('sessions') as { get(id: string): { header?: { cwd?: string } } | undefined } | undefined
      const session = sessions?.get(sessionId)
      const cwd = session?.header?.cwd
      if (typeof cwd === 'string' && cwd !== '' && existsSync(cwd)) return cwd
    }
    return undefined
  }

  /**
   * Resolve a workspace title (the hero/new-session screen has no real session
   * yet, only the picked workspace) to its directory. Matches the display
   * title exactly first, then a basename suffix — titles may duplicate, so an
   * exact hit always wins. Optional-service read like resolveCwd.
   */
  resolveWorkspaceCwd(name: string | undefined): string | undefined {
    if (name === undefined || name === '') return undefined
    const workspaces = this.ctx.get('workspaces') as { list?: () => Array<{ path: string; title?: string }> } | undefined
    const list = workspaces?.list?.() ?? []
    const byTitle = list.find(w => w.title === name)
    const byBase = list.find(w => w.path.endsWith(`${sep}${name}`))
    const cwd = byTitle?.path ?? byBase?.path
    if (typeof cwd === 'string' && cwd !== '' && existsSync(cwd)) return cwd
    return undefined
  }

  /** Resolve either target form to a cwd (session id first, then workspace title). */
  resolveTargetCwd(target: { session?: string | undefined; ws?: string | undefined }): string | undefined {
    return this.resolveCwd(target.session) ?? this.resolveWorkspaceCwd(target.ws)
  }

  /** Full status snapshot for a session's cwd. One merged `status -z --branch
   *  --untracked-files=all` call carries branch/upstream/tracking and the
   *  per-file untracked list (no ls-files expansion pass), and every read —
   *  repo probe included — runs in one parallel batch. The previous nine
   *  sequential process spawns cost ~700ms on Windows, this costs one spawn. */
  async snapshot(cwd: string, signal?: AbortSignal): Promise<GitSnapshot> {
    const [inside, status, worktreeNumstat, stagedNumstat, remotes] = await Promise.all([
      runGit(cwd, ['rev-parse', '--is-inside-work-tree'], { signal }).catch(() => undefined),
      runGit(cwd, ['status', '--porcelain=v1', '-z', '--branch', '--untracked-files=all'], { signal }).catch(() => undefined),
      runGit(cwd, ['diff', '--numstat'], { signal }).catch(() => undefined),
      runGit(cwd, ['diff', '--cached', '--numstat'], { signal }).catch(() => undefined),
      runGit(cwd, ['remote'], { signal }).catch(() => undefined),
    ])
    if (inside === undefined || status === undefined) {
      return { ...NO_REPO, cwd }
    }

    const header = parseStatusHeader(status.stdout)
    let detachedHead: string | undefined
    if (header.detached) {
      // Detached HEAD has no branch name; resolve the short sha for display.
      try {
        const { stdout } = await runGit(cwd, ['rev-parse', '--short', 'HEAD'], { signal })
        detachedHead = stdout.trim() || undefined
      } catch {
        // Keep it undefined.
      }
    }

    const numstat = new Map<string, { added: number; deleted: number }>()
    if (worktreeNumstat !== undefined) mergeNumstat(numstat, worktreeNumstat.stdout)
    if (stagedNumstat !== undefined) mergeNumstat(numstat, stagedNumstat.stdout)

    const files: GitFileChange[] = []
    for (const entry of parseStatusPorcelainZ(status.stdout)) {
      const untrackedFile = entry.index === '?' || entry.worktree === '?'
      const nums = numstat.get(entry.path)
      files.push({
        path: entry.path,
        status: untrackedFile ? 'U' : entry.index === ' ' ? entry.worktree : entry.index,
        added: nums?.added ?? 0,
        deleted: nums?.deleted ?? 0,
        untracked: untrackedFile,
      })
    }
    // Untracked files never appear in numstat; describe each by its line
    // count. Concurrent async reads — a batch of new files must not block the
    // plugin's event loop the way one sync read per file used to.
    await Promise.all(files.filter(file => file.untracked).map(async file => {
      file.added = await countFileLines(cwd, file.path)
    }))
    files.sort((a, b) => a.path.localeCompare(b.path))

    let totalAdded = 0
    let totalDeleted = 0
    for (const file of files) {
      totalAdded += file.added
      totalDeleted += file.deleted
    }

    const hasRemote = (remotes?.stdout.trim().length ?? 0) > 0

    return {
      isRepo: true,
      cwd,
      branch: header.branch,
      ...(detachedHead !== undefined ? { detachedHead } : {}),
      ...(header.upstream !== undefined ? { upstream: header.upstream } : {}),
      ahead: header.ahead,
      behind: header.behind,
      hasRemote,
      clean: files.length === 0,
      files,
      totalAdded,
      totalDeleted,
    }
  }

  /** Local + remote branch enumeration. */
  async branches(cwd: string, signal?: AbortSignal): Promise<GitBranches> {
    let current: string | null = null
    try {
      const { stdout } = await runGit(cwd, ['branch', '--show-current'], { signal })
      current = stdout.trim() || null
    } catch {
      // Ignore.
    }
    const local: string[] = []
    const remote: string[] = []
    try {
      const { stdout } = await runGit(cwd, ['branch', '--format=%(refname:short)'], { signal })
      for (const line of stdout.split('\n')) {
        const name = line.trim()
        if (name !== '') local.push(name)
      }
    } catch {
      // Ignore.
    }
    try {
      // Full refnames, then strip `refs/remotes/` ourselves: with
      // `%(refname:short)` git collapses `refs/remotes/origin/HEAD` to a bare
      // `origin`, which would show up as a phantom remote branch.
      const { stdout } = await runGit(cwd, ['branch', '-r', '--format=%(refname)'], { signal })
      for (const line of stdout.split('\n')) {
        const ref = line.trim()
        if (!ref.startsWith('refs/remotes/')) continue
        const name = ref.slice('refs/remotes/'.length)
        if (name === '' || name === 'HEAD' || name.endsWith('/HEAD')) continue
        remote.push(name)
      }
    } catch {
      // Ignore.
    }
    return { current, local, remote }
  }

  /**
   * Per-file diff for the side panel. `mode: 'hunk'` returns only the changed
   * ranges (untracked files render as whole-file additions); `mode: 'full'`
   * returns the whole file with added lines marked.
   */
  async diff(cwd: string, path: string, mode: 'hunk' | 'full', signal?: AbortSignal): Promise<GitDiffResult> {
    if (path.includes('\0')) throw new Error('invalid path')
    if (mode !== 'hunk' && mode !== 'full') throw new Error('invalid mode')

    // New / untracked files have no HEAD side; the whole file is an addition.
    let isUntracked = false
    let hasHeadVersion = true
    try {
      await runGit(cwd, ['ls-files', '--error-unmatch', '--', path], { signal })
    } catch {
      hasHeadVersion = false
    }
    try {
      const { stdout } = await runGit(cwd, ['ls-files', '--others', '--exclude-standard', '-z'], { signal })
      isUntracked = stdout.split('\0').includes(path)
    } catch {
      isUntracked = false
    }

    if (!hasHeadVersion && !isUntracked) {
      throw new Error(`not a changed file in this repository: ${path}`)
    }

    const fromHead = !isUntracked && hasHeadVersion
    let hunkText = ''
    if (fromHead) {
      const [staged, unstaged] = await Promise.all([
        runGit(cwd, ['diff', '--cached', '--no-ext-diff', '--unified=3', '--', path], { signal }).catch(() => ({ stdout: '', stderr: '' })),
        runGit(cwd, ['diff', '--no-ext-diff', '--unified=3', '--', path], { signal }).catch(() => ({ stdout: '', stderr: '' })),
      ])
      hunkText = `${staged.stdout}${unstaged.stdout}`
    }
    const hunkLines = fromHead ? parseUnifiedDiff(hunkText) : []

    if (mode === 'hunk') {
      if (!fromHead) {
        const { content, truncated } = await readFileContent(cwd, path, signal)
        const lines = content.split('\n').map((text, i) => ({
          type: 'add' as const,
          old: null,
          new: i + 1,
          text,
        }))
        if (lines.length > 0 && lines[lines.length - 1]?.text === '') lines.pop()
        return { path, mode, lines, truncated }
      }
      if (hunkLines.length > MAX_DIFF_ROWS) {
        // Cap the DOM the panel renders — a >3000-line lockfile diff freezes
        // the GUI. Keep the head hunks (what the eye reads first) and a
        // trailing marker, like git's own pager truncation.
        return {
          path,
          mode,
          lines: [...hunkLines.slice(0, MAX_DIFF_ROWS), { type: 'hunk', old: null, new: null, text: `… diff truncated (${hunkLines.length} lines)` }],
          truncated: true,
        }
      }
      return { path, mode, lines: hunkLines, truncated: false }
    }

    // Full-file view: read the working-tree content, mark added lines.
    const { content, truncated } = await readFileContent(cwd, path, signal)
    const addedSet = addedNewLineNumbers(hunkLines)
    const allAdded = !fromHead
    const rawLines = content.split('\n')
    if (rawLines.length > 0 && rawLines[rawLines.length - 1] === '') rawLines.pop()
    const lines: DiffLine[] = rawLines.slice(0, MAX_FULL_LINES).map((text, i) => ({
      type: allAdded || addedSet.has(i + 1) ? 'add' : 'ctx',
      old: null,
      new: i + 1,
      text,
    }))
    return { path, mode, lines, truncated: truncated || rawLines.length > MAX_FULL_LINES }
  }

  /**
   * Stage and commit; optionally push afterwards. Returns the short hash.
   * When `exclude` names changed files, they are unstaged and left out of the
   * commit (they stay in the working tree); otherwise everything is staged
   * with `git add -A`.
   */
  async commit(
    cwd: string,
    message: string,
    opts: { push?: boolean; exclude?: readonly string[]; tag?: string; signal?: AbortSignal } = {},
  ): Promise<{ hash?: string; pushed: boolean; tag?: string }> {
    const msg = message.trim()
    if (msg === '') throw new Error('commit message is empty')
    const exclude = (opts.exclude ?? []).filter(path => path !== '')
    if (exclude.length === 0) {
      await runGit(cwd, ['add', '-A'], { signal: opts.signal })
    } else {
      // Exclusions requested: unstage everything, then stage only the files
      // that were NOT excluded.
      await runGit(cwd, ['reset'], { signal: opts.signal })
      const snapshot = await this.snapshot(cwd, opts.signal)
      const included = snapshot.files
        .filter(file => !exclude.includes(file.path))
        .map(file => file.path)
      if (included.length === 0) throw new Error('no files to commit — everything is excluded')
      await runGit(cwd, ['add', '--', ...included], { signal: opts.signal })
    }
    await runGit(cwd, ['commit', '-m', msg], { signal: opts.signal })
    let hash: string | undefined
    try {
      const { stdout } = await runGit(cwd, ['rev-parse', '--short', 'HEAD'], { signal: opts.signal })
      hash = stdout.trim() || undefined
    } catch {
      // Hash is informational only.
    }
    // Tag BEFORE pushing so a bad tag name fails before anything left the
    // machine; the tag itself rides to the remote only after the code did.
    // The commit-band shortcut creates a lightweight tag on HEAD.
    const tag = opts.tag?.trim() ?? ''
    let tagCreated: string | undefined
    if (tag !== '') {
      await this.createTag(cwd, tag, opts.signal !== undefined ? { signal: opts.signal } : {})
      tagCreated = tag
    }
    let pushed = false
    if (opts.push === true) {
      await this.push(cwd, opts.signal)
      pushed = true
      if (tagCreated !== undefined) await this.pushTag(cwd, tagCreated, opts.signal)
    }
    const result: { hash?: string; pushed: boolean; tag?: string } = { pushed }
    if (hash !== undefined) result.hash = hash
    if (tagCreated !== undefined) result.tag = tagCreated
    return result
  }

  /** Delete a local branch (force; the UI confirms first). Protected branches cannot be deleted. */
  async deleteBranch(cwd: string, name: string, signal?: AbortSignal): Promise<void> {
    if (!isValidBranchName(name)) throw new Error('invalid branch name')
    if (isProtectedBranchName(name)) throw new Error(`cannot delete protected branch: ${name}`)
    const { stdout } = await runGit(cwd, ['branch', '--show-current'], { signal })
    if (stdout.trim() === name) throw new Error(`cannot delete the current branch: ${name}`)
    await runGit(cwd, ['branch', '-D', name], { signal })
  }

  /**
   * Delete a remote branch (`origin/foo` → `git push origin --delete foo`).
   * Protected branches cannot be deleted. The local remote-tracking ref is
   * pruned afterwards so the branch list refreshes without waiting for a fetch.
   */
  async deleteRemoteBranch(cwd: string, name: string, signal?: AbortSignal): Promise<void> {
    const idx = name.indexOf('/')
    if (idx <= 0 || idx === name.length - 1) throw new Error('invalid remote branch name')
    const remote = name.slice(0, idx)
    const branch = name.slice(idx + 1)
    if (remote.includes('/') || !isValidBranchName(remote) || !isValidBranchName(branch)) {
      throw new Error('invalid remote branch name')
    }
    if (isProtectedBranchName(branch)) throw new Error(`cannot delete protected branch: ${branch}`)
    await runGit(cwd, ['push', remote, '--delete', branch], { signal })
    // Best-effort prune of the stale remote-tracking ref.
    await runGit(cwd, ['branch', '-dr', name], { signal }).catch(() => {})
  }

  /**
   * Rename a branch (`git branch -m`). Renaming the current branch moves HEAD
   * with it; a remote upstream keeps its old name — pushing the new name and
   * deleting the old remote branch stays an explicit separate step.
   */
  async renameBranch(cwd: string, name: string, newName: string, signal?: AbortSignal): Promise<void> {
    if (!isValidBranchName(name) || !isValidBranchName(newName)) throw new Error('invalid branch name')
    if (isProtectedBranchName(name)) throw new Error(`cannot rename protected branch: ${name}`)
    if (name === newName) return
    await runGit(cwd, ['branch', '-m', name, newName], { signal })
  }

  /** Tags newest-first, each with the short hash + subject of its commit. */
  async tags(cwd: string, signal?: AbortSignal): Promise<GitTags> {
    const { stdout } = await runGit(cwd, [
      'tag', '--list', '--sort=-creatordate',
      '--format=%(refname:short)%09%(objectname:short)%09%(contents:subject)',
    ], { signal })
    const tags: GitTag[] = []
    for (const line of stdout.split('\n')) {
      const [name, hash, subject] = line.split('\t')
      if (name !== undefined && name !== '' && hash !== undefined && hash !== '') {
        tags.push({ name, hash, subject: subject ?? '' })
      }
    }
    return { tags }
  }

  /**
   * Create a tag on HEAD, or on `ref` (any hash/branch the rev-parse accepts)
   * for back-tagger duty. With a message the tag is annotated, otherwise it is
   * a lightweight pointer. Refuses an already-taken name (git enforces this
   * too — the check just makes the API error readable).
   */
  async createTag(
    cwd: string,
    name: string,
    opts: { message?: string; ref?: string; signal?: AbortSignal } = {},
  ): Promise<void> {
    if (!isValidTagName(name)) throw new Error('invalid tag name')
    const message = opts.message?.trim() ?? ''
    const ref = opts.ref?.trim() ?? ''
    const args = message !== '' ? ['tag', '-a', name, '-m', message] : ['tag', name]
    if (ref !== '') args.push(ref)
    await runGit(cwd, args, { signal: opts.signal })
  }

  /** Delete a local tag (`git tag -d`). Remote tags stay untouched. */
  async deleteTag(cwd: string, name: string, signal?: AbortSignal): Promise<void> {
    if (!isValidTagName(name)) throw new Error('invalid tag name')
    await runGit(cwd, ['tag', '-d', name], { signal })
  }

  /** Push one tag to `origin` — git never ships tags with a plain push. */
  async pushTag(cwd: string, name: string, signal?: AbortSignal): Promise<void> {
    if (!isValidTagName(name)) throw new Error('invalid tag name')
    await runGit(cwd, ['push', 'origin', name], { signal })
  }

  /**
   * Recent commits across all refs (`git log --date-order --all`), bounded by
   * `limit`. Parent hashes ride along so the client can lay out branch lanes
   * and render the fork/merge graph as SVG.
   */
  async graph(cwd: string, limit: number | undefined, signal?: AbortSignal): Promise<GitGraph> {
    const n = Math.max(1, Math.min(500, Number.isFinite(limit) ? Math.floor(limit as number) : 150))
    const sep = '\u001f'
    const { stdout } = await runGit(cwd, [
      'log', '--all', '--no-color', '--date-order',
      `--format=${sep}%H${sep}%h${sep}%an${sep}%aI${sep}%cr${sep}%d${sep}%P${sep}%s`,
      '-n', String(n),
    ], { signal })
    const commits: GitGraphCommit[] = []
    for (const line of stdout.split('\n')) {
      // The format leads with the separator, so parts[0] is always '' — skip
      // it in the destructure (no `--graph` anymore, so there is no edge
      // prefix and no continuation lines either).
      const parts = line.split(sep)
      if (parts.length < 9) continue
      const [, fullHash, hash, author, date, dateRelative, refs, parents, subject] = parts
      if (fullHash === undefined || fullHash === '' || subject === undefined) continue
      commits.push({
        parents: (parents ?? '').trim() === '' ? [] : (parents ?? '').trim().split(' '),
        fullHash,
        hash: hash ?? fullHash.slice(0, 7),
        author: (author ?? '').trim(),
        date: (date ?? '').trim(),
        dateRelative: (dateRelative ?? '').trim(),
        refs: (refs ?? '').trim().replace(/^\(|\)$/g, ''),
        subject: subject.trim(),
      })
    }
    return { commits, truncated: commits.length >= n }
  }

  /** Push the current branch; a branch without upstream gets `-u origin <branch>`. */
  async push(cwd: string, signal?: AbortSignal): Promise<void> {
    let branch = ''
    try {
      const { stdout } = await runGit(cwd, ['branch', '--show-current'], { signal })
      branch = stdout.trim()
    } catch {
      // Ignore.
    }
    let hasUpstream = false
    try {
      await runGit(cwd, ['rev-parse', '--abbrev-ref', '@{upstream}'], { signal })
      hasUpstream = true
    } catch {
      hasUpstream = false
    }
    if (hasUpstream || branch === '') {
      await runGit(cwd, ['push'], { signal })
    } else {
      await runGit(cwd, ['push', '-u', 'origin', branch], { signal })
    }
  }

  /**
   * Pull the current branch, fast-forward only: a diverged branch aborts with
   * git's own message instead of silently creating a merge commit, and a
   * branch without upstream fails with git's tracking-information error.
   */
  async pull(cwd: string, signal?: AbortSignal): Promise<void> {
    await runGit(cwd, ['pull', '--ff-only'], { signal })
  }

  /** Switch to an existing branch (git switch, falling back to checkout). */
  async checkout(cwd: string, branch: string, signal?: AbortSignal): Promise<void> {
    if (!isValidBranchName(branch)) throw new Error('invalid branch name')
    try {
      await runGit(cwd, ['switch', branch], { signal })
    } catch (error) {
      if (isAbortError(error)) throw error
      await runGit(cwd, ['checkout', branch], { signal })
    }
  }

  /**
   * Create a branch from `base` (default: current HEAD) and switch to it.
   * When `pushRemote` is true, the new branch is also pushed to `origin`
   * with `-u`, creating it on the remote.
   */
  async createBranch(
    cwd: string,
    name: string,
    base: string | undefined,
    pushRemote: boolean,
    signal?: AbortSignal,
  ): Promise<void> {
    if (!isValidBranchName(name)) throw new Error('invalid branch name')
    const args = ['switch', '-c', name]
    if (base !== undefined && base !== '') {
      if (!isValidBranchName(base)) throw new Error('invalid base branch name')
      args.push(base)
    }
    try {
      await runGit(cwd, args, { signal })
    } catch (error) {
      if (isAbortError(error)) throw error
      await runGit(cwd, ['checkout', '-b', name, ...(base !== undefined && base !== '' ? [base] : [])], { signal })
    }
    if (pushRemote) {
      await runGit(cwd, ['push', '-u', 'origin', name], { signal })
    }
  }
}

// ---------------------------------------------------------------------------
// Terminal sessions — one REAL PTY per target key, following the
// dsh-better-sidebar design (src/pty-manager.ts): node-pty spawns the shell,
// output is mirrored into a bounded transcript ring that is replayed to every
// newly attached socket before live data, processes survive socket drops
// (page refresh, panel toggle) behind a reconnect grace, and an explicit
// close frame / plugin teardown kills the shell. The browser half renders the
// stream with xterm.js over a WebSocket — full emulation, colors, Ctrl+C and
// interactive apps work exactly like a local terminal.
// ---------------------------------------------------------------------------

/**
 * Duck-typed face of the `node-pty` module — only what this plugin touches.
 * Kept structural so a broken native install degrades into a clear
 * "pty unavailable" error instead of crashing plugin activation.
 */
interface NodePtyModule {
  spawn(file: string, args: readonly string[], options: {
    name: string
    cols: number
    rows: number
    cwd: string
    env: NodeJS.ProcessEnv
  }): IPtyLike
}

/** Duck-typed face of one node-pty terminal handle. */
interface IPtyLike {
  pid: number
  write(data: string): void
  resize(cols: number, rows: number): void
  kill(): void
  onData(listener: (data: string) => void): unknown
  onExit(listener: (event: { exitCode: number; signal?: number }) => void): unknown
}

/** Load the native pty module; undefined when missing or unloadable. */
function loadNodePty(): NodePtyModule | undefined {
  try {
    return createRequire(import.meta.url)('node-pty') as NodePtyModule
  } catch {
    return undefined
  }
}

/**
 * Resolve the login shell. Windows prefers pwsh (PowerShell 7+) from PATH or
 * the well-known install dirs, falling back to Windows PowerShell; POSIX uses
 * $SHELL, then bash, then sh. Resolved per spawn so a mid-session install of
 * pwsh is picked up without a host restart. No -NoLogo: the version banner
 * gives the panel the familiar "real terminal" opening frame.
 */
function resolveShell(): { file: string; args: readonly string[] } {
  if (process.platform === 'win32') {
    const dirs: string[] = []
    for (const entry of (process.env.PATH ?? '').split(';')) {
      const trimmed = entry.trim()
      if (trimmed !== '') dirs.push(trimmed)
    }
    for (const root of [process.env.ProgramW6432, process.env.ProgramFiles]) {
      if (root === undefined || root === '') continue
      dirs.push(resolve(root, 'PowerShell', '7'), resolve(root, 'PowerShell', '7-preview'))
    }
    for (const dir of dirs) {
      const candidate = resolve(dir, 'pwsh.exe')
      if (existsSync(candidate)) return { file: candidate, args: [] }
    }
    return { file: 'powershell.exe', args: [] }
  }
  const shell = process.env.SHELL
  if (shell !== undefined && shell !== '') return { file: shell, args: [] }
  for (const candidate of ['/bin/bash', '/bin/sh']) {
    if (existsSync(candidate)) return { file: candidate, args: [] }
  }
  return { file: 'sh', args: [] }
}

/** Per-terminal transcript bound (bytes kept for replay), mirroring better-sidebar. */
const TRANSCRIPT_LIMIT = 1 << 20

/** Upper bound on concurrent shells across all targets. */
const MAX_SESSIONS = 16

/** A browser socket attached to one terminal (the WebSocket adapter). */
export interface TerminalClient {
  /** Push one chunk to the browser: raw pty bytes or a JSON control frame. */
  send(text: string): void
  /** Whether the connection can still carry frames. */
  readonly alive: boolean
}

interface TerminalSession {
  key: string
  cwd: string
  pty: IPtyLike
  /** Output accumulated since spawn (bounded; head dropped when over the limit). */
  transcript: string
  exited: boolean
  exitCode: number | null
  clients: Set<TerminalClient>
  closeTimer: ReturnType<typeof setTimeout> | null
}

/**
 * Owns the terminal shells, keyed by target (`session:<id>` / `ws:<name>`).
 * One live process per key: re-attach reuses it (transcript replay makes the
 * panel reopen seamless), an exited or cwd-changed handle is replaced with a
 * fresh spawn. Socket drops schedule a grace close that a timely re-attach
 * cancels; only the explicit close frame and teardown kill immediately.
 */
export class TerminalSessionManager {
  private readonly sessions = new Map<string, TerminalSession>()
  private readonly nodePty: NodePtyModule | undefined

  constructor(loadPty: () => NodePtyModule | undefined = loadNodePty) {
    this.nodePty = loadPty()
  }

  /** Whether the native pty module could not be loaded (degraded mode). */
  get unavailable(): boolean {
    return this.nodePty === undefined
  }

  /**
   * Attach one browser client to the target's terminal, opening (or replacing)
   * the underlying shell as needed.
   * @returns the session whose `transcript` must be replayed to the client
   *   before live data (empty on a fresh spawn).
   */
  attach(key: string, cwd: string, cols: number, rows: number, client: TerminalClient): TerminalSession {
    let session = this.sessions.get(key)
    // A dead shell must not become an input sink, and a shell sitting in a
    // stale directory (session cwd changed) is respawned — same rules as
    // better-sidebar's PtyManager.open.
    if (session !== undefined && (session.exited || session.cwd !== cwd)) {
      this.close(key)
      session = undefined
    }
    if (session === undefined) {
      this.evictForNewSession()
      session = this.spawn(key, cwd, cols, rows)
      this.sessions.set(key, session)
    }
    this.cancelClose(key)
    session.clients.add(client)
    return session
  }

  /** Remove one client; when the last one leaves, arm the reconnect grace. */
  detach(key: string, client: TerminalClient): void {
    const session = this.sessions.get(key)
    if (session === undefined) return
    session.clients.delete(client)
    if (session.clients.size === 0 && !session.exited) this.scheduleClose(key, SOCKET_DROP_GRACE_MS)
  }

  /** Forward raw stdin bytes from the browser to the shell. */
  input(key: string, data: string): void {
    this.sessions.get(key)?.pty.write(data)
  }

  /** Propagate the xterm viewport size to the pty. */
  resize(key: string, cols: number, rows: number): void {
    const session = this.sessions.get(key)
    if (session === undefined || session.exited) return
    try {
      session.pty.resize(Math.max(2, Math.floor(cols)), Math.max(2, Math.floor(rows)))
    } catch {
      // A resize racing an exit throws inside node-pty; harmless.
    }
  }

  /** Kill the target's shell now (explicit close frame / teardown path). */
  close(key: string): void {
    this.cancelClose(key)
    const session = this.sessions.get(key)
    if (session === undefined) return
    this.sessions.delete(key)
    try {
      session.pty.kill()
    } catch {
      // Already exited or gone; nothing left to kill.
    }
  }

  /** Kill every shell (plugin teardown). */
  disposeAll(): void {
    for (const key of [...this.sessions.keys()]) this.close(key)
  }

  private spawn(key: string, cwd: string, cols: number, rows: number): TerminalSession {
    if (this.nodePty === undefined) throw new Error('pty-unavailable')
    const shell = resolveShell()
    const pty = this.nodePty.spawn(shell.file, [...shell.args], {
      name: 'xterm-256color',
      cols: Math.max(2, Math.floor(cols)),
      rows: Math.max(2, Math.floor(rows)),
      cwd,
      env: { ...process.env },
    })
    const session: TerminalSession = { key, cwd, pty, transcript: '', exited: false, exitCode: null, clients: new Set(), closeTimer: null }
    pty.onData((data) => {
      session.transcript += data
      if (session.transcript.length > TRANSCRIPT_LIMIT) {
        session.transcript = session.transcript.slice(session.transcript.length - TRANSCRIPT_LIMIT)
      }
      this.broadcast(session, data)
    })
    pty.onExit(({ exitCode }) => {
      session.exited = true
      session.exitCode = exitCode
      this.broadcast(session, `${JSON.stringify({ type: 'exit', code: exitCode })}\n`)
      // Nobody is watching an exited shell — drop the record at once so the
      // next attach spawns a fresh prompt instead of replaying a corpse.
      if (session.clients.size === 0) this.close(key)
    })
    return session
  }

  /** Fan one pty chunk out to every attached, still-open client. */
  private broadcast(session: TerminalSession, text: string): void {
    for (const client of session.clients) {
      if (!client.alive) continue
      try {
        client.send(text)
      } catch {
        // A throwing socket must not kill the pump loop.
      }
    }
  }

  /** Make room for a new shell: drop exited records first, then detached ones. */
  private evictForNewSession(): void {
    if (this.sessions.size < MAX_SESSIONS) return
    const candidates = [...this.sessions.entries()].filter(([, s]) => s.clients.size === 0)
    candidates.sort((a, b) => a[0].localeCompare(b[0]))
    const exited = candidates.find(([, s]) => s.exited)
    const detached = exited ?? candidates[0]
    if (detached !== undefined) {
      this.close(detached[0])
      return
    }
    throw new Error(`terminal limit reached (${MAX_SESSIONS})`)
  }

  /** Arm (or re-arm) the delayed destruction used for bare socket drops. */
  private scheduleClose(key: string, delayMs: number): void {
    this.cancelClose(key)
    const session = this.sessions.get(key)
    if (session === undefined) return
    session.closeTimer = setTimeout(() => { this.close(key) }, delayMs)
  }

  /** Cancel a pending scheduled close (a client re-attached in time). */
  private cancelClose(key: string): void {
    const session = this.sessions.get(key)
    if (session?.closeTimer !== null && session?.closeTimer !== undefined) {
      clearTimeout(session.closeTimer)
      session.closeTimer = null
    }
  }
}

/** How long a shell survives after its last browser socket drops. */
const SOCKET_DROP_GRACE_MS = 120_000

function isAbortError(error: unknown): boolean {
  return error !== null && typeof error === 'object' && 'aborted' in error && (error as { aborted?: unknown }).aborted === true
}

/** Git branch names: no leading `-`, no spaces, no control chars. */
function isValidBranchName(name: string): boolean {
  return /^[A-Za-z0-9._\/-]+$/.test(name) && !name.startsWith('-') && !name.includes('..')
}

/** Tag names: the same ref-charset rules as branches (refs/tags rejects the
 *  same metacharacters), minus `HEAD` itself. */
function isValidTagName(name: string): boolean {
  return isValidBranchName(name) && name !== 'HEAD'
}

/** Branch names that must never be deletable (main/master). */
function isProtectedBranchName(name: string): boolean {
  return name === 'main' || name === 'master'
}
