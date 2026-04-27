import { useCallback, useEffect, useRef, useState } from 'preact/hooks'
import { apiFetch, getStoredApiKey, LS_API_KEY, withApiPath } from './api'
import type { MemeListItem, SearchResponse } from './types'

const LIMIT = 40
const SEARCH_TOPK = 24

type CatRow = { name: string; count: number | null; isAll: boolean }

type ErrorState = { title: string; detail: string; showConfigHint: boolean } | null

function IconSearch() {
  return (
    <svg class="h-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-4-4" />
    </svg>
  )
}

function IconLogo() {
  return (
    <svg class="header__logo" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="10" cy="10" r="6.5" />
      <line x1="15" y1="15" x2="21" y2="21" strokeLinecap="round" />
      <circle cx="8" cy="9" r=".8" fill="currentColor" stroke="none" />
      <circle cx="12" cy="9" r=".8" fill="currentColor" stroke="none" />
      <path d="M7.5 12.5 Q10 15 12.5 12.5" fill="none" strokeLinecap="round" />
    </svg>
  )
}

export function App() {
  const [categories, setCategories] = useState<CatRow[]>([])
  const [currentCat, setCurrentCat] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [searchMode, setSearchMode] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalBrowse, setTotalBrowse] = useState(0)
  const [items, setItems] = useState<MemeListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<ErrorState>(null)
  const [searchBanner, setSearchBanner] = useState<string | null>(null)

  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const [apiKeyInput, setApiKeyInput] = useState('')
  const [apiKeyVisible, setApiKeyVisible] = useState(false)
  const [settingsStatus, setSettingsStatus] = useState('')
  const [settingsError, setSettingsError] = useState(false)
  const [latestGeneratedKey, setLatestGeneratedKey] = useState('')
  const [showGenPreview, setShowGenPreview] = useState(false)

  const [arkKeyDirty, setArkKeyDirty] = useState(false)
  const [arkApiKey, setArkApiKey] = useState('')
  const [arkBaseUrl, setArkBaseUrl] = useState('')
  const [arkModel, setArkModel] = useState('')
  const [serverHadArkKey, setServerHadArkKey] = useState(false)
  const [arkStatus, setArkStatus] = useState('')

  const loadMemesRef = useRef<(page?: number, category?: string) => Promise<void>>(async () => {})
  const searchMemesRef = useRef<(q: string) => Promise<void>>(async () => {})

  const loadServerVector = useCallback(async () => {
    setArkStatus('')
    try {
      const res = await apiFetch(withApiPath('/api/admin/settings'))
      if (!res.ok) {
        setArkStatus('无法拉取向量配置元数据（' + res.status + '），请确认已登录或 API Key 正确。')
        return
      }
      const d = (await res.json()) as {
        database?: { arkApiKey?: boolean }
        vector?: { arkBaseUrl: string; embeddingModel: string }
      }
      setServerHadArkKey(Boolean(d?.database?.arkApiKey))
      setArkKeyDirty(false)
      setArkApiKey('')
      if (d?.vector) {
        setArkBaseUrl(d.vector.arkBaseUrl || '')
        setArkModel(d.vector.embeddingModel || '')
      }
    } catch (e) {
      setArkStatus(e instanceof Error ? e.message : String(e))
    }
  }, [])

  const openSettings = useCallback(() => {
    setApiKeyInput(getStoredApiKey())
    setApiKeyVisible(false)
    setLatestGeneratedKey('')
    setShowGenPreview(false)
    setSettingsStatus('')
    setSettingsError(false)
    void loadServerVector()
    setSettingsOpen(true)
  }, [loadServerVector])

  const loadCategories = useCallback(async () => {
    const res = await apiFetch(withApiPath('/api/memes/categories'))
    if (!res.ok) {
      const d = (await res.json().catch(() => ({}))) as { message?: string }
      throw new Error(d.message || `HTTP ${res.status}，请检查设置中的 API Key 或重新登录`)
    }
    const { categories: raw } = (await res.json()) as { categories: Array<Record<string, unknown>> }
    const rows: CatRow[] = [{ name: '', count: null, isAll: true }]
    if (Array.isArray(raw)) {
      for (const row of raw) {
        const label = (row.category ?? row.name ?? '未分类') as string
        const n = (row.count ?? (row as { _count?: { category?: number } })._count?.category) as number | undefined
        rows.push({ name: label, count: n ?? null, isAll: false })
      }
    }
    setCategories(rows)
  }, [])

  const loadMemes = useCallback(
    async (page = 1, category?: string) => {
      const cat = category !== undefined ? category : currentCat
      setSearchMode(false)
      setCurrentPage(page)
      setSearchBanner(null)
      setError(null)
      setLoading(true)
      const catParam = cat ? `&category=${encodeURIComponent(cat)}` : ''
      const res = await apiFetch(
        withApiPath(`/api/memes?page=${page}&limit=${LIMIT}${catParam}`)
      )
      if (!res.ok) {
        setLoading(false)
        const d = (await res.json().catch(() => ({}))) as { message?: string }
        setItems([])
        setError({
          title: '无法加载',
          detail: d.message || `HTTP ${res.status}，请在「设置」中填写与服务器一致的 API Key`,
          showConfigHint: true,
        })
        return
      }
      const { total, items: list } = (await res.json()) as { total: number; items: MemeListItem[] }
      setTotalBrowse(total)
      setItems(list)
      setLoading(false)
    },
    [currentCat]
  )

  useEffect(() => {
    loadMemesRef.current = loadMemes
  }, [loadMemes])

  const postSearch = async (query: string, mode: 'vector' | 'text') => {
    const res = await apiFetch(withApiPath('/api/search'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, top_k: SEARCH_TOPK, mode }),
    })
    let data: SearchResponse
    try {
      data = (await res.json()) as SearchResponse
    } catch {
      return { ok: false as const, res, data: null, parseError: true as const }
    }
    return { ok: res.ok, res, data, parseError: false as const }
  }

  const searchMemes = useCallback(async (query: string) => {
    setSearchMode(true)
    setSearchBanner(null)
    setError(null)
    setItems([])
    setLoading(true)
    try {
      let { ok, res, data, parseError } = await postSearch(query, 'vector')
      if (parseError) {
        setLoading(false)
        setError({ title: '响应无法解析', detail: '服务器返回的不是 JSON，请检查反代或网关。', showConfigHint: false })
        return
      }
      if (!ok && data?.error === 'embedding_failed') {
        const textTry = await postSearch(query, 'text')
        if (textTry.parseError) {
          setLoading(false)
          setError({ title: '搜索不可用', detail: '响应不是 JSON', showConfigHint: false })
          return
        }
        ok = textTry.ok
        res = textTry.res
        data = textTry.data
      }
      if (ok && data) {
        if (data.fallback === 'vector_unconfigured') {
          setSearchBanner(
            '未配置火山 Ark，已用全文（PGroonga）。在「设置」→「服务端 · 火山向量」中保存 Ark API Key 与模型。'
          )
        } else if (data.fallback === 'embedding_failed') {
          setSearchBanner('向量阶段失败，已自动改用全文：' + (data.warning || ''))
        } else if (data.mode === 'text' && !data.fallback) {
          setSearchBanner('当前为全文检索（PGroonga），未使用向量。在设置中配置 Ark 后可使用语义搜索。')
        }
      }
      if (!ok) {
        setLoading(false)
        setError({
          title: '搜索不可用',
          detail: data?.message || data?.error || `HTTP ${res.status}`,
          showConfigHint: true,
        })
        return
      }
      const results = data?.results
      if (!Array.isArray(results)) {
        setLoading(false)
        setError({ title: '返回格式异常', detail: '接口未返回 results 数组。', showConfigHint: false })
        return
      }
      setItems(results.map((r) => ({ ...r, filename: r.filename || '' })))
      setLoading(false)
    } catch (e) {
      setLoading(false)
      setError({ title: '网络错误', detail: e instanceof Error ? e.message : String(e), showConfigHint: false })
    }
  }, [])

  useEffect(() => {
    searchMemesRef.current = searchMemes
  }, [searchMemes])

  useEffect(() => {
    void apiFetch(withApiPath('/api/auth/config'), { credentials: 'include' })
      .then((r) => r.json())
      .catch(() => {})
  }, [])

  useEffect(() => {
    let cancel = false
    void (async () => {
      try {
        await loadCategories()
        if (!cancel) await loadMemes(1, '')
      } catch (e) {
        if (!cancel) {
          setLoading(false)
          setError({ title: '无法加载', detail: e instanceof Error ? e.message : String(e), showConfigHint: true })
        }
      }
    })()
    return () => {
      cancel = true
    }
    // 仅首屏，避免随 currentCat 导致 loadMemes 引用变化而重复全量拉取
  }, [])

  useEffect(() => {
    const q = searchInput.trim()
    if (!q) {
      if (searchMode) {
        setSearchMode(false)
        setSearchBanner(null)
        void loadMemesRef.current(1)
      }
      return
    }
    const t = window.setTimeout(() => {
      void searchMemesRef.current(q)
    }, 400)
    return () => clearTimeout(t)
  }, [searchInput, searchMode])

  const pickCategory = (name: string) => {
    setCurrentCat(name)
    setSearchInput('')
    setSidebarOpen(false)
    setSearchMode(false)
    setCurrentPage(1)
    setSearchBanner(null)
    setError(null)
    setLoading(true)
    void (async () => {
      const catParam = name ? `&category=${encodeURIComponent(name)}` : ''
      const res = await apiFetch(
        withApiPath(`/api/memes?page=1&limit=${LIMIT}${catParam}`)
      )
      if (!res.ok) {
        setLoading(false)
        const d = (await res.json().catch(() => ({}))) as { message?: string }
        setItems([])
        setError({
          title: '无法加载',
          detail: d.message || `HTTP ${res.status}`,
          showConfigHint: true,
        })
        return
      }
      const { total, items: list } = (await res.json()) as { total: number; items: MemeListItem[] }
      setTotalBrowse(total)
      setItems(list)
      setLoading(false)
    })()
  }

  const pages = Math.max(1, Math.ceil(totalBrowse / LIMIT))
  const showPagination = !searchMode && !loading && !error && pages > 1
  const showEmptyBrowse = !loading && !error && !searchMode && items.length === 0
  const showEmptySearch = !loading && !error && searchMode && items.length === 0
  const showCards = !loading && !error && items.length > 0

  return (
    <div class="layout">
      <header class="header">
        <div class="header__left">
          <button
            type="button"
            class="header__menu"
            onClick={() => setSidebarOpen((o) => !o)}
            aria-label="打开分类"
          >
            <span />
            <span />
            <span />
          </button>
          <div class="header__brand">
            <IconLogo />
            <div>
              <span class="header__brand-text">MemeSearch</span>
              <span class="header__brand-sub">多模态梗图检索</span>
            </div>
          </div>
        </div>
        <div class="header__search-wrap">
          <IconSearch />
          <input
            class="header__search-input"
            type="search"
            placeholder="搜索（语义，失败时全文）…"
            autoComplete="off"
            value={searchInput}
            onInput={(e) => setSearchInput((e.target as HTMLInputElement).value)}
          />
          <span class="header__search-kbd">↵</span>
        </div>
        <div class="header__right">
          <button type="button" class="header__btn" onClick={openSettings} title="设置与密钥">
            设置
          </button>
        </div>
      </header>

      {settingsOpen && (
        <div
          class="modal-overlay modal-overlay--open"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setSettingsOpen(false)
              setSettingsError(false)
              setSettingsStatus('')
            }
          }}
        >
          <div
            class="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settingsTitle"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="settingsTitle">设置</h2>
            <p class="hint">若服务器要求，浏览器请求会带 <code>X-API-Key</code>；与本地保存的 Key 一致。</p>
            <label htmlFor="apiKeyField">API Key</label>
            <div class="modal__field">
              <input
                id="apiKeyField"
                type={apiKeyVisible ? 'text' : 'password'}
                autoComplete="off"
                value={apiKeyInput}
                onInput={(e) => setApiKeyInput((e.target as HTMLInputElement).value)}
                placeholder="与服务器配置一致"
              />
              <button
                type="button"
                class="modal__icon-btn"
                title="显示或隐藏"
                onClick={() => setApiKeyVisible((v) => !v)}
              >
                {apiKeyVisible ? '◒' : '◉'}
              </button>
            </div>

            <h3 class="modal__subhead">服务端 · 火山向量</h3>
            <p class="hint">写入 <code>meme_app_settings</code>。Ark Key 不回显；留空不修改，除非点「清除」后保存。</p>
            <label htmlFor="arkKey">Ark API Key</label>
            <div class="modal__field">
              <input
                id="arkKey"
                type="password"
                autoComplete="off"
                placeholder={serverHadArkKey ? '已保存，留空不修改' : '可填写新 Key'}
                value={arkApiKey}
                onInput={(e) => {
                  setArkKeyDirty(true)
                  setArkApiKey((e.target as HTMLInputElement).value)
                }}
              />
            </div>
            <label htmlFor="arkBase">Ark Base URL</label>
            <input
              id="arkBase"
              class="modal__single"
              type="text"
              spellcheck={false}
              value={arkBaseUrl}
              onInput={(e) => setArkBaseUrl((e.target as HTMLInputElement).value)}
            />
            <label htmlFor="arkM">Embedding 模型</label>
            <input
              id="arkM"
              class="modal__single"
              type="text"
              spellcheck={false}
              value={arkModel}
              onInput={(e) => setArkModel((e.target as HTMLInputElement).value)}
            />
            <div class="modal__row">
              <button
                type="button"
                class="primary"
                onClick={async () => {
                  setArkStatus('')
                  try {
                    const body: Record<string, string | null> = {
                      arkBaseUrl: arkBaseUrl.trim() || null,
                      embeddingModel: arkModel.trim() || null,
                    }
                    if (arkKeyDirty) body.arkApiKey = arkApiKey.trim() || null
                    const res = await apiFetch(withApiPath('/api/admin/settings'), {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(body),
                    })
                    const d = (await res.json().catch(() => ({}))) as { message?: string; error?: string }
                    if (!res.ok) throw new Error(d.message || d.error || `HTTP ${res.status}`)
                    setArkStatus('已保存。数秒内生效。')
                    await loadServerVector()
                  } catch (e) {
                    setArkStatus(e instanceof Error ? e.message : String(e))
                  }
                }}
              >
                保存向量配置
              </button>
              <button
                type="button"
                onClick={() => {
                  setArkKeyDirty(true)
                  setArkApiKey('')
                  setArkStatus('将清除库内 Ark Key，请再点「保存向量配置」。')
                }}
              >
                清除已保存的 Ark Key
              </button>
            </div>
            {arkStatus && <p class="modal__status--sub">{arkStatus}</p>}

            {showGenPreview && latestGeneratedKey && (
              <div class="modal__key-preview is-visible">
                <div class="modal__key-preview-head">
                  <span class="modal__key-preview-title">随机生成的 API Key</span>
                </div>
                <code>{latestGeneratedKey}</code>
              </div>
            )}

            <div class="modal__row">
              <button
                type="button"
                class="primary"
                onClick={() => {
                  const v = apiKeyInput.trim()
                  if (v) localStorage.setItem(LS_API_KEY, v)
                  else localStorage.removeItem(LS_API_KEY)
                  setSettingsStatus(v ? '已保存 API Key。' : '已清除 API Key。')
                  setSettingsError(false)
                  setSettingsOpen(false)
                  void loadCategories().then(() => loadMemes(1))
                }}
              >
                保存本地 API Key
              </button>
              <button
                type="button"
                onClick={async () => {
                  setSettingsError(false)
                  setSettingsStatus('正在生成…')
                  try {
                    const res = await apiFetch(withApiPath('/api/admin/settings/generate-api-key'), {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                    })
                    const d = (await res.json().catch(() => ({}))) as { apiKey?: string; message?: string; error?: string }
                    if (!res.ok) throw new Error(d.message || d.error || `HTTP ${res.status}`)
                    if (!d.apiKey) throw new Error('未返回新 Key')
                    setApiKeyInput(d.apiKey)
                    setApiKeyVisible(true)
                    localStorage.setItem(LS_API_KEY, d.apiKey)
                    setLatestGeneratedKey(d.apiKey)
                    setShowGenPreview(true)
                    setSettingsStatus('已生成并写入服务器。')
                  } catch (e) {
                    setSettingsStatus(e instanceof Error ? e.message : String(e))
                    setSettingsError(true)
                  }
                }}
              >
                随机生成
              </button>
              <button
                type="button"
                onClick={() => {
                  localStorage.removeItem(LS_API_KEY)
                  setApiKeyInput('')
                  setShowGenPreview(false)
                  setLatestGeneratedKey('')
                  setSettingsStatus('已清除本地 API Key。')
                }}
              >
                清除本地 Key
              </button>
              <button
                type="button"
                onClick={async () => {
                  await apiFetch(withApiPath('/api/auth/logout'), { method: 'POST' })
                  window.location.href = '/login.html'
                }}
              >
                退出登录
              </button>
              <button
                type="button"
                onClick={() => {
                  setSettingsOpen(false)
                  setSettingsStatus('')
                }}
              >
                关闭
              </button>
            </div>
            {settingsStatus && (
              <p class={settingsError ? 'modal__status modal__status--error' : 'modal__status'}>
                {settingsStatus}
              </p>
            )}
          </div>
        </div>
      )}

      <button
        type="button"
        class={sidebarOpen ? 'sidebar__overlay sidebar__overlay--visible' : 'sidebar__overlay'}
        aria-label="关闭侧栏"
        onClick={() => setSidebarOpen(false)}
      />

      <div class="frame">
        <nav class={sidebarOpen ? 'sidebar sidebar--open' : 'sidebar'} aria-label="分类">
          <div class="sidebar__inner">
            <p class="sidebar__section-title">分类</p>
            <ul class="sidebar__list">
              {categories.map((c) => (
                <li key={c.isAll ? '__all' : c.name}>
                  <button
                    type="button"
                    class={
                      'sidebar-item' +
                      (c.isAll
                        ? currentCat === ''
                          ? ' active'
                          : ''
                        : currentCat === c.name
                          ? ' active'
                          : '')
                    }
                    onClick={() => {
                      if (c.isAll) pickCategory('')
                      else pickCategory(c.name)
                    }}
                  >
                    <span>{c.isAll ? '全部' : c.name}</span>
                    {c.count != null && <span class="count">{c.count}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </nav>

        <div class="main">
          <div class="grid-wrap">
            {searchBanner && (
              <div class="search-banner" role="status">
                <p>{searchBanner}</p>
              </div>
            )}
            {error && !loading && (
              <div class="state state--error">
                <h2>{error.title}</h2>
                <p>{error.detail}</p>
                {error.showConfigHint && (
                  <p class="hint">可在「设置」中保存 Ark 与 API Key。未配置向量时会用全文。</p>
                )}
              </div>
            )}
            {loading && <div class="loading">加载中…</div>}
            {showEmptyBrowse && (
              <div class="state">
                <h2>暂无数据</h2>
                <p>换分类，或先导入 ChineseBQB 数据。</p>
              </div>
            )}
            {showEmptySearch && (
              <div class="state">
                <h2>暂无结果</h2>
                <p>换关键词试试。</p>
              </div>
            )}
            {showCards && (
              <div class="grid">
                {items.map((m) => {
                  const tag = m.tags && m.tags.length > 0 ? m.tags[m.tags.length - 1] : ''
                  return (
                    <div class="card" key={m.id}>
                      <div class="card__img-wrap">
                        <img
                          src={m.url}
                          alt=""
                          loading="lazy"
                          onError={(e) => {
                            ;(e.target as HTMLImageElement).style.opacity = '0.35'
                          }}
                        />
                      </div>
                      <div class="info">
                        {tag && <span class="tag">{tag}</span>}
                        <div class="cat">{m.category || ''}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
          {showPagination && (
            <div class="pagination">
              <button type="button" disabled={currentPage <= 1} onClick={() => void loadMemes(currentPage - 1)}>
                上一页
              </button>
              <span>
                {currentPage} / {pages}（共 {totalBrowse} 条）
              </span>
              <button
                type="button"
                disabled={currentPage >= pages}
                onClick={() => void loadMemes(currentPage + 1)}
              >
                下一页
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
