import type { ToolSchema } from '@coridis/llm'

/** One reusable, ordered piece of the assembled system prompt. */
export interface PromptSection {
  name: string
  order?: number
  text: string
}

export interface AssembleOptions {
  tools: readonly ToolSchema[]
  variables?: Record<string, string>
}

/** The `ctx.systemPrompt` seam: sections registered by plugins, assembled per request. */
export interface SystemPrompt {
  register(section: PromptSection): () => void
  assemble(options: AssembleOptions): Promise<string>
}
