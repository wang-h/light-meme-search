import { Hono } from 'hono'
import { publicMemeImageUrl } from '../lib/meme-image-url.js'
import { listMemes, getMemeById, listCategories, countMemes } from '../services/meme-store.js'

const memes = new Hono()

memes.get('/', async (c) => {
  const category = c.req.query('category')
  const page = Number(c.req.query('page') || '1')
  const limit = Number(c.req.query('limit') || '20')

  const [total, items] = await Promise.all([
    countMemes(category),
    listMemes(page, limit, category),
  ])

  const withPublicUrl = items.map((m) => ({ ...m, url: publicMemeImageUrl(m) }))
  return c.json({ total, page, limit, items: withPublicUrl })
})

memes.get('/categories', async (c) => {
  const categories = await listCategories()
  return c.json({ categories })
})

memes.get('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const entry = await getMemeById(id)
  if (!entry) return c.json({ error: 'Not found' }, 404)
  return c.json({ ...entry, url: publicMemeImageUrl(entry) })
})

export default memes
