# dsh-ui-tweaks

A [DeepSeek Harness](https://deepseek-harness.github.io/deepseek-harness/) (DSH) web plugin that live-tunes the conversation UI from the Settings panel.

## Features

- **Message font size (px)** — type any value (10–32); applies to message text, headings, tables and code.
- **Table style** — choose `Default` or the **Claude Desktop** look (light-gray rounded cell cards with small gaps, no borders; cells share the inline-code background; header not bold).
- **Dialog width (px)** — type any value (600–1600); the message column, the composer input and the stats line below it widen together.

All changes apply **live** — no reload needed. The same values can be hand-edited in the settings document:

```yaml
ui-tweaks:
  fontSize: 16
  tableStyle: claude
  dialogWidth: 880
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
  is how a plugin owns a configuration page.
- **Browser** (`src/client/index.tsx`) reads/writes that route, renders the
  Settings section, and applies the values live via a runtime `<style>` element
  that overrides stable DSH anchors (`[data-chat-flow]`,
  `[data-composer-card]`, `body` markdown font tokens, markdown tables inside
  `[data-slot="conversation.chat.node"]`).

## License

MIT
