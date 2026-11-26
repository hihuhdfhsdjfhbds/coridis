/**
 * The tools capability seam. Owns the scoped tool registry and a guarded
 * execution pipeline; every model-facing tool registers here and its schema
 * joins prompt assembly.
 */
import { Context, Service } from '@deepseek-ai/cordis'
import type { ContentBlock, ToolSchema } from '@coridis/llm'
import type {
  JsonValue,
  ParameterSpec,
  ToolCall,
  ToolDefinition,
  ToolExecutionContext,
  ToolRegistry,
  ToolResult,
} from './types.ts'

export type * from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    tools: ToolRegistry
  }
}

/** Render a canonical JSON value as model-facing text. */
export function formatValue(value: unknown): string {
  if (typeof value === 'string') return value
  return JSON.stringify(value, null, 2)
}

export interface DefineToolOptions<A, V> {
  name: string
  description: string
  parameters: ParameterSpec
  execute(args: A, context: ToolExecutionContext): Promise<V>
  render?(args: A, value: V): readonly ContentBlock[]
}

/**
 * Build a {@link ToolDefinition} from a schema + execute pair. `args` is typed
 * from `A`; the registry validates the raw model arguments against
 * `parameters` before `execute` runs.
 */
export function defineTool<A extends Record<string, unknown>, V>(options: DefineToolOptions<A, V>): ToolDefinition {
  return {
    name: options.name,
    description: options.description,
    parameters: options.parameters,
    schema(): ToolSchema {
      return { name: options.name, description: options.description, parameters: options.parameters as Record<string, unknown> }
    },
    async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<JsonValue> {
      return (await options.execute(args as A, context)) as unknown as JsonValue
    },
    render(args: Record<string, unknown>, value: JsonValue): readonly ContentBlock[] {
      if (options.render) return options.render(args as A, value as V)
      return [{ type: 'text', text: formatValue(value) }]
    },
  }
}

export class ToolsService extends Service {
  private readonly definitions = new Map<string, ToolDefinition>()

  constructor(ctx: Context) {
    super(ctx, 'tools')
  }

  register(definition: ToolDefinition): () => void {
    if (this.definitions.has(definition.name)) {
      throw new Error(`tool "${definition.name}" is already registered`)
    }
    this.definitions.set(definition.name, definition)
    return () => {
      this.definitions.delete(definition.name)
    }
  }

  list(): readonly ToolDefinition[] {
    return [...this.definitions.values()]
  }

  async execute(call: ToolCall, context: ToolExecutionContext): Promise<ToolResult> {
    const definition = this.definitions.get(call.name)
    if (!definition) {
      return { callId: call.callId, name: call.name, value: null, content: `unknown tool "${call.name}"`, isError: true }
    }

    let args: Record<string, unknown>
    try {
      args = this.validateArgs(definition, call.arguments)
    } catch (error) {
      return { callId: call.callId, name: call.name, value: null, content: `invalid arguments: ${(error as Error).message}`, isError: true }
    }

    try {
      const value = await definition.execute(args, context)
      const blocks = definition.render ? definition.render(args, value) : [{ type: 'text' as const, text: formatValue(value) }]
      const content = blocks
        .map(block => (block.type === 'text' ? block.text : ''))
        .filter(text => text.length > 0)
        .join('\n')
      return { callId: call.callId, name: call.name, value, content, isError: false }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { callId: call.callId, name: call.name, value: null, content: message, isError: true }
    }
  }

  private validateArgs(definition: ToolDefinition, input: unknown): Record<string, unknown> {
    if (input === null || typeof input !== 'object' || Array.isArray(input)) {
      throw new Error('arguments must be an object')
    }
    const args = input as Record<string, unknown>
    for (const [key, spec] of Object.entries(definition.parameters)) {
      const present = key in args && args[key] !== undefined && args[key] !== null
      if (spec.required && !present) throw new Error(`missing required argument "${key}"`)
      if (present) {
        const actual = typeof args[key]
        const ok = spec.type === 'string' ? actual === 'string'
          : spec.type === 'number' ? actual === 'number'
          : spec.type === 'boolean' ? actual === 'boolean'
          : spec.type === 'array' ? Array.isArray(args[key])
          : actual === 'object'
        if (!ok) throw new Error(`argument "${key}" must be of type ${spec.type}`)
      }
    }
    return args
  }
}

export default ToolsService
