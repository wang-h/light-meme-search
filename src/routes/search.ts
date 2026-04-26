import { Hono } from 'hono'
import { embedText } from '../services/embedding.js'
import { vectorSearch, textSearch } from '../services/meme-store.js'

const search = new Hono()

search.post('/', async (c) => {
  const body = await c.req.json<{ query: string; top_k?: number; mode?: 'vector' | 'text' }>()
  const { query, top_k = 3, mode = 'vector' } = body
  if (!query) return c.json({ error: 'query is required' }, 400)

  if (mode === 'text') {
    const results = await textSearch(query, top_k)
    return c.json({ query, mode: 'text', results })
  }

  const queryEmb = await embedText(query)
  const results = await vectorSearch(queryEmb, top_k)
  return c.json({ query, mode: 'vector', results })
})

export default search
