import type { EmbeddingResponse } from '../types.js'

const BASE_URL = process.env.VOLCENGINE_ARK_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3'
const MODEL = process.env.MEME_EMBEDDING_MODEL || 'doubao-embedding-vision-251215'

export async function embedText(text: string): Promise<number[]> {
  const res = await callEmbeddingApi([{ type: 'text', text }])
  return res.data[0].embedding
}

export async function embedImageUrl(imageUrl: string): Promise<number[]> {
  const res = await callEmbeddingApi([
    { type: 'image_url', image_url: { url: imageUrl } },
  ])
  return res.data[0].embedding
}

async function callEmbeddingApi(
  input: Array<Record<string, unknown>>
): Promise<EmbeddingResponse> {
  const apiKey = process.env.VOLCENGINE_ARK_API_KEY
  if (!apiKey) throw new Error('VOLCENGINE_ARK_API_KEY is not set')

  const url = `${BASE_URL}/embeddings/multimodal`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model: MODEL, input }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Embedding API error ${res.status}: ${body}`)
  }

  return (await res.json()) as EmbeddingResponse
}
