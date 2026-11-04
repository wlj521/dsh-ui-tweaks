/**
 * dsh-ui-tweaks — search manager (browser half).
 *
 * Renders the "搜索" settings section, mounted only while the searchEnabled
 * toggle in 界面调整 is on. The page picks the preferred engine, configures
 * per-engine API keys (persisted into ~/.dsh/.credentials.yaml through the
 * same-origin route served by src/search-web.ts), lets the user reveal or copy
 * a stored key on demand, and offers a live engine test. Turning the toggle off
 * in 界面调整 disposes this section and removes the provider takeover,
 * restoring the stock search backend.
 * @module dsh-ui-tweaks/client/search
 */

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { SettingsClient } from './index.tsx'
import { SelectMenu, type SelectMenuEntry } from './select-menu.tsx'

/** Route matching the host half (src/search-web.ts). */
const SEARCH_ROUTE = '/_dsh/ui-tweaks/search'

type SearchLabelKey =
  | 'searchTitle' | 'searchIntro' | 'searchEngine' | 'searchEngineHint'
  | 'searchEngineBing' | 'searchEngineDdg' | 'searchEngineExa' | 'searchEngineTavily'
  | 'searchEngineKeenable' | 'searchEnginePerplexity' | 'searchEngineDeepseek'
  | 'bingMarket' | 'bingMarketHint' | 'sectionKeys' | 'keyFree' | 'keyOptional' | 'keyRequired'
  | 'keyConfigured' | 'keyNotConfigured' | 'keySave' | 'keyClear'
  | 'keyShow' | 'keyHide' | 'keyCopy' | 'keyCopied'
  | 'keySaved' | 'keyCleared' | 'keyEnvHint' | 'searchTest' | 'searchTesting' | 'searchTestOk'
  | 'searchTestFail' | 'unavailable' | 'saved' | 'applied'

type Translate = (key: SearchLabelKey) => string

interface ApiSuccess<T> { ok: true; value: T }
interface ApiFailure { ok: false; error: { code: string; message: string } }

type EngineKey = 'exa' | 'tavily' | 'keenable' | 'perplexity' | 'deepseek'

interface SearchKeysSnapshot {
  credentialsPath: string
  keys: Record<EngineKey, boolean>
}

async function searchRequest<T>(init?: RequestInit): Promise<T> {
  const response = await fetch(SEARCH_ROUTE, { credentials: 'same-origin', ...init })
  let body: ApiSuccess<T> | ApiFailure | undefined
  try {
    body = await response.json() as ApiSuccess<T> | ApiFailure
  } catch {
    body = undefined
  }
  if (!response.ok || body === undefined || !body.ok) {
    const failure = body as ApiFailure | undefined
    throw new Error(failure?.error?.message ?? `UI Tweaks search request failed with HTTP ${response.status}`)
  }
  return body.value
}

/** Copy text from the page; Electron and older browsers may lack Clipboard API. */
async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText !== undefined) {
    try {
      await navigator.clipboard.writeText(text)
      return
    } catch {
      // Permission or transient platform failure: use the legacy path below.
    }
  }
  const field = document.createElement('textarea')
  field.value = text
  field.style.position = 'fixed'
  field.style.opacity = '0'
  document.body.appendChild(field)
  field.select()
  const copied = document.execCommand('copy')
  field.remove()
  if (!copied) throw new Error('clipboard unavailable')
}

export const SEARCH_CSS = `
.dut-search{display:grid;gap:14px;width:100%;max-width:820px;padding:4px 2px 36px}
.dut-search-shell{overflow:hidden}
.dut-search-head{display:flex;align-items:flex-start;gap:16px;padding:20px 20px 16px;border-bottom:1px solid var(--dsw-alias-border-l1)}
.dut-search-heading{display:grid;gap:6px;flex:1;min-width:0}
.dut-search-titleline{display:flex;align-items:center;gap:8px;min-width:0;flex-wrap:wrap}
.dut-search-head h2{margin:0;font-size:17px;line-height:1.3;font-weight:650;letter-spacing:-.015em;color:var(--dsw-alias-label-primary)}
.dut-search-desc{margin:0;font-size:12px;line-height:1.55;color:var(--dsw-alias-label-tertiary)}
.dut-search-count{display:inline-flex;align-items:center;height:22px;padding:0 9px;border-radius:999px;font-size:11px;white-space:nowrap;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1)}
.dut-search-test{display:inline-flex;align-items:center;justify-content:center;flex:none;height:30px;padding:0 13px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11.5px;cursor:pointer;transition:background .15s ease,color .15s ease,border-color .15s ease}
.dut-search-test:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dut-search-test:disabled{opacity:.5;cursor:default}
.dut-search-body{display:grid;gap:10px;padding:14px 16px 18px}
.dut-search-field{display:grid;gap:8px;padding:12px 14px;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1)}
.dut-search-field-head{display:flex;align-items:center;gap:16px;min-width:0}
.dut-search-label{font-size:12.5px;font-weight:600;color:var(--dsw-alias-label-primary)}
.dut-search-field small{font-size:11px;line-height:1.5;color:var(--dsw-alias-label-tertiary)}
.dut-search-field-head .dut-select-wrap{flex:none;margin-left:auto}
.dut-search-field .dut-select-trigger{min-width:210px;height:34px;border:1px solid var(--dsw-alias-border-l2);border-radius:9px;background:var(--dsw-alias-bg-module-platform)}
.dut-search-field .dut-select-trigger:hover{border-color:color-mix(in srgb,var(--dsw-alias-state-business-primary) 35%,var(--dsw-alias-border-l2))}
.dut-search-banner{margin:12px 16px 0;padding:8px 12px;border-radius:10px;font-size:12px;line-height:1.5}
.dut-search-banner-ok{background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 12%,transparent);color:var(--dsw-alias-state-success-primary)}
.dut-search-banner-err{background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 10%,transparent);color:var(--dsw-alias-state-error-primary)}
.dut-search-keys{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;padding:14px 16px 18px}
.dut-search-keycard{display:grid;gap:10px;padding:12px 13px;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1)}
.dut-search-keycard[data-configured=yes]{border-color:color-mix(in srgb,var(--dsw-alias-state-success-primary) 24%,var(--dsw-alias-border-l1))}
.dut-search-keycard-head{display:flex;align-items:center;gap:6px;flex-wrap:wrap;min-width:0}
.dut-search-keycopy{margin-left:auto;height:24px;padding:0 8px;font-size:11px;border-color:var(--dsw-alias-border-l1)}
.dut-search-keyname{font-size:13px;font-weight:650;color:var(--dsw-alias-label-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:180px}
.dut-search-badge{flex:none;font-size:10.5px;line-height:1;padding:4px 8px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary)}
.dut-search-badge.dut-search-ok{background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 12%,transparent);border-color:transparent;color:var(--dsw-alias-state-success-primary)}
.dut-search-badge.dut-search-key{background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 14%,transparent);border-color:transparent;color:var(--dsw-alias-state-warn-label)}
.dut-search-badge.dut-search-req{background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 12%,transparent);border-color:transparent;color:var(--dsw-alias-state-error-primary)}
.dut-search-keycard-body{display:flex;align-items:center;gap:8px;min-width:0}
.dut-search-keyactions{display:flex;align-items:center;gap:6px;flex:none;margin-left:auto}
.dut-search-keycard .dut-search-keyvalue{flex:1;min-width:0;font-family:var(--dsw-font-markdown-code-block-font-family,Consolas,monospace);font-size:11.5px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-module-platform);user-select:text}
.dut-search-keycard[data-revealed=yes] .dut-search-keycard-body{display:grid;gap:8px}
.dut-search-keycard[data-revealed=yes] .dut-search-keyvalue{width:100%}
.dut-search-keycard[data-revealed=yes] .dut-search-keyactions{justify-content:flex-end}
.dut-search-input{box-sizing:border-box;flex:1;min-width:0;height:30px;padding:0 9px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px}
.dut-search-input:focus{outline:none;border-color:color-mix(in srgb,var(--dsw-alias-state-business-primary) 55%,transparent);box-shadow:0 0 0 2px color-mix(in srgb,var(--dsw-alias-state-business-primary) 10%,transparent)}
.dut-search-input:disabled{opacity:.55;cursor:not-allowed}
.dut-search-btn{display:inline-flex;align-items:center;justify-content:center;flex:none;height:28px;padding:0 10px;border-radius:7px;border:1px solid transparent;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11.5px;cursor:pointer;transition:background .15s ease,color .15s ease,border-color .15s ease}
.dut-search-btn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l1)}
.dut-search-btn:disabled{opacity:.45;cursor:default}
.dut-search-btn.dut-search-save{color:var(--dsw-alias-state-business-primary);border-color:color-mix(in srgb,var(--dsw-alias-state-business-primary) 40%,transparent)}
.dut-search-btn.dut-search-save:hover{background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 10%,transparent);color:var(--dsw-alias-state-business-primary)}
.dut-search-btn.dut-search-clear:hover{border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary) 50%,transparent);color:var(--dsw-alias-state-error-primary);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 10%,transparent)}
.dut-search-btn.dut-search-reveal{color:var(--dsw-alias-label-secondary);border-color:var(--dsw-alias-border-l1)}
.dut-search-mask{flex:1;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:clip;font-size:14px;letter-spacing:.18em;color:var(--dsw-alias-label-tertiary)}
.dut-search-path{font-family:var(--dsw-font-markdown-code-block-font-family,Consolas,monospace);font-size:10.5px;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-module-platform);border-radius:5px;padding:2px 6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:320px;display:inline-block;vertical-align:bottom}
@media (max-width:760px){.dut-search-keys{grid-template-columns:1fr}.dut-search-field-head{flex-wrap:wrap}.dut-search-field-head .dut-select-wrap{width:100%;margin-left:0}.dut-search-field-head .dut-select-trigger{width:100%}}
`

let stylesInstalled = false
function installSearchStyles(): void {
  if (stylesInstalled) return
  const style = document.createElement('style')
  style.dataset.plugin = 'dsh-ui-tweaks'
  style.dataset.pluginCss = 'dsh-ui-tweaks-search'
  style.textContent = SEARCH_CSS
  document.head.appendChild(style)
  stylesInstalled = true
}

const KEY_ENGINES: readonly EngineKey[] = ['exa', 'tavily', 'keenable', 'perplexity', 'deepseek']
const KEY_LABELS: Record<EngineKey, { env: string; tier: 'free' | 'optional' | 'required' }> = {
  exa: { env: 'EXA_API_KEY', tier: 'optional' },
  tavily: { env: 'TAVILY_API_KEY', tier: 'optional' },
  keenable: { env: 'KEENABLE_API_KEY', tier: 'optional' },
  perplexity: { env: 'PERPLEXITY_API_KEY', tier: 'required' },
  deepseek: { env: 'DEEPSEEK_API_KEY', tier: 'required' },
}

/** Bing market codes; locale-independent, so they live at module level. */
const BING_MARKET_ENTRIES: readonly SelectMenuEntry[] = [
  { value: 'zh-CN', label: '中国大陆 (zh-CN)' },
  { value: 'zh-HK', label: '中国香港 (zh-HK)' },
  { value: 'zh-TW', label: '中国台湾 (zh-TW)' },
  { value: 'ja-JP', label: '日本 (ja-JP)' },
  { value: 'en-US', label: '美国 (en-US)' },
  { value: 'en-GB', label: '英国 (en-GB)' },
]

export interface SearchSectionProps {
  controller: SettingsClient
  t: Translate
}

export function SearchSection({ controller, t }: SearchSectionProps) {
  const settingsState = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot)
  const resolved = settingsState.value ?? {}
  const writable = settingsState.writable
  const engine = typeof resolved.searchEngine === 'string' ? resolved.searchEngine : 'bing'
  /** The Bing market only feeds the Bing backend (src/search.ts passes it as
   * `mkt`), so its row stays hidden under every other engine. */
  const bingOnly = engine === 'bing'
  const [snapshot, setSnapshot] = useState<SearchKeysSnapshot | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Partial<Record<EngineKey, string>>>({})
  const [revealed, setRevealed] = useState<Partial<Record<EngineKey, string>>>({})
  const [revealBusy, setRevealBusy] = useState<EngineKey | null>(null)
  const [copyBusy, setCopyBusy] = useState<EngineKey | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const generation = useMemo(() => ({ current: 0 }), [])

  const load = (): void => {
    const gen = ++generation.current
    void searchRequest<SearchKeysSnapshot>().then(next => {
      if (gen !== generation.current) return
      setSnapshot(next)
    }).catch((reason: unknown) => {
      if (gen !== generation.current) return
      setError(reason instanceof Error ? reason.message : String(reason))
    })
  }

  useEffect(() => { load() }, [])

  const run = (key: string, body: Record<string, unknown>, notice: string): void => {
    setBusy(key)
    setError(null)
    setNotice(null)
    void searchRequest<SearchKeysSnapshot>({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(next => {
      setSnapshot(next)
      setDrafts(current => {
        const copy = { ...current }
        const engine = (body as { engine?: EngineKey }).engine
        if (engine !== undefined) delete copy[engine]
        return copy
      })
      setNotice(notice)
    }).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : String(reason))
    }).finally(() => { setBusy(current => (current === key ? null : current)) })
  }

  /** Fetch one stored key for an explicit reveal or copy action. */
  const fetchStoredKey = (key: EngineKey): Promise<string> =>
    searchRequest<{ key: string }>({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reveal-key', engine: key }),
    }).then(result => result.key)

  const saveKey = (key: EngineKey): void => {
    const value = drafts[key]?.trim()
    if (!value) return
    setRevealed(current => {
      const next = { ...current }
      delete next[key]
      return next
    })
    run(`save:${key}`, { action: 'save-key', engine: key, value }, t('keySaved'))
  }

  const clearKey = (key: EngineKey): void => {
    setRevealed(current => {
      const next = { ...current }
      delete next[key]
      return next
    })
    run(`clear:${key}`, { action: 'clear-key', engine: key }, t('keyCleared'))
  }

  /** Fetch and show one key on explicit request, or hide an already-revealed one. */
  const revealKey = (key: EngineKey): void => {
    if (revealed[key] !== undefined) {
      setRevealed(current => {
        const next = { ...current }
        delete next[key]
        return next
      })
      return
    }
    setRevealBusy(key)
    setError(null)
    setNotice(null)
    void fetchStoredKey(key).then(keyValue => {
      setRevealed(current => ({ ...current, [key]: keyValue }))
    }).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : String(reason))
    }).finally(() => { setRevealBusy(current => (current === key ? null : current)) })
  }

  const copyKey = (key: EngineKey, shownKey?: string): void => {
    setCopyBusy(key)
    setError(null)
    setNotice(null)
    const keyValue = shownKey !== undefined ? Promise.resolve(shownKey) : fetchStoredKey(key)
    void keyValue.then(value => copyText(value)).then(() => {
      setNotice(t('keyCopied'))
    }).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : String(reason))
    }).finally(() => { setCopyBusy(current => (current === key ? null : current)) })
  }

  const setField = (field: 'searchEngine' | 'bingMarket', value: string): void => {
    void controller.set(field, value).then(() => { setNotice(t('applied')) }).catch(() => { setError(t('unavailable')) })
  }

  const testEngine = (): void => {
    setTesting(true)
    setTestResult(null)
    const started = Date.now()
    void searchRequest<SearchKeysSnapshot>({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'test', engine }),
    }).then(() => {
      setTestResult({ ok: true, message: `${t('searchTestOk')} (${Date.now() - started}ms)` })
    }).catch((reason: unknown) => {
      setTestResult({ ok: false, message: `${t('searchTestFail')}: ${reason instanceof Error ? reason.message : String(reason)}` })
    }).finally(() => { setTesting(false) })
  }

  const tierBadge = (tier: 'free' | 'optional' | 'required'): string => {
    if (tier === 'free') return 'dut-search-ok'
    if (tier === 'required') return 'dut-search-req'
    return 'dut-search-key'
  }

  installSearchStyles()
  const configuredCount = KEY_ENGINES.filter(key => snapshot?.keys?.[key] === true).length
  return (
    <div className="dut-search">
      <div className="dut-panel dut-search-shell">
        <div className="dut-search-head">
          <div className="dut-search-heading">
            <div className="dut-search-titleline">
              <h2>{t('searchTitle')}</h2>
            </div>
            <p className="dut-search-desc">{t('searchIntro')}</p>
          </div>
          <button type="button" className="dut-search-test" disabled={testing} onClick={() => { testEngine() }}>
            {testing ? t('searchTesting') : t('searchTest')}
          </button>
        </div>
        {testResult !== null ? <div className={'dut-search-banner ' + (testResult.ok ? 'dut-search-banner-ok' : 'dut-search-banner-err')}>{testResult.message}</div> : null}
        {error !== null ? <div className="dut-search-banner dut-search-banner-err">{error}</div> : null}
        {notice !== null ? <div className="dut-search-banner dut-search-banner-ok">{notice}</div> : null}
        <div className="dut-search-body">
          <div className="dut-search-field">
            <div className="dut-search-field-head">
              <span className="dut-search-label">{t('searchEngine')}</span>
              <SelectMenu
                ariaLabel={t('searchEngine')}
                value={engine}
                entries={[
                  { value: 'bing', label: t('searchEngineBing') },
                  { value: 'ddg', label: t('searchEngineDdg') },
                  { value: 'exa', label: t('searchEngineExa') },
                  { value: 'tavily', label: t('searchEngineTavily') },
                  { value: 'keenable', label: t('searchEngineKeenable') },
                  { value: 'perplexity', label: t('searchEnginePerplexity') },
                  { value: 'deepseek', label: t('searchEngineDeepseek') },
                ]}
                disabled={!writable}
                onChange={value => { setField('searchEngine', value) }}
              />
            </div>
            <small>{t('searchEngineHint')}</small>
          </div>
          {bingOnly ? (
            <div className="dut-search-field">
              <div className="dut-search-field-head">
                <span className="dut-search-label">{t('bingMarket')}</span>
                <SelectMenu
                  ariaLabel={t('bingMarket')}
                  value={typeof resolved.bingMarket === 'string' ? resolved.bingMarket : 'zh-CN'}
                  entries={BING_MARKET_ENTRIES}
                  disabled={!writable}
                  onChange={value => { setField('bingMarket', value) }}
                />
              </div>
              <small>{t('bingMarketHint')}</small>
            </div>
          ) : null}
        </div>
      </div>

      <div className="dut-panel dut-search-shell">
        <div className="dut-search-head">
          <div className="dut-search-heading">
            <div className="dut-search-titleline">
              <h2>{t('sectionKeys')}</h2>
              <span className="dut-search-count">{configuredCount}/{KEY_ENGINES.length}</span>
            </div>
            <p className="dut-search-desc">{t('keyEnvHint')} <code className="dut-search-path">{snapshot?.credentialsPath ?? '~/.dsh/.credentials.yaml'}</code></p>
          </div>
        </div>
        <div className="dut-search-keys">
          {KEY_ENGINES.map(key => {
            const info = KEY_LABELS[key]
            const configured = snapshot?.keys?.[key] === true
            const draft = drafts[key] ?? ''
            const shownKey = revealed[key]
            return (
              <div className="dut-search-keycard" data-configured={configured ? 'yes' : 'no'} data-revealed={shownKey !== undefined ? 'yes' : 'no'} key={key}>
                <div className="dut-search-keycard-head">
                  <span className="dut-search-keyname">{t(`searchEngine${key.charAt(0).toUpperCase()}${key.slice(1)}` as SearchLabelKey)}</span>
                  <span className={'dut-search-badge ' + tierBadge(info.tier)}>
                    {info.tier === 'required' ? t('keyRequired') : info.tier === 'optional' ? t('keyOptional') : t('keyFree')}
                  </span>
                  <span className={'dut-search-badge' + (configured ? ' dut-search-ok' : '')}>
                    {configured ? t('keyConfigured') : t('keyNotConfigured')}
                  </span>
                  {configured ? (
                    <button type="button" className="dut-search-btn dut-search-keycopy" disabled={busy !== null || copyBusy === key || !writable} onClick={() => { copyKey(key, shownKey) }}>
                      {copyBusy === key ? '…' : t('keyCopy')}
                    </button>
                  ) : null}
                </div>
                <div className="dut-search-keycard-body">
                  {configured ? (
                    shownKey !== undefined
                      ? <input className="dut-search-input dut-search-keyvalue" value={shownKey} readOnly aria-label={t('keyShow')} onFocus={event => { event.currentTarget.select() }} />
                      : <span className="dut-search-mask" aria-label={t('keyConfigured')}>••••••••••••</span>
                  ) : (
                    <input
                      type="password"
                      className="dut-search-input"
                      placeholder={`${info.env}...`}
                      value={draft}
                      disabled={busy !== null || !writable}
                      onChange={event => { setDrafts(current => ({ ...current, [key]: event.target.value })) }}
                    />
                  )}
                  <div className="dut-search-keyactions">
                    {configured ? (
                      <>
                        <button type="button" className="dut-search-btn dut-search-reveal" disabled={busy !== null || revealBusy === key || !writable} onClick={() => { revealKey(key) }}>
                          {revealBusy === key ? '…' : shownKey !== undefined ? t('keyHide') : t('keyShow')}
                        </button>
                        <button type="button" className="dut-search-btn dut-search-clear" disabled={busy !== null || !writable} onClick={() => { clearKey(key) }}>{t('keyClear')}</button>
                      </>
                    ) : (
                      <button type="button" className="dut-search-btn dut-search-save" disabled={busy !== null || !writable || draft.trim().length === 0} onClick={() => { saveKey(key) }}>{t('keySave')}</button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
