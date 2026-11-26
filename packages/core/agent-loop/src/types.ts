/** The `ctx.agentLoop` seam: the driver that owns turn/step execution. */
export interface AgentLoop {
  run(agentId: string): Promise<void>
}
