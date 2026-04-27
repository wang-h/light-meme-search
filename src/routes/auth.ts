import { Hono } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { createSessionToken, verifySessionToken } from '../lib/session.js'
import {
  loadEffectiveSettings,
  getSessionSecretAfterLoad,
  getSitePasswordAfterLoad,
  isSiteLoginEnabledAfterLoad,
  isApiKeyRequiredAfterLoad,
} from '../lib/meme-settings.js'

const auth = new Hono()

const secureCookie = () =>
  process.env.MEME_COOKIE_SECURE === 'true' ||
  process.env.NODE_ENV === 'production' ||
  process.env.COOKIE_SECURE === '1'

function clientProto(c: { req: { header: (k: string) => string | undefined } }): 'https' | 'http' {
  const xfp = c.req.header('X-Forwarded-Proto')
  if (xfp === 'https' || xfp === 'http') return xfp
  return 'http'
}

/** 无需登录即可调用：告知前端是否启用密码、API Key */
auth.get('/config', async (c) => {
  await loadEffectiveSettings()
  return c.json({
    requireLogin: isSiteLoginEnabledAfterLoad(),
    requireApiKey: isApiKeyRequiredAfterLoad(),
  })
})

auth.get('/status', async (c) => {
  await loadEffectiveSettings()
  const secret = getSessionSecretAfterLoad()
  const tok = getCookie(c, 'meme_session')
  return c.json({ loggedIn: verifySessionToken(tok, secret) })
})

auth.post('/login', async (c) => {
  await loadEffectiveSettings()
  const want = getSitePasswordAfterLoad()
  if (!want) {
    return c.json({ error: 'login_disabled' }, 400)
  }
  const body = (await c.req.json().catch(() => null)) as { password?: string } | null
  if (!body || body.password !== want) {
    return c.json({ error: 'invalid_password' }, 401)
  }
  const token = createSessionToken(getSessionSecretAfterLoad())
  const isHttps = clientProto(c) === 'https'
  setCookie(c, 'meme_session', token, {
    path: '/',
    httpOnly: true,
    sameSite: 'Lax',
    maxAge: 7 * 24 * 60 * 60,
    secure: isHttps,
  })
  return c.json({ ok: true })
})

auth.post('/logout', (c) => {
  const isHttps = clientProto(c) === 'https'
  deleteCookie(c, 'meme_session', { path: '/', secure: isHttps, httpOnly: true, sameSite: 'Lax' })
  return c.json({ ok: true })
})

export default auth
