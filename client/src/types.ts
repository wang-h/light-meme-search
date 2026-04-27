export type MemeListItem = {
  id: number
  category: string
  filename: string
  tags: string[]
  url: string
  categoryDir?: string
}

export type SearchResponse = {
  query?: string
  mode?: string
  results?: MemeListItem[]
  total?: number
  fallback?: 'vector_unconfigured' | 'embedding_failed'
  warning?: string
  error?: string
  message?: string
}

export type AdminSettingsResponse = {
  database?: {
    arkApiKey?: boolean
  }
  vector?: {
    arkBaseUrl?: string
    embeddingModel?: string
  }
}
