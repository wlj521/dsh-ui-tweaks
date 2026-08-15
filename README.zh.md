# dsh-ui-tweaks

DSH (DeepSeek Harness) web plugin that live-tunes the conversation UI:

- **Message font size** — input any px value (10–32); applies to message text, headings, tables and code.
- **Table style** — choose `Default` or the Claude Desktop look (rounded, clean rows, hover).
- **Dialog width** — `Default` (748px) or `Wider` (880px).

All changes apply **live** from Settings → **UI Tweaks** — no reload needed. The same values can be hand-edited in the settings document:

```yaml
ui-tweaks:
  fontSize: 18
  tableStyle: claude
  dialogWidth: wide
```

## Install

```bash
# from npm (recommended, prebuilt)
npx -y @deepseek-ai/dsh plugin --profile web add dsh-ui-tweaks

# from GitHub (source; runs the self-contained prepare build)
npx -y @deepseek-ai/dsh plugin --profile web add github:your-name/dsh-ui-tweaks
```

For GitHub installs, pnpm may ask you to approve the package's build script —
add the exact key it prints to the profile's `pnpm-workspace.yaml`:

```yaml
allowBuilds:
  dsh-ui-tweaks: true
```

…then run `add` again. Restart DSH web once after installing (bundle plugins
are scanned at process start).

## Development

```bash
pnpm install
pnpm build          # tsc (server) + tsc (client) + bundle lib/client.js
pnpm typecheck
```

Load against a running DSH with an overlay, or install as a bundle:

```bash
npx -y @deepseek-ai/dsh web --patch ./cordis.patch.yml   # dev overlay (needs the package resolvable)
npx -y @deepseek-ai/dsh plugin --profile web add .        # bundle install from this checkout
```

## License

MIT
