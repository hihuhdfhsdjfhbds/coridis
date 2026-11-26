/**
 * HTTP fetch provider for the `ctx.web` seam.
 */
import type { Context } from '@deepseek-ai/cordis'
import type { WebFetchProvider } from '@coridis/web'

export interface Config {
  timeoutMs?: number
  maxBytes?: number
  userAgent?: string
}

export const name = 'web-fetch-http'

export const inject = ['web']

const DEFAULT_MAX_BYTES = 1_000_000

export function apply(ctx: Context, config: Config = {}): void {
  const provider: WebFetchProvider = {
    name: 'http',
    async fetch(request) {
      const timeoutMs = config.timeoutMs ?? 15_000
      const maxBytes = config.maxBytes ?? DEFAULT_MAX_BYTES
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(new Error('fetch timed out')), timeoutMs)
      const onAbort = () => controller.abort(request.signal?.reason)
      request.signal?.addEventListener('abort', onAbort, { once: true })
      try {
        const response = await fetch(request.url, {
          signal: controller.signal,
          headers: {
            'user-agent': config.userAgent ?? 'coridis/0.0.0',
            accept: 'text/html,text/plain;q=0.9,*/*;q=0.5',
          },
        })
        if (!response.ok) throw new Error(`fetch failed (${response.status} ${response.statusText})`)
        const contentType = response.headers.get('content-type') ?? undefined
        const text = await response.text()
        let content = (contentType ?? '').includes('text/html') ? htmlToText(text) : text
        if (content.length > maxBytes) content = `${content.slice(0, maxBytes)}\n…[truncated]`
        return { url: request.url, content, contentType }
      } finally {
        clearTimeout(timer)
        request.signal?.removeEventListener('abort', onAbort)
      }
    },
  }
  ctx.effect(() => ctx.web.registerFetchProvider(provider))
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
}
