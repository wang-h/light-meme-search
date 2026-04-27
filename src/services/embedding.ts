import type { EmbeddingResponse } from '../types.js'
import {
  loadEffectiveSettings,
  getVolcArkApiKeyAfterLoad,
  getVolcArkBaseUrlAfterLoad,
  getEmbeddingModelAfterLoad,
} from '../lib/meme-settings.js'

export async function embedText(text: string): Promise<number[]> {
  const res = await callEmbeddingApi([{ type: 'text', text }])
  return res.data[0].embedding
}

export async function embedImageUrl(imageUrl: string): Promise<number[]> {
  // 火山服务器无法快速下载外网 URL，改为本地下载后传 base64
  const resp = await fetch(imageUrl)
  if (!resp.ok) throw new Error(`下载图片失败: HTTP ${resp.status} ${imageUrl}`)
  const contentType = resp.headers.get('content-type') || 'image/jpeg'
  const buf = Buffer.from(await resp.arrayBuffer())
  const b64 = buf.toString('base64')
  const dataUrl = `data:${contentType};base64,${b64}`
  const res = await callEmbeddingApi([
    { type: 'image_url', image_url: { url: dataUrl } },
  ])
  return res.data[0].embedding
}

function parseEmbeddingJson(body: unknown, modelLabel: string): EmbeddingResponse {
  if (body === null || typeof body !== 'object') {
    throw new Error(`Embedding API: invalid JSON body (${typeof body})`)
  }

  const o = body as Record<string, unknown>

  if ('error' in o && o.error != null) {
    const err = o.error as Record<string, unknown>
    const code = typeof err.code === 'string' ? err.code : ''
    const msg = typeof err.message === 'string' ? err.message : JSON.stringify(o.error)
    throw new Error(`Embedding API: ${[code, msg].filter(Boolean).join(' — ')}`.trim())
  }

  // OpenAI 兼容：data: [{ embedding: number[] }]
  // 火山方舟多模态常见：data: { embedding: number[] }
  const dataRaw = o.data
  let embedding: number[] | undefined

  if (Array.isArray(dataRaw) && dataRaw.length > 0) {
    const first = dataRaw[0] as Record<string, unknown>
    const emb = first?.embedding
    if (Array.isArray(emb) && emb.length > 0 && typeof emb[0] === 'number') {
      embedding = emb as number[]
    }
  } else if (dataRaw !== null && typeof dataRaw === 'object' && !Array.isArray(dataRaw)) {
    const d = dataRaw as Record<string, unknown>
    const emb = d.embedding
    if (Array.isArray(emb) && emb.length > 0 && typeof emb[0] === 'number') {
      embedding = emb as number[]
    }
  }

  if (!embedding) {
    const preview = JSON.stringify(body).slice(0, 480)
    throw new Error(
      `Embedding API: 无法解析 embedding（需 data[] 或 data.embedding）。model=${modelLabel} 片段: ${preview}`
    )
  }

  const modelName = typeof o.model === 'string' ? o.model : modelLabel
  const usageRaw = o.usage
  const usageObj =
    usageRaw !== null && typeof usageRaw === 'object'
      ? (usageRaw as { prompt_tokens?: number; total_tokens?: number })
      : {}

  return {
    object: typeof o.object === 'string' ? o.object : 'list',
    data: [{ object: 'embedding', index: 0, embedding }],
    model: modelName,
    usage: {
      prompt_tokens: usageObj.prompt_tokens ?? 0,
      total_tokens: usageObj.total_tokens ?? 0,
    },
  }
}

async function callEmbeddingApi(
  input: Array<Record<string, unknown>>,
  retries = 2
): Promise<EmbeddingResponse> {
  await loadEffectiveSettings()
  const apiKey = getVolcArkApiKeyAfterLoad()
  if (!apiKey) {
    throw new Error('未配置火山 Ark：请在管理设置中保存 Ark API Key，或设置环境变量 VOLCENGINE_ARK_API_KEY')
  }
  const baseUrl = getVolcArkBaseUrlAfterLoad()
  const model = getEmbeddingModelAfterLoad()

  const url = `${baseUrl.replace(/\/$/, '')}/embeddings/multimodal`
  let lastError: Error | undefined
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ model, input }),
      })

      const rawText = await res.text()
      let json: unknown
      try {
        json = rawText ? JSON.parse(rawText) : null
      } catch {
        throw new Error(`Embedding API HTTP ${res.status}: 非 JSON 响应: ${rawText.slice(0, 400)}`)
      }

      if (!res.ok) {
        const msg =
          json && typeof json === 'object' && 'error' in (json as object)
            ? JSON.stringify((json as { error: unknown }).error)
            : rawText.slice(0, 500)
        throw new Error(`Embedding API HTTP ${res.status}: ${msg}`)
      }

      return parseEmbeddingJson(json, model)
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e))
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)))
      }
    }
  }
  throw lastError
}
