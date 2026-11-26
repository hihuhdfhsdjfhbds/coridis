/**
 * The LLM capability seam. Owns the adapter registry behind `ctx.llm`; model
 * providers register here and the agent loop resolves an adapter by model.
 */
import { Context, Service } from '@deepseek-ai/cordis'
import type { Llm, LlmAdapter } from './types.ts'

export type * from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    llm: Llm
  }
}

export class LlmService extends Service {
  private readonly adapters = new Map<string, LlmAdapter>()

  constructor(ctx: Context) {
    super(ctx, 'llm')
  }

  register(adapter: LlmAdapter): () => void {
    const previous = this.adapters.get(adapter.name)
    this.adapters.set(adapter.name, adapter)
    return () => {
      if (this.adapters.get(adapter.name) === adapter) {
        if (previous) this.adapters.set(adapter.name, previous)
        else this.adapters.delete(adapter.name)
      }
    }
  }

  resolve(model: string): LlmAdapter {
    const adapters = [...this.adapters.values()]
    const match = adapters.find(adapter => adapter.models?.includes(model)) ?? adapters[0]
    if (!match) throw new Error('no LLM adapter registered on ctx.llm')
    return match
  }

  models(): readonly string[] {
    return [...new Set([...this.adapters.values()].flatMap(adapter => adapter.models ?? []))]
  }
}

export default LlmService
