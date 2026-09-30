/**
 * dsh-ui-tweaks — settings navigation glyphs (browser half).
 *
 * The settings shell paints one hardcoded glyph per section **id**
 * (`ui-settings-general`'s `navIcon`: account / models / agent-presets /
 * plugins / archived-sessions each get their own artwork, every other id falls
 * back to the generic settings gear) and the `settings.section` registration
 * carries only `id` / `order` / `label` — there is no icon seat. So this
 * plugin's four sections would all show the same gear.
 *
 * This module repaints them without touching the host: a MutationObserver
 * walks the settings dialog's nav rows, matches a row by its own label (the
 * text this plugin registered through the `ui-tweaks` locale namespace — the
 * row carries no id in the DOM), tags the matched `<button>` with
 * {@link NAV_ICON_ATTR}, and the injected stylesheet hides the stock gear and
 * paints the matching glyph into the cell with a CSS mask. Matching by label
 * keeps the patch self-healing: a locale switch, a re-render, or a host change
 * that stops rendering our rows simply drops the tag again, and any row this
 * plugin does not own is left exactly as the host drew it.
 *
 * The sliders / archive / globe artwork is copied verbatim from
 * `@deepseek-ai/dsh-client-ui-primitives`' own 16px artworks (that package is
 * outside this plugin's `dsh.client.inject` whitelist), and the plug follows
 * the same 16px / 1.3px-stroke recipe, so all four read as shipped glyphs.
 * @module dsh-ui-tweaks/client/nav-icons
 */

/** The settings nav rows this module repaints, keyed by the plugin's own label key. */
export type NavIconKey = 'ui-tweaks' | 'archive' | 'mcp' | 'search'

/** Current localized label of each row, as registered through `settings.section`. */
export type NavLabels = Readonly<Record<NavIconKey, string>>

/** Attribute the patch writes on a matched nav cell; it also selects the glyph. */
const NAV_ICON_ATTR = 'data-dut-nav-icon'

/** Stylesheet id, so a re-apply never stacks a second copy. */
const NAV_ICON_CSS_ID = 'dsh-ui-tweaks-settings-nav-icons'

/**
 * Inner markup of each glyph on the host's 16px grid: stroke-only paths that
 * the mask paints in the cell's `currentColor`. The archive and globe
 * d-attributes are the host's own `IconArchiveOutline` / `IconGlobeOutline`
 * artwork; the sliders are a THREE-track variant (the host's own
 * `IconSlidersTwoOutline` is what the neighbouring 内置插件 / Plugins row
 * already shows — two identical glyphs side by side would read as one icon
 * twice), and the plug (no host equivalent) follows the same recipe.
 */
const GLYPH_MARKUP: Record<NavIconKey, string> = {
  'ui-tweaks': '<path d="M2.2 4h1.7M6.7 4h7.1"/><circle cx="5.3" cy="4" r="1.4"/>'
    + '<path d="M2.2 8h6.9M11.9 8h1.9"/><circle cx="10.5" cy="8" r="1.4"/>'
    + '<path d="M2.2 12h2.8M7.8 12h6"/><circle cx="6.4" cy="12" r="1.4"/>',
  archive: '<path d="M13.5 2.5H2.5C1.94772 2.5 1.5 2.94772 1.5 3.5V4.5C1.5 5.05228 1.94772 5.5 2.5 5.5H13.5C14.0523 5.5 14.5 5.05228 14.5 4.5V3.5C14.5 2.94772 14.0523 2.5 13.5 2.5Z"/>'
    + '<path d="M2.5 5.5V13.5C2.5 13.7652 2.60536 14.0196 2.79289 14.2071C2.98043 14.3946 3.23478 14.5 3.5 14.5H12.5C12.7652 14.5 13.0196 14.3946 13.2071 14.2071C13.3946 14.0196 13.5 13.7652 13.5 13.5V5.5"/>'
    + '<path d="M6.5 9.5H9.5"/>',
  mcp: '<path d="M5.9 1.8v2.4M10.1 1.8v2.4"/>'
    + '<rect x="4.2" y="4.2" width="7.6" height="4.2" rx="1.3"/>'
    + '<path d="M8 8.4v2.4c0 1.1-.9 2-2 2H4.5"/>',
  search: '<path d="M7.99986 14.0887C11.3626 14.0887 14.0886 11.3627 14.0886 7.99998C14.0886 4.63727 11.3626 1.91125 7.99986 1.91125C4.63715 1.91125 1.91113 4.63727 1.91113 7.99998C1.91113 11.3627 4.63715 14.0887 7.99986 14.0887Z"/>'
    + '<path d="M2.34619 8H13.6538"/>'
    + '<path d="M7.99976 14.0889C9.23509 14.0889 10.1743 11.3629 10.1743 8.00006C10.1743 4.63739 9.23509 1.91138 7.99976 1.91138"/>'
    + '<path d="M7.99973 14.0889C6.76445 14.0889 5.8252 11.3629 5.8252 8.00006C5.8252 4.63739 6.76445 1.91138 7.99973 1.91138"/>',
}

/** One glyph as a CSS `mask-image` value, stroke painted opaque white. */
function maskUrl(key: NavIconKey): string {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="#fff"'
    + ' stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">'
    + GLYPH_MARKUP[key] + '</svg>'
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
}

const GLYPH_RULES = (Object.keys(GLYPH_MARKUP) as NavIconKey[])
  .map(key => `[${NAV_ICON_ATTR}="${key}"]{--dut-nav-glyph:${maskUrl(key)}}`)
  .join('\n')

/**
 * The glyph swap: the stock gear is hidden and the tagged cell paints the
 * matching mask in the row's own ink colour — the same 16px box the host's
 * `navIcon` occupied, so nav geometry does not move. `::before` is the first
 * flex item of the cell's own `gap`, exactly where the svg sat.
 */
export const NAV_ICON_CSS = `
[${NAV_ICON_ATTR}]>svg{display:none}
[${NAV_ICON_ATTR}]::before{content:'';flex:none;width:16px;height:16px;background-color:currentColor;-webkit-mask:var(--dut-nav-glyph) center/16px 16px no-repeat;mask:var(--dut-nav-glyph) center/16px 16px no-repeat}
${GLYPH_RULES}
`

/** Install the glyph stylesheet once (idempotent); returns the disposer. */
function installNavIconStyles(): () => void {
  const existing = document.querySelector(`style[data-plugin-css="${NAV_ICON_CSS_ID}"]`)
  if (existing !== null) return () => {}
  const style = document.createElement('style')
  style.dataset.plugin = 'dsh-ui-tweaks'
  style.dataset.pluginCss = NAV_ICON_CSS_ID
  style.textContent = NAV_ICON_CSS
  document.head.appendChild(style)
  return () => { style.remove() }
}

/**
 * Repaint this plugin's settings nav glyphs. Matches a row by the label it
 * currently shows, so it must be given the live dictionary: after a language
 * switch the old tag no longer matches and is dropped, and the row is re-tagged
 * under its new label.
 * @param labels - reads the current localized label of each owned row.
 * @returns the disposer (removes the stylesheet and every tag it wrote).
 */
export function installSettingsNavIcons(labels: () => NavLabels): () => void {
  const sync = (): void => {
    const wanted = Object.entries(labels()) as Array<[NavIconKey, string]>
    // The settings panel is a portaled modal; its nav is the only one inside a
    // dialog role, so other dialogs' navs (if any) never match a row label.
    for (const nav of document.querySelectorAll('[role="dialog"] nav')) {
      for (const cell of nav.querySelectorAll('button')) {
        const text = (cell.textContent ?? '').trim()
        const match = wanted.find(([, label]) => label === text)
        if (match === undefined) {
          cell.removeAttribute(NAV_ICON_ATTR)
        } else if (cell.getAttribute(NAV_ICON_ATTR) !== match[0]) {
          cell.setAttribute(NAV_ICON_ATTR, match[0])
        }
      }
    }
  }

  const disposeStyles = installNavIconStyles()
  sync()
  // React owns these cells: every panel render re-triggers us and the writes
  // above are idempotent, so a pass settles immediately. Attributes are not
  // observed, so the patch never re-enters itself.
  const observer = new MutationObserver(sync)
  observer.observe(document.body, { childList: true, characterData: true, subtree: true })
  return () => {
    observer.disconnect()
    disposeStyles()
    for (const cell of document.querySelectorAll(`[${NAV_ICON_ATTR}]`)) cell.removeAttribute(NAV_ICON_ATTR)
  }
}
