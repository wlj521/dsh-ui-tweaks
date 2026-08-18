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
   * Optional explicit `provider:model` for generating commit messages with the
   * LLM (e.g. `jiyuanlvdong:deepseek-v4-flash-0731`). When unset, the first
   * registered provider/model is used; when the LLM service is unavailable or
   * the call fails, a heuristic commit message is generated instead.
   */
  suggestModel?: string
}

export const MIN_DIALOG_WIDTH = 600
export const MAX_DIALOG_WIDTH = 1600
export const DEFAULT_DIALOG_WIDTH = 748

export const MIN_FONT_SIZE = 10
export const MAX_FONT_SIZE = 32
export const DEFAULT_FONT_SIZE = 16

/** Timeline defaults to off; the Settings segmented control turns it on. */
export const DEFAULT_TIMELINE_ENABLED = false

/** GitBar defaults to off; users turn it on in Settings. */
export const DEFAULT_GITBAR_ENABLED = false

/** Archive manager defaults to off; users turn it on in Settings. */
export const DEFAULT_ARCHIVE_MANAGER_ENABLED = false

/** Configuration schema with documented defaults. */
export const Config: Schema<UITweaksConfig> = z.object({
  fontSize: z.number().min(10).max(32).default(16),
  tableStyle: z.union(['default', 'claude'] as const).default('default'),
  dialogWidth: z.union([z.number().min(MIN_DIALOG_WIDTH).max(MAX_DIALOG_WIDTH), z.const('default'), z.const('wide')]).default(DEFAULT_DIALOG_WIDTH),
  timelineEnabled: z.boolean().default(DEFAULT_TIMELINE_ENABLED),
  gitBarEnabled: z.boolean().default(DEFAULT_GITBAR_ENABLED),
  archiveManagerEnabled: z.boolean().default(DEFAULT_ARCHIVE_MANAGER_ENABLED),
  suggestModel: z.string(),
})

/** Configuration after static validation, with every default materialized. */
export interface ResolvedUITweaksConfig {
  fontSize: number
  tableStyle: 'default' | 'claude'
  /** Dialog width in px (748 = the stock DSH column). */
  dialogWidth: number
  /** Whether the conversation timeline rail is shown. */
  timelineEnabled: boolean
  /** Whether the GitBar pills above the input are shown. */
  gitBarEnabled: boolean
  /** Whether the Archive manager sidebar entry is shown. */
  archiveManagerEnabled: boolean
  /** Optional `provider:model` override for LLM commit-message generation. */
  suggestModel?: string
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
  const gitBarEnabled = config.gitBarEnabled ?? DEFAULT_GITBAR_ENABLED
  const archiveManagerEnabled = config.archiveManagerEnabled ?? DEFAULT_ARCHIVE_MANAGER_ENABLED
  const resolved: ResolvedUITweaksConfig = { fontSize, tableStyle, dialogWidth, timelineEnabled, gitBarEnabled, archiveManagerEnabled }
  if (typeof config.suggestModel === 'string' && config.suggestModel !== '') {
    resolved.suggestModel = config.suggestModel
  }
  return resolved
}
