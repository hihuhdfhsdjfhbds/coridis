export interface WebSearchRequest {
  query: string
  limit?: number
  signal: AbortSignal
}

export interface WebSearchItem {
  title: string
  url: string
  snippet?: string
}

export interface WebSearchResult {
  query: string
  items: readonly WebSearchItem[]
}

export interface WebFetchRequest {
  url: string
  signal: AbortSignal
}

export interface WebFetchResult {
  url: string
  title?: string
  content: string
  contentType?: string
}

/** A swappable search provider registered on `ctx.web`. */
export interface WebSearchProvider {
  readonly name: string
  search(request: WebSearchRequest): Promise<WebSearchResult>
}

/** A swappable fetch provider registered on `ctx.web`. */
export interface WebFetchProvider {
  readonly name: string
  fetch(request: WebFetchRequest): Promise<WebFetchResult>
}

/** The `ctx.web` seam: provider registry plus selection and dispatch. */
export interface Web {
  registerSearchProvider(provider: WebSearchProvider): () => void
  registerFetchProvider(provider: WebFetchProvider): () => void
  search(request: WebSearchRequest): Promise<WebSearchResult>
  fetch(request: WebFetchRequest): Promise<WebFetchResult>
}
