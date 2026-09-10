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
import type { ISessions, SessionListState } from '@deepseek-ai/dsh-api-session-controller/client';
import type { WorkspaceSnapshot } from '@deepseek-ai/dsh-api-workspace-controller/client';
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-store';
import type { SettingsClient } from './index.tsx';
/** Locale keys the Archive manager reads off the `ui-tweaks` dictionary. */
type ArchiveLabelKey = 'archiveNav' | 'archiveTitle' | 'archiveEmpty' | 'archiveRestore' | 'archiveRestoring' | 'archiveDelete' | 'archiveDeleteAll' | 'archiveRestoreAll' | 'archiveCount' | 'archiveUnavailable' | 'archiveLiveError' | 'archiveDisabledHint' | 'archiveEnable' | 'archiveRestored' | 'unavailable';
type Translate = (key: ArchiveLabelKey) => string;
export declare const ARCHIVE_CSS = "\n.dut-arc{display:grid;gap:12px;max-width:680px;padding:6px 2px 36px}\n.dut-arc-head{display:flex;align-items:center;gap:10px;padding:14px 16px 0}\n.dut-arc-head h2{margin:0;font-size:15px;font-weight:600;letter-spacing:-.01em;color:var(--dsw-alias-label-primary)}\n.dut-arc-count{font-size:11.5px;color:var(--dsw-alias-label-secondary);padding:2px 8px;border-radius:999px;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1)}\n.dut-arc-spacer{flex:1}\n.dut-arc-btn{display:inline-flex;align-items:center;height:28px;padding:0 12px;border-radius:999px;border:1px solid var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;cursor:pointer;transition:background .15s ease,color .15s ease,border-color .15s ease}\n.dut-arc-btn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}\n.dut-arc-btn:disabled{opacity:.5;cursor:default}\n.dut-arc-btn.dut-arc-del:hover{border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary) 55%,transparent);color:var(--dsw-alias-state-error-primary);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 10%,transparent)}\n.dut-arc-btn.dut-arc-confirm{border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary) 55%,transparent);color:var(--dsw-alias-state-error-primary);font-weight:600}\n.dut-arc-body{display:grid;gap:2px;margin-top:4px}\n.dut-arc-row{display:flex;align-items:center;gap:8px;padding:10px 16px;border-radius:12px}\n.dut-arc-row:hover{background:var(--dsw-alias-interactive-bg-hover)}\n.dut-arc-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;text-align:left;background:transparent;border:none;padding:0;cursor:default;color:var(--dsw-alias-label-primary);font:inherit}\n.dut-arc-title{font-size:13.5px;font-weight:600;white-space:nowrap;text-overflow:ellipsis;overflow:hidden}\n.dut-arc-sub{font-size:11.5px;color:var(--dsw-alias-label-secondary);white-space:nowrap;text-overflow:ellipsis;overflow:hidden}\n.dut-arc-empty{padding:32px 16px;text-align:center;font-size:12.5px;color:var(--dsw-alias-label-secondary)}\n.dut-arc-alert{margin:8px 16px 0;padding:8px 12px;border-radius:10px;font-size:12px;line-height:1.5;background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 10%,transparent);color:var(--dsw-alias-state-error-primary)}\n.dut-arc-off{padding:20px 16px;display:grid;gap:12px}\n.dut-arc-off p{margin:0;font-size:12.5px;line-height:1.6;color:var(--dsw-alias-label-secondary)}\n";
/** Install the Archive stylesheet once (idempotent); returns the disposer. */
export declare function installArchiveStyles(): () => void;
export interface ArchiveSectionProps {
    controller: SettingsClient;
    t: Translate;
    sessionsService: ISessions;
    /** Framework standard feeds: session list + workspace archive set. */
    useSessions: SnapshotSelectorHook<SessionListState>;
    useWorkspaces: SnapshotSelectorHook<WorkspaceSnapshot>;
}
export declare function ArchiveSection({ controller, t, sessionsService, useSessions, useWorkspaces }: ArchiveSectionProps): import("react").JSX.Element;
export {};
//# sourceMappingURL=archive.d.ts.map