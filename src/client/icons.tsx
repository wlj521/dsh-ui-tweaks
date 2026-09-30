/**
 * dsh-ui-tweaks — sidebar guide entry glyphs (browser half).
 *
 * Outline icon for the diff guide box in DSH's right sidebar, drawn in the
 * stock `ic_ds_*` style (16px viewBox, `currentColor` stroke, round caps) so
 * the box matches the shipped 文件 entry. The glyph bundles
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

/**
 * Document with equally sized added / removed marks, for the diff tab. The
 * outline keeps the stock `currentColor` ink; the slimmer marks carry the
 * success / error accents so the glyph reads as a diff at a glance.
 */
export function DiffIcon({ size = 16, className }: GuideIconProps) {
  return (
    <svg width={size} height={size} className={className} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2.5" y="1.5" width="11" height="13" rx="1.9" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M5.9 6.8h4.2M8 4.7v4.2" style={{ stroke: 'var(--dsw-alias-state-success-primary)' }} strokeWidth="1" strokeLinecap="round" />
      <path d="M5.9 11.3h4.2" style={{ stroke: 'var(--dsw-alias-state-error-primary)' }} strokeWidth="1" strokeLinecap="round" />
    </svg>
  )
}
