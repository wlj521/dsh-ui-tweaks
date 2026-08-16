/**
 * dsh-ui-tweaks configuration: conversation font size (px), markdown table
 * style, dialog width, and the conversation timeline rail. Every field
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
  /** Markdown table presentation style. */
  tableStyle?: 'default' | 'claude'
  /**
   * Conversation column width in px. Legacy preset strings are still
   * accepted: `'default'` = 748, `'wide'` = 880.
   */
  dialogWidth?: number | 'default' | 'wide'
  /**
   * Whether the conversation timeline rail (right-side navigation to user
   * messages) is shown. Off by default; users turn it on in Settings. When
   * enabled, the rail hides itself while a session has fewer than two user
   * messages.
   */
  timelineEnabled?: boolean
}

export const MIN_DIALOG_WIDTH = 600
export const MAX_DIALOG_WIDTH = 1600
export const DEFAULT_DIALOG_WIDTH = 748

export const MIN_FONT_SIZE = 10
export const MAX_FONT_SIZE = 32
export const DEFAULT_FONT_SIZE = 16

/** Timeline defaults to off; the Settings segmented control turns it on. */
export const DEFAULT_TIMELINE_ENABLED = false

/** Configuration schema with documented defaults. */
export const Config: Schema<UITweaksConfig> = z.object({
  fontSize: z.number().min(10).max(32).default(16),
  tableStyle: z.union(['default', 'claude'] as const).default('default'),
  dialogWidth: z.union([z.number().min(MIN_DIALOG_WIDTH).max(MAX_DIALOG_WIDTH), z.const('default'), z.const('wide')]).default(DEFAULT_DIALOG_WIDTH),
  timelineEnabled: z.boolean().default(DEFAULT_TIMELINE_ENABLED),
})

/** Configuration after static validation, with every default materialized. */
export interface ResolvedUITweaksConfig {
  fontSize: number
  tableStyle: 'default' | 'claude'
  /** Dialog width in px (748 = the stock DSH column). */
  dialogWidth: number
  /** Whether the conversation timeline rail is shown. */
  timelineEnabled: boolean
}

/** Normalize a dialog width value (legacy strings included) to px. */
export function resolveDialogWidth(value: UITweaksConfig['dialogWidth'] | undefined): number {
  if (value === 'wide') return 880
  if (typeof value === 'number') return value
  return DEFAULT_DIALOG_WIDTH
}

/** Resolve a partial config into a fully defaulted value. */
export function resolveConfig(config: UITweaksConfig = {}): ResolvedUITweaksConfig {
  const fontSize = config.fontSize ?? DEFAULT_FONT_SIZE
  const tableStyle = config.tableStyle ?? 'default'
  const dialogWidth = resolveDialogWidth(config.dialogWidth)
  const timelineEnabled = config.timelineEnabled ?? DEFAULT_TIMELINE_ENABLED
  return { fontSize, tableStyle, dialogWidth, timelineEnabled }
}
