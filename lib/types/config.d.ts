/**
 * dsh-ui-tweaks configuration: code font size (px), markdown table style, and
 * feature toggles. Every field defaults at the schema boundary, so a
 * hand-edited settings document and the Settings panel stay consistent.
 * @module dsh-ui-tweaks/config
 */
import type Schema from '@deepseek-ai/schemastery';
/** Settings document namespace owned by this plugin. */
export declare const UI_TWEAKS_SETTINGS_NAMESPACE = "ui-tweaks";
/** Raw user-facing configuration (partial inputs receive schema defaults). */
export interface UITweaksConfig {
    /**
     * Code font size as a percentage of the stock message font size (16px).
     * 81 is the stock ratio (13px code block at a 16px body); 100 makes code
     * match the body.
     *
     * @deprecated Legacy percent input, kept for migration; prefer
     * `codeFontSize`. Ignored once `codeFontSize` is set.
     */
    codeFontScale?: number;
    /**
     * Absolute code font size in px (8–32). 13 matches the stock DSH code block
     * at a 16px body. Drives the code block directly; inline code and the small
     * code font follow proportionally. When unset, falls back to the legacy
     * `codeFontScale` percentage, then to the stock default.
     */
    codeFontSize?: number;
    /**
     * Which conversation timeline to show: `'native'` keeps DSH's built-in
     * turn-navigation rail (the stock behavior); `'web'` shows the plugin's
     * classic right-side user-message rail (hover to preview, click to jump)
     * and hides the native one. Defaults to `'native'`.
     */
    timelineStyle?: 'native' | 'web';
    /**
     * Conversation theme: `'default'` keeps DSH's stock look (no overrides);
     * any other value applies that skin live through the runtime stylesheet.
     * Defaults to `'default'`.
     */
    themeStyle?: 'default' | 'neon-lime';
    /**
     * Master switch for the web-search feature: when on, a dedicated "搜索"
     * Settings page appears (engine picker + per-engine API keys, stored in
     * ~/.dsh/.credentials.yaml) and the harness web_search backend is taken
     * over by this plugin. Off by default; the stock backend stays in place.
     */
    searchEnabled?: boolean;
    /**
     * Preferred web-search engine backing the harness's `web_search` tool.
     * Free engines (bing / ddg) need no key; Exa, Tavily and Keenable fall back
     * to their keyless anonymous quota; Perplexity and DeepSeek require a key
     * in `~/.dsh/.credentials.yaml`.
     */
    searchEngine?: 'bing' | 'ddg' | 'exa' | 'tavily' | 'keenable' | 'perplexity' | 'deepseek';
    /** Bing market code (fixed options); only applies to the Bing engine. */
    bingMarket?: BingMarket;
    /**
     * Whether the GitBar (branch / diff / commit-message pills above the input)
     * is shown. Off by default; the bar hides itself when the session has no
     * cwd or the directory is not a git repository.
     */
    gitBarEnabled?: boolean;
    /**
     * Whether the Archive manager is shown: the "归档" Settings page that lists
     * archived sessions and can restore or permanently delete them. Off by
     * default; users turn it on in Settings.
     */
    archiveManagerEnabled?: boolean;
    /**
     * Whether the MCP manager is shown: the "MCP 管理" Settings page that lists
     * the configured MCP servers (status, tool count) and can restart them. Off
     * by default; users turn it on in Settings.
     */
    mcpManagerEnabled?: boolean;
    /**
     * Whether the `/init` slash command is registered: picking a prompt language
     * submits an AGENTS.md bootstrap prompt into the session. Off by default;
     * users turn it on in Settings.
     */
    initCommandEnabled?: boolean;
    /**
     * Whether the composer stats line's cache-hit figure keeps two decimal
     * places ("缓存命中 96.35%"), computed client-side from the raw
     * cached-read / cached-write / uncached-input token buckets instead of
     * DSH's rounded integer. Off by default; users turn it on in Settings.
     */
    preciseCacheHitEnabled?: boolean;
    /**
     * Master switch for task notifications: browser-side alerts (tab-title
     * flash, system notification, chime) raised when a session finishes its
     * turn or starts waiting on the user. Off by default; users turn it on in
     * Settings.
     */
    notificationsEnabled?: boolean;
    /** Stay quiet while the page is visible and focused; alert only once hidden or unfocused. */
    notifyOnlyWhenHidden?: boolean;
    /** Alert when a session ends its turn — completed, interrupted or failed. */
    notifyOnComplete?: boolean;
    /** Alert when a session starts blocking on an approval, plan review or question. */
    notifyOnInteraction?: boolean;
    /** Blink an unread counter into the tab title until the user returns. */
    notifyTitleFlash?: boolean;
    /** Fire desktop-level Web Notifications; clicking one opens that session. */
    notifySystemNotification?: boolean;
    /** Play a synthesized two-note chime (rising = done, falling = needs you). */
    notifySound?: boolean;
}
/** 81% = the stock code ratio (13px code block at a 16px body). Legacy input. */
export declare const MIN_CODE_FONT_SCALE = 50;
export declare const MAX_CODE_FONT_SCALE = 150;
export declare const DEFAULT_CODE_FONT_SCALE = 81;
/** Absolute code font size (px): 13 is the stock DSH code block at a 16px body. */
export declare const MIN_CODE_FONT_SIZE = 8;
export declare const MAX_CODE_FONT_SIZE = 32;
export declare const DEFAULT_CODE_FONT_SIZE = 13;
/** Web search defaults to off; users turn it on in Settings. */
export declare const DEFAULT_SEARCH_ENABLED = false;
/** Web search defaults to the free, most stable engine. */
export declare const DEFAULT_SEARCH_ENGINE = "bing";
export declare const DEFAULT_BING_MARKET = "zh-CN";
/** Markets offered in the Bing-market dropdown. */
export declare const BING_MARKET_OPTIONS: readonly ["zh-CN", "zh-HK", "zh-TW", "ja-JP", "en-US", "en-GB"];
/** Bing market code. */
export type BingMarket = (typeof BING_MARKET_OPTIONS)[number];
/** The timeline defaults to DSH's native turn rail — the stock behavior. */
export declare const DEFAULT_TIMELINE_STYLE: 'native' | 'web';
/** The theme defaults to DSH's stock look — no overrides emitted. */
export declare const DEFAULT_THEME_STYLE: 'default' | 'neon-lime';
/** GitBar defaults to off; users turn it on in Settings. */
export declare const DEFAULT_GITBAR_ENABLED = false;
/** Archive manager defaults to off; users turn it on in Settings. */
export declare const DEFAULT_ARCHIVE_MANAGER_ENABLED = false;
/** MCP manager defaults to off; users turn it on in Settings. */
export declare const DEFAULT_MCP_MANAGER_ENABLED = false;
/** The /init slash command defaults to off; users turn it on in Settings. */
export declare const DEFAULT_INIT_COMMAND_ENABLED = false;
/** The precise cache-hit readout defaults to off; users turn it on in Settings. */
export declare const DEFAULT_PRECISE_CACHE_HIT_ENABLED = false;
/** Task notifications default to off; users turn them on in Settings. */
export declare const DEFAULT_NOTIFICATIONS_ENABLED = false;
/** Notification behavior defaults: quiet while watched, both event kinds on. */
export declare const DEFAULT_NOTIFY_ONLY_WHEN_HIDDEN = true;
export declare const DEFAULT_NOTIFY_ON_COMPLETE = true;
export declare const DEFAULT_NOTIFY_ON_INTERACTION = true;
/** Notification channel defaults: title flash + system notification on, chime opt-in. */
export declare const DEFAULT_NOTIFY_TITLE_FLASH = true;
export declare const DEFAULT_NOTIFY_SYSTEM_NOTIFICATION = true;
export declare const DEFAULT_NOTIFY_SOUND = false;
/** Configuration schema with documented defaults. */
export declare const Config: Schema<UITweaksConfig>;
/** Configuration after static validation, with every default materialized. */
export interface ResolvedUITweaksConfig {
    /** Code font size as a percentage of the stock message font size (legacy input). */
    codeFontScale: number;
    /** Effective absolute code font size in px (codeFontSize, else legacy %, else stock). */
    codeFontSize: number;
    /** Which conversation timeline is shown: DSH's native rail or the plugin web rail. */
    timelineStyle: 'native' | 'web';
    /** Conversation theme: stock look or one of the plugin skins. */
    themeStyle: 'default' | 'neon-lime';
    /** Whether the web-search feature (Settings page + provider takeover) is on. */
    searchEnabled: boolean;
    /** Preferred web-search engine id. */
    searchEngine: 'bing' | 'ddg' | 'exa' | 'tavily' | 'keenable' | 'perplexity' | 'deepseek';
    /** Bing market code. */
    bingMarket: BingMarket;
    /** Whether the GitBar pills above the input are shown. */
    gitBarEnabled: boolean;
    /** Whether the Archive manager sidebar entry is shown. */
    archiveManagerEnabled: boolean;
    /** Whether the MCP manager Settings page is shown. */
    mcpManagerEnabled: boolean;
    /** Whether the /init slash command is registered. */
    initCommandEnabled: boolean;
    /** Whether the stats line's cache-hit figure keeps two decimals. */
    preciseCacheHitEnabled: boolean;
    /** Whether task notifications (title flash / system notification / chime) are active. */
    notificationsEnabled: boolean;
    /** Stay quiet while the page is visible and focused. */
    notifyOnlyWhenHidden: boolean;
    /** Alert when a session ends its turn — completed, interrupted or failed. */
    notifyOnComplete: boolean;
    /** Alert when a session blocks on an approval, plan review or question. */
    notifyOnInteraction: boolean;
    /** Blink an unread counter into the tab title. */
    notifyTitleFlash: boolean;
    /** Fire desktop-level Web Notifications. */
    notifySystemNotification: boolean;
    /** Play the synthesized two-note chime. */
    notifySound: boolean;
}
/** Resolve a partial config into a fully defaulted value. */
export declare function resolveConfig(config?: UITweaksConfig): ResolvedUITweaksConfig;
//# sourceMappingURL=config.d.ts.map