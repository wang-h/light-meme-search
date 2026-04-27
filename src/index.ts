import { Hono } from 'hono'
import { getCookie } from 'hono/cookie'
import { serveStatic } from '@hono/node-server/serve-static'
import { serve } from '@hono/node-server'
import { verifySessionToken } from './lib/session.js'
import { loadEffectiveSettings, getSessionSecretAfterLoad, getApiKeyAfterLoad, getSitePasswordAfterLoad } from './lib/meme-settings.js'
import auth from './routes/auth.js'
import search from './routes/search.js'
import memes from './routes/memes.js'
import embed from './routes/embed.js'
import admin from './routes/admin-settings.js'

const app = new Hono()

function isAuthApiPath(p: string): boolean {
  return p === '/api/auth' || p.startsWith('/api/auth/')
}

function isAdminApiPath(p: string): boolean {
  return p === '/api/admin' || p.startsWith('/api/admin/')
}

app.use('*', async (c, next) => {
  const p = c.req.path
  if (isAuthApiPath(p) || isAdminApiPath(p)) {
    return next()
  }
  if (p.startsWith('/api/')) {
    await loadEffectiveSettings()
    const sessionSecret = getSessionSecretAfterLoad()
    const apiKey = getApiKeyAfterLoad()
    if (apiKey) {
      const sent =
        c.req.header('X-API-Key') ||
        (c.req.header('Authorization')?.replace(/^Bearer\s+/i, '').trim() ?? '')
      if (sent !== apiKey) {
        return c.json({ error: 'unauthorized', message: '缺少或错误的 X-API-Key' }, 401)
      }
      // 与浏览器会话无关：带正确 Key 的 /api 调用应放行，避免「站点密码 + API Key」时仍要求 Cookie。
      return next()
    }
    const sitePw = getSitePasswordAfterLoad()
    if (sitePw) {
      const tok = getCookie(c, 'meme_session')
      if (!verifySessionToken(tok, sessionSecret)) {
        return c.json({ error: 'unauthorized', message: '需要登录' }, 401)
      }
    }
    return next()
  }
  await loadEffectiveSettings()
  const sessionSecret = getSessionSecretAfterLoad()
  const sitePw = getSitePasswordAfterLoad()
  if (sitePw) {
    if (p === '/login.html' || p === '/login') {
      return next()
    }
    const tok = getCookie(c, 'meme_session')
    if (!verifySessionToken(tok, sessionSecret)) {
      if (c.req.method === 'GET' || c.req.method === 'HEAD') {
        return c.redirect('/login.html')
      }
      return c.text('Unauthorized', 401)
    }
  }
  return next()
})

app.route('/api/auth', auth)
app.route('/api/admin', admin)
app.route('/api/search', search)
app.route('/api/memes', memes)
app.route('/api/embed', embed)

app.get('/*', serveStatic({ root: './public' }))

const port = Number(process.env.PORT || 3000)
console.log(`light-meme-search listening on :${port}`)
serve({ fetch: app.fetch, port })
