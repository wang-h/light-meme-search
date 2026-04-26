import { Hono } from 'hono'
import { serveStatic } from '@hono/node-server/serve-static'
import { serve } from '@hono/node-server'
import search from './routes/search.js'
import memes from './routes/memes.js'
import embed from './routes/embed.js'

const app = new Hono()

app.route('/api/search', search)
app.route('/api/memes', memes)
app.route('/api/embed', embed)

app.get('/*', serveStatic({ root: './public' }))

const port = Number(process.env.PORT || 3000)
console.log(`light-meme-search listening on :${port}`)
serve({ fetch: app.fetch, port })
