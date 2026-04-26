import { Hono } from 'hono'
import { PrismaClient } from '../generated/prisma/client.js'
import { embedImageUrl } from '../services/embedding.js'
import { countMemesWithEmbedding, updateEmbedding } from '../services/meme-store.js'

const embed = new Hono()

const BATCH_SIZE = 5
const DELAY_MS = 200

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

embed.post('/build', async (c) => {
  const prisma = new PrismaClient()
  try {
    // Find memes without embeddings
    const toProcess = await prisma.$queryRawUnsafe<Array<{ id: number; url: string }>>(
      `SELECT id, url FROM "memes" WHERE embedding IS NULL ORDER BY id ASC`
    )

    if (toProcess.length === 0) {
      const total = await countMemesWithEmbedding()
      return c.json({ status: 'already_complete', total })
    }

    let processed = 0
    let failed = 0
    const errors: Array<{ id: number; error: string }> = []

    for (let i = 0; i < toProcess.length; i += BATCH_SIZE) {
      const batch = toProcess.slice(i, i + BATCH_SIZE)

      const results = await Promise.allSettled(
        batch.map(async (m) => {
          const emb = await embedImageUrl(m.url)
          return { id: m.id, embedding: emb }
        })
      )

      for (let j = 0; j < results.length; j++) {
        const r = results[j]
        if (r.status === 'fulfilled') {
          await updateEmbedding(r.value.id, r.value.embedding)
          processed++
        } else {
          failed++
          errors.push({
            id: batch[j].id,
            error: r.reason instanceof Error ? r.reason.message : String(r.reason),
          })
        }
      }

      if (i + BATCH_SIZE < toProcess.length) {
        await delay(DELAY_MS)
      }
    }

    const total = await countMemesWithEmbedding()
    return c.json({
      status: 'done',
      processed,
      failed,
      total,
      errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
    })
  } finally {
    await prisma.$disconnect()
  }
})

export default embed
