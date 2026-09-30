/**
 * dsh-ui-tweaks — desktop-shell detection.
 *
 * The browser bundle is shared verbatim between `dsh web` (a plain browser)
 * and the DSH desktop application (Electron): the same `lib/client.js` runs
 * inside both, so any UI fact that differs per shell must be branched here
 * rather than assumed. The desktop shell serves the web UI from the
 * privileged `dsh-app:` scheme (registered `standard` + `secure`, hence a
 * secure context — the Web Notifications API is available) and its preload
 * publishes `window.dshDesktop`; neither marker exists in a browser tab.
 *
 * One known desktop divergence handled by consumers: the desktop app's
 * default session auto-grants non-media permissions, so the Web
 * Notifications permission there is granted without any user prompt — copy
 * promising "permission is requested" would lie inside the desktop app.
 *
 * @module dsh-ui-tweaks/client/shell
 */

/**
 * Whether this bundle runs inside the DSH desktop application rather than a
 * browser tab. The `dsh-app:` protocol check covers every desktop frame; the
 * `dshDesktop` presence check is the belt-and-braces signal for hosts that
 * might serve the same document over another scheme. Cheap enough to call per
 * render — both markers are read-only property lookups.
 *
 * @returns `true` inside the desktop shell; `false` in a browser or in any
 *   non-DOM context.
 */
export function isDesktopShell(): boolean {
  if (typeof window === 'undefined') return false
  return window.location.protocol === 'dsh-app:' || 'dshDesktop' in window
}
