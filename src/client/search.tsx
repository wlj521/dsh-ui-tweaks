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

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { SettingsClient } from './index.tsx'

/** Route matching the host half (src/search-web.ts). */
const SEARCH_ROUTE = '/_dsh/ui-tweaks/search'

type SearchLabelKey =
  | 'searchTitle' | 'searchIntro' | 'searchEngine' | 'searchEngineHint'
  | 'searchEngineBing' | 'searchEngineDdg' | 'searchEngineExa' | 'searchEngineTavily'
  | 'searchEngineKeenable' | 'searchEnginePerplexity' | 'searchEngineDeepseek'
  | 'bingMarket' | 'bingMarketHint' | 'sectionKeys' | 'keyFree' | 'keyOptional' | 'keyRequired'
  | 'keyConfigured' | 'keyNotConfigured' | 'keySave' | 'keyClear'
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

export const SEARCH_CSS = `
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

export interface SearchSectionProps {
  controller: SettingsClient
  t: Translate
}

export function SearchSection({ controller, t }: SearchSectionProps) {
  const settingsState = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot)
  const resolved = settingsState.value ?? {}
  const writable = settingsState.writable
  const engine = typeof resolved.searchEngine === 'string' ? resolved.searchEngine : 'bing'
  const [snapshot, setSnapshot] = useState<SearchKeysSnapshot | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Partial<Record<EngineKey, string>>>({})
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

  const saveKey = (key: EngineKey): void => {
    const value = drafts[key]?.trim()
    if (!value) return
    run(`save:${key}`, { action: 'save-key', engine: key, value }, t('keySaved'))
  }

  const clearKey = (key: EngineKey): void => {
    run(`clear:${key}`, { action: 'clear-key', engine: key }, t('keyCleared'))
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
  return (
    <div className="dut-search">
      <div className="dut-panel">
        <div className="dut-search-head">
          <h2>{t('searchTitle')}</h2>
          <span className="dut-search-spacer" />
          <button type="button" className="dut-search-btn" disabled={testing} onClick={() => { testEngine() }}>
            {testing ? t('searchTesting') : t('searchTest')}
          </button>
        </div>
        <p className="dut-search-note">{t('searchIntro')}</p>
        {testResult !== null ? <p className={'dut-search-note' + (testResult.ok ? '' : ' dut-search-err')} style={{ color: testResult.ok ? 'var(--dsw-alias-state-success-primary)' : 'var(--dsw-alias-state-error-primary)' }}>{testResult.message}</p> : null}
        {error !== null ? <p className="dut-search-note" style={{ color: 'var(--dsw-alias-state-error-primary)' }}>{error}</p> : null}
        {notice !== null ? <p className="dut-search-note" style={{ color: 'var(--dsw-alias-state-success-primary)' }}>{notice}</p> : null}

        <div className="dut-search-grid">
          <div className="dut-search-row">
            <div className="dut-search-row-main">
              <span className="dut-search-name">{t('searchEngine')}</span>
              <select
                className="dut-search-select"
                value={engine}
                disabled={!writable}
                onChange={event => { setField('searchEngine', event.target.value) }}
              >
                <option value="bing">{t('searchEngineBing')}</option>
                <option value="ddg">{t('searchEngineDdg')}</option>
                <option value="exa">{t('searchEngineExa')}</option>
                <option value="tavily">{t('searchEngineTavily')}</option>
                <option value="keenable">{t('searchEngineKeenable')}</option>
                <option value="perplexity">{t('searchEnginePerplexity')}</option>
                <option value="deepseek">{t('searchEngineDeepseek')}</option>
              </select>
            </div>
          </div>
          <div className="dut-search-row">
            <div className="dut-search-row-main">
              <span className="dut-search-name">{t('bingMarket')}</span>
              <select
                className="dut-search-select"
                value={typeof resolved.bingMarket === 'string' ? resolved.bingMarket : 'zh-CN'}
                disabled={!writable}
                onChange={event => { setField('bingMarket', event.target.value) }}
              >
                <option value="zh-CN">中国大陆 (zh-CN)</option>
                <option value="zh-HK">中国香港 (zh-HK)</option>
                <option value="zh-TW">中国台湾 (zh-TW)</option>
                <option value="ja-JP">日本 (ja-JP)</option>
                <option value="en-US">美国 (en-US)</option>
                <option value="en-GB">英国 (en-GB)</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="dut-panel">
        <div className="dut-search-head">
          <h2>{t('sectionKeys')}</h2>
        </div>
        <p className="dut-search-note">{t('searchIntro')}</p>
        <p className="dut-search-note">{t('keyEnvHint')} <span className="dut-search-path">{snapshot?.credentialsPath ?? '~/.dsh/.credentials.yaml'}</span></p>
        <div className="dut-search-grid">
          {KEY_ENGINES.map(key => {
            const info = KEY_LABELS[key]
            const configured = snapshot?.keys?.[key] === true
            const draft = drafts[key] ?? ''
            return (
              <div className="dut-search-row" key={key}>
                <div className="dut-search-row-main">
                  <span className="dut-search-name">{t(`searchEngine${key.charAt(0).toUpperCase()}${key.slice(1)}` as SearchLabelKey)}</span>
                  <span className={'dut-search-badge ' + tierBadge(info.tier)}>
                    {info.tier === 'required' ? t('keyRequired') : info.tier === 'optional' ? t('keyOptional') : t('keyFree')}
                  </span>
                  <span className={'dut-search-badge' + (configured ? ' dut-search-ok' : '')}>
                    {configured ? t('keyConfigured') : t('keyNotConfigured')}
                  </span>
                </div>
                <div className="dut-search-row-main">
                  {configured ? null : (
                    <input
                      type="password"
                      className="dut-search-input"
                      placeholder={`${info.env}...`}
                      value={draft}
                      disabled={busy !== null || !writable}
                      onChange={event => { setDrafts(current => ({ ...current, [key]: event.target.value })) }}
                    />
                  )}
                  {configured ? (
                    <button type="button" className="dut-search-btn" disabled={busy !== null || !writable} onClick={() => { clearKey(key) }}>{t('keyClear')}</button>
                  ) : (
                    <button type="button" className="dut-search-btn" disabled={busy !== null || !writable || draft.trim().length === 0} onClick={() => { saveKey(key) }}>{t('keySave')}</button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
