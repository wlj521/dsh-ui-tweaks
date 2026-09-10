window.__ModuleLoader__.load({ id: "dsh-ui-tweaks", factory: (require) => {
var __modules = Object.create(null); var __cache = Object.create(null);
__modules["./archive.js"] = function(module, exports, require, __load_) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ARCHIVE_CSS = void 0;
exports.installArchiveStyles = installArchiveStyles;
exports.ArchiveSection = ArchiveSection;
const jsx_runtime_1 = require("react/jsx-runtime");
/**
 * dsh-ui-tweaks — Archive manager (browser half).
 *
 * Renders the "归档" settings section (shown in the Settings dialog; usable
 * when the `archiveManagerEnabled` toggle in 界面调整 is on — otherwise it
 * shows an invite card with a one-click enable). The section lists every
 * archived session — enriched from the framework `useSessions` /
 * `useWorkspaces` feeds — with per-row actions and batch actions that go
 * through the same-origin archive route (`/_dsh/ui-tweaks/archive`):
 *
 * - **恢复** (Restore): remove the session from the archive set — its log and
 *   workspace slot are kept, so the conversation reappears in the normal
 *   sidebar list.
 * - **删除** (Delete): PERMANENTLY delete the session — the server removes its
 *   durable log, workspace accounting, archive-set entry and caches; the list
 *   then refreshes so the row (and the session itself) disappear.
 * - **全部恢复 / 全部删除**: the same actions for every archived session.
 *
 * Live (open/running) sessions are refused by the server; the client maps the
 * `session-live` error code to localized copy.
 * @module dsh-ui-tweaks/client/archive
 */
const react_1 = require("react");
/** Route matching the host half (src/archive.ts). */
const ARCHIVE_ROUTE = '/_dsh/ui-tweaks/archive';
/** Fetch one archive route call, attaching the server error code when present. */
async function archiveRequest(init) {
    const response = await fetch(ARCHIVE_ROUTE, { credentials: 'same-origin', ...init });
    let body;
    try {
        body = await response.json();
    }
    catch {
        // Non-JSON response (e.g. the route is not mounted yet) — fall through to
        // a clean error instead of a JSON-parse exception.
        body = undefined;
    }
    if (!response.ok || body === undefined || !body.ok) {
        const failure = body;
        const error = new Error(failure?.error?.message ?? `UI Tweaks archive request failed with HTTP ${response.status}`);
        error.code = failure?.error?.code;
        throw error;
    }
    return body.value;
}
/** Map a thrown archive error to user-facing copy. */
function errorMessage(error, t) {
    const code = error?.code;
    if (code === 'session-live')
        return t('archiveLiveError');
    return error instanceof Error ? error.message : String(error);
}
/** Re-pull the host session list after a permanent delete (the outward
 * ISessions face omits refresh; the concrete runtime provides it). */
function refreshSessions(sessionsService) {
    void sessionsService.refresh();
}
/** Workspace display title: the path's last non-empty segment. */
function basenameOf(path) {
    if (path === undefined || path === '')
        return '';
    const cleaned = path.replace(/[\\/]+$/u, '');
    const segments = cleaned.split(/[\\/]/u);
    return segments.at(-1) ?? '';
}
/** Locale-aware relative time for a past timestamp, e.g. "3小时前". */
function relativeTime(ms, now, formatter) {
    const diffSeconds = Math.round((ms - now) / 1000);
    const abs = Math.abs(diffSeconds);
    if (abs < 60)
        return formatter.format(diffSeconds, 'second');
    if (abs < 3600)
        return formatter.format(Math.round(diffSeconds / 60), 'minute');
    if (abs < 86400)
        return formatter.format(Math.round(diffSeconds / 3600), 'hour');
    if (abs < 604800)
        return formatter.format(Math.round(diffSeconds / 86400), 'day');
    return formatter.format(Math.round(diffSeconds / 604800), 'week');
}
exports.ARCHIVE_CSS = `
.dut-arc{display:grid;gap:12px;max-width:680px;padding:6px 2px 36px}
.dut-arc-head{display:flex;align-items:center;gap:10px;padding:14px 16px 0}
.dut-arc-head h2{margin:0;font-size:15px;font-weight:600;letter-spacing:-.01em;color:var(--dsw-alias-label-primary)}
.dut-arc-count{font-size:11.5px;color:var(--dsw-alias-label-secondary);padding:2px 8px;border-radius:999px;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1)}
.dut-arc-spacer{flex:1}
.dut-arc-btn{display:inline-flex;align-items:center;height:28px;padding:0 12px;border-radius:999px;border:1px solid var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;cursor:pointer;transition:background .15s ease,color .15s ease,border-color .15s ease}
.dut-arc-btn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dut-arc-btn:disabled{opacity:.5;cursor:default}
.dut-arc-btn.dut-arc-del:hover{border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary) 55%,transparent);color:var(--dsw-alias-state-error-primary);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 10%,transparent)}
.dut-arc-btn.dut-arc-confirm{border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary) 55%,transparent);color:var(--dsw-alias-state-error-primary);font-weight:600}
.dut-arc-body{display:grid;gap:2px;margin-top:4px}
.dut-arc-row{display:flex;align-items:center;gap:8px;padding:10px 16px;border-radius:12px}
.dut-arc-row:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dut-arc-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;text-align:left;background:transparent;border:none;padding:0;cursor:default;color:var(--dsw-alias-label-primary);font:inherit}
.dut-arc-title{font-size:13.5px;font-weight:600;white-space:nowrap;text-overflow:ellipsis;overflow:hidden}
.dut-arc-sub{font-size:11.5px;color:var(--dsw-alias-label-secondary);white-space:nowrap;text-overflow:ellipsis;overflow:hidden}
.dut-arc-empty{padding:32px 16px;text-align:center;font-size:12.5px;color:var(--dsw-alias-label-secondary)}
.dut-arc-alert{margin:8px 16px 0;padding:8px 12px;border-radius:10px;font-size:12px;line-height:1.5;background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 10%,transparent);color:var(--dsw-alias-state-error-primary)}
.dut-arc-off{padding:20px 16px;display:grid;gap:12px}
.dut-arc-off p{margin:0;font-size:12.5px;line-height:1.6;color:var(--dsw-alias-label-secondary)}
`;
/** Install the Archive stylesheet once (idempotent); returns the disposer. */
function installArchiveStyles() {
    const id = 'dsh-ui-tweaks-archive';
    const existing = document.querySelector(`style[data-plugin-css="${id}"]`);
    if (existing !== null)
        return () => { };
    const style = document.createElement('style');
    style.dataset.plugin = 'dsh-ui-tweaks';
    style.dataset.pluginCss = id;
    style.textContent = exports.ARCHIVE_CSS;
    document.head.appendChild(style);
    return () => { style.remove(); };
}
function ArchiveSection({ controller, t, sessionsService, useSessions, useWorkspaces }) {
    const settingsState = (0, react_1.useSyncExternalStore)(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
    const enabled = settingsState.value?.archiveManagerEnabled === true;
    const sessions = useSessions(state => state);
    const workspaces = useWorkspaces(state => state);
    const [confirmId, setConfirmId] = (0, react_1.useState)(null);
    const [confirmAll, setConfirmAll] = (0, react_1.useState)(false);
    const [busy, setBusy] = (0, react_1.useState)(null);
    const [error, setError] = (0, react_1.useState)(null);
    const timeFormatter = (0, react_1.useMemo)(() => new Intl.RelativeTimeFormat(navigator.language, { numeric: 'auto' }), []);
    const now = Date.now();
    (0, react_1.useEffect)(() => {
        if (confirmId === null)
            return;
        const timer = window.setTimeout(() => { setConfirmId(current => (current === confirmId ? null : current)); }, 3000);
        return () => { window.clearTimeout(timer); };
    }, [confirmId]);
    (0, react_1.useEffect)(() => {
        if (!confirmAll)
            return;
        const timer = window.setTimeout(() => { setConfirmAll(false); }, 3000);
        return () => { window.clearTimeout(timer); };
    }, [confirmAll]);
    const rows = (0, react_1.useMemo)(() => {
        const byId = sessions.byId;
        return workspaces.archivedSessionIds.map(id => ({ id, summary: byId[id] })).sort((a, b) => {
            const ta = a.summary?.updatedAt ?? 0;
            const tb = b.summary?.updatedAt ?? 0;
            return tb - ta;
        });
    }, [workspaces.archivedSessionIds, sessions.byId]);
    const run = (key, body, after) => {
        setBusy(key);
        setError(null);
        void archiveRequest({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        }).then(() => { after?.(); }).catch((reason) => {
            setError(errorMessage(reason, t));
        }).finally(() => { setBusy(current => (current === key ? null : current)); });
    };
    const restore = (id) => {
        run(`restore:${id}`, { action: 'restore', sessionId: id });
    };
    const remove = (id) => {
        if (confirmId !== id) {
            setConfirmId(id);
            return;
        }
        setConfirmId(null);
        run(`delete:${id}`, { action: 'delete', sessionId: id }, () => { refreshSessions(sessionsService); });
    };
    const restoreAll = () => {
        run('restore-all', { action: 'restore-all' });
    };
    const removeAll = () => {
        if (!confirmAll) {
            setConfirmAll(true);
            return;
        }
        setConfirmAll(false);
        run('delete-all', { action: 'delete-all' }, () => { refreshSessions(sessionsService); });
    };
    if (!enabled) {
        return ((0, jsx_runtime_1.jsx)("div", { className: "dut-arc", children: (0, jsx_runtime_1.jsxs)("div", { className: "dut-panel dut-arc-off", children: [(0, jsx_runtime_1.jsx)("p", { children: t('archiveDisabledHint') }), (0, jsx_runtime_1.jsx)("div", { children: (0, jsx_runtime_1.jsx)("button", { type: "button", className: "dut-btn dut-btn-active", onClick: () => {
                                void controller.set('archiveManagerEnabled', true).catch(() => { setError(t('unavailable')); });
                            }, children: t('archiveEnable') }) })] }) }));
    }
    return ((0, jsx_runtime_1.jsx)("div", { className: "dut-arc", children: (0, jsx_runtime_1.jsxs)("div", { className: "dut-panel", children: [(0, jsx_runtime_1.jsxs)("div", { className: "dut-arc-head", children: [(0, jsx_runtime_1.jsx)("h2", { children: t('archiveTitle') }), (0, jsx_runtime_1.jsxs)("span", { className: "dut-arc-count", children: [rows.length, " ", t('archiveCount')] }), (0, jsx_runtime_1.jsx)("span", { className: "dut-arc-spacer" }), rows.length > 1 ? ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsx)("button", { type: "button", className: "dut-arc-btn", disabled: busy !== null, onClick: restoreAll, children: busy === 'restore-all' ? t('archiveRestoring') : t('archiveRestoreAll') }), (0, jsx_runtime_1.jsx)("button", { type: "button", className: 'dut-arc-btn dut-arc-del' + (confirmAll ? ' dut-arc-confirm' : ''), disabled: busy !== null, onClick: removeAll, children: busy === 'delete-all' ? t('archiveDeleteAll') + '…' : confirmAll ? t('archiveDeleteAll') + '?' : t('archiveDeleteAll') })] })) : null] }), error !== null ? (0, jsx_runtime_1.jsx)("div", { className: "dut-arc-alert", children: error }) : null, (0, jsx_runtime_1.jsx)("div", { className: "dut-arc-body", children: rows.length === 0 ? ((0, jsx_runtime_1.jsx)("div", { className: "dut-arc-empty", children: t('archiveEmpty') })) : rows.map(row => {
                        const summary = row.summary;
                        const title = summary?.displayTitle ?? row.id;
                        const sub = [basenameOf(summary?.cwd), summary !== undefined ? relativeTime(summary.updatedAt, now, timeFormatter) : ''].filter(Boolean).join(' · ');
                        return ((0, jsx_runtime_1.jsxs)("div", { className: "dut-arc-row", children: [(0, jsx_runtime_1.jsxs)("div", { className: "dut-arc-main", title: title, children: [(0, jsx_runtime_1.jsx)("span", { className: "dut-arc-title", children: title }), sub !== '' ? (0, jsx_runtime_1.jsx)("span", { className: "dut-arc-sub", children: sub }) : null] }), (0, jsx_runtime_1.jsx)("button", { type: "button", className: "dut-arc-btn", disabled: busy !== null, onClick: () => { restore(row.id); }, children: busy === `restore:${row.id}` ? t('archiveRestoring') : t('archiveRestore') }), (0, jsx_runtime_1.jsx)("button", { type: "button", className: 'dut-arc-btn dut-arc-del' + (confirmId === row.id ? ' dut-arc-confirm' : ''), disabled: busy !== null, onClick: () => { remove(row.id); }, children: busy === `delete:${row.id}` ? t('archiveDelete') + '…' : confirmId === row.id ? t('archiveDelete') + '?' : t('archiveDelete') })] }, row.id));
                    }) })] }) }));
}
};
__modules["./cachehit.js"] = function(module, exports, require, __load_) {
"use strict";
/**
 * dsh-ui-tweaks — precise cache-hit readout (browser half).
 *
 * Rewrites the cache-hit figure in the composer stats line under the input
 * box ("缓存命中 96%" / "Cache hit 96%") to two decimal places ("96.35%").
 * DSH rounds the share before display (adding decimals only to avoid a false
 * 100%); the exact figure needs the raw token buckets, which this seat reads
 * through the framework's per-session projection hook
 * (`useProjection('tokenUsage')`) — the same durable whole-log totals the
 * stock number is computed from.
 *
 * - Mounted in `conversation.composer.dock` (the band under the composer card
 *   that hosts the shipped stats line), registered only while the
 *   `preciseCacheHitEnabled` toggle is on — off costs nothing. The entry
 *   renders nothing itself: it is a live reader that patches the stock text
 *   in place, so layout, truncation and tooltip behavior stay DSH's own.
 * - Since the stats-line redesign the figure is no longer wrapped in its own
 *   span: the usage pill renders it as a bare text node after a `·` separator
 *   inside the pill label (e.g. `105 tok·Cache hit 90%`), with the full
 *   reading mirrored on the pill button's `aria-label`, and the click-open
 *   usage dialog (portaled to `document.body`) repeats the figure in a
 *   `dl[data-session-stats-usage]` row. All three are patched; the per-turn
 *   `dl[data-turn-usage-details]` dialog is deliberately left alone — it uses
 *   its own per-turn denominator, not the session totals read here.
 * - A MutationObserver re-applies the precise figure whenever React repaints
 *   anything (token updates, pill churn, dialog open); writes are idempotent
 *   — a rewrite only happens when the text actually differs — so the loop
 *   settles after one pass. Toggling off restores the original texts.
 * @module dsh-ui-tweaks/client/cachehit
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PreciseCacheHitEntry = PreciseCacheHitEntry;
const react_1 = require("react");
/** Cache-hit label with its percentage, matched inside any host text. */
const CACHE_HIT_TEXT_PATTERN = /(?:缓存命中|Cache hit)\s*\d+(?:\.\d+)?%/;
/** The trailing percentage of such a label — the only part rewritten. */
const PERCENT_TAIL_PATTERN = /\d+(?:\.\d+)?%(?=\s*$)/;
/**
 * Sum the three disjoint prompt-side billing buckets — DSH's own denominator
 * for the cache-hit share (`uncachedInput + cacheRead + cacheWrite`).
 */
function billedInputTokens(usage) {
    return usage.uncachedInputTokens + usage.cacheReadTokens + usage.cacheWriteTokens;
}
/**
 * Rewrite the cache-hit figure inside a host string, preserving the label,
 * spacing and surrounding text (pill labels concatenate the token total in
 * front of the figure). Returns the input unchanged when it carries no
 * cache-hit label.
 */
function rewriteCacheHitText(current, precise) {
    if (!CACHE_HIT_TEXT_PATTERN.test(current))
        return current;
    return current.replace(PERCENT_TAIL_PATTERN, `${precise}%`);
}
/** Session-scoped composer-dock seat that keeps the stock cache-hit figure at two decimals. */
function PreciseCacheHitEntry({ useProjection }) {
    // The raw cumulative usage; undefined until the host's baseline/frame
    // carries the key — exactly when the stock line first shows the group.
    const usage = useProjection('tokenUsage');
    (0, react_1.useEffect)(() => {
        const bands = document.querySelectorAll('[data-slot="conversation.composer.dock"]');
        if (bands.length === 0)
            return;
        /** Original texts of nodes we rewrote, restored on cleanup. */
        const patchedText = new Map();
        /** Original aria-labels of pill buttons we rewrote. */
        const patchedAria = new Map();
        /** Original texts of usage-dialog cells we rewrote. */
        const patchedCells = new Map();
        /** Drop entries whose nodes React has since replaced. */
        const prune = () => {
            for (const node of [...patchedText.keys()]) {
                if (!node.isConnected)
                    patchedText.delete(node);
            }
            for (const el of [...patchedAria.keys()]) {
                if (!el.isConnected)
                    patchedAria.delete(el);
            }
            for (const el of [...patchedCells.keys()]) {
                if (!el.isConnected)
                    patchedCells.delete(el);
            }
        };
        /**
         * Two-decimal share over the raw buckets; null while there is nothing
         * precise to show (projection absent, or no billed input — the stock line
         * omits the group in that case too).
         */
        const precisePercent = () => {
            if (usage === undefined)
                return null;
            const billed = billedInputTokens(usage);
            if (!(billed > 0))
                return null;
            return ((usage.cacheReadTokens / billed) * 100).toFixed(2);
        };
        const applyToTextNode = (node, precise) => {
            const current = node.data;
            if (!CACHE_HIT_TEXT_PATTERN.test(current))
                return;
            if (precise === null) {
                // Projection gone (session switch race): undo any rewrite so the
                // stock figure shows again instead of a stale one.
                const original = patchedText.get(node);
                if (original !== undefined) {
                    if (original !== current)
                        node.data = original;
                    patchedText.delete(node);
                }
                return;
            }
            if (!patchedText.has(node))
                patchedText.set(node, current);
            const rewritten = rewriteCacheHitText(current, precise);
            if (rewritten !== current)
                node.data = rewritten;
        };
        const applyToAria = (el, precise) => {
            const current = el.getAttribute('aria-label') ?? '';
            if (!CACHE_HIT_TEXT_PATTERN.test(current))
                return;
            if (precise === null) {
                const original = patchedAria.get(el);
                if (original !== undefined) {
                    if (original !== current)
                        el.setAttribute('aria-label', original);
                    patchedAria.delete(el);
                }
                return;
            }
            if (!patchedAria.has(el))
                patchedAria.set(el, current);
            const rewritten = rewriteCacheHitText(current, precise);
            if (rewritten !== current)
                el.setAttribute('aria-label', rewritten);
        };
        const applyToDialog = (precise) => {
            // The usage dialog is portaled to document.body, outside the dock
            // bands. Its `缓存命中` / `Cache hit` row shows the same session-total
            // figure as the pill, so it gets the same rewrite. Per-turn dialogs
            // (`data-turn-usage-details`) are skipped: they use a per-turn
            // denominator this seat never reads.
            for (const dl of document.querySelectorAll('dl[data-session-stats-usage]')) {
                for (const dt of dl.querySelectorAll('dt')) {
                    const label = (dt.textContent ?? '').trim();
                    if (label !== '缓存命中' && label !== 'Cache hit')
                        continue;
                    const dd = dt.nextElementSibling;
                    if (dd === null || dd.tagName !== 'DD')
                        continue;
                    if (precise === null) {
                        const original = patchedCells.get(dd);
                        if (original !== undefined) {
                            if (dd.textContent !== original)
                                dd.textContent = original;
                            patchedCells.delete(dd);
                        }
                        continue;
                    }
                    if (!patchedCells.has(dd))
                        patchedCells.set(dd, dd.textContent ?? '');
                    const rewritten = `${precise}%`;
                    if (dd.textContent !== rewritten)
                        dd.textContent = rewritten;
                }
            }
        };
        const apply = () => {
            prune();
            const precise = precisePercent();
            for (const band of bands) {
                // Walk text nodes, not spans: the redesigned pills render the figure
                // as a bare text node after the `·` separator (older DSH wrapped the
                // whole group in its own span — its text node matches just the same).
                const walker = document.createTreeWalker(band, NodeFilter.SHOW_TEXT);
                let node = walker.nextNode();
                while (node !== null) {
                    applyToTextNode(node, precise);
                    node = walker.nextNode();
                }
                for (const el of band.querySelectorAll('[aria-label]')) {
                    applyToAria(el, precise);
                }
            }
            applyToDialog(precise);
        };
        apply();
        // React owns these text nodes: every repaint re-triggers us, and our own
        // idempotent writes settle after a single extra pass. The dialog lives
        // outside the bands (body portal), so the body itself is observed.
        const observer = new MutationObserver(apply);
        observer.observe(document.body, { childList: true, characterData: true, subtree: true });
        return () => {
            observer.disconnect();
            // Toggle-off/unmount must not leave a stale precise figure behind.
            for (const [node, original] of patchedText) {
                if (node.data !== original)
                    node.data = original;
            }
            patchedText.clear();
            for (const [el, original] of patchedAria) {
                if (el.getAttribute('aria-label') !== original)
                    el.setAttribute('aria-label', original);
            }
            patchedAria.clear();
            for (const [el, original] of patchedCells) {
                if (el.textContent !== original)
                    el.textContent = original;
            }
            patchedCells.clear();
        };
    }, [usage]);
    return null;
}
};
__modules["./effort.js"] = function(module, exports, require, __load_) {
"use strict";
/**
 * dsh-ui-tweaks — thinking-effort tint for the composer model seat (browser half).
 *
 * Tags every rendered thinking-effort label with its intensity band, so the
 * poster skin can paint it in a solid band color (Low green, Medium amber,
 * High blue, Max Codex-violet), and wash the hovered option row with a
 * left-to-right gradient in the same hue. Three surfaces are covered — the
 * `model · effort` trigger in `conversation.input.model`, the Effort cell
 * value in its dropdown menu root, and every option row in the menu's
 * effort pane (label span plus row button, the button carrying the band for
 * the background wash). Off / provider-Default / unrecognized names stay
 * the stock caption gray — a level we cannot place gets no color rather
 * than a wrong one; extend BAND_WORDS when a new adapter ships new names.
 *
 * - Effort levels are adapter-owned: DeepSeek advertises Off/Low/High/Max,
 *   pi-ai-backed providers offer off/minimal/low/medium/high/xhigh/max
 *   (shown capitalized), others e.g. Standard. Classification reads the
 *   rendered label text, never a fixed id vocabulary.
 * - The trigger renders model-name and effort spans in order (the chevron is
 *   an svg), so the trailing span is the effort label when present. The menu
 *   is portaled to document.body, outside the seat: each trigger's
 *   `aria-controls` names its menu element, which is how the watcher reaches
 *   it. Inside the menu, radios beside group sections are the model list
 *   (left alone); radios without sections are effort options.
 * - One MutationObserver re-tags on React repaints (model switch, effort
 *   change, session switch, menu open); writes are idempotent — an attribute
 *   is only touched when it actually changes — so the loop settles after one
 *   pass. Removed nodes take their tags with them; cleanup clears the rest.
 * - Mounted only while the neon-poster theme is active (see the effect in
 *   index.tsx): other themes have no rules for the tag and stay stock.
 * @module dsh-ui-tweaks/client/effort
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.classifyEffort = classifyEffort;
exports.installEffortTag = installEffortTag;
/**
 * Rendered effort names per band, matched case-insensitively after trimming.
 * DeepSeek advertises Off/Low/High/Max; pi-ai-backed providers offer
 * off/minimal/low/medium/high/xhigh/max (shown capitalized); others e.g.
 * Standard. Adapter names are English in practice; the Chinese entries cover
 * adapters that localize their level names.
 */
const BAND_WORDS = {
    low: ['low', 'minimal', 'mini', 'eco', 'fast', '低', '快速'],
    medium: ['medium', 'standard', 'balanced', 'moderate', '中', '标准'],
    high: ['high', 'deep', 'advanced', '高', '深度', '强'],
    max: ['max', 'maximum', 'ultra', 'extreme', 'highest', 'xhigh', '最高', '最强'],
};
/**
 * Names that state no intensity: the provider default (whose real level is
 * unknown to the viewer), an automatic choice, or thinking turned off.
 */
const NEUTRAL_WORDS = [
    'default',
    'provider default',
    'auto',
    'off',
    'none',
    'disabled',
    '默认',
    '自动',
    '关闭',
    '无',
];
/**
 * Place a rendered effort label on the intensity scale.
 * @param name - the effort label as shown (e.g. 'High').
 * @returns its band, or null to leave the stock caption untouched.
 */
function classifyEffort(name) {
    const normalized = name.trim().toLowerCase();
    if (normalized === '')
        return null;
    for (const word of NEUTRAL_WORDS) {
        if (normalized === word)
            return null;
    }
    for (const [band, words] of Object.entries(BAND_WORDS)) {
        if (words.includes(normalized))
            return band;
    }
    return null;
}
/** Attribute the tagger sets on effort label spans; the skin reads it. */
const EFFORT_ATTR = 'data-dut-effort';
/** Model triggers live in the input's model seat, wherever it is mounted. */
const MODEL_TRIGGER_SELECTOR = 'div[data-slot="conversation.input.model"] button';
/** Root-cell headings that name the effort row, in either shipped locale. */
const EFFORT_CELL_LABELS = new Set(['推理等级', 'Effort']);
/**
 * Tag (or untag) one label span; idempotent — untouched when already correct.
 * @param el - the label span, if the structure offered one.
 * @param present - whether this span is an effort label.
 */
function tagLabel(el, band) {
    if (!(el instanceof HTMLElement))
        return;
    if (band === null) {
        if (el.hasAttribute(EFFORT_ATTR))
            el.removeAttribute(EFFORT_ATTR);
        return;
    }
    if (el.getAttribute(EFFORT_ATTR) !== band)
        el.setAttribute(EFFORT_ATTR, band);
}
/**
 * Tag a model trigger's effort span: the trailing direct-child span, present
 * only while the model advertises reasoning levels.
 */
function applyToTrigger(button) {
    const spans = button.querySelectorAll(':scope > span');
    for (const span of spans) {
        const isEffort = spans.length >= 2 && span === spans[spans.length - 1];
        tagLabel(span, isEffort ? classifyEffort(span.textContent?.trim() ?? '') : null);
    }
}
/**
 * Tag one open model menu, reached through its trigger's aria-controls.
 * Radios beside group sections are the model list (left alone); radios
 * without sections are effort options; the root pane's Effort cell value
 * takes the current effort's band.
 */
function applyToMenu(menu) {
    const radios = menu.querySelectorAll('button[role="menuitemradio"]');
    const hasGroups = menu.querySelector('section[role="group"]') !== null;
    for (const radio of radios) {
        if (!(radio instanceof HTMLButtonElement))
            continue;
        if (hasGroups) {
            radio.removeAttribute(EFFORT_ATTR);
            for (const tagged of radio.querySelectorAll(`span[${EFFORT_ATTR}]`)) {
                tagged.removeAttribute(EFFORT_ATTR);
            }
            continue;
        }
        const copy = radio.querySelector(':scope > span');
        const band = classifyEffort(copy?.textContent?.trim() ?? '');
        tagLabel(copy, band);
        // The row button carries the same band so the skin can wash its
        // background on hover without :has selectors.
        if (band === null) {
            radio.removeAttribute(EFFORT_ATTR);
        }
        else if (radio.getAttribute(EFFORT_ATTR) !== band) {
            radio.setAttribute(EFFORT_ATTR, band);
        }
    }
    for (const cell of menu.querySelectorAll('button[role="menuitem"]')) {
        if (!(cell instanceof HTMLButtonElement))
            continue;
        const spans = cell.querySelectorAll(':scope > span');
        if (spans.length < 2)
            continue;
        const head = spans[0];
        const value = spans[spans.length - 1] ?? null;
        const isEffortCell = EFFORT_CELL_LABELS.has(head?.textContent?.trim() ?? '');
        tagLabel(value, isEffortCell ? classifyEffort(value?.textContent?.trim() ?? '') : null);
    }
}
/**
 * Watch every composer model trigger (and its open dropdown menu) and keep
 * the effort band tags current.
 * @returns cleanup: stops the observer and removes all tags set here.
 */
function installEffortTag() {
    const apply = () => {
        for (const button of document.querySelectorAll(MODEL_TRIGGER_SELECTOR)) {
            applyToTrigger(button);
            // The menu is portaled to document.body, outside the seat: the
            // trigger's aria-controls names its element while open.
            const menuId = button.getAttribute('aria-controls');
            const menu = menuId === null ? null : document.getElementById(menuId);
            if (menu !== null)
                applyToMenu(menu);
        }
    };
    apply();
    // React owns the trigger: every repaint re-triggers us, and the idempotent
    // writes settle after a single extra pass.
    const observer = new MutationObserver(apply);
    observer.observe(document.body, { childList: true, characterData: true, subtree: true });
    return () => {
        observer.disconnect();
        for (const tagged of document.querySelectorAll(`[${EFFORT_ATTR}]`)) {
            tagged.removeAttribute(EFFORT_ATTR);
        }
    };
}
};
__modules["./gitbar.js"] = function(module, exports, require, __load_) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GITBAR_CSS = void 0;
exports.installGitBarStyles = installGitBarStyles;
exports.warmGitStatus = warmGitStatus;
exports.GitWarmup = GitWarmup;
exports.BranchChipEntry = BranchChipEntry;
exports.DiffPanel = DiffPanel;
exports.DiffTabTitle = DiffTabTitle;
exports.TerminalPanel = TerminalPanel;
exports.installHeroChip = installHeroChip;
const jsx_runtime_1 = require("react/jsx-runtime");
/**
 * dsh-ui-tweaks — GitBar (browser half).
 *
 * Git integration for the conversation UI, all riding DSH-native surfaces:
 *
 * - **branch chip** (`conversation.session.header.actions`, beside the
 *   title): folder + current branch; opens a popup with local/remote
 *   branches, a new-branch field, and the commit graph.
 * - **terminal** (right-sidebar tab): a real PTY shell (xterm.js over a
 *   WebSocket to the host's persistent node-pty session), opened from the
 *   sidebar guide beside 文件.
 * - **diff** (right-sidebar tab): the changed-file list and per-file
 *   diff (changed hunks by default, whole file on toggle) in the same
 *   sidebar, keeping its commit band at the foot so committing works from
 *   the tab.
 *
 * Opening the project in external apps is DSH's own `open-in-app` header
 * button now, so this plugin no longer ships one.
 *
 * All colors ride the DSH theme tokens (`--dsw-alias-*`), so light and dark
 * both work. Each entry renders nothing when the setting is off; the diff tab
 * shows a not-a-repo note when the session has no git repository.
 * @module dsh-ui-tweaks/client/gitbar
 */
const react_1 = require("react");
const react_dom_1 = require("react-dom");
const client_1 = require("react-dom/client");
const graphlayout_ts_1 = __load_("./graphlayout.js");
/** Route prefix matching the host half (src/git-web.ts). */
const GIT_ROUTE = '/_dsh/ui-tweaks/git';
/** Poll interval for the status snapshot, in ms. */
const POLL_MS = 10000;
/** Default cap of the file list while its height is still automatic, in px. */
const FILES_AUTO_MAX = 150;
/** Floors for the two resizable diff-panel sections, in px. */
const MIN_FILES_H = 30;
const MIN_DIFF_H = 60;
const MIN_COMMIT_H = 62;
/** Share of the panel a dragged section may never exceed, so the diff survives. */
const SECTION_MAX = '45%';
/** One row's graph drawing: lane segments plus the commit dot. */
function GraphCell(props) {
    const width = Math.max(props.lanes, 1) * graphlayout_ts_1.GRAPH_LANE_W;
    const cx = (lane) => lane * graphlayout_ts_1.GRAPH_LANE_W + graphlayout_ts_1.GRAPH_LANE_W / 2;
    const half = graphlayout_ts_1.GRAPH_ROW_H / 2;
    return ((0, jsx_runtime_1.jsxs)("svg", { width: width, height: graphlayout_ts_1.GRAPH_ROW_H, viewBox: `0 0 ${width} ${graphlayout_ts_1.GRAPH_ROW_H}`, "aria-hidden": true, focusable: "false", children: [props.row.edges.map((edge, index) => {
                const key = `${edge.kind}:${edge.from}>${edge.to}:${index}`;
                if (edge.kind === 'pass') {
                    return (0, jsx_runtime_1.jsx)("line", { x1: cx(edge.from), y1: 0, x2: cx(edge.to), y2: graphlayout_ts_1.GRAPH_ROW_H, stroke: edge.color, strokeWidth: 2 }, key);
                }
                if (edge.kind === 'in') {
                    return (0, jsx_runtime_1.jsx)("line", { x1: cx(edge.from), y1: 0, x2: cx(edge.to), y2: half, stroke: edge.color, strokeWidth: 2 }, key);
                }
                // 'out' — from the dot down to the parent lane: straight when the edge
                // stays in its lane, an S-curve when it forks or merges across lanes.
                const x1 = cx(edge.from);
                const x2 = cx(edge.to);
                if (x1 === x2) {
                    return (0, jsx_runtime_1.jsx)("line", { x1: x1, y1: half, x2: x2, y2: graphlayout_ts_1.GRAPH_ROW_H, stroke: edge.color, strokeWidth: 2 }, key);
                }
                const bend = half + (graphlayout_ts_1.GRAPH_ROW_H - half) * 0.55;
                return ((0, jsx_runtime_1.jsx)("path", { d: `M ${x1} ${half} C ${x1} ${bend}, ${x2} ${bend}, ${x2} ${graphlayout_ts_1.GRAPH_ROW_H}`, fill: "none", stroke: edge.color, strokeWidth: 2, strokeLinecap: "round" }, key));
            }), (0, jsx_runtime_1.jsx)("circle", { cx: cx(props.row.dot), cy: half, r: 4, fill: props.row.color, style: { stroke: 'var(--dsw-alias-bg-layer-2)', strokeWidth: 1.5 } })] }));
}
async function apiGet(path) {
    const response = await fetch(path, { credentials: 'same-origin' });
    const body = await response.json();
    if (!response.ok || !body.ok) {
        const failure = body;
        throw new Error(failure.error?.message ?? `Git request failed with HTTP ${response.status}`);
    }
    return body.value;
}
async function apiPost(path, payload) {
    const response = await fetch(path, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    const body = await response.json();
    if (!response.ok || !body.ok) {
        const failure = body;
        throw new Error(failure.error?.message ?? `Git action failed with HTTP ${response.status}`);
    }
    return body.value;
}
function targetQuery(t) {
    if (t.session !== undefined)
        return `session=${encodeURIComponent(t.session)}`;
    if (t.ws !== undefined)
        return `ws=${encodeURIComponent(t.ws)}`;
    return '';
}
/** Basename of a cwd path ('' / undefined → '—'), for the chip's folder label. */
function basenameOf(path) {
    if (path === undefined || path === '')
        return '—';
    const norm = path.replace(/[\\/]+$/, '');
    const idx = Math.max(norm.lastIndexOf('\\'), norm.lastIndexOf('/'));
    return idx >= 0 ? norm.slice(idx + 1) : norm;
}
// ---------------------------------------------------------------------------
// GitBar styles — DSH theme tokens only (light + dark).
// ---------------------------------------------------------------------------
exports.GITBAR_CSS = `
/* DSH does not force border-box globally; normalize it for the whole GitBar
   subtree (including the body-portaled panels/modal), or widths overflow. */
.gbar,.gbar *,.gbar-view,.gbar-view *,.gbar-modal-wrap,.gbar-modal-wrap *,.gbar-notice,.gbar-notice *{box-sizing:border-box}
/* Anchor around each pill inside the composer tool row
   (conversation.input.left / .right): the branch pill's containing block, so
   its popup opens from the pill itself. flex:0 1 auto + min-width:0 let the
   pill compress when the row is squeezed instead of spilling over neighbours. */
.gbar{position:relative;display:inline-flex;align-items:center;gap:6px;flex:0 1 auto;min-width:0}
/* Pills match the input bar's resident chrome (access mode / model select):
   28px tall, fully-rounded, transparent at rest with a soft hover fill.
   overflow:hidden clips the pill's content while it compresses. */
.gbar-pill{
  display:inline-flex;align-items:center;gap:6px;
  height:28px;padding:0 8px;min-width:0;overflow:hidden;
  background:transparent;
  border:none;
  border-radius:24px;
  color:var(--dsw-alias-label-secondary);
  font:inherit;font-size:13px;font-weight:500;line-height:20px;
  cursor:pointer;
  transition:background .15s ease;
  white-space:nowrap;
  -webkit-user-select:none;user-select:none;
}
.gbar-pill:hover{background:var(--dsw-alias-interactive-bg-hover)}
.gbar-pill:focus-visible{background:var(--dsw-alias-interactive-bg-hover)}
/* Long branch names ellipsize instead of stretching the row. */
.gbar-pill .gbar-branch{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;max-width:140px}
/* Icons match the resident access-mode trigger exactly: 14px, full color,
   no fade, and box-centered (same vertical centre as the access icon). */
.gbar-pill .gbar-ico{width:14px;height:14px;flex:none;opacity:1}
.gbar-pill .gbar-caret{font-size:8px;color:var(--dsw-alias-label-tertiary);margin-left:1px}
.gbar-pill .gbar-dot{width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-state-warn-primary);flex:none}
.gbar-pill .gbar-add{color:var(--dsw-alias-state-success-primary);font-weight:600;font-variant-numeric:tabular-nums}
.gbar-pill .gbar-del{color:var(--dsw-alias-state-error-primary);font-weight:600;font-variant-numeric:tabular-nums}
.gbar-pill .gbar-meta{color:var(--dsw-alias-label-secondary)}
.gbar-pill .gbar-hint{color:var(--dsw-alias-label-tertiary);font-weight:400}
.gbar-pill.gbar-active{background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 12%,var(--dsw-alias-bg-module-platform));color:var(--dsw-alias-state-business-primary)}
.gbar-pill.gbar-active .gbar-hint{color:var(--dsw-alias-state-business-primary)}
.gbar-pill:disabled{opacity:.5;cursor:default}
/* The composer tool row is an inline-size container (DSH sets
   container-type:inline-size on it), so these container queries track the
   row's actual width. When the stretched diff panel pushes the conversation
   column and the row tightens — the same squeeze that makes the resident
   access / model chrome collapse its labels to icons — the pills follow suit
   instead of ever overlapping their neighbours: first drop the "· K 个文件"
   meta, then go icon-only (before the row gets narrow enough for the branch
   name to collide with the access control). */
@container (max-width: 700px){
  .gbar-pill .gbar-meta{display:none}
}
@container (max-width: 620px){
  .gbar-pill .gbar-text{display:none}
  .gbar-pill .gbar-caret{display:none}
}

/* branch popup — the chip lives in the session HEADER now, so the menu opens
   DOWNWARD (top-anchored, small arrow pointing up). Pinned header (current
   branch + worktree state) and pinned action bar surround a freely scrolling
   branch list. */
.gbar-pop{
  position:absolute;left:0;top:calc(100% + 8px);z-index:120;
  width:300px;
  background:var(--dsw-alias-bg-layer-1);
  border:1px solid var(--dsw-alias-border-l2);border-radius:14px;
  box-shadow:var(--dsw-shadow-lv2);
  display:flex;flex-direction:column;overflow:hidden;
  animation:gpop-down .16s cubic-bezier(.32,.72,0,1);
}
.gbar-pop::before{content:"";position:absolute;top:-5px;left:22px;width:9px;height:9px;
  background:var(--dsw-alias-bg-layer-1);border-left:1px solid var(--dsw-alias-border-l2);
  border-top:1px solid var(--dsw-alias-border-l2);transform:rotate(45deg)}
@keyframes gpop-down{from{opacity:0;transform:translateY(-5px)}to{opacity:1;transform:none}}
.gbar-pop-head{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-module-platform)}
.gbar-pop-head .gbar-bicon{width:14px;height:14px;flex:none}
.gbar-pop-head .gbar-curname{display:flex;align-items:center;gap:7px;min-width:0;font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary)}
.gbar-pop-head .gbar-curname .gbar-bicon{color:var(--dsw-alias-state-business-primary)}
.gbar-pop-head .gbar-curname>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gbar-pop-head .gbar-state{margin-left:auto;flex:none;display:flex;align-items:center;gap:6px;font-size:11px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}
.gbar-pop-head .gbar-dot{width:6px;height:6px;border-radius:50%;flex:none}
.gbar-pop-head .gbar-dot.gbar-dirty{background:var(--dsw-alias-state-warn-primary)}
.gbar-pop-head .gbar-dot.gbar-clean{background:var(--dsw-alias-state-success-primary)}
/* Pull-current-branch icon button at the popup header's right edge; hidden
   entirely when the branch has no upstream (nothing to pull from). */
.gbar-pop-head .gbar-pull{flex:none;display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border:none;border-radius:7px;padding:0;background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer;transition:background .12s ease,color .12s ease}
.gbar-pop-head .gbar-pull svg{width:13px;height:13px;display:block}
.gbar-pop-head .gbar-pull:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.gbar-pop-head .gbar-pull:disabled{opacity:.5;cursor:default}
.gbar-pop-body{max-height:min(330px,calc(100vh - 250px));overflow-y:auto;padding:3px 6px 5px;scrollbar-width:thin;scrollbar-color:color-mix(in srgb,var(--dsw-alias-label-tertiary) 35%,transparent) transparent}
.gbar-pop-body::-webkit-scrollbar{width:5px}
.gbar-pop-body::-webkit-scrollbar-track{background:transparent}
.gbar-pop-body::-webkit-scrollbar-thumb{background:color-mix(in srgb,var(--dsw-alias-label-tertiary) 35%,transparent);border-radius:4px}
.gbar-pop .gbar-sec{display:flex;align-items:center;gap:6px;font-size:10.5px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--dsw-alias-label-tertiary);padding:8px 9px 3px}
.gbar-pop .gbar-sec .gbar-count{margin-left:auto;font-size:10px;font-weight:500;letter-spacing:0;line-height:15px;color:var(--dsw-alias-label-tertiary);background:var(--dsw-alias-bg-module-platform);border-radius:999px;padding:0 7px}
.gbar-pop .gbar-loading{display:flex;align-items:center;justify-content:center;gap:8px;padding:14px 9px;font-size:12px;color:var(--dsw-alias-label-tertiary)}
.gbar-pop .gbar-row{
  display:flex;align-items:center;gap:8px;width:100%;
  padding:6px 8px;border:none;border-radius:8px;
  background:transparent;color:var(--dsw-alias-label-primary);
  font:inherit;font-size:12.5px;cursor:pointer;text-align:left;
  transition:background .12s ease;
}
.gbar-pop .gbar-row:hover{background:var(--dsw-alias-interactive-bg-hover)}
.gbar-pop .gbar-row.gbar-cur{color:var(--dsw-alias-state-business-primary);font-weight:600}
.gbar-pop .gbar-row .gbar-bicon{width:13px;height:13px;flex:none;color:var(--dsw-alias-label-tertiary);opacity:.85}
.gbar-pop .gbar-row.gbar-cur .gbar-bicon{color:var(--dsw-alias-state-business-primary);opacity:1}
.gbar-pop .gbar-row .gbar-check{margin-left:auto;color:var(--dsw-alias-state-business-primary);font-weight:700}
.gbar-pop .gbar-row .gbar-rm{flex:none;font-size:10px;line-height:15px;color:var(--dsw-alias-label-tertiary);background:var(--dsw-alias-bg-module-platform);border-radius:999px;padding:0 7px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:90px}
/* branch row wrapper: main switch button + delete button */
.gbar-pop .gbar-rowwrap{display:flex;align-items:center;gap:2px;border-radius:8px;transition:background .12s ease}
.gbar-pop .gbar-rowwrap:hover{background:var(--dsw-alias-interactive-bg-hover)}
.gbar-pop .gbar-rowwrap .gbar-row{background:transparent}
.gbar-pop .gbar-del{
  flex:none;display:inline-flex;align-items:center;justify-content:center;
  width:26px;height:26px;border:none;background:transparent;color:var(--dsw-alias-label-tertiary);
  font:inherit;font-size:10.5px;cursor:pointer;border-radius:7px;margin-right:4px;
  transition:color .12s ease,background .12s ease;
}
.gbar-pop .gbar-del svg{width:13px;height:13px;display:block}
.gbar-pop .gbar-del:hover{color:var(--dsw-alias-state-error-primary);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 10%,transparent)}
.gbar-pop .gbar-del.gbar-arm{width:auto;padding:0 8px;color:var(--dsw-alias-state-error-primary);font-weight:600;background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 10%,transparent)}
/* rename/create entry beside the delete one — neutral/hover-primary, so the
   eye keeps reading red strictly as "destructive"; also used by the tag rows
   and the graph table (both under .gbar-pop / .gbar-modal scopes) */
.gbar-pop .gbar-ren,.gbar-modal .gbar-ren{
  flex:none;display:inline-flex;align-items:center;justify-content:center;
  width:26px;height:26px;border:none;background:transparent;color:var(--dsw-alias-label-tertiary);
  cursor:pointer;border-radius:7px;margin-right:4px;
  transition:color .12s ease,background .12s ease;
}
.gbar-pop .gbar-ren svg,.gbar-modal .gbar-ren svg{width:13px;height:13px;display:block}
.gbar-pop .gbar-ren:hover,.gbar-modal .gbar-ren:hover{color:var(--dsw-alias-state-business-primary);background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 10%,transparent)}
.gbar-pop .gbar-ren:disabled,.gbar-modal .gbar-ren:disabled{opacity:.5;cursor:default}
.gbar-pushrow{display:flex;align-items:center;gap:7px;padding:0 8px 7px}
.gbar-pushrow .gbar-pushlabel{font-size:12px;color:var(--dsw-alias-label-secondary)}
.gbar-pop .gbar-newrow{display:flex;gap:6px;padding:8px 6px 6px}
.gbar-pop input{
  flex:1;min-width:0;height:32px;padding:0 11px;
  border:1px solid var(--dsw-alias-border-l2);border-radius:9px;
  background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);
  font:inherit;font-size:13px;outline:none;
}
.gbar-pop input:focus{border-color:var(--dsw-alias-state-business-primary)}
.gbar-pop input::placeholder{color:var(--dsw-alias-label-tertiary)}
.gbar-mini{
  flex:none;height:32px;padding:0 14px;border:none;border-radius:9px;
  background:var(--dsw-alias-state-business-primary);color:#fff;
  font:inherit;font-size:13px;font-weight:500;cursor:pointer;
}
.gbar-mini:hover{opacity:.92}
.gbar-mini:disabled{opacity:.5;cursor:default}

/* branch popup action entries (new branch / graph) — pinned below the
   scrolling list; the border-top separates it from the body. */
.gbar-actions{display:flex;gap:6px;padding:8px;border-top:1px solid var(--dsw-alias-border-l1)}
.gbar-act{
  flex:1;display:inline-flex;align-items:center;justify-content:center;gap:7px;
  height:34px;border:none;border-radius:10px;
  background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-primary);
  font:inherit;font-size:12.5px;font-weight:500;cursor:pointer;
}
.gbar-act:hover{background:var(--dsw-alias-interactive-bg-hover-solid)}
.gbar-act svg{width:14px;height:14px;opacity:.9;flex:none}
/* base-branch selector (new-branch dialog) */
.gbar-baserow{display:flex;align-items:center;gap:7px;padding:0}
.gbar-baselabel{font-size:12px;color:var(--dsw-alias-label-secondary);flex:none}
.gbar-base{
  flex:1;min-width:0;height:32px;padding:0 10px;
  border:1px solid var(--dsw-alias-border-l2);border-radius:9px;
  background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);
  font:inherit;font-size:12.5px;outline:none;cursor:pointer;
}
.gbar-base:focus{border-color:var(--dsw-alias-state-business-primary)}
.gbar-modal input{
  width:100%;height:38px;padding:0 13px;
  border:1px solid var(--dsw-alias-border-l2);border-radius:10px;
  background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);
  font:inherit;font-size:13.5px;outline:none;
}
.gbar-modal input:focus{border-color:var(--dsw-alias-state-business-primary)}
.gbar-modal input::placeholder{color:var(--dsw-alias-label-tertiary)}
.gbar-modal .gbar-head{padding-bottom:10px;border-bottom:1px solid var(--dsw-alias-border-l1)}
/* "push to remote" row becomes an inset card so it reads as one option group. */
.gbar-modal .gbar-pushrow{padding:9px 11px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-2)}
.gbar-modal .gbar-pushrow .gbar-pushlabel{font-size:12.5px;color:var(--dsw-alias-label-primary)}
.gbar-x:disabled{opacity:.5;cursor:default}
/* commit-graph dialog */
.gbar-modal.gbar-graph-modal{width:min(860px,calc(100vw - 40px));gap:10px}
/* Refresh sits immediately left of close, both pinned to the right edge: the
   refresh takes the auto margin (specificity .gbar-x.gbar-refresh beats the
   .gbar-x override below), close drops it so they stay adjacent. */
.gbar-modal.gbar-graph-modal .gbar-head .gbar-x.gbar-refresh{margin-left:auto}
.gbar-modal.gbar-graph-modal .gbar-head .gbar-x{margin-left:0}
.gbar-modal.gbar-graph-modal .gbar-x svg{width:15px;height:15px;display:block}
.gbar-graph-empty{padding:28px 12px;text-align:center;font-size:13px;color:var(--dsw-alias-label-tertiary)}
.gbar-graph-table{display:flex;flex-direction:column;max-height:min(60vh,540px);overflow:auto;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-2)}
/* Fixed row height so the per-row graph SVGs tile exactly — lane lines must
   read as continuous across rows. Body rows therefore separate by zebra +
   hover only: a 1px border would cut through the lane strokes. */
.gbar-graph-row{display:grid;grid-template-columns:auto 62px 1fr 96px 90px 26px;align-items:center;gap:8px;height:28px;padding:0 12px;transition:background .12s ease}
/* Zebra striping for scanability; the hover rule matches its specificity and
   comes later in the sheet, so pointing at a row still wins. */
.gbar-graph-row:not(.gbar-graph-head):nth-child(odd){background:color-mix(in srgb,var(--dsw-alias-bg-module-platform) 35%,transparent)}
.gbar-graph-row:not(.gbar-graph-head):hover{background:var(--dsw-alias-interactive-bg-hover)}
.gbar-graph-head{position:sticky;top:0;background:var(--dsw-alias-bg-module-platform);font-size:10.5px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--dsw-alias-label-tertiary);z-index:1;border-bottom:1px solid var(--dsw-alias-border-l1)}
.gbar-c-graph svg{display:block}
.gbar-c-hash code{font-family:var(--dsw-font-markdown-code-font-family,"SF Mono",Consolas,monospace);font-size:11px;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-module-platform);border-radius:6px;padding:2px 6px}
.gbar-c-subject{min-width:0;display:flex;align-items:center;gap:8px}
.gbar-subject{font-size:12.5px;color:var(--dsw-alias-label-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gbar-refs{flex:none;font-size:10.5px;color:var(--dsw-alias-state-business-primary);background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 12%,transparent);border-radius:999px;padding:1px 8px;white-space:nowrap;max-width:220px;overflow:hidden;text-overflow:ellipsis}
.gbar-c-author{font-size:12px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gbar-c-date{font-size:11.5px;color:var(--dsw-alias-label-tertiary);text-align:right;white-space:nowrap}
/* per-row tag action — hidden until the row is hovered, so the table stays calm */
.gbar-c-tag{display:inline-flex;justify-content:center}
.gbar-c-tag .gbar-ren{opacity:0;transition:opacity .12s ease,color .12s ease,background .12s ease}
.gbar-graph-row:hover .gbar-c-tag .gbar-ren,.gbar-c-tag .gbar-ren:focus-visible{opacity:1}

/* terminal / diff views — fill the native conversation-view tab: full height
   flex column; the inner head/body/foot sections keep their own rules. */
.gbar-view{
  position:relative;box-sizing:border-box;height:100%;min-height:0;
  display:flex;flex-direction:column;overflow:hidden;
  /* bg-base instead of bg-layer-1: in dark mode layer-1 (#232324) reads gray
     next to the conversation's base (#151517); base matches it exactly, and in
     light mode both aliases are #fff so nothing changes. */
  background:var(--dsw-alias-bg-base);
  color:var(--dsw-alias-label-primary);
  animation:gbar-in .18s cubic-bezier(.32,.72,0,1);
}
/* empty note (e.g. the diff tab without a git repository) */
.gbar-view-empty{flex:1;min-height:0;display:flex;align-items:center;justify-content:center;
  font-size:12px;color:var(--dsw-alias-label-tertiary)}
/* the xterm host stretches to the whole tab body below the slim head */
.gbar-view .gbar-term{flex:1;min-height:0}
/* uncommitted-changes dot in the diff tab chip — warn-primary, the same
   signal the branch chip's tooltip carries, so the dirty state reads on the
   tab strip without opening the tab */
.gbar-tab-dot{display:inline-block;width:6px;height:6px;border-radius:50%;
  background:var(--dsw-alias-state-warn-primary);margin-left:6px;vertical-align:1px;pointer-events:none}
@keyframes gbar-in{from{opacity:0;transform:translateX(14px)}to{opacity:1;transform:none}}
.gbar-side-head{display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid var(--dsw-alias-border-l1)}
.gbar-side-head .gbar-title{font-size:13.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gbar-side-head .gbar-sub{font-size:12px;color:var(--dsw-alias-label-tertiary);flex:none;font-variant-numeric:tabular-nums}
.gbar-side-head .gbar-sub .gbar-a{color:var(--dsw-alias-state-success-primary)}
.gbar-side-head .gbar-sub .gbar-d{color:var(--dsw-alias-state-error-primary)}
.gbar-side-head .gbar-spacer{flex:1}
.gbar-seg{display:inline-flex;padding:3px;gap:2px;border-radius:10px;background:var(--dsw-alias-bg-module-platform);flex:none}
.gbar-seg button{border:none;border-radius:8px;padding:4px 10px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;cursor:pointer}
.gbar-seg button.gbar-on{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);box-shadow:var(--dsw-shadow-lv1)}
.gbar-side-body{flex:1;overflow:hidden;display:flex;flex-direction:column;min-height:0}
/* The three stacked sections (files / diff / commit) are sized by drag: the two
   neighbours carry an explicit inline height and the diff pane absorbs whatever
   is left, so a drag can never overflow the panel. The dividing hairlines are
   painted by the splitters, not by the sections' own borders. */
.gbar-files{flex:none;overflow-y:auto;scrollbar-width:thin;scrollbar-color:color-mix(in srgb,var(--dsw-alias-label-tertiary) 35%,transparent) transparent}
.gbar-files::-webkit-scrollbar{width:5px}
.gbar-files::-webkit-scrollbar-thumb{background:color-mix(in srgb,var(--dsw-alias-label-tertiary) 35%,transparent);border-radius:4px}
/* horizontal drag splitters between the sections */
.gbar-vsplit{
  flex:none;position:relative;height:7px;
  cursor:row-resize;touch-action:none;-webkit-user-select:none;user-select:none;
}
.gbar-vsplit::after{
  content:"";position:absolute;left:0;right:0;top:3px;height:1px;
  background:var(--dsw-alias-border-l1);transition:background .15s ease,height .15s ease;
}
.gbar-vsplit:hover::after{background:var(--dsw-alias-border-l2);height:2px}
.gbar-vsplit.gbar-dragging::after{background:var(--dsw-alias-state-business-primary);height:2px}
.gbar-file{
  display:flex;align-items:center;gap:6px;width:100%;
  padding:3px 14px;background:transparent;
}
.gbar-file .gbar-file-main{
  flex:1;min-width:0;display:flex;align-items:center;gap:9px;
  padding:5px 4px;border:none;border-radius:7px;background:transparent;
  color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px;cursor:pointer;text-align:left;
}
.gbar-file .gbar-file-main:hover{background:var(--dsw-alias-interactive-bg-hover)}
.gbar-file.gbar-on .gbar-file-main{background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 9%,transparent);box-shadow:inset 2px 0 0 var(--dsw-alias-state-business-primary)}
.gbar-file.gbar-excl{opacity:.55}
.gbar-chk{
  flex:none;width:16px;height:16px;padding:0;
  border:1px solid var(--dsw-alias-border-l2);border-radius:5px;
  background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-state-business-primary);
  font-size:11px;line-height:1;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;
}
.gbar-chk:hover{border-color:var(--dsw-alias-state-business-primary)}
.gbar-chk.gbar-off{color:transparent}
.gbar-file .gbar-st{
  flex:none;min-width:17px;height:17px;padding:0 4px;
  display:inline-flex;align-items:center;justify-content:center;
  font-weight:700;font-size:10.5px;border-radius:5px;
}
.gbar-file .gbar-st.gbar-m{color:var(--dsw-alias-state-warn-primary);background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 13%,transparent)}
.gbar-file .gbar-st.gbar-a{color:var(--dsw-alias-state-success-primary);background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 13%,transparent)}
.gbar-file .gbar-st.gbar-d{color:var(--dsw-alias-state-error-primary);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 12%,transparent)}
.gbar-file .gbar-st.gbar-u{color:var(--dsw-alias-label-tertiary);background:var(--dsw-alias-bg-module-platform)}
.gbar-file .gbar-path{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:var(--dsw-font-markdown-code-font-family,"SF Mono",Consolas,monospace);font-size:12px}
/* Directory part dims, filename stays bright — GitHub-style path rendering. */
.gbar-file .gbar-path .gbar-dir{color:var(--dsw-alias-label-tertiary)}
.gbar-file .gbar-nums{flex:none;font-variant-numeric:tabular-nums;font-size:11.5px}
.gbar-file .gbar-nums .gbar-a{color:var(--dsw-alias-state-success-primary)}
.gbar-file .gbar-nums .gbar-d{color:var(--dsw-alias-state-error-primary)}
.gbar-diff{
  flex:1;min-height:0;overflow:auto;
  font-family:var(--dsw-font-markdown-code-font-family,"SF Mono",Consolas,monospace);font-size:12px;line-height:1.7;padding:8px 0;
  scrollbar-width:thin;scrollbar-color:color-mix(in srgb,var(--dsw-alias-label-tertiary) 35%,transparent) transparent;
}
.gbar-diff::-webkit-scrollbar{width:5px;height:5px}
.gbar-diff::-webkit-scrollbar-thumb{background:color-mix(in srgb,var(--dsw-alias-label-tertiary) 35%,transparent);border-radius:4px}
/* Hunk header: a centered pill strip (GitHub-style), gutter numbers hidden but
   still occupying space so the code column stays aligned. */
.gbar-diff .gbar-line.gbar-hunk{background:transparent;padding-top:7px;padding-bottom:3px}
.gbar-diff .gbar-line.gbar-hunk .gbar-ln{visibility:hidden}
.gbar-diff .gbar-line.gbar-hunk .gbar-code{color:var(--dsw-alias-state-business-primary)}
.gbar-diff .gbar-line{display:flex;align-items:center;min-height:21px;padding:0 14px 0 0;white-space:pre}
.gbar-diff .gbar-line .gbar-ln{flex:none;width:34px;text-align:right;padding-right:8px;color:var(--dsw-alias-label-tertiary);font-size:11px;-webkit-user-select:none;user-select:none}
.gbar-diff .gbar-line .gbar-ln+.gbar-ln{border-right:1px solid var(--dsw-alias-border-l1);margin-right:10px}
.gbar-diff .gbar-line .gbar-code{flex:1;white-space:pre;color:var(--dsw-alias-label-primary);padding-right:14px}
.gbar-diff .gbar-line.gbar-add{background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 13%,transparent);box-shadow:inset 2px 0 0 color-mix(in srgb,var(--dsw-alias-state-success-primary) 55%,transparent)}
.gbar-diff .gbar-line.gbar-add .gbar-ln{color:var(--dsw-alias-state-success-primary)}
.gbar-diff .gbar-line.gbar-del{background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 10%,transparent);box-shadow:inset 2px 0 0 color-mix(in srgb,var(--dsw-alias-state-error-primary) 50%,transparent)}
.gbar-diff .gbar-line.gbar-del .gbar-ln{color:var(--dsw-alias-state-error-primary)}
.gbar-diff .gbar-line.gbar-ctx .gbar-code{color:var(--dsw-alias-label-secondary)}
.gbar-diff .gbar-empty{display:flex;align-items:center;justify-content:center;min-height:140px;font-size:12px;color:var(--dsw-alias-label-tertiary)}
/* The hairline above the foot is drawn by the commit splitter that precedes it. */
.gbar-side-foot{flex:none;padding:8px 14px;font-size:11.5px;color:var(--dsw-alias-label-tertiary);display:flex;gap:8px;align-items:center}
.gbar-side-foot .gbar-dot{width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-state-warn-primary);flex:none}
/* commit row inside the diff panel — height is drag-adjustable, so the message
   field stretches to fill whatever the user gives this section. */
.gbar-side-commit{flex:none;min-height:0;overflow:hidden;display:flex;flex-direction:column;gap:7px;padding:9px 12px;border-top:1px solid var(--dsw-alias-border-l1)}
.gbar-side-commit .gbar-crow{flex:1;min-height:0;display:flex;align-items:stretch;gap:6px}
.gbar-side-commit textarea{
  flex:1;min-width:0;min-height:30px;padding:6px 10px;resize:none;
  border:1px solid var(--dsw-alias-border-l2);border-radius:8px;
  background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);
  font:inherit;font-size:12px;line-height:1.6;outline:none;overflow-y:auto;
}
.gbar-side-commit textarea:focus{border-color:var(--dsw-alias-state-business-primary)}
.gbar-side-commit textarea::placeholder{color:var(--dsw-alias-label-tertiary)}
/* optional tag input riding the commit buttons — same chrome as the textarea */
.gbar-taginput{
  flex:none;width:118px;height:28px;padding:0 10px;
  border:1px solid var(--dsw-alias-border-l2);border-radius:8px;
  background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);
  font:inherit;font-size:12px;outline:none;
}
.gbar-taginput:focus{border-color:var(--dsw-alias-state-business-primary)}
.gbar-taginput::placeholder{color:var(--dsw-alias-label-tertiary)}
.gbar-side-commit .gbar-actions{flex:none;display:flex;align-items:center;justify-content:flex-end;gap:6px}
.gbar-side-commit .gbar-btn{height:28px;padding:0 12px;font-size:12px;border-radius:8px}

/* commit modal */
.gbar-modal-wrap{
  position:fixed;inset:0;z-index:120;
  display:flex;align-items:center;justify-content:center;
  background:rgba(0,0,0,.35);
}
.gbar-modal{
  width:min(520px,calc(100vw - 40px));max-height:calc(100vh - 48px);overflow:hidden auto;
  background:var(--dsw-alias-bg-layer-1);
  border:1px solid var(--dsw-alias-border-l2);border-radius:16px;
  box-shadow:var(--dsw-shadow-lv2);
  padding:18px;
  display:flex;flex-direction:column;gap:12px;
  animation:gbar-in .18s cubic-bezier(.32,.72,0,1);
}
.gbar-modal .gbar-head{display:flex;align-items:center;gap:10px}
.gbar-modal .gbar-head .gbar-title{font-size:15px;font-weight:600}
.gbar-modal .gbar-head .gbar-branch{font-size:12px;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-module-platform);border-radius:999px;padding:3px 10px}
.gbar-modal .gbar-head .gbar-x{margin-left:auto;border:none;background:transparent;color:var(--dsw-alias-label-tertiary);font-size:16px;cursor:pointer;width:28px;height:28px;border-radius:8px}
.gbar-modal .gbar-head .gbar-x:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.gbar-modal textarea{
  width:100%;min-height:64px;height:auto;max-height:220px;resize:none;
  overflow-y:auto;scrollbar-width:none;
  border:1px solid var(--dsw-alias-border-l2);border-radius:12px;
  background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);
  font:inherit;font-size:14px;line-height:1.6;padding:10px 14px;outline:none;
}
.gbar-modal textarea::-webkit-scrollbar{display:none}
.gbar-modal textarea:focus{border-color:var(--dsw-alias-state-business-primary)}
.gbar-modal textarea::placeholder{color:var(--dsw-alias-label-tertiary)}
.gbar-modal .gbar-hint{font-size:12px;color:var(--dsw-alias-label-tertiary);line-height:1.6}
/* tag manager dialog — mirrors the popup row chrome inside a centered dialog */
.gbar-modal .gbar-rowwrap{display:flex;align-items:center;gap:2px;border-radius:8px;transition:background .12s ease}
.gbar-modal .gbar-rowwrap:hover{background:var(--dsw-alias-interactive-bg-hover)}
.gbar-modal .gbar-rowwrap .gbar-row{background:transparent}
.gbar-modal .gbar-row .gbar-bicon{width:13px;height:13px;flex:none;color:var(--dsw-alias-label-tertiary);opacity:.85}
.gbar-modal .gbar-row .gbar-rm{flex:none;font-size:10px;line-height:15px;color:var(--dsw-alias-label-tertiary);background:var(--dsw-alias-bg-module-platform);border-radius:999px;padding:0 7px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:90px}
.gbar-modal .gbar-loading{display:flex;align-items:center;justify-content:center;gap:8px;padding:14px 9px;font-size:12px;color:var(--dsw-alias-label-tertiary)}
.gbar-modal .gbar-del{flex:none;display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border:none;background:transparent;color:var(--dsw-alias-label-tertiary);font:inherit;font-size:10.5px;cursor:pointer;border-radius:7px;margin-right:4px;transition:color .12s ease,background .12s ease}
.gbar-modal .gbar-del svg{width:13px;height:13px;display:block}
.gbar-modal .gbar-del:hover{color:var(--dsw-alias-state-error-primary);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 10%,transparent)}
.gbar-modal .gbar-del.gbar-arm{width:auto;padding:0 8px;color:var(--dsw-alias-state-error-primary);font-weight:600;background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 10%,transparent)}
.gbar-tags-modal .gbar-tags-list{display:flex;flex-direction:column;gap:1px;max-height:280px;overflow-y:auto;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-2);padding:4px}
.gbar-tags-modal .gbar-tags-list .gbar-rowwrap .gbar-row{flex:1;min-width:0}
.gbar-modal .gbar-files-head{display:flex;align-items:center;gap:8px;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--dsw-alias-label-tertiary);margin-top:2px}
.gbar-modal .gbar-files-head .gbar-hint{font-size:11px;font-weight:400;text-transform:none;letter-spacing:0}
.gbar-modal .gbar-files{
  display:flex;flex-direction:column;gap:1px;max-height:132px;overflow-y:auto;
  border:1px solid var(--dsw-alias-border-l1);border-radius:10px;
  background:var(--dsw-alias-bg-layer-2);padding:4px;
}
.gbar-modal .gbar-file{
  display:flex;align-items:center;gap:6px;width:100%;
  padding:2px 6px;border-radius:7px;background:transparent;
}
.gbar-modal .gbar-file .gbar-file-main{
  padding:4px 4px;font-size:12px;border-radius:6px;
}
.gbar-modal .gbar-file .gbar-file-main:hover{background:var(--dsw-alias-interactive-bg-hover)}
.gbar-modal .gbar-file.gbar-on .gbar-file-main{background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 10%,transparent)}
.gbar-modal .gbar-file .gbar-path{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:var(--dsw-font-markdown-code-font-family,"SF Mono",Consolas,monospace);font-size:11.5px}
.gbar-modal .gbar-file .gbar-goto{flex:none;color:var(--dsw-alias-label-tertiary);font-size:10px}
.gbar-modal .gbar-file.gbar-on .gbar-goto{color:var(--dsw-alias-state-business-primary)}
.gbar-modal .gbar-foot{display:flex;align-items:center;justify-content:flex-end;gap:8px;margin-top:2px;flex-wrap:wrap}
.gbar-btn{
  height:34px;padding:0 16px;border:none;border-radius:10px;
  font:inherit;font-size:13.5px;cursor:pointer;
  display:inline-flex;align-items:center;gap:6px;
}
.gbar-btn.gbar-ghost{background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-primary)}
.gbar-btn.gbar-ghost:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-solid)}
.gbar-btn.gbar-soft{background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 12%,transparent);color:var(--dsw-alias-state-business-primary)}
.gbar-btn.gbar-soft:hover:not(:disabled){background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 18%,transparent)}
.gbar-btn.gbar-primary{background:var(--dsw-alias-state-business-primary);color:#fff;font-weight:500}
.gbar-btn.gbar-primary:hover:not(:disabled){opacity:.92}
/* Disabled buttons (e.g. while a task is running) must NOT light up on hover —
   they keep their muted look, though the tooltip hint still shows. */
.gbar-btn:disabled{opacity:.5;cursor:default}
.gbar-btn:disabled:hover{opacity:.5}
.gbar-notice{
  position:fixed;z-index:150;left:50%;bottom:28px;transform:translateX(-50%);
  max-width:min(520px,90vw);padding:9px 16px;border-radius:10px;font-size:12.5px;line-height:1.5;
  box-shadow:var(--dsw-shadow-lv2);animation:gbar-in .18s cubic-bezier(.32,.72,0,1);
}
.gbar-notice.gbar-ok{background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 16%,var(--dsw-alias-bg-layer-1));color:var(--dsw-alias-state-success-primary)}
.gbar-notice.gbar-err{background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 14%,var(--dsw-alias-bg-layer-1));color:var(--dsw-alias-state-error-primary)}
.gbar-spin{width:12px;height:12px;border-radius:50%;border:2px solid color-mix(in srgb,var(--dsw-alias-label-tertiary) 30%,transparent);border-top-color:currentColor;animation:gbar-spin .7s linear infinite}
@keyframes gbar-spin{to{transform:rotate(360deg)}}

/* branch capsule — the only interactive half of the header seat: 22px tall
   like the resident agent-preset badge (same 12px type), fully-rounded,
   quiet fill on hover, active tint while the popup is open. */
.gbar-chip{position:relative;display:inline-flex;align-items:center;gap:4px;height:22px;padding:0 9px;
  border:none;border-radius:16px;background:transparent;color:var(--dsw-alias-label-secondary);
  font:inherit;font-size:12px;font-weight:400;line-height:22px;cursor:pointer;white-space:nowrap;
  -webkit-user-select:none;user-select:none;transition:background .15s ease}
.gbar-chip:hover,.gbar-chip:focus-visible{background:var(--dsw-alias-interactive-bg-hover)}
.gbar-chip.gbar-open{background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 12%,var(--dsw-alias-bg-module-platform));color:var(--dsw-alias-state-business-primary)}
.gbar-chip svg{width:14px;height:14px;flex:none;opacity:.9}
.gbar-chip-dot{width:6px;height:6px;border-radius:50%;flex:none;pointer-events:none;
  background:var(--dsw-alias-state-warn-primary)}
.gbar-chip .gbar-bname{max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
/* folder label — plain context beside the capsule: NO background (not a
   capsule), not clickable and no hover, so only the branch carries the pill.
   Same 22px / 12px type as the agent-preset badge beside it, and like that
   label the folder name stays selectable so it can be copied with the mouse;
   cursor:auto lets the browser show the text caret over the selectable name,
   exactly like that label. */
.gbar-fchip{display:inline-flex;align-items:center;gap:4px;height:22px;padding:0 2px;
  color:var(--dsw-alias-label-secondary);
  font:inherit;font-size:12px;font-weight:400;line-height:22px;white-space:nowrap;
  -webkit-user-select:text;user-select:text;cursor:auto}
.gbar-fchip svg{width:14px;height:14px;flex:none;opacity:.9}
.gbar-fchip .gbar-folder{max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
/* wraps the interactive branch capsule so its popup anchors to the capsule,
   not to the whole folder + branch row */
.gbar-bwrap{position:relative;display:inline-flex;align-items:center}

/* terminal view body — follows the app theme surface (tokens live on body,
   and the panel portal renders inside body, so the var resolves); the xterm
   viewport is transparent, so this is also the terminal's own backdrop */
.gbar-term{flex:1;min-height:0;background:var(--dsw-alias-bg-base,#16161b);color:var(--dsw-alias-label-primary,#d6d6dc);cursor:text;
  font-family:var(--dsw-font-markdown-code-font-family,"SF Mono",Consolas,monospace);font-size:12px;line-height:1.75;
  padding:10px 14px;overflow:auto;scrollbar-width:thin}
.gbar-term:focus-visible{outline:none}
.gbar-term .gbar-ps1{color:#7d94ff}
.gbar-term .gbar-tcmd{color:#ffffff}
.gbar-term .gbar-tout{white-space:pre-wrap;word-break:break-all;opacity:.88}
.gbar-term .gbar-tdim{opacity:.45}
.gbar-term .gbar-terr{color:#ef6b70}
.gbar-term .gbar-tin{display:flex;align-items:baseline}
.gbar-term .gbar-tin input{flex:1;min-width:0;background:transparent;border:none;outline:none;color:#ffffff;
  font:inherit;font-size:12px;line-height:1.75;caret-color:#7d94ff;padding:0}

/* xterm host variant — the emulator fills the body and sizes itself via the
   fit addon, so the container clips instead of scrolling. */
.gbar-xterm{padding:4px 6px;overflow:hidden;cursor:normal}
.gbar-xterm .xterm{height:100%}
.gbar-xterm .xterm .xterm-viewport{background:transparent !important}

/* fatal terminal error banner (pty unavailable / socket refused) */
.gbar-term-error{position:absolute;left:12px;right:12px;bottom:12px;z-index:6;display:flex;align-items:center;gap:10px;
  padding:9px 12px;border-radius:10px;border:1px solid color-mix(in srgb,#ef6b70 45%,transparent);
  background:var(--dsw-alias-bg-base,#16161b);box-shadow:0 8px 24px rgba(0,0,0,.25)}
.gbar-term-error-text{flex:1;min-width:0;font-size:12px;color:var(--dsw-alias-label-primary);
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gbar-term-error button{border:1px solid var(--dsw-alias-border-l1);background:transparent;border-radius:7px;
  color:var(--dsw-alias-label-secondary);width:26px;height:26px;cursor:pointer;flex:none;font-size:13px}
.gbar-term-error button:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}

/* icon buttons in side-panel heads (half-screen toggle, diff refresh) */
.gbar-side-half{border:1px solid var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-tertiary);
  width:28px;height:28px;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;
  cursor:pointer;flex:none;transition:background .15s ease,color .15s ease,border-color .15s ease}
.gbar-side-half:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.gbar-side-half:disabled{opacity:.5;cursor:default}
.gbar-side-half.gbar-on{background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 12%,transparent);
  color:var(--dsw-alias-state-business-primary);border-color:color-mix(in srgb,var(--dsw-alias-state-business-primary) 40%,transparent)}
.gbar-side-half svg{width:15px;height:15px;display:block}

/* hero (new-session) floating chip wrapper */
.gbar-hero{position:fixed;z-index:110;transform:translateY(-50%);display:inline-flex;align-items:center;gap:6px}
@media (prefers-reduced-motion:reduce){.gbar-view,.gbar-modal,.gbar-notice,.gbar-pop{animation:none}}
`;
/** Install the GitBar stylesheet once (idempotent); returns the disposer. */
function installGitBarStyles() {
    const id = 'dsh-ui-tweaks-gitbar';
    const existing = document.querySelector(`style[data-plugin-css="${id}"]`);
    if (existing !== null)
        return () => { };
    const style = document.createElement('style');
    style.dataset.plugin = 'dsh-ui-tweaks';
    style.dataset.pluginCss = id;
    style.textContent = exports.GITBAR_CSS;
    document.head.appendChild(style);
    return () => { style.remove(); };
}
// ---------------------------------------------------------------------------
// Status / data plumbing.
// ---------------------------------------------------------------------------
/** Extract a short branch name for display (origin/main → main). */
function shortBranch(name) {
    const idx = name.lastIndexOf('/');
    return idx >= 0 && name.startsWith('origin/') ? name.slice(idx + 1) : name;
}
/** Branch names that must never be deletable (main/master). */
function isProtectedBranch(name) {
    return name === 'main' || name === 'master';
}
function statusLetter(status) {
    if (status === 'U')
        return 'U';
    return status.length > 1 ? status[0] ?? 'M' : status;
}
function statusClass(status) {
    const s = statusLetter(status);
    if (s === 'A')
        return 'gbar-a';
    if (s === 'D')
        return 'gbar-d';
    if (s === 'U')
        return 'gbar-u';
    return 'gbar-m';
}
// ---------------------------------------------------------------------------
// Git status polling hook (shared by both pills and both panels).
// ---------------------------------------------------------------------------
/**
 * Module-level snapshot cache keyed by target. Every useGitStatus instance
 * (branch chip, diff view, terminal view) reads and writes through it, so
 * a view mounting on tab switch starts from the warm snapshot the header
 * poller already fetched instead of a blank state — this is what makes the
 * diff view paint instantly instead of waiting for its own /status
 * round-trip.
 */
const snapshotCache = new Map();
// A localStorage mirror of this cache existed briefly and was retired; sweep
// away any copy an older build left behind in this browser.
try {
    window.localStorage.removeItem('dsh-ui-tweaks.git.snapshots.v1');
}
catch { /* storage unavailable */ }
/** In-flight warmups keyed by target, so the dock warmup and a mounting chip
 *  never double-fetch the same target. */
const warmInflight = new Map();
/**
 * Fetch a target's status into the shared cache WITHOUT rendering anything.
 *
 * The session-header chips mount only after the conversation projection
 * finishes loading — seconds on large inactive sessions — so their own fetch
 * would start just as late. This warmup runs from the input dock, which mounts
 * immediately on session switch: by the time the header chip appears it reads
 * a warm cache and paints folder+branch instantly.
 */
function warmGitStatus(target) {
    const key = target.session ?? target.ws ?? '';
    if (key === '' || snapshotCache.has(key) || warmInflight.has(key))
        return;
    const flight = apiGet(`${GIT_ROUTE}/status?${targetQuery(target)}`)
        .then(next => {
        // An unresolved answer (host still starting up) must not poison the
        // cache as a final "not a repo"; the mounting chip re-fetches anyway.
        if (!next.unresolved)
            snapshotCache.set(key, next);
    })
        .catch(() => {
        // Warmup is best-effort; the mounting chip re-fetches anyway.
    })
        .finally(() => { warmInflight.delete(key); });
    warmInflight.set(key, flight);
}
/** Input-dock seat for {@link warmGitStatus}: mounts immediately on session
 *  switch (long before the session header does) and kicks off the prefetch. */
function GitWarmup({ sessionId }) {
    (0, react_1.useEffect)(() => {
        warmGitStatus({ session: String(sessionId) });
    }, [sessionId]);
    return null;
}
/** Fast retry steps (ms) for the startup race: right after a restart the host
 *  has not materialized its session/workspace store yet, so the first /status
 *  answers `unresolved`. Without these the UI sat blank for a full POLL_MS. */
const RETRY_DELAYS_MS = [400, 800, 1600, 3200];
/** Upper bound on fast retries before falling back to the steady poll. */
const FAST_RETRY_MAX = 6;
/** Load the git snapshot on session change, then poll; returns [snapshot, refresh]. */
function useGitStatus(enabled, target) {
    const key = target.session ?? target.ws ?? '';
    // Lazy initializer: a freshly mounted panel is warm on its very first render.
    const [snapshot, setSnapshot] = (0, react_1.useState)(() => snapshotCache.get(key) ?? null);
    (0, react_1.useEffect)(() => {
        if (!enabled || key === '') {
            setSnapshot(null);
            return;
        }
        // A remount (panel open) must not regress to blank when the cache is warm.
        setSnapshot(snapshotCache.get(key) ?? null);
        let cancelled = false;
        let pollTimer;
        let retryTimer;
        let attempt = 0;
        // Whether a resolved snapshot exists for this target (cache or fetched).
        // Drives the cold-start chase: fast backoff only while it is false.
        let haveGood = snapshotCache.has(key);
        /** Store one fetch result. An `unresolved` answer is transient — never
         *  cached, never regressing an already-good snapshot. Returns whether a
         *  resolved answer landed. */
        const apply = (next) => {
            if (next.unresolved === true) {
                if (!cancelled && !haveGood)
                    setSnapshot(null);
                return false;
            }
            haveGood = true;
            attempt = 0;
            snapshotCache.set(key, next);
            if (!cancelled)
                setSnapshot(next);
            return true;
        };
        const refreshOnce = async () => {
            try {
                return apply(await apiGet(`${GIT_ROUTE}/status?${targetQuery(target)}`));
            }
            catch {
                // Transport/transient git failure: chase it too while no good snapshot
                // exists; afterwards keep showing the old one until the next poll.
                return haveGood;
            }
        };
        /** Cold-start chase: short backoff instead of idling a whole poll period. */
        const scheduleRetry = () => {
            if (cancelled || haveGood || attempt >= FAST_RETRY_MAX)
                return;
            const delay = RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)] ?? 3200;
            attempt += 1;
            retryTimer = window.setTimeout(() => {
                if (cancelled)
                    return;
                void refreshOnce().then(settled => { if (!settled)
                    scheduleRetry(); });
            }, delay);
        };
        void refreshOnce().then(settled => { if (!settled)
            scheduleRetry(); });
        pollTimer = window.setInterval(() => {
            if (document.visibilityState === 'visible')
                void refreshOnce();
        }, POLL_MS);
        return () => {
            cancelled = true;
            if (pollTimer !== undefined)
                clearInterval(pollTimer);
            if (retryTimer !== undefined)
                clearTimeout(retryTimer);
        };
    }, [enabled, key]);
    const refresh = (0, react_1.useCallback)(async () => {
        if (key === '')
            return;
        try {
            const next = await apiGet(`${GIT_ROUTE}/status?${targetQuery(target)}`);
            // Same rule as the hook body: an unresolved answer is transient and must
            // not evict a good snapshot or enter the cache.
            if (!next.unresolved) {
                snapshotCache.set(key, next);
                setSnapshot(next);
            }
        }
        catch {
            // Keep the previous snapshot on transient failures.
        }
    }, [target.session, target.ws]);
    return [snapshot, refresh];
}
function BranchChipEntry({ sessionId, sessionsService, controller, t }) {
    const settingsState = (0, react_1.useSyncExternalStore)(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
    const enabled = settingsState.value?.gitBarEnabled ?? true;
    const sessionStr = String(sessionId);
    const target = { session: sessionStr };
    // Folder straight off the live sessions list feed (the same rows the left
    // sidebar shows) — zero network, correct from the very first paint even
    // before /status answers.
    const list = sessionsService.list;
    const subscribeList = (0, react_1.useMemo)(() => list.subscribe.bind(list), [list]);
    const feedCwd = (0, react_1.useSyncExternalStore)(subscribeList, () => list.getSnapshot().byId[sessionId]?.cwd, () => undefined);
    const [snapshot, refresh] = useGitStatus(enabled, target);
    const [branchOpen, setBranchOpen] = (0, react_1.useState)(false);
    const [branches, setBranches] = (0, react_1.useState)(null);
    const [newBranchName, setNewBranchName] = (0, react_1.useState)('');
    const [pushToRemote, setPushToRemote] = (0, react_1.useState)(false);
    const [confirmDelete, setConfirmDelete] = (0, react_1.useState)(null);
    const [baseBranch, setBaseBranch] = (0, react_1.useState)('');
    const [newBranchOpen, setNewBranchOpen] = (0, react_1.useState)(false);
    const [renameTarget, setRenameTarget] = (0, react_1.useState)(null);
    const [renameName, setRenameName] = (0, react_1.useState)('');
    const [tags, setTags] = (0, react_1.useState)(null);
    const [tagName, setTagName] = (0, react_1.useState)('');
    const [tagMessage, setTagMessage] = (0, react_1.useState)('');
    const [tagsOpen, setTagsOpen] = (0, react_1.useState)(false);
    const [confirmTagDelete, setConfirmTagDelete] = (0, react_1.useState)(null);
    // Back-tag dialog: create a tag on an arbitrary commit picked from the graph.
    const [tagDialog, setTagDialog] = (0, react_1.useState)(null);
    const [tagDialogName, setTagDialogName] = (0, react_1.useState)('');
    const [tagDialogMessage, setTagDialogMessage] = (0, react_1.useState)('');
    const [graphOpen, setGraphOpen] = (0, react_1.useState)(false);
    const [graph, setGraph] = (0, react_1.useState)(null);
    const [graphBusy, setGraphBusy] = (0, react_1.useState)(false);
    // Lane layout is pure derived state — recompute only when a new graph lands.
    const graphLayout = (0, react_1.useMemo)(() => (graph === null ? null : (0, graphlayout_ts_1.layoutCommitGraph)(graph.commits)), [graph]);
    const [busy, setBusy] = (0, react_1.useState)(null);
    const [notice, setNotice] = (0, react_1.useState)(null);
    const branchRef = (0, react_1.useRef)(null);
    const branchPopRef = (0, react_1.useRef)(null);
    // Drop any open popup/dialog when the session or the toggle changes.
    (0, react_1.useEffect)(() => {
        if (!enabled || sessionStr === undefined) {
            setBranchOpen(false);
            setNewBranchOpen(false);
            setRenameTarget(null);
            setTagsOpen(false);
            setTagDialog(null);
            setConfirmTagDelete(null);
            setGraphOpen(false);
        }
    }, [enabled, sessionStr]);
    const showNotice = (kind, text) => {
        setNotice({ kind, text });
        window.setTimeout(() => setNotice(null), 4000);
    };
    const run = async (label, fn) => {
        if (busy !== null)
            return false;
        setBusy(label);
        try {
            await fn();
            return true;
        }
        catch (cause) {
            showNotice('err', cause instanceof Error ? cause.message : String(cause));
            return false;
        }
        finally {
            setBusy(null);
        }
    };
    const loadBranches = () => {
        if (sessionStr === undefined)
            return;
        void apiGet(`${GIT_ROUTE}/branches?${targetQuery(target)}`)
            .then(setBranches)
            .catch(cause => { showNotice('err', cause instanceof Error ? cause.message : String(cause)); });
    };
    const loadTags = () => {
        if (sessionStr === undefined)
            return;
        void apiGet(`${GIT_ROUTE}/tags?${targetQuery(target)}`)
            .then(setTags)
            .catch(cause => { showNotice('err', cause instanceof Error ? cause.message : String(cause)); });
    };
    const toggleBranch = () => {
        const next = !branchOpen;
        setBranchOpen(next);
        if (next) {
            loadBranches();
            loadTags();
        }
    };
    const pickBranch = (name) => {
        if (sessionStr === undefined || name === branches?.current)
            return;
        void run('checkout', async () => {
            await apiPost(`${GIT_ROUTE}/checkout`, { session: sessionStr, branch: name });
            setBranchOpen(false);
            await refresh();
            showNotice('ok', `→ ${name}`);
        });
    };
    // Pull the branch shown in the popup header — the button only renders when
    // an upstream exists, so what gets pulled is never ambiguous.
    const pullBranch = () => {
        if (sessionStr === undefined)
            return;
        const target = snapshot?.upstream ?? snapshot?.branch ?? '';
        void run('pull', async () => {
            await apiPost(`${GIT_ROUTE}/pull`, { session: sessionStr });
            setBranchOpen(false);
            await refresh();
            showNotice('ok', `⬇ ${target}`);
        });
    };
    const createBranch = () => {
        if (sessionStr === undefined || newBranchName.trim() === '')
            return;
        void run(pushToRemote ? 'create-push' : 'create', async () => {
            await apiPost(`${GIT_ROUTE}/create`, {
                session: sessionStr,
                name: newBranchName.trim(),
                base: baseBranch === '' ? undefined : baseBranch,
                push: pushToRemote,
            });
            setBranchOpen(false);
            setNewBranchOpen(false);
            setNewBranchName('');
            setPushToRemote(false);
            setBaseBranch('');
            await refresh();
            if (pushToRemote)
                showNotice('ok', `☁ ${newBranchName.trim()}`);
        });
    };
    const openNewBranch = () => {
        setNewBranchName('');
        setBaseBranch('');
        setPushToRemote(false);
        setNewBranchOpen(true);
    };
    // Rename dialog: the input starts as the old name, preselected so typing
    // replaces it. The current branch may be renamed (HEAD moves with it);
    // protected branches are rejected server-side and the entry is not drawn.
    const openRename = (name) => {
        setConfirmDelete(null);
        setRenameName(name);
        setRenameTarget(name);
    };
    const renameBranch = () => {
        if (sessionStr === undefined || renameTarget === null)
            return;
        const from = renameTarget;
        const to = renameName.trim();
        if (to === '' || to === from) {
            setRenameTarget(null);
            return;
        }
        void run('branch-rename', async () => {
            await apiPost(`${GIT_ROUTE}/branch-rename`, { session: sessionStr, name: from, newName: to });
            setRenameTarget(null);
            loadBranches();
            await refresh();
            showNotice('ok', `✎ ${from} → ${to}`);
        });
    };
    // --- tags -------------------------------------------------------------------
    // Created on HEAD from the Tag manager dialog, or on any graph row's commit
    // via the back-tag dialog. A filled message creates an annotated tag, an
    // empty one a lightweight pointer. Tags never ride a plain push — pushing
    // one is its own explicit action, mirroring git.
    const openTags = () => {
        loadTags();
        setTagsOpen(true);
    };
    const createTagOnHead = () => {
        if (sessionStr === undefined)
            return;
        const name = tagName.trim();
        if (name === '')
            return;
        const message = tagMessage.trim();
        void run('tag-create', async () => {
            await apiPost(`${GIT_ROUTE}/tag-create`, {
                session: sessionStr,
                name,
                ...(message !== '' ? { message } : {}),
            });
            setTagName('');
            setTagMessage('');
            loadTags();
            showNotice('ok', `🏷 ${name}`);
        });
    };
    const openTagDialog = (ref, hash) => {
        setTagDialogName('');
        setTagDialogMessage('');
        setTagDialog({ ref, hash });
    };
    const createTagOnRef = () => {
        if (sessionStr === undefined || tagDialog === null)
            return;
        const name = tagDialogName.trim();
        if (name === '')
            return;
        const message = tagDialogMessage.trim();
        void run('tag-create', async () => {
            await apiPost(`${GIT_ROUTE}/tag-create`, {
                session: sessionStr,
                name,
                ref: tagDialog.ref,
                ...(message !== '' ? { message } : {}),
            });
            setTagDialog(null);
            loadTags();
            fetchGraph();
            showNotice('ok', `🏷 ${name}`);
        });
    };
    const pushTag = (name) => {
        if (sessionStr === undefined)
            return;
        void run('tag-push', async () => {
            await apiPost(`${GIT_ROUTE}/tag-push`, { session: sessionStr, name });
            showNotice('ok', `☁ ${name}`);
        });
    };
    // Two-step tag deletion, same pattern as branch deletion.
    const deleteTag = (name) => {
        if (sessionStr === undefined)
            return;
        if (confirmTagDelete === name) {
            setConfirmTagDelete(null);
            void run('tag-delete', async () => {
                await apiPost(`${GIT_ROUTE}/tag-delete`, { session: sessionStr, name });
                loadTags();
                showNotice('ok', `🗑 ${name}`);
            });
        }
        else {
            setConfirmTagDelete(name);
            window.setTimeout(() => { setConfirmTagDelete(current => (current === name ? null : current)); }, 3000);
        }
    };
    // Two-step branch deletion: first click arms a confirm, second click deletes.
    const deleteBranch = (name) => {
        if (sessionStr === undefined)
            return;
        if (confirmDelete === name) {
            setConfirmDelete(null);
            void run('branch-delete', async () => {
                await apiPost(`${GIT_ROUTE}/branch-delete`, { session: sessionStr, name });
                loadBranches();
                await refresh();
                showNotice('ok', `🗑 ${name}`);
            });
        }
        else {
            setConfirmDelete(name);
            window.setTimeout(() => {
                setConfirmDelete(current => (current === name ? null : current));
            }, 3000);
        }
    };
    // Two-step remote-branch deletion (`git push origin --delete <branch>`).
    const deleteRemoteBranch = (name) => {
        if (sessionStr === undefined)
            return;
        if (confirmDelete === name) {
            setConfirmDelete(null);
            void run('remote-delete', async () => {
                await apiPost(`${GIT_ROUTE}/remote-delete`, { session: sessionStr, name });
                loadBranches();
                await refresh();
                showNotice('ok', `🗑 ${name}`);
            });
        }
        else {
            setConfirmDelete(name);
            window.setTimeout(() => {
                setConfirmDelete(current => (current === name ? null : current));
            }, 3000);
        }
    };
    // --- git commit graph dialog ------------------------------------------------
    const fetchGraph = () => {
        if (sessionStr === undefined)
            return;
        setGraphBusy(true);
        void apiGet(`${GIT_ROUTE}/graph?session=${encodeURIComponent(sessionStr)}&limit=150`)
            .then(setGraph)
            .catch(cause => { showNotice('err', cause instanceof Error ? cause.message : String(cause)); })
            .finally(() => { setGraphBusy(false); });
    };
    const openGraph = () => {
        setGraphOpen(true);
        fetchGraph();
    };
    // Close the branch popup when clicking outside it or pressing Escape.
    (0, react_1.useEffect)(() => {
        if (!branchOpen)
            return;
        const onDown = (event) => {
            const target = event.target;
            if (target === null)
                return;
            if (branchRef.current?.contains(target) || branchPopRef.current?.contains(target))
                return;
            setBranchOpen(false);
        };
        const onKey = (event) => {
            if (event.key === 'Escape')
                setBranchOpen(false);
        };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [branchOpen]);
    if (!enabled || sessionStr === undefined)
        return null;
    // A genuine non-repo directory hides the chip entirely. An UNRESOLVED target
    // (host still materializing sessions right after a restart) is transient:
    // fall through to the folder-only paint below instead of going blank.
    if (snapshot !== null && snapshot.unresolved !== true && !snapshot.isRepo)
        return null;
    // While the first /status round-trip is in flight — or while the host has
    // not resolved this session yet — paint the folder alone straight off the
    // sessions-list feed (the sidebar's own rows — zero network, so it appears
    // the moment the sidebar row does); the branch capsule joins as soon as the
    // backoff chase lands a real snapshot.
    if (snapshot === null || snapshot.unresolved === true) {
        if (feedCwd === undefined || feedCwd === '')
            return null;
        return ((0, jsx_runtime_1.jsx)("span", { className: "gbar", "data-slot-plugin": "dsh-ui-tweaks-gitbar", children: (0, jsx_runtime_1.jsxs)("span", { className: "gbar-fchip", title: feedCwd, children: [(0, jsx_runtime_1.jsx)("svg", { viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: "1.3", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, children: (0, jsx_runtime_1.jsx)("path", { d: "M1.5 4A1.5 1.5 0 0 1 3 2.5h3l1.5 2H13A1.5 1.5 0 0 1 14.5 6v6A1.5 1.5 0 0 1 13 13.5H3A1.5 1.5 0 0 1 1.5 12V4Z" }) }), (0, jsx_runtime_1.jsx)("span", { className: "gbar-folder", children: basenameOf(feedCwd) })] }) }));
    }
    const dirty = !snapshot.clean;
    return ((0, jsx_runtime_1.jsxs)("span", { className: "gbar", "data-slot-plugin": "dsh-ui-tweaks-gitbar", children: [(0, jsx_runtime_1.jsxs)("span", { className: "gbar-fchip", title: feedCwd ?? snapshot.cwd, children: [(0, jsx_runtime_1.jsx)("svg", { viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: "1.3", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, children: (0, jsx_runtime_1.jsx)("path", { d: "M1.5 4A1.5 1.5 0 0 1 3 2.5h3l1.5 2H13A1.5 1.5 0 0 1 14.5 6v6A1.5 1.5 0 0 1 13 13.5H3A1.5 1.5 0 0 1 1.5 12V4Z" }) }), (0, jsx_runtime_1.jsx)("span", { className: "gbar-folder", children: basenameOf(feedCwd ?? snapshot.cwd) })] }), (0, jsx_runtime_1.jsxs)("span", { className: "gbar-bwrap", children: [(0, jsx_runtime_1.jsxs)("button", { type: "button", ref: branchRef, className: 'gbar-chip' + (branchOpen ? ' gbar-open' : ''), onClick: toggleBranch, title: dirty ? t('dirty') : t('clean'), "aria-expanded": branchOpen, children: [(0, jsx_runtime_1.jsxs)("svg", { viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: "1.3", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, children: [(0, jsx_runtime_1.jsx)("circle", { cx: "4.5", cy: "3.5", r: "1.8" }), (0, jsx_runtime_1.jsx)("circle", { cx: "4.5", cy: "12.5", r: "1.8" }), (0, jsx_runtime_1.jsx)("circle", { cx: "12", cy: "5.5", r: "1.8" }), (0, jsx_runtime_1.jsx)("path", { d: "M4.5 5.3v5.4" }), (0, jsx_runtime_1.jsx)("path", { d: "M12 7.3c0 3-3.5 4.8-7.5 3.4" })] }), (0, jsx_runtime_1.jsx)("span", { className: "gbar-bname", children: snapshot.branch ?? snapshot.detachedHead ?? '—' }), dirty ? (0, jsx_runtime_1.jsx)("span", { className: "gbar-chip-dot", "aria-hidden": true }) : null] }), branchOpen ? ((0, jsx_runtime_1.jsxs)("div", { className: "gbar-pop", role: "menu", "aria-label": snapshot.branch ?? 'git', ref: branchPopRef, children: [(0, jsx_runtime_1.jsxs)("div", { className: "gbar-pop-head", children: [(0, jsx_runtime_1.jsxs)("span", { className: "gbar-curname", title: dirty ? t('dirty') : t('clean'), children: [(0, jsx_runtime_1.jsxs)("svg", { className: "gbar-bicon", viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: "1.3", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, children: [(0, jsx_runtime_1.jsx)("circle", { cx: "4.5", cy: "3.5", r: "1.8" }), (0, jsx_runtime_1.jsx)("circle", { cx: "4.5", cy: "12.5", r: "1.8" }), (0, jsx_runtime_1.jsx)("circle", { cx: "12", cy: "5.5", r: "1.8" }), (0, jsx_runtime_1.jsx)("path", { d: "M4.5 5.3v5.4" }), (0, jsx_runtime_1.jsx)("path", { d: "M12 7.3c0 3-3.5 4.8-7.5 3.4" })] }), (0, jsx_runtime_1.jsx)("span", { children: snapshot.branch ?? snapshot.detachedHead ?? '—' })] }), (0, jsx_runtime_1.jsxs)("span", { className: "gbar-state", children: [(0, jsx_runtime_1.jsx)("span", { className: 'gbar-dot ' + (dirty ? 'gbar-dirty' : 'gbar-clean'), "aria-hidden": true }), snapshot.ahead > 0 ? (0, jsx_runtime_1.jsxs)("span", { children: ["\u2191", snapshot.ahead] }) : null, snapshot.behind > 0 ? (0, jsx_runtime_1.jsxs)("span", { children: ["\u2193", snapshot.behind] }) : null] }), snapshot.branch !== null && snapshot.upstream !== undefined ? ((0, jsx_runtime_1.jsx)("button", { type: "button", className: "gbar-pull", onClick: pullBranch, disabled: busy !== null, title: t('branchPull'), "aria-label": t('branchPull'), children: busy === 'pull' ? (0, jsx_runtime_1.jsx)("span", { className: "gbar-spin" }) : ((0, jsx_runtime_1.jsxs)("svg", { viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, children: [(0, jsx_runtime_1.jsx)("path", { d: "M8 2.5v7.5" }), (0, jsx_runtime_1.jsx)("path", { d: "M4.6 6.9 8 10.3l3.4-3.4" }), (0, jsx_runtime_1.jsx)("path", { d: "M2.5 13.5h11" })] })) })) : null] }), (0, jsx_runtime_1.jsxs)("div", { className: "gbar-pop-body", children: [(0, jsx_runtime_1.jsxs)("div", { className: "gbar-sec", children: [t('branchLocal'), branches !== null ? (0, jsx_runtime_1.jsx)("span", { className: "gbar-count", children: branches.local.length }) : null] }), branches === null ? ((0, jsx_runtime_1.jsxs)("div", { className: "gbar-loading", children: [(0, jsx_runtime_1.jsx)("span", { className: "gbar-spin" }), t('loading')] })) : branches.local.map(name => ((0, jsx_runtime_1.jsxs)("div", { className: "gbar-rowwrap", children: [(0, jsx_runtime_1.jsxs)("button", { type: "button", className: 'gbar-row' + (name === branches.current ? ' gbar-cur' : ''), onClick: () => { pickBranch(name); }, children: [(0, jsx_runtime_1.jsxs)("svg", { className: "gbar-bicon", viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: "1.3", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, children: [(0, jsx_runtime_1.jsx)("circle", { cx: "4.5", cy: "3.5", r: "1.8" }), (0, jsx_runtime_1.jsx)("circle", { cx: "4.5", cy: "12.5", r: "1.8" }), (0, jsx_runtime_1.jsx)("path", { d: "M4.5 5.3v5.4" }), (0, jsx_runtime_1.jsx)("path", { d: "M11.5 3.7v3a2.6 2.6 0 0 1-2.6 2.6H4.5" })] }), (0, jsx_runtime_1.jsx)("span", { children: name }), name === branches.current ? (0, jsx_runtime_1.jsx)("span", { className: "gbar-check", "aria-hidden": true, children: "\u2713" }) : null] }), !isProtectedBranch(name) ? ((0, jsx_runtime_1.jsx)("button", { type: "button", className: "gbar-ren", onClick: () => { openRename(name); }, title: t('branchRename'), children: (0, jsx_runtime_1.jsx)("svg", { viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: "1.3", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, children: (0, jsx_runtime_1.jsx)("path", { d: "M11.3 2a1.9 1.9 0 0 1 2.7 2.7L6.4 12.3l-3.9 1.2 1.2-3.9L11.3 2Z" }) }) })) : null, name !== branches.current && !isProtectedBranch(name) ? ((0, jsx_runtime_1.jsx)("button", { type: "button", className: 'gbar-del' + (confirmDelete === name ? ' gbar-arm' : ''), onClick: () => { deleteBranch(name); }, title: t('branchDelete'), children: confirmDelete === name ? t('branchDeleteConfirm') : ((0, jsx_runtime_1.jsxs)("svg", { viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: "1.3", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, children: [(0, jsx_runtime_1.jsx)("path", { d: "M2.5 4.5h11" }), (0, jsx_runtime_1.jsx)("path", { d: "M5.5 4.5V3.3c0-.44.36-.8.8-.8h3.4c.44 0 .8.36.8.8v1.2" }), (0, jsx_runtime_1.jsx)("path", { d: "M4 4.5l.6 8.2c.04.5.45.8.95.8h4.9c.5 0 .91-.3.95-.8l.6-8.2" })] })) })) : null] }, name))), (0, jsx_runtime_1.jsxs)("div", { className: "gbar-sec", children: [t('branchRemote'), branches !== null ? (0, jsx_runtime_1.jsx)("span", { className: "gbar-count", children: branches.remote.length }) : null] }), branches?.remote.map(name => ((0, jsx_runtime_1.jsxs)("div", { className: "gbar-rowwrap", children: [(0, jsx_runtime_1.jsxs)("button", { type: "button", className: 'gbar-row' + (name === branches.current ? ' gbar-cur' : ''), onClick: () => { pickBranch(name); }, children: [(0, jsx_runtime_1.jsx)("svg", { className: "gbar-bicon", viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: "1.3", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, children: (0, jsx_runtime_1.jsx)("path", { d: "M5.2 13a3.2 3.2 0 1 1 .5-6.36 4 4 0 0 1 7.75 1.06 2.65 2.65 0 0 1-.55 5.3H5.2Z" }) }), (0, jsx_runtime_1.jsx)("span", { children: shortBranch(name) }), (0, jsx_runtime_1.jsx)("span", { className: "gbar-rm", children: name.split('/')[0] })] }), !isProtectedBranch(shortBranch(name)) ? ((0, jsx_runtime_1.jsx)("button", { type: "button", className: 'gbar-del' + (confirmDelete === name ? ' gbar-arm' : ''), onClick: () => { deleteRemoteBranch(name); }, title: t('branchRemoteDelete'), children: confirmDelete === name ? t('branchDeleteConfirm') : ((0, jsx_runtime_1.jsxs)("svg", { viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: "1.3", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, children: [(0, jsx_runtime_1.jsx)("path", { d: "M2.5 4.5h11" }), (0, jsx_runtime_1.jsx)("path", { d: "M5.5 4.5V3.3c0-.44.36-.8.8-.8h3.4c.44 0 .8.36.8.8v1.2" }), (0, jsx_runtime_1.jsx)("path", { d: "M4 4.5l.6 8.2c.04.5.45.8.95.8h4.9c.5 0 .91-.3.95-.8l.6-8.2" })] })) })) : null] }, name)))] }), (0, jsx_runtime_1.jsxs)("div", { className: "gbar-actions", children: [(0, jsx_runtime_1.jsxs)("button", { type: "button", className: "gbar-act", onClick: openNewBranch, children: [(0, jsx_runtime_1.jsxs)("svg", { viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: "1.3", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, children: [(0, jsx_runtime_1.jsx)("path", { d: "M4 2v8" }), (0, jsx_runtime_1.jsx)("circle", { cx: "12", cy: "4", r: "2" }), (0, jsx_runtime_1.jsx)("circle", { cx: "4", cy: "12", r: "2" }), (0, jsx_runtime_1.jsx)("path", { d: "M12 6a6 6 0 0 1-6 6" }), (0, jsx_runtime_1.jsx)("path", { d: "M12.5 10.5v4" }), (0, jsx_runtime_1.jsx)("path", { d: "M10.5 12.5h4" })] }), t('branchNew')] }), (0, jsx_runtime_1.jsxs)("button", { type: "button", className: "gbar-act", onClick: openGraph, children: [(0, jsx_runtime_1.jsxs)("svg", { viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: "1.3", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, children: [(0, jsx_runtime_1.jsx)("path", { d: "M4 2v12" }), (0, jsx_runtime_1.jsx)("path", { d: "M12 5.2C12 8.4 4 8.4 4 11.5" }), (0, jsx_runtime_1.jsx)("circle", { cx: "4", cy: "5", r: "1.7", fill: "currentColor", stroke: "none" }), (0, jsx_runtime_1.jsx)("circle", { cx: "12", cy: "3.5", r: "1.7", fill: "currentColor", stroke: "none" })] }), t('branchGraph')] }), (0, jsx_runtime_1.jsxs)("button", { type: "button", className: "gbar-act", onClick: openTags, children: [(0, jsx_runtime_1.jsxs)("svg", { viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: "1.3", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, children: [(0, jsx_runtime_1.jsx)("path", { d: "M2.5 6.8V3.5a1 1 0 0 1 1-1h3.3c.27 0 .52.1.71.3l5.9 5.9a1 1 0 0 1 0 1.4l-3.9 3.9a1 1 0 0 1-1.4 0l-5.9-5.9a1 1 0 0 1-.3-.71Z" }), (0, jsx_runtime_1.jsx)("circle", { cx: "5.4", cy: "5.4", r: "0.5", fill: "currentColor", stroke: "none" })] }), t('tagsTitle')] })] })] })) : null] }), newBranchOpen ? (0, react_dom_1.createPortal)((0, jsx_runtime_1.jsx)("div", { className: "gbar-modal-wrap", onMouseDown: event => { if (event.target === event.currentTarget)
                    setNewBranchOpen(false); }, children: (0, jsx_runtime_1.jsxs)("div", { className: "gbar-modal", role: "dialog", "aria-label": t('branchNew'), children: [(0, jsx_runtime_1.jsxs)("div", { className: "gbar-head", children: [(0, jsx_runtime_1.jsx)("span", { className: "gbar-title", children: t('branchNew') }), (0, jsx_runtime_1.jsx)("span", { className: "gbar-branch", children: snapshot.branch ?? snapshot.detachedHead ?? '—' }), (0, jsx_runtime_1.jsx)("button", { type: "button", className: "gbar-x", onClick: () => { setNewBranchOpen(false); }, "aria-label": "\u2715", children: "\u2715" })] }), (0, jsx_runtime_1.jsx)("input", { value: newBranchName, onChange: event => { setNewBranchName(event.target.value); }, onKeyDown: event => { if (event.key === 'Enter')
                                createBranch(); }, placeholder: t('branchNewPlaceholder'), "aria-label": t('branchNew'), autoFocus: true }), (0, jsx_runtime_1.jsxs)("div", { className: "gbar-baserow", children: [(0, jsx_runtime_1.jsx)("label", { className: "gbar-baselabel", htmlFor: "gbar-base-dlg", children: t('branchFrom') }), (0, jsx_runtime_1.jsxs)("select", { id: "gbar-base-dlg", className: "gbar-base", value: baseBranch, onChange: event => { setBaseBranch(event.target.value); }, "aria-label": t('branchFrom'), children: [(0, jsx_runtime_1.jsx)("option", { value: "", children: t('branchFromHead') }), branches?.local.map(name => (0, jsx_runtime_1.jsx)("option", { value: name, children: name }, name)), branches?.remote.map(name => (0, jsx_runtime_1.jsx)("option", { value: name, children: name }, name))] })] }), (0, jsx_runtime_1.jsxs)("div", { className: "gbar-pushrow", children: [(0, jsx_runtime_1.jsx)("button", { type: "button", className: 'gbar-chk' + (pushToRemote ? '' : ' gbar-off'), onClick: () => { setPushToRemote(value => !value); }, "aria-label": t('branchPushRemote'), children: pushToRemote ? '✓' : '✕' }), (0, jsx_runtime_1.jsx)("span", { className: "gbar-pushlabel", children: t('branchPushRemote') })] }), (0, jsx_runtime_1.jsxs)("div", { className: "gbar-foot", children: [(0, jsx_runtime_1.jsx)("button", { type: "button", className: "gbar-btn gbar-ghost", onClick: () => { setNewBranchOpen(false); }, children: t('branchCancel') }), (0, jsx_runtime_1.jsxs)("button", { type: "button", className: "gbar-btn gbar-primary", onClick: createBranch, disabled: busy !== null || newBranchName.trim() === '', children: [busy === 'create' || busy === 'create-push' ? (0, jsx_runtime_1.jsx)("span", { className: "gbar-spin" }) : null, " ", t('branchCreate')] })] })] }) }), document.body) : null, renameTarget !== null ? (0, react_dom_1.createPortal)((0, jsx_runtime_1.jsx)("div", { className: "gbar-modal-wrap", onMouseDown: event => { if (event.target === event.currentTarget)
                    setRenameTarget(null); }, children: (0, jsx_runtime_1.jsxs)("div", { className: "gbar-modal", role: "dialog", "aria-label": t('branchRename'), children: [(0, jsx_runtime_1.jsxs)("div", { className: "gbar-head", children: [(0, jsx_runtime_1.jsx)("span", { className: "gbar-title", children: t('branchRename') }), (0, jsx_runtime_1.jsx)("span", { className: "gbar-branch", children: renameTarget }), (0, jsx_runtime_1.jsx)("button", { type: "button", className: "gbar-x", onClick: () => { setRenameTarget(null); }, "aria-label": "\u2715", children: "\u2715" })] }), (0, jsx_runtime_1.jsx)("input", { value: renameName, onChange: event => { setRenameName(event.target.value); }, onKeyDown: event => { if (event.key === 'Enter')
                                renameBranch(); }, placeholder: t('branchNewPlaceholder'), "aria-label": t('branchRename'), autoFocus: true, onFocus: event => { event.target.select(); } }), (0, jsx_runtime_1.jsxs)("div", { className: "gbar-foot", children: [(0, jsx_runtime_1.jsx)("button", { type: "button", className: "gbar-btn gbar-ghost", onClick: () => { setRenameTarget(null); }, children: t('branchCancel') }), (0, jsx_runtime_1.jsxs)("button", { type: "button", className: "gbar-btn gbar-primary", onClick: renameBranch, disabled: busy !== null || renameName.trim() === '' || renameName.trim() === renameTarget, children: [busy === 'branch-rename' ? (0, jsx_runtime_1.jsx)("span", { className: "gbar-spin" }) : null, " ", t('branchRename')] })] })] }) }), document.body) : null, tagsOpen ? (0, react_dom_1.createPortal)((0, jsx_runtime_1.jsx)("div", { className: "gbar-modal-wrap", onMouseDown: event => { if (event.target === event.currentTarget)
                    setTagsOpen(false); }, children: (0, jsx_runtime_1.jsxs)("div", { className: "gbar-modal gbar-tags-modal", role: "dialog", "aria-label": t('tagsTitle'), children: [(0, jsx_runtime_1.jsxs)("div", { className: "gbar-head", children: [(0, jsx_runtime_1.jsx)("span", { className: "gbar-title", children: t('tagsTitle') }), (0, jsx_runtime_1.jsx)("span", { className: "gbar-branch", children: snapshot.branch ?? snapshot.detachedHead ?? '—' }), (0, jsx_runtime_1.jsx)("button", { type: "button", className: "gbar-x", onClick: () => { setTagsOpen(false); }, "aria-label": "\u2715", children: "\u2715" })] }), (0, jsx_runtime_1.jsx)("div", { className: "gbar-tags-list", children: tags === null ? ((0, jsx_runtime_1.jsxs)("div", { className: "gbar-loading", children: [(0, jsx_runtime_1.jsx)("span", { className: "gbar-spin" }), t('loading')] })) : tags.tags.length === 0 ? ((0, jsx_runtime_1.jsx)("div", { className: "gbar-graph-empty", children: t('noChanges') })) : tags.tags.map(tag => ((0, jsx_runtime_1.jsxs)("div", { className: "gbar-rowwrap", children: [(0, jsx_runtime_1.jsxs)("div", { className: "gbar-row", title: tag.subject !== '' ? `${tag.hash} ${tag.subject}` : tag.hash, children: [(0, jsx_runtime_1.jsxs)("svg", { className: "gbar-bicon", viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: "1.3", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, children: [(0, jsx_runtime_1.jsx)("path", { d: "M2.5 6.8V3.5a1 1 0 0 1 1-1h3.3c.27 0 .52.1.71.3l5.9 5.9a1 1 0 0 1 0 1.4l-3.9 3.9a1 1 0 0 1-1.4 0l-5.9-5.9a1 1 0 0 1-.3-.71Z" }), (0, jsx_runtime_1.jsx)("circle", { cx: "5.4", cy: "5.4", r: "0.5", fill: "currentColor", stroke: "none" })] }), (0, jsx_runtime_1.jsx)("span", { children: tag.name }), (0, jsx_runtime_1.jsx)("span", { className: "gbar-rm", children: tag.hash })] }), (0, jsx_runtime_1.jsx)("button", { type: "button", className: "gbar-ren", onClick: () => { pushTag(tag.name); }, title: t('tagPush'), children: (0, jsx_runtime_1.jsxs)("svg", { viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: "1.3", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, children: [(0, jsx_runtime_1.jsx)("path", { d: "M5.2 13a3.2 3.2 0 1 1 .5-6.36 4 4 0 0 1 7.75 1.06 2.65 2.65 0 0 1-.55 5.3H5.2Z" }), (0, jsx_runtime_1.jsx)("path", { d: "M8 9.5V3" }), (0, jsx_runtime_1.jsx)("path", { d: "M5.4 5.1 8 2.5l2.6 2.6" })] }) }), (0, jsx_runtime_1.jsx)("button", { type: "button", className: 'gbar-del' + (confirmTagDelete === tag.name ? ' gbar-arm' : ''), onClick: () => { deleteTag(tag.name); }, title: t('tagDelete'), children: confirmTagDelete === tag.name ? t('branchDeleteConfirm') : ((0, jsx_runtime_1.jsxs)("svg", { viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: "1.3", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, children: [(0, jsx_runtime_1.jsx)("path", { d: "M2.5 4.5h11" }), (0, jsx_runtime_1.jsx)("path", { d: "M5.5 4.5V3.3c0-.44.36-.8.8-.8h3.4c.44 0 .8.36.8.8v1.2" }), (0, jsx_runtime_1.jsx)("path", { d: "M4 4.5l.6 8.2c.04.5.45.8.95.8h4.9c.5 0 .91-.3.95-.8l.6-8.2" })] })) })] }, tag.name))) }), (0, jsx_runtime_1.jsx)("input", { value: tagName, onChange: event => { setTagName(event.target.value); }, onKeyDown: event => { if (event.key === 'Enter')
                                createTagOnHead(); }, placeholder: t('tagCreatePlaceholder'), "aria-label": t('tagCreate') }), (0, jsx_runtime_1.jsx)("input", { value: tagMessage, onChange: event => { setTagMessage(event.target.value); }, onKeyDown: event => { if (event.key === 'Enter')
                                createTagOnHead(); }, placeholder: t('tagMessagePlaceholder'), "aria-label": t('tagMessagePlaceholder') }), (0, jsx_runtime_1.jsxs)("div", { className: "gbar-foot", children: [(0, jsx_runtime_1.jsx)("button", { type: "button", className: "gbar-btn gbar-ghost", onClick: () => { setTagsOpen(false); }, children: t('branchCancel') }), (0, jsx_runtime_1.jsxs)("button", { type: "button", className: "gbar-btn gbar-primary", onClick: createTagOnHead, disabled: busy !== null || tagName.trim() === '', children: [busy === 'tag-create' ? (0, jsx_runtime_1.jsx)("span", { className: "gbar-spin" }) : null, " ", t('tagCreate')] })] })] }) }), document.body) : null, tagDialog !== null ? (0, react_dom_1.createPortal)((0, jsx_runtime_1.jsx)("div", { className: "gbar-modal-wrap", onMouseDown: event => { if (event.target === event.currentTarget)
                    setTagDialog(null); }, children: (0, jsx_runtime_1.jsxs)("div", { className: "gbar-modal", role: "dialog", "aria-label": t('tagCreate'), children: [(0, jsx_runtime_1.jsxs)("div", { className: "gbar-head", children: [(0, jsx_runtime_1.jsx)("span", { className: "gbar-title", children: t('tagCreate') }), (0, jsx_runtime_1.jsxs)("span", { className: "gbar-branch", children: ["#", tagDialog.hash] }), (0, jsx_runtime_1.jsx)("button", { type: "button", className: "gbar-x", onClick: () => { setTagDialog(null); }, "aria-label": "\u2715", children: "\u2715" })] }), (0, jsx_runtime_1.jsx)("input", { value: tagDialogName, onChange: event => { setTagDialogName(event.target.value); }, onKeyDown: event => { if (event.key === 'Enter')
                                createTagOnRef(); }, placeholder: t('tagCreatePlaceholder'), "aria-label": t('tagCreate'), autoFocus: true }), (0, jsx_runtime_1.jsx)("input", { value: tagDialogMessage, onChange: event => { setTagDialogMessage(event.target.value); }, onKeyDown: event => { if (event.key === 'Enter')
                                createTagOnRef(); }, placeholder: t('tagMessagePlaceholder'), "aria-label": t('tagMessagePlaceholder') }), (0, jsx_runtime_1.jsxs)("div", { className: "gbar-foot", children: [(0, jsx_runtime_1.jsx)("button", { type: "button", className: "gbar-btn gbar-ghost", onClick: () => { setTagDialog(null); }, children: t('branchCancel') }), (0, jsx_runtime_1.jsxs)("button", { type: "button", className: "gbar-btn gbar-primary", onClick: createTagOnRef, disabled: busy !== null || tagDialogName.trim() === '', children: [busy === 'tag-create' ? (0, jsx_runtime_1.jsx)("span", { className: "gbar-spin" }) : null, " ", t('tagCreate')] })] })] }) }), document.body) : null, graphOpen ? (0, react_dom_1.createPortal)((0, jsx_runtime_1.jsx)("div", { className: "gbar-modal-wrap", onMouseDown: event => { if (event.target === event.currentTarget)
                    setGraphOpen(false); }, children: (0, jsx_runtime_1.jsxs)("div", { className: "gbar-modal gbar-graph-modal", role: "dialog", "aria-label": t('graphTitle'), children: [(0, jsx_runtime_1.jsxs)("div", { className: "gbar-head", children: [(0, jsx_runtime_1.jsx)("span", { className: "gbar-title", children: t('graphTitle') }), (0, jsx_runtime_1.jsx)("span", { className: "gbar-branch", children: snapshot.branch ?? snapshot.detachedHead ?? '—' }), (0, jsx_runtime_1.jsx)("span", { className: "gbar-spacer" }), (0, jsx_runtime_1.jsx)("button", { type: "button", className: "gbar-x gbar-refresh", onClick: fetchGraph, "aria-label": t('branchRefresh'), title: t('branchRefresh'), disabled: graphBusy, children: graphBusy ? (0, jsx_runtime_1.jsx)("span", { className: "gbar-spin" }) : ((0, jsx_runtime_1.jsxs)("svg", { viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, children: [(0, jsx_runtime_1.jsx)("path", { d: "M13.4 8a5.4 5.4 0 1 1-1.6-3.8" }), (0, jsx_runtime_1.jsx)("path", { d: "M13.4 1.5v3h-3" })] })) }), (0, jsx_runtime_1.jsx)("button", { type: "button", className: "gbar-x", onClick: () => { setGraphOpen(false); }, "aria-label": "\u2715", children: "\u2715" })] }), graph === null ? ((0, jsx_runtime_1.jsx)("div", { className: "gbar-graph-empty", children: graphBusy ? t('loading') : t('noChanges') })) : graphLayout === null || graphLayout.rows.length === 0 ? ((0, jsx_runtime_1.jsx)("div", { className: "gbar-graph-empty", children: t('noChanges') })) : ((0, jsx_runtime_1.jsxs)("div", { className: "gbar-graph-table", role: "table", "aria-label": t('graphTitle'), children: [(0, jsx_runtime_1.jsxs)("div", { className: "gbar-graph-row gbar-graph-head", role: "row", children: [(0, jsx_runtime_1.jsx)("span", { className: "gbar-c-graph", role: "columnheader", children: t('graphColGraph') }), (0, jsx_runtime_1.jsx)("span", { className: "gbar-c-hash", role: "columnheader", children: t('graphColCommit') }), (0, jsx_runtime_1.jsx)("span", { className: "gbar-c-subject", role: "columnheader", children: t('graphColSubject') }), (0, jsx_runtime_1.jsx)("span", { className: "gbar-c-author", role: "columnheader", children: t('graphColAuthor') }), (0, jsx_runtime_1.jsx)("span", { className: "gbar-c-date", role: "columnheader", children: t('graphColDate') }), (0, jsx_runtime_1.jsx)("span", { className: "gbar-c-tag", role: "columnheader" })] }), graphLayout.rows.map((row, index) => {
                                    const commit = graph.commits[index];
                                    if (commit === undefined)
                                        return null;
                                    return ((0, jsx_runtime_1.jsxs)("div", { className: "gbar-graph-row", role: "row", children: [(0, jsx_runtime_1.jsx)("span", { className: "gbar-c-graph", role: "cell", children: (0, jsx_runtime_1.jsx)(GraphCell, { row: row, lanes: graphLayout.lanes }) }), (0, jsx_runtime_1.jsx)("span", { className: "gbar-c-hash", role: "cell", children: (0, jsx_runtime_1.jsx)("code", { className: "gbar-hash", children: commit.hash }) }), (0, jsx_runtime_1.jsxs)("span", { className: "gbar-c-subject", role: "cell", children: [(0, jsx_runtime_1.jsx)("span", { className: "gbar-subject", children: commit.subject }), commit.refs !== '' ? (0, jsx_runtime_1.jsx)("span", { className: "gbar-refs", children: commit.refs }) : null] }), (0, jsx_runtime_1.jsx)("span", { className: "gbar-c-author", role: "cell", children: commit.author }), (0, jsx_runtime_1.jsx)("span", { className: "gbar-c-date", role: "cell", title: commit.date, children: commit.dateRelative }), (0, jsx_runtime_1.jsx)("span", { className: "gbar-c-tag", role: "cell", children: (0, jsx_runtime_1.jsx)("button", { type: "button", className: "gbar-ren", onClick: () => { openTagDialog(commit.fullHash, commit.hash); }, title: t('tagCreate'), children: (0, jsx_runtime_1.jsxs)("svg", { viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: "1.3", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, children: [(0, jsx_runtime_1.jsx)("path", { d: "M2.5 6.8V3.5a1 1 0 0 1 1-1h3.3c.27 0 .52.1.71.3l5.9 5.9a1 1 0 0 1 0 1.4l-3.9 3.9a1 1 0 0 1-1.4 0l-5.9-5.9a1 1 0 0 1-.3-.71Z" }), (0, jsx_runtime_1.jsx)("circle", { cx: "5.4", cy: "5.4", r: "0.5", fill: "currentColor", stroke: "none" })] }) }) })] }, commit.fullHash));
                                })] }))] }) }), document.body) : null, notice !== null ? (0, react_dom_1.createPortal)((0, jsx_runtime_1.jsx)("div", { className: 'gbar-notice gbar-' + notice.kind, role: "status", children: notice.text }), document.body) : null] }));
}
function DiffPanel({ sessionId, useSession, controller, t }) {
    const settingsState = (0, react_1.useSyncExternalStore)(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
    const enabled = settingsState.value?.gitBarEnabled ?? true;
    const sessionStr = String(sessionId);
    const agentRunning = useSession(snapshot => snapshot.running) ?? false;
    const [snapshot, refresh] = useGitStatus(enabled, { session: sessionStr });
    const [diff, setDiff] = (0, react_1.useState)(null);
    const [diffMode, setDiffMode] = (0, react_1.useState)('hunk');
    const [diffPath, setDiffPath] = (0, react_1.useState)(null);
    // Bumped by the header refresh button: the diff effect below reruns only on
    // selection/mode changes, so a manual refresh needs its own trigger.
    const [diffNonce, setDiffNonce] = (0, react_1.useState)(0);
    const [message, setMessage] = (0, react_1.useState)('');
    // Optional tag for the commit band — with "commit & push" the whole
    // release sequence (commit → tag → push code → push tag) is one click.
    const [tagInput, setTagInput] = (0, react_1.useState)('');
    const [busy, setBusy] = (0, react_1.useState)(null);
    const [notice, setNotice] = (0, react_1.useState)(null);
    const [excluded, setExcluded] = (0, react_1.useState)(new Set());
    const [filesHeight, setFilesHeight] = (0, react_1.useState)(null);
    const [commitHeight, setCommitHeight] = (0, react_1.useState)(null);
    const [dragging, setDragging] = (0, react_1.useState)(null);
    const showNotice = (kind, text) => {
        setNotice({ kind, text });
        window.setTimeout(() => setNotice(null), 4000);
    };
    const run = async (label, fn) => {
        if (busy !== null)
            return false;
        setBusy(label);
        try {
            await fn();
            return true;
        }
        catch (cause) {
            showNotice('err', cause instanceof Error ? cause.message : String(cause));
            return false;
        }
        finally {
            setBusy(null);
        }
    };
    const toggleExclude = (path) => {
        setExcluded(current => {
            const next = new Set(current);
            if (next.has(path))
                next.delete(path);
            else
                next.add(path);
            return next;
        });
    };
    // Auto-select the first changed file so the panel opens with a diff. Runs
    // when the snapshot first arrives (it is null on mount), and again only if
    // the user has not picked a file yet.
    (0, react_1.useEffect)(() => {
        void refresh();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    (0, react_1.useEffect)(() => {
        setDiffPath(current => current ?? snapshot?.files[0]?.path ?? null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [snapshot]);
    const selectDiffFile = (path) => {
        setDiffPath(path);
    };
    const switchDiffMode = (mode) => {
        setDiffMode(mode);
    };
    // Header refresh: re-pull the status snapshot (file list, ±nums) and bump the
    // nonce so the selected file's diff refetches even though selection and mode
    // are unchanged.
    const refreshPanel = () => {
        void run('refresh', async () => {
            await refresh();
            setDiffNonce(n => n + 1);
        });
    };
    // Load the selected file's diff when the selection/mode changes, or when the
    // header refresh button bumps `diffNonce` — a file edited outside the panel
    // (or by the agent) keeps its stale diff until one of these fires.
    (0, react_1.useEffect)(() => {
        if (sessionStr === undefined || diffPath === null)
            return;
        let cancelled = false;
        setDiff(null);
        void apiGet(`${GIT_ROUTE}/diff?${targetQuery({ session: sessionStr })}&file=${encodeURIComponent(diffPath)}&mode=${diffMode}`).then(result => {
            if (!cancelled)
                setDiff(result);
        }).catch(cause => {
            if (!cancelled)
                showNotice('err', cause instanceof Error ? cause.message : String(cause));
        });
        return () => { cancelled = true; };
    }, [sessionStr, diffPath, diffMode, diffNonce]);
    const doCommit = (push) => {
        if (agentRunning)
            return;
        void run(push ? 'commit-push' : 'commit', async () => {
            const msg = message.trim();
            if (msg === '') {
                showNotice('err', t('commitEmpty'));
                return;
            }
            const tag = tagInput.trim();
            const result = await apiPost(`${GIT_ROUTE}/commit`, {
                session: sessionStr,
                message: msg,
                push,
                exclude: [...excluded],
                ...(tag !== '' ? { tag } : {}),
            });
            setMessage('');
            setTagInput('');
            setExcluded(new Set());
            await refresh();
            const tagged = result.tag !== undefined ? ` · 🏷 ${result.tag}` : '';
            showNotice('ok', push
                ? `✓ ${result.hash ?? 'committed'} · pushed${tagged}`
                : `✓ ${result.hash ?? 'committed'}${tagged}`);
        });
    };
    // Drag a horizontal splitter to redistribute height between the view's
    // sections. Only the dragged section gets an explicit height; the diff pane is
    // the flexible one, so every pixel a neighbour gains comes out of the diff and
    // the total never exceeds the panel. Double-click restores automatic sizing.
    const startVResize = (target, event) => {
        event.preventDefault();
        const panel = document.querySelector('.gbar-view');
        const measure = (selector) => {
            const el = panel?.querySelector(selector) ?? null;
            return el === null ? 0 : el.getBoundingClientRect().height;
        };
        const startY = event.clientY;
        const startFiles = measure('.gbar-files');
        const startCommit = measure('.gbar-side-commit');
        const startDiff = measure('.gbar-diff');
        setDragging(target);
        const onMove = (move) => {
            const delta = move.clientY - startY;
            if (target === 'files') {
                // Dragging down grows the file list and shrinks the diff.
                const ceiling = Math.max(MIN_FILES_H, startFiles + startDiff - MIN_DIFF_H);
                setFilesHeight(Math.round(Math.min(ceiling, Math.max(MIN_FILES_H, startFiles + delta))));
            }
            else {
                // Dragging up grows the commit band and shrinks the diff.
                const ceiling = Math.max(MIN_COMMIT_H, startCommit + startDiff - MIN_DIFF_H);
                setCommitHeight(Math.round(Math.min(ceiling, Math.max(MIN_COMMIT_H, startCommit - delta))));
            }
        };
        const onUp = () => {
            setDragging(null);
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
    };
    if (!enabled || sessionStr === undefined)
        return null;
    // Not a repo: the tab keeps its place and says so (tabs cannot hide
    // per-session the way the old pills did).
    if (snapshot !== null && !snapshot.isRepo) {
        return ((0, jsx_runtime_1.jsx)("div", { className: "gbar-view", children: (0, jsx_runtime_1.jsx)("div", { className: "gbar-view-empty", children: t('notRepo') }) }));
    }
    // Cold start (no cached snapshot yet): paint the view SHELL at once with a
    // loading body instead of returning null. With the shared snapshot cache
    // this state is rare and brief.
    if (snapshot === null) {
        return ((0, jsx_runtime_1.jsxs)("div", { className: "gbar-view", children: [(0, jsx_runtime_1.jsxs)("div", { className: "gbar-side-head", children: [(0, jsx_runtime_1.jsx)("span", { className: "gbar-title", children: t('diffView') }), (0, jsx_runtime_1.jsx)("span", { className: "gbar-spacer" })] }), (0, jsx_runtime_1.jsx)("div", { className: "gbar-side-body", children: (0, jsx_runtime_1.jsx)("div", { className: "gbar-diff", children: (0, jsx_runtime_1.jsxs)("div", { className: "gbar-empty", children: [(0, jsx_runtime_1.jsx)("span", { className: "gbar-spin" }), " ", t('loading')] }) }) })] }));
    }
    const dirty = !snapshot.clean;
    return ((0, jsx_runtime_1.jsxs)("div", { className: "gbar-view", children: [(0, jsx_runtime_1.jsxs)("div", { className: "gbar-side-head", children: [(0, jsx_runtime_1.jsx)("span", { className: "gbar-title", children: diffPath ?? t('diffView') }), (0, jsx_runtime_1.jsxs)("span", { className: "gbar-sub", children: [snapshot.files.length, " ", t('diffFiles'), " \u00B7 ", (0, jsx_runtime_1.jsxs)("span", { className: "gbar-a", children: ["+", snapshot.totalAdded] }), " ", (0, jsx_runtime_1.jsxs)("span", { className: "gbar-d", children: ["\u2212", snapshot.totalDeleted] })] }), (0, jsx_runtime_1.jsx)("span", { className: "gbar-spacer" }), (0, jsx_runtime_1.jsxs)("div", { className: "gbar-seg", role: "group", children: [(0, jsx_runtime_1.jsx)("button", { type: "button", className: diffMode === 'hunk' ? 'gbar-on' : '', onClick: () => { switchDiffMode('hunk'); }, children: t('diffOnly') }), (0, jsx_runtime_1.jsx)("button", { type: "button", className: diffMode === 'full' ? 'gbar-on' : '', onClick: () => { switchDiffMode('full'); }, children: t('diffFull') })] }), (0, jsx_runtime_1.jsx)("button", { type: "button", className: "gbar-side-half", onClick: refreshPanel, disabled: busy !== null, title: t('branchRefresh'), "aria-label": t('branchRefresh'), children: busy === 'refresh' ? (0, jsx_runtime_1.jsx)("span", { className: "gbar-spin" }) : ((0, jsx_runtime_1.jsxs)("svg", { viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, children: [(0, jsx_runtime_1.jsx)("path", { d: "M13.4 8a5.4 5.4 0 1 1-1.6-3.8" }), (0, jsx_runtime_1.jsx)("path", { d: "M13.4 1.5v3h-3" })] })) })] }), (0, jsx_runtime_1.jsxs)("div", { className: "gbar-side-body", children: [(0, jsx_runtime_1.jsx)("div", { className: "gbar-files", style: filesHeight === null
                            ? { maxHeight: FILES_AUTO_MAX }
                            : { height: filesHeight, maxHeight: SECTION_MAX }, children: snapshot.files.map(file => {
                            const isExcluded = excluded.has(file.path);
                            // Split the path so the directory renders dim and the filename
                            // bright — the eye scans by filename, not by folder.
                            const slash = file.path.lastIndexOf('/');
                            const dir = slash >= 0 ? file.path.slice(0, slash + 1) : '';
                            const base = slash >= 0 ? file.path.slice(slash + 1) : file.path;
                            return ((0, jsx_runtime_1.jsxs)("div", { className: 'gbar-file' + (diffPath === file.path ? ' gbar-on' : '') + (isExcluded ? ' gbar-excl' : ''), children: [(0, jsx_runtime_1.jsx)("button", { type: "button", className: 'gbar-chk' + (isExcluded ? ' gbar-off' : ''), onClick: () => { toggleExclude(file.path); }, "aria-label": isExcluded ? t('excludeFile') : t('includeFile'), children: isExcluded ? '✕' : '✓' }), (0, jsx_runtime_1.jsxs)("button", { type: "button", className: "gbar-file-main", onClick: () => { selectDiffFile(file.path); }, title: file.path, children: [(0, jsx_runtime_1.jsx)("span", { className: 'gbar-st ' + statusClass(file.status), children: statusLetter(file.status) }), (0, jsx_runtime_1.jsxs)("span", { className: "gbar-path", children: [dir !== '' ? (0, jsx_runtime_1.jsx)("span", { className: "gbar-dir", children: dir }) : null, (0, jsx_runtime_1.jsx)("span", { children: base })] }), (0, jsx_runtime_1.jsxs)("span", { className: "gbar-nums", children: [(0, jsx_runtime_1.jsxs)("span", { className: "gbar-a", children: ["+", file.added] }), " ", (0, jsx_runtime_1.jsxs)("span", { className: "gbar-d", children: ["\u2212", file.deleted] })] })] })] }, file.path));
                        }) }), (0, jsx_runtime_1.jsx)("div", { className: 'gbar-vsplit' + (dragging === 'files' ? ' gbar-dragging' : ''), role: "separator", "aria-orientation": "horizontal", title: "\u62D6\u52A8\u8C03\u6574\u6587\u4EF6\u5217\u8868\u9AD8\u5EA6\uFF08\u53CC\u51FB\u590D\u4F4D\uFF09", onPointerDown: event => { startVResize('files', event); }, onDoubleClick: () => { setFilesHeight(null); } }), diff === null ? ((0, jsx_runtime_1.jsx)("div", { className: "gbar-diff", children: (0, jsx_runtime_1.jsx)("div", { className: "gbar-empty", children: snapshot.clean || snapshot.files.length === 0 ? t('clean') : t('loading') }) })) : diff.lines.length === 0 ? ((0, jsx_runtime_1.jsx)("div", { className: "gbar-diff", children: (0, jsx_runtime_1.jsx)("div", { className: "gbar-empty", children: t('noChanges') }) })) : ((0, jsx_runtime_1.jsxs)("div", { className: "gbar-diff", children: [diff.lines.map((line, i) => ((0, jsx_runtime_1.jsxs)("div", { className: 'gbar-line gbar-' + line.type, children: [(0, jsx_runtime_1.jsx)("span", { className: "gbar-ln", children: line.old ?? '' }), (0, jsx_runtime_1.jsx)("span", { className: "gbar-ln", children: line.new ?? '' }), (0, jsx_runtime_1.jsx)("span", { className: "gbar-code", children: line.text })] }, i))), diff.truncated ? (0, jsx_runtime_1.jsx)("div", { className: "gbar-empty", children: "\u2026" }) : null] })), dirty ? ((0, jsx_runtime_1.jsx)("div", { className: 'gbar-vsplit' + (dragging === 'commit' ? ' gbar-dragging' : ''), role: "separator", "aria-orientation": "horizontal", title: "\u62D6\u52A8\u8C03\u6574\u63D0\u4EA4\u533A\u9AD8\u5EA6\uFF08\u53CC\u51FB\u590D\u4F4D\uFF09", onPointerDown: event => { startVResize('commit', event); }, onDoubleClick: () => { setCommitHeight(null); } })) : null] }), (0, jsx_runtime_1.jsxs)("div", { className: "gbar-side-foot", children: [(0, jsx_runtime_1.jsx)("span", { className: "gbar-dot" }), snapshot.branch ?? '—', " \u00B7 ", dirty ? t('dirty') : t('clean')] }), dirty ? ((0, jsx_runtime_1.jsxs)("div", { className: "gbar-side-commit", style: commitHeight === null ? undefined : { height: commitHeight, maxHeight: SECTION_MAX }, children: [(0, jsx_runtime_1.jsx)("div", { className: "gbar-crow", children: (0, jsx_runtime_1.jsx)("textarea", { value: message, onChange: event => { setMessage(event.target.value); }, onKeyDown: event => {
                                // Enter commits; Shift+Enter adds a line, now that this field
                                // can be dragged tall enough for a multi-line message.
                                if (event.key === 'Enter' && !event.shiftKey) {
                                    event.preventDefault();
                                    doCommit(false);
                                }
                            }, placeholder: t('commitPlaceholder'), "aria-label": t('commitMessage'), rows: 1 }) }), (0, jsx_runtime_1.jsxs)("div", { className: "gbar-actions", children: [(0, jsx_runtime_1.jsx)("input", { className: "gbar-taginput", value: tagInput, onChange: event => { setTagInput(event.target.value); }, onKeyDown: event => { if (event.key === 'Enter') {
                                    event.preventDefault();
                                    doCommit(false);
                                } }, placeholder: t('tagCommitPlaceholder'), "aria-label": t('tagCommitPlaceholder') }), (0, jsx_runtime_1.jsxs)("button", { type: "button", className: "gbar-btn gbar-soft", onClick: () => { doCommit(false); }, disabled: busy !== null || agentRunning, title: agentRunning ? t('commitBusy') : undefined, children: [busy === 'commit' ? (0, jsx_runtime_1.jsx)("span", { className: "gbar-spin" }) : null, " ", t('commitSubmit')] }), (0, jsx_runtime_1.jsxs)("button", { type: "button", className: "gbar-btn gbar-primary", onClick: () => { doCommit(true); }, disabled: busy !== null || agentRunning, title: agentRunning ? t('commitBusy') : undefined, children: [busy === 'commit-push' ? (0, jsx_runtime_1.jsx)("span", { className: "gbar-spin" }) : null, " ", t('commitSubmitPush')] })] })] })) : null, notice !== null ? ((0, jsx_runtime_1.jsx)("div", { className: 'gbar-notice gbar-' + notice.kind, role: "status", children: notice.text })) : null] }));
}
// ---------------------------------------------------------------------------
// Diff tab title — `sidebar.right.pane.tab.title`: the chip text plus the
// uncommitted-changes dot, so the dirty state reads on the tab strip without
// opening the tab (the old header icon's dot, moved onto the chip).
// ---------------------------------------------------------------------------
function DiffTabTitle({ sessionId, controller, t }) {
    const settingsState = (0, react_1.useSyncExternalStore)(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
    const enabled = settingsState.value?.gitBarEnabled ?? true;
    const [snapshot] = useGitStatus(enabled, { session: String(sessionId) });
    const dirty = snapshot !== null && snapshot.isRepo && !snapshot.clean;
    return ((0, jsx_runtime_1.jsxs)("span", { children: [t('diffView'), dirty ? (0, jsx_runtime_1.jsx)("span", { className: "gbar-tab-dot", "aria-hidden": true }) : null] }));
}
// ---------------------------------------------------------------------------
// Terminal view — a REAL terminal in a right-sidebar tab: xterm.js in
// the browser over a WebSocket to the host's persistent node-pty shell (the
// dsh-better-sidebar design, its src/pty-manager.ts + TerminalView.tsx).
// Full emulation: colors, cursor control, Ctrl+C, command history,
// interactive apps. The xterm UMD builds and stylesheet are vendored by the
// plugin and lazy-loaded on first tab open, so the always-resident GitBar
// bundle stays lean.
//
// Shell lifetime survives tab switches: leaving the tab only drops the
// socket — the host keeps the shell alive behind a reconnect grace, so coming
// back reattaches to the SAME session with its transcript replayed. Page
// refreshes recover the same way.
// ---------------------------------------------------------------------------
/** Vendored xterm assets served by the host half (src/git-web.ts). */
const VENDOR_BASE = `${GIT_ROUTE}/vendor`;
let xtermGlobalsPromise = null;
/** Inject one vendored script exactly once; resolves on load, rejects on error. */
function loadVendorScript(src) {
    return new Promise((resolve, reject) => {
        const existing = document.querySelector(`script[data-gbar-vendor="${CSS.escape(src)}"]`);
        if (existing !== null) {
            // An already-complete script never fires `load` again.
            if (existing.getAttribute('data-gbar-loaded') === '1') {
                resolve();
                return;
            }
            existing.addEventListener('load', () => resolve());
            existing.addEventListener('error', () => reject(new Error(`failed to load ${src}`)));
            return;
        }
        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.dataset.gbarVendor = src;
        script.addEventListener('load', () => {
            script.setAttribute('data-gbar-loaded', '1');
            resolve();
        });
        script.addEventListener('error', () => reject(new Error(`failed to load ${src}`)));
        document.head.appendChild(script);
    });
}
/** Load the vendored xterm UMD builds once per page; caches the globals. */
function loadXterm() {
    xtermGlobalsPromise ??= (async () => {
        try {
            if (document.querySelector('link[data-gbar-xterm-css]') === null) {
                const link = document.createElement('link');
                link.rel = 'stylesheet';
                link.href = `${VENDOR_BASE}/xterm.css`;
                link.dataset.gbarXtermCss = '1';
                document.head.appendChild(link);
            }
            await loadVendorScript(`${VENDOR_BASE}/xterm.js`);
            await loadVendorScript(`${VENDOR_BASE}/addon-fit.js`);
            const win = window;
            const TerminalCtor = win.Terminal;
            const fitNamespace = win.FitAddon;
            if (typeof TerminalCtor !== 'function' || typeof fitNamespace?.FitAddon !== 'function') {
                throw new Error('xterm assets loaded but globals are missing');
            }
            return { Terminal: TerminalCtor, FitAddon: fitNamespace.FitAddon };
        }
        catch (cause) {
            // Allow a retry on the next panel open instead of caching the failure.
            xtermGlobalsPromise = null;
            throw cause;
        }
    })();
    return xtermGlobalsPromise;
}
// Curated ANSI palettes (one-dark / one-light families), matching the
// dsh-better-sidebar terminal so both plugins render shells identically.
const ANSI_DARK = {
    black: '#282c34', red: '#e06c75', green: '#98c379', yellow: '#e5c07b',
    blue: '#61afef', magenta: '#c678dd', cyan: '#56b6c2', white: '#abb2bf',
    brightBlack: '#5c6370', brightRed: '#e06c75', brightGreen: '#98c379',
    brightYellow: '#e5c07b', brightBlue: '#61afef', brightMagenta: '#c678dd',
    brightCyan: '#56b6c2', brightWhite: '#ffffff',
};
const ANSI_LIGHT = {
    black: '#383a42', red: '#e45649', green: '#50a14f', yellow: '#c18401',
    blue: '#0184bc', magenta: '#a626a4', cyan: '#0997b3', white: '#a0a1a7',
    brightBlack: '#4f525e', brightRed: '#e45649', brightGreen: '#50a14f',
    brightYellow: '#c18401', brightBlue: '#0184bc', brightMagenta: '#a626a4',
    brightCyan: '#0997b3', brightWhite: '#fafafa',
};
/**
 * Whether the DSH app is currently in its dark theme. The real switch is the
 * `data-ds-dark-theme` attribute the theme plugin puts on <body> — the same
 * signal the DSW token stylesheet keys on (`body[data-ds-dark-theme]{…}`), so
 * it is correct no matter how the theme was chosen (app setting or system
 * follow). Tokens being readable without the attribute means the light block
 * is active; only a composition with neither falls back to the system media
 * query.
 */
function isDarkScheme() {
    if (document.body.hasAttribute('data-ds-dark-theme'))
        return true;
    const style = getComputedStyle(document.body);
    if (style.getPropertyValue('--dsw-alias-bg-base').trim() !== '')
        return false;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
}
/**
 * The xterm theme for the current scheme (surface from tokens, curated ANSI).
 * The DSW alias tokens are defined on <body> (not :root), and custom
 * properties inherit downward only — reading them off documentElement always
 * yields '', so read the body's computed values.
 */
function xtermTheme() {
    const dark = isDarkScheme();
    const style = getComputedStyle(document.body);
    const background = style.getPropertyValue('--dsw-alias-bg-base').trim() || (dark ? '#151517' : '#ffffff');
    const foreground = style.getPropertyValue('--dsw-alias-label-primary').trim() || (dark ? '#e6e6e6' : '#1a1a1a');
    return {
        background,
        foreground,
        cursor: foreground,
        cursorAccent: background,
        selectionBackground: dark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.12)',
        ...(dark ? ANSI_DARK : ANSI_LIGHT),
    };
}
function TerminalPanel({ sessionId, controller, t }) {
    const settingsState = (0, react_1.useSyncExternalStore)(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
    const enabled = settingsState.value?.gitBarEnabled ?? true;
    const target = { session: String(sessionId) };
    const [status, setStatus] = (0, react_1.useState)('boot');
    const [errorText, setErrorText] = (0, react_1.useState)('');
    const [retryNonce, setRetryNonce] = (0, react_1.useState)(0);
    const hostRef = (0, react_1.useRef)(null);
    // Attach xterm + the WebSocket bridge. Re-runs on retryNonce (manual retry
    // after a fatal error). Teardown closes the socket WITHOUT a close frame,
    // so the host's reconnect grace keeps the shell alive for the next tab
    // visit — exactly like switching tabs in dsh-better-sidebar.
    (0, react_1.useEffect)(() => {
        const host = hostRef.current;
        if (!enabled || host === null)
            return;
        let disposed = false;
        let socket = null;
        let retryTimer;
        let failures = 0;
        let term = null;
        const cleanups = [];
        const sendFrame = (frame) => {
            if (socket !== null && socket.readyState === WebSocket.OPEN)
                socket.send(JSON.stringify(frame));
        };
        const connect = () => {
            if (disposed || term === null)
                return;
            setStatus('connecting');
            const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
            socket = new WebSocket(`${proto}//${location.host}${GIT_ROUTE}/terminal-ws?${targetQuery(target)}&cols=${term.cols}&rows=${term.rows}`);
            socket.onopen = () => {
                failures = 0;
                setStatus('live');
                setErrorText('');
                if (term !== null)
                    sendFrame({ type: 'resize', cols: term.cols, rows: term.rows });
            };
            socket.onmessage = (event) => {
                if (typeof event.data !== 'string' || term === null)
                    return;
                if (event.data.startsWith('{')) {
                    try {
                        const frame = JSON.parse(event.data);
                        if (frame.type === 'exit') {
                            setStatus('exited');
                            return;
                        }
                    }
                    catch {
                        // Literal braces typed into the shell — render them.
                    }
                }
                term.write(event.data);
            };
            socket.onclose = (event) => {
                socket = null;
                if (disposed)
                    return;
                // A reasoned 1011 refusal is fatal (spawn failure / pty missing);
                // every other drop recovers with backoff — the host replays the
                // transcript on reconnect, so the retry is seamless.
                if (event.code === 1011 && event.reason !== '') {
                    setStatus('error');
                    setErrorText(event.reason === 'pty-unavailable' ? t('termUnavailable') : event.reason);
                    return;
                }
                failures += 1;
                if (failures > 5) {
                    setStatus('error');
                    setErrorText(`${t('termLost')} (${event.code})`);
                    return;
                }
                retryTimer = window.setTimeout(connect, Math.min(8000, 400 * failures));
            };
        };
        void (async () => {
            try {
                const globals = await loadXterm();
                if (disposed)
                    return;
                // Surface colors track the app theme: the host backdrop matches the
                // theme background exactly (the xterm viewport is transparent), and a
                // theme flip while the panel is open re-applies live.
                const applyTheme = () => {
                    const theme = xtermTheme();
                    host.style.backgroundColor = theme.background;
                    if (term !== null)
                        term.options.theme = theme;
                };
                term = new globals.Terminal({
                    cursorBlink: true,
                    fontSize: 12.5,
                    fontFamily: '"SF Mono",ui-monospace,Consolas,"Courier New",monospace',
                    scrollback: 4000,
                    theme: xtermTheme(),
                });
                applyTheme();
                const fit = new globals.FitAddon();
                term.loadAddon(fit);
                term.open(host);
                try {
                    fit.fit();
                }
                catch { /* zero-size host before layout settles */ }
                term.onData(data => sendFrame({ type: 'input', data }));
                term.onResize(dims => sendFrame({ type: 'resize', cols: dims.cols, rows: dims.rows }));
                const observer = new ResizeObserver(() => { try {
                    fit.fit();
                }
                catch { /* mid-layout */ } });
                observer.observe(host);
                // DSH flips themes by toggling body's data-ds-dark-theme attribute.
                const themeObserver = new MutationObserver(applyTheme);
                themeObserver.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] });
                cleanups.push(() => observer.disconnect(), () => themeObserver.disconnect(), () => term?.dispose());
                connect();
            }
            catch (cause) {
                if (disposed)
                    return;
                setStatus('error');
                setErrorText(cause instanceof Error ? cause.message : String(cause));
            }
        })();
        return () => {
            disposed = true;
            if (retryTimer !== undefined)
                clearTimeout(retryTimer);
            socket?.close();
            for (const cleanup of cleanups.reverse())
                cleanup();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled, retryNonce]);
    if (!enabled)
        return null;
    // No title/cwd row: the sidebar tab chip already labels the tab, so the
    // view is just the terminal (plus a transient connecting/exited note).
    return ((0, jsx_runtime_1.jsxs)("div", { className: "gbar-view", children: [status !== 'live' && status !== 'error' ? ((0, jsx_runtime_1.jsxs)("div", { className: "side-head gbar-side-head", children: [(0, jsx_runtime_1.jsx)("span", { className: "ssub gbar-sub", children: status === 'exited' ? t('termExited') : t('loading') }), (0, jsx_runtime_1.jsx)("span", { className: "sp gbar-spacer" })] })) : null, (0, jsx_runtime_1.jsx)("div", { className: "gbar-term gbar-xterm", ref: hostRef }), status === 'error' ? ((0, jsx_runtime_1.jsxs)("div", { className: "gbar-term-error", role: "alert", children: [(0, jsx_runtime_1.jsx)("span", { className: "gbar-term-error-text", children: errorText }), (0, jsx_runtime_1.jsx)("button", { type: "button", onClick: () => { setStatus('boot'); setErrorText(''); setRetryNonce(n => n + 1); }, children: "\u21BB" })] })) : null] }));
}
// ---------------------------------------------------------------------------
// Hero (new-session) branch chip — the session header does not mount on the
// blank/new-session screen, so the chip floats there instead: anchored just
// left of the workspace picker (`[class$="_workspace"]`, CSS-module suffix is
// stable within a pinned build). Git ops resolve via the workspace title
// (`ws` target); if there is no repo, nothing renders.
// ---------------------------------------------------------------------------
const HERO_ANCHOR_SELECTOR = '[class$="_workspace"]';
function HeroBranchChip({ t, right, top }) {
    const wsName = (0, react_1.useMemo)(() => document.querySelector(HERO_ANCHOR_SELECTOR)?.textContent?.trim() ?? '', []);
    const [snapshot, refresh] = useGitStatus(true, { ws: wsName });
    const [branchOpen, setBranchOpen] = (0, react_1.useState)(false);
    const [branches, setBranches] = (0, react_1.useState)(null);
    const [confirmDelete, setConfirmDelete] = (0, react_1.useState)(null);
    const [renameTarget, setRenameTarget] = (0, react_1.useState)(null);
    const [renameName, setRenameName] = (0, react_1.useState)('');
    const [busy, setBusy] = (0, react_1.useState)(null);
    const [notice, setNotice] = (0, react_1.useState)(null);
    const chipRef = (0, react_1.useRef)(null);
    const popRef = (0, react_1.useRef)(null);
    const showNotice = (kind, text) => {
        setNotice({ kind, text });
        window.setTimeout(() => setNotice(null), 4000);
    };
    const run = async (label, fn) => {
        if (busy !== null)
            return false;
        setBusy(label);
        try {
            await fn();
            return true;
        }
        catch (cause) {
            showNotice('err', cause instanceof Error ? cause.message : String(cause));
            return false;
        }
        finally {
            setBusy(null);
        }
    };
    const loadBranches = () => {
        void apiGet(`${GIT_ROUTE}/branches?${targetQuery({ ws: wsName })}`)
            .then(setBranches)
            .catch(cause => { showNotice('err', cause instanceof Error ? cause.message : String(cause)); });
    };
    const pickBranch = (name) => {
        if (name === branches?.current)
            return;
        void run('checkout', async () => {
            await apiPost(`${GIT_ROUTE}/checkout`, { ws: wsName, branch: name });
            setBranchOpen(false);
            await refresh();
            loadBranches();
            showNotice('ok', `→ ${name}`);
        });
    };
    // Pull the branch shown in the popup header (upstream required).
    const pullBranch = () => {
        const target = snapshot?.upstream ?? snapshot?.branch ?? '';
        void run('pull', async () => {
            await apiPost(`${GIT_ROUTE}/pull`, { ws: wsName });
            setBranchOpen(false);
            await refresh();
            showNotice('ok', `⬇ ${target}`);
        });
    };
    const deleteLocal = (name) => {
        if (confirmDelete === name) {
            setConfirmDelete(null);
            void run('branch-delete', async () => {
                await apiPost(`${GIT_ROUTE}/branch-delete`, { ws: wsName, name });
                loadBranches();
                showNotice('ok', `🗑 ${name}`);
            });
        }
        else {
            setConfirmDelete(name);
            window.setTimeout(() => { setConfirmDelete(current => (current === name ? null : current)); }, 3000);
        }
    };
    const deleteRemote = (name) => {
        if (confirmDelete === name) {
            setConfirmDelete(null);
            void run('remote-delete', async () => {
                await apiPost(`${GIT_ROUTE}/remote-delete`, { ws: wsName, name });
                loadBranches();
                showNotice('ok', `🗑 ${name}`);
            });
        }
        else {
            setConfirmDelete(name);
            window.setTimeout(() => { setConfirmDelete(current => (current === name ? null : current)); }, 3000);
        }
    };
    const openRename = (name) => {
        setConfirmDelete(null);
        setRenameName(name);
        setRenameTarget(name);
    };
    const renameBranch = () => {
        if (renameTarget === null)
            return;
        const from = renameTarget;
        const to = renameName.trim();
        if (to === '' || to === from) {
            setRenameTarget(null);
            return;
        }
        void run('branch-rename', async () => {
            await apiPost(`${GIT_ROUTE}/branch-rename`, { ws: wsName, name: from, newName: to });
            setRenameTarget(null);
            loadBranches();
            await refresh();
            showNotice('ok', `✎ ${from} → ${to}`);
        });
    };
    // Close on outside click / Escape.
    (0, react_1.useEffect)(() => {
        if (!branchOpen)
            return;
        const onDown = (event) => {
            const node = event.target;
            if (node === null)
                return;
            if (chipRef.current?.contains(node) || popRef.current?.contains(node))
                return;
            setBranchOpen(false);
        };
        const onKey = (event) => {
            if (event.key === 'Escape')
                setBranchOpen(false);
        };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [branchOpen]);
    if (snapshot === null || !snapshot.isRepo)
        return null;
    const dirty = !snapshot.clean;
    return ((0, jsx_runtime_1.jsxs)("div", { className: "gbar-hero", style: { top, right }, children: [(0, jsx_runtime_1.jsxs)("span", { className: "gbar-fchip", title: snapshot.cwd, children: [(0, jsx_runtime_1.jsx)("svg", { viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: "1.3", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, children: (0, jsx_runtime_1.jsx)("path", { d: "M1.5 4A1.5 1.5 0 0 1 3 2.5h3l1.5 2H13A1.5 1.5 0 0 1 14.5 6v6A1.5 1.5 0 0 1 13 13.5H3A1.5 1.5 0 0 1 1.5 12V4Z" }) }), (0, jsx_runtime_1.jsx)("span", { className: "gbar-folder", children: basenameOf(snapshot.cwd) })] }), (0, jsx_runtime_1.jsxs)("span", { className: "gbar-bwrap", children: [(0, jsx_runtime_1.jsxs)("button", { type: "button", ref: chipRef, className: 'gbar-chip' + (branchOpen ? ' gbar-open' : ''), onClick: () => { setBranchOpen(value => { if (!value)
                            loadBranches(); return !value; }); }, title: dirty ? t('dirty') : t('clean'), "aria-expanded": branchOpen, children: [(0, jsx_runtime_1.jsxs)("svg", { viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: "1.3", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, children: [(0, jsx_runtime_1.jsx)("circle", { cx: "4.5", cy: "3.5", r: "1.8" }), (0, jsx_runtime_1.jsx)("circle", { cx: "4.5", cy: "12.5", r: "1.8" }), (0, jsx_runtime_1.jsx)("circle", { cx: "12", cy: "5.5", r: "1.8" }), (0, jsx_runtime_1.jsx)("path", { d: "M4.5 5.3v5.4" }), (0, jsx_runtime_1.jsx)("path", { d: "M12 7.3c0 3-3.5 4.8-7.5 3.4" })] }), (0, jsx_runtime_1.jsx)("span", { className: "gbar-bname", children: snapshot.branch ?? snapshot.detachedHead ?? '—' })] }), branchOpen ? ((0, jsx_runtime_1.jsxs)("div", { className: "gbar-pop", ref: popRef, role: "menu", children: [(0, jsx_runtime_1.jsxs)("div", { className: "gbar-pop-head", children: [(0, jsx_runtime_1.jsxs)("svg", { style: { width: 14, height: 14, color: 'var(--dsw-alias-state-business-primary)', flex: 'none' }, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: "1.3", strokeLinecap: "round", children: [(0, jsx_runtime_1.jsx)("circle", { cx: "4.5", cy: "3.5", r: "1.8" }), (0, jsx_runtime_1.jsx)("circle", { cx: "4.5", cy: "12.5", r: "1.8" }), (0, jsx_runtime_1.jsx)("circle", { cx: "12", cy: "5.5", r: "1.8" }), (0, jsx_runtime_1.jsx)("path", { d: "M4.5 5.3v5.4" }), (0, jsx_runtime_1.jsx)("path", { d: "M12 7.3c0 3-3.5 4.8-7.5 3.4" })] }), (0, jsx_runtime_1.jsx)("span", { className: "cname", children: snapshot.branch ?? snapshot.detachedHead ?? '—' }), (0, jsx_runtime_1.jsxs)("span", { className: "state", children: [(0, jsx_runtime_1.jsx)("span", { style: { width: 6, height: 6, borderRadius: 999, background: dirty ? 'var(--dsw-alias-state-warn-primary)' : 'var(--dsw-alias-state-success-primary)' } }), snapshot.ahead > 0 ? (0, jsx_runtime_1.jsxs)("span", { children: ["\u2191", snapshot.ahead] }) : null, snapshot.behind > 0 ? (0, jsx_runtime_1.jsxs)("span", { children: ["\u2193", snapshot.behind] }) : null] }), snapshot.branch !== null && snapshot.upstream !== undefined ? ((0, jsx_runtime_1.jsx)("button", { type: "button", className: "gbar-pull", style: { marginLeft: 'auto' }, onClick: pullBranch, disabled: busy !== null, title: t('branchPull'), "aria-label": t('branchPull'), children: busy === 'pull' ? (0, jsx_runtime_1.jsx)("span", { className: "gbar-spin" }) : ((0, jsx_runtime_1.jsxs)("svg", { viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, children: [(0, jsx_runtime_1.jsx)("path", { d: "M8 2.5v7.5" }), (0, jsx_runtime_1.jsx)("path", { d: "M4.6 6.9 8 10.3l3.4-3.4" }), (0, jsx_runtime_1.jsx)("path", { d: "M2.5 13.5h11" })] })) })) : null] }), (0, jsx_runtime_1.jsxs)("div", { className: "gbar-pop-body", children: [(0, jsx_runtime_1.jsxs)("div", { className: "gbar-sec", children: [t('branchLocal'), branches !== null ? (0, jsx_runtime_1.jsx)("span", { className: "gbar-count", children: branches.local.length }) : null] }), branches === null ? ((0, jsx_runtime_1.jsxs)("div", { className: "gbar-loading", children: [(0, jsx_runtime_1.jsx)("span", { className: "gbar-spin" }), t('loading')] })) : branches.local.map(name => ((0, jsx_runtime_1.jsxs)("div", { className: "gbar-rowwrap", children: [(0, jsx_runtime_1.jsxs)("button", { type: "button", className: 'gbar-row' + (name === branches.current ? ' gbar-cur' : ''), onClick: () => { pickBranch(name); }, children: [(0, jsx_runtime_1.jsx)("span", { children: name }), name === branches.current ? (0, jsx_runtime_1.jsx)("span", { className: "gbar-check", "aria-hidden": true, children: "\u2713" }) : null] }), !isProtectedBranch(name) ? ((0, jsx_runtime_1.jsx)("button", { type: "button", className: "gbar-ren", onClick: () => { openRename(name); }, title: t('branchRename'), children: (0, jsx_runtime_1.jsx)("svg", { viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: "1.3", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, children: (0, jsx_runtime_1.jsx)("path", { d: "M11.3 2a1.9 1.9 0 0 1 2.7 2.7L6.4 12.3l-3.9 1.2 1.2-3.9L11.3 2Z" }) }) })) : null, name !== branches.current && !isProtectedBranch(name) ? ((0, jsx_runtime_1.jsx)("button", { type: "button", className: 'gbar-del' + (confirmDelete === name ? ' gbar-arm' : ''), onClick: () => { deleteLocal(name); }, title: t('branchDelete'), children: confirmDelete === name ? t('branchDeleteConfirm') : '🗑' })) : null] }, name))), (0, jsx_runtime_1.jsxs)("div", { className: "gbar-sec", children: [t('branchRemote'), branches !== null ? (0, jsx_runtime_1.jsx)("span", { className: "gbar-count", children: branches.remote.length }) : null] }), branches?.remote.map(name => ((0, jsx_runtime_1.jsxs)("div", { className: "gbar-rowwrap", children: [(0, jsx_runtime_1.jsxs)("button", { type: "button", className: "gbar-row", onClick: () => { pickBranch(shortBranch(name)); }, children: [(0, jsx_runtime_1.jsx)("span", { children: shortBranch(name) }), (0, jsx_runtime_1.jsx)("span", { className: "gbar-rm", children: name.split('/')[0] })] }), !isProtectedBranch(shortBranch(name)) ? ((0, jsx_runtime_1.jsx)("button", { type: "button", className: 'gbar-del' + (confirmDelete === name ? ' gbar-arm' : ''), onClick: () => { deleteRemote(name); }, title: t('branchRemoteDelete'), children: confirmDelete === name ? t('branchDeleteConfirm') : '🗑' })) : null] }, name)))] })] })) : null] }), notice !== null ? (0, react_dom_1.createPortal)((0, jsx_runtime_1.jsx)("div", { className: 'gbar-notice gbar-' + notice.kind, role: "status", children: notice.text }), document.body) : null, renameTarget !== null ? (0, react_dom_1.createPortal)((0, jsx_runtime_1.jsx)("div", { className: "gbar-modal-wrap", onMouseDown: event => { if (event.target === event.currentTarget)
                    setRenameTarget(null); }, children: (0, jsx_runtime_1.jsxs)("div", { className: "gbar-modal", role: "dialog", "aria-label": t('branchRename'), children: [(0, jsx_runtime_1.jsxs)("div", { className: "gbar-head", children: [(0, jsx_runtime_1.jsx)("span", { className: "gbar-title", children: t('branchRename') }), (0, jsx_runtime_1.jsx)("span", { className: "gbar-branch", children: renameTarget }), (0, jsx_runtime_1.jsx)("button", { type: "button", className: "gbar-x", onClick: () => { setRenameTarget(null); }, "aria-label": "\u2715", children: "\u2715" })] }), (0, jsx_runtime_1.jsx)("input", { value: renameName, onChange: event => { setRenameName(event.target.value); }, onKeyDown: event => { if (event.key === 'Enter')
                                renameBranch(); }, placeholder: t('branchNewPlaceholder'), "aria-label": t('branchRename'), autoFocus: true, onFocus: event => { event.target.select(); } }), (0, jsx_runtime_1.jsxs)("div", { className: "gbar-foot", children: [(0, jsx_runtime_1.jsx)("button", { type: "button", className: "gbar-btn gbar-ghost", onClick: () => { setRenameTarget(null); }, children: t('branchCancel') }), (0, jsx_runtime_1.jsxs)("button", { type: "button", className: "gbar-btn gbar-primary", onClick: renameBranch, disabled: busy !== null || renameName.trim() === '' || renameName.trim() === renameTarget, children: [busy === 'branch-rename' ? (0, jsx_runtime_1.jsx)("span", { className: "gbar-spin" }) : null, " ", t('branchRename')] })] })] }) }), document.body) : null] }));
}
/**
 * Mount the hero floating chip: watch for the workspace picker appearing
 * (hero mounts/unmounts as sessions open and close), keep a fixed-position
 * React root anchored just left of it, and re-render on settings changes.
 */
function installHeroChip(controller, t) {
    const host = document.createElement('div');
    host.dataset.plugin = 'dsh-ui-tweaks-gitbar-hero';
    document.body.appendChild(host);
    const root = (0, client_1.createRoot)(host);
    let rect = null;
    const render = () => {
        const enabled = controller.getSnapshot().value?.gitBarEnabled ?? true;
        root.render(rect === null || !enabled
            ? null
            : (0, jsx_runtime_1.jsx)(HeroBranchChip, { t: t, right: rect.right, top: rect.top }));
    };
    const measure = () => {
        const el = document.querySelector(HERO_ANCHOR_SELECTOR);
        rect = el === null
            ? null
            : (() => {
                const box = el.getBoundingClientRect();
                return { right: Math.max(0, Math.round(window.innerWidth - box.left + 8)), top: Math.round(box.top + box.height / 2) };
            })();
        render();
    };
    let raf = 0;
    const observer = new MutationObserver(() => {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(measure);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', measure);
    const unsubscribe = controller.subscribe(render);
    measure();
    return () => {
        observer.disconnect();
        cancelAnimationFrame(raf);
        window.removeEventListener('resize', measure);
        unsubscribe();
        root.render(null);
        host.remove();
    };
}
};
__modules["./graphlayout.js"] = function(module, exports, require, __load_) {
"use strict";
/**
 * Commit-graph lane layout — pure computation, no React, no host imports.
 *
 * The server returns commits with parent hashes (`git log --date-order --all`);
 * this module assigns each commit a lane (column) and derives the SVG edge
 * segments per row, so the GitBar dialog renders a colored fork/merge graph
 * (VS Code Git Graph style) without any dependency.
 * @module dsh-ui-tweaks/client/graphlayout
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.GRAPH_ROW_H = exports.GRAPH_LANE_W = exports.GRAPH_PALETTE = void 0;
exports.layoutCommitGraph = layoutCommitGraph;
/** Stroke palette for lanes — mid-tones chosen to read on light and dark themes. */
exports.GRAPH_PALETTE = ['#4c8dff', '#8b5cf6', '#10b981', '#f59e0b', '#ec4899', '#06b6d4', '#f97316', '#84cc16'];
/** Horizontal distance between two lane centers (px). */
exports.GRAPH_LANE_W = 13;
/** Fixed row height (px) — the per-row SVGs must tile exactly for lanes to read as continuous lines. */
exports.GRAPH_ROW_H = 28;
/**
 * Assign lanes to commits in log order and derive per-row edge segments.
 *
 * Classic first-parent lane routing: each commit's incoming edge terminates at
 * its dot; the freed lane is reused by the first parent (linear history stays
 * on one line), later parents either join a lane that already points at them
 * (merges) or claim the nearest free lane (forks). Colors follow the branch
 * line: joining an existing lane adopts its color, reusing the dot lane keeps
 * the commit's own color.
 */
function layoutCommitGraph(commits) {
    /** Hash each open lane's incoming edge points at (null = free lane). */
    const targets = [];
    /** Stroke color of each open lane's incoming edge (null = free lane). */
    const laneColor = [];
    let colorCursor = 0;
    const freshColor = () => exports.GRAPH_PALETTE[colorCursor++ % exports.GRAPH_PALETTE.length];
    const rows = [];
    let lanes = 0;
    for (const commit of commits) {
        const edges = [];
        // Locate the incoming edge terminating at this commit. A hash appears at
        // most once among targets, so indexOf is exact.
        let dot = targets.indexOf(commit.fullHash);
        let color;
        const hasIncoming = dot !== -1;
        if (dot === -1) {
            // A tip no visible child extends (another branch head, or a parent cut
            // off by the limit): claim the first free lane, else grow the grid.
            dot = targets.indexOf(null);
            if (dot === -1) {
                dot = targets.length;
                targets.push(null);
                laneColor.push(null);
            }
            color = freshColor();
            laneColor[dot] = color;
        }
        else {
            color = laneColor[dot] ?? freshColor();
        }
        targets[dot] = null; // consumed; the lane is free for the parents below
        // The incoming edge runs from the row top down to the dot, continuing the
        // child's outgoing edge from the row above. A fresh tip (no visible child)
        // has none — its dot starts the line.
        if (hasIncoming)
            edges.push({ from: dot, to: dot, color, kind: 'in' });
        // Pass-through: lanes already open before this row, except the one that
        // terminates at the dot — they cross the full row height.
        for (let lane = 0; lane < targets.length; lane++) {
            if (lane !== dot && targets[lane] !== null) {
                edges.push({ from: lane, to: lane, color: laneColor[lane] ?? freshColor(), kind: 'pass' });
            }
        }
        // Outgoing: one edge per parent, first parent first. `parents` may be
        // absent when the client runs against a pre-parents server (see above).
        for (const [parentIndex, parent] of (commit.parents ?? []).entries()) {
            let lane = targets.indexOf(parent);
            let edgeColor;
            if (lane !== -1) {
                // The parent is already pointed at — the edge merges into that lane
                // and adopts its color.
                edgeColor = laneColor[lane] ?? freshColor();
            }
            else if (parentIndex === 0 && targets[dot] === null) {
                // First parent keeps the commit's lane (and color) so linear history
                // stays one continuous line.
                lane = dot;
                edgeColor = color;
                laneColor[lane] = color;
            }
            else {
                lane = targets.indexOf(null);
                if (lane === -1) {
                    lane = targets.length;
                    targets.push(null);
                    laneColor.push(null);
                }
                // Reusing the just-freed dot lane keeps the line's color; any other
                // lane starts a genuinely new line.
                edgeColor = lane === dot ? color : freshColor();
                laneColor[lane] = edgeColor;
            }
            targets[lane] = parent;
            edges.push({ from: dot, to: lane, color: edgeColor, kind: 'out' });
        }
        lanes = Math.max(lanes, targets.length);
        rows.push({ dot, color, edges });
    }
    return { rows, lanes };
}
};
__modules["./icons.js"] = function(module, exports, require, __load_) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TerminalIcon = TerminalIcon;
exports.DiffIcon = DiffIcon;
const jsx_runtime_1 = require("react/jsx-runtime");
/** Terminal prompt (`>_`) inside a rounded screen. */
function TerminalIcon({ size = 16, className }) {
    return ((0, jsx_runtime_1.jsxs)("svg", { width: size, height: size, className: className, viewBox: "0 0 16 16", fill: "none", xmlns: "http://www.w3.org/2000/svg", children: [(0, jsx_runtime_1.jsx)("rect", { x: "1.5", y: "2.5", width: "13", height: "11", rx: "2", stroke: "currentColor", strokeWidth: "1.4", strokeLinecap: "round", strokeLinejoin: "round" }), (0, jsx_runtime_1.jsx)("path", { d: "M4.5 6l2.5 2-2.5 2", stroke: "currentColor", strokeWidth: "1.4", strokeLinecap: "round", strokeLinejoin: "round" }), (0, jsx_runtime_1.jsx)("path", { d: "M8.5 10h3", stroke: "currentColor", strokeWidth: "1.4", strokeLinecap: "round", strokeLinejoin: "round" })] }));
}
/** Document with changed lines, for the diff tab. */
function DiffIcon({ size = 16, className }) {
    return ((0, jsx_runtime_1.jsxs)("svg", { width: size, height: size, className: className, viewBox: "0 0 16 16", fill: "none", xmlns: "http://www.w3.org/2000/svg", children: [(0, jsx_runtime_1.jsx)("path", { d: "M9.5 1.5H4A1.5 1.5 0 0 0 2.5 3v10A1.5 1.5 0 0 0 4 14.5h8A1.5 1.5 0 0 0 13.5 13V5.5l-4-4Z", stroke: "currentColor", strokeWidth: "1.4", strokeLinecap: "round", strokeLinejoin: "round" }), (0, jsx_runtime_1.jsx)("path", { d: "M9.5 1.5V5.5h4", stroke: "currentColor", strokeWidth: "1.4", strokeLinecap: "round", strokeLinejoin: "round" }), (0, jsx_runtime_1.jsx)("path", { d: "M5.75 10h4.5M5.75 7.5h2", stroke: "currentColor", strokeWidth: "1.4", strokeLinecap: "round", strokeLinejoin: "round" })] }));
}
};
__modules["./index.js"] = function(module, exports, require, __load_) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.inject = exports.SettingsClient = void 0;
exports.apply = apply;
const jsx_runtime_1 = require("react/jsx-runtime");
/**
 * dsh-ui-tweaks — browser half.
 *
 * Reads and writes the `ui-tweaks` settings namespace through the same-origin
 * route served by the server half, applies the chosen code font size / table
 * style live via a runtime `<style>` element, and renders the Settings
 * panel section that edits them.
 */
const react_1 = require("react");
const react_dom_1 = require("react-dom");
const gitbar_tsx_1 = __load_("./gitbar.js");
const icons_tsx_1 = __load_("./icons.js");
const archive_tsx_1 = __load_("./archive.js");
const mcp_tsx_1 = __load_("./mcp.js");
const search_tsx_1 = __load_("./search.js");
const timeline_tsx_1 = __load_("./timeline.js");
const cachehit_tsx_1 = __load_("./cachehit.js");
const effort_tsx_1 = __load_("./effort.js");
const notifier_ts_1 = __load_("./notifier.js");
const NS = 'ui-tweaks';
const SETTINGS_ROUTE = '/_dsh/ui-tweaks/settings';
/** Legacy: code font as a percentage of the stock 16px body (81% = stock 13/16). */
const DEFAULT_CODE_FONT_SCALE = 81;
/** Absolute code font size (px): 13 is the stock DSH code block at a 16px body. */
const DEFAULT_CODE_FONT_SIZE = 13;
const MIN_CODE_FONT_SIZE = 8;
const MAX_CODE_FONT_SIZE = 32;
const en = {
    nav: 'UI Tweaks',
    settingsTitle: 'UI Tweaks',
    settingsIntro: 'Tune the conversation UI — code size, tables and layout, plus optional features: git bar, archive & MCP managers and the /init command. Changes apply live.',
    sectionText: 'Text',
    sectionLayout: 'Layout',
    sectionFeatures: 'Features',
    codeFontSize: 'Code font size',
    codeFontSizeHint: `Absolute code size in px (${MIN_CODE_FONT_SIZE}–${MAX_CODE_FONT_SIZE}); ${DEFAULT_CODE_FONT_SIZE}px is DSH's default at a 16px body. Applies to code blocks; inline code follows proportionally.`,
    timeline: 'Timeline',
    timelineHint: 'Native: DSH\u2019s built-in turn rail at the right edge (stock). Web (classic): the v0.11 right-side navigation rail — hover to preview, click to jump; auto-hidden in short conversations.',
    timelineNative: 'Native',
    timelineWeb: 'Web (classic)',
    theme: 'Theme',
    themeHint: 'Conversation skin. Default keeps DSH\u2019s stock look; Neon poster is a two-scheme skin — paper-white with ink-black hairlines in light mode, near-black with light hairlines in dark mode, lime highlights and an Anthropic-red action accent, applied live.',
    themeDefault: 'Default',
    themeNeonLime: 'Neon poster',
    sectionSearch: 'Web search',
    searchOn: 'On',
    searchOff: 'Off',
    searchEnabled: 'Web search',
    searchEnabledHint: 'Takes over the built-in web_search tool with this plugin\u2019s multi-engine provider, and adds a "搜索" settings page for the engine picker and per-platform API keys. Off restores the stock backend.',
    searchNav: 'Search',
    searchTitle: 'Web search',
    searchIntro: 'Pick the preferred engine for the built-in web_search tool; any engine that fails falls through to the next one automatically.',
    sectionKeys: 'API keys',
    keyFree: 'FREE',
    keyOptional: 'KEY OPTIONAL',
    keyRequired: 'KEY REQUIRED',
    keyConfigured: 'Configured',
    keyNotConfigured: 'Not configured',
    keySave: 'Save',
    keyClear: 'Clear',
    keySaved: 'Key saved.',
    keyCleared: 'Key cleared.',
    keyEnvHint: 'Keys are stored in the credentials center, one per line:',
    searchTest: 'Test engine',
    searchTesting: 'Testing…',
    searchTestOk: 'Engine works',
    searchTestFail: 'Engine failed',
    searchEngine: 'Search engine',
    searchEngineHint: 'Backend for the built-in web_search tool. Free engines (Bing, DuckDuckGo) need no key; Exa / Tavily / Keenable use their keyless anonymous quota without one; Perplexity and DeepSeek require a key.',
    searchEngineBing: 'Bing (free)',
    searchEngineDdg: 'DuckDuckGo (free)',
    searchEngineExa: 'Exa',
    searchEngineTavily: 'Tavily',
    searchEngineKeenable: 'Keenable',
    searchEnginePerplexity: 'Perplexity',
    searchEngineDeepseek: 'DeepSeek',
    bingMarket: 'Bing market',
    bingMarketHint: 'Market code for Bing results, e.g. zh-CN or en-US.',
    searchKeysHint: 'API keys live in ~/.dsh/.credentials.yaml, one per line: EXA_API_KEY / TAVILY_API_KEY / KEENABLE_API_KEY / PERPLEXITY_API_KEY / DEEPSEEK_API_KEY: sk-.... Keys resolve from the credentials center first, then environment variables.',
    gitBar: 'Git bar',
    gitBarHint: 'Branch / diff pills above the input inside git repos, with branch management and commit & push; auto-hidden outside git.',
    gitBarOn: 'On',
    gitBarOff: 'Off',
    archiveManager: 'Archive manager',
    archiveManagerHint: 'An Archive settings page to restore or permanently delete archived sessions.',
    archiveManagerOn: 'On',
    archiveManagerOff: 'Off',
    mcpManager: 'MCP manager',
    mcpManagerHint: 'An MCP settings page listing servers with status and tools; edit and restart them.',
    mcpManagerOn: 'On',
    mcpManagerOff: 'Off',
    mcpNav: 'MCP',
    mcpTitle: 'MCP servers',
    mcpEmpty: 'No MCP servers configured.',
    mcpStatusActive: 'Running',
    mcpStatusFailed: 'Failed',
    mcpStatusLoading: 'Loading',
    mcpStatusStopped: 'Stopped',
    mcpStatusDisabled: 'Disabled',
    mcpTools: 'tools',
    mcpEnv: 'Env',
    mcpAdd: 'Add server',
    mcpAddTitle: 'Add MCP server',
    mcpEditTitle: 'Edit MCP server',
    mcpEdit: 'Edit',
    mcpDelete: 'Delete',
    mcpEnabledAction: 'Enable',
    mcpDisabledAction: 'Disable',
    mcpSaved: 'Saved.',
    mcpRemoved: 'Removed.',
    mcpFormTab: 'Form',
    mcpYamlTab: 'YAML',
    mcpYamlHint: 'Fill in the MCP config directly (serverName / transport / command / args / env / toolCallTimeoutMs / url / headers …). It is validated before saving.',
    mcpYamlPlaceholder: 'serverName: my-server\ntransport: stdio\ncommand: npx\nargs:\n  - "-y"\n  - "@some/mcp-server"\nenv:\n  KEY: value\ntoolCallTimeoutMs: 60000',
    mcpFieldId: 'Instance ID',
    mcpFieldIdHint: 'Loader entry id (letters, digits, - and _ only); it must be unique.',
    mcpFieldName: 'Name',
    mcpFieldNameHint: 'Tool namespace `mcp__<name>__*`; letters, digits, - and _ (1–32).',
    mcpFieldType: 'Type',
    mcpFieldTimeout: 'Timeout (ms)',
    mcpFieldCommand: 'Command',
    mcpFieldCommandPlaceholder: 'e.g. npx',
    mcpFieldArgs: 'Arguments (one per line)',
    mcpFieldEnv: 'Environment vars (optional, KEY=value per line)',
    mcpFieldUrl: 'URL',
    mcpFieldHeaders: 'Headers (optional, Key: value per line)',
    mcpFieldEnabled: 'Enabled',
    mcpSave: 'Save',
    mcpCancel: 'Cancel',
    mcpInvalidId: 'Instance ID may only contain letters, digits, - and _.',
    mcpInvalidName: 'Name may only contain letters, digits, - and _ (1–32 chars).',
    mcpInvalidTimeout: 'Timeout must be a positive integer (ms).',
    mcpInvalidUrl: 'URL must start with http:// or https://.',
    mcpInvalidCommand: 'Command is required.',
    mcpUnavailable: 'MCP manager unavailable.',
    mcpDisabledHint: 'MCP management is off. Turn it on in 界面调整 (UI Tweaks) to view and restart MCP servers here.',
    mcpEnable: 'Enable MCP manager',
    initCommand: '/init command',
    initCommandHint: 'The /init slash command: pick a prompt language and the agent analyzes the project and writes AGENTS.md.',
    initCommandOn: 'On',
    initCommandOff: 'Off',
    preciseCacheHit: 'Precise cache hit',
    preciseCacheHitHint: 'Rewrites the cache-hit figure in the stats line under the input box to two decimal places (e.g. 96.35%), computed from the raw cached-read / cached-write / uncached-input token buckets instead of the stock rounded integer.',
    preciseCacheHitOn: 'On',
    preciseCacheHitOff: 'Off',
    sectionNotifications: 'Task alerts',
    notifications: 'Enable alerts',
    notificationsHint: 'Call you back while the tab is in the background: a session finishes its turn, or one starts waiting for your approval, plan review or answer. The switches below apply only while this is on.',
    notifyOn: 'On',
    notifyOff: 'Off',
    notifyOnComplete: 'Alert on finish',
    notifyOnCompleteHint: 'Fire when a session ends its turn — completed, interrupted or failed; the notification says which.',
    notifyOnInteraction: 'Alert on interaction',
    notifyOnInteractionHint: 'Fire when a session waits on you: an approval, a plan review, or a question from the agent.',
    notifyOnlyWhenHidden: 'Only when hidden',
    notifyOnlyWhenHiddenHint: 'Stay quiet while you are looking at this page; alert only once the tab is hidden or unfocused.',
    notifyTitleFlash: 'Tab title flash',
    notifyTitleFlashHint: 'Blink an unread counter into the tab title until you come back.',
    notifySystemNotification: 'System notifications',
    notifySystemNotificationHint: 'Desktop-level notifications; click one to jump straight to that session. Permission is requested when enabled.',
    notifySound: 'Chime',
    notifySoundHint: 'A soft two-note motif — rising when work finishes, falling when it needs you.',
    notifyTest: 'Test',
    notifyTitleDone: 'Task finished',
    notifyTitleAborted: 'Task interrupted',
    notifyTitleFailed: 'Request failed',
    notifyTitlePending: 'Needs you',
    bodyComplete: '✅ {title} finished its turn.',
    bodyAborted: '⏹ {title} was interrupted before finishing.',
    bodyFailed: '❌ {title} failed: {error}',
    bodyApproval: '⏸ {title} is waiting for your approval.',
    bodyPlan: '📋 {title} has a plan awaiting your review.',
    bodyQuestion: '❓ {title} asked you a question.',
    mcpServerDetail: 'Configured in the profile cordis.patch.yml as @deepseek-ai/dsh-mcp-client instances; add / edit / disable / delete write to that file and apply live.',
    archiveNav: 'Archive',
    archiveTitle: 'Archived sessions',
    archiveEmpty: 'No archived sessions.',
    archiveRestore: 'Restore',
    archiveRestoring: 'Working…',
    archiveDelete: 'Delete',
    archiveDeleteAll: 'Delete all',
    archiveRestoreAll: 'Restore all',
    archiveCount: 'sessions',
    archiveUnavailable: 'Archive unavailable.',
    archiveLiveError: 'This session is running; close it before permanently deleting it.',
    archiveDisabledHint: 'Archive management is off. Turn it on in 界面调整 (UI Tweaks) to restore or permanently delete archived sessions here.',
    archiveEnable: 'Enable archive management',
    archiveRestored: 'Restored.',
    railLabel: 'Chat timeline',
    roleUser: 'User',
    noText: '(no text)',
    defaultAction: 'Default',
    reset: 'Reset',
    resetDone: 'Reset to default.',
    applied: 'Applied',
    unavailable: 'Settings unavailable.',
    loading: 'Loading…',
    readOnly: 'The active Settings provider is read-only.',
    saved: 'Saved.',
    commitMessage: 'Commit',
    diffFiles: 'files',
    branchLocal: 'Local branches',
    branchRemote: 'Remote branches',
    branchNew: 'New branch',
    branchNewPlaceholder: 'Branch name, e.g. fix/typo',
    branchRename: 'Rename',
    tagsTitle: 'Tag',
    tagCreate: 'New Tag',
    tagCreatePlaceholder: 'Tag name, e.g. v1.2.0',
    tagMessagePlaceholder: 'Message (optional, makes it annotated)',
    tagPush: 'Push Tag',
    tagDelete: 'Delete Tag',
    tagCommitPlaceholder: 'Tag (optional)',
    branchCreate: 'Create',
    diffView: 'Code diff',
    diffOnly: 'Hunks',
    diffFull: 'Full file',
    commitTitle: 'Commit changes',
    commitPlaceholder: 'Describe your changes…',
    commitHint: 'Committing stages the checked files (untracked included) and commits; unchecked files are excluded from this commit. “Commit & push” also pushes; a new branch gets an -u upstream.',
    commitWillCommit: 'To commit',
    commitViewDiff: 'View',
    commitEmpty: 'Write a commit message first',
    commitCancel: 'Cancel',
    commitSubmit: 'Commit',
    commitSubmitPush: 'Commit & push',
    commitBusy: 'Task in progress — commit is unavailable while the agent is working.',
    dirty: 'Uncommitted changes',
    clean: 'Working tree clean',
    noChanges: 'No changes here.',
    branchDelete: 'Delete branch',
    branchDeleteConfirm: 'Confirm?',
    branchRemoteDelete: 'Delete remote branch',
    branchFrom: 'From branch',
    branchFromHead: 'Current HEAD (default)',
    branchGraph: 'Graph',
    branchCancel: 'Cancel',
    branchRefresh: 'Refresh',
    graphTitle: 'Commit graph',
    graphColGraph: 'Graph',
    graphColCommit: 'Commit',
    graphColSubject: 'Description',
    graphColAuthor: 'Author',
    graphColDate: 'Date',
    branchPushRemote: 'Push to remote',
    branchPull: 'Pull',
    includeFile: 'Include in commit',
    excludeFile: 'Exclude from commit',
    terminal: 'Terminal',
    terminalGuide: 'A persistent shell in the session working directory.',
    diffGuide: 'Review working-tree changes and commit.',
    notRepo: 'Not a git repository.',
    termConnecting: 'connecting…',
    termExited: 'shell exited',
    termUnavailable: 'PTY unavailable: node-pty failed to load on the host.',
    termLost: 'connection lost',
    initDesc: 'Analyze this project and generate an AGENTS.md for future coding agents',
    initOptionZh: 'AGENTS.md — Chinese prompt',
    initOptionZhDetail: 'Submit a Chinese prompt asking the agent to analyze the project and write or improve AGENTS.md.',
    initOptionEn: 'AGENTS.md — English prompt',
    initOptionEnDetail: 'Submit an English prompt asking the agent to analyze the project and write or improve AGENTS.md.',
    initFailed: '/init failed to send the prompt',
};
const zh = {
    nav: '界面调整',
    settingsTitle: '界面调整',
    settingsIntro: '调整对话界面——代码字号、表格与布局，以及时间线、Git 状态栏、归档 / MCP 管理、/init 命令等功能开关，修改即时生效。',
    sectionText: '文本',
    sectionLayout: '布局',
    sectionFeatures: '功能',
    codeFontSize: '代码字号',
    codeFontSizeHint: `代码绝对字号，取值 ${MIN_CODE_FONT_SIZE}–${MAX_CODE_FONT_SIZE}px；${DEFAULT_CODE_FONT_SIZE}px 为 DSH 默认（正文 16 时）。作用于代码块，行内代码按比例跟随。`,
    timeline: '时间线',
    timelineHint: '原生：DSH 自带的回合导航轨（消息右侧小圆点，默认）。网页（经典）：找回 v0.11 的右侧导航轨——悬停预览、点击跳转；会话较短时自动隐藏。',
    timelineNative: '原生',
    timelineWeb: '网页（经典）',
    theme: '主题',
    themeHint: '对话皮肤。默认保持 DSH 原生外观；荧光海报是海报风双方案——浅色下纸白底黑粗线，深色下近黑底浅粗线，都配荧光黄高亮 + Anthropic 红点缀，切换即时生效。',
    themeDefault: '默认',
    themeNeonLime: '荧光海报',
    sectionSearch: '网络搜索',
    searchOn: '开',
    searchOff: '关',
    searchEnabled: '网络搜索',
    searchEnabledHint: '用本插件的多引擎 provider 接管内置 web_search 工具，并新增「搜索」设置页：选择引擎、按平台填写 API key。关闭后恢复官方搜索后端。',
    searchNav: '搜索',
    searchTitle: '网络搜索',
    searchIntro: '为内置 web_search 工具选择首选引擎；任一引擎失败会自动回退到下一个。',
    sectionKeys: 'API 密钥',
    keyFree: '免费',
    keyOptional: '可选',
    keyRequired: '必填',
    keyConfigured: '已配置',
    keyNotConfigured: '未配置',
    keySave: '保存',
    keyClear: '清除',
    keySaved: '已保存。',
    keyCleared: '已清除。',
    keyEnvHint: '密钥保存在凭据中心文件中，每行一个：',
    searchTest: '测试引擎',
    searchTesting: '测试中…',
    searchTestOk: '引擎可用',
    searchTestFail: '引擎失败',
    searchEngine: '搜索引擎',
    searchEngineHint: '内置 web_search 工具的后端。免费引擎（Bing、DuckDuckGo）无需 key；Exa / Tavily / Keenable 无 key 时走匿名免费额度；Perplexity 和 DeepSeek 需要配置 key。',
    searchEngineBing: 'Bing（免费）',
    searchEngineDdg: 'DuckDuckGo（免费）',
    searchEngineExa: 'Exa',
    searchEngineTavily: 'Tavily',
    searchEngineKeenable: 'Keenable',
    searchEnginePerplexity: 'Perplexity',
    searchEngineDeepseek: 'DeepSeek',
    bingMarket: 'Bing 市场',
    bingMarketHint: 'Bing 结果的市场代码，如 zh-CN 或 en-US。',
    searchKeysHint: 'API key 存放在 ~/.dsh/.credentials.yaml，每行一个：EXA_API_KEY / TAVILY_API_KEY / KEENABLE_API_KEY / PERPLEXITY_API_KEY / DEEPSEEK_API_KEY: sk-...。解析优先级：凭据中心 → 环境变量。',
    gitBar: 'Git 状态栏',
    gitBarHint: 'git 仓库内时在输入框上方显示 分支 / 差异 胶囊，支持分支管理与提交推送；非 git 目录自动隐藏。',
    gitBarOn: '开启',
    gitBarOff: '关闭',
    archiveManager: '归档管理',
    archiveManagerHint: '在设置中显示「归档」页面：恢复或彻底删除已归档会话。',
    archiveManagerOn: '开启',
    archiveManagerOff: '关闭',
    mcpManager: 'MCP 管理',
    mcpManagerHint: '在设置中显示「MCP 管理」页面：查看服务器状态与工具，可编辑并重启。',
    mcpManagerOn: '开启',
    mcpManagerOff: '关闭',
    mcpNav: 'MCP 管理',
    mcpTitle: 'MCP 服务器',
    mcpEmpty: '未配置任何 MCP 服务器。',
    mcpStatusActive: '运行中',
    mcpStatusFailed: '错误',
    mcpStatusLoading: '加载中',
    mcpStatusStopped: '未运行',
    mcpStatusDisabled: '已停用',
    mcpTools: '个工具',
    mcpEnv: '环境变量',
    mcpAdd: '添加服务器',
    mcpAddTitle: '添加 MCP 服务器',
    mcpEditTitle: '编辑 MCP 服务器',
    mcpEdit: '编辑',
    mcpDelete: '删除',
    mcpEnabledAction: '启用',
    mcpDisabledAction: '停用',
    mcpSaved: '已保存。',
    mcpRemoved: '已删除。',
    mcpFormTab: '表单',
    mcpYamlTab: 'YAML',
    mcpYamlHint: '直接填写 MCP 配置（serverName / transport / command / args / env / toolCallTimeoutMs / url / headers …），保存前会校验格式。',
    mcpYamlPlaceholder: 'serverName: my-server\ntransport: stdio\ncommand: npx\nargs:\n  - "-y"\n  - "@some/mcp-server"\nenv:\n  KEY: value\ntoolCallTimeoutMs: 60000',
    mcpFieldId: '实例 ID',
    mcpFieldIdHint: '加载器条目 ID（仅字母、数字、- 和 _），需唯一。',
    mcpFieldName: '名称',
    mcpFieldNameHint: '工具命名空间 `mcp__<名称>__*`；字母、数字、- 和 _（1–32 字符）。',
    mcpFieldType: '类型',
    mcpFieldTimeout: '超时时间 (ms)',
    mcpFieldCommand: '命令',
    mcpFieldCommandPlaceholder: '如 npx',
    mcpFieldArgs: '参数（每行一个）',
    mcpFieldEnv: '环境变量（可选，每行 KEY=值）',
    mcpFieldUrl: 'URL',
    mcpFieldHeaders: '请求头（可选，每行 Key: 值）',
    mcpFieldEnabled: '启用',
    mcpSave: '保存',
    mcpCancel: '取消',
    mcpInvalidId: '实例 ID 只能包含字母、数字、- 和 _。',
    mcpInvalidName: '名称只能包含字母、数字、- 和 _（1–32 字符）。',
    mcpInvalidTimeout: '超时时间必须是正整数（毫秒）。',
    mcpInvalidUrl: 'URL 必须以 http:// 或 https:// 开头。',
    mcpInvalidCommand: '命令不能为空。',
    mcpUnavailable: 'MCP 管理暂不可用。',
    mcpDisabledHint: 'MCP 管理尚未开启。在「界面调整」中开启“MCP 管理”后，可在此查看并重启 MCP 服务器。',
    mcpEnable: '开启 MCP 管理',
    initCommand: '/init 命令',
    initCommandHint: '注册 /init 斜杠命令：选择提示词语言后，让代理分析项目并生成 AGENTS.md。',
    initCommandOn: '开启',
    initCommandOff: '关闭',
    preciseCacheHit: '缓存命中率两位小数',
    preciseCacheHitHint: '把输入框下方统计条里的缓存命中百分比改写为两位小数（如 96.35%）——用原始 token 数（缓存读取 ÷ 计费输入）计算，而不是 DSH 取整后的整数。',
    preciseCacheHitOn: '开启',
    preciseCacheHitOff: '关闭',
    sectionNotifications: '任务提醒',
    notifications: '启用提醒',
    notificationsHint: '标签页在后台时唤你回来：会话完成了任务，或开始等待你的审批、计划确认或回答。下方开关仅在总开关开启时生效。',
    notifyOn: '开启',
    notifyOff: '关闭',
    notifyOnComplete: '完成提醒',
    notifyOnCompleteHint: '会话结束一轮任务时提醒——完成、被中断或出错都会通知，并注明是哪种情况。',
    notifyOnInteraction: '交互提醒',
    notifyOnInteractionHint: '会话等待你操作时提醒：审批、计划确认，或模型向你提问。',
    notifyOnlyWhenHidden: '仅页面不可见时',
    notifyOnlyWhenHiddenHint: '你正盯着本页时保持安静；切走标签页或最小化窗口后才开始提醒。',
    notifyTitleFlash: '标题闪烁',
    notifyTitleFlashHint: '在浏览器标签页标题中闪烁未读计数，直到你回到页面。',
    notifySystemNotification: '系统通知',
    notifySystemNotificationHint: '桌面级通知；点击通知可直达对应会话。开启时会向浏览器申请通知权限。',
    notifySound: '提示音',
    notifySoundHint: '轻柔的双音提示——上行表示完成，下行表示需要你处理。',
    notifyTest: '测试',
    notifyTitleDone: '任务完成',
    notifyTitleAborted: '任务已中断',
    notifyTitleFailed: '请求失败',
    notifyTitlePending: '需要你处理',
    bodyComplete: '✅ 「{title}」的任务已完成。',
    bodyAborted: '⏹ 「{title}」的任务被中断了。',
    bodyFailed: '❌ 「{title}」的任务出错了：{error}',
    bodyApproval: '⏸ 「{title}」正在等待你的审批。',
    bodyPlan: '📋 「{title}」有计划待确认。',
    bodyQuestion: '❓ 「{title}」向你提问了。',
    mcpServerDetail: 'MCP 服务器配置在 profile 的 cordis.patch.yml（@deepseek-ai/dsh-mcp-client 实例）；添加 / 编辑 / 停用 / 删除会写入该文件，改动实时生效。',
    archiveNav: '归档',
    archiveTitle: '已归档会话',
    archiveEmpty: '暂无归档会话。',
    archiveRestore: '恢复',
    archiveRestoring: '处理中…',
    archiveDelete: '删除',
    archiveDeleteAll: '全部删除',
    archiveRestoreAll: '全部恢复',
    archiveCount: '个会话',
    archiveUnavailable: '归档暂不可用。',
    archiveLiveError: '该会话正在运行，无法彻底删除，请先关闭该会话。',
    archiveDisabledHint: '归档管理尚未开启。在「界面调整」中开启“归档管理”后，可在此查看、恢复或彻底删除已归档会话。',
    archiveEnable: '开启归档管理',
    archiveRestored: '已恢复。',
    railLabel: '对话时间线',
    roleUser: '用户',
    noText: '（无文本内容）',
    defaultAction: '默认',
    reset: '重置',
    resetDone: '已重置为默认。',
    applied: '已应用',
    unavailable: '设置暂不可用。',
    loading: '加载中…',
    readOnly: '当前设置提供方为只读。',
    saved: '已保存。',
    commitMessage: 'Commit',
    diffFiles: '个文件',
    branchLocal: '本地分支',
    branchRemote: '远程分支',
    branchNew: '新建分支',
    branchNewPlaceholder: '分支名，如 fix/typo',
    branchRename: '重命名',
    tagsTitle: 'Tag',
    tagCreate: '新建 Tag',
    tagCreatePlaceholder: 'Tag 名，如 v1.2.0',
    tagMessagePlaceholder: '说明（可选，填写即 annotated tag）',
    tagPush: '推送 Tag',
    tagDelete: '删除 Tag',
    tagCommitPlaceholder: 'Tag（可选）',
    branchCreate: '创建',
    diffView: '代码差异',
    diffOnly: '仅差异',
    diffFull: '完整文件',
    commitTitle: '提交变更',
    commitPlaceholder: '描述你的改动…',
    commitHint: '提交会暂存勾选的文件（含未跟踪新文件）；取消勾选的文件将不包含在本次提交中。「提交并推送」提交后自动 push，新分支自动 -u 设上游。',
    commitWillCommit: '将提交',
    commitViewDiff: '查看',
    commitEmpty: '请先填写提交说明',
    commitCancel: '取消',
    commitSubmit: '提交',
    commitSubmitPush: '提交并推送',
    commitBusy: '任务进行中，暂不能提交。',
    dirty: '有未提交改动',
    clean: '工作区干净',
    noChanges: '这里没有差异。',
    branchDelete: '删除分支',
    branchDeleteConfirm: '确认删除?',
    branchRemoteDelete: '删除远程分支',
    branchFrom: '基于分支',
    branchFromHead: '当前 HEAD（默认）',
    branchGraph: '图谱',
    branchCancel: '取消',
    branchRefresh: '刷新',
    graphTitle: '提交图谱',
    graphColGraph: '图',
    graphColCommit: '提交',
    graphColSubject: '描述',
    graphColAuthor: '作者',
    graphColDate: '日期',
    branchPushRemote: '推送到远程',
    branchPull: '拉取',
    includeFile: '提交包含此文件',
    excludeFile: '提交排除此文件',
    terminal: '终端',
    terminalGuide: '在会话工作目录中打开常驻 shell。',
    diffGuide: '查看工作区改动并提交。',
    notRepo: '当前目录不是 git 仓库。',
    termConnecting: '连接中…',
    termExited: 'shell 已退出',
    termUnavailable: '终端不可用：宿主加载 node-pty 失败，无法启动 PTY 会话。',
    termLost: '连接已断开',
    initDesc: '分析当前项目并生成 AGENTS.md，供未来的 AI 编码代理使用',
    initOptionZh: 'AGENTS.md（中文提示词）',
    initOptionZhDetail: '向会话提交中文提示词，让代理分析项目并生成或改进 AGENTS.md。',
    initOptionEn: 'AGENTS.md（英文提示词）',
    initOptionEnDetail: '向会话提交英文提示词，让代理分析项目并生成或改进 AGENTS.md。',
    initFailed: '/init 提示词发送失败',
};
function resolveValue(value) {
    // Effective code size: the absolute px input wins; otherwise derive px from
    // the legacy percentage at the stock 16px body; otherwise stock.
    const codeFontSize = typeof value?.codeFontSize === 'number'
        ? Math.min(MAX_CODE_FONT_SIZE, Math.max(MIN_CODE_FONT_SIZE, value.codeFontSize))
        : Math.max(8, Math.round(DEFAULT_CODE_FONT_SIZE * ((value?.codeFontScale ?? DEFAULT_CODE_FONT_SCALE) / DEFAULT_CODE_FONT_SCALE)));
    return {
        codeFontSize,
        timelineStyle: value?.timelineStyle === 'web' ? 'web' : 'native',
        themeStyle: value?.themeStyle === 'neon-lime' ? 'neon-lime' : 'default',
        searchEngine: value?.searchEngine ?? 'bing',
        bingMarket: value?.bingMarket ?? 'zh-CN',
        gitBarEnabled: value?.gitBarEnabled ?? false,
        archiveManagerEnabled: value?.archiveManagerEnabled ?? false,
        mcpManagerEnabled: value?.mcpManagerEnabled ?? false,
        searchEnabled: value?.searchEnabled ?? false,
        initCommandEnabled: value?.initCommandEnabled ?? false,
        preciseCacheHitEnabled: value?.preciseCacheHitEnabled ?? false,
        notificationsEnabled: value?.notificationsEnabled ?? false,
        notifyOnlyWhenHidden: value?.notifyOnlyWhenHidden ?? true,
        notifyOnComplete: value?.notifyOnComplete ?? true,
        notifyOnInteraction: value?.notifyOnInteraction ?? true,
        notifyTitleFlash: value?.notifyTitleFlash ?? true,
        notifySystemNotification: value?.notifySystemNotification ?? true,
        notifySound: value?.notifySound ?? false,
    };
}
/**
 * Rebuild the code font tokens for the chosen code-block size, keeping the
 * theme faces and the stock vertical rhythm. Returns an empty string at the
 * stock size so the theme's own tokens stay authoritative.
 */
function buildCodeFontCss(codeFontSize) {
    if (codeFontSize === DEFAULT_CODE_FONT_SIZE)
        return '';
    const cs = getComputedStyle(document.body);
    const fam = (name, fallback) => {
        const value = cs.getPropertyValue(name).trim();
        return value.length > 0 ? value : fallback;
    };
    const code = fam('--dsw-font-markdown-code-font-family', '"SF Mono", Consolas, monospace');
    const codeBlock = fam('--dsw-font-markdown-code-block-font-family', '"SF Mono", Consolas, monospace');
    const parts = [];
    // Code sizes hang off the absolute code-block size, with inline code slightly
    // larger and the small variant slightly smaller, preserving DSH's hierarchy
    // (14/13 and 12/13 of the block); line-heights stay at the stock values.
    const token = (shorthand, size, baseLine, family) => {
        parts.push(`--${shorthand}:${size}px/${baseLine}px ${family}`);
        parts.push(`--${shorthand}-font-size:${size}px`);
        parts.push(`--${shorthand}-line-height:${baseLine}px`);
    };
    const codePx = (blockRatio) => Math.max(8, Math.round(codeFontSize * blockRatio));
    token('dsw-font-markdown-code', codePx(14 / 13), 22, code);
    token('dsw-font-markdown-code-block', codePx(1), 22, codeBlock);
    token('dsw-font-markdown-code-block-small', codePx(12 / 13), 18, codeBlock);
    return `body{${parts.join(';')}}`;
}
/**
 * Fluorescent poster skin (Bilibili tech-video look), in two schemes:
 * the paper-white poster (lime highlights, Anthropic-red action accent) in light
 * mode, and its dark twin in dark mode — near-black paper with the same
 * lime/red stickers. Popovers and menus (model switcher, open-in-app,
 * stat dialogs, context panel) ride the scheme's own paper so they never read
 * as a gray slab against the conversation.
 *
 * The internal style id stays `neon-lime`: it is the persisted setting value,
 * so renaming it would silently reset every saved profile. Only the labels
 * shown in Settings changed when the accent moved to Anthropic red.
 *
 * Every colour is a `--dut-*` design variable re-pointed per scheme, and the
 * DSW alias tokens map onto those variables in one place, so buttons, links,
 * selections, the sidebar and the plugin's own tinted controls follow
 * automatically in either host scheme. The host's own hairlines keep their
 * shipped subtle values (`--dut-line-*`); the bold ink frame is applied only
 * where this skin says so — code blocks, the composer card, the markdown
 * table header and the settings panels, all with hard offset shadows.
 * 'default' emits nothing and stays stock. Future skins add one union member
 * plus one block.
 */
const NEON_LIME_CSS = `
/* The host injects its theme sheets at runtime, so their <style> order against
   this one is not guaranteed; the id in :not() lifts the skin above the host's
   body[data-ds-dark-theme] palette (same specificity, later wins) without
   !important. The id never exists in the DOM. */
body:not(#dsh-ui-tweaks-theme-scope){
  color-scheme:light;
  --dut-paper:#ffffff;
  --dut-paper-2:#fafbfc;
  --dut-paper-3:#ffffff;
  --dut-pop:#ffffff;
  --dut-ink:#101418;
  /* the markdown table header keeps an ink strip; its type rides the accent */
  --dut-th-bg:#101418;
  --dut-code:#f7f8f9;
  --dut-text-1:#101418;
  --dut-text-2:#3d4750;
  --dut-text-3:#7a8791;
  --dut-text-4:#9aa4ad;
  --dut-btn-fg:#ffffff;
  --dut-lime:#c6ff00;
  --dut-lime-soft:#dcff4d;
  --dut-accent:#c15f3c;
  --dut-accent-soft:rgba(193,95,60,.12);
  --dut-accent-pale:#eccfc4;
  --dut-hover:rgba(193,95,60,.07);
  --dut-active:rgba(193,95,60,.13);
  /* text selection uses the native blue in both schemes */
  --dut-sel-bg:Highlight;
  --dut-sel-fg:HighlightText;
  --dut-faint:rgba(0,0,0,.06);
  --dut-scroll-1:#e3e6ea;
  --dut-scroll-2:#c8cdd3;
  --dut-elev:#101418;
  /* the user bubble: a pale tint of the Anthropic-red accent, so it stays in
     the same family as the links, buttons and artifacts */
  --dut-bubble:#ffe3d9;
  --dut-shadow:#101418;
  --dut-drop:rgba(255,255,255,.7);
  /* Hairlines stay the host's own subtle values: the shipped 0.5px pills and
     dividers are designed around them, and painting them poster-ink read as
     "changed too much". The bold ink lives only in this skin's own explicit
     rules (code blocks, composer card, table header, panels). */
  --dut-line-1:rgba(0,0,0,.04);
  --dut-line-2:rgba(0,0,0,.10);
  --dut-line-3:rgba(0,0,0,.12);
  --dut-line-4:rgba(0,0,0,.16);
  --dut-error:var(--dsw-static-red-600);
  --dut-error-2:var(--dsw-static-red-400);
  --dut-success:var(--dsw-static-green-500);
  --dut-success-2:var(--dsw-static-green-400);
  --dut-success-3:var(--dsw-static-green-100);
  --dut-warn-3:var(--dsw-static-amber-100);
  /* Two surfaces read the STATIC DeepSeek scale instead of an alias, so the
     alias re-points below never reached them: the running-turn "深度求索中…"
     shimmer (500 + 200 painted into the glyphs) and the ongoing state dot
     (450). Re-point the static steps here — every alias that also derives from
     them is already mapped explicitly, so nothing else moves. */
  --dsw-static-deepseek-200:var(--dut-accent-pale);
  --dsw-static-deepseek-450:var(--dut-accent);
  --dsw-static-deepseek-500:var(--dut-accent);
  --dsw-alias-bg-base:var(--dut-paper);
  --dsw-alias-bg-layer-1:var(--dut-paper);
  --dsw-alias-bg-layer-2:var(--dut-paper-2);
  --dsw-alias-bg-layer-3:var(--dut-paper-3);
  --dsw-alias-bg-mask-1:rgba(0,0,0,.24);
  --dsw-alias-bg-mask-2:rgba(0,0,0,.12);
  --dsw-alias-bg-mask-3:rgba(0,0,0,.48);
  --dsw-alias-bg-mask-photo:rgba(0,0,0,.88);
  --dsw-alias-bg-mask-drop:var(--dut-drop);
  --dsw-alias-bg-module-platform:var(--dut-paper-3);
  --dsw-alias-bg-multi-select:var(--dut-paper-2);
  --dsw-alias-bg-overlay:var(--dut-paper-3);
  --dsw-alias-bg-skeleton:var(--dut-faint);
  --dsw-alias-border-inverted:rgba(0,0,0,0);
  --dsw-alias-border-inverted2:rgba(0,0,0,0);
  --dsw-alias-border-l1:var(--dut-line-1);
  --dsw-alias-border-l2:var(--dut-line-2);
  --dsw-alias-border-l2-darkmode-thin:var(--dut-line-2);
  --dsw-alias-border-l3:var(--dut-line-3);
  --dsw-alias-border-l4:var(--dut-line-4);
  --dsw-alias-brand-primary:var(--dut-text-1);
  --dsw-alias-brand-primary-invert:var(--dut-paper);
  --dsw-alias-brand-text:var(--dut-text-1);
  --dsw-alias-brand-primary-new-colorprimary-new-color:var(--dut-accent);
  --dsw-alias-button-contrast-fill:var(--dut-text-2);
  --dsw-alias-button-elevated-fill:var(--dut-paper);
  --dsw-alias-button-floating-fill:var(--dut-paper);
  --dsw-alias-button-floating-hover:var(--dut-paper-2);
  --dsw-alias-button-ghost-active-border:var(--dut-ink);
  --dsw-alias-button-ghost-active-fill:var(--dut-paper-3);
  --dsw-alias-button-ghost-active-hover:var(--dut-paper-3);
  --dsw-alias-button-info-fill:var(--dut-accent);
  --dsw-alias-button-info-hover:var(--dut-accent);
  --dsw-alias-button-primary-dimmed:var(--dut-paper-2);
  --dsw-alias-button-primary-fill:var(--dut-text-1);
  --dsw-alias-button-primary-hover:var(--dut-text-1);
  --dsw-alias-interactive-bg-active:var(--dut-active);
  --dsw-alias-interactive-bg-hover:var(--dut-hover);
  --dsw-alias-interactive-bg-hover-accent:var(--dut-active);
  --dsw-alias-interactive-bg-hover-danger:rgba(236,19,19,.05);
  --dsw-alias-interactive-bg-hover-solid:var(--dut-paper-3);
  --dsw-alias-label-caption:var(--dut-text-4);
  --dsw-alias-label-dimmed:var(--dut-text-4);
  --dsw-alias-label-primary:var(--dut-text-1);
  --dsw-alias-label-primary-bluish:var(--dut-text-1);
  --dsw-alias-label-primary-dimmed:var(--dut-text-1);
  --dsw-alias-label-primary-foreground:var(--dut-btn-fg);
  --dsw-alias-label-primary-inverted:var(--dut-btn-fg);
  --dsw-alias-label-secondary:var(--dut-text-2);
  --dsw-alias-label-tertiary:var(--dut-text-3);
  --dsw-alias-link:var(--dut-accent);
  --dsw-alias-markdown-citation:var(--dut-paper-2);
  --dsw-alias-markdown-code-block:var(--dut-code);
  --dsw-alias-markdown-code-block-banner:var(--dut-paper-3);
  --dsw-alias-markdown-code-segment-selected:var(--dut-paper);
  --dsw-alias-markdown-code-segment-unselected:var(--dut-paper-2);
  --dsw-alias-markdown-placeholder:var(--dut-paper-2);
  --dsw-alias-markdown-tag:var(--dut-paper-2);
  --dsw-alias-scrollbar-bg-l1:var(--dut-scroll-1);
  --dsw-alias-scrollbar-bg-l2:var(--dut-scroll-1);
  --dsw-alias-scrollbar-hover-l1:var(--dut-scroll-2);
  --dsw-alias-scrollbar-hover-l2:var(--dut-scroll-2);
  --dsw-alias-state-business-primary:var(--dut-accent);
  --dsw-alias-state-business-tertiary:var(--dut-accent-soft);
  --dsw-alias-state-error-primary:var(--dut-error);
  --dsw-alias-state-error-secondary:var(--dut-error-2);
  --dsw-alias-state-success-primary:var(--dut-success);
  --dsw-alias-state-success-secondary:var(--dut-success-2);
  --dsw-alias-state-success-tertiary:var(--dut-success-3);
  --dsw-alias-state-warn-label:var(--dsw-static-amber-600);
  --dsw-alias-state-warn-primary:var(--dsw-static-amber-500);
  --dsw-alias-state-warn-secondary:var(--dsw-static-amber-400);
  --dsw-alias-state-warn-tertiary:var(--dut-warn-3);
  --dsw-alias-toast-bg:var(--dut-elev);
  --dsw-alias-tooltip-bg:var(--dut-elev);
  --dsw-specific-bubble:var(--dut-bubble);
  --dsw-specific-bubble-highlight:var(--dut-lime-soft);
  --dsw-specific-input-major:var(--dut-pop);
  --dsw-specific-login-input:var(--dut-paper-2);
  --dsw-specific-selector:var(--dut-pop);
  --dsw-specific-menu:var(--dut-pop);
  --dsw-specific-sidebar-fill:var(--dut-paper);
  --dsw-specific-sidebar-nav-item-active:var(--dut-lime-soft);
  /* NOT themed: despite the name this token feeds only the "推荐" chip in the
     question composer, and a lime slab behind text read as a highlighter mark
     rather than a chip — it stays on the host's own background. */
  --dsw-specific-sidebar-nav-item-hover:var(--dut-paper-2);
  --dsw-specific-tip:var(--dut-paper-2);
}
/* Dark scheme: re-point the design variables only — every alias mapping and
   element rule follows through var() indirection, so the host's scheme toggle
   flips the whole skin without a second copy of the rules. */
body:not(#dsh-ui-tweaks-theme-scope)[data-ds-dark-theme]{
  color-scheme:dark;
  --dut-paper:#0b0d10;
  --dut-paper-2:#14181d;
  --dut-paper-3:#1e252c;
  --dut-pop:#161c22;
  /* the poster frame drops to translucent white in dark mode: a solid
     near-white 2px frame plus its hard offset read as glare (see --dut-shadow) */
  --dut-ink:rgba(232,236,239,.42);
  /* a light strip would kill the red type here, so dark mode keeps a dark
     header strip lifted one step off the paper */
  --dut-th-bg:#1e252c;
  --dut-code:#171d24;
  --dut-text-1:#f2f5f3;
  --dut-text-2:#b9c3ca;
  --dut-text-3:#7f8d97;
  --dut-text-4:#66727c;
  --dut-btn-fg:#101418;
  --dut-lime:#c6ff00;
  --dut-lime-soft:#dcff4d;
  --dut-accent:#d97757;
  --dut-accent-soft:rgba(217,119,87,.18);
  --dut-accent-pale:#eec2b3;
  --dut-hover:rgba(217,119,87,.16);
  --dut-active:rgba(217,119,87,.26);
  /* text selection uses the native blue in both schemes */
  --dut-sel-bg:Highlight;
  --dut-sel-fg:HighlightText;
  --dut-faint:rgba(255,255,255,.07);
  --dut-scroll-1:#2a3138;
  --dut-scroll-2:#3a444d;
  --dut-elev:#1f262c;
  /* dark twin: the same red accent, deepened onto the near-black paper */
  --dut-bubble:#35201a;
  /* the hard offset band softens with it, so the sticker silhouette survives
     while the brightness does not */
  --dut-shadow:rgba(232,236,239,.16);
  --dut-drop:rgba(39,39,48,.7);
  --dut-line-1:rgba(255,255,255,.06);
  --dut-line-2:rgba(255,255,255,.12);
  --dut-line-3:rgba(255,255,255,.16);
  --dut-line-4:rgba(255,255,255,.20);
  --dut-error:var(--dsw-static-red-400);
  --dut-error-2:var(--dsw-static-red-400);
  --dut-success:var(--dsw-static-green-400);
  --dut-success-2:var(--dsw-static-green-400);
  --dut-success-3:var(--dsw-static-green-900);
  --dut-warn-3:var(--dsw-static-amber-900);
}
::selection{background:var(--dut-sel-bg);color:var(--dut-sel-fg)}
/* table header: the ink header strip, with the type in the accent red */
div[data-slot="conversation.chat.node"] table th{
  background:var(--dut-th-bg);
  color:var(--dut-accent);
}
div[data-slot="conversation.chat.node"] pre{
  border:2px solid var(--dut-ink) !important;
  border-radius:10px !important;
  box-shadow:5px 5px 0 var(--dut-shadow) !important;
  background:var(--dut-paper) !important;
}
div[data-slot="conversation.chat.node"] :not(pre)>code{
  color:var(--dut-accent) !important;
  border:none !important;
  border-radius:6px !important;
  padding:1px 6px !important;
}
/* composer card: white framed sticker (hard shadow, ink border) */
div[data-composer-card]{
  border:2px solid var(--dut-ink) !important;
  box-shadow:5px 5px 0 var(--dut-shadow) !important;
  background:var(--dut-paper) !important;
}
/* context-occupancy ring: the stock track/fill both read near-ink on this
   skin; give the track a quiet gray and the used arc the red accent
   (scoped to the composer's svg so the class-substring match stays safe) */
div[data-composer-card] svg [class*="track"]{stroke:var(--dut-scroll-1)}
div[data-composer-card] svg [class*="fill"]{stroke:var(--dut-accent)}
/* composer model seat and its dropdown menu: thinking-effort labels in solid
   band colors (Low green, Medium amber, High blue, Max Codex-violet).
   The effort watcher tags the label spans data-dut-effort — the trigger
   effort span, the menu root Effort cell value, and every effort-option
   label — while option row buttons carry the same band for the hover wash;
   Off/Default stay untagged in the stock caption. One plain span selector
   covers all three label surfaces — the attribute only exists where the
   watcher set it, so no hashed module class is touched. */
[data-slot="conversation.input.model"] span[data-dut-effort],
div[role="menu"] span[data-dut-effort]{font-weight:600}
[data-slot="conversation.input.model"] span[data-dut-effort="low"],
div[role="menu"] span[data-dut-effort="low"]{color:#15803d}
[data-slot="conversation.input.model"] span[data-dut-effort="medium"],
div[role="menu"] span[data-dut-effort="medium"]{color:#b45309}
[data-slot="conversation.input.model"] span[data-dut-effort="high"],
div[role="menu"] span[data-dut-effort="high"]{color:#1d4ed8}
[data-slot="conversation.input.model"] span[data-dut-effort="max"],
div[role="menu"] span[data-dut-effort="max"]{color:#7c3aed}
body:not(#dsh-ui-tweaks-theme-scope)[data-ds-dark-theme] [data-slot="conversation.input.model"] span[data-dut-effort="low"],
body:not(#dsh-ui-tweaks-theme-scope)[data-ds-dark-theme] div[role="menu"] span[data-dut-effort="low"]{color:#4ade80}
body:not(#dsh-ui-tweaks-theme-scope)[data-ds-dark-theme] [data-slot="conversation.input.model"] span[data-dut-effort="medium"],
body:not(#dsh-ui-tweaks-theme-scope)[data-ds-dark-theme] div[role="menu"] span[data-dut-effort="medium"]{color:#fbbf24}
body:not(#dsh-ui-tweaks-theme-scope)[data-ds-dark-theme] [data-slot="conversation.input.model"] span[data-dut-effort="high"],
body:not(#dsh-ui-tweaks-theme-scope)[data-ds-dark-theme] div[role="menu"] span[data-dut-effort="high"]{color:#60a5fa}
body:not(#dsh-ui-tweaks-theme-scope)[data-ds-dark-theme] [data-slot="conversation.input.model"] span[data-dut-effort="max"],
body:not(#dsh-ui-tweaks-theme-scope)[data-ds-dark-theme] div[role="menu"] span[data-dut-effort="max"]{color:#a78bfa}
/* Trigger chip: the input-box effort label additionally rides a translucent
   pill in its band hue (menu labels stay plain text). Padding/radius work
   as-is — the trigger is flex, so its spans are already blockified. */
[data-slot="conversation.input.model"] span[data-dut-effort]{
  padding:1px 7px;
  border-radius:999px;
}
[data-slot="conversation.input.model"] span[data-dut-effort="low"]{background:rgba(21,128,61,.12)}
[data-slot="conversation.input.model"] span[data-dut-effort="medium"]{background:rgba(180,83,9,.12)}
[data-slot="conversation.input.model"] span[data-dut-effort="high"]{background:rgba(29,78,216,.10)}
[data-slot="conversation.input.model"] span[data-dut-effort="max"]{background:rgba(124,58,237,.12)}
body:not(#dsh-ui-tweaks-theme-scope)[data-ds-dark-theme] [data-slot="conversation.input.model"] span[data-dut-effort="low"]{background:rgba(74,222,128,.18)}
body:not(#dsh-ui-tweaks-theme-scope)[data-ds-dark-theme] [data-slot="conversation.input.model"] span[data-dut-effort="medium"]{background:rgba(251,191,36,.18)}
body:not(#dsh-ui-tweaks-theme-scope)[data-ds-dark-theme] [data-slot="conversation.input.model"] span[data-dut-effort="high"]{background:rgba(96,165,250,.18)}
body:not(#dsh-ui-tweaks-theme-scope)[data-ds-dark-theme] [data-slot="conversation.input.model"] span[data-dut-effort="max"]{background:rgba(167,139,250,.20)}
/* Effort option rows: on hover the row background wipes in from the left in
   the band hue (translucent wash into transparency), overriding the stock
   row hover fill — same specificity contest the skin always wins by naming
   the attribute. background-size animates reliably (no background-clip text
   involved); honoring prefers-reduced-motion. */
div[role="menu"] button[data-dut-effort]{
  background-repeat:no-repeat;
  background-size:0% 100%;
  transition:background-size .6s ease;
}
div[role="menu"] button[data-dut-effort="low"]:hover{background-image:linear-gradient(90deg,rgba(21,128,61,.16),rgba(21,128,61,0));background-size:100% 100%}
div[role="menu"] button[data-dut-effort="medium"]:hover{background-image:linear-gradient(90deg,rgba(180,83,9,.16),rgba(180,83,9,0));background-size:100% 100%}
div[role="menu"] button[data-dut-effort="high"]:hover{background-image:linear-gradient(90deg,rgba(29,78,216,.14),rgba(29,78,216,0));background-size:100% 100%}
div[role="menu"] button[data-dut-effort="max"]:hover{background-image:linear-gradient(90deg,rgba(124,58,237,.16),rgba(124,58,237,0));background-size:100% 100%}
body:not(#dsh-ui-tweaks-theme-scope)[data-ds-dark-theme] div[role="menu"] button[data-dut-effort="low"]:hover{background-image:linear-gradient(90deg,rgba(74,222,128,.18),rgba(74,222,128,0));background-size:100% 100%}
body:not(#dsh-ui-tweaks-theme-scope)[data-ds-dark-theme] div[role="menu"] button[data-dut-effort="medium"]:hover{background-image:linear-gradient(90deg,rgba(251,191,36,.18),rgba(251,191,36,0));background-size:100% 100%}
body:not(#dsh-ui-tweaks-theme-scope)[data-ds-dark-theme] div[role="menu"] button[data-dut-effort="high"]:hover{background-image:linear-gradient(90deg,rgba(96,165,250,.20),rgba(96,165,250,0));background-size:100% 100%}
body:not(#dsh-ui-tweaks-theme-scope)[data-ds-dark-theme] div[role="menu"] button[data-dut-effort="max"]:hover{background-image:linear-gradient(90deg,rgba(167,139,250,.20),rgba(167,139,250,0));background-size:100% 100%}
@media (prefers-reduced-motion:reduce){
  div[role="menu"] button[data-dut-effort]{transition:none}
}
/* sidebar new-session button: lime sticker. Matched by its CSS-module class,
   NOT the aria-label — the brand row button shares the same "新建会话"
   label (it doubles as the new-session shortcut) and must stay plain. */
button[class*="newSession"]{
  background:var(--dut-lime) !important;
  color:#101418 !important;
  border:2px solid var(--dut-ink) !important;
  border-radius:10px !important;
  box-shadow:3px 3px 0 var(--dut-shadow) !important;
}
button[class*="newSession"]:hover{background:#d4ff33 !important;color:#101418 !important}
/* dark scheme: invert the sticker to a lime-outlined dark pill — a full lime
   slab was the loudest thing in the column and the black label read as a
   mistake next to the dark chrome */
body:not(#dsh-ui-tweaks-theme-scope)[data-ds-dark-theme] button[class*="newSession"],
body:not(#dsh-ui-tweaks-theme-scope)[data-ds-dark-theme] button[class*="newSession"]:hover{
  background:var(--dut-paper) !important;
  color:var(--dut-lime) !important;
  border-color:var(--dut-lime) !important;
  box-shadow:3px 3px 0 var(--dut-lime) !important;
}
/* The poster frame is the host's own 1px border (recolored) plus a 1px inset
   ring, not a real 2px border: a 2px border stole 2px of content width and
   wrapped the half-width alert cells ("仅页面不可见时" and its buttons broke
   onto two lines). An inset ring costs no layout. */
.dut-panel{border-color:var(--dut-ink) !important;box-shadow:inset 0 0 0 1px var(--dut-ink),5px 5px 0 var(--dut-shadow) !important}
.dut-seg button.dut-seg-active{background:var(--dut-lime) !important;color:#101418 !important}
.dut-btn.dut-btn-active{background:var(--dut-lime) !important;color:#101418 !important;border-color:var(--dut-ink) !important}
`;
function buildRuntimeCss(value) {
    const rules = [];
    // Code font tokens, emitted only when the code size leaves the stock 13px;
    // the message body, headings, user messages and composer stay theme stock.
    const fontCss = buildCodeFontCss(value.codeFontSize);
    if (fontCss !== '')
        rules.push(fontCss);
    // Inline code is pinned by DSH to 0.875em of the surrounding text (it ignores
    // the code token); scale that em by how far the chosen code size sits from
    // the stock ratio (a 13px block at the stock 16px body).
    if (Math.abs(value.codeFontSize - DEFAULT_CODE_FONT_SIZE) > 0.5) {
        const em = (0.875 * (value.codeFontSize / DEFAULT_CODE_FONT_SIZE)).toFixed(3);
        rules.push(`div[data-slot="conversation.chat.node"] div[class*="_markdown_"] :not(pre)>code{font-size:${em}em !important}`);
    }
    // Hide the DSH built-in turn-navigation rail while the timeline switch is
    // on 'web'. The rail is a `<nav>` whose inline style carries the frame's
    // `--turn-natural-height` custom property — unique to TurnNavigator (not a
    // hashed CSS-modules class, not locale-dependent), so the attribute
    // selector survives rebuilds as long as the custom property does.
    if (value.timelineStyle === 'web') {
        rules.push('nav[style*="--turn-natural-height"]{display:none !important}');
    }
    if (value.themeStyle === 'neon-lime') {
        rules.push(NEON_LIME_CSS);
    }
    return rules.join('\n');
}
function runtimeStyleElement() {
    const id = 'dsh-ui-tweaks-runtime';
    let style = document.querySelector(`style[data-plugin-css="${id}"]`);
    if (style === null) {
        style = document.createElement('style');
        style.dataset.plugin = 'dsh-ui-tweaks';
        style.dataset.pluginCss = id;
        document.head.appendChild(style);
    }
    return style;
}
const BASE_CSS = `
.dut-settings{display:grid;gap:8px;max-width:680px;padding:4px 2px 24px;color:var(--dsw-alias-label-primary)}
.dut-settings-header{display:flex;align-items:flex-start;gap:10px;padding:2px 2px 0}
.dut-logo{flex:none;display:grid;place-items:center;width:30px;height:30px;border-radius:9px;border:1px solid var(--dsw-alias-border-l1);background-image:linear-gradient(135deg,color-mix(in srgb,var(--dsw-alias-state-business-primary) 16%,transparent),transparent);font-size:15px;line-height:1}
.dut-settings-header h2{font-size:16px;letter-spacing:-.01em;margin:0 0 2px}
.dut-settings-header p{max-width:600px;margin:0;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1.45}
.dut-panel{display:grid;gap:0;border:1px solid var(--dsw-alias-border-l1);border-radius:14px;background:var(--dsw-alias-bg-layer-1);box-shadow:var(--dsw-shadow-lv1);overflow:hidden}
.dut-section-label{font-size:10.5px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--dsw-alias-label-tertiary);padding:9px 16px 4px}
.dut-field{display:grid;gap:6px;padding:7px 16px 10px}
.dut-field+.dut-field{border-top:1px solid var(--dsw-alias-border-l1)}
/* Two-column toggle grid: hairline dividers come from the 1px gap painting the
   panel's border color through; cells repaint the panel background above it. */
.dut-grid{grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:1px;background:var(--dsw-alias-border-l1)}
.dut-grid>.dut-section-label{grid-column:1/-1;background:var(--dsw-alias-bg-layer-1)}
.dut-grid .dut-field{background:var(--dsw-alias-bg-layer-1)}
.dut-grid .dut-field+.dut-field{border-top:none}
/* Subordinate rows (task-alert sub-toggles under the master switch): dimmed
   whole-row so the dependency reads at a glance; buttons disable separately. */
.dut-grid .dut-field.dut-sub-off{opacity:.5}
/* Task-alerts section packs its six sub-toggle cells TWO per row (the master
   row and the section label span all columns); very narrow panels fall back
   to a single column so nothing squeezes. */
.dut-grid.dut-grid-half{grid-template-columns:repeat(2,minmax(0,1fr))}
.dut-grid .dut-field.dut-span-all{grid-column:1/-1}
@media (max-width:640px){.dut-grid.dut-grid-half{grid-template-columns:minmax(0,1fr)}}
.dut-field-top{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
.dut-field-top>span{font-size:13.5px;font-weight:600}
.dut-label{display:inline-flex;align-items:center;gap:6px}
.dut-hint{flex:none;display:inline-grid;place-items:center;width:15px;height:15px;border-radius:50%;border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-tertiary);font-size:9.5px;font-weight:600;font-style:normal;line-height:1;cursor:help;user-select:none;transition:color .15s ease,border-color .15s ease}
.dut-hint:hover,.dut-hint:focus-visible{color:var(--dsw-alias-state-business-primary);border-color:var(--dsw-alias-state-business-primary)}
.dut-hint-pop{position:fixed;z-index:9999;width:max-content;max-width:300px;padding:8px 10px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-size:11.5px;line-height:1.5;box-shadow:0 4px 16px rgba(0,0,0,.14);pointer-events:none}
.dut-controls{display:flex;align-items:center;gap:8px}
.dut-stepper{display:inline-flex;align-items:center;border:1px solid var(--dsw-alias-border-l1);border-radius:9px;background:var(--dsw-alias-bg-layer-2);overflow:hidden}
.dut-stepper button{width:28px;height:28px;border:none;background:transparent;color:inherit;font-size:15px;font-weight:500;line-height:1;cursor:pointer;display:grid;place-items:center;transition:background .15s ease}
.dut-stepper button:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.dut-stepper button:disabled{opacity:.35;cursor:default}
.dut-stepper input{box-sizing:border-box;width:60px;height:28px;border:none;border-left:1px solid var(--dsw-alias-border-l1);border-right:1px solid var(--dsw-alias-border-l1);background:transparent;color:inherit;font:inherit;font-size:13px;text-align:center;-moz-appearance:textfield}
.dut-stepper input::-webkit-outer-spin-button,.dut-stepper input::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
.dut-stepper input:focus{outline:none}
.dut-seg{display:inline-flex;padding:3px;gap:3px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-2)}
.dut-seg button{border:none;border-radius:7px;padding:5px 12px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12.5px;cursor:pointer;transition:background .15s ease,color .15s ease}
.dut-seg button:hover:not(:disabled){color:var(--dsw-alias-label-primary)}
.dut-seg button.dut-seg-active{background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 12%,transparent);color:var(--dsw-alias-state-business-primary);font-weight:600;box-shadow:none}
.dut-seg button.dut-seg-active:hover:not(:disabled){color:var(--dsw-alias-state-business-primary)}
.dut-seg button:disabled{opacity:.45;cursor:default}
.dut-select{height:28px;padding:0 8px;border:1px solid var(--dsw-alias-border-l1);border-radius:9px;background:var(--dsw-alias-bg-layer-2);color:inherit;font:inherit;font-size:12.5px;cursor:pointer;color-scheme:light dark}
.dut-select:hover:not(:disabled){border-color:var(--dsw-alias-label-dimmed)}
.dut-select:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}
.dut-select:disabled{opacity:.45;cursor:default}
.dut-text-input{height:28px;width:110px;padding:0 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:9px;background:var(--dsw-alias-bg-layer-2);color:inherit;font:inherit;font-size:12.5px}
.dut-text-input:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}
.dut-text-input:disabled{opacity:.45}
.dut-note{padding:8px 16px 12px;font-size:11.5px;line-height:1.55;color:var(--dsw-alias-label-tertiary)}
/* The selected Settings-section tab — the stock shell paints a barely-there
   grey; brand-tint it so the selection reads clearly (and in the README shot). */
[role="dialog"] nav button[aria-selected="true"],[role="dialog"] nav button[aria-current="true"]{background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 12%,transparent);color:var(--dsw-alias-state-business-primary);font-weight:600}
.dut-btn{display:inline-flex;align-items:center;height:26px;padding:0 12px;border-radius:999px;border:1px solid var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11.5px;cursor:pointer;transition:background .15s ease,color .15s ease,border-color .15s ease}
.dut-btn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dut-btn.dut-btn-active{background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 12%,transparent);border-color:color-mix(in srgb,var(--dsw-alias-state-business-primary) 45%,transparent);color:var(--dsw-alias-state-business-primary)}
.dut-btn.dut-btn-active:hover{background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 18%,transparent);color:var(--dsw-alias-state-business-primary)}
.dut-btn:disabled{opacity:.4;cursor:default}
.dut-status{justify-self:start;font-size:11.5px;padding:3px 10px;border-radius:999px;background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 12%,transparent);color:var(--dsw-alias-state-success-primary);animation:dut-fadein .18s ease}
@keyframes dut-fadein{from{opacity:0;transform:translateY(-2px)}to{opacity:1;transform:none}}
.dut-loading{padding:16px;border-radius:12px;background:var(--dsw-alias-bg-layer-2);font-size:12px;color:var(--dsw-alias-label-secondary)}
.dut-alert{padding:10px 12px;border-radius:10px;font-size:12px;line-height:1.5}
.dut-alert.warning{background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 12%,transparent);color:var(--dsw-alias-state-warn-label)}
.dut-alert.error{background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 10%,transparent);color:var(--dsw-alias-state-error-primary)}
`;
function installBaseStyles() {
    const id = 'dsh-ui-tweaks-base';
    const existing = document.querySelector(`style[data-plugin-css="${id}"]`);
    if (existing !== null)
        return () => { };
    const style = document.createElement('style');
    style.dataset.plugin = 'dsh-ui-tweaks';
    style.dataset.pluginCss = id;
    style.textContent = BASE_CSS;
    document.head.appendChild(style);
    return () => { style.remove(); };
}
/**
 * Settings requests retry briefly on 502/503: writing the profile patch
 * hot-reloads the `web` node and restarts this plugin for a moment (it
 * injects `web`), so a toggle click can land inside that window. The retry
 * rides it out instead of surfacing "settings unavailable".
 */
async function apiRequest(init) {
    let lastError;
    for (let attempt = 1; attempt <= 6; attempt++) {
        try {
            const response = await fetch(SETTINGS_ROUTE, { credentials: 'same-origin', ...init });
            const body = await response.json();
            if (response.ok && body.ok)
                return body.value;
            const failure = body;
            const retryable = response.status === 502 || response.status === 503;
            lastError = new Error(failure.error?.message ?? `UI Tweaks request failed with HTTP ${response.status}`);
            if (!retryable)
                throw lastError;
        }
        catch (error) {
            lastError = error;
        }
        await new Promise((resolve) => setTimeout(resolve, attempt * 250));
    }
    throw lastError ?? new Error('UI Tweaks request failed');
}
/** Small external store shared by the Settings route and the CSS engine. */
class SettingsClient {
    state = { status: 'loading', writable: false, value: undefined, revision: undefined };
    listeners = new Set();
    generation = 0;
    subscribe = (listener) => {
        this.listeners.add(listener);
        return () => { this.listeners.delete(listener); };
    };
    getSnapshot = () => this.state;
    publish(next) {
        this.state = next;
        for (const listener of this.listeners)
            listener();
    }
    async load() {
        const generation = ++this.generation;
        if (this.state.status === 'loading')
            this.publish({ ...this.state, status: 'loading' });
        try {
            const snapshot = await apiRequest();
            if (generation !== this.generation)
                return;
            this.publish({
                status: 'ready',
                writable: snapshot.writable,
                value: snapshot.value,
                revision: snapshot.revision,
            });
        }
        catch (error) {
            if (generation !== this.generation)
                return;
            this.publish({ ...this.state, status: 'error', error: error instanceof Error ? error.message : String(error) });
        }
    }
    async post(payload) {
        const generation = ++this.generation;
        const snapshot = await apiRequest({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        if (generation !== this.generation)
            return;
        this.publish({
            status: 'ready',
            writable: snapshot.writable,
            value: snapshot.value,
            revision: snapshot.revision,
        });
    }
    async set(field, value) {
        await this.post({ action: 'set', field, value, expectedRevision: this.state.revision ?? 0 });
    }
    async unset(field) {
        await this.post({ action: 'unset', field, expectedRevision: this.state.revision ?? 0 });
    }
}
exports.SettingsClient = SettingsClient;
/** Required client services: slots (settings.section), locale, sessions (git bar, archive, notifier), the slash-command registry, and the scope-addressed conversation face. The right-sidebar tab registry (terminal/diff tabs) is resolved lazily — older hosts without it still load everything else. */
exports.inject = ['slots', 'locale', 'sessions', 'commandUi', 'conversation', 'uiSession'];
/**
 * Hover/focus hint: a small ⓘ next to the field label; the hint text renders
 * in a fixed-position bubble portaled to <body> (so panel `overflow:hidden`
 * can never clip it), measured in a layout effect to prefer the space above
 * the anchor and flip below near the viewport top. No layout shift: hints
 * never occupy flow height.
 */
function Hint({ text }) {
    const anchorRef = (0, react_1.useRef)(null);
    const popRef = (0, react_1.useRef)(null);
    const [open, setOpen] = (0, react_1.useState)(false);
    const [pos, setPos] = (0, react_1.useState)({ top: -9999, left: -9999 });
    (0, react_1.useLayoutEffect)(() => {
        if (!open)
            return;
        const anchor = anchorRef.current?.getBoundingClientRect();
        const pop = popRef.current;
        if (anchor === undefined || pop === null)
            return;
        let left = Math.min(Math.max(8, anchor.left), window.innerWidth - pop.offsetWidth - 8);
        let top = anchor.top - pop.offsetHeight - 8;
        if (top < 8)
            top = anchor.bottom + 8;
        setPos({ top, left });
    }, [open]);
    return ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsx)("span", { ref: anchorRef, className: "dut-hint", role: "note", "aria-label": text, tabIndex: 0, onMouseEnter: () => { setOpen(true); }, onMouseLeave: () => { setOpen(false); }, onFocus: () => { setOpen(true); }, onBlur: () => { setOpen(false); }, children: "i" }), open && (0, react_dom_1.createPortal)((0, jsx_runtime_1.jsx)("div", { ref: popRef, className: "dut-hint-pop", style: { top: pos.top, left: pos.left }, children: text }), document.body)] }));
}
function SettingsSection({ controller, t }) {
    const state = (0, react_1.useSyncExternalStore)(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
    const resolved = resolveValue(state.value);
    const writable = state.writable;
    const [codeDraft, setCodeDraft] = (0, react_1.useState)(String(resolved.codeFontSize));
    const [status, setStatus] = (0, react_1.useState)(undefined);
    (0, react_1.useEffect)(() => { if (state.status === 'loading' && state.value === undefined)
        void controller.load(); }, [controller, state.status, state.value]);
    (0, react_1.useEffect)(() => { setCodeDraft(String(resolved.codeFontSize)); }, [resolved.codeFontSize]);
    (0, react_1.useEffect)(() => {
        if (status === undefined)
            return;
        const timer = setTimeout(() => { setStatus(undefined); }, 1800);
        return () => { clearTimeout(timer); };
    }, [status]);
    const commitCodeSize = (raw) => {
        setCodeDraft(raw);
        const parsed = Number(raw);
        if (!Number.isFinite(parsed))
            return;
        const clamped = Math.min(MAX_CODE_FONT_SIZE, Math.max(MIN_CODE_FONT_SIZE, Math.round(parsed)));
        setCodeDraft(String(clamped));
        void controller.set('codeFontSize', clamped).then(() => { setStatus('applied'); }).catch(() => { setStatus('unavailable'); });
    };
    const stepCodeSize = (delta) => {
        const next = Math.min(MAX_CODE_FONT_SIZE, Math.max(MIN_CODE_FONT_SIZE, resolved.codeFontSize + delta));
        setCodeDraft(String(next));
        void controller.set('codeFontSize', next).then(() => { setStatus('applied'); }).catch(() => { setStatus('unavailable'); });
    };
    const setGitBar = (value) => {
        void controller.set('gitBarEnabled', value).then(() => { setStatus('applied'); }).catch(() => { setStatus('unavailable'); });
    };
    const setArchiveManager = (value) => {
        void controller.set('archiveManagerEnabled', value).then(() => { setStatus('applied'); }).catch(() => { setStatus('unavailable'); });
    };
    const setMcpManager = (value) => {
        void controller.set('mcpManagerEnabled', value).then(() => { setStatus('applied'); }).catch(() => { setStatus('unavailable'); });
    };
    const setSearchEnabled = (value) => {
        void controller.set('searchEnabled', value).then(() => {
            setStatus('applied');
            // Mirror the toggle into the profile patch AFTER the settings write
            // lands; the explicit `enabled` avoids racing the server-side read.
            // The patch write hot-reloads the web node (the plugin restarts with
            // it); the settings route's own retry absorbs the downtime.
            void fetch('/_dsh/ui-tweaks/search', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'sync-patch', enabled: value }),
            }).catch(() => { });
        }).catch(() => { setStatus('unavailable'); });
    };
    const setInitCommand = (value) => {
        void controller.set('initCommandEnabled', value).then(() => { setStatus('applied'); }).catch(() => { setStatus('unavailable'); });
    };
    const setTimeline = (value) => {
        void controller.set('timelineStyle', value).then(() => { setStatus('applied'); }).catch(() => { setStatus('unavailable'); });
    };
    const setPreciseCacheHit = (value) => {
        void controller.set('preciseCacheHitEnabled', value).then(() => { setStatus('applied'); }).catch(() => { setStatus('unavailable'); });
    };
    const setTheme = (value) => {
        void controller.set('themeStyle', value).then(() => { setStatus('applied'); }).catch(() => { setStatus('unavailable'); });
    };
    /** Master switch; enabling also asks for notification permission inside this click gesture. */
    const setNotifications = (value) => {
        if (value)
            (0, notifier_ts_1.requestNotifyPermission)();
        void controller.set('notificationsEnabled', value).then(() => { setStatus('applied'); }).catch(() => { setStatus('unavailable'); });
    };
    /** Channel/event toggles share one setter shape; the system-notification one requests permission too. */
    const setNotifyField = (field, value) => {
        if (field === 'notifySystemNotification' && value)
            (0, notifier_ts_1.requestNotifyPermission)();
        void controller.set(field, value).then(() => { setStatus('applied'); }).catch(() => { setStatus('unavailable'); });
    };
    const testNotifications = () => {
        (0, notifier_ts_1.requestNotifyPermission)();
        (0, notifier_ts_1.previewAlerts)({
            titleFlash: resolved.notifyTitleFlash,
            systemNotification: resolved.notifySystemNotification,
            sound: resolved.notifySound,
        }, {
            notifyTitleDone: t('notifyTitleDone'),
            notifyTitleAborted: t('notifyTitleAborted'),
            notifyTitleFailed: t('notifyTitleFailed'),
            notifyTitlePending: t('notifyTitlePending'),
            bodyComplete: t('bodyComplete'),
            bodyAborted: t('bodyAborted'),
            bodyFailed: t('bodyFailed'),
            bodyApproval: t('bodyApproval'),
            bodyPlan: t('bodyPlan'),
            bodyQuestion: t('bodyQuestion'),
        });
    };
    /** Code size reset clears BOTH keys: the px input and the legacy percentage. */
    const resetCodeSize = () => {
        void (async () => {
            try {
                await controller.unset('codeFontSize');
                await controller.unset('codeFontScale');
                setStatus('resetDone');
            }
            catch {
                setStatus('unavailable');
            }
        })();
    };
    if (state.status === 'loading' && state.value === undefined) {
        return (0, jsx_runtime_1.jsx)("div", { className: "dut-settings", children: (0, jsx_runtime_1.jsx)("div", { className: "dut-loading", children: t('loading') }) });
    }
    if (state.status === 'error') {
        return (0, jsx_runtime_1.jsx)("div", { className: "dut-settings", children: (0, jsx_runtime_1.jsx)("div", { className: "dut-alert error", children: t('unavailable') }) });
    }
    return ((0, jsx_runtime_1.jsxs)("div", { className: "dut-settings", children: [(0, jsx_runtime_1.jsxs)("header", { className: "dut-settings-header", children: [(0, jsx_runtime_1.jsx)("div", { className: "dut-logo", children: "\uD83C\uDFA8" }), (0, jsx_runtime_1.jsxs)("div", { children: [(0, jsx_runtime_1.jsx)("h2", { children: t('settingsTitle') }), (0, jsx_runtime_1.jsx)("p", { children: t('settingsIntro') })] })] }), !writable ? (0, jsx_runtime_1.jsx)("div", { className: "dut-alert warning", children: t('readOnly') }) : null, status === undefined ? null : (0, jsx_runtime_1.jsx)("div", { className: "dut-status", children: t(status) }), (0, jsx_runtime_1.jsxs)("section", { className: "dut-panel", children: [(0, jsx_runtime_1.jsx)("div", { className: "dut-section-label", children: t('sectionText') }), (0, jsx_runtime_1.jsx)("div", { className: "dut-field", children: (0, jsx_runtime_1.jsxs)("div", { className: "dut-field-top", children: [(0, jsx_runtime_1.jsxs)("span", { className: "dut-label", children: [t('codeFontSize'), (0, jsx_runtime_1.jsx)(Hint, { text: t('codeFontSizeHint') })] }), (0, jsx_runtime_1.jsxs)("div", { className: "dut-controls", children: [(0, jsx_runtime_1.jsxs)("div", { className: "dut-stepper", children: [(0, jsx_runtime_1.jsx)("button", { type: "button", "aria-label": "\u2212", disabled: !writable || resolved.codeFontSize <= MIN_CODE_FONT_SIZE, onClick: () => { stepCodeSize(-1); }, children: "\u2212" }), (0, jsx_runtime_1.jsx)("input", { type: "number", min: MIN_CODE_FONT_SIZE, max: MAX_CODE_FONT_SIZE, step: 1, value: codeDraft, disabled: !writable, onChange: (event) => { setCodeDraft(event.target.value); }, onBlur: (event) => { commitCodeSize(event.target.value); }, onKeyDown: (event) => { if (event.key === 'Enter')
                                                        commitCodeSize(event.target.value); } }), (0, jsx_runtime_1.jsx)("button", { type: "button", "aria-label": "+", disabled: !writable || resolved.codeFontSize >= MAX_CODE_FONT_SIZE, onClick: () => { stepCodeSize(1); }, children: "+" })] }), (0, jsx_runtime_1.jsx)("button", { type: "button", className: 'dut-btn' + (resolved.codeFontSize === DEFAULT_CODE_FONT_SIZE ? ' dut-btn-active' : ''), disabled: !writable, onClick: () => { resetCodeSize(); }, children: t('defaultAction') })] })] }) })] }), (0, jsx_runtime_1.jsxs)("section", { className: "dut-panel", children: [(0, jsx_runtime_1.jsx)("div", { className: "dut-section-label", children: t('sectionLayout') }), (0, jsx_runtime_1.jsx)("div", { className: "dut-field", children: (0, jsx_runtime_1.jsxs)("div", { className: "dut-field-top", children: [(0, jsx_runtime_1.jsxs)("span", { className: "dut-label", children: [t('theme'), (0, jsx_runtime_1.jsx)(Hint, { text: t('themeHint') })] }), (0, jsx_runtime_1.jsx)("div", { className: "dut-controls", children: (0, jsx_runtime_1.jsxs)("div", { className: "dut-seg", children: [(0, jsx_runtime_1.jsx)("button", { type: "button", className: resolved.themeStyle === 'neon-lime' ? 'dut-seg-active' : '', disabled: !writable, onClick: () => { setTheme('neon-lime'); }, children: t('themeNeonLime') }), (0, jsx_runtime_1.jsx)("button", { type: "button", className: resolved.themeStyle === 'default' ? 'dut-seg-active' : '', disabled: !writable, onClick: () => { setTheme('default'); }, children: t('themeDefault') })] }) })] }) }), (0, jsx_runtime_1.jsx)("div", { className: "dut-field", children: (0, jsx_runtime_1.jsxs)("div", { className: "dut-field-top", children: [(0, jsx_runtime_1.jsxs)("span", { className: "dut-label", children: [t('preciseCacheHit'), (0, jsx_runtime_1.jsx)(Hint, { text: t('preciseCacheHitHint') })] }), (0, jsx_runtime_1.jsx)("div", { className: "dut-controls", children: (0, jsx_runtime_1.jsxs)("div", { className: "dut-seg", children: [(0, jsx_runtime_1.jsx)("button", { type: "button", className: resolved.preciseCacheHitEnabled ? 'dut-seg-active' : '', disabled: !writable, onClick: () => { setPreciseCacheHit(true); }, children: t('preciseCacheHitOn') }), (0, jsx_runtime_1.jsx)("button", { type: "button", className: !resolved.preciseCacheHitEnabled ? 'dut-seg-active' : '', disabled: !writable, onClick: () => { setPreciseCacheHit(false); }, children: t('preciseCacheHitOff') })] }) })] }) })] }), (0, jsx_runtime_1.jsxs)("section", { className: "dut-panel", children: [(0, jsx_runtime_1.jsx)("div", { className: "dut-section-label", children: t('sectionSearch') }), (0, jsx_runtime_1.jsx)("div", { className: "dut-field", children: (0, jsx_runtime_1.jsxs)("div", { className: "dut-field-top", children: [(0, jsx_runtime_1.jsxs)("span", { className: "dut-label", children: [t('searchEnabled'), (0, jsx_runtime_1.jsx)(Hint, { text: t('searchEnabledHint') })] }), (0, jsx_runtime_1.jsx)("div", { className: "dut-controls", children: (0, jsx_runtime_1.jsxs)("div", { className: "dut-seg", children: [(0, jsx_runtime_1.jsx)("button", { type: "button", className: resolved.searchEnabled ? 'dut-seg-active' : '', disabled: !writable, onClick: () => { setSearchEnabled(true); }, children: t('searchOn') }), (0, jsx_runtime_1.jsx)("button", { type: "button", className: !resolved.searchEnabled ? 'dut-seg-active' : '', disabled: !writable, onClick: () => { setSearchEnabled(false); }, children: t('searchOff') })] }) })] }) })] }), (0, jsx_runtime_1.jsxs)("section", { className: "dut-panel dut-grid", children: [(0, jsx_runtime_1.jsx)("div", { className: "dut-section-label", children: t('sectionFeatures') }), (0, jsx_runtime_1.jsx)("div", { className: "dut-field", children: (0, jsx_runtime_1.jsxs)("div", { className: "dut-field-top", children: [(0, jsx_runtime_1.jsxs)("span", { className: "dut-label", children: [t('timeline'), (0, jsx_runtime_1.jsx)(Hint, { text: t('timelineHint') })] }), (0, jsx_runtime_1.jsx)("div", { className: "dut-controls", children: (0, jsx_runtime_1.jsxs)("div", { className: "dut-seg", children: [(0, jsx_runtime_1.jsx)("button", { type: "button", className: resolved.timelineStyle === 'native' ? 'dut-seg-active' : '', disabled: !writable, onClick: () => { setTimeline('native'); }, children: t('timelineNative') }), (0, jsx_runtime_1.jsx)("button", { type: "button", className: resolved.timelineStyle === 'web' ? 'dut-seg-active' : '', disabled: !writable, onClick: () => { setTimeline('web'); }, children: t('timelineWeb') })] }) })] }) }), (0, jsx_runtime_1.jsx)("div", { className: "dut-field", children: (0, jsx_runtime_1.jsxs)("div", { className: "dut-field-top", children: [(0, jsx_runtime_1.jsxs)("span", { className: "dut-label", children: [t('gitBar'), (0, jsx_runtime_1.jsx)(Hint, { text: t('gitBarHint') })] }), (0, jsx_runtime_1.jsx)("div", { className: "dut-controls", children: (0, jsx_runtime_1.jsxs)("div", { className: "dut-seg", children: [(0, jsx_runtime_1.jsx)("button", { type: "button", className: resolved.gitBarEnabled ? 'dut-seg-active' : '', disabled: !writable, onClick: () => { setGitBar(true); }, children: t('gitBarOn') }), (0, jsx_runtime_1.jsx)("button", { type: "button", className: !resolved.gitBarEnabled ? 'dut-seg-active' : '', disabled: !writable, onClick: () => { setGitBar(false); }, children: t('gitBarOff') })] }) })] }) }), (0, jsx_runtime_1.jsx)("div", { className: "dut-field", children: (0, jsx_runtime_1.jsxs)("div", { className: "dut-field-top", children: [(0, jsx_runtime_1.jsxs)("span", { className: "dut-label", children: [t('archiveManager'), (0, jsx_runtime_1.jsx)(Hint, { text: t('archiveManagerHint') })] }), (0, jsx_runtime_1.jsx)("div", { className: "dut-controls", children: (0, jsx_runtime_1.jsxs)("div", { className: "dut-seg", children: [(0, jsx_runtime_1.jsx)("button", { type: "button", className: resolved.archiveManagerEnabled ? 'dut-seg-active' : '', disabled: !writable, onClick: () => { setArchiveManager(true); }, children: t('archiveManagerOn') }), (0, jsx_runtime_1.jsx)("button", { type: "button", className: !resolved.archiveManagerEnabled ? 'dut-seg-active' : '', disabled: !writable, onClick: () => { setArchiveManager(false); }, children: t('archiveManagerOff') })] }) })] }) }), (0, jsx_runtime_1.jsx)("div", { className: "dut-field", children: (0, jsx_runtime_1.jsxs)("div", { className: "dut-field-top", children: [(0, jsx_runtime_1.jsxs)("span", { className: "dut-label", children: [t('mcpManager'), (0, jsx_runtime_1.jsx)(Hint, { text: t('mcpManagerHint') })] }), (0, jsx_runtime_1.jsx)("div", { className: "dut-controls", children: (0, jsx_runtime_1.jsxs)("div", { className: "dut-seg", children: [(0, jsx_runtime_1.jsx)("button", { type: "button", className: resolved.mcpManagerEnabled ? 'dut-seg-active' : '', disabled: !writable, onClick: () => { setMcpManager(true); }, children: t('mcpManagerOn') }), (0, jsx_runtime_1.jsx)("button", { type: "button", className: !resolved.mcpManagerEnabled ? 'dut-seg-active' : '', disabled: !writable, onClick: () => { setMcpManager(false); }, children: t('mcpManagerOff') })] }) })] }) }), (0, jsx_runtime_1.jsx)("div", { className: "dut-field", children: (0, jsx_runtime_1.jsxs)("div", { className: "dut-field-top", children: [(0, jsx_runtime_1.jsxs)("span", { className: "dut-label", children: [t('initCommand'), (0, jsx_runtime_1.jsx)(Hint, { text: t('initCommandHint') })] }), (0, jsx_runtime_1.jsx)("div", { className: "dut-controls", children: (0, jsx_runtime_1.jsxs)("div", { className: "dut-seg", children: [(0, jsx_runtime_1.jsx)("button", { type: "button", className: resolved.initCommandEnabled ? 'dut-seg-active' : '', disabled: !writable, onClick: () => { setInitCommand(true); }, children: t('initCommandOn') }), (0, jsx_runtime_1.jsx)("button", { type: "button", className: !resolved.initCommandEnabled ? 'dut-seg-active' : '', disabled: !writable, onClick: () => { setInitCommand(false); }, children: t('initCommandOff') })] }) })] }) })] }), (0, jsx_runtime_1.jsxs)("section", { className: "dut-panel dut-grid dut-grid-half", children: [(0, jsx_runtime_1.jsx)("div", { className: "dut-section-label", children: t('sectionNotifications') }), (0, jsx_runtime_1.jsx)("div", { className: "dut-field dut-span-all", children: (0, jsx_runtime_1.jsxs)("div", { className: "dut-field-top", children: [(0, jsx_runtime_1.jsxs)("span", { className: "dut-label", children: [t('notifications'), (0, jsx_runtime_1.jsx)(Hint, { text: t('notificationsHint') })] }), (0, jsx_runtime_1.jsxs)("div", { className: "dut-controls", children: [(0, jsx_runtime_1.jsxs)("div", { className: "dut-seg", children: [(0, jsx_runtime_1.jsx)("button", { type: "button", className: resolved.notificationsEnabled ? 'dut-seg-active' : '', disabled: !writable, onClick: () => { setNotifications(true); }, children: t('notifyOn') }), (0, jsx_runtime_1.jsx)("button", { type: "button", className: !resolved.notificationsEnabled ? 'dut-seg-active' : '', disabled: !writable, onClick: () => { setNotifications(false); }, children: t('notifyOff') })] }), (0, jsx_runtime_1.jsx)("button", { type: "button", className: "dut-btn", disabled: !resolved.notificationsEnabled, onClick: () => { testNotifications(); }, children: t('notifyTest') })] })] }) }), (0, jsx_runtime_1.jsx)("div", { className: 'dut-field' + (!resolved.notificationsEnabled ? ' dut-sub-off' : ''), children: (0, jsx_runtime_1.jsxs)("div", { className: "dut-field-top", children: [(0, jsx_runtime_1.jsxs)("span", { className: "dut-label", children: [t('notifyOnComplete'), (0, jsx_runtime_1.jsx)(Hint, { text: t('notifyOnCompleteHint') })] }), (0, jsx_runtime_1.jsx)("div", { className: "dut-controls", children: (0, jsx_runtime_1.jsxs)("div", { className: "dut-seg", children: [(0, jsx_runtime_1.jsx)("button", { type: "button", className: resolved.notifyOnComplete ? 'dut-seg-active' : '', disabled: !writable || !resolved.notificationsEnabled, onClick: () => { setNotifyField('notifyOnComplete', true); }, children: t('notifyOn') }), (0, jsx_runtime_1.jsx)("button", { type: "button", className: !resolved.notifyOnComplete ? 'dut-seg-active' : '', disabled: !writable || !resolved.notificationsEnabled, onClick: () => { setNotifyField('notifyOnComplete', false); }, children: t('notifyOff') })] }) })] }) }), (0, jsx_runtime_1.jsx)("div", { className: 'dut-field' + (!resolved.notificationsEnabled ? ' dut-sub-off' : ''), children: (0, jsx_runtime_1.jsxs)("div", { className: "dut-field-top", children: [(0, jsx_runtime_1.jsxs)("span", { className: "dut-label", children: [t('notifyOnInteraction'), (0, jsx_runtime_1.jsx)(Hint, { text: t('notifyOnInteractionHint') })] }), (0, jsx_runtime_1.jsx)("div", { className: "dut-controls", children: (0, jsx_runtime_1.jsxs)("div", { className: "dut-seg", children: [(0, jsx_runtime_1.jsx)("button", { type: "button", className: resolved.notifyOnInteraction ? 'dut-seg-active' : '', disabled: !writable || !resolved.notificationsEnabled, onClick: () => { setNotifyField('notifyOnInteraction', true); }, children: t('notifyOn') }), (0, jsx_runtime_1.jsx)("button", { type: "button", className: !resolved.notifyOnInteraction ? 'dut-seg-active' : '', disabled: !writable || !resolved.notificationsEnabled, onClick: () => { setNotifyField('notifyOnInteraction', false); }, children: t('notifyOff') })] }) })] }) }), (0, jsx_runtime_1.jsx)("div", { className: 'dut-field' + (!resolved.notificationsEnabled ? ' dut-sub-off' : ''), children: (0, jsx_runtime_1.jsxs)("div", { className: "dut-field-top", children: [(0, jsx_runtime_1.jsxs)("span", { className: "dut-label", children: [t('notifyOnlyWhenHidden'), (0, jsx_runtime_1.jsx)(Hint, { text: t('notifyOnlyWhenHiddenHint') })] }), (0, jsx_runtime_1.jsx)("div", { className: "dut-controls", children: (0, jsx_runtime_1.jsxs)("div", { className: "dut-seg", children: [(0, jsx_runtime_1.jsx)("button", { type: "button", className: resolved.notifyOnlyWhenHidden ? 'dut-seg-active' : '', disabled: !writable || !resolved.notificationsEnabled, onClick: () => { setNotifyField('notifyOnlyWhenHidden', true); }, children: t('notifyOn') }), (0, jsx_runtime_1.jsx)("button", { type: "button", className: !resolved.notifyOnlyWhenHidden ? 'dut-seg-active' : '', disabled: !writable || !resolved.notificationsEnabled, onClick: () => { setNotifyField('notifyOnlyWhenHidden', false); }, children: t('notifyOff') })] }) })] }) }), (0, jsx_runtime_1.jsx)("div", { className: 'dut-field' + (!resolved.notificationsEnabled ? ' dut-sub-off' : ''), children: (0, jsx_runtime_1.jsxs)("div", { className: "dut-field-top", children: [(0, jsx_runtime_1.jsxs)("span", { className: "dut-label", children: [t('notifyTitleFlash'), (0, jsx_runtime_1.jsx)(Hint, { text: t('notifyTitleFlashHint') })] }), (0, jsx_runtime_1.jsx)("div", { className: "dut-controls", children: (0, jsx_runtime_1.jsxs)("div", { className: "dut-seg", children: [(0, jsx_runtime_1.jsx)("button", { type: "button", className: resolved.notifyTitleFlash ? 'dut-seg-active' : '', disabled: !writable || !resolved.notificationsEnabled, onClick: () => { setNotifyField('notifyTitleFlash', true); }, children: t('notifyOn') }), (0, jsx_runtime_1.jsx)("button", { type: "button", className: !resolved.notifyTitleFlash ? 'dut-seg-active' : '', disabled: !writable || !resolved.notificationsEnabled, onClick: () => { setNotifyField('notifyTitleFlash', false); }, children: t('notifyOff') })] }) })] }) }), (0, jsx_runtime_1.jsx)("div", { className: 'dut-field' + (!resolved.notificationsEnabled ? ' dut-sub-off' : ''), children: (0, jsx_runtime_1.jsxs)("div", { className: "dut-field-top", children: [(0, jsx_runtime_1.jsxs)("span", { className: "dut-label", children: [t('notifySystemNotification'), (0, jsx_runtime_1.jsx)(Hint, { text: t('notifySystemNotificationHint') })] }), (0, jsx_runtime_1.jsx)("div", { className: "dut-controls", children: (0, jsx_runtime_1.jsxs)("div", { className: "dut-seg", children: [(0, jsx_runtime_1.jsx)("button", { type: "button", className: resolved.notifySystemNotification ? 'dut-seg-active' : '', disabled: !writable || !resolved.notificationsEnabled, onClick: () => { setNotifyField('notifySystemNotification', true); }, children: t('notifyOn') }), (0, jsx_runtime_1.jsx)("button", { type: "button", className: !resolved.notifySystemNotification ? 'dut-seg-active' : '', disabled: !writable || !resolved.notificationsEnabled, onClick: () => { setNotifyField('notifySystemNotification', false); }, children: t('notifyOff') })] }) })] }) }), (0, jsx_runtime_1.jsx)("div", { className: 'dut-field' + (!resolved.notificationsEnabled ? ' dut-sub-off' : ''), children: (0, jsx_runtime_1.jsxs)("div", { className: "dut-field-top", children: [(0, jsx_runtime_1.jsxs)("span", { className: "dut-label", children: [t('notifySound'), (0, jsx_runtime_1.jsx)(Hint, { text: t('notifySoundHint') })] }), (0, jsx_runtime_1.jsx)("div", { className: "dut-controls", children: (0, jsx_runtime_1.jsxs)("div", { className: "dut-seg", children: [(0, jsx_runtime_1.jsx)("button", { type: "button", className: resolved.notifySound ? 'dut-seg-active' : '', disabled: !writable || !resolved.notificationsEnabled, onClick: () => { setNotifyField('notifySound', true); }, children: t('notifyOn') }), (0, jsx_runtime_1.jsx)("button", { type: "button", className: !resolved.notifySound ? 'dut-seg-active' : '', disabled: !writable || !resolved.notificationsEnabled, onClick: () => { setNotifyField('notifySound', false); }, children: t('notifyOff') })] }) })] }) })] })] }));
}
/**
 * The /init bootstrap prompts, submitted verbatim into the current session on
 * pick. Modeled after the classic coding-agent `/init`: explore the project,
 * then write (or improve) a root AGENTS.md addressed to future AI agents.
 */
const INIT_PROMPT_ZH = [
    '请为本项目生成一份面向 AI 编码代理的 AGENTS.md，放在仓库根目录：',
    '',
    '1. 先自行探索项目——阅读 README、清单文件（package.json / pyproject.toml 等）、构建脚本与关键源码目录，不要向我追问这些信息；',
    '2. AGENTS.md 用中文撰写，包含：项目简介、常用命令（安装 / 构建 / 测试 / 检查）、代码风格与约定、目录结构导览、已知注意事项；',
    '3. 只写从代码中验证过的事实，保持简洁（建议不超过 150 行），不要臆测；',
    '4. 如果已存在 AGENTS.md，在其基础上改进补充，不要丢失已有内容；',
    '5. 完成后简要汇报你写了什么。',
].join('\n');
const INIT_PROMPT_EN = [
    'Generate an AGENTS.md for this project at the repository root, addressed to future AI coding agents:',
    '',
    '1. Explore the project first — read the README, manifest files (package.json / pyproject.toml etc.), build scripts and key source directories; do not ask me about them.',
    '2. Write the AGENTS.md in English covering: project overview, common commands (install / build / test / lint), code style and conventions, a directory guide, and known gotchas.',
    '3. Only state facts verified from the code; keep it concise (~150 lines max); no speculation.',
    '4. If an AGENTS.md already exists, improve it in place without losing existing content.',
    '5. Briefly report what you wrote when done.',
].join('\n');
/**
 * Register the `/init` slash command: a client-owned contribution that pops a
 * language picker and submits the matching AGENTS.md bootstrap prompt into
 * the picked session via the scope-addressed conversation face
 * (`ctx.sessions.scope(id).conversation.send` — the same hop DSH's own
 * packages use). Contribution rows merge into the host catalog by name; the
 * description is a thunk so a mid-session language switch re-renders it live.
 */
function registerInitCommand(ctx) {
    const t = ctx.locale.bind(NS);
    return ctx.commandUi.register({
        name: 'init',
        description: () => t('initDesc'),
        available: () => true,
        ui: {
            kind: 'popupSelect',
            options: () => Promise.resolve([
                { id: 'zh', label: t('initOptionZh'), detail: t('initOptionZhDetail') },
                { id: 'en', label: t('initOptionEn'), detail: t('initOptionEnDetail') },
            ]),
            onSelect: async (option, session) => {
                const prompt = option.id === 'en' ? INIT_PROMPT_EN : INIT_PROMPT_ZH;
                const scoped = ctx.sessions.scope(session.sessionId);
                if (scoped === undefined) {
                    console.error(`[dsh-ui-tweaks] ${t('initFailed')}: session ${session.sessionId} is not scoped`);
                    return;
                }
                // Route through the session's input facade (draft + submit) instead of
                // a bare conversation.send: the hub's own send choreography then
                // handles first-message materialization for a brand-new session, plus
                // queue/steer policy while a turn is running. A direct send cannot
                // start an unmaterialized session and fails silently there.
                const input = ctx.conversation.input.for(scoped);
                input.setDraft(prompt);
                input.submit();
            },
        },
    });
}
/**
 * Register a Settings section only while its enable flag is on, so the
 * Settings nav row appears / disappears live with the toggle in the UI Tweaks
 * section. Waits for the `settings.section` declaration (like the static
 * inject), then keeps the section registered exactly while
 * `isEnabled(controller value)` holds: toggling the switch in the UI Tweaks
 * section mounts or disposes the section, and the settings shell's nav
 * (projected from the section ledger) updates in place.
 */
function installConditionalSection(ctx, controller, isEnabled, registerSection) {
    ctx.slots.inject('settings.section', () => {
        let dispose;
        const sync = () => {
            const enabled = isEnabled(controller.getSnapshot().value);
            if (enabled && dispose === undefined) {
                dispose = registerSection();
            }
            else if (!enabled && dispose !== undefined) {
                dispose();
                dispose = undefined;
            }
        };
        sync();
        const unsubscribe = controller.subscribe(sync);
        return () => {
            unsubscribe();
            dispose?.();
        };
    });
}
function apply(ctx) {
    ctx.effect(installBaseStyles, 'dsh-ui-tweaks: base styles');
    ctx.effect(gitbar_tsx_1.installGitBarStyles, 'dsh-ui-tweaks: gitbar styles');
    ctx.effect(archive_tsx_1.installArchiveStyles, 'dsh-ui-tweaks: archive styles');
    ctx.effect(mcp_tsx_1.installMcpStyles, 'dsh-ui-tweaks: mcp styles');
    ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'dsh-ui-tweaks: locale');
    const t = ctx.locale.bind(NS);
    const controller = new SettingsClient();
    ctx.effect(() => {
        const applyCss = () => {
            const state = controller.getSnapshot();
            if (state.status === 'ready') {
                runtimeStyleElement().textContent = buildRuntimeCss(resolveValue(state.value));
            }
        };
        applyCss();
        const dispose = controller.subscribe(applyCss);
        void controller.load();
        return dispose;
    }, 'dsh-ui-tweaks: runtime css');
    ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section',
        id: NS,
        order: 40,
        label: () => t('nav'),
        inject: () => ({ controller, t }),
    }, SettingsSection));
    // GitBar v3: the branch chip lives in the session header's action row
    // (beside the title, AFTER the mode badge); the terminal and diff tabs
    // below take the native right sidebar. Opening the project in
    // external apps is DSH's own open-in-app header button, so this plugin no
    // longer ships one.
    ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
        name: 'conversation.session.header.actions',
        id: 'gitbar-branch',
        order: 10,
        locale: NS,
        inject: () => ({ controller, sessionsService: ctx.sessions }),
    }, gitbar_tsx_1.BranchChipEntry));
    // Warmup: the header chips mount only after the conversation projection
    // finishes loading (seconds on large inactive sessions). The input dock
    // mounts immediately on session switch, so a null-rendering seat there
    // prefetches the status into the shared cache right away — the chips then
    // paint folder+branch from the warm cache the moment they appear.
    ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
        name: 'conversation.input.dock',
        id: 'gitbar-warmup',
        order: 41,
        inject: () => ({}),
    }, gitbar_tsx_1.GitWarmup));
    // Terminal + diff as native right-sidebar tabs (guide entries beside 文件;
    // picking one opens the tab in the sidebar), registered only while the
    // gitBarEnabled toggle in the UI Tweaks section is on. Each tab is a page
    // type (no address patterns): stage one registers the type with its guide
    // capsule (description shows while the guide lists ≤4 entries), stage two
    // the body under the type's id. The terminal reattaches to
    // its persistent host shell on every visit, and the diff tab keeps its
    // commit band. The tab registry is resolved lazily: hosts predating the
    // right sidebar simply skip these tabs while everything else keeps working.
    ctx.effect(() => {
        // Optional service: absent on hosts without the right sidebar (and on
        // plain version skew), in which case this whole effect is a no-op.
        // NOTE: must go through `ctx.get` — a direct `ctx.sidebarRightTabs`
        // property read throws "cannot get property without inject" when the
        // service is not listed in this entry's `inject` (and listing it there
        // would hard-require the sidebar on older hosts).
        const tabs = ctx.get('sidebarRightTabs');
        if (tabs === undefined)
            return () => { };
        const disposers = [];
        const sync = () => {
            const enabled = controller.getSnapshot().value?.gitBarEnabled === true;
            if (enabled && disposers.length === 0) {
                disposers.push(tabs.register({
                    id: 'dsh-ui-tweaks/terminal',
                    kind: 'ui-tweaks-terminal',
                    title: () => t('terminal'),
                    guide: [{ order: 20, title: () => t('terminal'), description: () => t('terminalGuide'), icon: icons_tsx_1.TerminalIcon }],
                }));
                disposers.push(ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
                    name: 'sidebar.right.pane.tab',
                    key: 'dsh-ui-tweaks/terminal',
                    locale: NS,
                    inject: () => ({ controller }),
                }, gitbar_tsx_1.TerminalPanel)));
                disposers.push(tabs.register({
                    id: 'dsh-ui-tweaks/diff',
                    kind: 'ui-tweaks-diff',
                    title: () => t('diffView'),
                    guide: [{ order: 30, title: () => t('diffView'), description: () => t('diffGuide'), icon: icons_tsx_1.DiffIcon }],
                }));
                disposers.push(ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
                    name: 'sidebar.right.pane.tab',
                    key: 'dsh-ui-tweaks/diff',
                    locale: NS,
                    inject: () => ({ controller }),
                }, gitbar_tsx_1.DiffPanel)));
                disposers.push(ctx.slots.inject('sidebar.right.pane.tab.title', () => ctx.slots.register({
                    name: 'sidebar.right.pane.tab.title',
                    key: 'dsh-ui-tweaks/diff',
                    locale: NS,
                    inject: () => ({ controller }),
                }, gitbar_tsx_1.DiffTabTitle)));
            }
            else if (!enabled && disposers.length > 0) {
                for (const dispose of disposers.splice(0).reverse())
                    dispose();
            }
        };
        sync();
        const unsubscribe = controller.subscribe(sync);
        // The tab registry outlives this plugin: every id registered here must be
        // released on teardown, or the next apply (e.g. after a web hot-reload)
        // re-registers the same ids and the host throws "already registered".
        return () => {
            unsubscribe();
            for (const dispose of disposers.splice(0).reverse())
                dispose();
        };
    }, 'dsh-ui-tweaks: sidebar tabs');
    // Hero (new-session screen): the session header does not mount there, so a
    // floating branch chip anchors beside the workspace picker instead — only
    // when the picked workspace is a git repo.
    ctx.effect(() => (0, gitbar_tsx_1.installHeroChip)(controller, t), 'dsh-ui-tweaks: hero branch chip');
    // Archive manager: a Settings section ("归档") that lists archived sessions
    // and can restore or permanently delete them. Registered only while the
    // archiveManagerEnabled toggle in the UI Tweaks section is on, so the nav
    // row appears / disappears live with the switch (the settings shell
    // projects its nav from the section ledger).
    installConditionalSection(ctx, controller, (value) => value?.archiveManagerEnabled === true, () => ctx.slots.register({
        name: 'settings.section',
        id: 'archive',
        order: 50,
        label: () => t('archiveNav'),
        locale: NS,
        inject: () => ({ controller, t, sessionsService: ctx.sessions }),
    }, archive_tsx_1.ArchiveSection));
    // MCP manager: a Settings section ("MCP 管理") that lists the configured MCP
    // servers with their status and tools, and restarts them. Registered only
    // while the mcpManagerEnabled toggle in the UI Tweaks section is on, so the
    // nav row appears / disappears live with the switch.
    installConditionalSection(ctx, controller, (value) => value?.mcpManagerEnabled === true, () => ctx.slots.register({
        name: 'settings.section',
        id: 'mcp',
        order: 60,
        label: () => t('mcpNav'),
        locale: NS,
        inject: () => ({ controller, t }),
    }, mcp_tsx_1.McpSection));
    // Web search manager: a Settings section ("搜索") with the engine picker and
    // per-engine API keys (credentials center). Mounted only while the
    // searchEnabled toggle in the UI Tweaks section is on.
    installConditionalSection(ctx, controller, (value) => value?.searchEnabled === true, () => ctx.slots.register({
        name: 'settings.section',
        id: 'search',
        order: 70,
        label: () => t('searchNav'),
        locale: NS,
        inject: () => ({ controller, t }),
    }, search_tsx_1.SearchSection));
    // /init slash command: registered only while the initCommandEnabled toggle
    // in the UI Tweaks section is on, so `/init` appears in the slash menu only
    // while the feature is enabled — same live register/dispose choreography as
    // the conditional Settings sections above.
    ctx.effect(() => {
        let dispose;
        const sync = () => {
            const enabled = controller.getSnapshot().value?.initCommandEnabled === true;
            if (enabled && dispose === undefined) {
                dispose = registerInitCommand(ctx);
            }
            else if (!enabled && dispose !== undefined) {
                dispose();
                dispose = undefined;
            }
        };
        sync();
        const unsubscribe = controller.subscribe(sync);
        return () => {
            unsubscribe();
            dispose?.();
            dispose = undefined;
        };
    }, 'dsh-ui-tweaks: /init command');
    // Conversation timeline rail (classic web rail): mounted per session,
    // registered only while the timeline switch is on 'web', so flipping the
    // choice applies live (the native DSH rail is hidden through the runtime
    // CSS in buildRuntimeCss on the same switch, never both or neither).
    ctx.effect(() => {
        let disposeEntry;
        let disposeStyles;
        const sync = () => {
            const enabled = controller.getSnapshot().value?.timelineStyle === 'web';
            if (enabled && disposeEntry === undefined) {
                disposeStyles = (0, timeline_tsx_1.installTimelineStyles)();
                disposeEntry = ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
                    name: 'conversation.input.dock',
                    id: 'timeline',
                    order: 40,
                    locale: NS,
                    inject: () => ({ controller, sessionsService: ctx.sessions }),
                }, timeline_tsx_1.TimelineRail));
            }
            else if (!enabled && disposeEntry !== undefined) {
                disposeEntry();
                disposeEntry = undefined;
                disposeStyles?.();
                disposeStyles = undefined;
            }
        };
        sync();
        const unsubscribe = controller.subscribe(sync);
        return () => {
            unsubscribe();
            disposeEntry?.();
            disposeEntry = undefined;
            disposeStyles?.();
            disposeStyles = undefined;
        };
    }, 'dsh-ui-tweaks: timeline rail');
    // Precise cache hit: rewrites the stats line's cache-hit figure to two
    // decimals from the raw tokenUsage projection. The composer-dock entry
    // renders nothing itself — it is a live reader that patches the stock span
    // in place — and it is registered only while the preciseCacheHitEnabled
    // toggle is on, so off costs nothing and toggling restores the stock text.
    ctx.effect(() => {
        let disposeEntry;
        const sync = () => {
            const enabled = controller.getSnapshot().value?.preciseCacheHitEnabled === true;
            if (enabled && disposeEntry === undefined) {
                disposeEntry = ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
                    name: 'conversation.composer.dock',
                    id: 'precise-cache-hit',
                    order: 90,
                    inject: () => ({}),
                }, cachehit_tsx_1.PreciseCacheHitEntry));
            }
            else if (!enabled && disposeEntry !== undefined) {
                disposeEntry();
                disposeEntry = undefined;
            }
        };
        sync();
        const unsubscribe = controller.subscribe(sync);
        return () => {
            unsubscribe();
            disposeEntry?.();
            disposeEntry = undefined;
        };
    }, 'dsh-ui-tweaks: precise cache hit');
    // Thinking-effort tint: tags thinking-effort labels — the composer
    // trigger, the menu root Effort cell and the menu effort options — so the
    // poster skin can paint solid band colors plus a hover background wash.
    // Mounted only while the neon-poster theme is active — other themes keep
    // the stock caption, and leaving the theme removes every tag.
    ctx.effect(() => {
        let disposeTag;
        const sync = () => {
            const poster = controller.getSnapshot().value?.themeStyle === 'neon-lime';
            if (poster && disposeTag === undefined) {
                disposeTag = (0, effort_tsx_1.installEffortTag)();
            }
            else if (!poster && disposeTag !== undefined) {
                disposeTag();
                disposeTag = undefined;
            }
        };
        sync();
        const unsubscribe = controller.subscribe(sync);
        return () => {
            unsubscribe();
            disposeTag?.();
            disposeTag = undefined;
        };
    }, 'dsh-ui-tweaks: effort tint');
    // Task notifications: watch every session on the list feed and raise
    // tab-title / system-notification / chime alerts when one finishes its turn
    // or starts blocking on the user. Registered only while the master toggle
    // is on; sub-toggles are re-read live through readState, so flipping them
    // never reinstalls the watcher.
    ctx.effect(() => {
        let disposeNotifier;
        const sync = () => {
            const enabled = controller.getSnapshot().value?.notificationsEnabled === true;
            if (enabled && disposeNotifier === undefined) {
                disposeNotifier = (0, notifier_ts_1.installTaskNotifier)({
                    sessionsService: ctx.sessions,
                    pendingInteractions: ctx.uiSession.pendingInteractions,
                    text: {
                        notifyTitleDone: t('notifyTitleDone'),
                        notifyTitleAborted: t('notifyTitleAborted'),
                        notifyTitleFailed: t('notifyTitleFailed'),
                        notifyTitlePending: t('notifyTitlePending'),
                        bodyComplete: t('bodyComplete'),
                        bodyAborted: t('bodyAborted'),
                        bodyFailed: t('bodyFailed'),
                        bodyApproval: t('bodyApproval'),
                        bodyPlan: t('bodyPlan'),
                        bodyQuestion: t('bodyQuestion'),
                    },
                    readState: () => {
                        const value = controller.getSnapshot().value;
                        return {
                            options: {
                                onlyWhenHidden: value?.notifyOnlyWhenHidden ?? true,
                                onComplete: value?.notifyOnComplete ?? true,
                                onInteraction: value?.notifyOnInteraction ?? true,
                            },
                            channels: {
                                titleFlash: value?.notifyTitleFlash ?? true,
                                systemNotification: value?.notifySystemNotification ?? true,
                                sound: value?.notifySound ?? false,
                            },
                        };
                    },
                });
            }
            else if (!enabled && disposeNotifier !== undefined) {
                disposeNotifier();
                disposeNotifier = undefined;
            }
        };
        sync();
        const unsubscribe = controller.subscribe(sync);
        return () => {
            unsubscribe();
            disposeNotifier?.();
            disposeNotifier = undefined;
        };
    }, 'dsh-ui-tweaks: task notifications');
}
};
__modules["./mcp.js"] = function(module, exports, require, __load_) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MCP_CSS = void 0;
exports.installMcpStyles = installMcpStyles;
exports.McpSection = McpSection;
const jsx_runtime_1 = require("react/jsx-runtime");
/**
 * dsh-ui-tweaks — MCP manager (browser half).
 *
 * Renders the "MCP 管理" settings section (usable when the mcpManagerEnabled
 * toggle in 界面调整 is on — otherwise it shows an invite card). The section
 * lists every configured MCP server with its status (active / failed / loading
 * / stopped / disabled), command / url, env names, registered tools, and
 * offers per-server actions: **重启** (runtime reload), **启用/停用**,
 * **编辑**, and **删除** (two-click confirm). An **添加服务器** button opens
 * the editor, which supports BOTH a structured **表单** and a raw **YAML**
 * mode (the config is validated on the server before the profile's
 * `cordis.patch.yml` is rewritten; DSH's patch watcher then hot-reloads the
 * loader so the server starts/stops live).
 * @module dsh-ui-tweaks/client/mcp
 */
const react_1 = require("react");
const react_dom_1 = require("react-dom");
/** Route matching the host half (src/mcp.ts). */
const MCP_ROUTE = '/_dsh/ui-tweaks/mcp';
async function mcpRequest(init) {
    const response = await fetch(MCP_ROUTE, { credentials: 'same-origin', ...init });
    let body;
    try {
        body = await response.json();
    }
    catch {
        body = undefined;
    }
    if (!response.ok || body === undefined || !body.ok) {
        const failure = body;
        const message = body === undefined
            ? `MCP route unavailable (HTTP ${response.status}; restart DSH to load the plugin server code)`
            : failure?.error?.message ?? `UI Tweaks MCP request failed with HTTP ${response.status}`;
        const error = new Error(message);
        error.code = failure?.error?.code;
        throw error;
    }
    return body.value;
}
/** Split a textarea into one trimmed entry per non-empty line. */
function linesToArray(text) {
    return text.split(/\r?\n/u).map(line => line.trim()).filter(line => line.length > 0);
}
/** Parse `KEY=value` (or `Key: value`) lines into a record; throws on malformed lines. */
function linesToRecord(text, separator) {
    const out = {};
    for (const line of text.split(/\r?\n/u)) {
        const trimmed = line.trim();
        if (trimmed.length === 0)
            continue;
        const at = trimmed.indexOf(separator);
        if (at <= 0)
            throw new Error(`格式不正确：${trimmed}`);
        const key = trimmed.slice(0, at).trim();
        const value = trimmed.slice(at + 1).trim();
        if (key.length === 0)
            throw new Error(`格式不正确：${trimmed}`);
        out[key] = value;
    }
    return out;
}
function recordToLines(record, separator) {
    return Object.entries(record).map(([key, value]) => `${key}${separator}${value}`).join('\n');
}
exports.MCP_CSS = `
.dut-mcp{display:grid;gap:12px;max-width:680px;padding:6px 2px 36px}
.dut-mcp-head{display:flex;align-items:center;gap:10px;padding:14px 16px 0}
.dut-mcp-head h2{margin:0;font-size:15px;font-weight:600;letter-spacing:-.01em;color:var(--dsw-alias-label-primary)}
.dut-mcp-count{font-size:11.5px;color:var(--dsw-alias-label-secondary);padding:2px 8px;border-radius:999px;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1)}
.dut-mcp-spacer{flex:1}
.dut-mcp-btn{display:inline-flex;align-items:center;height:28px;padding:0 12px;border-radius:999px;border:1px solid var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;cursor:pointer;transition:background .15s ease,color .15s ease,border-color .15s ease}
.dut-mcp-btn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dut-mcp-btn:disabled{opacity:.5;cursor:default}
.dut-mcp-btn.dut-mcp-del:hover{border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary) 55%,transparent);color:var(--dsw-alias-state-error-primary);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 10%,transparent)}
.dut-mcp-btn.dut-mcp-confirm{border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary) 55%,transparent);color:var(--dsw-alias-state-error-primary);font-weight:600}
.dut-mcp-body{display:grid;gap:2px;margin-top:4px}
.dut-mcp-row{display:grid;gap:6px;padding:10px 16px;border-radius:12px}
.dut-mcp-row:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dut-mcp-row-main{display:flex;align-items:center;gap:8px;min-width:0}
.dut-mcp-name{font-size:13.5px;font-weight:600;color:var(--dsw-alias-label-primary);white-space:nowrap;text-overflow:ellipsis;overflow:hidden}
.dut-mcp-badge{flex:none;font-size:11px;line-height:1;padding:4px 9px;border-radius:999px;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary)}
.dut-mcp-badge.dut-mcp-ok{background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 12%,transparent);border-color:transparent;color:var(--dsw-alias-state-success-primary)}
.dut-mcp-badge.dut-mcp-err{background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 12%,transparent);border-color:transparent;color:var(--dsw-alias-state-error-primary)}
.dut-mcp-badge.dut-mcp-warn{background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 14%,transparent);border-color:transparent;color:var(--dsw-alias-state-warn-label)}
.dut-mcp-sub{font-size:11.5px;color:var(--dsw-alias-label-secondary);white-space:nowrap;text-overflow:ellipsis;overflow:hidden}
.dut-mcp-toggle{flex:none;font-size:11.5px;color:var(--dsw-alias-label-tertiary);background:transparent;border:none;padding:0;cursor:pointer;text-align:left}
.dut-mcp-toggle:hover{color:var(--dsw-alias-label-primary)}
.dut-mcp-tools{margin-left:2px;display:flex;flex-wrap:wrap;gap:4px}
.dut-mcp-tool{font-size:11px;line-height:1;padding:3px 8px;border-radius:999px;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary)}
.dut-mcp-note{margin:2px 16px 0;padding:8px 12px;border-radius:10px;font-size:11.5px;line-height:1.55;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1)}
.dut-mcp-empty{padding:32px 16px;text-align:center;font-size:12.5px;color:var(--dsw-alias-label-secondary)}
.dut-mcp-alert{margin:8px 16px 0;padding:8px 12px;border-radius:10px;font-size:12px;line-height:1.5;background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 10%,transparent);color:var(--dsw-alias-state-error-primary)}
.dut-mcp-notice{margin:8px 16px 0;padding:8px 12px;border-radius:10px;font-size:12px;line-height:1.5;background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 12%,transparent);color:var(--dsw-alias-state-success-primary)}
.dut-mcp-off{padding:20px 16px;display:grid;gap:12px}
.dut-mcp-off p{margin:0;font-size:12.5px;line-height:1.6;color:var(--dsw-alias-label-secondary)}
.dut-mcp-overlay{z-index:1100;justify-content:center;align-items:center;display:flex;position:fixed;inset:0}
.dut-mcp-mask{background:var(--dsw-alias-bg-mask-1);backdrop-filter:var(--dsw-mask-blur);position:absolute;inset:0}
.dut-mcp-panel{z-index:1;background:var(--dsw-alias-bg-layer-2);box-sizing:border-box;width:720px;max-width:calc(100vw - 48px);height:min(700px,100vh - 48px);box-shadow:var(--dsw-shadow-lv3);--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2);border-radius:20px;display:flex;flex-direction:column;overflow:hidden}
.dut-mcp-panel-head{box-sizing:border-box;flex:none;display:flex;align-items:center;gap:10px;height:52px;padding:0 12px 0 20px}
.dut-mcp-panel-head h2{margin:0;font-size:16px;font-weight:600;letter-spacing:-.01em;color:var(--dsw-alias-label-primary)}
.dut-mcp-panel-close{cursor:pointer;width:28px;height:28px;color:var(--dsw-alias-label-primary);background:transparent;border:none;border-radius:28px;display:inline-flex;justify-content:center;align-items:center;padding:0;font-size:13px}
.dut-mcp-panel-close:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dut-mcp-tabs{flex:none;display:inline-flex;padding:3px;gap:3px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-2);margin:0 20px 10px;align-self:flex-start}
.dut-mcp-tabs button{border:none;border-radius:7px;padding:5px 14px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12.5px;cursor:pointer}
.dut-mcp-tabs button.dut-mcp-tab-on{background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 12%,transparent);color:var(--dsw-alias-state-business-primary);font-weight:600}
.dut-mcp-form{flex:1;min-height:0;overflow-y:auto;padding:0 20px 20px;display:grid;gap:12px;align-content:start}
.dut-mcp-field{display:grid;gap:6px}
.dut-mcp-field>span{font-size:12px;font-weight:600;color:var(--dsw-alias-label-primary)}
.dut-mcp-field small{font-size:11px;line-height:1.5;color:var(--dsw-alias-label-tertiary)}
.dut-mcp-input{box-sizing:border-box;width:100%;height:34px;padding:0 10px;border-radius:9px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px}
.dut-mcp-input:focus{outline:none;border-color:color-mix(in srgb,var(--dsw-alias-state-business-primary) 55%,transparent)}
.dut-mcp-input:disabled{opacity:.55;cursor:not-allowed}
textarea.dut-mcp-input{height:auto;min-height:72px;padding:8px 10px;line-height:1.5;resize:vertical;font-family:var(--dsw-font-markdown-code-block-font-family, Consolas, monospace);font-size:12px}
textarea.dut-mcp-input-lg{min-height:120px}
textarea.dut-mcp-yaml{min-height:320px}
.dut-mcp-row2{display:grid;grid-template-columns:1fr 1fr;gap:12px;align-items:start}
.dut-mcp-field .dut-seg{width:fit-content}
.dut-mcp-row2 .dut-seg{height:34px;box-sizing:border-box;align-items:center}
.dut-mcp-row2 .dut-seg button{flex:none;white-space:nowrap;padding:0 16px;height:26px}
.dut-mcp-foot{flex:none;display:flex;align-items:center;gap:8px;justify-content:flex-end;padding:12px 20px 16px;border-top:1px solid var(--dsw-alias-border-l1)}
.dut-mcp-error{margin:0 20px 10px;padding:8px 12px;border-radius:10px;font-size:12px;line-height:1.5;background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 10%,transparent);color:var(--dsw-alias-state-error-primary)}
`;
/** Install the MCP stylesheet once (idempotent); returns the disposer. */
function installMcpStyles() {
    const id = 'dsh-ui-tweaks-mcp';
    const existing = document.querySelector(`style[data-plugin-css="${id}"]`);
    if (existing !== null)
        return () => { };
    const style = document.createElement('style');
    style.dataset.plugin = 'dsh-ui-tweaks';
    style.dataset.pluginCss = id;
    style.textContent = exports.MCP_CSS;
    document.head.appendChild(style);
    return () => { style.remove(); };
}
function statusLabel(status, t) {
    switch (status) {
        case 'active': return t('mcpStatusActive');
        case 'failed': return t('mcpStatusFailed');
        case 'loading': return t('mcpStatusLoading');
        case 'stopped': return t('mcpStatusStopped');
        case 'disabled': return t('mcpStatusDisabled');
    }
}
function statusClass(status) {
    switch (status) {
        case 'active': return ' dut-mcp-ok';
        case 'failed': return ' dut-mcp-err';
        case 'loading': return ' dut-mcp-warn';
        default: return '';
    }
}
function McpSection({ controller, t }) {
    const settingsState = (0, react_1.useSyncExternalStore)(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
    const enabled = settingsState.value?.mcpManagerEnabled === true;
    const [servers, setServers] = (0, react_1.useState)(null);
    const [busy, setBusy] = (0, react_1.useState)(null);
    const [confirmId, setConfirmId] = (0, react_1.useState)(null);
    const [error, setError] = (0, react_1.useState)(null);
    const [notice, setNotice] = (0, react_1.useState)(null);
    const [expanded, setExpanded] = (0, react_1.useState)(null);
    const [editing, setEditing] = (0, react_1.useState)(null);
    const generation = (0, react_1.useMemo)(() => ({ current: 0 }), []);
    const load = () => {
        const gen = ++generation.current;
        setError(null);
        void mcpRequest().then((snapshot) => {
            if (gen !== generation.current)
                return;
            setServers(snapshot.servers);
        }).catch((reason) => {
            if (gen !== generation.current)
                return;
            setError(reason instanceof Error ? reason.message : String(reason));
            setServers([]);
        });
    };
    (0, react_1.useEffect)(() => {
        if (!enabled)
            return;
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled]);
    const run = (key, body, after) => {
        setBusy(key);
        setError(null);
        setNotice(null);
        void mcpRequest({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        }).then(() => { after?.(); }).catch((reason) => {
            setError(reason instanceof Error ? reason.message : String(reason));
        }).finally(() => { setBusy(current => (current === key ? null : current)); });
    };
    /** Re-fetch the list every `interval` ms until `stop` returns true (or attempts run out).
     * The DSH patch watcher applies changes asynchronously and an MCP server takes
     * time to spawn/connect, so a single delayed reload can miss the transition. */
    const pollAfter = (stop, attempts = 12, interval = 1000) => {
        let left = attempts;
        const tick = () => {
            const gen = ++generation.current;
            void mcpRequest().then((snapshot) => {
                if (gen !== generation.current)
                    return;
                setServers(snapshot.servers);
                left -= 1;
                if (left <= 0 || stop(snapshot.servers))
                    return;
                window.setTimeout(tick, interval);
            }).catch(() => {
                left -= 1;
                if (left > 0)
                    window.setTimeout(tick, interval);
            });
        };
        tick();
    };
    const remove = (id) => {
        if (confirmId !== id) {
            setConfirmId(id);
            window.setTimeout(() => { setConfirmId(current => (current === id ? null : current)); }, 3000);
            return;
        }
        setConfirmId(null);
        run(`remove:${id}`, { action: 'remove', id }, () => {
            setNotice(t('mcpRemoved'));
            pollAfter(servers => !servers.some(server => server.id === id), 10);
        });
    };
    const setEnabled = (id, enabled) => {
        run(`set-enabled:${id}`, { action: 'set-enabled', id, enabled }, () => {
            // Keep refreshing until the target reaches a TERMINAL status. The
            // `disabled` flag flips within ~1s, but the MCP spawn + connect takes
            // longer — stopping at the flag would freeze the row mid-transition.
            pollAfter(servers => {
                const target = servers.find(server => server.id === id);
                if (target === undefined)
                    return true;
                return enabled
                    ? target.status === 'active' || target.status === 'failed'
                    : target.status === 'disabled';
            }, 45, 1000);
        });
    };
    if (!enabled) {
        return ((0, jsx_runtime_1.jsx)("div", { className: "dut-mcp", children: (0, jsx_runtime_1.jsxs)("div", { className: "dut-panel dut-mcp-off", children: [(0, jsx_runtime_1.jsx)("p", { children: t('mcpDisabledHint') }), (0, jsx_runtime_1.jsx)("div", { children: (0, jsx_runtime_1.jsx)("button", { type: "button", className: "dut-btn dut-btn-active", onClick: () => {
                                void controller.set('mcpManagerEnabled', true).catch(() => { setError(t('unavailable')); });
                            }, children: t('mcpEnable') }) })] }) }));
    }
    const list = servers ?? [];
    return ((0, jsx_runtime_1.jsxs)("div", { className: "dut-mcp", children: [(0, jsx_runtime_1.jsxs)("div", { className: "dut-panel", children: [(0, jsx_runtime_1.jsxs)("div", { className: "dut-mcp-head", children: [(0, jsx_runtime_1.jsx)("h2", { children: t('mcpTitle') }), (0, jsx_runtime_1.jsxs)("span", { className: "dut-mcp-count", children: [list.length, " \u00B7 ", list.filter(s => s.status === 'active').length, " ", t('mcpStatusActive')] }), (0, jsx_runtime_1.jsx)("span", { className: "dut-mcp-spacer" }), (0, jsx_runtime_1.jsx)("button", { type: "button", className: "dut-mcp-btn", onClick: () => { setEditing('new'); }, children: t('mcpAdd') })] }), (0, jsx_runtime_1.jsx)("div", { className: "dut-mcp-note", children: t('mcpServerDetail') }), error !== null ? (0, jsx_runtime_1.jsx)("div", { className: "dut-mcp-alert", children: error }) : null, notice !== null ? (0, jsx_runtime_1.jsx)("div", { className: "dut-mcp-notice", children: notice }) : null, (0, jsx_runtime_1.jsx)("div", { className: "dut-mcp-body", children: servers === null ? ((0, jsx_runtime_1.jsx)("div", { className: "dut-mcp-empty", children: t('loading') })) : list.length === 0 ? ((0, jsx_runtime_1.jsx)("div", { className: "dut-mcp-empty", children: t('mcpEmpty') })) : list.map(server => {
                            const command = server.url !== undefined ? server.url : [server.command, ...server.args].filter(Boolean).join(' ');
                            const open = expanded === server.id;
                            return ((0, jsx_runtime_1.jsxs)("div", { className: "dut-mcp-row", children: [(0, jsx_runtime_1.jsxs)("div", { className: "dut-mcp-row-main", children: [(0, jsx_runtime_1.jsx)("span", { className: "dut-mcp-name", children: server.serverName }), (0, jsx_runtime_1.jsx)("span", { className: 'dut-mcp-badge' + statusClass(server.status), children: statusLabel(server.status, t) }), (0, jsx_runtime_1.jsxs)("span", { className: "dut-mcp-sub", children: ["\u00B7 ", server.toolCount, " ", t('mcpTools')] }), (0, jsx_runtime_1.jsx)("span", { className: "dut-mcp-spacer" }), (0, jsx_runtime_1.jsx)("button", { type: "button", className: "dut-mcp-btn", disabled: busy !== null, onClick: () => { setEnabled(server.id, server.disabled); }, children: server.disabled ? t('mcpEnabledAction') : t('mcpDisabledAction') }), (0, jsx_runtime_1.jsx)("button", { type: "button", className: "dut-mcp-btn", disabled: busy !== null, onClick: () => { setEditing(server); }, children: t('mcpEdit') }), (0, jsx_runtime_1.jsx)("button", { type: "button", className: 'dut-mcp-btn dut-mcp-del' + (confirmId === server.id ? ' dut-mcp-confirm' : ''), disabled: busy !== null, onClick: () => { remove(server.id); }, children: confirmId === server.id ? t('mcpDelete') + '?' : t('mcpDelete') })] }), (0, jsx_runtime_1.jsxs)("div", { className: "dut-mcp-sub", title: command, children: [server.id, " \u00B7 ", server.transport, " \u00B7 ", command] }), (0, jsx_runtime_1.jsxs)("button", { type: "button", className: "dut-mcp-toggle", onClick: () => { setExpanded(open ? null : server.id); }, children: [open ? '▾ ' : '▸ ', server.toolCount, " ", t('mcpTools'), server.env && Object.keys(server.env).length > 0 ? ` · ${t('mcpEnv')}: ${Object.keys(server.env).join(', ')}` : ''] }), open ? ((0, jsx_runtime_1.jsx)("div", { className: "dut-mcp-tools", children: server.tools.length === 0 ? (0, jsx_runtime_1.jsx)("span", { className: "dut-mcp-sub", children: "\u2014" }) : server.tools.map(tool => (0, jsx_runtime_1.jsx)("span", { className: "dut-mcp-tool", children: tool }, tool)) })) : null] }, server.id));
                        }) })] }), editing !== null ? ((0, jsx_runtime_1.jsx)(McpEditor, { initial: editing === 'new' ? null : editing, t: t, onClose: () => { setEditing(null); }, onSaved: () => { setEditing(null); setNotice(t('mcpSaved')); pollAfter(() => false, 10); } }, editing === 'new' ? 'new' : editing.id)) : null] }));
}
function McpEditor({ initial, t, onClose, onSaved }) {
    const isEdit = initial !== null;
    const [mode, setMode] = (0, react_1.useState)('form');
    const [id, setId] = (0, react_1.useState)(initial?.id ?? '');
    const [serverName, setServerName] = (0, react_1.useState)(initial?.serverName ?? '');
    const [transport, setTransport] = (0, react_1.useState)(initial?.transport === 'streamable-http' ? 'streamable-http' : 'stdio');
    const [timeoutText, setTimeoutText] = (0, react_1.useState)(initial?.toolCallTimeoutMs !== undefined ? String(initial.toolCallTimeoutMs) : '');
    const [command, setCommand] = (0, react_1.useState)(initial?.command ?? '');
    const [argsText, setArgsText] = (0, react_1.useState)(initial ? initial.args.join('\n') : '');
    const [envText, setEnvText] = (0, react_1.useState)(initial ? recordToLines(initial.env, '=') : '');
    const [url, setUrl] = (0, react_1.useState)(initial?.url ?? '');
    const [headersText, setHeadersText] = (0, react_1.useState)(initial ? recordToLines(initial.headers, ':') : '');
    const [disabled, setDisabled] = (0, react_1.useState)(initial?.disabled ?? false);
    const [yamlText, setYamlText] = (0, react_1.useState)(initial?.yaml ?? '');
    const [error, setError] = (0, react_1.useState)(null);
    const [busy, setBusy] = (0, react_1.useState)(false);
    (0, react_1.useEffect)(() => {
        const onKeyDown = (event) => {
            if (event.key === 'Escape')
                onClose();
        };
        document.addEventListener('keydown', onKeyDown);
        return () => { document.removeEventListener('keydown', onKeyDown); };
    }, [onClose]);
    const validateForm = () => {
        if (!/^[A-Za-z0-9_-]{1,64}$/u.test(id))
            return t('mcpInvalidId');
        if (!/^[A-Za-z0-9_-]{1,32}$/u.test(serverName))
            return t('mcpInvalidName');
        if (timeoutText !== '' && (!/^\d+$/u.test(timeoutText) || Number(timeoutText) <= 0))
            return t('mcpInvalidTimeout');
        if (transport === 'streamable-http') {
            if (!/^https?:\/\//u.test(url))
                return t('mcpInvalidUrl');
        }
        else if (command.trim().length === 0) {
            return t('mcpInvalidCommand');
        }
        return null;
    };
    const save = () => {
        setError(null);
        setBusy(true);
        let payload;
        if (mode === 'yaml') {
            payload = { action: 'save', server: { id, disabled }, yaml: yamlText };
        }
        else {
            const invalid = validateForm();
            if (invalid !== null) {
                setError(invalid);
                setBusy(false);
                return;
            }
            let env = {};
            let headers = {};
            try {
                env = linesToRecord(envText, '=');
                headers = linesToRecord(headersText, ':');
            }
            catch (parseError) {
                setError(parseError instanceof Error ? parseError.message : String(parseError));
                setBusy(false);
                return;
            }
            payload = {
                action: 'save',
                server: {
                    id,
                    serverName,
                    transport,
                    command,
                    args: linesToArray(argsText),
                    env,
                    url,
                    headers,
                    ...(timeoutText !== '' ? { toolCallTimeoutMs: Number(timeoutText) } : {}),
                    disabled,
                },
            };
        }
        void mcpRequest({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        }).then(() => { onSaved(); }).catch((reason) => {
            setError(reason instanceof Error ? reason.message : String(reason));
        }).finally(() => { setBusy(false); });
    };
    return (0, react_dom_1.createPortal)((0, jsx_runtime_1.jsxs)("div", { className: "dut-mcp-overlay", role: "presentation", children: [(0, jsx_runtime_1.jsx)("div", { className: "dut-mcp-mask", "aria-hidden": "true", onClick: onClose }), (0, jsx_runtime_1.jsxs)("div", { className: "dut-mcp-panel", role: "dialog", "aria-modal": "true", "aria-label": isEdit ? t('mcpEditTitle') : t('mcpAddTitle'), children: [(0, jsx_runtime_1.jsxs)("div", { className: "dut-mcp-panel-head", children: [(0, jsx_runtime_1.jsx)("h2", { children: isEdit ? t('mcpEditTitle') : t('mcpAddTitle') }), (0, jsx_runtime_1.jsx)("span", { className: "dut-mcp-spacer" }), (0, jsx_runtime_1.jsx)("button", { type: "button", className: "dut-mcp-panel-close", onClick: onClose, "aria-label": "\u2715", children: "\u2715" })] }), (0, jsx_runtime_1.jsxs)("div", { className: "dut-mcp-tabs", role: "tablist", children: [(0, jsx_runtime_1.jsx)("button", { type: "button", role: "tab", "aria-selected": mode === 'form', className: mode === 'form' ? 'dut-mcp-tab-on' : '', onClick: () => { setMode('form'); }, children: t('mcpFormTab') }), (0, jsx_runtime_1.jsx)("button", { type: "button", role: "tab", "aria-selected": mode === 'yaml', className: mode === 'yaml' ? 'dut-mcp-tab-on' : '', onClick: () => { setMode('yaml'); }, children: t('mcpYamlTab') })] }), error !== null ? (0, jsx_runtime_1.jsx)("div", { className: "dut-mcp-error", children: error }) : null, mode === 'yaml' ? ((0, jsx_runtime_1.jsxs)("div", { className: "dut-mcp-form", children: [(0, jsx_runtime_1.jsxs)("div", { className: "dut-mcp-row2", children: [(0, jsx_runtime_1.jsxs)("div", { className: "dut-mcp-field", children: [(0, jsx_runtime_1.jsx)("span", { children: t('mcpFieldId') }), (0, jsx_runtime_1.jsx)("input", { className: "dut-mcp-input", value: id, disabled: isEdit, onChange: event => { setId(event.target.value); } }), (0, jsx_runtime_1.jsx)("small", { children: t('mcpFieldIdHint') })] }), (0, jsx_runtime_1.jsxs)("div", { className: "dut-mcp-field", children: [(0, jsx_runtime_1.jsx)("span", { children: t('mcpFieldEnabled') }), (0, jsx_runtime_1.jsxs)("div", { className: "dut-seg", children: [(0, jsx_runtime_1.jsx)("button", { type: "button", className: !disabled ? 'dut-seg-active' : '', onClick: () => { setDisabled(false); }, children: t('mcpEnabledAction') }), (0, jsx_runtime_1.jsx)("button", { type: "button", className: disabled ? 'dut-seg-active' : '', onClick: () => { setDisabled(true); }, children: t('mcpDisabledAction') })] })] })] }), (0, jsx_runtime_1.jsxs)("div", { className: "dut-mcp-field", children: [(0, jsx_runtime_1.jsx)("span", { children: t('mcpYamlTab') }), (0, jsx_runtime_1.jsx)("textarea", { className: "dut-mcp-input dut-mcp-yaml", value: yamlText, placeholder: t('mcpYamlPlaceholder'), spellCheck: false, onChange: event => { setYamlText(event.target.value); } }), (0, jsx_runtime_1.jsx)("small", { children: t('mcpYamlHint') })] })] })) : ((0, jsx_runtime_1.jsxs)("div", { className: "dut-mcp-form", children: [(0, jsx_runtime_1.jsxs)("div", { className: "dut-mcp-row2", children: [(0, jsx_runtime_1.jsxs)("div", { className: "dut-mcp-field", children: [(0, jsx_runtime_1.jsx)("span", { children: t('mcpFieldId') }), (0, jsx_runtime_1.jsx)("input", { className: "dut-mcp-input", value: id, disabled: isEdit, onChange: event => { setId(event.target.value); } }), (0, jsx_runtime_1.jsx)("small", { children: t('mcpFieldIdHint') })] }), (0, jsx_runtime_1.jsxs)("div", { className: "dut-mcp-field", children: [(0, jsx_runtime_1.jsx)("span", { children: t('mcpFieldEnabled') }), (0, jsx_runtime_1.jsxs)("div", { className: "dut-seg", children: [(0, jsx_runtime_1.jsx)("button", { type: "button", className: !disabled ? 'dut-seg-active' : '', onClick: () => { setDisabled(false); }, children: t('mcpEnabledAction') }), (0, jsx_runtime_1.jsx)("button", { type: "button", className: disabled ? 'dut-seg-active' : '', onClick: () => { setDisabled(true); }, children: t('mcpDisabledAction') })] })] })] }), (0, jsx_runtime_1.jsxs)("div", { className: "dut-mcp-row2", children: [(0, jsx_runtime_1.jsxs)("div", { className: "dut-mcp-field", children: [(0, jsx_runtime_1.jsx)("span", { children: t('mcpFieldName') }), (0, jsx_runtime_1.jsx)("input", { className: "dut-mcp-input", value: serverName, onChange: event => { setServerName(event.target.value); } }), (0, jsx_runtime_1.jsx)("small", { children: t('mcpFieldNameHint') })] }), (0, jsx_runtime_1.jsxs)("div", { className: "dut-mcp-field", children: [(0, jsx_runtime_1.jsx)("span", { children: t('mcpFieldType') }), (0, jsx_runtime_1.jsxs)("div", { className: "dut-seg", children: [(0, jsx_runtime_1.jsx)("button", { type: "button", className: transport === 'stdio' ? 'dut-seg-active' : '', onClick: () => { setTransport('stdio'); }, children: "stdio" }), (0, jsx_runtime_1.jsx)("button", { type: "button", className: transport === 'streamable-http' ? 'dut-seg-active' : '', onClick: () => { setTransport('streamable-http'); }, children: "HTTP" })] })] })] }), (0, jsx_runtime_1.jsxs)("div", { className: "dut-mcp-field", children: [(0, jsx_runtime_1.jsx)("span", { children: t('mcpFieldTimeout') }), (0, jsx_runtime_1.jsx)("input", { className: "dut-mcp-input", inputMode: "numeric", value: timeoutText, placeholder: "60000", onChange: event => { setTimeoutText(event.target.value); } })] }), transport === 'stdio' ? ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsxs)("div", { className: "dut-mcp-field", children: [(0, jsx_runtime_1.jsx)("span", { children: t('mcpFieldCommand') }), (0, jsx_runtime_1.jsx)("input", { className: "dut-mcp-input", value: command, placeholder: t('mcpFieldCommandPlaceholder'), onChange: event => { setCommand(event.target.value); } })] }), (0, jsx_runtime_1.jsxs)("div", { className: "dut-mcp-field", children: [(0, jsx_runtime_1.jsx)("span", { children: t('mcpFieldArgs') }), (0, jsx_runtime_1.jsx)("textarea", { className: "dut-mcp-input", value: argsText, placeholder: '-y\n@some/mcp-server', spellCheck: false, onChange: event => { setArgsText(event.target.value); } })] }), (0, jsx_runtime_1.jsxs)("div", { className: "dut-mcp-field", children: [(0, jsx_runtime_1.jsx)("span", { children: t('mcpFieldEnv') }), (0, jsx_runtime_1.jsx)("textarea", { className: "dut-mcp-input dut-mcp-input-lg", value: envText, placeholder: 'KEY=value', spellCheck: false, onChange: event => { setEnvText(event.target.value); } })] })] })) : ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsxs)("div", { className: "dut-mcp-field", children: [(0, jsx_runtime_1.jsx)("span", { children: t('mcpFieldUrl') }), (0, jsx_runtime_1.jsx)("input", { className: "dut-mcp-input", value: url, placeholder: "https://mcp.example.com/sse", onChange: event => { setUrl(event.target.value); } })] }), (0, jsx_runtime_1.jsxs)("div", { className: "dut-mcp-field", children: [(0, jsx_runtime_1.jsx)("span", { children: t('mcpFieldHeaders') }), (0, jsx_runtime_1.jsx)("textarea", { className: "dut-mcp-input dut-mcp-input-lg", value: headersText, placeholder: 'Authorization: Bearer …', spellCheck: false, onChange: event => { setHeadersText(event.target.value); } })] })] }))] })), (0, jsx_runtime_1.jsxs)("div", { className: "dut-mcp-foot", children: [(0, jsx_runtime_1.jsx)("button", { type: "button", className: "dut-mcp-btn", disabled: busy, onClick: onClose, children: t('mcpCancel') }), (0, jsx_runtime_1.jsx)("button", { type: "button", className: "dut-btn dut-btn-active", disabled: busy, onClick: save, children: t('mcpSave') })] })] })] }), document.body);
}
};
__modules["./notifier.js"] = function(module, exports, require, __load_) {
"use strict";
/**
 * dsh-ui-tweaks — task notifications (browser half).
 *
 * Watches the sessions list feed (the same store the sidebar's running flag,
 * amber interaction dot and green "done" reminder project from) and raises a
 * browser-side heads-up when a session finishes its turn or starts blocking
 * on the user — so a backgrounded tab can call you back:
 *
 * - "Finished" = a session's `running` flag drops (true → false) without an
 *   interaction taking over, or its host-tracked `completed` reminder rises
 *   (finished while not selected). The host `dshTurnOutcome` session
 *   projection (`src/turn-outcome.ts`, folded from `turn/end` reasons) says
 *   WHY it finished, so the copy distinguishes a clean completion from a
 *   user abort and from a failed request (with the error text); when the
 *   projection is missing or stale, falls back to a plain-finish announce.
 * - "Interaction" = a session gains `pendingInteraction`
 *   ('approval' | 'plan-review' | 'question') — exactly the sidebar's
 *   amber-dot classification.
 *
 * Three independent channels, each silently degrading when unavailable:
 * - Title flash: alternates `(N) 🔔 <title>` ↔ `(N) <title>` until the page
 *   is visible and focused again, then restores the captured title. DSH may
 *   rewrite `document.title` independently; while flashing our ticks win,
 *   and on stop we restore the pre-flash capture (worst case a stale base).
 * - System notification: the Web Notifications API; permission is requested
 *   from the settings toggle's user gesture (`requestNotifyPermission`).
 *   Clicking one focuses the window and opens that session. `silent` tracks
 *   the chime channel so the two never double-beep.
 * - Chime: a tiny WebAudio two-note motif (rising = done, falling = needs
 *   you), synthesized in-process — no audio assets. Autoplay policy allows
 *   this once the user has interacted with the origin (sticky activation),
 *   which the settings-toggle clicks provide.
 *
 * Anti-spam: the first snapshot after install only arms the baseline (a page
 * load never fires a burst); events fire on transitions only; a short
 * per-session+kind cooldown absorbs reconnect re-pull flicker. Subagent child
 * rows are skipped — their parent carries the turn, and mid-turn subagent
 * completions would be noise.
 * @module dsh-ui-tweaks/client/notifier
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestNotifyPermission = requestNotifyPermission;
exports.previewTitleFlash = previewTitleFlash;
exports.previewAlerts = previewAlerts;
exports.installTaskNotifier = installTaskNotifier;
/** List-row key carrying the turn outcome; keep in sync with src/turn-outcome.ts. */
const TURN_OUTCOME_KEY = 'dshTurnOutcome';
/** Terminal-turn announcement kinds — they all answer "your task ended". */
const TERMINAL_KINDS = ['complete', 'aborted', 'failed'];
/**
 * Map a logged `turn/end` reason onto an announcement kind. Unknown or absent
 * outcomes (older host, projection lag) degrade to a plain completion.
 */
const classifyFinish = (outcome) => {
    switch (outcome?.kind) {
        case 'aborted':
        case 'interrupted':
            return 'aborted';
        case 'error':
            return 'failed';
        default:
            return 'complete';
    }
};
/** Same event kind for one session never repeats inside this window. */
const COOLDOWN_MS = 2000;
/**
 * A background session's finish usually announces via the running-drop; the
 * host's green `completed` reminder often lands a re-pull later — treat it as
 * the SAME completion inside this window instead of re-toasting it.
 */
const COMPLETE_RENOTIFY_MS = 30000;
/** Title-flash blink period. */
const FLASH_INTERVAL_MS = 900;
/** Replace the `{title}` / `{error}` placeholders (split/join — no regex escaping worries). */
function fill(template, title, error) {
    return template.split('{error}').join(error ?? '').split('{title}').join(title);
}
/**
 * Ask the browser for desktop-notification permission. Must run inside a user
 * gesture (the settings toggle's click) to avoid a denied or ignored prompt;
 * repeated calls are cheap no-ops once decided.
 */
function requestNotifyPermission() {
    try {
        if (typeof Notification === 'undefined')
            return;
        if (Notification.permission === 'default')
            void Notification.requestPermission();
    }
    catch {
        // Notifications unsupported — the other channels carry on.
    }
}
/**
 * Forced title-flash preview for the settings panel's 测试 button: the real
 * flash auto-clears the moment its page is visible AND focused — which is
 * exactly the tester's situation, so a plain preview would heal instantly and
 * show nothing. Instead this blinks unconditionally for a few seconds, then
 * restores whatever title was current at click time.
 */
let previewBlinkTimer;
let previewStopTimer;
function previewTitleFlash(durationMs = 6000) {
    // Restart cleanly on rapid re-clicks.
    if (previewBlinkTimer !== undefined)
        window.clearInterval(previewBlinkTimer);
    if (previewStopTimer !== undefined)
        window.clearTimeout(previewStopTimer);
    const base = document.title;
    let tick = false;
    const blink = () => {
        tick = !tick;
        document.title = tick ? `(1) 🔔 ${base}` : `(1) ${base}`;
    };
    blink();
    previewBlinkTimer = window.setInterval(blink, FLASH_INTERVAL_MS);
    previewStopTimer = window.setTimeout(() => {
        if (previewBlinkTimer !== undefined) {
            window.clearInterval(previewBlinkTimer);
            previewBlinkTimer = undefined;
        }
        previewStopTimer = undefined;
        document.title = base;
    }, durationMs);
}
/**
 * One-shot self-test for the settings panel's 测试 button: previews every
 * enabled channel — a forced ~6s title-flash blink (the real one would clear
 * instantly on a focused page), the falling (needs-you) chime, and, when
 * permission is already granted, one sample system notification.
 */
function previewAlerts(channels, text) {
    requestNotifyPermission();
    if (channels.titleFlash)
        previewTitleFlash();
    if (channels.sound)
        playChime('down');
    if (!channels.systemNotification || typeof Notification === 'undefined')
        return;
    if (Notification.permission !== 'granted')
        return;
    try {
        const sample = fill(text.bodyComplete, 'dsh-ui-tweaks', undefined);
        new Notification(text.notifyTitleDone, { body: sample, tag: 'dsh-ui-tweaks:preview', silent: true });
    }
    catch {
        // Construction can throw on some platforms — degrade quietly.
    }
}
// ---------------------------------------------------------------------------
// Chime — WebAudio two-note motif, synthesized, no assets.
// ---------------------------------------------------------------------------
let audioCtx;
function playChime(shape) {
    try {
        audioCtx ??= new AudioContext();
        const ctx = audioCtx;
        // Sticky activation from earlier clicks usually suffices; resume is best effort.
        if (ctx.state === 'suspended')
            void ctx.resume().catch(() => { });
        const now = ctx.currentTime;
        const notes = shape === 'up' ? [880, 1318.51] : [1174.66, 783.99];
        // 240ms between notes with a long decay each: tight spacing read as ONE
        // blip in listening tests; this wide a gap keeps the two tones distinct
        // (rising = done, falling = needs you).
        notes.forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.value = freq;
            const t0 = now + i * 0.24;
            gain.gain.setValueAtTime(0.0001, t0);
            gain.gain.exponentialRampToValueAtTime(0.22, t0 + 0.03);
            gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.2);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(t0);
            osc.stop(t0 + 0.24);
        });
    }
    catch {
        // Audio unavailable (autoplay policy, missing AudioContext) — stay silent.
    }
}
// ---------------------------------------------------------------------------
// Installer.
// ---------------------------------------------------------------------------
/**
 * Install the task notifier against the sessions list feed.
 * @returns disposer — unsubscribes, restores the tab title and tears the channels down.
 */
function installTaskNotifier(input) {
    const { sessionsService, text, readState, pendingInteractions } = input;
    const list = sessionsService.list;
    /** Pending-user-interaction kind for a session, absent when it is not waiting on the user. */
    const pendingOf = (id) => {
        const kind = pendingInteractions.getSnapshot().get(id)?.kind;
        return kind === 'approval' || kind === 'plan-review' || kind === 'question' ? kind : undefined;
    };
    // --- detector state ------------------------------------------------------
    const watch = new Map();
    const lastFired = new Map();
    // --- title flash ---------------------------------------------------------
    let originalTitle = null;
    let flashTimer;
    let flashTick = false;
    let unread = 0;
    const visibleAndFocused = () => document.visibilityState === 'visible' && document.hasFocus();
    const startTitleFlash = () => {
        if (flashTimer !== undefined)
            return;
        originalTitle = document.title;
        flashTimer = window.setInterval(() => {
            flashTick = !flashTick;
            const base = originalTitle ?? '';
            document.title = flashTick ? `(${unread}) 🔔 ${base}` : `(${unread}) ${base}`;
        }, FLASH_INTERVAL_MS);
    };
    const stopTitleFlash = () => {
        if (flashTimer !== undefined) {
            window.clearInterval(flashTimer);
            flashTimer = undefined;
        }
        if (originalTitle !== null)
            document.title = originalTitle;
        originalTitle = null;
        unread = 0;
    };
    /** Coming back to a visible, focused page acknowledges everything. */
    const settleIfBack = () => {
        if (visibleAndFocused())
            stopTitleFlash();
    };
    const onVisibilityChange = () => {
        settleIfBack();
    };
    window.addEventListener('focus', settleIfBack);
    document.addEventListener('visibilitychange', onVisibilityChange);
    // --- system notification -------------------------------------------------
    const fireSystemNotification = (kind, sessionId, heading, body, chimeOn) => {
        if (typeof Notification === 'undefined')
            return;
        if (Notification.permission !== 'granted')
            return;
        try {
            // `silent` mirrors the chime channel: our motif is THE sound, so mute
            // the OS bark while it will play; otherwise let the platform ring.
            // `renotify` forces a fresh banner when this tag REPLACES an existing
            // toast — without it Chrome swaps the old toast silently and Windows
            // collapses it into the notification center.
            const options = {
                body,
                tag: `dsh-ui-tweaks:${sessionId}:${kind}`,
                silent: chimeOn,
                renotify: true,
            };
            const n = new Notification(heading, options);
            n.onclick = () => {
                try {
                    window.focus();
                }
                catch { /* ignore */ }
                try {
                    sessionsService.open(sessionId);
                }
                catch { /* session already gone — focus alone is fine */ }
                n.close();
            };
        }
        catch {
            // Construction can throw on some platforms — degrade quietly.
        }
    };
    // --- delivery ------------------------------------------------------------
    const deliver = (sessionId, displayTitle, kind, pending, detail, channels, now) => {
        const cooldownKey = `${sessionId}:${kind}`;
        const last = lastFired.get(cooldownKey);
        if (last !== undefined && now - last < COOLDOWN_MS)
            return;
        lastFired.set(cooldownKey, now);
        unread += 1;
        if (channels.titleFlash)
            startTitleFlash();
        if (!channels.systemNotification && !channels.sound)
            return;
        const heading = kind === 'complete'
            ? text.notifyTitleDone
            : kind === 'aborted'
                ? text.notifyTitleAborted
                : kind === 'failed'
                    ? text.notifyTitleFailed
                    : text.notifyTitlePending;
        let body = kind === 'aborted'
            ? text.bodyAborted
            : kind === 'failed'
                ? text.bodyFailed
                : text.bodyComplete;
        if (kind === 'interaction') {
            body = pending === 'approval'
                ? text.bodyApproval
                : pending === 'plan-review'
                    ? text.bodyPlan
                    : text.bodyQuestion;
        }
        fireSystemNotification(kind, sessionId, heading, fill(body, displayTitle, detail), channels.sound);
        if (channels.sound)
            playChime(kind === 'complete' ? 'up' : 'down');
    };
    // --- baseline arming -----------------------------------------------------
    /** Seed the watch map without firing: fresh installs and reloads stay quiet. */
    const armBaseline = () => {
        watch.clear();
        for (const row of Object.values(list.getSnapshot().byId)) {
            if (row.parentId !== undefined || row.blank)
                continue;
            const outcome = row.projectionValues?.[TURN_OUTCOME_KEY] ?? undefined;
            watch.set(row.id, { running: row.running, pending: pendingOf(row.id), completed: row.completed === true, outcome });
        }
    };
    // --- feed tick -----------------------------------------------------------
    const check = () => {
        const { options, channels } = readState();
        const deliverable = !options.onlyWhenHidden || !visibleAndFocused();
        const now = Date.now();
        const snap = list.getSnapshot();
        const seen = new Set();
        for (const row of Object.values(snap.byId)) {
            if (row.parentId !== undefined || row.blank)
                continue;
            seen.add(row.id);
            const prev = watch.get(row.id);
            const outcome = row.projectionValues?.[TURN_OUTCOME_KEY] ?? undefined;
            watch.set(row.id, { running: row.running, pending: pendingOf(row.id), completed: row.completed === true, outcome });
            if (prev === undefined)
                continue;
            // Interaction outranks completion: a turn ending ON a question must
            // announce the question, not a completion.
            if (prev.pending === undefined && pendingOf(row.id) !== undefined) {
                if (options.onInteraction && deliverable) {
                    deliver(row.id, row.displayTitle, 'interaction', pendingOf(row.id), undefined, channels, now);
                }
                continue;
            }
            const finished = prev.running && !row.running && pendingOf(row.id) === undefined;
            const completedReminder = !prev.completed && row.completed === true;
            if (finished || completedReminder) {
                // The green `completed` reminder often arrives a re-pull AFTER the
                // running-drop already announced the same finish — inside the
                // re-notify window it is a duplicate, not a new completion.
                let shouldFire = finished;
                if (!shouldFire) {
                    // Any recent terminal announcement (of any outcome kind) makes the
                    // green-dot reminder a duplicate of the same finish.
                    shouldFire = TERMINAL_KINDS.every((kind) => {
                        const last = lastFired.get(`${row.id}:${kind}`);
                        return last === undefined || now - last >= COMPLETE_RENOTIFY_MS;
                    });
                }
                if (shouldFire && options.onComplete && deliverable) {
                    // Trust the outcome only when it CHANGED on this very transition —
                    // a stale value from an earlier turn would mislabel the announce.
                    const fresh = prev.outcome === undefined
                        || outcome?.time !== prev.outcome.time
                        || outcome?.kind !== prev.outcome.kind;
                    const announcement = fresh && outcome !== undefined ? classifyFinish(outcome) : 'complete';
                    deliver(row.id, row.displayTitle, announcement, undefined, outcome?.errorMessage, channels, now);
                }
            }
        }
        // Forget removed sessions so a re-added id arms fresh instead of comparing
        // against stale pre-removal state.
        for (const id of watch.keys()) {
            if (!seen.has(id))
                watch.delete(id);
        }
    };
    armBaseline();
    const disposeFeed = list.subscribe(check);
    const disposePending = pendingInteractions.subscribe(check);
    return () => {
        disposeFeed();
        disposePending();
        stopTitleFlash();
        window.removeEventListener('focus', settleIfBack);
        document.removeEventListener('visibilitychange', onVisibilityChange);
        watch.clear();
        lastFired.clear();
        if (audioCtx !== undefined) {
            void audioCtx.close().catch(() => { });
            audioCtx = undefined;
        }
    };
}
};
__modules["./search.js"] = function(module, exports, require, __load_) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SEARCH_CSS = void 0;
exports.SearchSection = SearchSection;
const jsx_runtime_1 = require("react/jsx-runtime");
/**
 * dsh-ui-tweaks — search manager (browser half).
 *
 * Renders the "搜索" settings section, mounted only while the searchEnabled
 * toggle in 界面调整 is on. The page picks the preferred engine, configures
 * per-engine API keys (persisted into ~/.dsh/.credentials.yaml through the
 * same-origin route served by src/search-web.ts), and offers a live engine
 * test. Turning the toggle off in 界面调整 disposes this section and removes
 * the provider takeover, restoring the stock search backend.
 * @module dsh-ui-tweaks/client/search
 */
const react_1 = require("react");
/** Route matching the host half (src/search-web.ts). */
const SEARCH_ROUTE = '/_dsh/ui-tweaks/search';
async function searchRequest(init) {
    const response = await fetch(SEARCH_ROUTE, { credentials: 'same-origin', ...init });
    let body;
    try {
        body = await response.json();
    }
    catch {
        body = undefined;
    }
    if (!response.ok || body === undefined || !body.ok) {
        const failure = body;
        throw new Error(failure?.error?.message ?? `UI Tweaks search request failed with HTTP ${response.status}`);
    }
    return body.value;
}
exports.SEARCH_CSS = `
.dut-search{display:grid;gap:12px;max-width:680px;padding:6px 2px 36px}
.dut-search-head{display:flex;align-items:center;gap:10px;padding:14px 16px 0}
.dut-search-head h2{margin:0;font-size:15px;font-weight:600;letter-spacing:-.01em;color:var(--dsw-alias-label-primary)}
.dut-search-head p{margin:4px 0 0;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1.5}
.dut-search-note{padding:0 16px;font-size:11.5px;line-height:1.55;color:var(--dsw-alias-label-tertiary)}
.dut-search-path{font-family:var(--dsw-font-markdown-code-block-font-family,Consolas,monospace);font-size:11px;color:var(--dsw-alias-label-secondary)}
.dut-search-grid{display:grid;gap:2px;margin-top:4px}
.dut-search-row{display:grid;gap:6px;padding:10px 16px;border-radius:12px}
.dut-search-row:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dut-search-row-main{display:flex;align-items:center;gap:8px;min-width:0;flex-wrap:wrap}
.dut-search-name{font-size:13.5px;font-weight:600;color:var(--dsw-alias-label-primary)}
.dut-search-badge{flex:none;font-size:11px;line-height:1;padding:4px 9px;border-radius:999px;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary)}
.dut-search-badge.dut-search-ok{border-color:color-mix(in srgb,var(--dsw-alias-state-success-primary) 45%,transparent);color:var(--dsw-alias-state-success-primary)}
.dut-search-badge.dut-search-key{border-color:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 45%,transparent);color:var(--dsw-alias-state-warn-label)}
.dut-search-badge.dut-search-req{border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary) 45%,transparent);color:var(--dsw-alias-state-error-primary)}
.dut-search-spacer{flex:1}
.dut-search-input{box-sizing:border-box;height:30px;width:280px;max-width:100%;padding:0 10px;border-radius:9px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px}
.dut-search-input:focus{outline:none;border-color:color-mix(in srgb,var(--dsw-alias-state-business-primary) 55%,transparent)}
.dut-search-select{height:28px;padding:0 8px;border:1px solid var(--dsw-alias-border-l1);border-radius:9px;background:var(--dsw-alias-bg-layer-2);color:inherit;font:inherit;font-size:12.5px;cursor:pointer;color-scheme:light dark}
.dut-search-select:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}
.dut-search-btn{display:inline-flex;align-items:center;height:26px;padding:0 12px;border-radius:999px;border:1px solid var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11.5px;cursor:pointer;transition:background .15s ease,color .15s ease}
.dut-search-btn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dut-search-btn:disabled{opacity:.5;cursor:default}
.dut-search-status{padding:3px 10px;border-radius:999px;font-size:11.5px;background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 12%,transparent);color:var(--dsw-alias-state-success-primary)}
.dut-search-status.dut-search-err{background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 10%,transparent);color:var(--dsw-alias-state-error-primary)}
`;
let stylesInstalled = false;
function installSearchStyles() {
    if (stylesInstalled)
        return;
    const style = document.createElement('style');
    style.dataset.plugin = 'dsh-ui-tweaks';
    style.dataset.pluginCss = 'dsh-ui-tweaks-search';
    style.textContent = exports.SEARCH_CSS;
    document.head.appendChild(style);
    stylesInstalled = true;
}
const KEY_ENGINES = ['exa', 'tavily', 'keenable', 'perplexity', 'deepseek'];
const KEY_LABELS = {
    exa: { env: 'EXA_API_KEY', tier: 'optional' },
    tavily: { env: 'TAVILY_API_KEY', tier: 'optional' },
    keenable: { env: 'KEENABLE_API_KEY', tier: 'optional' },
    perplexity: { env: 'PERPLEXITY_API_KEY', tier: 'required' },
    deepseek: { env: 'DEEPSEEK_API_KEY', tier: 'required' },
};
function SearchSection({ controller, t }) {
    const settingsState = (0, react_1.useSyncExternalStore)(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
    const resolved = settingsState.value ?? {};
    const writable = settingsState.writable;
    const engine = typeof resolved.searchEngine === 'string' ? resolved.searchEngine : 'bing';
    const [snapshot, setSnapshot] = (0, react_1.useState)(null);
    const [busy, setBusy] = (0, react_1.useState)(null);
    const [drafts, setDrafts] = (0, react_1.useState)({});
    const [error, setError] = (0, react_1.useState)(null);
    const [notice, setNotice] = (0, react_1.useState)(null);
    const [testing, setTesting] = (0, react_1.useState)(false);
    const [testResult, setTestResult] = (0, react_1.useState)(null);
    const generation = (0, react_1.useMemo)(() => ({ current: 0 }), []);
    const load = () => {
        const gen = ++generation.current;
        void searchRequest().then(next => {
            if (gen !== generation.current)
                return;
            setSnapshot(next);
        }).catch((reason) => {
            if (gen !== generation.current)
                return;
            setError(reason instanceof Error ? reason.message : String(reason));
        });
    };
    (0, react_1.useEffect)(() => { load(); }, []);
    const run = (key, body, notice) => {
        setBusy(key);
        setError(null);
        setNotice(null);
        void searchRequest({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        }).then(next => {
            setSnapshot(next);
            setDrafts(current => {
                const copy = { ...current };
                const engine = body.engine;
                if (engine !== undefined)
                    delete copy[engine];
                return copy;
            });
            setNotice(notice);
        }).catch((reason) => {
            setError(reason instanceof Error ? reason.message : String(reason));
        }).finally(() => { setBusy(current => (current === key ? null : current)); });
    };
    const saveKey = (key) => {
        const value = drafts[key]?.trim();
        if (!value)
            return;
        run(`save:${key}`, { action: 'save-key', engine: key, value }, t('keySaved'));
    };
    const clearKey = (key) => {
        run(`clear:${key}`, { action: 'clear-key', engine: key }, t('keyCleared'));
    };
    const setField = (field, value) => {
        void controller.set(field, value).then(() => { setNotice(t('applied')); }).catch(() => { setError(t('unavailable')); });
    };
    const testEngine = () => {
        setTesting(true);
        setTestResult(null);
        const started = Date.now();
        void searchRequest({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'test', engine }),
        }).then(() => {
            setTestResult({ ok: true, message: `${t('searchTestOk')} (${Date.now() - started}ms)` });
        }).catch((reason) => {
            setTestResult({ ok: false, message: `${t('searchTestFail')}: ${reason instanceof Error ? reason.message : String(reason)}` });
        }).finally(() => { setTesting(false); });
    };
    const tierBadge = (tier) => {
        if (tier === 'free')
            return 'dut-search-ok';
        if (tier === 'required')
            return 'dut-search-req';
        return 'dut-search-key';
    };
    installSearchStyles();
    return ((0, jsx_runtime_1.jsxs)("div", { className: "dut-search", children: [(0, jsx_runtime_1.jsxs)("div", { className: "dut-panel", children: [(0, jsx_runtime_1.jsxs)("div", { className: "dut-search-head", children: [(0, jsx_runtime_1.jsx)("h2", { children: t('searchTitle') }), (0, jsx_runtime_1.jsx)("span", { className: "dut-search-spacer" }), (0, jsx_runtime_1.jsx)("button", { type: "button", className: "dut-search-btn", disabled: testing, onClick: () => { testEngine(); }, children: testing ? t('searchTesting') : t('searchTest') })] }), (0, jsx_runtime_1.jsx)("p", { className: "dut-search-note", children: t('searchIntro') }), testResult !== null ? (0, jsx_runtime_1.jsx)("p", { className: 'dut-search-note' + (testResult.ok ? '' : ' dut-search-err'), style: { color: testResult.ok ? 'var(--dsw-alias-state-success-primary)' : 'var(--dsw-alias-state-error-primary)' }, children: testResult.message }) : null, error !== null ? (0, jsx_runtime_1.jsx)("p", { className: "dut-search-note", style: { color: 'var(--dsw-alias-state-error-primary)' }, children: error }) : null, notice !== null ? (0, jsx_runtime_1.jsx)("p", { className: "dut-search-note", style: { color: 'var(--dsw-alias-state-success-primary)' }, children: notice }) : null, (0, jsx_runtime_1.jsxs)("div", { className: "dut-search-grid", children: [(0, jsx_runtime_1.jsx)("div", { className: "dut-search-row", children: (0, jsx_runtime_1.jsxs)("div", { className: "dut-search-row-main", children: [(0, jsx_runtime_1.jsx)("span", { className: "dut-search-name", children: t('searchEngine') }), (0, jsx_runtime_1.jsxs)("select", { className: "dut-search-select", value: engine, disabled: !writable, onChange: event => { setField('searchEngine', event.target.value); }, children: [(0, jsx_runtime_1.jsx)("option", { value: "bing", children: t('searchEngineBing') }), (0, jsx_runtime_1.jsx)("option", { value: "ddg", children: t('searchEngineDdg') }), (0, jsx_runtime_1.jsx)("option", { value: "exa", children: t('searchEngineExa') }), (0, jsx_runtime_1.jsx)("option", { value: "tavily", children: t('searchEngineTavily') }), (0, jsx_runtime_1.jsx)("option", { value: "keenable", children: t('searchEngineKeenable') }), (0, jsx_runtime_1.jsx)("option", { value: "perplexity", children: t('searchEnginePerplexity') }), (0, jsx_runtime_1.jsx)("option", { value: "deepseek", children: t('searchEngineDeepseek') })] })] }) }), (0, jsx_runtime_1.jsx)("div", { className: "dut-search-row", children: (0, jsx_runtime_1.jsxs)("div", { className: "dut-search-row-main", children: [(0, jsx_runtime_1.jsx)("span", { className: "dut-search-name", children: t('bingMarket') }), (0, jsx_runtime_1.jsxs)("select", { className: "dut-search-select", value: typeof resolved.bingMarket === 'string' ? resolved.bingMarket : 'zh-CN', disabled: !writable, onChange: event => { setField('bingMarket', event.target.value); }, children: [(0, jsx_runtime_1.jsx)("option", { value: "zh-CN", children: "\u4E2D\u56FD\u5927\u9646 (zh-CN)" }), (0, jsx_runtime_1.jsx)("option", { value: "zh-HK", children: "\u4E2D\u56FD\u9999\u6E2F (zh-HK)" }), (0, jsx_runtime_1.jsx)("option", { value: "zh-TW", children: "\u4E2D\u56FD\u53F0\u6E7E (zh-TW)" }), (0, jsx_runtime_1.jsx)("option", { value: "ja-JP", children: "\u65E5\u672C (ja-JP)" }), (0, jsx_runtime_1.jsx)("option", { value: "en-US", children: "\u7F8E\u56FD (en-US)" }), (0, jsx_runtime_1.jsx)("option", { value: "en-GB", children: "\u82F1\u56FD (en-GB)" })] })] }) })] })] }), (0, jsx_runtime_1.jsxs)("div", { className: "dut-panel", children: [(0, jsx_runtime_1.jsx)("div", { className: "dut-search-head", children: (0, jsx_runtime_1.jsx)("h2", { children: t('sectionKeys') }) }), (0, jsx_runtime_1.jsx)("p", { className: "dut-search-note", children: t('searchIntro') }), (0, jsx_runtime_1.jsxs)("p", { className: "dut-search-note", children: [t('keyEnvHint'), " ", (0, jsx_runtime_1.jsx)("span", { className: "dut-search-path", children: snapshot?.credentialsPath ?? '~/.dsh/.credentials.yaml' })] }), (0, jsx_runtime_1.jsx)("div", { className: "dut-search-grid", children: KEY_ENGINES.map(key => {
                            const info = KEY_LABELS[key];
                            const configured = snapshot?.keys?.[key] === true;
                            const draft = drafts[key] ?? '';
                            return ((0, jsx_runtime_1.jsxs)("div", { className: "dut-search-row", children: [(0, jsx_runtime_1.jsxs)("div", { className: "dut-search-row-main", children: [(0, jsx_runtime_1.jsx)("span", { className: "dut-search-name", children: t(`searchEngine${key.charAt(0).toUpperCase()}${key.slice(1)}`) }), (0, jsx_runtime_1.jsx)("span", { className: 'dut-search-badge ' + tierBadge(info.tier), children: info.tier === 'required' ? t('keyRequired') : info.tier === 'optional' ? t('keyOptional') : t('keyFree') }), (0, jsx_runtime_1.jsx)("span", { className: 'dut-search-badge' + (configured ? ' dut-search-ok' : ''), children: configured ? t('keyConfigured') : t('keyNotConfigured') })] }), (0, jsx_runtime_1.jsxs)("div", { className: "dut-search-row-main", children: [configured ? null : ((0, jsx_runtime_1.jsx)("input", { type: "password", className: "dut-search-input", placeholder: `${info.env}...`, value: draft, disabled: busy !== null || !writable, onChange: event => { setDrafts(current => ({ ...current, [key]: event.target.value })); } })), configured ? ((0, jsx_runtime_1.jsx)("button", { type: "button", className: "dut-search-btn", disabled: busy !== null || !writable, onClick: () => { clearKey(key); }, children: t('keyClear') })) : ((0, jsx_runtime_1.jsx)("button", { type: "button", className: "dut-search-btn", disabled: busy !== null || !writable || draft.trim().length === 0, onClick: () => { saveKey(key); }, children: t('keySave') }))] })] }, key));
                        }) })] })] }));
}
};
__modules["./timeline.js"] = function(module, exports, require, __load_) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TIMELINE_CSS = exports.TIMELINE_PROJECTION_KEY = void 0;
exports.installTimelineStyles = installTimelineStyles;
exports.TimelineRail = TimelineRail;
const jsx_runtime_1 = require("react/jsx-runtime");
/**
 * dsh-ui-tweaks — conversation timeline rail (browser half).
 *
 * A port of the DeepSeek official web app's ScrollNav interaction
 * (architecture reference: jjxjjjjiik-bot/dsh-chat-timeline, MIT) with two
 * deliberate fixes:
 *
 * 1. **Theme-aware styling** — the upstream plugin hardcoded light-on-dark
 *    colors (`rgba(255,255,255,…)`), which made the collapsed rail invisible
 *    in light mode. Every color here rides the DSH theme tokens
 *    (`--dsw-alias-*`), so the rail renders correctly in light and dark.
 *
 * 2. **Message-area anchoring** — the upstream plugin is `position: fixed;
 *    right: 12px` against the *viewport*, so an installed right sidebar
 *    (e.g. dsh-better-sidebar, whose layout push shrinks the conversation
 *    column via `#root { margin-right: var(--dsh-sidebar-width) }`) overlaps
 *    it. This rail measures `[data-conversation-scroll]` (the message area)
 *    and anchors to *its* right edge and vertical center, so it always sits at
 *    the right of the message area — beside the sidebar, never under it.
 *
 * Data source: the host `dshChatTimeline` session projection — a complete
 * server-side fold of the whole log, so it lists every user message whether
 * or not the browser has paged it into the loaded window. Jumping pages
 * history in through `ISession.loadOlder` until the target row paints, then
 * lands with measured geometry. Mounted in `conversation.input.dock` and
 * portaled to `document.body`.
 * @module dsh-ui-tweaks/client/timeline
 */
const react_1 = require("react");
const react_dom_1 = require("react-dom");
/** Projection key matching the host half (src/timeline.ts). */
exports.TIMELINE_PROJECTION_KEY = 'dshChatTimeline';
/** Gap between the rail and the message area's right edge, in px. */
const EDGE_GAP = 12;
/** Expanded panel width — keep in sync with `.dutl-wrap.dutl-show` (240px). */
const PANEL_WIDTH = 240;
/**
 * Horizontal slot of the detail bubble: this many px left of the EXPANDED
 * panel's left edge. Computed from constants instead of measuring the hovered
 * row — the row's rect mid-expansion-animation (first hover!) reflects the
 * still-narrow panel, which made the bubble hug the rail on first hover and
 * then jump left once the animation settled. A constant slot is stable from
 * the very first frame.
 */
const BUBBLE_GAP = 14;
// ---------------------------------------------------------------------------
// Timeline styles — theme-token based (works in light AND dark mode).
// ---------------------------------------------------------------------------
exports.TIMELINE_CSS = `
.dutl-nav{-webkit-user-select:none;-moz-user-select:none;-ms-user-select:none;user-select:none;z-index:100;display:flex;position:fixed;align-items:center;justify-content:flex-end;pointer-events:auto}
.dutl-wrap{position:relative;z-index:2;border-radius:16px;width:24px;max-width:240px;transition:width .28s cubic-bezier(0.32,0.72,0,1),background-color .22s ease,box-shadow .22s ease,border-color .22s ease;display:flex;flex-direction:column;overflow:hidden;box-sizing:border-box;border:1px solid transparent;background:transparent}
.dutl-wrap.dutl-show{width:240px;background:color-mix(in srgb,var(--dsw-alias-bg-layer-2) 88%,transparent);-webkit-backdrop-filter:blur(18px) saturate(1.35);backdrop-filter:blur(18px) saturate(1.35);border:1px solid var(--dsw-alias-border-l1);box-shadow:var(--dsw-shadow-lv1),0 0 0 1px color-mix(in srgb,var(--dsw-alias-border-l1) 55%,transparent)}
.dutl-page{max-height:340px;padding:6px 0;box-sizing:border-box;overscroll-behavior:contain;display:flex;flex-direction:column;align-items:stretch;width:100%;overflow:hidden}
.dutl-wrap.dutl-show .dutl-page{overflow-y:auto;overflow-x:hidden;scrollbar-width:thin;scrollbar-color:color-mix(in srgb,var(--dsw-alias-label-tertiary) 35%,transparent) transparent}
.dutl-page::-webkit-scrollbar{width:5px}
.dutl-page::-webkit-scrollbar-track{background:transparent}
.dutl-page::-webkit-scrollbar-thumb{background:color-mix(in srgb,var(--dsw-alias-label-tertiary) 35%,transparent);border-radius:4px}
.dutl-page::-webkit-scrollbar-thumb:hover{background:color-mix(in srgb,var(--dsw-alias-label-tertiary) 60%,transparent)}
.dutl-item{flex-shrink:0;cursor:pointer;height:30px;min-height:30px;width:100%;padding:0 2px 0 12px;box-sizing:border-box;display:flex;align-items:center;justify-content:flex-end;background:none;border:none;font:inherit;text-align:right;border-radius:10px;transition:color .18s ease,background-color .18s ease;color:var(--dsw-alias-label-secondary)}
.dutl-wrap.dutl-show .dutl-item{padding:0 8px 0 12px}
.dutl-item:hover{color:var(--dsw-alias-label-primary);background:color-mix(in srgb,var(--dsw-alias-interactive-bg-hover) 72%,transparent)}
.dutl-item.dutl-active{color:var(--dsw-alias-state-business-primary)}
.dutl-item.dutl-active:hover{background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 9%,transparent)}
.dutl-title{font-size:12.5px;line-height:20px;text-overflow:ellipsis;white-space:nowrap;opacity:0;margin-right:10px;flex:1;min-width:0;text-align:right;overflow:hidden;color:inherit;transform:translateX(5px);transition:opacity .18s ease,color .18s ease,transform .22s cubic-bezier(0.32,0.72,0,1)}
.dutl-title.dutl-show{opacity:1;transform:translateX(0)}
.dutl-item.dutl-active .dutl-title{color:inherit;font-weight:500}
.dutl-ind{flex-shrink:0;width:22px;height:22px;display:flex;justify-content:center;align-items:center}
.dutl-line{position:relative;background-color:color-mix(in srgb,var(--dsw-alias-label-tertiary) 55%,transparent);border-radius:3px;flex-shrink:0;width:8px;height:2px;transition:background-color .2s ease,width .24s cubic-bezier(0.34,1.56,0.64,1),height .24s cubic-bezier(0.34,1.56,0.64,1),box-shadow .2s ease}
.dutl-item:hover .dutl-line{background-color:var(--dsw-alias-state-business-primary);width:18px;height:3px;box-shadow:0 0 8px color-mix(in srgb,var(--dsw-alias-state-business-primary) 55%,transparent);animation:dutl-pop .32s cubic-bezier(0.34,1.56,0.64,1)}
.dutl-item.dutl-active .dutl-line{background-color:var(--dsw-alias-state-business-primary);width:12px;height:3px;box-shadow:0 0 6px color-mix(in srgb,var(--dsw-alias-state-business-primary) 38%,transparent)}
.dutl-item.dutl-active:hover .dutl-line{width:18px}
@keyframes dutl-pop{0%{transform:scaleY(1)}45%{transform:scaleY(1.55)}100%{transform:scaleY(1)}}
.dutl-bubble{position:fixed;z-index:200;max-width:280px;max-height:230px;box-sizing:border-box;padding:10px 12px;border-radius:12px;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);box-shadow:var(--dsw-shadow-lv1);color:var(--dsw-alias-label-primary);pointer-events:none;display:flex;flex-direction:column;gap:5px;transform:translateY(-50%);animation:dutl-bubble-in .16s cubic-bezier(0.32,0.72,0,1)}
.dutl-bubble::after{content:"";position:absolute;right:-5px;top:50%;width:8px;height:8px;margin-top:-4px;background:inherit;border-right:1px solid var(--dsw-alias-border-l1);border-top:1px solid var(--dsw-alias-border-l1);border-top-right-radius:2px;transform:rotate(45deg)}
.dutl-bubble-head{display:flex;align-items:center;gap:6px;font-size:11px;font-weight:500;color:var(--dsw-alias-label-tertiary)}
.dutl-bubble-user{display:inline-flex;align-items:center;gap:5px}
.dutl-bubble-dot{width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-state-business-primary);box-shadow:0 0 5px color-mix(in srgb,var(--dsw-alias-state-business-primary) 60%,transparent)}
.dutl-bubble-time{margin-left:auto;font-variant-numeric:tabular-nums;font-weight:400}
.dutl-bubble-text{font-size:12.5px;line-height:1.55;white-space:pre-wrap;word-break:break-word;overflow-y:auto;max-height:150px;color:var(--dsw-alias-label-primary)}
.dutl-bubble-text::-webkit-scrollbar{width:4px}
.dutl-bubble-text::-webkit-scrollbar-track{background:transparent}
.dutl-bubble-text::-webkit-scrollbar-thumb{background:color-mix(in srgb,var(--dsw-alias-label-tertiary) 35%,transparent);border-radius:4px}
@keyframes dutl-bubble-in{from{opacity:0;transform:translateY(-50%) translateX(6px)}to{opacity:1;transform:translateY(-50%) translateX(0)}}
@media (prefers-reduced-motion:reduce){.dutl-wrap,.dutl-title,.dutl-line,.dutl-bubble{transition:none;animation:none}}
`;
/** Install the rail stylesheet once (idempotent); returns the disposer. */
function installTimelineStyles() {
    const id = 'dsh-ui-tweaks-timeline';
    const existing = document.querySelector(`style[data-plugin-css="${id}"]`);
    if (existing !== null)
        return () => { };
    const style = document.createElement('style');
    style.dataset.plugin = 'dsh-ui-tweaks';
    style.dataset.pluginCss = id;
    style.textContent = exports.TIMELINE_CSS;
    document.head.appendChild(style);
    return () => { style.remove(); };
}
// ---------------------------------------------------------------------------
// Data collection, position tracking & jumping.
// ---------------------------------------------------------------------------
/** Normalize one record to { seq, time, text, id? }. */
function normalize(m) {
    if (m === null || typeof m !== 'object')
        return null;
    const record = m;
    if (typeof record.seq !== 'number')
        return null;
    return {
        seq: record.seq,
        time: typeof record.time === 'number' ? record.time : 0,
        text: typeof record.text === 'string' ? record.text : '',
        ...(typeof record.id === 'string' ? { id: record.id } : {}),
    };
}
/**
 * Resolve the chat node's `data-chat-anchor-key` from the durable message id:
 * the conversation engine keys a Context as `${kind.length}:${kind}${id}`
 * (`conversationContextKey`), and user messages ride the `input-message`
 * definition — 13 letters — so the anchor is `13:input-message{id}`.
 * Id-less entries (logs older than the durable-id era) cannot be keyed.
 */
function anchorKeyOf(m) {
    if (typeof m.id === 'string' && m.id !== '')
        return `13:input-message${m.id}`;
    return undefined;
}
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
/** One animation frame, or a small timeout fallback when rAF is unavailable. */
const nextFrame = () => typeof requestAnimationFrame === 'function'
    ? new Promise((resolve) => requestAnimationFrame(() => resolve()))
    : delay(16);
/** Compact, locale-aware timestamp for the detail bubble. */
function formatTime(ms) {
    const date = new Date(ms);
    const now = new Date();
    const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return date.toDateString() === now.toDateString()
        ? time
        : `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${time}`;
}
/**
 * Whether the session's loaded event window already covers `seq` — the jump
 * loop's termination signal. The Conversation assembly consumes the SAME
 * window (binding.eventSource), so a covered seq means the chat rows built
 * from it exist or are one commit away. `SessionSeq` is a brand, but the
 * window exposes plain event seqs, so a plain number comparison suffices.
 */
function windowCoversSeq(sessionsService, sessionId, seq) {
    const source = sessionsService.binding(sessionId)?.eventSource;
    if (source === undefined)
        return false;
    const entries = source.getSnapshot().entries;
    for (let i = entries.length - 1; i >= 0; i--) {
        const entry = entries[i];
        if (entry !== undefined && entry.type === 'event' && entry.event.seq === seq)
            return true;
    }
    return false;
}
/** Ensure the message node is loaded, its row painted and stable, then scroll. */
async function jumpToMessage(sessionsService, sessionId, target) {
    const session = sessionsService.binding(sessionId)?.session;
    // A missing binding is the expected transient around session switches — stay
    // quiet so switch storms don't spam; every other failure below announces
    // itself (this whole function's failure modes used to be totally silent).
    if (session === undefined)
        return false;
    if (typeof document === 'undefined')
        return false;
    // Devtools aid: set window.__dutTimelineDebug = true to trace jump stages.
    const dbg = Boolean(window.__dutTimelineDebug);
    const log = (...args) => { if (dbg)
        console.debug('[dsh-ui-tweaks timeline]', ...args); };
    // Pull history pages until the target row can exist. The binding's event
    // window mirrors the Conversation assembly's input, so "the window covers
    // the target seq" is exactly "the store holds the node the row renders
    // from". Idle polls are NOT charged against the budget anymore: the old
    // guard counted them together with real page loads against one shared
    // limit, so long sessions hit the cap mid-load and silently aborted with
    // the target still missing; only a second click worked because that retry
    // reused data pulled in the meantime.
    // Deep history pages arrive 50 events at a time over sequential round
    // trips (dsh caps maxMessages: 50), so a far entry legitimately takes
    // dozens of loads — budget generously instead of "two clicks then give up".
    const deadline = Date.now() + 150_000;
    const key = target.key;
    if (key === undefined) {
        // Id-less entries (logs older than the durable-id era) cannot rebuild a
        // chat anchor — the engine itself keys every row off the message id.
        console.info('[dsh-ui-tweaks timeline] jump aborted: entry has no durable message id', { seq: target.seq });
        return false;
    }
    let loads = 0;
    while (Date.now() < deadline && loads < 2500) {
        if (target.seq === undefined || windowCoversSeq(sessionsService, sessionId, target.seq))
            break;
        const snapshot = session.getSnapshot();
        if (snapshot.openState === 'error')
            return false;
        if (snapshot.hasMore !== true) {
            log('no more history', { loads });
            return false;
        }
        if (snapshot.loadingOlder === true) {
            await delay(60);
            continue;
        }
        loads += 1;
        await session.loadOlder();
        log('loadOlder resolved', { loads });
    }
    if (target.seq !== undefined && !windowCoversSeq(sessionsService, sessionId, target.seq)) {
        console.info('[dsh-ui-tweaks timeline] jump aborted: target still outside loaded window', { seq: target.seq, loads });
        return false;
    }
    // Wait for the painted row AND settled geometry. React paints new rows on
    // a later commit than the store update, and after a big prepend the seats
    // around the target keep growing over several hydration chunks — a
    // measurement taken during that settle is stale by the next commit.
    // Require the computed centering top to repeat across three consecutive
    // frames before trusting it; this also outlives post-prepend anchors.
    let frames = 0;
    let scrollport = null;
    let row = null;
    // `measuredTop` tracks the trusted landing position. It must never double as
    // an "unset" sentinel: the FIRST message's centered scrollTop clamps to 0,
    // and comparing that against a -1 sentinel looks like "unchanged" (|0-(-1)|=1),
    // settling the loop without ever storing the position — then the `< 0`
    // completeness check silently discarded the whole jump. That was exactly the
    // "clicking the first timeline entry does nothing" defect.
    let measuredTop = -1;
    let lastCandidate = null;
    let stableRuns = 0;
    let settled = false;
    while (frames++ < 360) {
        scrollport = document.querySelector('[data-conversation-scroll]');
        row = scrollport === null ? null : scrollport.querySelector(`[data-chat-anchor-key="${CSS.escape(key)}"]`);
        if (scrollport === null || row === null) {
            stableRuns = 0;
            await nextFrame();
            continue;
        }
        const spRect = scrollport.getBoundingClientRect();
        const rowRect = row.getBoundingClientRect();
        const candidate = Math.min(Math.max(scrollport.scrollTop + (rowRect.top - spRect.top) - (spRect.height - rowRect.height) / 2, 0), Math.max(0, scrollport.scrollHeight - scrollport.clientHeight));
        if (lastCandidate !== null && Math.abs(candidate - lastCandidate) <= 1) {
            stableRuns += 1;
        }
        else {
            stableRuns = 0;
        }
        // Record EVERY candidate — including 0 — so the settled value is always the
        // real geometry, sentinel-free.
        measuredTop = candidate;
        lastCandidate = candidate;
        if (stableRuns >= 2) {
            settled = true;
            break;
        }
        await nextFrame();
    }
    if (!settled)
        console.info('[dsh-ui-tweaks timeline] jump: layout did not settle in time, applying best effort', { frames });
    if (row === null || scrollport === null || measuredTop < 0) {
        console.info('[dsh-ui-tweaks timeline] jump aborted: layout never revealed the target row', { key, frames });
        return false;
    }
    // Position directly on the measured scrollport instead of relying on
    // scrollIntoView: the DOM contract picks the nearest scrolling ancestor,
    // which in deeply nested layouts can resolve to an inner overflow-clipped
    // wrapper rather than the visible message scroller, moving nothing. Own
    // geometry gives one deterministic target element per click.
    const far = Math.abs(row.getBoundingClientRect().top - scrollport.getBoundingClientRect().top) > scrollport.clientHeight * 2;
    // Always apply as one instant write. Smooth animations keep producing
    // frames AFTER later programmatic writes, silently retargeting the view;
    // a synchronous scrollTo with behavior 'auto' also cancels any running
    // smooth animation on this element first, so nothing can override the
    // landing position afterwards. Quiescence was already verified above.
    scrollport.scrollTo({ top: measuredTop, behavior: 'auto' });
    // One self-check pass two frames later: anything that rewrites the view
    // after our landing (a straggler at-bottom snap, a clamp transition after
    // huge prepends, a late image decode shift) moves the row far off center.
    // Recompute fresh and reassert once — invisible when everything behaved.
    await nextFrame();
    await nextFrame();
    const verifySp = document.querySelector('[data-conversation-scroll]');
    const verifyRow = verifySp === null ? null : verifySp.querySelector(`[data-chat-anchor-key="${CSS.escape(key)}"]`);
    if (verifySp !== null && verifyRow !== null) {
        const vRect = verifySp.getBoundingClientRect();
        const rRect = verifyRow.getBoundingClientRect();
        const offCenter = Math.abs((rRect.top + rRect.height / 2) - (vRect.top + vRect.height / 2));
        if (offCenter > vRect.height * 0.5) {
            const retargeted = Math.min(Math.max(verifySp.scrollTop + (rRect.top - vRect.top) - (vRect.height - rRect.height) / 2, 0), Math.max(0, verifySp.scrollHeight - verifySp.clientHeight));
            verifySp.scrollTo({ top: retargeted, behavior: 'auto' });
            log('self-check corrected', { top: retargeted });
        }
    }
    log('jump applied', { far, loads, frames, top: measuredTop });
    return true;
}
function TimelineRail({ useProjection, sessionId, sessionsService, controller, t }) {
    const settingsState = (0, react_1.useSyncExternalStore)(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
    const enabled = settingsState.value?.timelineStyle === 'web';
    const projected = useProjection(exports.TIMELINE_PROJECTION_KEY);
    // Memoize the entry list: the projection value is reference-stable between
    // its own changes, so this re-runs only when the underlying data moved —
    // never on an unrelated re-render.
    const messages = (0, react_1.useMemo)(() => {
        if (!Array.isArray(projected?.messages))
            return [];
        return projected.messages.map(normalize).filter((m) => m !== null);
    }, [projected]);
    const [activeIndex, setActiveIndex] = (0, react_1.useState)(-1);
    const [show, setShow] = (0, react_1.useState)(false);
    const [anchor, setAnchor] = (0, react_1.useState)(null);
    const [bubble, setBubble] = (0, react_1.useState)(null);
    const pageRef = (0, react_1.useRef)(null);
    const navRef = (0, react_1.useRef)(null);
    // Keep the active (blue) line visible. With many messages the rail page
    // scrolls (max-height 340px), and a freshly remounted rail — e.g. after
    // switching away and back to a session — starts at scrollTop 0, leaving the
    // current item clipped below the fold. While the panel is collapsed (nothing
    // fights the user's own scrolling) bring the active item into view whenever
    // it changes.
    //
    // The adjustment is "nearest edge" (scroll just enough that the item fits),
    // NOT re-centering: re-centering scrolls the page
    // even while the active item is already visible, and near the end of a long
    // conversation that shoves the EARLIEST entries out through the top clip —
    // their pixels then belong to nothing (elementsFromPoint on a clipped row
    // resolved to the chat scrollport behind the rail), so a trusted click on
    // "the first entry" hit empty space / the conversation and never reached the
    // button. Minimal scrolling keeps earlier entries on-panel far more often,
    // and the wheel handler below guarantees reachability for what remains
    // clipped anyway. Deferred to the next frame; cancelled on a newer change,
    // so a fast scroll never issues more than one layout write per frame.
    (0, react_1.useEffect)(() => {
        if (activeIndex < 0)
            return;
        const raf = requestAnimationFrame(() => {
            const page = pageRef.current;
            if (page === null)
                return;
            if (page.scrollHeight <= page.clientHeight + 1)
                return;
            const item = page.children[activeIndex];
            if (item === undefined)
                return;
            const pageRect = page.getBoundingClientRect();
            const itemRect = item.getBoundingClientRect();
            // Pure nearest-edge fit (scrollIntoView block:'nearest' semantics): touch
            // scrollTop only when the item is actually clipped, and only by the
            // clipped amount. Any standing breathing-room margin here would betray
            // terminal rows — guaranteeing a trailing gap below the LAST entry pins
            // the page to its maximum on every re-run, re-clipping the first entries
            // right after a manual scrub. Flush-at-edge is fine: rows are one hop in
            // either direction.
            if (itemRect.bottom > pageRect.bottom) {
                page.scrollTop += itemRect.bottom - pageRect.bottom;
            }
            else if (itemRect.top < pageRect.top) {
                page.scrollTop -= pageRect.top - itemRect.top;
            }
        });
        return () => { cancelAnimationFrame(raf); };
    }, [show, activeIndex]);
    // Wheel anywhere over the rail scrubs its internal page — collapsed strip
    // included. The collapsed wrap is overflow:hidden, so a native wheel over it
    // scrolled NOTHING and instead bubbled straight through the fixed rail into
    // `[data-conversation-scroll]`, scrolling the chat BEHIND the cursor's rail
    // position. Worse, any row pushed outside the 340px window by the follower
    // above was permanently unreachable: its area belongs to the wrap's clip or
    // whatever sits behind (see the follower comment), so no pointer action —
    // hover to preview, click to jump — could ever address it. Manual scrubbing
    // restores that access everywhere: wheel up/down moves the internal page,
    // preventDefault keeps the gesture from leaking into the chat scroller, and
    // hard ends fall through untouched. The listener is non-passive because
    // preventDefault requires it.
    const railRendered = enabled && sessionId !== undefined && messages.length >= 2;
    (0, react_1.useEffect)(() => {
        const nav = navRef.current;
        if (!railRendered || nav === null)
            return;
        const onWheel = (event) => {
            const page = pageRef.current;
            if (page === null || event.deltaY === 0)
                return;
            const max = page.scrollHeight - page.clientHeight;
            if (max <= 0)
                return;
            const before = page.scrollTop;
            const after = Math.min(max, Math.max(0, before + event.deltaY));
            if (after === before)
                return;
            event.preventDefault();
            event.stopPropagation();
            page.scrollTop = after;
        };
        nav.addEventListener('wheel', onWheel, { passive: false });
        return () => { nav.removeEventListener('wheel', onWheel); };
    }, [railRendered]);
    // Anchor the rail to the message area's right edge & vertical center. The
    // scrollport's right edge tracks both the built-in DSH column grid and any
    // right-sidebar layout push (e.g. dsh-better-sidebar), so the rail always
    // sits at the right of the message area — never under a sidebar.
    (0, react_1.useEffect)(() => {
        if (!enabled)
            return;
        const measure = () => {
            const sp = document.querySelector('[data-conversation-scroll]');
            if (sp === null)
                return;
            const rect = sp.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0)
                return;
            const top = Math.round(rect.top + rect.height / 2);
            const right = Math.max(0, Math.round(window.innerWidth - rect.right + EDGE_GAP));
            setAnchor((prev) => {
                if (prev !== null && Math.abs(prev.top - top) < 2 && Math.abs(prev.right - right) < 2)
                    return prev;
                return { top, right };
            });
        };
        measure();
        let raf = 0;
        const scrollport = document.querySelector('[data-conversation-scroll]');
        const observer = new ResizeObserver(() => {
            cancelAnimationFrame(raf);
            raf = requestAnimationFrame(measure);
        });
        if (scrollport !== null)
            observer.observe(scrollport);
        observer.observe(document.body);
        window.addEventListener('resize', measure);
        return () => {
            cancelAnimationFrame(raf);
            observer.disconnect();
            window.removeEventListener('resize', measure);
        };
    }, [enabled, sessionId]);
    // Track the reading position (the highlighted timeline item). Cost scales
    // with the conversation, so it must stay cheap on huge sessions: the user
    // rows are cached (never a full-subtree querySelectorAll per update), scroll
    // updates are coalesced to one per frame via rAF, and the old 2s polling
    // interval is replaced by a ResizeObserver — zero idle cost.
    //
    // The cache is resolved LAZILY: the projection delivers its full message
    // list before the chat window paints its rows (and the chat view can also
    // remount without a sessionId change — view-tab switches etc.), so
    // `updateActive` re-resolves whenever the cache is empty or the scrollport
    // identity changed. Without this, a rail mounted before the rows exist
    // would cache an empty map and never show a blue line again.
    (0, react_1.useEffect)(() => {
        if (messages.length === 0)
            return;
        const messageIndexByKey = new Map();
        for (let i = 0; i < messages.length; i++) {
            const message = messages[i];
            if (message === undefined)
                continue;
            const key = anchorKeyOf(message);
            if (key !== undefined)
                messageIndexByKey.set(key, i);
        }
        // Rendered user rows, resolved on demand (see the comment above).
        let scrollport = null;
        let rows = new Map();
        const resolveRows = () => {
            const sp = document.querySelector('[data-conversation-scroll]');
            scrollport = sp;
            const next = new Map();
            if (sp !== null) {
                for (const row of sp.querySelectorAll('[data-chat-anchor-key^="13:input-message"]')) {
                    const key = row.getAttribute('data-chat-anchor-key');
                    if (key !== null)
                        next.set(key, row);
                }
            }
            rows = next;
        };
        const updateActive = () => {
            const sp = document.querySelector('[data-conversation-scroll]');
            if (sp === null)
                return;
            if (sp !== scrollport || rows.size === 0)
                resolveRows();
            if (sp === null || sp !== scrollport || rows.size === 0)
                return;
            const rect = sp.getBoundingClientRect();
            if (rect.height === 0)
                return;
            const line = rect.top + rect.height * 0.4;
            let best = -1;
            let bestDist = Infinity;
            for (const [key, row] of rows) {
                const idx = messageIndexByKey.get(key) ?? -1;
                if (idx === -1)
                    continue;
                const r = row.getBoundingClientRect();
                const dist = Math.abs(r.top + r.height / 2 - line);
                if (dist < bestDist) {
                    bestDist = dist;
                    best = idx;
                }
            }
            setActiveIndex(best);
        };
        // The chat window may paint its rows a beat after the rail mounts (the
        // projection is ready before the DOM). Retry for a short budget until the
        // rows resolve, then evaluate once.
        let retries = 0;
        const retry = () => {
            if (rows.size === 0 && ++retries <= 120) {
                requestAnimationFrame(() => { resolveRows(); retry(); });
                return;
            }
            updateActive();
        };
        retry();
        // Coalesce scroll bursts into at most one update per frame. The listener
        // rides the document (capture) so it survives chat-view remounts that
        // replace the scrollport without a sessionId change.
        let scrollRaf = 0;
        const onScroll = () => {
            if (scrollRaf !== 0)
                return;
            scrollRaf = requestAnimationFrame(() => { scrollRaf = 0; updateActive(); });
        };
        document.addEventListener('scroll', onScroll, { passive: true, capture: true });
        // Re-evaluate when the viewport or its content grows without a scroll
        // (composer expansion, image loads, sidebar toggles) — this replaces the
        // old fixed-interval poll with an event-driven, idle-free equivalent.
        const observer = new ResizeObserver(() => { updateActive(); });
        observer.observe(document.body);
        return () => {
            if (scrollRaf !== 0)
                cancelAnimationFrame(scrollRaf);
            document.removeEventListener('scroll', onScroll, { capture: true });
            observer.disconnect();
        };
    }, [sessionId, messages.length]);
    if (!enabled || sessionId === undefined || messages.length < 2)
        return null;
    const railRight = anchor === null ? EDGE_GAP : anchor.right;
    const railStyle = anchor === null
        ? { top: '50%', right: EDGE_GAP, transform: 'translateY(-50%)' }
        : { top: anchor.top, right: anchor.right, transform: 'translateY(-50%)' };
    // Stable horizontal slot: always left of the fully-expanded panel, never
    // measured from the animating rows (see BUBBLE_GAP above).
    const bubbleStyle = { top: bubble === null ? 0 : bubble.top, right: railRight + PANEL_WIDTH + BUBBLE_GAP };
    return (0, react_dom_1.createPortal)((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsx)("div", { className: "dutl-nav", role: "navigation", "aria-label": t('railLabel'), ref: navRef, onMouseEnter: () => { setShow(true); }, onMouseLeave: () => { setShow(false); }, style: railStyle, children: (0, jsx_runtime_1.jsx)("div", { className: 'dutl-wrap' + (show ? ' dutl-show' : ''), children: (0, jsx_runtime_1.jsx)("div", { className: "dutl-page", ref: pageRef, children: messages.map((m, i) => {
                            return ((0, jsx_runtime_1.jsxs)("button", { type: "button", className: 'dutl-item' + (activeIndex === i ? ' dutl-active' : ''), "aria-label": `${t('roleUser')}: ${m.text.slice(0, 60) || t('noText')}`, "aria-current": activeIndex === i ? 'location' : undefined, onClick: () => { void jumpToMessage(sessionsService, sessionId, { key: anchorKeyOf(m), seq: m.seq }).catch(() => { }); }, onMouseEnter: (event) => {
                                    // Vertical: follow the hovered row (clamped into the
                                    // viewport). Horizontal: the constant slot next to the
                                    // expanded panel — identical on first hover and after.
                                    const rect = event.currentTarget.getBoundingClientRect();
                                    const top = Math.min(Math.max(rect.top + rect.height / 2, 150), window.innerHeight - 150);
                                    setBubble({ top, entry: m });
                                }, onMouseLeave: () => { setBubble(null); }, children: [(0, jsx_runtime_1.jsx)("span", { className: 'dutl-title' + (show ? ' dutl-show' : ''), children: m.text === '' ? t('noText') : m.text }), (0, jsx_runtime_1.jsx)("span", { className: "dutl-ind", "aria-hidden": true, children: (0, jsx_runtime_1.jsx)("span", { className: "dutl-line" }) })] }, m.seq));
                        }) }) }) }), bubble !== null && show ? ((0, jsx_runtime_1.jsxs)("div", { className: "dutl-bubble", style: bubbleStyle, role: "tooltip", children: [(0, jsx_runtime_1.jsxs)("div", { className: "dutl-bubble-head", children: [(0, jsx_runtime_1.jsxs)("span", { className: "dutl-bubble-user", children: [(0, jsx_runtime_1.jsx)("span", { className: "dutl-bubble-dot" }), t('roleUser')] }), (0, jsx_runtime_1.jsx)("span", { className: "dutl-bubble-time", children: formatTime(bubble.entry.time) })] }), (0, jsx_runtime_1.jsx)("div", { className: "dutl-bubble-text", children: bubble.entry.text === '' ? t('noText') : bubble.entry.text })] })) : null] }), document.body);
}
};
function __resolve(from, request) {
  if (!request.startsWith(".")) return request;
  var parts = from.slice(2).split("/"); parts.pop();
  for (var part of request.split("/")) { if (part === "." || part === "") continue; if (part === "..") parts.pop(); else parts.push(part); }
  return "./" + parts.join("/");
}
function __load(id) {
  if (__modules[id] === undefined) return require(id);
  if (__cache[id] !== undefined) return __cache[id].exports;
  var module = __cache[id] = { exports: {} };
  __modules[id](module, module.exports, require, function(request) { var resolved = __resolve(id, request); return __modules[resolved] === undefined ? require(request) : __load(resolved); });
  return module.exports;
}
return __load("./index.js"); } });
//# sourceMappingURL=client.js.map
