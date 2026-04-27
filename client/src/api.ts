const API = ''
export const LS_API_KEY = 'meme_api_key'

export function getStoredApiKey(): string {
  return localStorage.getItem(LS_API_KEY) || ''
}

function apiInitHeaders(h?: Record<string, string>) {
  const o: Record<string, string> = h ? { ...h } : {}
  const k = getStoredApiKey()
  if (k) o['X-API-Key'] = k
  return o
}

export function apiFetch(input: string | URL | globalThis.Request, init?: RequestInit) {
  const next: RequestInit = { ...init, credentials: 'include' }
  const headers = new Headers(apiInitHeaders())
  if (init?.headers) {
    const m = new Headers(init.headers)
    m.forEach((v, k) => headers.set(k, v))
  }
  next.headers = headers
  if (input instanceof Request) {
    return fetch(new Request(input, next))
  }
  return fetch(input, next)
}

export function withApiPath(path: string) {
  return `${API}${path.startsWith('/') ? path : `/${path}`}`
}
