/** Roles carried in model history. */
export type MessageRole = 'system' | 'user' | 'assistant' | 'tool'

export interface TextBlock {
  type: 'text'
  text: string
}

export interface ToolCallBlock {
  type: 'tool-call'
  callId: string
  name: string
  arguments: unknown
}

export interface ToolResultBlock {
  type: 'tool-result'
  callId: string
  content: string
  isError?: boolean
}

export type ContentBlock = TextBlock | ToolCallBlock | ToolResultBlock

export interface Message {
  role: MessageRole
  content: ContentBlock[]
}

/** The model-facing projection of a registered tool. */
export interface ToolSchema {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export interface GenerateRequest {
  model: string
  messages: Message[]
  tools?: ToolSchema[]
  signal?: AbortSignal
}

export type StreamEvent =
  | { type: 'text-delta'; text: string }
  | { type: 'tool-call'; callId: string; name: string; arguments: unknown }
  | { type: 'usage'; inputTokens: number; outputTokens: number }
  | { type: 'done'; stopReason: 'stop' | 'tool-calls' | 'length' | 'error' }

/** A model provider adapter registered on `ctx.llm`. */
export interface LlmAdapter {
  readonly name: string
  readonly models?: readonly string[]
  stream(request: GenerateRequest): AsyncIterable<StreamEvent>
}

/** The `ctx.llm` seam: adapter registration and model selection. */
export interface Llm {
  register(adapter: LlmAdapter): () => void
  resolve(model: string): LlmAdapter
  models(): readonly string[]
}
