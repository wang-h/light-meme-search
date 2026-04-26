import { Hono } from 'hono'
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

  return c.json({ total, page, limit, items })
})

memes.get('/categories', async (c) => {
  const categories = await listCategories()
  return c.json({ categories })
})

memes.get('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const entry = await getMemeById(id)
  if (!entry) return c.json({ error: 'Not found' }, 404)
  return c.json(entry)
})

export default memes
