# dsh-ui-tweaks

**English** | [中文](https://github.com/wlj521/dsh-ui-tweaks/blob/main/README.md)

> **Dependency**: currently targets **DSH v0.2.0-rc.2**.

A [DeepSeek Harness](https://deepseek-harness.github.io/deepseek-harness/) (DSH) plugin that live-tunes the conversation UI from the Settings panel: **theme skins** (default / Soft glow with 8 colours), a **timeline switch** (native turn rail / classic web rail), **GitBar** (branch chip in the session header plus a code-diff tab in the right sidebar), a **two-decimal cache-hit figure**, and four independently toggleable modules — **Archive manager**, **MCP manager**, **Web search**, **Task alerts** — plus the **`/init`** slash command.

Every change applies **live** — no page reload needed.

> Code font size is not here: DSH ships that control itself in its Appearance settings (`ui-theme`'s `codeFontSize`, 10–16px). Since v0.22 this plugin no longer duplicates it and writes no code-font tokens to `body`, so the two settings never fight.

## Features

### Appearance and layout

- **Theme** — two options, always switchable back:
  - `Default` keeps DSH's stock look untouched and injects nothing.
  - **Soft glow** is a static skin: a neutral light/dark palette plus soft accent glows radiating from the top and bottom edges toward the middle, **no animation**, so it costs nothing at runtime. Its glow colour is selectable among **mint / electric blue / violet / sky / amber / coral / rose / silver** (default mint); inline code, code blocks, table headers, links and list markers all follow that accent.
  - The skin covers the app frame and the plugin's own settings pages, while the host's settings dialog keeps DSH's stock palette; switching honours the system "reduce motion" preference.
- **Two-decimal cache hit** (off by default) — DSH's stats line shows the cache-hit share as a bare integer ("Cache hit 96%"). When enabled, the figure is rewritten to two decimals ("Cache hit 96.35%") and computed from the raw token buckets — cache reads ÷ billed input (uncached input + cache reads + cache writes) — the same source as the stock number, just unrounded. A full hit shows 100.00%; with no billed input the group is absent anyway. Turning it off restores the stock figure.

### Interaction and tools

- **Timeline** — one switch, two options:
  - **Native (default)** — DSH's built-in turn rail (the row of small dots beside the messages), the stock behavior.
  - **Web (classic)** — the v0.11 classic right-side navigation rail, restored: vertically centered on the message area's right edge, a thin line strip when collapsed, a 240px panel on hover (message previews + current-position highlight), a per-item detail bubble with timestamp, and **click to jump** (deep history pages in automatically before landing, with a landing self-check); wheel over the rail scrubs clipped items into reach. Data comes from the server-side `dshChatTimeline` session projection (every user message, independent of the browser's loaded window); sessions with fewer than two user messages hide it. On the web option the native turn rail is hidden by one theme-independent CSS rule matched on its structure, so the two never appear together.
- **GitBar** (off by default) — the standard pair for git-repo sessions: a **branch chip** in the session header, plus a **code diff** tab in the native right sidebar (next to Files). Uncommitted changes put a dot on both the chip and the diff tab.
  - **Branch chip** — beside the session title, showing the current branch. It opens a downward branch panel (local / remote lists, `git switch` on click, a new-branch field, plus rename and delete). A **pull** button sits beside the current branch in the panel header (`git pull --ff-only` — fast-forward only: a diverged branch aborts with git's own error instead of silently merging; hidden when the branch has no upstream).
  - **Commit graph** — the panel's "Graph" entry opens a dialog: the latest 150 commits (`git log --date-order --all`) are laid out into lanes and rendered as a colored SVG fork/merge graph — dots are commits, curves are forks/merges, each branch line keeps its own color and merge arcs adopt the color of the lane they join; rows highlight on hover, refresh in the header. The neighbouring **Tag** manager creates / pushes / deletes tags (deletion needs a second click).
  - **Code diff** — changed-file list + per-file diff (changed hunks only by default, "Full file" toggle at the top right). The file-list / diff / commit sections split with draggable horizontal dividers (double-click resets; the message box stretches, Shift+Enter for new lines). The **commit band stays at the foot**: per-file checkboxes decide what this commit includes (unchecked files are excluded), an optional Tag can be attached, and Commit / Commit & push require a message. Without a git repo the page shows a note instead of hiding.
  - Opening the project in external apps is DSH's own open-in-app header button. Every git op runs server-side through `execFile('git', …)` — no shell, cwd pinned, bounded timeout, abort propagation.
- **Archive manager** (off by default) — an Archive page in the Settings dialog listing archived sessions (title / workspace / relative time) with per-row **Restore** and **Delete** actions plus batch **Restore all** / **Delete all**:
  - **Restore** removes a session from the archive set — its log and workspace slot are kept, so the conversation returns to the normal sidebar list.
  - **Delete** PERMANENTLY deletes the session — the server removes its JSONL log from disk, detaches it from workspace accounting and the archive set, and clears its projection cache (irreversible). Only genuinely **running** sessions are refused; opened-but-idle sessions are also removed from the in-memory store, so the row disappears live.
  - The same action is available as **Delete session** in a sidebar row's "..." menu (click twice to confirm; the armed state reverts after 3s, and a running session gets the reason printed right in the menu). Both entry points ride the same toggle.
  - The list refreshes live via the `host/archived-sessions-changed` event and a session-list re-pull.
- **MCP manager** (off by default) — an MCP page in the Settings dialog listing every configured MCP server (`@deepseek-ai/dsh-mcp-client` loader entries) with its live status, transport, command/url and tool count, plus full management:
  - **Add / Edit** — a structured form (instance id, name, stdio or HTTP type, timeout ms, command, args, env, url, headers) OR raw YAML, both validated before saving (name and id charset, positive-integer timeout, URL scheme, non-empty command, unknown YAML keys). Environment variables and headers use a scrollable key/value editor.
  - **Enable / Disable / Delete / Restart** — changes persist to the profile's `cordis.patch.yml` (comments and structure preserved, atomic write) and DSH's built-in patch watcher hot-reloads the loader, so just that server starts / stops / restarts live; restart is runtime-only and does not touch the config.
  - After adding a server, confirm it actually connects (status "Running" and tools registered); a failed instance shows "Error" and can be restarted.
- **Web search** (off by default) — takes over the built-in `web_search` tool with this plugin's multi-engine provider and adds a Web search settings page:
  - **Engines** — Bing / DuckDuckGo (free, no key), Exa / Tavily / Keenable (keyless anonymous quota without a key), Perplexity / DeepSeek (a key is required). Any engine that fails (rate limit, invalid key, network) **falls through to the next one**, so search never hard-fails on a single engine. Bing additionally takes a market code (`zh-CN` / `en-US` …).
  - **API keys** — per platform, stored in the credentials center `~/.dsh/.credentials.yaml` (`EXA_API_KEY` / `TAVILY_API_KEY` / `KEENABLE_API_KEY` / `PERPLEXITY_API_KEY` / `DEEPSEEK_API_KEY`), **never in the settings document**; resolution order is credentials center → environment. Keys can be revealed / copied / cleared, and a "Test engine" button runs a live connectivity check.
  - The toggle mirrors into the profile's `cordis.patch.yml` (the `web` entry's `searchProvider`); turning it off restores the stock backend.
- **`/init` slash command** (off by default) — type `/init` in the composer (the slash menu shows "Analyze this project and generate an AGENTS.md"), pick a prompt language from the popup (**Chinese / English**), and a complete AGENTS.md bootstrap prompt is submitted into the current session: the agent explores the project on its own (README, manifests, build scripts, key directories), then writes or improves a root `AGENTS.md` addressed to future AI coding agents (overview, common commands, conventions, directory guide, gotchas; existing files are improved in place). Pure client-side contribution.

### Task alerts

Call you back while the tab sits in the background (off by default). Watches **all sessions** (background included) for two event kinds:

- **Finish** — the `running` flag drops, or the host's green `completed` reminder rises; a host projection of the logged `turn/end` reason tells **completed / interrupted / failed** apart, and failure alerts carry a truncated error summary.
- **Interaction** — the session starts waiting for your approval / plan review / answer — the same `pendingInteraction` source as the sidebar amber dot.

Three independent channels:

- **Tab title flash** — blinks an unread counter `(2) 🔔 …` into the tab title until you come back, then restores it.
- **System notifications** (Web Notifications API) — desktop-level; **click one to jump straight to that session**; permission is requested from the settings toggle's click gesture (the desktop shell auto-grants it, with no browser prompt); the OS bark and the chime are mutually exclusive so they never double-ring.
- **Chime** — a two-note WebAudio motif synthesized in-process (rising = done, falling = needs you); no audio assets.

Anti-nag: the first snapshot only arms the baseline (a page reload never fires a burst); events fire on transitions only; a 2s per-session+kind cooldown absorbs reconnect flicker; the same completion is not re-announced within 30s; subagent child rows are skipped (the parent carries the turn). "Only when hidden" defaults on — no nagging while you watch the page. A **Test** button in Settings previews permission and all three channels in one click.

## Settings and configuration

Settings entry: **Settings → UI Tweaks**. The left nav carries three more pages — **Archive manager**, **MCP manager**, **Web search** — each appearing / disappearing live with its own toggle.

The same values can be hand-edited. `settings.yaml` was retired in DSH 0.1.7; configuration lives in the profile's `cordis.patch.yml` (the document the Settings page writes):

```yaml
# $DSH_HOME/profiles/<profile>/cordis.patch.yml
- id: ui-tweaks
  name: dsh-ui-tweaks
  config:
    timelineStyle: web            # defaults to native (DSH's built-in turn rail); web is the classic web timeline
    themeStyle: particles         # defaults to default (DSH's stock look, always restorable); particles is the Soft glow skin
    particleColor: mint           # glow colour: mint/electric/violet/sky/amber/coral/rose/silver (default mint)
    preciseCacheHitEnabled: true  # defaults to false; two-decimal cache-hit figure
    searchEnabled: true           # defaults to false; takes over web_search and shows the Web search page
    searchEngine: exa             # defaults to bing; bing/ddg/exa/tavily/keenable/perplexity/deepseek
    bingMarket: zh-CN             # defaults to zh-CN; only applies to Bing
    gitBarEnabled: true           # defaults to false; enables GitBar
    archiveManagerEnabled: true   # defaults to false; shows the Archive page and the menu delete row
    mcpManagerEnabled: true       # defaults to false; shows the MCP page
    initCommandEnabled: true      # defaults to false; registers the /init slash command
    notificationsEnabled: true    # defaults to false; enables task alerts (channels & events are per-item toggles)
    notifyOnlyWhenHidden: true    # defaults to true; alert only while hidden or unfocused
    notifyOnComplete: true        # defaults to true; alert on finish
    notifyOnInteraction: true     # defaults to true; alert on interaction
    notifyTitleFlash: true        # defaults to true; tab title flash
    notifySystemNotification: true # defaults to true; system notifications
    notifySound: false            # defaults to false; chime
```

## Install

```bash
# from npm (recommended, prebuilt)
npx -y @deepseek-ai/dsh plugin --profile desktop add dsh-ui-tweaks

# from GitHub (source; built on install by `prepare`)
npx -y @deepseek-ai/dsh plugin --profile desktop add github:wlj521/dsh-ui-tweaks
```

> **The GitHub path builds locally**: `lib/` is a build artifact and is not tracked; it is produced by `prepare` at install time. Since pnpm 10.26, `prepare` of git-hosted dependencies is **blocked by default** (supply-chain hardening), so allow it in the profile's `pnpm-workspace.yaml` first — otherwise the install ships no `lib/` and the plugin fails to load:
>
> ```yaml
> allowBuilds:
>   dsh-ui-tweaks: true
> ```
>
> Prefer the npm path if you would rather not build locally (its tarball already contains the artifacts).

The package spec after `add` is forwarded to pnpm verbatim, so versions can be pinned — `@version` for the npm package, `#tag` for the GitHub source:

```bash
npx -y @deepseek-ai/dsh plugin --profile desktop add dsh-ui-tweaks@0.23.0                    # pin the npm version
npx -y @deepseek-ai/dsh plugin --profile desktop add github:wlj521/dsh-ui-tweaks#v0.23.0     # pin a git tag
```

### Path three: a local directory (picked in the desktop app, no CLI)

```bash
git clone https://github.com/wlj521/dsh-ui-tweaks.git
cd dsh-ui-tweaks
pnpm install          # `prepare` builds lib/ for you
```

Then open **Plugins → Add plugin** in the desktop app and enter the directory's **absolute path** (for example `D:\dsh-project\dsh-ui-tweaks`).

> **Run `pnpm install` first — it is required**: a local-directory install becomes a `link:` symlink, and pnpm neither runs `prepare` for it nor installs its own dependencies. The directory must therefore already hold the built `lib/` (what `main` points at) and `node_modules/` (the runtime dependency, `yaml`). Without them the install reports success and nothing errors, yet DSH logs `ui-tweaks (dsh-ui-tweaks): failed to import` at startup and the plugin never loads.
>
> The path must be **absolute** — a relative one is rejected (the Host's working directory means nothing to the person typing into a browser). CLI equivalent: `npx -y @deepseek-ai/dsh plugin --profile desktop add <absolute path>`.

Restart the DSH desktop app once after installing (bundle plugins are scanned at process start).

> If pnpm reports symlink/hoist errors, set `nodeLinker: hoisted` in the profile's `pnpm-workspace.yaml`.

## Development

```bash
pnpm install
pnpm build          # tsc (server) + tsc (client) + bundle lib/client.js
pnpm typecheck
```

Load against a running DSH with an overlay, or install as a bundle:

```bash
npx -y @deepseek-ai/dsh plugin --profile desktop add .    # bundle install from this checkout
# dev overlay: edit the desktop profile's cordis.patch.yml ($DSH_HOME/profiles/desktop/cordis.patch.yml) directly — DSH hot-reloads it
```

## How it works

- **Server** (`src/index.ts`) exports the `Config` settings schema — since DSH 0.1.7 the Settings form is derived from a plugin's exported `Config` (the old `settings.register()` is gone) and `configure({ auto: false })` suppresses the auto-generated page in favor of the client's own sections — and mounts a same-origin route (`/_dsh/ui-tweaks/settings`) — the Web settings RPC only exposes a fixed allowlist of namespaces since rc.6, so a custom route is how a plugin owns a configuration page.
- **Browser** (`src/client/index.tsx`) reads/writes that route, renders the Settings section, and applies the values live via a runtime `<style>` element that overrides stable DSH anchors (theme variables on `body`, the tables / inline code / code blocks inside `[data-slot="conversation.chat.node"]`, and the native turn rail's `<nav>`). The four pages register into the `settings.section` slot (order 40 / 50 / 60 / 70); the three that have a toggle (Archive / MCP / Web search) go through `installConditionalSection`, so their nav rows appear and disappear live with the switch.
- **Git backend** (`src/git.ts` + `src/git-web.ts`) resolves the session header's `cwd` through `ctx.get('sessions')` (an optional service) as "the current project" and runs git through `execFile('git', …)` (no shell, cwd pinned, bounded timeout, abort propagation). Same-origin route `/_dsh/ui-tweaks/git/*`: status / branches / tags / diff (hunks or full file, with absolute line numbers) / graph (structured commit rows carrying parent hashes for the client-side lane layout) / commit / push / pull (fast-forward only) / checkout / create / branch-rename / branch-delete / remote-delete / tag-create / tag-delete / tag-push.
- **GitBar** (`src/client/gitbar.tsx`): the branch chip mounts in `conversation.session.header.actions` (beside the session title), while the code diff registers as a native right-sidebar tab (`ctx.sidebarRightTabs` declares the type and the guide entry, `sidebar.right.pane.tab` renders the body by type id, and a title seat adds the uncommitted-changes dot; all mounted on demand with `gitBarEnabled`). The view is a full-height flex column whose three sections (file list / diff / commit) allocate height by "give only the dragged section an explicit height, let the diff section eat the rest with `flex:1`", capped at 45%, so dragging can never break the view. A null-rendering warmup seat in `conversation.input.dock` prefetches git status on session switch, so the chip paints instantly from a warm cache. The commit graph's lane layout and SVG rendering live in `src/client/graphlayout.ts` (pure functions: parent hashes → per-row lanes and edge segments, classic first-parent routing so linear history stays one line, Bézier arcs for forks and merges; `parents` is optional to tolerate a host whose server half has not reloaded yet).
- **Archive manager** (server `src/archive.ts` + browser `src/client/archive.tsx`): list data comes straight from the framework's `useSessions` + `useWorkspaces` hooks (`archivedSessionIds`), with actions on the same-origin `/_dsh/ui-tweaks/archive` route. **Restore** removes the session id from the workspace storage domain's `archivedSessionIds` singleton (DSH only exposes one-way `archiveSession`, no public unarchive API, so the plugin writes the live storage handle and syncs the registry's in-memory cache). **Delete** proceeds in order: refuse a running session (only `status === 'running'` is refused; idle sessions are `cancel` + `whenIdle` first) → locate and `rm` the log directory through the persistence backend's own `findLog` → call the public `WorkspaceEntity.detachSession` to drop workspace accounting → remove from the archive set and sync the registry cache and header index → clear `session_projcache` → remove the session from the in-memory SessionStore (which fires `host/session-removed`, so the row disappears live). The **Delete session** row in a sidebar session's "..." menu (`src/client/session-menu.tsx`) registers into the host's `sidebar.workspaces.session.menu.item` list at `order: 500` — right after pin / rename / fork / archive — and reuses the same route because the host has no session-delete API; two clicks delete (the armed state reverts after 3s), and a server refusal keeps the menu open with the reason in place. It rides the same `archiveManagerEnabled` toggle as the Archive page.
- **Settings nav glyphs** (`src/client/nav-icons.ts`): the host paints one hardcoded glyph per settings-section **id** and the `settings.section` registration carries only `id / order / label` — no icon seat — so this plugin's four pages would all show the generic gear. A MutationObserver walks the settings dialog's nav rows, claims the ones whose label is this plugin's own (localized) copy, tags them with `data-dut-nav-icon`, and an injected stylesheet hides the stock gear and masks in the matching glyph (UI Tweaks = sliders, Archive manager = archive box, MCP manager = plug, Web search = globe; the sliders / archive / globe paths are `ui-primitives`' own artwork). Label matching keeps it self-healing: locale switches and host re-renders re-claim the rows, rows this plugin no longer renders lose the tag, and every row it does not own is left exactly as shipped.
- **MCP manager** (server `src/mcp.ts` + browser `src/client/mcp.tsx`): same-origin route `/_dsh/ui-tweaks/mcp`. **List** enumerates the `@deepseek-ai/dsh-mcp-client` instances among `ctx.loader.entries()` (id / config / fiber state: active=2, failed=3, …) and counts tools by their `mcp__<serverName>__` prefix. **Restart** calls `entry.fiber.restart()` (runtime only). **Add / Edit / Delete / Enable / Disable** edit the profile's `cordis.patch.yml` through `yaml` (eemeli)'s Document API (comments and unknown patch structure preserved, atomic tmp+rename), after which DSH's built-in `watchUserPatches` watcher re-applies the patch — `cordis-plugin-include` does an **incremental** `root.update` on the root group, so only the changed MCP instance restarts. Environment values are returned to the same-origin browser (needed for local config editing); the YAML mode is parsed server-side with `yaml.parse` plus a key whitelist.
- **Web search** (server `src/search.ts` + `src/search-web.ts`, browser `src/client/search.tsx`): `createSearchProvider` registers into `ctx.web`'s search seam; the engine is read live from `ui-tweaks.searchEngine` and failures fall through `ENGINE_ORDER` one by one. API keys resolve only through the credentials center (`~/.dsh/.credentials.yaml` → environment) and never enter the settings document. The same-origin `/_dsh/ui-tweaks/search` route handles key reads/writes, the live engine test, and mirrors the toggle into the profile patch's `web` entry `searchProvider` (it compares the target state first so startup reconciliation cannot cause a reload loop).
- **Task alerts** (`src/client/notifier.ts`): a pure logic module (no React) that subscribes directly to `ctx.sessions.list` snapshots inside `ctx.effect` and diffs every non-blank, non-subagent session: `running` true→false with no pending interaction → finish event; `pendingInteraction` ('approval' / 'plan-review' / 'question', the sidebar amber-dot classification) appearing → interaction event; a background session's host `completed` green-dot rising edge also counts as a finish. The ending reason comes from the server-side [`dshTurnOutcome` projection](src/turn-outcome.ts) (a last-wins fold of the log's `turn/end.reason`) delivered on each list row's `projectionValues`: completed/max-tokens announce "task complete", aborted/interrupted "task interrupted", error "request failed" with a truncated error summary; a missing or lagging projection degrades to a plain completion. Each channel degrades silently — title flash alternates `document.title` on a `setInterval` and restores it on `focus` / `visibilitychange`; system notifications dedupe by `tag`, open the session via `window.focus()` + `openSession(id)`, and set `silent` from the chime toggle so they never double-ring; the chime is a WebAudio oscillator envelope synthesized in place. Anti-nag: the first frame only arms the baseline, events fire on transitions only, a 2s per-session+kind cooldown applies, and the same completion is not re-announced within 30s; toggles like "only when hidden" are re-read through `readState` on every tick, so changes apply without reinstalling the watcher.
- **Two-decimal cache hit** (`src/client/cachehit.tsx`) mounts a null-rendering seat in the `conversation.composer.dock` slot (the band hosting the stock stats line) and reads the session's token usage through the framework's fifth standard hook, `useProjection('tokenUsage')` — the disjoint uncached-input / cache-read / cache-write / output buckets. It computes `cache reads ÷ (uncached input + cache reads + cache writes)`, formats it with `.toFixed(2)`, and rewrites the stats line's "Cache hit N%" / 「缓存命中 N%」text in place — newer DSH renders the figure as a bare text node after a separator inside the usage pill (its button `aria-label` and the matching row of the click-open usage dialog are rewritten too; the per-turn dialog uses its own denominator and is left alone) — layout, truncation and tooltip behavior stay DSH's own. A MutationObserver on the document re-applies whenever React repaints the line or opens the dialog (writes are idempotent, so the loop settles immediately); toggling off or switching sessions restores the original texts.

## License

MIT
