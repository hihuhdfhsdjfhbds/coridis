/**
 * The default agent driver implementing the `Agent` interface. A step is one
 * model request plus the tools it calls; a turn is zero or more steps.
 */
import { Context, Service } from '@deepseek-ai/cordis'
import type { Message } from '@coridis/llm'
import type { Agent } from '@coridis/agent'
import { deriveMessages } from '@coridis/session'
import type { ToolCall } from '@coridis/session'
import type { ToolExecutionContext } from '@coridis/tools'
import '@coridis/system-prompt'
import type { AgentLoop } from './types.ts'

export type * from './types.ts'

export interface Config {
  agents?: readonly string[]
  maxStepsPerTurn?: number
  defaultModel?: string
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    agentLoop: AgentLoop
  }
}

export class AgentLoopService extends Service {
  static inject = ['agents', 'llm', 'sessions', 'systemPrompt', 'tools']

  private readonly config: Config

  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'agentLoop')
    this.config = config
  }

  async run(agentId: string): Promise<string> {
    const agent = this.ctx.agents.get(agentId)
    if (!agent) throw new Error(`agent "${agentId}" not found`)
    const session = this.ctx.sessions.get(agent.sessionId)
    if (!session) throw new Error(`session "${agent.sessionId}" not found`)

    const model = agent.model || this.config.defaultModel || this.ctx.llm.models()[0]
    if (!model) throw new Error('no model configured')

    const schemas = this.ctx.tools.list().map(tool => tool.schema())
    const system = await this.ctx.systemPrompt.assemble({ tools: schemas })
    const maxSteps = this.config.maxStepsPerTurn ?? 24

    let lastText = ''
    for (let step = 0; step < maxSteps; step++) {
      const history = deriveMessages(session.events())
      const messages: Message[] = [{ role: 'system', content: [{ type: 'text', text: system }] }, ...history]

      const controller = new AbortController()
      const adapter = this.ctx.llm.resolve(model)

      let text = ''
      const toolCalls: ToolCall[] = []
      for await (const event of adapter.stream({ model, messages, tools: schemas, signal: controller.signal })) {
        if (event.type === 'text-delta') {
          text += event.text
          this.ctx.emit('agent/assistant-stream', agent.id, event.text)
        } else if (event.type === 'tool-call') {
          toolCalls.push({ callId: event.callId, name: event.name, arguments: event.arguments })
        }
      }

      if (text) lastText = text
      session.append({ type: 'assistant/message', text, toolCalls })
      if (toolCalls.length === 0) return text || lastText

      for (const call of toolCalls) {
        this.ctx.emit('agent/tool-call', agent.id, call)
        const exec: ToolExecutionContext = { callId: call.callId, signal: controller.signal }
        const result = await this.ctx.tools.execute(
          { callId: call.callId, name: call.name, arguments: call.arguments },
          exec,
        )
        session.append({ type: 'tool/result', callId: call.callId, content: result.content, isError: result.isError })
      }
    }

    return lastText
  }
}

export default AgentLoopService
