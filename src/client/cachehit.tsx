/**
 * dsh-ui-tweaks — precise cache-hit readout (browser half).
 *
 * Rewrites the cache-hit figure in the composer stats line under the input
 * box ("缓存命中 96%" / "Cache hit 96%") to two decimal places ("96.35%").
 * DSH rounds the share before display (adding decimals only to avoid a false
 * 100%); the exact figure needs the raw token buckets, which this seat reads
 * through the framework's per-session projection hook
 * (`useProjection('tokenUsage')`) — the same durable whole-log totals the
 * stock number is computed from.
 *
 * - Mounted in `conversation.composer.dock` (the band under the composer card
 *   that hosts the shipped stats line), registered only while the
 *   `preciseCacheHitEnabled` toggle is on — off costs nothing. The entry
 *   renders nothing itself: it is a live reader that patches the stock text
 *   in place, so layout, truncation and tooltip behavior stay DSH's own.
 * - Since the stats-line redesign the figure is no longer wrapped in its own
 *   span: the usage pill renders it as a bare text node after a `·` separator
 *   inside the pill label (e.g. `105 tok·Cache hit 90%`), with the full
 *   reading mirrored on the pill button's `aria-label`, and the click-open
 *   usage dialog (portaled to `document.body`) repeats the figure in a
 *   `dl[data-session-stats-usage]` row. All three are patched; the per-turn
 *   `dl[data-turn-usage-details]` dialog is deliberately left alone — it uses
 *   its own per-turn denominator, not the session totals read here.
 * - A MutationObserver re-applies the precise figure whenever React repaints
 *   anything (token updates, pill churn, dialog open); writes are idempotent
 *   — a rewrite only happens when the text actually differs — so the loop
 *   settles after one pass. Toggling off restores the original texts.
 * @module dsh-ui-tweaks/client/cachehit
 */

import { useEffect } from 'react'
import type { UseProjection } from '@deepseek-ai/dsh-api-session-controller/client'
// Type-only import: pulls dsh-token-meter's `tokenUsage` key into the shared
// projection type table (and the value shape) without a runtime dependency.
import type { TokenUsageProjection } from '@deepseek-ai/dsh-token-meter/client'

/** Cache-hit label with its percentage, matched inside any host text. */
const CACHE_HIT_TEXT_PATTERN = /(?:缓存命中|Cache hit)\s*\d+(?:\.\d+)?%/
/** The trailing percentage of such a label — the only part rewritten. */
const PERCENT_TAIL_PATTERN = /\d+(?:\.\d+)?%(?=\s*$)/

/**
 * Sum the three disjoint prompt-side billing buckets — DSH's own denominator
 * for the cache-hit share (`uncachedInput + cacheRead + cacheWrite`).
 */
function billedInputTokens(usage: TokenUsageProjection): number {
  return usage.uncachedInputTokens + usage.cacheReadTokens + usage.cacheWriteTokens
}

/**
 * Rewrite the cache-hit figure inside a host string, preserving the label,
 * spacing and surrounding text (pill labels concatenate the token total in
 * front of the figure). Returns the input unchanged when it carries no
 * cache-hit label.
 */
function rewriteCacheHitText(current: string, precise: string): string {
  if (!CACHE_HIT_TEXT_PATTERN.test(current)) return current
  return current.replace(PERCENT_TAIL_PATTERN, `${precise}%`)
}

export interface PreciseCacheHitEntryProps {
  /** Framework seat (PropsRuntime): key-addressed per-session projection reader. */
  useProjection: UseProjection
}

/** Session-scoped composer-dock seat that keeps the stock cache-hit figure at two decimals. */
export function PreciseCacheHitEntry({ useProjection }: PreciseCacheHitEntryProps) {
  // The raw cumulative usage; undefined until the host's baseline/frame
  // carries the key — exactly when the stock line first shows the group.
  const usage = useProjection('tokenUsage')

  useEffect(() => {
    const bands = document.querySelectorAll<HTMLElement>('[data-slot="conversation.composer.dock"]')
    if (bands.length === 0) return

    /** Original texts of nodes we rewrote, restored on cleanup. */
    const patchedText = new Map<CharacterData, string>()
    /** Original aria-labels of pill buttons we rewrote. */
    const patchedAria = new Map<Element, string>()
    /** Original texts of usage-dialog cells we rewrote. */
    const patchedCells = new Map<Element, string>()

    /** Drop entries whose nodes React has since replaced. */
    const prune = (): void => {
      for (const node of [...patchedText.keys()]) {
        if (!node.isConnected) patchedText.delete(node)
      }
      for (const el of [...patchedAria.keys()]) {
        if (!el.isConnected) patchedAria.delete(el)
      }
      for (const el of [...patchedCells.keys()]) {
        if (!el.isConnected) patchedCells.delete(el)
      }
    }

    /**
     * Two-decimal share over the raw buckets; null while there is nothing
     * precise to show (projection absent, or no billed input — the stock line
     * omits the group in that case too).
     */
    const precisePercent = (): string | null => {
      if (usage === undefined) return null
      const billed = billedInputTokens(usage)
      if (!(billed > 0)) return null
      return ((usage.cacheReadTokens / billed) * 100).toFixed(2)
    }

    const applyToTextNode = (node: CharacterData, precise: string | null): void => {
      const current = node.data
      if (!CACHE_HIT_TEXT_PATTERN.test(current)) return
      if (precise === null) {
        // Projection gone (session switch race): undo any rewrite so the
        // stock figure shows again instead of a stale one.
        const original = patchedText.get(node)
        if (original !== undefined) {
          if (original !== current) node.data = original
          patchedText.delete(node)
        }
        return
      }
      if (!patchedText.has(node)) patchedText.set(node, current)
      const rewritten = rewriteCacheHitText(current, precise)
      if (rewritten !== current) node.data = rewritten
    }

    const applyToAria = (el: Element, precise: string | null): void => {
      const current = el.getAttribute('aria-label') ?? ''
      if (!CACHE_HIT_TEXT_PATTERN.test(current)) return
      if (precise === null) {
        const original = patchedAria.get(el)
        if (original !== undefined) {
          if (original !== current) el.setAttribute('aria-label', original)
          patchedAria.delete(el)
        }
        return
      }
      if (!patchedAria.has(el)) patchedAria.set(el, current)
      const rewritten = rewriteCacheHitText(current, precise)
      if (rewritten !== current) el.setAttribute('aria-label', rewritten)
    }

    const applyToDialog = (precise: string | null): void => {
      // The usage dialog is portaled to document.body, outside the dock
      // bands. Its `缓存命中` / `Cache hit` row shows the same session-total
      // figure as the pill, so it gets the same rewrite. Per-turn dialogs
      // (`data-turn-usage-details`) are skipped: they use a per-turn
      // denominator this seat never reads.
      for (const dl of document.querySelectorAll('dl[data-session-stats-usage]')) {
        for (const dt of dl.querySelectorAll('dt')) {
          const label = (dt.textContent ?? '').trim()
          if (label !== '缓存命中' && label !== 'Cache hit') continue
          const dd = dt.nextElementSibling
          if (dd === null || dd.tagName !== 'DD') continue
          if (precise === null) {
            const original = patchedCells.get(dd)
            if (original !== undefined) {
              if (dd.textContent !== original) dd.textContent = original
              patchedCells.delete(dd)
            }
            continue
          }
          if (!patchedCells.has(dd)) patchedCells.set(dd, dd.textContent ?? '')
          const rewritten = `${precise}%`
          if (dd.textContent !== rewritten) dd.textContent = rewritten
        }
      }
    }

    const apply = (): void => {
      prune()
      const precise = precisePercent()
      for (const band of bands) {
        // Walk text nodes, not spans: the redesigned pills render the figure
        // as a bare text node after the `·` separator (older DSH wrapped the
        // whole group in its own span — its text node matches just the same).
        const walker = document.createTreeWalker(band, NodeFilter.SHOW_TEXT)
        let node = walker.nextNode() as CharacterData | null
        while (node !== null) {
          applyToTextNode(node, precise)
          node = walker.nextNode() as CharacterData | null
        }
        for (const el of band.querySelectorAll('[aria-label]')) {
          applyToAria(el, precise)
        }
      }
      applyToDialog(precise)
    }

    apply()
    // React owns these text nodes: every repaint re-triggers us, and our own
    // idempotent writes settle after a single extra pass. The dialog lives
    // outside the bands (body portal), so the body itself is observed.
    const observer = new MutationObserver(apply)
    observer.observe(document.body, { childList: true, characterData: true, subtree: true })
    return () => {
      observer.disconnect()
      // Toggle-off/unmount must not leave a stale precise figure behind.
      for (const [node, original] of patchedText) {
        if (node.data !== original) node.data = original
      }
      patchedText.clear()
      for (const [el, original] of patchedAria) {
        if (el.getAttribute('aria-label') !== original) el.setAttribute('aria-label', original)
      }
      patchedAria.clear()
      for (const [el, original] of patchedCells) {
        if (el.textContent !== original) el.textContent = original
      }
      patchedCells.clear()
    }
  }, [usage])

  return null
}
