/**
 * dsh-ui-tweaks — Git backend (host half).
 *
 * Executes read-only and mutating git commands in a session's working
 * directory (the "current project", resolved from the session header's cwd)
 * for the GitBar: status snapshot (branch, ahead/behind, changed files with
 * ±line counts), branch enumeration, per-file diff views, commit-message
 * suggestion (LLM first, heuristic fallback), and the commit / push /
 * switch / create actions.
 *
 * Every command runs through `child_process.execFile` — never a shell, args
 * as an argv array, cwd pinned, bounded timeout, abort propagation — so
 * repo-controlled strings cannot escape into a shell and a hung remote cannot
 * wedge the plugin.
 * @module dsh-ui-tweaks/git
 */

import { execFile } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { open } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import type { UITweaksConfig } from './config.ts'

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

/** One commit row of the graph table. */
export interface GitGraphCommit {
  /** ASCII graph edge prefix (monospace drawing column). */
  graph: string
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

/** Git commit graph table (`git log --graph`, structured rows). */
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

const GIT_TIMEOUT_MS = 10000
const LLM_TIMEOUT_MS = 20000

/**
 * Settings namespace of dsh-agent-default-model — the model the user picked
 * for this DSH's Agents. Read directly from settings (not only through the
 * service) so the selection works even when the service is out of the
 * plugin context's reach.
 */
const AGENT_DEFAULT_MODEL_NAMESPACE = settingsNamespace('agent-default-model')

/**
 * Budgets for the diff excerpt handed to the model when suggesting a commit
 * message. A file list alone cannot describe intent, so the real patch text
 * goes into the prompt — bounded, because the model context and the request
 * latency both pay for it.
 */
const MAX_SUGGEST_DIFF_CHARS = 12000
/** Per-file share, so one huge file cannot crowd every other file out. */
const MAX_SUGGEST_FILE_CHARS = 2600
/** New (untracked) files are described by their first lines only. */
const MAX_SUGGEST_NEW_FILE_LINES = 40
/** How many files contribute content at all (the list still shows the rest). */
const MAX_SUGGEST_FILES = 24

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

/** Parse `git status --porcelain=v1 -z` output into XY entries with paths. */
function parseStatusPorcelainZ(stdout: string): Array<{ index: string; worktree: string; path: string }> {
  const out: Array<{ index: string; worktree: string; path: string }> = []
  const parts = stdout.split('\0')
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    if (part === undefined || part.length < 3) continue
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

/** Count newline-delimited lines of a small text file; 0 for binary/oversized. */
function countFileLines(cwd: string, path: string): number {
  try {
    const full = resolveWithin(cwd, path)
    const stat = statSync(full)
    if (!stat.isFile() || stat.size > MAX_COUNT_FILE_BYTES) return 0
    const buf = readFileSync(full)
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

/** Conventional-commit style type inference from the change profile. */
function inferType(files: GitFileChange[], added: number, deleted: number): string {
  const count = files.length
  if (count === 0) return 'chore'
  const isDocs = (f: GitFileChange): boolean => /\.(md|mdx|rst|txt)$/i.test(f.path) || /(^|\/)docs?(\/|$)/.test(f.path)
  const isTest = (f: GitFileChange): boolean => /\.(test|spec)\./i.test(f.path) || /(^|\/)(tests?|__tests__|__specs__)(\/|$)/.test(f.path)
  const isConfig = (f: GitFileChange): boolean => /(^|\/)(package\.json|pnpm-lock\.ya?ml|pnpm-workspace\.ya?ml|tsconfig[^/]*\.json|.*\.config\.(js|ts|mjs|cjs)|\.github\/|\.gitignore|cordis\.patch\.ya?ml|.*\.patch\.ya?ml)$/i.test(f.path)
  const docs = files.filter(isDocs)
  const tests = files.filter(isTest)
  const configs = files.filter(isConfig)
  if (docs.length > 0 && docs.length / count >= 0.5) return 'docs'
  if (tests.length > 0 && tests.length / count >= 0.5) return 'test'
  if (configs.length > 0 && configs.length / count >= 0.5) return 'chore'
  const newFiles = files.filter(f => f.status === 'A' || f.untracked)
  if (newFiles.length > 0 && added >= deleted) return 'feat'
  if (deleted > added && added > 0) return 'fix'
  if (added > deleted) return 'feat'
  if (added > 0) return 'refactor'
  return 'chore'
}

/** Derive a scope from the shared top-level directory of the changed files. */
function inferScope(files: GitFileChange[]): string | undefined {
  const counts = new Map<string, number>()
  for (const f of files) {
    const idx = f.path.indexOf('/')
    if (idx > 0) {
      const top = f.path.slice(0, idx)
      if (!top.startsWith('.')) counts.set(top, (counts.get(top) ?? 0) + 1)
    }
  }
  let best: string | undefined
  let bestCount = 0
  for (const [top, n] of counts) {
    if (n > bestCount) {
      best = top
      bestCount = n
    }
  }
  return best
}

/** Shorten a summary while keeping it human-readable. */
function shorten(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`
}

/** Deterministic offline commit-message generation (LLM fallback). */
export function heuristicSuggest(snapshot: GitSnapshot): string {
  const files = snapshot.files
  if (files.length === 0) return 'chore: no changes'
  const type = inferType(files, snapshot.totalAdded, snapshot.totalDeleted)
  const scope = inferScope(files)
  const top = [...files].sort((a, b) => (b.added + b.deleted) - (a.added + a.deleted))
  const names = top.slice(0, 2).map(f => {
    const base = f.path.split('/').pop() ?? f.path
    return base.replace(/\.[^.]+$/, '')
  }).filter(Boolean)
  const summary = shorten(names.join(' & '), 58)
  return scope !== undefined ? `${type}(${scope}): ${summary}` : `${type}: ${summary}`
}

/** Structural view of the LLM service — duck-typed so dsh-llm is optional. */
interface LlmLike {
  listProviders(): Array<{ id: string; name: string }>
  listModels(provider: string): Promise<Array<{ id: string; name: string }>>
  stream(options: {
    provider: string
    model: string
    messages: Array<{ role: string; content: Array<{ type: string; text: string }>; id?: string; source?: unknown }>
    system?: string
    temperature?: number
    maxTokens?: number
    signal?: AbortSignal
  }): AsyncIterable<{ type: string; text?: string; reason?: unknown }>
}

/**
 * Structural view of the default-model service (dsh-agent-default-model), so
 * a suggestion uses the model the user already chose for this DSH instead of
 * whichever provider happened to register first.
 */
interface DefaultModelLike {
  currentSelection(): { provider?: string; model?: string }
}

/** How a commit message was produced, and why the LLM path was skipped. */
export interface GitSuggestResult {
  message: string
  /** `llm` = a model wrote it; `heuristic` = offline fallback from file names. */
  via: 'llm' | 'heuristic'
  /** Provider/model actually used (or attempted). */
  provider?: string
  model?: string
  /** Why the LLM path did not produce a message (only when `via` is heuristic). */
  reason?: string
  /** Whether the diff excerpt handed to the model was cut short. */
  truncated?: boolean
}

/** Error text for a diagnostic, without leaking a stack trace. */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Render a stream `finish` reason as a short diagnostic string. */
function finishReasonText(reason: unknown): string {
  if (typeof reason === 'string') return reason
  if (typeof reason !== 'object' || reason === null) return 'unknown'
  const record = reason as Record<string, unknown>
  const kind = typeof record.kind === 'string' ? record.kind : 'unknown'
  const failure = record.failure
  if (typeof failure === 'object' && failure !== null) {
    const inner = failure as Record<string, unknown>
    const code = typeof inner.code === 'string' ? inner.code : undefined
    const message = typeof inner.message === 'string' ? inner.message : undefined
    const detail = [code, message].filter(Boolean).join(': ')
    if (detail !== '') return `${kind} (${detail})`
  }
  return kind
}

/** Keep the head of a per-file patch, marking the cut. */
function clampPatch(patch: string, max: number): { text: string; truncated: boolean } {
  if (patch.length <= max) return { text: patch, truncated: false }
  return { text: `${patch.slice(0, max)}\n… [patch truncated]\n`, truncated: true }
}

/**
 * Collect the actual patch text for the pending changes, bounded by
 * {@link MAX_SUGGEST_DIFF_CHARS}. Tracked changes come from one
 * `git diff HEAD` (staged and unstaged together, renames detected); untracked
 * files have no HEAD side, so their first lines are quoted instead.
 */
async function collectSuggestDiff(
  cwd: string,
  snapshot: GitSnapshot,
  signal?: AbortSignal,
): Promise<{ text: string; truncated: boolean }> {
  const args = ['diff', '--no-ext-diff', '--no-color', '--unified=3', '-M']
  let raw = ''
  try {
    // `HEAD` covers staged + unstaged in one pass; it fails before the first
    // commit, where `--cached` is the only side that exists.
    raw = (await runGit(cwd, [...args, 'HEAD'], { signal })).stdout
  } catch {
    try {
      raw = (await runGit(cwd, [...args, '--cached'], { signal })).stdout
    } catch {
      raw = ''
    }
  }

  let budget = MAX_SUGGEST_DIFF_CHARS
  let truncated = false
  const chunks: string[] = []
  if (raw !== '') {
    // Split on file boundaries so the budget is spent across files, not on the
    // first enormous one.
    const parts = raw.split(/^(?=diff --git )/m).filter(part => part.trim() !== '')
    let files = 0
    for (const part of parts) {
      if (budget <= 0 || files >= MAX_SUGGEST_FILES) {
        truncated = true
        break
      }
      const clamped = clampPatch(part, Math.min(MAX_SUGGEST_FILE_CHARS, budget))
      if (clamped.truncated) truncated = true
      chunks.push(clamped.text)
      budget -= clamped.text.length
      files++
    }
  }

  for (const file of snapshot.files) {
    if (!file.untracked) continue
    if (budget <= 0) {
      truncated = true
      break
    }
    let head = ''
    try {
      const { content } = await readFileContent(cwd, file.path, signal)
      const lines = content.split('\n')
      const kept = lines.slice(0, MAX_SUGGEST_NEW_FILE_LINES)
      if (lines.length > kept.length) truncated = true
      head = kept.map(line => `+${line}`).join('\n')
    } catch {
      // Binary or unreadable new file: the entry alone still informs the model.
      head = '+[unreadable or binary content]'
    }
    const clamped = clampPatch(`new file: ${file.path}\n${head}\n`, Math.min(MAX_SUGGEST_FILE_CHARS, budget))
    if (clamped.truncated) truncated = true
    chunks.push(clamped.text)
    budget -= clamped.text.length
  }

  return { text: chunks.join('\n'), truncated }
}

/**
 * Model-facing description of the pending changes: the file list for shape,
 * the patch text for intent. Without the patch a model can only paraphrase
 * file names, which is what made earlier suggestions inaccurate.
 */
function buildSuggestPrompt(snapshot: GitSnapshot, diff: { text: string; truncated: boolean }): string {
  const lines: string[] = []
  lines.push(`Branch: ${snapshot.branch ?? 'detached'}`)
  lines.push(`Changed files (${snapshot.files.length}, +${snapshot.totalAdded} -${snapshot.totalDeleted}):`)
  for (const f of snapshot.files.slice(0, 40)) {
    lines.push(`- [${f.status}] ${f.path} (+${f.added} -${f.deleted})`)
  }
  if (snapshot.files.length > 40) lines.push(`- … and ${snapshot.files.length - 40} more`)
  if (diff.text !== '') {
    lines.push('')
    lines.push(diff.truncated ? 'Patch (truncated):' : 'Patch:')
    lines.push(diff.text)
  }
  lines.push('')
  lines.push('Write one conventional commit message for these changes: type(scope): summary.')
  lines.push('Describe what the change does, judged from the patch — never just restate file names.')
  lines.push('Rules: one line, under 72 characters, imperative mood, lowercase summary, no trailing period.')
  lines.push('Reply with the message only.')
  return lines.join('\n')
}

/**
 * The Git service: resolves a session's cwd and runs git on its behalf.
 * @param ctx - plugin context (sessions and llm are read structurally, never required).
 * @param readConfig - reads the plugin config for the `suggestModel` override.
 */
export class GitBackend {
  constructor(
    private readonly ctx: Context,
    private readonly readConfig: () => UITweaksConfig,
  ) {}

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

  /** Full status snapshot for a session's cwd. */
  async snapshot(cwd: string, signal?: AbortSignal): Promise<GitSnapshot> {
    try {
      await runGit(cwd, ['rev-parse', '--is-inside-work-tree'], { signal })
    } catch {
      return { ...NO_REPO, cwd }
    }

    let branch: string | null = null
    let detachedHead: string | undefined
    try {
      const { stdout } = await runGit(cwd, ['branch', '--show-current'], { signal })
      branch = stdout.trim() || null
      if (branch === null) {
        const { stdout: sha } = await runGit(cwd, ['rev-parse', '--short', 'HEAD'], { signal })
        detachedHead = sha.trim() || undefined
      }
    } catch {
      // Branch resolution failure keeps branch null.
    }

    let entries: Array<{ index: string; worktree: string; path: string }> = []
    try {
      const { stdout } = await runGit(cwd, ['status', '--porcelain=v1', '-z'], { signal })
      entries = parseStatusPorcelainZ(stdout)
    } catch {
      // Status failure yields an empty entry list.
    }

    const numstat = new Map<string, { added: number; deleted: number }>()
    try {
      mergeNumstat(numstat, (await runGit(cwd, ['diff', '--numstat'], { signal })).stdout)
    } catch {
      // Ignore.
    }
    try {
      mergeNumstat(numstat, (await runGit(cwd, ['diff', '--cached', '--numstat'], { signal })).stdout)
    } catch {
      // Ignore.
    }

    let untracked: string[] = []
    try {
      const { stdout } = await runGit(cwd, ['ls-files', '--others', '--exclude-standard', '-z'], { signal })
      untracked = stdout.split('\0').filter(Boolean)
    } catch {
      // Ignore.
    }

    let upstream: string | undefined
    try {
      const { stdout } = await runGit(cwd, ['rev-parse', '--abbrev-ref', '@{upstream}'], { signal })
      upstream = stdout.trim() || undefined
    } catch {
      upstream = undefined
    }
    let ahead = 0
    let behind = 0
    if (upstream !== undefined) {
      try {
        const { stdout } = await runGit(cwd, ['rev-list', '--left-right', '--count', 'HEAD...@{upstream}'], { signal })
        const match = stdout.trim().split(/\s+/)
        behind = Number(match[0]) || 0
        ahead = Number(match[1]) || 0
      } catch {
        // Upstream disappeared mid-flight; keep zeros.
      }
    }

    let hasRemote = false
    try {
      const { stdout } = await runGit(cwd, ['remote'], { signal })
      hasRemote = stdout.trim().length > 0
    } catch {
      // Ignore.
    }

    const files: GitFileChange[] = []
    const seen = new Set<string>()
    for (const entry of entries) {
      // `git status` collapses an untracked tree to a directory entry
      // (`?? docs/`); the per-file listing from `ls-files --others` below
      // expands it, so skip the directory row itself.
      if (entry.path.endsWith('/')) continue
      const untrackedFile = entry.index === '?' || entry.worktree === '?'
      const nums = numstat.get(entry.path)
      files.push({
        path: entry.path,
        status: untrackedFile ? 'U' : entry.index === ' ' ? entry.worktree : entry.index,
        added: nums?.added ?? (untrackedFile ? countFileLines(cwd, entry.path) : 0),
        deleted: nums?.deleted ?? 0,
        untracked: untrackedFile,
      })
      seen.add(entry.path)
    }
    for (const path of untracked) {
      if (seen.has(path)) continue
      files.push({ path, status: 'U', added: countFileLines(cwd, path), deleted: 0, untracked: true })
    }
    files.sort((a, b) => a.path.localeCompare(b.path))

    let totalAdded = 0
    let totalDeleted = 0
    for (const file of files) {
      totalAdded += file.added
      totalDeleted += file.deleted
    }

    return {
      isRepo: true,
      cwd,
      branch,
      ...(detachedHead !== undefined ? { detachedHead } : {}),
      ...(upstream !== undefined ? { upstream } : {}),
      ahead,
      behind,
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
   * Suggest a commit message: LLM first (when the service and a model are
   * available), heuristic fallback otherwise. Kept for callers that only want
   * the text; {@link suggestDetailed} also reports which path produced it.
   */
  async suggest(cwd: string, signal?: AbortSignal): Promise<string> {
    return (await this.suggestDetailed(cwd, signal)).message
  }

  /**
   * Suggest a commit message and report how it was produced. A failing LLM
   * path is no longer silent: the caller receives `via: 'heuristic'` plus the
   * reason, and the failure is logged, because an offline fallback message
   * looks exactly like a model-written one in the UI.
   */
  async suggestDetailed(cwd: string, signal?: AbortSignal): Promise<GitSuggestResult> {
    const snapshot = await this.snapshot(cwd, signal)
    if (snapshot.files.length === 0) return { message: 'chore: no changes', via: 'heuristic', reason: 'no changes' }
    const attempt = await this.llmSuggest(snapshot, cwd, signal)
    if (attempt.message !== null) {
      return {
        message: attempt.message,
        via: 'llm',
        ...(attempt.provider !== undefined ? { provider: attempt.provider } : {}),
        ...(attempt.model !== undefined ? { model: attempt.model } : {}),
        ...(attempt.truncated === true ? { truncated: true } : {}),
      }
    }
    const reason = attempt.reason ?? 'llm unavailable'
    this.ctx.logger.warn(
      'dsh-ui-tweaks: commit-message model unavailable (%s%s); used the offline heuristic instead',
      reason,
      attempt.provider === undefined ? '' : ` — ${attempt.provider}:${attempt.model ?? '?'}`,
    )
    return {
      message: heuristicSuggest(snapshot),
      via: 'heuristic',
      reason,
      ...(attempt.provider !== undefined ? { provider: attempt.provider } : {}),
      ...(attempt.model !== undefined ? { model: attempt.model } : {}),
    }
  }

  /**
   * Resolve which provider/model writes the commit message: the `suggestModel`
   * override, else this DSH's default Agent model. No further fallback — if
   * the default model is unavailable or fails, the suggestion fails (the
   * caller reports the reason) rather than silently using another provider.
   */
  private async resolveSuggestModel(llm: LlmLike): Promise<{ provider?: string; model?: string; reason?: string }> {
    // 1) Explicit per-plugin override wins.
    const configured = this.readConfig().suggestModel
    if (typeof configured === 'string' && configured.includes(':')) {
      const idx = configured.indexOf(':')
      const provider = configured.slice(0, idx)
      const model = configured.slice(idx + 1)
      if (provider !== '' && model !== '') return { provider, model }
    }

    const registered = new Set(llm.listProviders().map(provider => provider.id))

    // 2) The model the user picked for this DSH's Agents. Try the service
    //    first; fall back to the settings document directly in case the
    //    service is out of this plugin context's reach.
    const defaults = this.ctx.get('agentDefaultModel') as DefaultModelLike | undefined
    if (defaults !== undefined) {
      try {
        const selection = defaults.currentSelection()
        const provider = selection.provider
        const model = selection.model
        if (typeof provider === 'string' && provider !== '' && typeof model === 'string' && model !== ''
          && registered.has(provider)) {
          return { provider, model }
        }
      } catch {
        // Fall through to the settings read.
      }
    }
    try {
      const stored = this.ctx.settings?.get(AGENT_DEFAULT_MODEL_NAMESPACE) as { provider?: string; model?: string } | undefined
      const provider = stored?.provider
      const model = stored?.model
      if (typeof provider === 'string' && provider !== '' && typeof model === 'string' && model !== ''
        && registered.has(provider)) {
        return { provider, model }
      }
    } catch {
      // Ignore — reported as unresolvable below.
    }

    return { reason: 'no default model is configured (set ui-tweaks.suggestModel or the DSH agent-default-model)' }
  }

  private async llmSuggest(
    snapshot: GitSnapshot,
    cwd: string,
    signal?: AbortSignal,
  ): Promise<{ message: string | null; reason?: string; provider?: string; model?: string; truncated?: boolean }> {
    // Optional-service read: the LLM service may not be composed in.
    const llm = this.ctx.get('llm') as LlmLike | undefined
    if (llm === undefined) return { message: null, reason: 'the LLM service is not available in this DSH' }

    const target = await this.resolveSuggestModel(llm)
    const { provider, model } = target
    if (provider === undefined || model === undefined) {
      return {
        message: null,
        reason: target.reason ?? 'no provider/model could be resolved',
        ...(provider !== undefined ? { provider } : {}),
      }
    }

    const diff = await collectSuggestDiff(cwd, snapshot, signal).catch(() => ({ text: '', truncated: false }))

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS)
    const onOuterAbort = (): void => { controller.abort() }
    signal?.addEventListener('abort', onOuterAbort, { once: true })
    const parts: string[] = []
    let finish: string | undefined
    let failure: string | undefined
    try {
      const stream = llm.stream({
        provider,
        model,
        messages: [{
          role: 'user',
          content: [{ type: 'text', text: buildSuggestPrompt(snapshot, diff) }],
        }],
        system: 'You write concise git commit messages. Reply with ONLY the commit message — one line, conventional commits format (type(scope): summary), under 72 characters, no code fences, no extra text.',
        temperature: 0.2,
        // No reasoningEffort is passed: models that do not declare the chosen
        // effort would reject the call. The provider's default reasoning can
        // consume tokens, so leave room above the ~120-token message itself;
        // reasoning deltas are ignored when assembling the reply.
        maxTokens: 1024,
        signal: controller.signal,
      })
      for await (const chunk of stream) {
        if (chunk.type === 'text-delta' && typeof chunk.text === 'string') parts.push(chunk.text)
        if (chunk.type === 'finish') {
          finish = finishReasonText(chunk.reason)
          break
        }
      }
    } catch (error) {
      // A thrown stream (middleware, adapter construction) is a real failure —
      // report it instead of pretending the model had nothing to say.
      failure = messageOf(error)
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onOuterAbort)
    }
    // Strip fences and collapse to one line; a leading "type(scope):" survives.
    const text = parts.join('').trim().replace(/^```|```$/g, '').replace(/\s+/g, ' ').slice(0, 120)
    if (text !== '') {
      return { message: text, provider, model, ...(diff.truncated ? { truncated: true } : {}) }
    }
    const reason = failure !== undefined
      ? `the model call failed: ${failure}`
      : finish !== undefined
        ? `the model returned no text (finish: ${finish})`
        : 'the model returned no text'
    return { message: null, reason, provider, model }
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
    opts: { push?: boolean; exclude?: readonly string[]; signal?: AbortSignal } = {},
  ): Promise<{ hash?: string; pushed: boolean }> {
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
    let pushed = false
    if (opts.push === true) {
      await this.push(cwd, opts.signal)
      pushed = true
    }
    return hash === undefined ? { pushed } : { hash, pushed }
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
   * Recent commit graph as structured rows (`git log --graph --all --no-color`
   * with a machine-readable format), bounded by `limit` commits. The graph edge
   * prefix is kept verbatim for the monospace drawing column.
   */
  async graph(cwd: string, limit: number | undefined, signal?: AbortSignal): Promise<GitGraph> {
    const n = Math.max(1, Math.min(500, Number.isFinite(limit) ? Math.floor(limit as number) : 150))
    const sep = '\u001f'
    const { stdout } = await runGit(cwd, [
      'log', '--graph', '--all', '--no-color',
      `--format=${sep}%H${sep}%h${sep}%an${sep}%aI${sep}%cr${sep}%d${sep}%s`,
      '-n', String(n),
    ], { signal })
    const commits: GitGraphCommit[] = []
    for (const line of stdout.split('\n')) {
      // Pure graph continuation lines (`|`, `/`, `\`) carry no commit data.
      const parts = line.split(sep)
      if (parts.length < 8) continue
      const [graph, fullHash, hash, author, date, dateRelative, refs, subject] = parts
      if (fullHash === undefined || fullHash === '' || subject === undefined) continue
      commits.push({
        graph: graph ?? '',
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

function isAbortError(error: unknown): boolean {
  return error !== null && typeof error === 'object' && 'aborted' in error && (error as { aborted?: unknown }).aborted === true
}

/** Git branch names: no leading `-`, no spaces, no control chars. */
function isValidBranchName(name: string): boolean {
  return /^[A-Za-z0-9._\/-]+$/.test(name) && !name.startsWith('-') && !name.includes('..')
}

/** Branch names that must never be deletable (main/master). */
function isProtectedBranchName(name: string): boolean {
  return name === 'main' || name === 'master'
}
