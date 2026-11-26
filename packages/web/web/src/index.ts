/**
 * The web capability seam. Providers register here and consumers (tools) call
 * `search`/`fetch`; swapping a provider changes every consumer without forking
 * the tools.
 */
import { Context, Service } from '@deepseek-ai/cordis'
import type {
  Web,
  WebFetchProvider,
  WebFetchRequest,
  WebFetchResult,
  WebSearchProvider,
  WebSearchRequest,
  WebSearchResult,
} from './types.ts'

export type * from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    web: Web
  }
}

export class WebService extends Service {
  private readonly searchProviders = new Map<string, WebSearchProvider>()
  private readonly fetchProviders = new Map<string, WebFetchProvider>()

  constructor(ctx: Context) {
    super(ctx, 'web')
  }

  registerSearchProvider(provider: WebSearchProvider): () => void {
    const previous = this.searchProviders.get(provider.name)
    this.searchProviders.set(provider.name, provider)
    return () => {
      if (this.searchProviders.get(provider.name) === provider) {
        if (previous) this.searchProviders.set(provider.name, previous)
        else this.searchProviders.delete(provider.name)
      }
    }
  }

  registerFetchProvider(provider: WebFetchProvider): () => void {
    const previous = this.fetchProviders.get(provider.name)
    this.fetchProviders.set(provider.name, provider)
    return () => {
      if (this.fetchProviders.get(provider.name) === provider) {
        if (previous) this.fetchProviders.set(provider.name, previous)
        else this.fetchProviders.delete(provider.name)
      }
    }
  }

  async search(request: WebSearchRequest): Promise<WebSearchResult> {
    return this.pick(this.searchProviders, 'search').search(request)
  }

  async fetch(request: WebFetchRequest): Promise<WebFetchResult> {
    return this.pick(this.fetchProviders, 'fetch').fetch(request)
  }

  private pick<T>(providers: Map<string, T>, kind: string): T {
    const value = providers.values().next().value
    if (!value) throw new Error(`no web ${kind} provider registered on ctx.web`)
    return value
  }
}

export default WebService
