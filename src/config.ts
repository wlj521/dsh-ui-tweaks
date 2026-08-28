/**
 * dsh-ui-tweaks configuration: conversation font size (px), markdown table
 * style, and feature toggles. Every field
 * defaults at the schema boundary, so a hand-edited settings document and the
 * Settings panel stay consistent.
 * @module dsh-ui-tweaks/config
 */

import z from '@deepseek-ai/schemastery'
import type Schema from '@deepseek-ai/schemastery'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'

/** Settings document namespace owned by this plugin. */
export const UI_TWEAKS_SETTINGS_NAMESPACE = settingsNamespace('ui-tweaks')

/** Raw user-facing configuration (partial inputs receive schema defaults). */
export interface UITweaksConfig {
  /** Message content font size in px. */
  fontSize?: number
  /**
   * Code font size as a percentage of the message font size. 81 is the stock
   * ratio (13px code block at a 16px body); 100 makes code match the body.
   *
   * @deprecated Legacy percent input, kept for migration; prefer
   * `codeFontSize`. Ignored once `codeFontSize` is set.
   */
  codeFontScale?: number
  /**
   * Absolute code font size in px (8–32). 13 matches the stock DSH code block
   * at a 16px body. Drives the code block directly; inline code and the small
   * code font follow proportionally. When unset, falls back to the legacy
   * `codeFontScale` percentage, then to the stock default.
   */
  codeFontSize?: number
  /**
   * The "行高" base unit in px: the vertical rhythm of the reply area. It
   * drives the gap between message rows (Think ↔ tool cards, user ↔
   * assistant), the gap between content blocks inside one assistant reply
   * (Think ↔ text), the markdown text line-height, paragraph bottom margins,
   * and list margins — all scaled proportionally. 16 matches the stock DSH
   * spacing.
   */
  lineHeight?: number
  /** Markdown table presentation style. */
  tableStyle?: 'default' | 'claude'
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
   * Whether the whale working indicator is shown: a little brand whale
   * centered above the input box — translucent and still while the model is
   * idle, swimming while it works. Off by default; users turn it on in
   * Settings.
   */
  whaleIndicatorEnabled?: boolean
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
  /**
   * Optional explicit `provider:model` for generating commit messages with the
   * LLM (e.g. `jiyuanlvdong:deepseek-v4-flash-0731`). When unset, the first
   * registered provider/model is used; when the LLM service is unavailable or
   * the call fails, a heuristic commit message is generated instead.
   */
  suggestModel?: string
}

export const MIN_FONT_SIZE = 10
export const MAX_FONT_SIZE = 32
export const DEFAULT_FONT_SIZE = 16

/** 16px matches the stock DSH vertical rhythm (message/block gaps, etc.). */
export const MIN_LINE_HEIGHT = 0
export const MAX_LINE_HEIGHT = 64
export const DEFAULT_LINE_HEIGHT = 16

/** 81% = the stock code ratio (13px code block at a 16px body). Legacy input. */
export const MIN_CODE_FONT_SCALE = 50
export const MAX_CODE_FONT_SCALE = 150
export const DEFAULT_CODE_FONT_SCALE = 81

/** Absolute code font size (px): 13 is the stock DSH code block at a 16px body. */
export const MIN_CODE_FONT_SIZE = 8
export const MAX_CODE_FONT_SIZE = 32
export const DEFAULT_CODE_FONT_SIZE = 13

/** GitBar defaults to off; users turn it on in Settings. */
export const DEFAULT_GITBAR_ENABLED = false

/** Archive manager defaults to off; users turn it on in Settings. */
export const DEFAULT_ARCHIVE_MANAGER_ENABLED = false

/** MCP manager defaults to off; users turn it on in Settings. */
export const DEFAULT_MCP_MANAGER_ENABLED = false

/** The /init slash command defaults to off; users turn it on in Settings. */
export const DEFAULT_INIT_COMMAND_ENABLED = false

/** The whale working indicator defaults to off; users turn it on in Settings. */
export const DEFAULT_WHALE_INDICATOR_ENABLED = false

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

/** Configuration schema with documented defaults. */
export const Config: Schema<UITweaksConfig> = z.object({
  fontSize: z.number().min(10).max(32).default(16),
  codeFontScale: z.number().min(MIN_CODE_FONT_SCALE).max(MAX_CODE_FONT_SCALE).default(DEFAULT_CODE_FONT_SCALE),
  codeFontSize: z.number().min(MIN_CODE_FONT_SIZE).max(MAX_CODE_FONT_SIZE),
  lineHeight: z.number().min(MIN_LINE_HEIGHT).max(MAX_LINE_HEIGHT).default(DEFAULT_LINE_HEIGHT),
  tableStyle: z.union(['default', 'claude'] as const).default('default'),
  gitBarEnabled: z.boolean().default(DEFAULT_GITBAR_ENABLED),
  archiveManagerEnabled: z.boolean().default(DEFAULT_ARCHIVE_MANAGER_ENABLED),
  mcpManagerEnabled: z.boolean().default(DEFAULT_MCP_MANAGER_ENABLED),
  initCommandEnabled: z.boolean().default(DEFAULT_INIT_COMMAND_ENABLED),
  whaleIndicatorEnabled: z.boolean().default(DEFAULT_WHALE_INDICATOR_ENABLED),
  preciseCacheHitEnabled: z.boolean().default(DEFAULT_PRECISE_CACHE_HIT_ENABLED),
  notificationsEnabled: z.boolean().default(DEFAULT_NOTIFICATIONS_ENABLED),
  notifyOnlyWhenHidden: z.boolean().default(DEFAULT_NOTIFY_ONLY_WHEN_HIDDEN),
  notifyOnComplete: z.boolean().default(DEFAULT_NOTIFY_ON_COMPLETE),
  notifyOnInteraction: z.boolean().default(DEFAULT_NOTIFY_ON_INTERACTION),
  notifyTitleFlash: z.boolean().default(DEFAULT_NOTIFY_TITLE_FLASH),
  notifySystemNotification: z.boolean().default(DEFAULT_NOTIFY_SYSTEM_NOTIFICATION),
  notifySound: z.boolean().default(DEFAULT_NOTIFY_SOUND),
  suggestModel: z.string(),
})

/** Configuration after static validation, with every default materialized. */
export interface ResolvedUITweaksConfig {
  fontSize: number
  /** Code font size as a percentage of the message font size (legacy input). */
  codeFontScale: number
  /** Effective absolute code font size in px (codeFontSize, else legacy %, else stock). */
  codeFontSize: number
  /** Base vertical spacing (px) for the reply area ("行高"). */
  lineHeight: number
  tableStyle: 'default' | 'claude'
  /** Whether the GitBar pills above the input are shown. */
  gitBarEnabled: boolean
  /** Whether the Archive manager sidebar entry is shown. */
  archiveManagerEnabled: boolean
  /** Whether the MCP manager Settings page is shown. */
  mcpManagerEnabled: boolean
  /** Whether the /init slash command is registered. */
  initCommandEnabled: boolean
  /** Whether the whale working indicator above the input is shown. */
  whaleIndicatorEnabled: boolean
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
  /** Optional `provider:model` override for LLM commit-message generation. */
  suggestModel?: string
}

/** Resolve a partial config into a fully defaulted value. */
export function resolveConfig(config: UITweaksConfig = {}): ResolvedUITweaksConfig {
  const fontSize = config.fontSize ?? DEFAULT_FONT_SIZE
  const codeFontScale = config.codeFontScale ?? DEFAULT_CODE_FONT_SCALE
  // Effective code size: the absolute px input wins; otherwise derive px from
  // the legacy percentage at the resolved body size; otherwise stock.
  const codeFontSize = typeof config.codeFontSize === 'number'
    ? Math.min(MAX_CODE_FONT_SIZE, Math.max(MIN_CODE_FONT_SIZE, config.codeFontSize))
    : Math.max(8, Math.round(fontSize * (13 / 16) * (codeFontScale / DEFAULT_CODE_FONT_SCALE)))
  const lineHeight = config.lineHeight ?? DEFAULT_LINE_HEIGHT
  const tableStyle = config.tableStyle ?? 'default'
  const gitBarEnabled = config.gitBarEnabled ?? DEFAULT_GITBAR_ENABLED
  const archiveManagerEnabled = config.archiveManagerEnabled ?? DEFAULT_ARCHIVE_MANAGER_ENABLED
  const mcpManagerEnabled = config.mcpManagerEnabled ?? DEFAULT_MCP_MANAGER_ENABLED
  const initCommandEnabled = config.initCommandEnabled ?? DEFAULT_INIT_COMMAND_ENABLED
  const whaleIndicatorEnabled = config.whaleIndicatorEnabled ?? DEFAULT_WHALE_INDICATOR_ENABLED
  const preciseCacheHitEnabled = config.preciseCacheHitEnabled ?? DEFAULT_PRECISE_CACHE_HIT_ENABLED
  const notificationsEnabled = config.notificationsEnabled ?? DEFAULT_NOTIFICATIONS_ENABLED
  const notifyOnlyWhenHidden = config.notifyOnlyWhenHidden ?? DEFAULT_NOTIFY_ONLY_WHEN_HIDDEN
  const notifyOnComplete = config.notifyOnComplete ?? DEFAULT_NOTIFY_ON_COMPLETE
  const notifyOnInteraction = config.notifyOnInteraction ?? DEFAULT_NOTIFY_ON_INTERACTION
  const notifyTitleFlash = config.notifyTitleFlash ?? DEFAULT_NOTIFY_TITLE_FLASH
  const notifySystemNotification = config.notifySystemNotification ?? DEFAULT_NOTIFY_SYSTEM_NOTIFICATION
  const notifySound = config.notifySound ?? DEFAULT_NOTIFY_SOUND
  const resolved: ResolvedUITweaksConfig = { fontSize, codeFontScale, codeFontSize, lineHeight, tableStyle, gitBarEnabled, archiveManagerEnabled, mcpManagerEnabled, initCommandEnabled, whaleIndicatorEnabled, preciseCacheHitEnabled, notificationsEnabled, notifyOnlyWhenHidden, notifyOnComplete, notifyOnInteraction, notifyTitleFlash, notifySystemNotification, notifySound }
  if (typeof config.suggestModel === 'string' && config.suggestModel !== '') {
    resolved.suggestModel = config.suggestModel
  }
  return resolved
}
