/**
 * dsh-ui-tweaks — precise cache-hit readout (browser half).
 *
 * Rewrites the cache-hit figure in the composer stats line under the input
 * box ("缓存命中 96%" / "Cache hit 96%") to two decimal places ("96.35%").
 * DSH rounds the share to an integer before display (adding decimals only to
 * avoid a false 100%); the exact figure needs the raw token buckets, which
 * this seat reads through the framework's per-session projection hook
 * (`useProjection('tokenUsage')`) — the same durable whole-log totals the
 * stock number is computed from.
 *
 * - Mounted in `conversation.composer.dock` (the band under the composer card
 *   that hosts the shipped stats line), registered only while the
 *   `preciseCacheHitEnabled` toggle is on — off costs nothing. The entry
 *   renders nothing itself: it is a live reader that patches the stock span's
 *   text in place, so layout, truncation and tooltip behavior stay DSH's own.
 * - A MutationObserver re-applies the precise figure whenever React repaints
 *   the line (token updates, group churn); writes are idempotent — a rewrite
 *   only happens when the text actually differs — so the loop settles after
 *   one pass. Toggling off restores the original texts.
 * @module dsh-ui-tweaks/client/cachehit
 */

import { useEffect } from 'react'
import type { UseProjection } from '@deepseek-ai/dsh-api-session-controller/client'
// Type-only import: pulls dsh-token-meter's `tokenUsage` key into the shared
// projection type table (and the value shape) without a runtime dependency.
import type { TokenUsageProjection } from '@deepseek-ai/dsh-token-meter/client'

/** Whole-span shape of the stock cache-hit group (zh + en locales). */
const CACHE_HIT_SPAN_PATTERN = /^\s*(?:缓存命中|Cache hit)\s+\d+(?:\.\d+)?%\s*$/
/** The trailing percentage inside that label — the only part rewritten. */
const PERCENT_IN_SPAN_PATTERN = /\d+(?:\.\d+)?%(?=\s*$)/

/**
 * Sum the three disjoint prompt-side billing buckets — DSH's own denominator
 * for the cache-hit share (`uncachedInput + cacheRead + cacheWrite`).
 */
function billedInputTokens(usage: TokenUsageProjection): number {
  return usage.uncachedInputTokens + usage.cacheReadTokens + usage.cacheWriteTokens
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

    /** Original texts of spans we rewrote, restored on cleanup. */
    const patched = new Map<HTMLSpanElement, string>()

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

    const apply = (): void => {
      const precise = precisePercent()
      for (const band of bands) {
        for (const el of band.querySelectorAll<HTMLSpanElement>('span')) {
          const current = el.textContent ?? ''
          if (!CACHE_HIT_SPAN_PATTERN.test(current)) continue
          if (precise === null) {
            // Projection gone (session switch race): undo any rewrite so the
            // stock integer shows again instead of a stale figure.
            const original = patched.get(el)
            if (original !== undefined && original !== current) el.textContent = original
            patched.delete(el)
            continue
          }
          if (!patched.has(el)) patched.set(el, current)
          const rewritten = current.replace(PERCENT_IN_SPAN_PATTERN, `${precise}%`)
          if (rewritten !== current) el.textContent = rewritten
        }
      }
    }

    apply()
    // React owns these text nodes: every repaint of the line re-triggers us,
    // and our own idempotent write settles after a single extra pass.
    const observer = new MutationObserver(apply)
    for (const band of bands) {
      observer.observe(band, { childList: true, characterData: true, subtree: true })
    }
    return () => {
      observer.disconnect()
      // Toggle-off/unmount must not leave a stale precise figure behind.
      for (const [el, original] of patched) {
        if ((el.textContent ?? '') !== original) el.textContent = original
      }
      patched.clear()
    }
  }, [usage])

  return null
}
