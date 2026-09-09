/**
 * dsh-ui-tweaks — sidebar guide entry glyphs (browser half).
 *
 * Outline icons for the terminal / diff guide boxes in DSH's right sidebar,
 * drawn in the stock `ic_ds_*` style (16px viewBox, `currentColor` stroke,
 * round caps) so the boxes match the shipped 文件 entry. The glyphs bundle
 * with the plugin and need no host module beyond what the tab registry
 * already requires.
 * @module dsh-ui-tweaks/client/icons
 */

/**
 * Glyph props, structurally identical to the host's `IconProps`
 * (`@deepseek-ai/dsh-client-ui-primitives`): declared locally so the icons
 * need no new dependency — the sidebar guide entry only requires a component
 * taking these props.
 */
export interface GuideIconProps {
  /** Square edge in px; defaults to the glyph's own drawn size. */
  size?: number | undefined
  /** Extra class for layout placement; color rides currentColor. */
  className?: string | undefined
}

/** Terminal prompt (`>_`) inside a rounded screen. */
export function TerminalIcon({ size = 16, className }: GuideIconProps) {
  return (
    <svg width={size} height={size} className={className} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="1.5" y="2.5" width="13" height="11" rx="2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4.5 6l2.5 2-2.5 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8.5 10h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** Document with changed lines, for the diff tab. */
export function DiffIcon({ size = 16, className }: GuideIconProps) {
  return (
    <svg width={size} height={size} className={className} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M9.5 1.5H4A1.5 1.5 0 0 0 2.5 3v10A1.5 1.5 0 0 0 4 14.5h8A1.5 1.5 0 0 0 13.5 13V5.5l-4-4Z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9.5 1.5V5.5h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5.75 10h4.5M5.75 7.5h2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
