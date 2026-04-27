import type { Meme } from '../generated/prisma/client.js'

const TRAILING_SLASH = /\/$/
const GITHUB_BQB_PREFIX = 'https://raw.githubusercontent.com/zhaoolee/ChineseBQB/master/'

/**
 * 若设置 MEME_IMAGE_BASE_URL，对外不再返回库中 GitHub 直链：官方 raw 会换成 BASE + /master 后相对路径。
 */
export function publicMemeImageUrl(m: Pick<Meme, 'url' | 'categoryDir' | 'filename'>): string {
  const base = process.env.MEME_IMAGE_BASE_URL?.trim().replace(TRAILING_SLASH, '')
  if (!base) return m.url

  let rel: string
  if (m.url.startsWith(GITHUB_BQB_PREFIX)) {
    rel = m.url.slice(GITHUB_BQB_PREFIX.length)
  } else {
    rel = [m.categoryDir, m.filename].join('/')
  }

  const encoded = rel
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/')
  return `${base}/${encoded}`
}
