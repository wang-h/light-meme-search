import { prisma } from './prisma.js'

const CACHE_TTL_MS = 10_000

const DEFAULT_ARK_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3'
const DEFAULT_EMBEDDING_MODEL = 'doubao-embedding-vision-251215'

type Cache = {
  sitePassword: string
  apiKey: string
  sessionSecret: string
  arkApiKey: string
  arkBaseUrl: string
  embeddingModel: string
  at: number
}

let cache: Cache | null = null

function envSitePassword() {
  return process.env.MEME_SITE_PASSWORD?.trim() || ''
}

function envApiKey() {
  return process.env.MEME_API_KEY?.trim() || ''
}

function envSessionSecret() {
  return (
    process.env.MEME_SESSION_SECRET?.trim() || process.env.MEME_SITE_PASSWORD?.trim() || 'dev-meme-session-change-me'
  )
}

function envArkApiKey() {
  return process.env.VOLCENGINE_ARK_API_KEY?.trim() || ''
}

function envArkBaseUrl() {
  const t = process.env.VOLCENGINE_ARK_BASE_URL?.trim()
  return t || DEFAULT_ARK_BASE_URL
}

function envEmbeddingModel() {
  const t = process.env.MEME_EMBEDDING_MODEL?.trim()
  return t || DEFAULT_EMBEDDING_MODEL
}

function merge(
  row: {
    sitePassword: string | null
    apiKey: string | null
    sessionSecret: string | null
    arkApiKey: string | null
    arkBaseUrl: string | null
    embeddingModel: string | null
  } | null
) {
  const sp =
    row?.sitePassword != null && row.sitePassword.length > 0
      ? row.sitePassword.trim()
      : envSitePassword()
  const ak = row?.apiKey != null && row.apiKey.length > 0 ? row.apiKey.trim() : envApiKey()
  const ss =
    row?.sessionSecret != null && row.sessionSecret.length > 0
      ? row.sessionSecret.trim()
      : envSessionSecret()
  const arkKey = row?.arkApiKey != null && row.arkApiKey.length > 0 ? row.arkApiKey.trim() : envArkApiKey()
  const arkUrl =
    row?.arkBaseUrl != null && row.arkBaseUrl.length > 0 ? row.arkBaseUrl.trim() : envArkBaseUrl()
  const embModel =
    row?.embeddingModel != null && row.embeddingModel.length > 0
      ? row.embeddingModel.trim()
      : envEmbeddingModel()
  return { sitePassword: sp, apiKey: ak, sessionSecret: ss, arkApiKey: arkKey, arkBaseUrl: arkUrl, embeddingModel: embModel }
}

export async function loadEffectiveSettings(): Promise<void> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return
  const row = await prisma.memeAppSettings.findUnique({ where: { id: 1 } })
  const m = merge(row)
  cache = { ...m, at: Date.now() }
}

export function invalidateSettingsCache() {
  cache = null
}

function requireCache(): Cache {
  if (!cache) {
    throw new Error('loadEffectiveSettings must be awaited before use')
  }
  return cache
}

export function getSessionSecretAfterLoad(): string {
  return requireCache().sessionSecret
}

export function getApiKeyAfterLoad(): string {
  return requireCache().apiKey
}

export function getSitePasswordAfterLoad(): string {
  return requireCache().sitePassword
}

export function isSiteLoginEnabledAfterLoad(): boolean {
  return Boolean(getSitePasswordAfterLoad())
}

export function isApiKeyRequiredAfterLoad(): boolean {
  return Boolean(getApiKeyAfterLoad())
}

export function getVolcArkApiKeyAfterLoad(): string {
  return requireCache().arkApiKey
}

export function getVolcArkBaseUrlAfterLoad(): string {
  return requireCache().arkBaseUrl
}

export function getEmbeddingModelAfterLoad(): string {
  return requireCache().embeddingModel
}

/** 是否已配置火山 Ark（用于向量检索 / 建向量） */
export function isVolcEmbeddingConfiguredAfterLoad(): boolean {
  return Boolean(getVolcArkApiKeyAfterLoad())
}
