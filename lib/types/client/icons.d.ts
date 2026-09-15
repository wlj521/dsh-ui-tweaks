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
    size?: number | undefined;
    /** Extra class for layout placement; color rides currentColor. */
    className?: string | undefined;
}
/** Document with changed lines, for the diff tab. */
export declare function DiffIcon({ size, className }: GuideIconProps): import("react").JSX.Element;
//# sourceMappingURL=icons.d.ts.map