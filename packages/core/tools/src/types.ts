import type { ContentBlock, ToolSchema } from '@coridis/llm'

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue }

export interface ToolParameter {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array'
  description?: string
  required?: boolean
}

export type ParameterSpec = Record<string, ToolParameter>

export interface ToolCall {
  callId: string
  name: string
  arguments: unknown
}

export interface ToolResult {
  callId: string
  name: string
  value: JsonValue
  content: string
  isError: boolean
}

export interface ToolExecutionContext {
  readonly callId: string
  readonly signal: AbortSignal
  readonly agent?: unknown
}

/**
 * A model-facing tool. `execute` runs the resolved `args` and returns one
 * canonical JSON value; `render` turns that value into model-facing content.
 */
export interface ToolDefinition {
  readonly name: string
  readonly description: string
  readonly parameters: ParameterSpec
  execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<JsonValue>
  render?(args: Record<string, unknown>, value: JsonValue): readonly ContentBlock[]
  schema(): ToolSchema
}

/** The `ctx.tools` seam: scoped registration and the guarded execution pipeline. */
export interface ToolRegistry {
  register(definition: ToolDefinition): () => void
  list(): readonly ToolDefinition[]
  execute(call: ToolCall, context: ToolExecutionContext): Promise<ToolResult>
}
