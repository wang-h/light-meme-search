export interface MemeEntry {
  id: number
  category: string
  categoryDir: string
  filename: string
  tags: string[]
  url: string
}

export interface SearchResult {
  id: number
  score: number
  url: string
  category: string
  tags: string[]
}

export interface EmbeddingResponse {
  object: string
  data: Array<{
    object: string
    index: number
    embedding: number[]
  }>
  model: string
  usage: { prompt_tokens: number; total_tokens: number }
}
