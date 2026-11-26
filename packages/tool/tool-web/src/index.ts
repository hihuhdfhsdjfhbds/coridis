/**
 * The model-facing `web_search` and `web_fetch` tools. This package is a pure
 * consumer of `ctx.web`; retrieval lives in the providers.
 */
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@coridis/tools'
import type { WebFetchResult, WebSearchResult } from '@coridis/web'

export interface Config {
  searchLimit?: number
}

export const name = 'tool-web'

export const inject = ['tools', 'web']

interface SearchArgs {
  query: string
  limit?: number
}

interface FetchArgs {
  url: string
}

export function apply(ctx: Context, config: Config = {}): void {
  ctx.effect(() => ctx.tools.register(defineTool<SearchArgs, WebSearchResult>({
    name: 'web_search',
    description: 'Search the web and return a list of results with titles, URLs, and snippets.',
    parameters: {
      query: { type: 'string', required: true, description: 'The search query.' },
      limit: { type: 'number', description: 'Maximum number of results to return.' },
    },
    async execute(args, exec) {
      return ctx.web.search({ query: args.query, limit: args.limit ?? config.searchLimit, signal: exec.signal })
    },
    render(_args, value) {
      if (value.items.length === 0) return [{ type: 'text', text: 'No results found.' }]
      const text = value.items
        .map((item, index) => `${index + 1}. ${item.title}\n   ${item.url}${item.snippet ? `\n   ${item.snippet}` : ''}`)
        .join('\n')
      return [{ type: 'text', text }]
    },
  })))

  ctx.effect(() => ctx.tools.register(defineTool<FetchArgs, WebFetchResult>({
    name: 'web_fetch',
    description: 'Fetch a URL and return its text content (HTML is converted to plain text).',
    parameters: {
      url: { type: 'string', required: true, description: 'The URL to fetch.' },
    },
    async execute(args, exec) {
      return ctx.web.fetch({ url: args.url, signal: exec.signal })
    },
    render(_args, value) {
      const heading = value.title ? `# ${value.title}\n\n` : ''
      return [{ type: 'text', text: `${heading}${value.content}` }]
    },
  })))
}
