export interface AgentInput {
  content: string
}

/** A live agent handle: submit work, inject context, and stop. */
export interface Agent {
  readonly id: string
  readonly sessionId: string
  readonly model: string
  submit(input: AgentInput): Promise<void>
  inject(input: AgentInput): void
  stop(reason?: string): Promise<void>
}

export interface AgentCreateOptions {
  sessionId?: string
  model?: string
}

/** The `ctx.agents` seam: live registry and agent/* event dispatch. */
export interface AgentRegistry {
  create(options?: AgentCreateOptions): Promise<Agent>
  get(id: string): Agent | undefined
  list(): readonly Agent[]
}
