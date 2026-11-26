/**
 * DeepSeek model provider: registers a streaming adapter on `ctx.llm`.
 */
import type { Context } from '@deepseek-ai/cordis'
import type { GenerateRequest, LlmAdapter, Message, StreamEvent, ToolSchema } from '@coridis/llm'

export interface Config {
  apiKeyEnv?: string
  baseUrl?: string
  model?: string
}

export const name = 'llm-deepseek'

export const inject = ['llm']

interface ProviderToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

interface ProviderMessage {
  role: string
  content?: string | null
  tool_calls?: ProviderToolCall[]
  tool_call_id?: string
}

function toProviderMessages(messages: readonly Message[]): ProviderMessage[] {
  const result: ProviderMessage[] = []
  for (const message of messages) {
    const text = message.content.filter(block => block.type === 'text').map(block => block.text).join('')
    const toolCalls = message.content.filter(block => block.type === 'tool-call')
    if (message.role === 'assistant' && toolCalls.length > 0) {
      result.push({
        role: 'assistant',
        content: text || null,
        tool_calls: toolCalls.map(block => ({
          id: block.callId,
          type: 'function' as const,
          function: { name: block.name, arguments: JSON.stringify(block.arguments) },
        })),
      })
    } else if (message.role === 'tool') {
      for (const block of message.content) {
        if (block.type === 'tool-result') {
          result.push({ role: 'tool', tool_call_id: block.callId, content: block.content })
        }
      }
    } else {
      result.push({ role: message.role, content: text })
    }
  }
  return result
}

export class DeepSeekAdapter implements LlmAdapter {
  readonly name = 'deepseek'
  readonly models = ['deepseek-chat', 'deepseek-reasoner']

  constructor(private readonly config: Config) {}

  async *stream(request: GenerateRequest): AsyncIterable<StreamEvent> {
    const apiKeyEnv = this.config.apiKeyEnv ?? 'DEEPSEEK_API_KEY'
    const apiKey = process.env[apiKeyEnv]
    if (!apiKey) throw new Error(`DeepSeek API key is missing (env ${apiKeyEnv})`)

    const baseUrl = (this.config.baseUrl ?? 'https://api.deepseek.com').replace(/\/$/, '')
    const body = {
      model: request.model,
      messages: toProviderMessages(request.messages),
      stream: true,
      tools: request.tools?.map((tool: ToolSchema) => ({
        type: 'function',
        function: { name: tool.name, description: tool.description, parameters: tool.parameters },
      })),
    }

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
      signal: request.signal,
    })

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new Error(`DeepSeek request failed (${response.status}): ${detail.slice(0, 500)}`)
    }
    if (!response.body) throw new Error('DeepSeek response has no body')

    yield* this.parseSse(response.body)
  }

  private async *parseSse(stream: ReadableStream<Uint8Array>): AsyncIterable<StreamEvent> {
    const reader = stream.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    const toolCalls = new Map<number, { id: string; name: string; args: string }>()
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed.startsWith('data:')) continue
          const data = trimmed.slice(5).trim()
          if (data === '[DONE]') {
            yield { type: 'done', stopReason: 'stop' }
            return
          }
          let payload: any
          try {
            payload = JSON.parse(data)
          } catch {
            continue
          }
          const choice = payload.choices?.[0]
          if (!choice) continue
          const delta = choice.delta ?? {}
          if (typeof delta.content === 'string' && delta.content) {
            yield { type: 'text-delta', text: delta.content }
          }
          for (const tc of delta.tool_calls ?? []) {
            const index = tc.index ?? 0
            const acc = toolCalls.get(index) ?? { id: '', name: '', args: '' }
            if (tc.id) acc.id = tc.id
            if (tc.function?.name) acc.name += tc.function.name
            if (tc.function?.arguments) acc.args += tc.function.arguments
            toolCalls.set(index, acc)
          }
          if (choice.finish_reason) {
            const reason = choice.finish_reason === 'tool_calls' ? 'tool-calls'
              : choice.finish_reason === 'length' ? 'length'
              : 'stop'
            if (reason === 'tool-calls') {
              for (const acc of toolCalls.values()) {
                let argumentsValue: unknown = {}
                if (acc.args) {
                  try {
                    argumentsValue = JSON.parse(acc.args)
                  } catch {
                    argumentsValue = acc.args
                  }
                }
                yield { type: 'tool-call', callId: acc.id || `call-${Math.random().toString(36).slice(2)}`, name: acc.name, arguments: argumentsValue }
              }
            }
            yield { type: 'done', stopReason: reason }
            return
          }
        }
      }
      yield { type: 'done', stopReason: 'stop' }
    } finally {
      reader.releaseLock()
    }
  }
}

export function apply(ctx: Context, config: Config = {}): void {
  const adapter = new DeepSeekAdapter(config)
  ctx.effect(() => ctx.llm.register(adapter))
}
