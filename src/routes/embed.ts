import { Hono } from 'hono'
import { PrismaClient } from '../generated/prisma/client.js'
import { loadEffectiveSettings, isVolcEmbeddingConfiguredAfterLoad } from '../lib/meme-settings.js'
import { embedImageUrl } from '../services/embedding.js'
import { countMemesWithEmbedding, updateEmbedding } from '../services/meme-store.js'

const embed = new Hono()

const BATCH_SIZE = 10

embed.post('/build', async (c) => {
  await loadEffectiveSettings()
  if (!isVolcEmbeddingConfiguredAfterLoad()) {
    return c.json(
      {
        error: 'embedding_not_configured',
        message: '未配置火山 Ark：请在 /api/admin/settings 或站点「设置」中保存 Ark API Key 后再构建向量',
      },
      400
    )
  }

  const prisma = new PrismaClient()
  try {
    const remainingCount = await prisma.$executeRawUnsafe(
      `SELECT count(*) FROM "memes" WHERE embedding IS NULL`
    )
    const toProcess = await prisma.$queryRawUnsafe<
      Array<{ id: number; url: string; category_dir: string; filename: string }>
    >(
      `SELECT id, url, category_dir, filename FROM "memes" WHERE embedding IS NULL ORDER BY id ASC LIMIT ${BATCH_SIZE}`
    )

    if (toProcess.length === 0) {
      const total = await countMemesWithEmbedding()
      return c.json({ status: 'already_complete', total, remaining: 0 })
    }

    let processed = 0
    let failed = 0
    const errors: Array<{ id: number; error: string }> = []

    const results = await Promise.allSettled(
      toProcess.map(async (m) => {
        // Embedding 用原始 GitHub URL（火山能快速访问），不走 MEME_IMAGE_BASE_URL
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
          id: toProcess[j].id,
          error: r.reason instanceof Error ? r.reason.message : String(r.reason),
        })
      }
    }

    const total = await countMemesWithEmbedding()
    const left = await prisma.$queryRawUnsafe<Array<{ cnt: bigint }>>(
      `SELECT count(*) AS cnt FROM "memes" WHERE embedding IS NULL`
    )
    const remaining = Number(left[0]?.cnt ?? 0)
    return c.json({
      status: remaining > 0 ? 'batch_done' : 'all_done',
      processed,
      failed,
      total,
      remaining,
      errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
    })
  } finally {
    await prisma.$disconnect()
  }
})

export default embed
