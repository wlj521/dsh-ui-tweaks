/**
 * dsh-ui-tweaks — thinking-effort tint for the composer model seat (browser half).
 *
 * Tags every rendered thinking-effort label with its intensity band, so the
 * poster skin can paint it in a solid band color (Low green, Medium amber,
 * High blue, Max Codex-violet), and wash the hovered option row with a
 * left-to-right gradient in the same hue. Three surfaces are covered — the
 * `model · effort` trigger in `conversation.input.model`, the Effort cell
 * value in its dropdown menu root, and every option row in the menu's
 * effort pane (label span plus row button, the button carrying the band for
 * the background wash). Off / provider-Default / unrecognized names stay
 * the stock caption gray — a level we cannot place gets no color rather
 * than a wrong one; extend BAND_WORDS when a new adapter ships new names.
 *
 * - Effort levels are adapter-owned: DeepSeek advertises Off/Low/High/Max,
 *   pi-ai-backed providers offer off/minimal/low/medium/high/xhigh/max
 *   (shown capitalized), others e.g. Standard. Classification reads the
 *   rendered label text, never a fixed id vocabulary.
 * - The trigger renders model-name and effort spans in order (the chevron is
 *   an svg), so the trailing span is the effort label when present. The menu
 *   is portaled to document.body, outside the seat: each trigger's
 *   `aria-controls` names its menu element, which is how the watcher reaches
 *   it. Inside the menu, radios beside group sections are the model list
 *   (left alone); radios without sections are effort options.
 * - One MutationObserver re-tags on React repaints (model switch, effort
 *   change, session switch, menu open); writes are idempotent — an attribute
 *   is only touched when it actually changes — so the loop settles after one
 *   pass. Removed nodes take their tags with them; cleanup clears the rest.
 * - Mounted only while the neon-poster theme is active (see the effect in
 *   index.tsx): other themes have no rules for the tag and stay stock.
 * @module dsh-ui-tweaks/client/effort
 */

/** Intensity bands, each painted in its own gradient by the skin. */
export type EffortBand = 'low' | 'medium' | 'high' | 'max'

/**
 * Rendered effort names per band, matched case-insensitively after trimming.
 * DeepSeek advertises Off/Low/High/Max; pi-ai-backed providers offer
 * off/minimal/low/medium/high/xhigh/max (shown capitalized); others e.g.
 * Standard. Adapter names are English in practice; the Chinese entries cover
 * adapters that localize their level names.
 */
const BAND_WORDS: Readonly<Record<EffortBand, readonly string[]>> = {
  low: ['low', 'minimal', 'mini', 'eco', 'fast', '低', '快速'],
  medium: ['medium', 'standard', 'balanced', 'moderate', '中', '标准'],
  high: ['high', 'deep', 'advanced', '高', '深度', '强'],
  max: ['max', 'maximum', 'ultra', 'extreme', 'highest', 'xhigh', '最高', '最强'],
}

/**
 * Names that state no intensity: the provider default (whose real level is
 * unknown to the viewer), an automatic choice, or thinking turned off.
 */
const NEUTRAL_WORDS: readonly string[] = [
  'default',
  'provider default',
  'auto',
  'off',
  'none',
  'disabled',
  '默认',
  '自动',
  '关闭',
  '无',
]

/**
 * Place a rendered effort label on the intensity scale.
 * @param name - the effort label as shown (e.g. 'High').
 * @returns its band, or null to leave the stock caption untouched.
 */
export function classifyEffort(name: string): EffortBand | null {
  const normalized = name.trim().toLowerCase()
  if (normalized === '') return null
  for (const word of NEUTRAL_WORDS) {
    if (normalized === word) return null
  }
  for (const [band, words] of Object.entries(BAND_WORDS) as Array<[EffortBand, readonly string[]]>) {
    if (words.includes(normalized)) return band
  }
  return null
}

/** Attribute the tagger sets on effort label spans; the skin reads it. */
const EFFORT_ATTR = 'data-dut-effort'

/** Model triggers live in the input's model seat, wherever it is mounted. */
const MODEL_TRIGGER_SELECTOR = 'div[data-slot="conversation.input.model"] button'

/** Root-cell headings that name the effort row, in either shipped locale. */
const EFFORT_CELL_LABELS: ReadonlySet<string> = new Set(['推理等级', 'Effort'])

/**
 * Tag (or untag) one label span; idempotent — untouched when already correct.
 * @param el - the label span, if the structure offered one.
 * @param present - whether this span is an effort label.
 */
function tagLabel(el: Element | null, band: EffortBand | null): void {
  if (!(el instanceof HTMLElement)) return
  if (band === null) {
    if (el.hasAttribute(EFFORT_ATTR)) el.removeAttribute(EFFORT_ATTR)
    return
  }
  if (el.getAttribute(EFFORT_ATTR) !== band) el.setAttribute(EFFORT_ATTR, band)
}

/**
 * Tag a model trigger's effort span: the trailing direct-child span, present
 * only while the model advertises reasoning levels.
 */
function applyToTrigger(button: HTMLButtonElement): void {
  const spans = button.querySelectorAll(':scope > span')
  for (const span of spans) {
    const isEffort = spans.length >= 2 && span === spans[spans.length - 1]
    tagLabel(span, isEffort ? classifyEffort(span.textContent?.trim() ?? '') : null)
  }
}

/**
 * Tag one open model menu, reached through its trigger's aria-controls.
 * Radios beside group sections are the model list (left alone); radios
 * without sections are effort options; the root pane's Effort cell value
 * takes the current effort's band.
 */
function applyToMenu(menu: HTMLElement): void {
  const radios = menu.querySelectorAll('button[role="menuitemradio"]')
  const hasGroups = menu.querySelector('section[role="group"]') !== null
  for (const radio of radios) {
    if (!(radio instanceof HTMLButtonElement)) continue
    if (hasGroups) {
      radio.removeAttribute(EFFORT_ATTR)
      for (const tagged of radio.querySelectorAll(`span[${EFFORT_ATTR}]`)) {
        tagged.removeAttribute(EFFORT_ATTR)
      }
      continue
    }
    const copy = radio.querySelector(':scope > span')
    const band = classifyEffort(copy?.textContent?.trim() ?? '')
    tagLabel(copy, band)
    // The row button carries the same band so the skin can wash its
    // background on hover without :has selectors.
    if (band === null) {
      radio.removeAttribute(EFFORT_ATTR)
    } else if (radio.getAttribute(EFFORT_ATTR) !== band) {
      radio.setAttribute(EFFORT_ATTR, band)
    }
  }
  for (const cell of menu.querySelectorAll('button[role="menuitem"]')) {
    if (!(cell instanceof HTMLButtonElement)) continue
    const spans = cell.querySelectorAll(':scope > span')
    if (spans.length < 2) continue
    const head = spans[0]
    const value = spans[spans.length - 1] ?? null
    const isEffortCell = EFFORT_CELL_LABELS.has(head?.textContent?.trim() ?? '')
    tagLabel(value, isEffortCell ? classifyEffort(value?.textContent?.trim() ?? '') : null)
  }
}

/**
 * Watch every composer model trigger (and its open dropdown menu) and keep
 * the effort band tags current.
 * @returns cleanup: stops the observer and removes all tags set here.
 */
export function installEffortTag(): () => void {
  const apply = (): void => {
    for (const button of document.querySelectorAll<HTMLButtonElement>(MODEL_TRIGGER_SELECTOR)) {
      applyToTrigger(button)
      // The menu is portaled to document.body, outside the seat: the
      // trigger's aria-controls names its element while open.
      const menuId = button.getAttribute('aria-controls')
      const menu = menuId === null ? null : document.getElementById(menuId)
      if (menu !== null) applyToMenu(menu)
    }
  }
  apply()
  // React owns the trigger: every repaint re-triggers us, and the idempotent
  // writes settle after a single extra pass.
  const observer = new MutationObserver(apply)
  observer.observe(document.body, { childList: true, characterData: true, subtree: true })
  return () => {
    observer.disconnect()
    for (const tagged of document.querySelectorAll(`[${EFFORT_ATTR}]`)) {
      tagged.removeAttribute(EFFORT_ATTR)
    }
  }
}
