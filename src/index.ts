/**
 * dsh-ui-tweaks — server half.
 *
 * Registers the `ui-tweaks` settings namespace so users can tune the
 * conversation UI either from the Settings panel or by editing the settings
 * document directly (settings.yaml `ui-tweaks:` section). All rendering work
 * happens in the browser bundle (`src/client`), which reads and writes this
 * namespace through the same-origin route mounted here — the Web settings RPC
 * only exposes a fixed allowlist of namespaces since rc.6, so a custom route is
 * the supported way for a plugin to own a configuration page.
 * @module dsh-ui-tweaks
 */

import type { Context } from '@deepseek-ai/cordis'
import {
  UI_TWEAKS_SETTINGS_NAMESPACE,
  Config,
} from './config.ts'
import { installTurnOutcomeProjection } from './turn-outcome.ts'
import { UITweaksWebBackend, installUITweaksWeb } from './web.ts'
import { GitBackend } from './git.ts'
import { installGitWeb } from './git-web.ts'
import { ArchiveBackend, installArchiveWeb } from './archive.ts'
import { McpBackend, installMcpWeb } from './mcp.ts'
import { SearchBackend, installSearchWeb } from './search-web.ts'
import { createSearchProvider, type SearchProviderConfig, type WebSearchSeam } from './search.ts'

export const name = 'dsh-ui-tweaks'

/** Required services: the settings seam is the whole server-side surface. */
export const inject = ['settings', 'web']

export function apply(ctx: Context): void {
  ctx.settings.register(UI_TWEAKS_SETTINGS_NAMESPACE, Config, {
    applies: 'live',
  })

  // The task notifier classifies turn endings (completed / aborted / failed)
  // through this session projection (same registration pattern as above).
  installTurnOutcomeProjection(ctx)

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
  // Bing market come live from the ui-tweaks settings document; engine API
  // keys resolve through the credentials center (~/.dsh/.credentials.yaml)
  // first, then the process environment.
  const web = ctx as Context & { web?: WebSearchSeam }
  const searchEnabledNow = (): boolean => {
    const row = ctx.settings.describe().find(candidate => candidate.ns === UI_TWEAKS_SETTINGS_NAMESPACE)
    return ((row?.value as { searchEnabled?: unknown } | undefined)?.searchEnabled) === true
  }
  if (web.web) {
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
    web.web.registerSearchProvider(provider)
    // Takeover only while the feature is enabled: registration alone must not
    // hijack web_search when the toggle is off. Runtime availability still
    // re-reads the setting live, so turning it off always wins.
    if (searchEnabledNow() && !web.web.searchProviderId) {
      web.web.searchProviderId = provider.id
    }
    // Startup reconcile: mirror the toggle into the profile patch so the
    // harness's built-in web_search is activated / restored even if the
    // setting was changed by hand (settings.yaml) between restarts.
    void searchBackend.syncSearchPatch(searchEnabledNow()).catch((error: unknown) => {
      ctx.logger.warn('[dsh-ui-tweaks] search patch sync failed: %s', error instanceof Error ? error.message : String(error))
    })
  } else {
    ctx.logger.warn('[dsh-ui-tweaks] web seam not found; built-in web_search stays on the stock backend')
  }

  ctx.logger.info('[dsh-ui-tweaks] settings namespace registered and Web routes mounted')
}
