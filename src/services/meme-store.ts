import { prisma } from '../lib/prisma.js'
import type { Meme } from '../generated/prisma/client.js'

export type MemeWithEmbedding = Meme & { embedding?: number[] | null }

export async function countMemes(category?: string): Promise<number> {
  return prisma.meme.count(category ? { where: { category } } : undefined)
}

export async function listMemes(
  page: number,
  limit: number,
  category?: string
): Promise<Meme[]> {
  return prisma.meme.findMany({
    where: category ? { category } : undefined,
    skip: (page - 1) * limit,
    take: limit,
    orderBy: { id: 'asc' },
  })
}

export async function getMemeById(id: number): Promise<Meme | null> {
  return prisma.meme.findUnique({ where: { id } })
}

export async function listCategories(): Promise<Array<{ category: string; count: number }>> {
  const result = await prisma.meme.groupBy({
    by: ['category'],
    _count: { category: true },
    orderBy: { _count: { category: 'desc' } },
  })
  return result.map((r) => ({ category: r.category, count: r._count.category }))
}

export async function updateEmbedding(id: number, embedding: number[]): Promise<void> {
  const vecStr = `[${embedding.join(',')}]`
  await prisma.$executeRawUnsafe(
    `UPDATE "memes" SET embedding = $1::vector WHERE id = $2`,
    vecStr,
    id
  )
}

export async function countMemesWithEmbedding(): Promise<number> {
  const result = await prisma.$queryRawUnsafe<Array<{ count: number }>>(
    `SELECT count(*)::int as count FROM "memes" WHERE embedding IS NOT NULL`
  )
  return result[0].count
}

export async function vectorSearch(
  queryEmbedding: number[],
  topK: number
): Promise<Array<{ id: number; score: number; category: string; tags: string[]; url: string; filename: string }>> {
  const vecStr = `[${queryEmbedding.join(',')}]`
  return prisma.$queryRawUnsafe(
    `SELECT id, 1 - (embedding <=> $1::vector) as score, category, tags, url, filename
     FROM "memes"
     WHERE embedding IS NOT NULL
     ORDER BY embedding <=> $1::vector
     LIMIT $2`,
    vecStr,
    topK
  )
}

export async function textSearch(
  query: string,
  limit: number
): Promise<Array<{ id: number; category: string; tags: string[]; url: string; filename: string }>> {
  return prisma.$queryRawUnsafe(
    `SELECT id, category, tags, url, filename
     FROM "memes"
     WHERE tags &@ $1
     LIMIT $2`,
    query,
    limit
  )
}
