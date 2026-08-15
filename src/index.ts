/**
 * dsh-ui-tweaks — server half.
 *
 * Registers the `ui-tweaks` settings namespace so users can tune the
 * conversation UI either from the Settings panel or by editing the settings
 * document directly (settings.yaml `ui-tweaks:` section). All rendering work
 * happens in the browser bundle (`src/client`), which reads and writes this
 * namespace through the same-origin route mounted here — the Web settings RPC
 * only exposes a fixed allowlist of namespaces in rc.6, so a custom route is
 * the supported way for a plugin to own a configuration page.
 * @module dsh-ui-tweaks
 */

import type { Context } from '@deepseek-ai/cordis'
import {
  UI_TWEAKS_SETTINGS_NAMESPACE,
  Config,
} from './config.ts'
import { UITweaksWebBackend, installUITweaksWeb } from './web.ts'

export const name = 'dsh-ui-tweaks'

/** Required services: the settings seam is the whole server-side surface. */
export const inject = ['settings']

export function apply(ctx: Context): void {
  ctx.settings.register(UI_TWEAKS_SETTINGS_NAMESPACE, Config, {
    applies: 'live',
  })

  // The browser Settings panel talks to the namespace through this same-origin
  // route (the Web settings RPC only exposes a fixed allowlist in rc.6).
  installUITweaksWeb(ctx, new UITweaksWebBackend(ctx))

  ctx.logger.info('[dsh-ui-tweaks] settings namespace registered and Web route mounted')
}
