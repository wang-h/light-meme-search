import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PrismaClient } from '../src/generated/prisma/client.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

interface GitHubEntry {
  name: string
  category: string
  url: string
}

interface ChineseBqbData {
  status: number
  info: string
  data: GitHubEntry[]
}

function extractCategoryLabel(dirName: string): string {
  let label = dirName
    .replace(/^\d+[A-Za-z]*_/, '')
    .replace(/BQB$/i, '')
    .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '')
    .replace(/[_\s]+/g, ' ')
    .trim()
  if (label) return label
  const chinese = dirName.match(/[\u4e00-\u9fff]+/g)
  return chinese ? chinese.join('') : dirName
}

function extractTags(filename: string, categoryLabel: string): string[] {
  const tags: string[] = []
  if (categoryLabel) tags.push(categoryLabel)
  const dashMatch = filename.match(/[-–—]([^-–—]+?)(?:\.\w+)?$/)
  if (dashMatch) {
    const label = dashMatch[1].replace(/\.\w+$/, '').trim()
    if (label) tags.push(label)
  }
  return tags
}

async function main() {
  const bqbPath = process.argv[2] || resolve(__dirname, '../../ChineseBQB')
  const jsonPath = resolve(bqbPath, 'chinesebqb_github.json')

  if (!existsSync(jsonPath)) {
    console.error(`Error: ${jsonPath} not found. Pass ChineseBQB directory as argument.`)
    process.exit(1)
  }

  console.log('Reading chinesebqb_github.json...')
  const raw = JSON.parse(readFileSync(jsonPath, 'utf-8')) as ChineseBqbData
  const entries = raw.data
  console.log(`Found ${entries.length} entries`)

  const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp']
  const memes = entries
    .filter((e) => imageExts.some((ext) => e.name.toLowerCase().endsWith(ext)))
    .map((e) => {
      const categoryLabel = extractCategoryLabel(e.category)
      const tags = extractTags(e.name, categoryLabel)
      return {
        category: categoryLabel,
        categoryDir: e.category,
        filename: e.name,
        tags,
        url: e.url,
      }
    })

  // Deduplicate by url
  const seen = new Set<string>()
  const unique = memes.filter((m) => {
    if (seen.has(m.url)) return false
    seen.add(m.url)
    return true
  })

  console.log(`\nInserting ${unique.length} unique images into PostgreSQL...`)

  const prisma = new PrismaClient()

  try {
    // Batch insert
    const BATCH_SIZE = 100
    let inserted = 0

    for (let i = 0; i < unique.length; i += BATCH_SIZE) {
      const batch = unique.slice(i, i + BATCH_SIZE)
      await prisma.meme.createMany({ data: batch, skipDuplicates: true })
      inserted += batch.length
      if (inserted % 500 === 0 || inserted === unique.length) {
        console.log(`  Progress: ${inserted}/${unique.length}`)
      }
    }

    // Print stats
    const total = await prisma.meme.count()
    const cats = await prisma.meme.groupBy({
      by: ['category'],
      _count: { category: true },
      orderBy: { _count: { category: 'desc' } },
      take: 10,
    })

    console.log(`\nDone! Total ${total} images in DB.`)
    console.log(`\nTop 10 categories:`)
    cats.forEach((c) => console.log(`  ${c.category}: ${c._count.category}`))
  } finally {
    await prisma.$disconnect()
  }
}

main()
