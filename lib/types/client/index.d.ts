/**
 * dsh-ui-tweaks — browser half.
 *
 * Reads and writes the `ui-tweaks` settings namespace through the same-origin
 * route served by the server half, applies the chosen code font size / table
 * style live via a runtime `<style>` element, and renders the Settings
 * panel section that edits them.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis';
interface TweaksValue {
    /** Code font size as a percentage of the stock 16px body (81 = stock). Legacy input. */
    codeFontScale?: number;
    /** Absolute code font size in px; wins over the legacy percentage. */
    codeFontSize?: number;
    /** Which timeline to show: 'native' (DSH built-in rail) or 'web' (plugin classic rail). Keep in sync with src/config.ts. */
    timelineStyle?: 'native' | 'web';
    /** Conversation theme: 'default' keeps the stock look; any other value applies that skin. Keep in sync with src/config.ts. */
    themeStyle?: 'default' | 'neon-lime';
    /** Preferred web-search engine (bing | ddg | exa | tavily | keenable | perplexity | deepseek). */
    searchEngine?: string;
    /** Bing market code (e.g. zh-CN). */
    bingMarket?: string;
    /** Whether the GitBar (branch / diff / commit pills) is shown. */
    gitBarEnabled?: boolean;
    /** Whether the Archive manager (sidebar entry above Settings) is shown. */
    archiveManagerEnabled?: boolean;
    /** Whether the MCP manager (Settings page listing MCP servers) is shown. */
    mcpManagerEnabled?: boolean;
    /** Whether the web-search takeover + 搜索 settings page are enabled. */
    searchEnabled?: boolean;
    /** Whether the /init slash command (AGENTS.md bootstrap prompt) is registered. */
    initCommandEnabled?: boolean;
    /** Whether the stats-line cache-hit figure keeps two decimals. Keep in sync with src/config.ts. */
    preciseCacheHitEnabled?: boolean;
    /** Whether task notifications are active. Keep in sync with src/config.ts. */
    notificationsEnabled?: boolean;
    /** Alert only while the tab is hidden or unfocused. */
    notifyOnlyWhenHidden?: boolean;
    /** Alert when a session completes its turn. */
    notifyOnComplete?: boolean;
    /** Alert when a session blocks on an approval, plan review or question. */
    notifyOnInteraction?: boolean;
    /** Blink an unread counter into the tab title. */
    notifyTitleFlash?: boolean;
    /** Fire desktop-level Web Notifications. */
    notifySystemNotification?: boolean;
    /** Play the synthesized two-note chime. */
    notifySound?: boolean;
}
declare const en: {
    readonly nav: "UI Tweaks";
    readonly settingsTitle: "UI Tweaks";
    readonly settingsIntro: "Tune the conversation UI — code size, tables and layout, plus optional features: git bar, archive & MCP managers and the /init command. Changes apply live.";
    readonly sectionText: "Text";
    readonly sectionLayout: "Layout";
    readonly sectionFeatures: "Features";
    readonly codeFontSize: "Code font size";
    readonly codeFontSizeHint: "Absolute code size in px (8–32); 13px is DSH's default at a 16px body. Applies to code blocks; inline code follows proportionally.";
    readonly timeline: "Timeline";
    readonly timelineHint: "Native: DSH’s built-in turn rail at the right edge (stock). Web (classic): the v0.11 right-side navigation rail — hover to preview, click to jump; auto-hidden in short conversations.";
    readonly timelineNative: "Native";
    readonly timelineWeb: "Web (classic)";
    readonly theme: "Theme";
    readonly themeHint: "Conversation skin. Default keeps DSH’s stock look; Neon poster is a two-scheme skin — paper-white with ink-black hairlines in light mode, near-black with light hairlines in dark mode, lime highlights and an Anthropic-red action accent, applied live.";
    readonly themeDefault: "Default";
    readonly themeNeonLime: "Neon poster";
    readonly sectionSearch: "Web search";
    readonly searchOn: "On";
    readonly searchOff: "Off";
    readonly searchEnabled: "Web search";
    readonly searchEnabledHint: "Takes over the built-in web_search tool with this plugin’s multi-engine provider, and adds a \"搜索\" settings page for the engine picker and per-platform API keys. Off restores the stock backend.";
    readonly searchNav: "Search";
    readonly searchTitle: "Web search";
    readonly searchIntro: "Pick the preferred engine for the built-in web_search tool; any engine that fails falls through to the next one automatically.";
    readonly sectionKeys: "API keys";
    readonly keyFree: "FREE";
    readonly keyOptional: "KEY OPTIONAL";
    readonly keyRequired: "KEY REQUIRED";
    readonly keyConfigured: "Configured";
    readonly keyNotConfigured: "Not configured";
    readonly keySave: "Save";
    readonly keyClear: "Clear";
    readonly keySaved: "Key saved.";
    readonly keyCleared: "Key cleared.";
    readonly keyEnvHint: "Keys are stored in the credentials center, one per line:";
    readonly searchTest: "Test engine";
    readonly searchTesting: "Testing…";
    readonly searchTestOk: "Engine works";
    readonly searchTestFail: "Engine failed";
    readonly searchEngine: "Search engine";
    readonly searchEngineHint: "Backend for the built-in web_search tool. Free engines (Bing, DuckDuckGo) need no key; Exa / Tavily / Keenable use their keyless anonymous quota without one; Perplexity and DeepSeek require a key.";
    readonly searchEngineBing: "Bing (free)";
    readonly searchEngineDdg: "DuckDuckGo (free)";
    readonly searchEngineExa: "Exa";
    readonly searchEngineTavily: "Tavily";
    readonly searchEngineKeenable: "Keenable";
    readonly searchEnginePerplexity: "Perplexity";
    readonly searchEngineDeepseek: "DeepSeek";
    readonly bingMarket: "Bing market";
    readonly bingMarketHint: "Market code for Bing results, e.g. zh-CN or en-US.";
    readonly searchKeysHint: "API keys live in ~/.dsh/.credentials.yaml, one per line: EXA_API_KEY / TAVILY_API_KEY / KEENABLE_API_KEY / PERPLEXITY_API_KEY / DEEPSEEK_API_KEY: sk-.... Keys resolve from the credentials center first, then environment variables.";
    readonly gitBar: "Git bar";
    readonly gitBarHint: "Branch / diff pills above the input inside git repos, with branch management and commit & push; auto-hidden outside git.";
    readonly gitBarOn: "On";
    readonly gitBarOff: "Off";
    readonly archiveManager: "Archive manager";
    readonly archiveManagerHint: "An Archive settings page to restore or permanently delete archived sessions.";
    readonly archiveManagerOn: "On";
    readonly archiveManagerOff: "Off";
    readonly mcpManager: "MCP manager";
    readonly mcpManagerHint: "An MCP settings page listing servers with status and tools; edit and restart them.";
    readonly mcpManagerOn: "On";
    readonly mcpManagerOff: "Off";
    readonly mcpNav: "MCP";
    readonly mcpTitle: "MCP servers";
    readonly mcpEmpty: "No MCP servers configured.";
    readonly mcpStatusActive: "Running";
    readonly mcpStatusFailed: "Failed";
    readonly mcpStatusLoading: "Loading";
    readonly mcpStatusStopped: "Stopped";
    readonly mcpStatusDisabled: "Disabled";
    readonly mcpTools: "tools";
    readonly mcpEnv: "Env";
    readonly mcpAdd: "Add server";
    readonly mcpAddTitle: "Add MCP server";
    readonly mcpEditTitle: "Edit MCP server";
    readonly mcpEdit: "Edit";
    readonly mcpDelete: "Delete";
    readonly mcpEnabledAction: "Enable";
    readonly mcpDisabledAction: "Disable";
    readonly mcpSaved: "Saved.";
    readonly mcpRemoved: "Removed.";
    readonly mcpFormTab: "Form";
    readonly mcpYamlTab: "YAML";
    readonly mcpYamlHint: "Fill in the MCP config directly (serverName / transport / command / args / env / toolCallTimeoutMs / url / headers …). It is validated before saving.";
    readonly mcpYamlPlaceholder: "serverName: my-server\ntransport: stdio\ncommand: npx\nargs:\n  - \"-y\"\n  - \"@some/mcp-server\"\nenv:\n  KEY: value\ntoolCallTimeoutMs: 60000";
    readonly mcpFieldId: "Instance ID";
    readonly mcpFieldIdHint: "Loader entry id (letters, digits, - and _ only); it must be unique.";
    readonly mcpFieldName: "Name";
    readonly mcpFieldNameHint: "Tool namespace `mcp__<name>__*`; letters, digits, - and _ (1–32).";
    readonly mcpFieldType: "Type";
    readonly mcpFieldTimeout: "Timeout (ms)";
    readonly mcpFieldCommand: "Command";
    readonly mcpFieldCommandPlaceholder: "e.g. npx";
    readonly mcpFieldArgs: "Arguments (one per line)";
    readonly mcpFieldEnv: "Environment vars (optional, KEY=value per line)";
    readonly mcpFieldUrl: "URL";
    readonly mcpFieldHeaders: "Headers (optional, Key: value per line)";
    readonly mcpFieldEnabled: "Enabled";
    readonly mcpSave: "Save";
    readonly mcpCancel: "Cancel";
    readonly mcpInvalidId: "Instance ID may only contain letters, digits, - and _.";
    readonly mcpInvalidName: "Name may only contain letters, digits, - and _ (1–32 chars).";
    readonly mcpInvalidTimeout: "Timeout must be a positive integer (ms).";
    readonly mcpInvalidUrl: "URL must start with http:// or https://.";
    readonly mcpInvalidCommand: "Command is required.";
    readonly mcpUnavailable: "MCP manager unavailable.";
    readonly mcpDisabledHint: "MCP management is off. Turn it on in 界面调整 (UI Tweaks) to view and restart MCP servers here.";
    readonly mcpEnable: "Enable MCP manager";
    readonly initCommand: "/init command";
    readonly initCommandHint: "The /init slash command: pick a prompt language and the agent analyzes the project and writes AGENTS.md.";
    readonly initCommandOn: "On";
    readonly initCommandOff: "Off";
    readonly preciseCacheHit: "Precise cache hit";
    readonly preciseCacheHitHint: "Rewrites the cache-hit figure in the stats line under the input box to two decimal places (e.g. 96.35%), computed from the raw cached-read / cached-write / uncached-input token buckets instead of the stock rounded integer.";
    readonly preciseCacheHitOn: "On";
    readonly preciseCacheHitOff: "Off";
    readonly sectionNotifications: "Task alerts";
    readonly notifications: "Enable alerts";
    readonly notificationsHint: "Call you back while the tab is in the background: a session finishes its turn, or one starts waiting for your approval, plan review or answer. The switches below apply only while this is on.";
    readonly notifyOn: "On";
    readonly notifyOff: "Off";
    readonly notifyOnComplete: "Alert on finish";
    readonly notifyOnCompleteHint: "Fire when a session ends its turn — completed, interrupted or failed; the notification says which.";
    readonly notifyOnInteraction: "Alert on interaction";
    readonly notifyOnInteractionHint: "Fire when a session waits on you: an approval, a plan review, or a question from the agent.";
    readonly notifyOnlyWhenHidden: "Only when hidden";
    readonly notifyOnlyWhenHiddenHint: "Stay quiet while you are looking at this page; alert only once the tab is hidden or unfocused.";
    readonly notifyTitleFlash: "Tab title flash";
    readonly notifyTitleFlashHint: "Blink an unread counter into the tab title until you come back.";
    readonly notifySystemNotification: "System notifications";
    readonly notifySystemNotificationHint: "Desktop-level notifications; click one to jump straight to that session. Permission is requested when enabled.";
    readonly notifySound: "Chime";
    readonly notifySoundHint: "A soft two-note motif — rising when work finishes, falling when it needs you.";
    readonly notifyTest: "Test";
    readonly notifyTitleDone: "Task finished";
    readonly notifyTitleAborted: "Task interrupted";
    readonly notifyTitleFailed: "Request failed";
    readonly notifyTitlePending: "Needs you";
    readonly bodyComplete: "✅ {title} finished its turn.";
    readonly bodyAborted: "⏹ {title} was interrupted before finishing.";
    readonly bodyFailed: "❌ {title} failed: {error}";
    readonly bodyApproval: "⏸ {title} is waiting for your approval.";
    readonly bodyPlan: "📋 {title} has a plan awaiting your review.";
    readonly bodyQuestion: "❓ {title} asked you a question.";
    readonly mcpServerDetail: "Configured in the profile cordis.patch.yml as @deepseek-ai/dsh-mcp-client instances; add / edit / disable / delete write to that file and apply live.";
    readonly archiveNav: "Archive";
    readonly archiveTitle: "Archived sessions";
    readonly archiveEmpty: "No archived sessions.";
    readonly archiveRestore: "Restore";
    readonly archiveRestoring: "Working…";
    readonly archiveDelete: "Delete";
    readonly archiveDeleteAll: "Delete all";
    readonly archiveRestoreAll: "Restore all";
    readonly archiveCount: "sessions";
    readonly archiveUnavailable: "Archive unavailable.";
    readonly archiveLiveError: "This session is running; close it before permanently deleting it.";
    readonly archiveDisabledHint: "Archive management is off. Turn it on in 界面调整 (UI Tweaks) to restore or permanently delete archived sessions here.";
    readonly archiveEnable: "Enable archive management";
    readonly archiveRestored: "Restored.";
    readonly railLabel: "Chat timeline";
    readonly roleUser: "User";
    readonly noText: "(no text)";
    readonly defaultAction: "Default";
    readonly reset: "Reset";
    readonly resetDone: "Reset to default.";
    readonly applied: "Applied";
    readonly unavailable: "Settings unavailable.";
    readonly loading: "Loading…";
    readonly readOnly: "The active Settings provider is read-only.";
    readonly saved: "Saved.";
    readonly commitMessage: "Commit";
    readonly diffFiles: "files";
    readonly branchLocal: "Local branches";
    readonly branchRemote: "Remote branches";
    readonly branchNew: "New branch";
    readonly branchNewPlaceholder: "Branch name, e.g. fix/typo";
    readonly branchRename: "Rename";
    readonly tagsTitle: "Tag";
    readonly tagCreate: "New Tag";
    readonly tagCreatePlaceholder: "Tag name, e.g. v1.2.0";
    readonly tagMessagePlaceholder: "Message (optional, makes it annotated)";
    readonly tagPush: "Push Tag";
    readonly tagDelete: "Delete Tag";
    readonly tagCommitPlaceholder: "Tag (optional)";
    readonly branchCreate: "Create";
    readonly diffView: "Code diff";
    readonly diffOnly: "Hunks";
    readonly diffFull: "Full file";
    readonly commitTitle: "Commit changes";
    readonly commitPlaceholder: "Describe your changes…";
    readonly commitHint: "Committing stages the checked files (untracked included) and commits; unchecked files are excluded from this commit. “Commit & push” also pushes; a new branch gets an -u upstream.";
    readonly commitWillCommit: "To commit";
    readonly commitViewDiff: "View";
    readonly commitEmpty: "Write a commit message first";
    readonly commitCancel: "Cancel";
    readonly commitSubmit: "Commit";
    readonly commitSubmitPush: "Commit & push";
    readonly commitBusy: "Task in progress — commit is unavailable while the agent is working.";
    readonly dirty: "Uncommitted changes";
    readonly clean: "Working tree clean";
    readonly noChanges: "No changes here.";
    readonly branchDelete: "Delete branch";
    readonly branchDeleteConfirm: "Confirm?";
    readonly branchRemoteDelete: "Delete remote branch";
    readonly branchFrom: "From branch";
    readonly branchFromHead: "Current HEAD (default)";
    readonly branchGraph: "Graph";
    readonly branchCancel: "Cancel";
    readonly branchRefresh: "Refresh";
    readonly graphTitle: "Commit graph";
    readonly graphColGraph: "Graph";
    readonly graphColCommit: "Commit";
    readonly graphColSubject: "Description";
    readonly graphColAuthor: "Author";
    readonly graphColDate: "Date";
    readonly branchPushRemote: "Push to remote";
    readonly branchPull: "Pull";
    readonly includeFile: "Include in commit";
    readonly excludeFile: "Exclude from commit";
    readonly terminal: "Terminal";
    readonly terminalGuide: "A persistent shell in the session working directory.";
    readonly diffGuide: "Review working-tree changes and commit.";
    readonly notRepo: "Not a git repository.";
    readonly termConnecting: "connecting…";
    readonly termExited: "shell exited";
    readonly termUnavailable: "PTY unavailable: node-pty failed to load on the host.";
    readonly termLost: "connection lost";
    readonly initDesc: "Analyze this project and generate an AGENTS.md for future coding agents";
    readonly initOptionZh: "AGENTS.md — Chinese prompt";
    readonly initOptionZhDetail: "Submit a Chinese prompt asking the agent to analyze the project and write or improve AGENTS.md.";
    readonly initOptionEn: "AGENTS.md — English prompt";
    readonly initOptionEnDetail: "Submit an English prompt asking the agent to analyze the project and write or improve AGENTS.md.";
    readonly initFailed: "/init failed to send the prompt";
};
type LocaleKey = keyof typeof en;
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        /** dsh-ui-tweaks Settings copy. */
        'ui-tweaks': LocaleKey;
    }
}
/** Client-side snapshot store fed by the same-origin Settings route. */
interface SettingsState {
    status: 'loading' | 'ready' | 'error';
    writable: boolean;
    value: TweaksValue | undefined;
    revision: number | undefined;
    error?: string;
}
/** Small external store shared by the Settings route and the CSS engine. */
export declare class SettingsClient {
    private state;
    private listeners;
    private generation;
    subscribe: (listener: () => void) => (() => void);
    getSnapshot: () => SettingsState;
    private publish;
    load(): Promise<void>;
    private post;
    set(field: string, value: unknown): Promise<void>;
    unset(field: string): Promise<void>;
}
/** Required client services: slots (settings.section), locale, sessions (git bar, archive, notifier), the slash-command registry, and the scope-addressed conversation face. The right-sidebar tab registry (terminal/diff tabs) is resolved lazily — older hosts without it still load everything else. */
export declare const inject: string[];
export declare function apply(ctx: ClientContext): void;
export {};
//# sourceMappingURL=index.d.ts.map