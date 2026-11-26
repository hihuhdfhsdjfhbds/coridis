/**
 * The system-prompt capability seam. Plugins register ordered prompt sections
 * here and tool schemas are appended during assembly; the agent loop calls
 * `assemble()` once per step.
 */
import { Context, Service } from '@deepseek-ai/cordis'
import type { AssembleOptions, PromptSection, SystemPrompt } from './types.ts'

export type * from './types.ts'

export interface Config {
  persona?: string
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    systemPrompt: SystemPrompt
  }
}

export class SystemPromptService extends Service {
  private readonly sections: PromptSection[] = []

  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'systemPrompt')
    this.sections.push({ name: 'persona', order: 0, text: config.persona ?? 'You are a helpful assistant.' })
  }

  register(section: PromptSection): () => void {
    this.sections.push(section)
    return () => {
      const index = this.sections.indexOf(section)
      if (index >= 0) this.sections.splice(index, 1)
    }
  }

  async assemble(options: AssembleOptions): Promise<string> {
    const parts = [...this.sections]
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map(section => section.text)
      .filter(Boolean)
    if (options.tools.length > 0) {
      parts.push('You may call the following tools:\n' + options.tools.map(tool => `- ${tool.name}: ${tool.description}`).join('\n'))
    }
    return parts.join('\n\n')
  }
}

export default SystemPromptService
