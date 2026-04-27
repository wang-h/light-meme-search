import { Hono } from 'hono'
import type { Context } from 'hono'
import { getCookie } from 'hono/cookie'
import { randomBytes } from 'node:crypto'
import { prisma } from '../lib/prisma.js'
import { verifySessionToken } from '../lib/session.js'
import {
  loadEffectiveSettings,
  invalidateSettingsCache,
  getSessionSecretAfterLoad,
  getApiKeyAfterLoad,
  isApiKeyRequiredAfterLoad,
  isSiteLoginEnabledAfterLoad,
  isVolcEmbeddingConfiguredAfterLoad,
  getVolcArkBaseUrlAfterLoad,
  getEmbeddingModelAfterLoad,
} from '../lib/meme-settings.js'

const admin = new Hono()

function dbFieldSet(v: string | null | undefined): boolean {
  return v != null && v.length > 0
}

/**
 * 公开元数据：不返回任何密钥，仅供前端显示「已保存」
 */
admin.get('/settings', async (c) => {
  const row = await prisma.memeAppSettings.findUnique({ where: { id: 1 } })
  await loadEffectiveSettings()
  return c.json({
    requireLogin: isSiteLoginEnabledAfterLoad(),
    requireApiKey: isApiKeyRequiredAfterLoad(),
    vectorEmbeddingAvailable: isVolcEmbeddingConfiguredAfterLoad(),
    database: {
      sitePassword: dbFieldSet(row?.sitePassword),
      apiKey: dbFieldSet(row?.apiKey),
      sessionSecret: dbFieldSet(row?.sessionSecret),
      arkApiKey: dbFieldSet(row?.arkApiKey),
      arkBaseUrl: dbFieldSet(row?.arkBaseUrl),
      embeddingModel: dbFieldSet(row?.embeddingModel),
    },
    /** 不返回 Ark API Key 明文，仅给表单展示「当前合并后的」BaseURL / 模型名 */
    vector: {
      arkBaseUrl: getVolcArkBaseUrlAfterLoad(),
      embeddingModel: getEmbeddingModelAfterLoad(),
    },
  })
})

type PutBody = {
  sitePassword?: string | null
  apiKey?: string | null
  sessionSecret?: string | null
  arkApiKey?: string | null
  arkBaseUrl?: string | null
  embeddingModel?: string | null
}

function normalizeOptionalString(v: unknown): string | null | undefined {
  if (v === undefined) return undefined
  if (v === null) return null
  if (typeof v !== 'string') return undefined
  const t = v.trim()
  return t.length > 0 ? t : null
}

function generateApiKey(): string {
  return `meme_${randomBytes(24).toString('base64url')}`
}

async function canEditSettings(c: Context): Promise<boolean> {
  await loadEffectiveSettings()
  const boot = process.env.MEME_BOOTSTRAP_TOKEN?.trim()
  const sentBoot = c.req.header('X-Admin-Token')?.trim()
  if (boot && sentBoot && sentBoot === boot) {
    return true
  }
  const secret = getSessionSecretAfterLoad()
  const tok = getCookie(c, 'meme_session')
  if (verifySessionToken(tok, secret)) {
    return true
  }
  const wantKey = getApiKeyAfterLoad()
  if (wantKey) {
    const sent =
      c.req.header('X-API-Key') || c.req.header('Authorization')?.replace(/^Bearer\s+/i, '').trim() || ''
    if (sent === wantKey) {
      return true
    }
  }
  if (!isSiteLoginEnabledAfterLoad() && !isApiKeyRequiredAfterLoad()) {
    return process.env.NODE_ENV !== 'production'
  }
  return false
}

/** 无需经过全局 API 中间件，在此单独鉴权 */
admin.put('/settings', async (c) => {
  if (!(await canEditSettings(c))) {
    return c.json(
      { error: 'unauthorized', message: '需要登录、正确 X-API-Key 或 X-Admin-Token（见 MEME_BOOTSTRAP_TOKEN）' },
      401
    )
  }
  const raw = (await c.req.json().catch(() => null)) as PutBody | null
  if (!raw || typeof raw !== 'object') {
    return c.json({ error: 'invalid_body' }, 400)
  }
  const sitePassword = normalizeOptionalString(raw.sitePassword)
  const apiKey = normalizeOptionalString(raw.apiKey)
  const sessionSecret = normalizeOptionalString(raw.sessionSecret)
  const arkApiKey = normalizeOptionalString(raw.arkApiKey)
  const arkBaseUrl = normalizeOptionalString(raw.arkBaseUrl)
  const embeddingModel = normalizeOptionalString(raw.embeddingModel)

  if (
    sitePassword === undefined &&
    apiKey === undefined &&
    sessionSecret === undefined &&
    arkApiKey === undefined &&
    arkBaseUrl === undefined &&
    embeddingModel === undefined
  ) {
    return c.json({ error: 'no_fields', message: '未提供要更新的字段' }, 400)
  }
  const update: {
    sitePassword?: string | null
    apiKey?: string | null
    sessionSecret?: string | null
    arkApiKey?: string | null
    arkBaseUrl?: string | null
    embeddingModel?: string | null
  } = {}
  if (sitePassword !== undefined) update.sitePassword = sitePassword
  if (apiKey !== undefined) update.apiKey = apiKey
  if (sessionSecret !== undefined) update.sessionSecret = sessionSecret
  if (arkApiKey !== undefined) update.arkApiKey = arkApiKey
  if (arkBaseUrl !== undefined) update.arkBaseUrl = arkBaseUrl
  if (embeddingModel !== undefined) update.embeddingModel = embeddingModel

  await prisma.memeAppSettings.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      sitePassword: sitePassword !== undefined ? sitePassword : null,
      apiKey: apiKey !== undefined ? apiKey : null,
      sessionSecret: sessionSecret !== undefined ? sessionSecret : null,
      arkApiKey: arkApiKey !== undefined ? arkApiKey : null,
      arkBaseUrl: arkBaseUrl !== undefined ? arkBaseUrl : null,
      embeddingModel: embeddingModel !== undefined ? embeddingModel : null,
    },
    update,
  })
  invalidateSettingsCache()
  await loadEffectiveSettings()
  return c.json({ ok: true })
})

admin.post('/settings/generate-api-key', async (c) => {
  if (!(await canEditSettings(c))) {
    return c.json(
      { error: 'unauthorized', message: '需要登录、正确 X-API-Key 或 X-Admin-Token（见 MEME_BOOTSTRAP_TOKEN）' },
      401
    )
  }

  const apiKey = generateApiKey()
  await prisma.memeAppSettings.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      apiKey,
      sitePassword: null,
      sessionSecret: null,
    },
    update: { apiKey },
  })
  invalidateSettingsCache()
  await loadEffectiveSettings()
  return c.json({ ok: true, apiKey })
})

export default admin
