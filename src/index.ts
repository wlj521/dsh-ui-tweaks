/**
 * dsh-ui-tweaks — server half.
 *
 * Owns the `ui-tweaks` settings namespace so users can tune the conversation
 * UI either from the Settings panel or by editing the profile patch
 * (`cordis.patch.yml` `ui-tweaks` entry; settings.yaml was retired in DSH
 * 0.1.7, which migrated its sections there). Since 0.1.7 the Settings panel
 * derives each form from the plugin's exported `Config` schema — there is no
 * explicit `settings.register()` anymore — so this module re-exports
 * `Config` and opts out of the auto-generated form page (the browser half
 * owns its sections through the `settings.section` slot). All rendering work
 * happens in the browser bundle (`src/client`), which reads and writes this
 * namespace through the same-origin route mounted here — the Web settings RPC
 * only exposes a fixed allowlist of namespaces since rc.6, so a custom route
 * is the supported way for a plugin to own a configuration page.
 * @module dsh-ui-tweaks
 */

import type { Context } from '@deepseek-ai/cordis'
import {
  UI_TWEAKS_SETTINGS_NAMESPACE,
  Config,
} from './config.ts'
import { installTurnOutcomeProjection } from './turn-outcome.ts'
import { installTimelineProjection } from './timeline.ts'
import { UITweaksWebBackend, installUITweaksWeb } from './web.ts'
import { GitBackend } from './git.ts'
import { installGitWeb } from './git-web.ts'
import { ArchiveBackend, installArchiveWeb } from './archive.ts'
import { McpBackend, installMcpWeb } from './mcp.ts'
import { SearchBackend, installSearchWeb } from './search-web.ts'
import { createSearchProvider, type SearchProviderConfig, type WebSearchSeam } from './search.ts'

export const name = 'dsh-ui-tweaks'

/**
 * Re-export the Config schema so the Cordis loader attaches it to this
 * plugin's runtime: since DSH 0.1.7 `SettingsForms` reads
 * `entry.fiber.runtime.Config` to derive the settings form (the old
 * `ctx.settings.register()` call no longer exists).
 */
export { Config }

/** Required services: the settings seam is the whole server-side surface. */
export const inject = ['settings', 'web']

export function apply(ctx: Context): void {
  // The Settings form is derived from the exported `Config` schema (DSH
  // 0.1.7+). This client owns its Settings sections through the
  // `settings.section` slot, so opt the instance out of the auto-generated
  // form page instead of registering a namespace by hand.
  ctx.effect(() => ctx.settings.configure({ auto: false }, ctx.fiber))

  // The task notifier classifies turn endings (completed / aborted / failed)
  // through this session projection (registered when present).
  installTurnOutcomeProjection(ctx)

  // The conversation timeline rail enumerates user messages through this
  // session projection (registered when the projection service is present).
  installTimelineProjection(ctx)

  // The browser Settings panel talks to the namespace through this same-origin
  // route (the Web settings RPC only exposes a fixed allowlist since rc.6).
  installUITweaksWeb(ctx, new UITweaksWebBackend(ctx))

  // The GitBar runs git in the session's working directory through these
  // same-origin routes (sessions is an optional service, duck-typed).
  installGitWeb(ctx, new GitBackend(ctx))

  // The Archive panel lists archived sessions and restores ("deletes") them
  // through these same-origin routes (workspace registry + storage domain
  // are optional services, resolved at request time).
  installArchiveWeb(ctx, new ArchiveBackend(ctx))

  // The MCP manager lists the configured MCP servers (loader entries + tool
  // registry) and restarts them through these same-origin routes (loader is
  // an optional service, resolved at request time).
  installMcpWeb(ctx, new McpBackend(ctx))

  // Search key manager: the "搜索" settings page reads and writes engine API
  // keys in ~/.dsh/.credentials.yaml through this same-origin route (keys
  // never live in the settings document).
  const searchBackend = new SearchBackend(ctx)
  installSearchWeb(ctx, searchBackend)

  // Free web search: registering a provider into the web seam makes the
  // harness's built-in `web_search` tool use it. The preferred engine and
  // Bing market come live from the ui-tweaks settings form; engine API
  // keys resolve through the credentials center (~/.dsh/.credentials.yaml)
  // first, then the process environment.
  const web = ctx as Context & { web?: WebSearchSeam }
  const searchEnabledNow = (): boolean => {
    const row = ctx.settings.describe().find(candidate => candidate.ns === UI_TWEAKS_SETTINGS_NAMESPACE)
    return ((row?.value as { searchEnabled?: unknown } | undefined)?.searchEnabled) === true
  }
  const seam = web.web
  if (seam) {
    const readConfig = (): SearchProviderConfig => {
      const row = ctx.settings.describe().find(candidate => candidate.ns === UI_TWEAKS_SETTINGS_NAMESPACE)
      const value = row?.value as { searchEnabled?: unknown; searchEngine?: unknown; bingMarket?: unknown } | undefined
      return {
        searchEnabled: value?.searchEnabled === true,
        searchEngine: typeof value?.searchEngine === 'string' ? value.searchEngine as SearchProviderConfig['searchEngine'] : undefined,
        bingMarket: typeof value?.bingMarket === 'string' ? value.bingMarket : undefined,
      }
    }
    const resolveApiKey = async (envName: string): Promise<string | undefined> => {
      const credentials = (ctx as Context & { get?(name: string): unknown }).get?.('credentials') as
        | { resolve(envName: string): Promise<{ value?: string | undefined }> }
        | undefined
      if (credentials) {
        try {
          const resolved = await credentials.resolve(envName)
          if (resolved?.value) return resolved.value
        } catch {
          // The credentials service may lag the plugin mount; fall through.
        }
      }
      return process.env[envName]
    }
    const provider = createSearchProvider({ readConfig, resolveApiKey })
    seam.registerSearchProvider(provider)
    // Startup reconcile — deferred until this fiber is ACTIVE: since DSH
    // 0.1.7 `settings.describe()` only lists ACTIVE entries, and inside
    // apply() our own fiber is still LOADING, so a synchronous read here
    // would always see "off" and `syncSearchPatch(false)` would write that
    // back over the user's enabled patch entry on every boot. Takeover only
    // happens while the feature is enabled; runtime availability still
    // re-reads the setting live, so turning it off always wins.
    void ctx.fiber.await().then(() => {
      if (searchEnabledNow() && !seam.searchProviderId) {
        seam.searchProviderId = provider.id
      }
      // Mirror the toggle into the profile patch so the harness's built-in
      // web_search is activated / restored even if the setting was changed
      // by hand between restarts.
      return searchBackend.syncSearchPatch(searchEnabledNow())
    }).catch((error: unknown) => {
      ctx.logger.warn('[dsh-ui-tweaks] search patch sync failed: %s', error instanceof Error ? error.message : String(error))
    })
  } else {
    ctx.logger.warn('[dsh-ui-tweaks] web seam not found; built-in web_search stays on the stock backend')
  }

  ctx.logger.info('[dsh-ui-tweaks] settings schema exported and Web routes mounted')
}
