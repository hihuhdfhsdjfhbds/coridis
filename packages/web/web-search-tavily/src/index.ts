/**
 * Tavily search provider for the `ctx.web` seam.
 */
import type { Context } from '@deepseek-ai/cordis'
import type { WebSearchProvider } from '@coridis/web'

export interface Config {
  apiKeyEnv?: string
  endpoint?: string
  maxResults?: number
}

export const name = 'web-search-tavily'

export const inject = ['web']

export function apply(ctx: Context, config: Config = {}): void {
  const provider: WebSearchProvider = {
    name: 'tavily',
    async search(request) {
      const apiKeyEnv = config.apiKeyEnv ?? 'TAVILY_API_KEY'
      const apiKey = process.env[apiKeyEnv]
      if (!apiKey) throw new Error(`Tavily API key is missing (env ${apiKeyEnv})`)

      const endpoint = config.endpoint ?? 'https://api.tavily.com/search'
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          api_key: apiKey,
          query: request.query,
          max_results: request.limit ?? config.maxResults ?? 5,
          include_answer: false,
        }),
        signal: request.signal,
      })
      if (!response.ok) throw new Error(`Tavily request failed (${response.status})`)
      const data = (await response.json()) as { results?: { title: string; url: string; content?: string }[] }
      return {
        query: request.query,
        items: (data.results ?? []).map(item => ({ title: item.title, url: item.url, snippet: item.content })),
      }
    },
  }
  ctx.effect(() => ctx.web.registerSearchProvider(provider))
}
