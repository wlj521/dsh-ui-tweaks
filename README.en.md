# dsh-ui-tweaks

A [DeepSeek Harness](https://deepseek-harness.github.io/deepseek-harness/) (DSH) web plugin that live-tunes the conversation UI from the Settings panel.

## Preview

| | |
|---|---|
| ![Conversation timeline](assets/timeline.png) | ![Claude Desktop table style](assets/table.png) |
| **Conversation timeline**: right-side rail — hover to preview messages, click to jump, scroll-highlighting, auto-dodges a right sidebar | **Table style**: the Claude Desktop look (light-gray rounded cards) |
| ![Dialog width](assets/dialog_box.png) | ![Settings panel](assets/settings.png) |
| **Dialog width**: message column, composer and stats line widen together | **Settings panel**: font size / table style / dialog width / timeline |

## Features

- **Message font size (px)** — type any value (10–32); applies to message text, headings, tables and code.
- **Table style** — choose `Default` or the **Claude Desktop** look (light-gray rounded cell cards with small gaps, no borders; cells share the inline-code background; header not bold).
- **Dialog width (px)** — type any value (600–1600); the message column, the composer input and the stats line below it widen together.
- **Conversation timeline (toggleable, off by default)** — a thin navigation rail at the right of the message area: one indicator line per user message, hover to expand a preview panel, scroll-highlighting of the current position, click to smooth-scroll to that message (loading older history on demand). Works in **light and dark mode**, and **always hugs the message area's right edge** — even with a right sidebar installed and expanded (e.g. dsh-better-sidebar), the rail dodges it instead of overlapping. Auto-hidden while a session has fewer than two user messages.
- **Archive manager (toggleable, off by default)** — an **Archive** page in the Settings dialog listing archived sessions (title / workspace / relative time) with per-row **Restore** and **Delete** actions plus batch **Restore all** / **Delete all** buttons.
  - **Restore** removes a session from the archive set (its log and workspace slot are kept, so the conversation returns to the normal sidebar list).
  - **Delete** PERMANENTLY deletes the session — the server removes its JSONL log from disk, detaches it from workspace accounting and the archive set, and clears its projection cache (irreversible). Only genuinely **running** sessions are refused; opened-but-idle sessions are also removed from the in-memory store, so the row disappears live.
  - The list refreshes live via the `host/archived-sessions-changed` event and a session-list re-pull, with no page reload.
- **MCP manager (toggleable, off by default)** — an **MCP** page in the Settings dialog listing every configured MCP server (`@deepseek-ai/dsh-mcp-client` loader entries) with its live status, command/url, env vars and registered tools, plus full management: **Add / Edit** (a structured form — instance id, name, stdio or HTTP type, timeout ms, command, args, env — OR raw YAML, both validated), **Enable / Disable / Delete**, and **Restart** (runtime-only). Changes persist to the profile's `cordis.patch.yml` and DSH's built-in patch watcher hot-reloads just that server.

All changes apply **live** — no reload needed. The same values can be hand-edited in the settings document:

```yaml
ui-tweaks:
  fontSize: 16
  tableStyle: claude
  dialogWidth: 880
  timelineEnabled: true   # defaults to false (off); set true to enable
  archiveManagerEnabled: true   # defaults to false (off); set true to show the Archive page
```

Settings entry: **Settings → UI Tweaks**.

## Install

```bash
# from npm (recommended, prebuilt)
npx -y @deepseek-ai/dsh plugin --profile web add dsh-ui-tweaks

# from GitHub (source; runs the self-contained prepare build)
npx -y @deepseek-ai/dsh plugin --profile web add github:wlj521/dsh-ui-tweaks
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
  RPC only exposes a fixed allowlist of namespaces in rc.6, so a custom route
  is how a plugin owns a configuration page. `src/timeline.ts` also registers
  the `dshChatTimeline` session projection that durably enumerates user
  messages.
- **Browser** (`src/client/index.tsx`) reads/writes that route, renders the
  Settings section, and applies the values live via a runtime `<style>` element
  that overrides stable DSH anchors (`[data-chat-flow]`,
  `[data-composer-card]`, `body` markdown font tokens, markdown tables inside
  `[data-slot="conversation.chat.node"]`).
- **Timeline** (`src/client/timeline.tsx`) mounts in the
  `conversation.input.dock` slot and portals to `body`. Data sources, fastest
  first: session projection → loaded chat nodes → background `loadOlder`. Its
  position is anchored by measuring the right edge and vertical center of
  `[data-conversation-scroll]` (the message area), so it follows both the DSH
  column grid and any right-sidebar layout push (`#root` margin-right);
  colors ride DSH theme tokens (`--dsw-alias-*`) for correct light/dark
  rendering.

## License

MIT
