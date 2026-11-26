/**
 * The agent capability seam. Owns the `Agent` interface and live registry;
 * `agent/*` events let plugins observe or intercept work in flight without
 * importing the loop.
 */
import { Context, Service } from '@deepseek-ai/cordis'
import type { SessionStore } from '@coridis/session'
import type { Agent, AgentCreateOptions, AgentInput, AgentRegistry } from './types.ts'

export type * from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    agents: AgentRegistry
  }

  interface Events {
    'agent/created'(agent: Agent): void
    'agent/assistant-stream'(agentId: string, delta: string): void
  }
}

class AgentImpl implements Agent {
  constructor(
    readonly id: string,
    readonly sessionId: string,
    readonly model: string,
    private readonly sessions: SessionStore,
  ) {}

  async submit(input: AgentInput): Promise<void> {
    this.sessions.get(this.sessionId)?.append({ type: 'user/message', text: input.content })
  }

  inject(input: AgentInput): void {
    this.sessions.get(this.sessionId)?.append({ type: 'user/message', text: `[context] ${input.content}` })
  }

  async stop(_reason?: string): Promise<void> {}
}

export class AgentRegistryService extends Service {
  static inject = ['sessions']

  private readonly agents = new Map<string, AgentImpl>()

  constructor(ctx: Context) {
    super(ctx, 'agents')
  }

  async create(options: AgentCreateOptions = {}): Promise<Agent> {
    const session = await this.ctx.sessions.create({ id: options.sessionId })
    const id = `agent-${session.id}`
    const model = options.model ?? ''
    const agent = new AgentImpl(id, session.id, model, this.ctx.sessions)
    this.agents.set(id, agent)
    this.ctx.emit('agent/created', agent)
    return agent
  }

  get(id: string): Agent | undefined {
    return this.agents.get(id)
  }

  list(): readonly Agent[] {
    return [...this.agents.values()]
  }
}

export default AgentRegistryService
