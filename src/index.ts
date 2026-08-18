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
  type UITweaksConfig,
} from './config.ts'
import { installTimelineProjection } from './timeline.ts'
import { UITweaksWebBackend, installUITweaksWeb } from './web.ts'
import { GitBackend } from './git.ts'
import { installGitWeb } from './git-web.ts'
import { ArchiveBackend, installArchiveWeb } from './archive.ts'

export const name = 'dsh-ui-tweaks'

/** Required services: the settings seam is the whole server-side surface. */
export const inject = ['settings']

export function apply(ctx: Context): void {
  ctx.settings.register(UI_TWEAKS_SETTINGS_NAMESPACE, Config, {
    applies: 'live',
  })

  // The conversation timeline rail enumerates user messages through this
  // session projection (registered when the projection service is present).
  installTimelineProjection(ctx)

  // The browser Settings panel talks to the namespace through this same-origin
  // route (the Web settings RPC only exposes a fixed allowlist in rc.6).
  installUITweaksWeb(ctx, new UITweaksWebBackend(ctx))

  // The GitBar runs git in the session's working directory through these
  // same-origin routes (sessions/llm are optional services, duck-typed).
  const readConfig = (): UITweaksConfig => ctx.settings.get(UI_TWEAKS_SETTINGS_NAMESPACE) as UITweaksConfig
  installGitWeb(ctx, new GitBackend(ctx, readConfig))

  // The Archive panel lists archived sessions and restores ("deletes") them
  // through these same-origin routes (workspace registry + storage domain
  // are optional services, resolved at request time).
  installArchiveWeb(ctx, new ArchiveBackend(ctx))

  ctx.logger.info('[dsh-ui-tweaks] settings namespace registered and Web routes mounted')
}
