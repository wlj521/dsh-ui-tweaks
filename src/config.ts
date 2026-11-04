/**
 * dsh-ui-tweaks configuration: theme, timeline and feature toggles. Every
 * field defaults at the schema boundary, so a hand-edited settings document
 * and the Settings panel stay consistent.
 *
 * Code font size used to live here as `codeFontSize` / `codeFontScale`; DSH
 * now ships that control itself (ui-theme's `codeFontSize`, 10–16px), so the
 * plugin no longer owns it and emits no code-font tokens.
 * @module dsh-ui-tweaks/config
 */

import z from '@deepseek-ai/schemastery'

/** Settings document namespace owned by this plugin. */
export const UI_TWEAKS_SETTINGS_NAMESPACE = 'ui-tweaks'

/** Raw user-facing configuration (partial inputs receive schema defaults). */
export interface UITweaksConfig {
  /**
   * Which conversation timeline to show: `'native'` keeps DSH's built-in
   * turn-navigation rail (the stock behavior); `'web'` shows the plugin's
   * classic right-side user-message rail (hover to preview, click to jump)
   * and hides the native one. Defaults to `'native'`.
   */
  timelineStyle?: 'native' | 'web'
  /**
   * Conversation theme: `'default'` keeps DSH's stock look (no overrides);
   * `'particles'` applies the "Soft glow" skin — a tinted palette plus soft
   * accent glows radiating from the top and bottom edges toward the middle (no
   * animation), whose glow colour is chosen by `particleColor`. Skins are
   * applied live through the runtime stylesheet. Defaults to `'default'`, which
   * users can always return to.
   */
  themeStyle?: ThemeStyle
  /**
   * Glow colour of the "Soft glow" skin's accent halos. One of
   * `mint | electric | violet | sky | amber | coral | rose | silver`; only
   * meaningful while `themeStyle` is `'particles'`. Defaults to `'mint'`.
   */
  particleColor?: ParticleColor
  /**
   * Master switch for the web-search feature: when on, a dedicated "搜索"
   * Settings page appears (engine picker + per-engine API keys, stored in
   * ~/.dsh/.credentials.yaml) and the harness web_search backend is taken
   * over by this plugin. Off by default; the stock backend stays in place.
   */
  searchEnabled?: boolean
  /**
   * Preferred web-search engine backing the harness's `web_search` tool.
   * Free engines (bing / ddg) need no key; Exa, Tavily and Keenable fall back
   * to their keyless anonymous quota; Perplexity and DeepSeek require a key
   * in `~/.dsh/.credentials.yaml`.
   */
  searchEngine?: 'bing' | 'ddg' | 'exa' | 'tavily' | 'keenable' | 'perplexity' | 'deepseek'
  /** Bing market code (fixed options); only applies to the Bing engine. */
  bingMarket?: BingMarket
  /**
   * Whether the GitBar (branch / diff / commit-message pills above the input)
   * is shown. Off by default; the bar hides itself when the session has no
   * cwd or the directory is not a git repository.
   */
  gitBarEnabled?: boolean
  /**
   * Whether the Archive manager is shown: the "归档" Settings page that lists
   * archived sessions and can restore or permanently delete them. Off by
   * default; users turn it on in Settings.
   */
  archiveManagerEnabled?: boolean
  /**
   * Whether the MCP manager is shown: the "MCP 管理" Settings page that lists
   * the configured MCP servers (status, tool count) and can restart them. Off
   * by default; users turn it on in Settings.
   */
  mcpManagerEnabled?: boolean
  /**
   * Whether the `/init` slash command is registered: picking a prompt language
   * submits an AGENTS.md bootstrap prompt into the session. Off by default;
   * users turn it on in Settings.
   */
  initCommandEnabled?: boolean
  /**
   * Whether the composer stats line's cache-hit figure keeps two decimal
   * places ("缓存命中 96.35%"), computed client-side from the raw
   * cached-read / cached-write / uncached-input token buckets instead of
   * DSH's rounded integer. Off by default; users turn it on in Settings.
   */
  preciseCacheHitEnabled?: boolean
  /**
   * Master switch for task notifications: browser-side alerts (tab-title
   * flash, system notification, chime) raised when a session finishes its
   * turn or starts waiting on the user. Off by default; users turn it on in
   * Settings.
   */
  notificationsEnabled?: boolean
  /** Stay quiet while the page is visible and focused; alert only once hidden or unfocused. */
  notifyOnlyWhenHidden?: boolean
  /** Alert when a session ends its turn — completed, interrupted or failed. */
  notifyOnComplete?: boolean
  /** Alert when a session starts blocking on an approval, plan review or question. */
  notifyOnInteraction?: boolean
  /** Blink an unread counter into the tab title until the user returns. */
  notifyTitleFlash?: boolean
  /** Fire desktop-level Web Notifications; clicking one opens that session. */
  notifySystemNotification?: boolean
  /** Play a synthesized two-note chime (rising = done, falling = needs you). */
  notifySound?: boolean
}

/** Web search defaults to off; users turn it on in Settings. */
export const DEFAULT_SEARCH_ENABLED = false

/** Web search defaults to the free, most stable engine. */
export const DEFAULT_SEARCH_ENGINE = 'bing'
export const DEFAULT_BING_MARKET = 'zh-CN'

/** Markets offered in the Bing-market dropdown. */
export const BING_MARKET_OPTIONS = ['zh-CN', 'zh-HK', 'zh-TW', 'ja-JP', 'en-US', 'en-GB'] as const

/** Bing market code. */
export type BingMarket = (typeof BING_MARKET_OPTIONS)[number]

/** The timeline defaults to DSH's native turn rail — the stock behavior. */
export const DEFAULT_TIMELINE_STYLE: 'native' | 'web' = 'native'

/** The theme defaults to DSH's stock look — no overrides emitted. */
export const DEFAULT_THEME_STYLE: ThemeStyle = 'default'

/**
 * Conversation skin ids. `default` keeps DSH's stock look and can always be
 * restored; `particles` is the "Soft glow" skin (tinted palette + soft top/bottom
 * glow). Every id is a persisted value, so a new skin adds a member rather than
 * renaming one.
 */
export type ThemeStyle = 'default' | 'particles'

/** Glow colours offered by the Soft glow skin. */
export type ParticleColor = 'mint' | 'electric' | 'violet' | 'sky' | 'amber' | 'coral' | 'rose' | 'silver'

/** Ordered particle-colour options (also the Settings picker order). */
export const PARTICLE_COLOR_OPTIONS = ['mint', 'electric', 'violet', 'sky', 'amber', 'coral', 'rose', 'silver'] as const

/** The Soft glow skin defaults to a neutral, clean mint glow. */
export const DEFAULT_PARTICLE_COLOR: ParticleColor = 'mint'

/** GitBar defaults to off; users turn it on in Settings. */
export const DEFAULT_GITBAR_ENABLED = false

/** Archive manager defaults to off; users turn it on in Settings. */
export const DEFAULT_ARCHIVE_MANAGER_ENABLED = false

/** MCP manager defaults to off; users turn it on in Settings. */
export const DEFAULT_MCP_MANAGER_ENABLED = false

/** The /init slash command defaults to off; users turn it on in Settings. */
export const DEFAULT_INIT_COMMAND_ENABLED = false

/** The precise cache-hit readout defaults to off; users turn it on in Settings. */
export const DEFAULT_PRECISE_CACHE_HIT_ENABLED = false

/** Task notifications default to off; users turn them on in Settings. */
export const DEFAULT_NOTIFICATIONS_ENABLED = false

/** Notification behavior defaults: quiet while watched, both event kinds on. */
export const DEFAULT_NOTIFY_ONLY_WHEN_HIDDEN = true
export const DEFAULT_NOTIFY_ON_COMPLETE = true
export const DEFAULT_NOTIFY_ON_INTERACTION = true

/** Notification channel defaults: title flash + system notification on, chime opt-in. */
export const DEFAULT_NOTIFY_TITLE_FLASH = true
export const DEFAULT_NOTIFY_SYSTEM_NOTIFICATION = true
export const DEFAULT_NOTIFY_SOUND = false

/**
 * Configuration schema with documented defaults. Every field is marked
 * `.volatile()` (schemastery ≥3.18.3): since DSH 0.1.7 the Settings panel
 * derives each plugin's form from its exported `Config` schema, and only
 * volatile fields appear in the form (and stay editable without a remount).
 */
export const Config = z.object({
  timelineStyle: z.union(['native', 'web'] as const).default(DEFAULT_TIMELINE_STYLE).volatile(),
  themeStyle: z.union(['default', 'particles'] as const).default(DEFAULT_THEME_STYLE).volatile(),
  particleColor: z.union(PARTICLE_COLOR_OPTIONS).default(DEFAULT_PARTICLE_COLOR).volatile(),
  searchEnabled: z.boolean().default(DEFAULT_SEARCH_ENABLED).volatile(),
  searchEngine: z.union(['bing', 'ddg', 'exa', 'tavily', 'keenable', 'perplexity', 'deepseek'] as const).default(DEFAULT_SEARCH_ENGINE).volatile(),
  bingMarket: z.union(BING_MARKET_OPTIONS).default(DEFAULT_BING_MARKET).volatile(),
  gitBarEnabled: z.boolean().default(DEFAULT_GITBAR_ENABLED).volatile(),
  archiveManagerEnabled: z.boolean().default(DEFAULT_ARCHIVE_MANAGER_ENABLED).volatile(),
  mcpManagerEnabled: z.boolean().default(DEFAULT_MCP_MANAGER_ENABLED).volatile(),
  initCommandEnabled: z.boolean().default(DEFAULT_INIT_COMMAND_ENABLED).volatile(),
  preciseCacheHitEnabled: z.boolean().default(DEFAULT_PRECISE_CACHE_HIT_ENABLED).volatile(),
  notificationsEnabled: z.boolean().default(DEFAULT_NOTIFICATIONS_ENABLED).volatile(),
  notifyOnlyWhenHidden: z.boolean().default(DEFAULT_NOTIFY_ONLY_WHEN_HIDDEN).volatile(),
  notifyOnComplete: z.boolean().default(DEFAULT_NOTIFY_ON_COMPLETE).volatile(),
  notifyOnInteraction: z.boolean().default(DEFAULT_NOTIFY_ON_INTERACTION).volatile(),
  notifyTitleFlash: z.boolean().default(DEFAULT_NOTIFY_TITLE_FLASH).volatile(),
  notifySystemNotification: z.boolean().default(DEFAULT_NOTIFY_SYSTEM_NOTIFICATION).volatile(),
  notifySound: z.boolean().default(DEFAULT_NOTIFY_SOUND).volatile(),
})

/** Configuration after static validation, with every default materialized. */
export interface ResolvedUITweaksConfig {
  /** Which conversation timeline is shown: DSH's native rail or the plugin web rail. */
  timelineStyle: 'native' | 'web'
  /** Conversation theme: stock look or the Soft glow skin. */
  themeStyle: ThemeStyle
  /** Glow colour of the Soft glow skin's accent halos. */
  particleColor: ParticleColor
  /** Whether the web-search feature (Settings page + provider takeover) is on. */
  searchEnabled: boolean
  /** Preferred web-search engine id. */
  searchEngine: 'bing' | 'ddg' | 'exa' | 'tavily' | 'keenable' | 'perplexity' | 'deepseek'
  /** Bing market code. */
  bingMarket: BingMarket
  /** Whether the GitBar pills above the input are shown. */
  gitBarEnabled: boolean
  /** Whether the Archive manager sidebar entry is shown. */
  archiveManagerEnabled: boolean
  /** Whether the MCP manager Settings page is shown. */
  mcpManagerEnabled: boolean
  /** Whether the /init slash command is registered. */
  initCommandEnabled: boolean
  /** Whether the stats line's cache-hit figure keeps two decimals. */
  preciseCacheHitEnabled: boolean
  /** Whether task notifications (title flash / system notification / chime) are active. */
  notificationsEnabled: boolean
  /** Stay quiet while the page is visible and focused. */
  notifyOnlyWhenHidden: boolean
  /** Alert when a session ends its turn — completed, interrupted or failed. */
  notifyOnComplete: boolean
  /** Alert when a session blocks on an approval, plan review or question. */
  notifyOnInteraction: boolean
  /** Blink an unread counter into the tab title. */
  notifyTitleFlash: boolean
  /** Fire desktop-level Web Notifications. */
  notifySystemNotification: boolean
  /** Play the synthesized two-note chime. */
  notifySound: boolean
}

/** Resolve a partial config into a fully defaulted value. */
export function resolveConfig(config: UITweaksConfig = {}): ResolvedUITweaksConfig {
  const timelineStyle = config.timelineStyle ?? DEFAULT_TIMELINE_STYLE
  const themeStyle = config.themeStyle ?? DEFAULT_THEME_STYLE
  const particleColor = config.particleColor ?? DEFAULT_PARTICLE_COLOR
  const searchEnabled = config.searchEnabled ?? DEFAULT_SEARCH_ENABLED
  const searchEngine = config.searchEngine ?? DEFAULT_SEARCH_ENGINE
  const bingMarket = config.bingMarket ?? DEFAULT_BING_MARKET
  const gitBarEnabled = config.gitBarEnabled ?? DEFAULT_GITBAR_ENABLED
  const archiveManagerEnabled = config.archiveManagerEnabled ?? DEFAULT_ARCHIVE_MANAGER_ENABLED
  const mcpManagerEnabled = config.mcpManagerEnabled ?? DEFAULT_MCP_MANAGER_ENABLED
  const initCommandEnabled = config.initCommandEnabled ?? DEFAULT_INIT_COMMAND_ENABLED
  const preciseCacheHitEnabled = config.preciseCacheHitEnabled ?? DEFAULT_PRECISE_CACHE_HIT_ENABLED
  const notificationsEnabled = config.notificationsEnabled ?? DEFAULT_NOTIFICATIONS_ENABLED
  const notifyOnlyWhenHidden = config.notifyOnlyWhenHidden ?? DEFAULT_NOTIFY_ONLY_WHEN_HIDDEN
  const notifyOnComplete = config.notifyOnComplete ?? DEFAULT_NOTIFY_ON_COMPLETE
  const notifyOnInteraction = config.notifyOnInteraction ?? DEFAULT_NOTIFY_ON_INTERACTION
  const notifyTitleFlash = config.notifyTitleFlash ?? DEFAULT_NOTIFY_TITLE_FLASH
  const notifySystemNotification = config.notifySystemNotification ?? DEFAULT_NOTIFY_SYSTEM_NOTIFICATION
  const notifySound = config.notifySound ?? DEFAULT_NOTIFY_SOUND
  const resolved: ResolvedUITweaksConfig = { timelineStyle, themeStyle, particleColor, searchEnabled, searchEngine, bingMarket, gitBarEnabled, archiveManagerEnabled, mcpManagerEnabled, initCommandEnabled, preciseCacheHitEnabled, notificationsEnabled, notifyOnlyWhenHidden, notifyOnComplete, notifyOnInteraction, notifyTitleFlash, notifySystemNotification, notifySound }
  return resolved
}
