/**
 * dsh-ui-tweaks — themed select menu (shared browser primitive).
 *
 * Reproduces the host's General-settings language selector
 * (`@deepseek-ai/dsh-client-locale` `LanguageRow`): a pill trigger plus a
 * portalled `role="menu"` card painted with the host menu tokens — lg-radius
 * translucent surface, prominent elevation, 34px rows with md-radius hover
 * fill, and a trailing check on the selected row. The primitives' own `Menu`
 * component is NOT importable here — that package is absent from this
 * plugin's `dsh.client.inject` whitelist, so the same markup and behavior is
 * reproduced with no new host dependency:
 *
 * - the trigger opens the card; arrows walk the rows; Enter/Space activate;
 *   Escape closes and returns focus to the trigger (host Menu behavior);
 * - the card is portalled to `document.body` at z-index 1100 so it floats
 *   above modal overlays, re-places itself on scroll/resize, and flips above
 *   the trigger when the viewport has no room below;
 * - long lists (e.g. the GitBar branch picker) scroll inside a bounded card
 *   with the host's scrollbar tokens, as the host Menu does.
 *
 * Styles install lazily and idempotently from the component itself, so every
 * consumer gets them without wiring.
 * @module dsh-ui-tweaks/client/select-menu
 */

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'

/** One entry of a themed select menu. */
export interface SelectMenuEntry {
  value: string
  label: string
}

/** Bounded card height; taller lists scroll inside it (host Menu parity). */
const MENU_MAX_HEIGHT = 320

export const SELECT_MENU_CSS = `
.dut-select-wrap{position:relative;display:inline-flex;flex:none}
/* Chevron mirrors the language selector's trailing icon: the pill trigger is
 * a plain button (no native arrow), so the caret is drawn here with the
 * label-tertiary token (currentColor cannot reach a data-URI background). */
.dut-select-wrap::after{content:'';position:absolute;right:14px;top:50%;width:7px;height:7px;margin-top:-4px;border-right:1.5px solid var(--dsw-alias-label-tertiary);border-bottom:1.5px solid var(--dsw-alias-label-tertiary);transform:rotate(45deg);pointer-events:none;transition:border-color .15s ease,opacity .15s ease}
.dut-select-wrap:hover::after{border-color:var(--dsw-alias-label-primary)}
.dut-select-wrap:has(button:disabled)::after{opacity:.45}
/* Language-selector pill: radius-md token, module-platform fill, no border,
 * 36px height, 14px type — the host's General-settings selector recipe. */
.dut-select-trigger{appearance:none;box-sizing:border-box;height:36px;min-width:200px;padding:0 36px 0 14px;border:none;border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-primary);font:inherit;font-size:14px;line-height:22px;text-align:left;cursor:pointer;transition:background .15s ease}
.dut-select-trigger:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dut-select-trigger:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}
.dut-select-trigger:disabled{opacity:.5;cursor:not-allowed}
/* Fill mode: the trigger stretches across the row's remaining width (GitBar
 * base-branch row), and the card pins to that same width so the two never
 * disagree. The wrap must take part in flex distribution (flex:1, not
 * width:100% — the base rule's flex:none would make an unshrinkable full-width
 * item and push the pill past its container). */
.dut-select-wrap.dut-select-fill{display:flex;flex:1;min-width:0}
.dut-select-wrap.dut-select-fill .dut-select-trigger{flex:1;min-width:0}
/* Themed card mirroring the host Menu tokens (primitives Menu.module.css /
 * MenuSurface.module.css): 4px inset, lg-radius translucent surface,
 * prominent elevation, content-hugging width between the host's compact and
 * readable bounds (never the anchor's width — a fill-mode pill would stretch
 * the card across its dialog), host scrollbar rebinding for the bounded
 * viewport. */
.dut-select-menu{position:fixed;z-index:1100;box-sizing:border-box;padding:4px;display:flex;flex-direction:column;gap:0;border:0;border-radius:var(--dsw-radius-lg);box-shadow:var(--dsw-elevation-prominent,var(--dsw-shadow-lv3));background:var(--dsw-menu-surface-fill,var(--dsw-alias-bg-layer-2));backdrop-filter:var(--dsw-menu-backdrop-filter,none);min-width:144px;max-width:360px;max-height:min(320px,calc(100vh - 24px));overflow-y:auto;--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2)}
.dut-select-menu-item{display:flex;align-items:center;gap:6px;width:100%;min-height:34px;padding:6px 8px;border:none;border-radius:var(--dsw-radius-md);background:transparent;cursor:pointer;font:inherit;font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary);text-align:left}
.dut-select-menu-item:hover,.dut-select-menu-item:focus-visible{background:var(--dsw-alias-interactive-bg-hover);outline:none}
.dut-select-menu-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dut-select-menu-check{flex:none;display:inline-flex;width:14px;height:14px;color:var(--dsw-alias-label-primary);visibility:hidden}
.dut-select-menu-item[aria-selected="true"] .dut-select-menu-check{visibility:visible}
`

let stylesInstalled = false

/** Install the select-menu stylesheet once (idempotent); returns the disposer. */
export function installSelectMenuStyles(): () => void {
  if (stylesInstalled) return () => {}
  const style = document.createElement('style')
  style.dataset.plugin = 'dsh-ui-tweaks'
  style.dataset.pluginCss = 'dsh-ui-tweaks-select-menu'
  style.textContent = SELECT_MENU_CSS
  document.head.appendChild(style)
  stylesInstalled = true
  return () => { style.remove(); stylesInstalled = false }
}

export interface SelectMenuProps {
  /** Current value; the matching entry's label paints the trigger. */
  value: string
  entries: readonly SelectMenuEntry[]
  disabled?: boolean
  /** Accessible name for the trigger when no visible label points at it. */
  ariaLabel?: string
  /**
   * Stretch the trigger across its row (GitBar's base-branch row). A fill-mode
   * card pins to the trigger's exact width so the popup and the box stay
   * identical; the default content-hugging bounds (144–360px) apply otherwise.
   */
  fill?: boolean
  onChange: (value: string) => void
}

export function SelectMenu({ value, entries, disabled = false, ariaLabel, fill = false, onChange }: SelectMenuProps) {
  installSelectMenuStyles()
  const [open, setOpen] = useState(false)
  const [box, setBox] = useState<{ top: number; left: number; width: number | undefined } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  /** Card height estimate for the flip decision and the scroll bound. */
  const estimated = Math.min(entries.length * 38 + 8, MENU_MAX_HEIGHT)

  const place = useCallback((): void => {
    const trigger = triggerRef.current
    if (trigger === null) return
    const rect = trigger.getBoundingClientRect()
    // Flip above the trigger when the card would overflow the viewport bottom.
    const top = rect.bottom + 4 + estimated <= window.innerHeight - 8
      ? rect.bottom + 4
      : Math.max(8, rect.top - 4 - estimated)
    // Fill mode pins the card to the trigger's exact width (inline width plus
    // max-width, which otherwise caps the content-hugging bounds below it);
    // the default leaves the card to the 144–360px CSS bounds.
    setBox({ top, left: rect.left, width: fill ? rect.width : undefined })
  }, [estimated, fill])

  // Keep the card under its pill while the page scrolls or resizes.
  useEffect(() => {
    if (!open) return
    const move = (): void => { place() }
    window.addEventListener('scroll', move, true)
    window.addEventListener('resize', move)
    return () => {
      window.removeEventListener('scroll', move, true)
      window.removeEventListener('resize', move)
    }
  }, [open, place])

  // A pointer outside the card or the pill dismisses it.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target as Node | null
      if (target === null) return
      if (menuRef.current?.contains(target) === true || triggerRef.current?.contains(target) === true) return
      setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => { document.removeEventListener('pointerdown', onPointerDown) }
  }, [open])

  // Move real focus onto the selected row once the card is placed.
  useEffect(() => {
    if (!open || box === null) return
    const menu = menuRef.current
    if (menu === null) return
    const selected = menu.querySelector<HTMLButtonElement>('.dut-select-menu-item[aria-selected="true"]')
      ?? menu.querySelector<HTMLButtonElement>('.dut-select-menu-item')
    selected?.focus()
  }, [open, box])

  const commit = (next: string): void => {
    setOpen(false)
    triggerRef.current?.focus()
    if (next !== value) onChange(next)
  }

  const onCardKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault()
      setOpen(false)
      triggerRef.current?.focus()
      return
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('.dut-select-menu-item') ?? [])
    if (items.length === 0) return
    const current = items.indexOf(document.activeElement as HTMLButtonElement)
    const step = event.key === 'ArrowDown' ? 1 : -1
    const next = items[(current + step + items.length) % items.length]
    next?.focus()
  }

  const active = entries.find(entry => entry.value === value)
  return (
    <span className={'dut-select-wrap' + (fill ? ' dut-select-fill' : '')}>
      <button
        ref={triggerRef}
        type="button"
        className="dut-select-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => {
          if (open) {
            setOpen(false)
            return
          }
          place()
          setOpen(true)
        }}
      >
        {active?.label ?? value}
      </button>
      {open && box !== null ? createPortal(
        <div
          ref={menuRef}
          className="dut-select-menu"
          role="menu"
          style={box.width !== undefined
            ? { top: box.top, left: box.left, width: box.width, maxWidth: box.width }
            : { top: box.top, left: box.left }}
          onKeyDown={onCardKeyDown}
        >
          {entries.map(entry => (
            <button
              key={entry.value}
              type="button"
              role="menuitem"
              aria-selected={entry.value === value}
              className="dut-select-menu-item"
              onClick={() => { commit(entry.value) }}
            >
              <span className="dut-select-menu-label">{entry.label}</span>
              <svg className="dut-select-menu-check" viewBox="0 0 14 14" width="14" height="14" fill="none" aria-hidden="true">
                <path d="M2.5 7.5l3 3 6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          ))}
        </div>,
        document.body,
      ) : null}
    </span>
  )
}
