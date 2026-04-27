import { Hono } from 'hono'
import { publicMemeImageUrl } from '../lib/meme-image-url.js'
import { loadEffectiveSettings, isVolcEmbeddingConfiguredAfterLoad } from '../lib/meme-settings.js'
import { embedText } from '../services/embedding.js'
import { vectorSearch, textSearch } from '../services/meme-store.js'

const search = new Hono()

search.post('/', async (c) => {
  const body = await c.req.json<{ query: string; top_k?: number; mode?: 'vector' | 'text' }>()
  const { query, top_k = 3, mode = 'vector' } = body
  if (!query) return c.json({ error: 'query is required' }, 400)

  await loadEffectiveSettings()
  const hasEmb = isVolcEmbeddingConfiguredAfterLoad()

  if (mode === 'text' || (mode === 'vector' && !hasEmb)) {
    const raw = await textSearch(query, top_k)
    const results = raw.map((r) => {
      const { category_dir, ...rest } = r
      return {
        ...rest,
        url: publicMemeImageUrl({ url: r.url, categoryDir: category_dir, filename: r.filename }),
      }
    })
    return c.json({
      query,
      mode: 'text',
      results,
      fallback: mode === 'vector' && !hasEmb ? 'vector_unconfigured' : undefined,
    })
  }

  try {
    const queryEmb = await embedText(query)
    const raw = await vectorSearch(queryEmb, top_k)
    const results = raw.map((r) => {
      const { category_dir, ...rest } = r
      return {
        ...rest,
        url: publicMemeImageUrl({ url: r.url, categoryDir: category_dir, filename: r.filename }),
      }
    })
    return c.json({ query, mode: 'vector', results })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    const raw = await textSearch(query, top_k)
    const results = raw.map((r) => {
      const { category_dir, ...rest } = r
      return {
        ...rest,
        url: publicMemeImageUrl({ url: r.url, categoryDir: category_dir, filename: r.filename }),
      }
    })
    return c.json({
      query,
      mode: 'text',
      results,
      fallback: 'embedding_failed',
      warning: message,
    })
  }
})

export default search
