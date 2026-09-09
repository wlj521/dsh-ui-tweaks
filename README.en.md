# dsh-ui-tweaks

> **Dependency**: currently targets **DSH v0.1.5-alpha.1**.

A [DeepSeek Harness](https://deepseek-harness.github.io/deepseek-harness/) (DSH) web plugin that live-tunes the conversation UI from the Settings panel.

## Preview

| | |
|---|---|
| ![Claude Desktop table style](assets/table.png) | ![Settings panel](assets/settings.png) |
| **Table style**: the Claude Desktop look (light-gray rounded cards) | **Settings panel**: code font size / table style / GitBar toggles |
| ![GitBar](assets/git.png) | ![Branch panel](assets/branch.png) |
| **GitBar**: the branch chip in the session header (branch management) plus **terminal** / **code diff** tabs in the native right sidebar, with commit & push from the code diff page (uncommitted changes dot the branch chip and its tab) | **Branch panel**: pops up from the branch chip — local / remote branch lists, click to switch, delete, pull & push to remote, new-branch field at the bottom, plus a **commit graph** dialog (colored SVG fork/merge lanes) |
| ![Diff panel](assets/gitdiff.png) | ![Terminal panel](assets/terminal.png) |
| **Code diff**: file list + per-file diff (changed hunks only by default) with a commit area (commit / commit & push) at the bottom | **Terminal**: a real PTY terminal in the sidebar (xterm.js over WebSocket) — full interactivity |
| ![Archive manager](assets/archive.png) | ![MCP manager](assets/mcp.png) |
| **Archive manager**: an Archive page in the Settings dialog listing archived sessions (title / workspace / relative time) with Restore and Delete actions | **MCP manager**: an MCP page in the Settings dialog listing configured MCP servers with live status and full management (Add / Edit / Enable / Disable / Delete / Restart) |

## Features

- **Code font size (px)** — absolute 8–32px, default 13 (DSH's stock code-block size at a 16px body); applies to code blocks, with inline code following proportionally. The legacy percentage (`codeFontScale`) stays compatible and is overridden once a px value is set. Message text keeps DSH's stock sizing.
- **Table style** — choose `Default` or the **Claude Desktop** look (light-gray rounded cell cards with small gaps, no borders; cells share the inline-code background; header not bold).
- **Timeline (single choice in Features)** — one switch, two options:
  - **Native (default)** — DSH's built-in turn rail (the row of small dots beside the messages), the stock behavior.
  - **Web (classic)** — the v0.11 classic right-side navigation rail, restored: vertically centered on the message area's right edge, a thin line strip when collapsed, a 240px panel on hover (message previews + current-position highlight), a per-item detail bubble with timestamp, and **click to jump** (deep history pages in automatically before landing, with a landing self-check); wheel over the rail scrubs clipped items into reach. Data comes from the server-side `dshChatTimeline` session projection (every user message, independent of the browser's loaded window); sessions with fewer than two user messages hide it. On the web option the native turn rail is hidden with one theme-independent CSS rule (matching its `--turn-natural-height` inline variable), so the two never appear together.
- **GitBar (toggleable, off by default)** — the standard trio for git-repo sessions: a **branch chip** in the session header, plus **terminal** and **code diff** tabs in the native right sidebar (next to Files, opened from the sidebar guide; uncommitted changes put a dot on the code diff tab):
  - **Branch chip** — beside the session title; shows the current branch and opens a downward branch panel (local / remote lists, `git switch` on click, new-branch field). A **pull** button sits beside the current branch in the panel header (`git pull --ff-only` — fast-forward only: a diverged branch aborts with git's own error instead of silently merging; hidden when the branch has no upstream), so what gets pulled is always the branch in the header. The panel's **Graph** entry opens the **commit graph** dialog: the latest 150 commits (`git log --date-order --all`) are laid out into lanes and rendered as a colored SVG fork/merge graph — dots are commits, curves are forks/merges, each branch line keeps its own color and merge arcs adopt the color of the lane they join; rows highlight on hover, refresh in the header.
  - **Terminal** — a real PTY terminal in the sidebar (xterm.js over a WebSocket to a persistent shell in the session cwd) with theme-following colors. Leaving the tab only drops the frontend connection; the host shell stays alive and replays its transcript, so you come back to the same session.
  - **Code diff** — changed-file list + per-file diff (changed hunks only by default, "Full file" toggle at the top right). The file-list / diff / commit sections split with draggable horizontal dividers (double-click resets; the message box stretches, Shift+Enter for new lines). The **commit band stays at the foot** (Commit / Commit & push, message required). Without a git repo the page shows a note instead of hiding.
  - Opening the project in external apps is DSH's own open-in-app header button, so this plugin no longer ships one; every git op runs server-side through `execFile('git', …)` (no shell, timeouts).
- **Archive manager (toggleable, off by default)** — an **Archive** page in the Settings dialog listing archived sessions (title / workspace / relative time) with per-row **Restore** and **Delete** actions plus batch **Restore all** / **Delete all** buttons.
  - **Restore** removes a session from the archive set (its log and workspace slot are kept, so the conversation returns to the normal sidebar list).
  - **Delete** PERMANENTLY deletes the session — the server removes its JSONL log from disk, detaches it from workspace accounting and the archive set, and clears its projection cache (irreversible). Only genuinely **running** sessions are refused; opened-but-idle sessions are also removed from the in-memory store, so the row disappears live.
  - The list refreshes live via the `host/archived-sessions-changed` event and a session-list re-pull, with no page reload.
- **MCP manager (toggleable, off by default)** — an **MCP** page in the Settings dialog listing every configured MCP server (`@deepseek-ai/dsh-mcp-client` loader entries) with its live status, command/url, env vars and registered tools, plus full management: **Add / Edit** (a structured form — instance id, name, stdio or HTTP type, timeout ms, command, args, env — OR raw YAML, both validated), **Enable / Disable / Delete**, and **Restart** (runtime-only). Changes persist to the profile's `cordis.patch.yml` and DSH's built-in patch watcher hot-reloads just that server.
- **`/init` slash command (toggleable, off by default)** — type `/init` in the composer (the slash menu shows "Analyze this project and generate an AGENTS.md"), pick a prompt language from the popup (**Chinese / English**), and a complete AGENTS.md bootstrap prompt is submitted into the current session: the agent explores the project on its own (README, manifests, build scripts, key directories), then writes or improves a root `AGENTS.md` addressed to future AI coding agents (overview, common commands, conventions, directory guide, gotchas; existing files are improved in place). Pure client-side contribution; enable it in the UI Tweaks settings section.
- **Task alerts (toggleable, off by default)** — call you back while the tab sits in the background. Watches **all sessions** (background included) for two event kinds: **finish** (the `running` flag drops, or the host's green `completed` reminder rises; a host projection of the logged `turn/end` reason tells **completed / interrupted / failed** apart, and failure alerts carry a truncated error summary) and **interaction** (the session starts waiting for your approval / plan review / answer — the same `pendingInteraction` source as the sidebar amber dot). Three independent channels:
  - **Tab title flash** — blinks an unread counter `(2) 🔔 …` into the tab title until you come back, then restores it;
  - **System notifications** (Web Notifications API) — desktop-level; **click one to jump straight to that session**; permission is requested from the settings toggle's click gesture; the OS bark and the chime are mutually exclusive so they never double-ring;
  - **Chime** — a two-note WebAudio motif synthesized in-process (rising = done, falling = needs you); no audio assets.
  - "Only when hidden" defaults on (no nagging while you watch the page); the first snapshot only arms the baseline (a page reload never fires a burst); events fire on transitions with a 2s per-session+kind cooldown (reconnect flicker absorbed); subagent child rows are skipped (the parent carries the turn). A **Test** button in Settings previews permission and channels in one click.
- **Precise cache hit (toggleable, off by default)** — DSH's stats line shows the cache-hit share as a bare integer ("Cache hit 96%"). When enabled, the figure is rewritten to two decimals ("Cache hit 96.35%") and computed from the raw token buckets — cache reads ÷ billed input (uncached input + cache reads + cache writes) — the same source as the stock number, just unrounded; a full hit shows 100.00%, and with no billed input the group is absent anyway. The toggle lives in the Layout settings group; turning it off restores the stock figure.

All changes apply **live** — no reload needed. The same values can be hand-edited in the settings document:

```yaml
ui-tweaks:
  tableStyle: claude
  timelineStyle: web            # defaults to native (DSH's built-in turn rail); web is the classic web timeline
  gitBarEnabled: true     # defaults to false (off); set true to enable GitBar
  archiveManagerEnabled: true   # defaults to false (off); set true to show the Archive page
  initCommandEnabled: true      # defaults to false (off); set true to register the /init slash command
  preciseCacheHitEnabled: true  # defaults to false (off); set true to enable the two-decimal cache-hit figure
  notificationsEnabled: true    # defaults to false (off); set true to enable task alerts (event filters & channels are per-item toggles in Settings)
```

Settings entry: **Settings → UI Tweaks**.

## Install

```bash
# from npm (recommended, prebuilt)
npx -y @deepseek-ai/dsh plugin --profile web add dsh-ui-tweaks

# from GitHub (source; runs the self-contained prepare build)
npx -y @deepseek-ai/dsh plugin --profile web add github:wlj521/dsh-ui-tweaks
```

The package spec after `add` is forwarded to pnpm verbatim, so versions can be
pinned — `@version` for the npm package, `#tag` for the GitHub source:

```bash
npx -y @deepseek-ai/dsh plugin --profile web add dsh-ui-tweaks@0.12.0                    # pin the npm version
npx -y @deepseek-ai/dsh plugin --profile web add github:wlj521/dsh-ui-tweaks#v0.12.0     # pin a git tag
```

For GitHub installs, pnpm may ask you to approve the package's build script —
add the exact key it prints to the profile's `pnpm-workspace.yaml`:

```yaml
allowBuilds:
  dsh-ui-tweaks: true
```

…then run `add` again. Restart DSH web once after installing (bundle plugins
are scanned at process start).

> If pnpm reports symlink/hoist errors, set `nodeLinker: hoisted` in the
> profile's `pnpm-workspace.yaml`.

## Development

```bash
pnpm install
pnpm build          # tsc (server) + tsc (client) + bundle lib/client.js
pnpm typecheck
```

Load against a running DSH with an overlay, or install as a bundle:

```bash
npx -y @deepseek-ai/dsh web --patch ./cordis.patch.yml   # dev overlay
npx -y @deepseek-ai/dsh plugin --profile web add .        # bundle install from this checkout
```

## How it works

- **Server** (`src/index.ts`) registers the `ui-tweaks` settings namespace and
  mounts a same-origin route (`/_dsh/ui-tweaks/settings`) — the Web settings
  RPC only exposes a fixed allowlist of namespaces since rc.6, so a custom route
  is how a plugin owns a configuration page.
- **Browser** (`src/client/index.tsx`) reads/writes that route, renders the
  Settings section, and applies the values live via a runtime `<style>` element
  that overrides stable DSH anchors (`body` markdown code-font tokens, markdown
  tables inside `[data-slot="conversation.chat.node"]`).
- **Precise cache hit** (`src/client/cachehit.tsx`) mounts a null-rendering
  seat in the `conversation.composer.dock` slot (the band hosting the stock
  stats line) and reads the session's token usage through the framework's
  fifth standard hook, `useProjection('tokenUsage')` — the disjoint
  uncached-input / cache-read / cache-write / output buckets. It computes
  `cache reads ÷ (uncached input + cache reads + cache writes)`, formats it
  with `.toFixed(2)`, and rewrites the stats line's "Cache hit N%" /
  「缓存命中 N%」text in place — newer DSH renders the figure as a bare text
  node after a separator inside the usage pill (its button `aria-label` and
  the matching row of the click-open usage dialog are rewritten too; the
  per-turn dialog uses its own denominator and is left alone) — layout,
  truncation and tooltip behavior stay DSH's own. A MutationObserver on the
  document re-applies whenever React repaints the line or opens the dialog
  (writes are idempotent, so the loop settles immediately); toggling
  off or switching sessions restores the original texts. Registration follows
  the /init command's on-demand choreography: mounted only while
  `preciseCacheHitEnabled` is on.

## License

MIT
