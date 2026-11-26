import type { ContentBlock, Message } from '@coridis/llm'

export interface TurnStartEvent {
  type: 'turn/start'
}

export interface UserMessageEvent {
  type: 'user/message'
  text: string
}

export interface ToolCall {
  callId: string
  name: string
  arguments: unknown
}

export interface AssistantMessageEvent {
  type: 'assistant/message'
  text: string
  toolCalls: readonly ToolCall[]
}

export interface ToolResultEvent {
  type: 'tool/result'
  callId: string
  content: string
  isError: boolean
}

export interface TurnEndEvent {
  type: 'turn/end'
}

/** Durable facts appended to the log; model history derives from these. */
export type SessionEvent =
  | TurnStartEvent
  | UserMessageEvent
  | AssistantMessageEvent
  | ToolResultEvent
  | TurnEndEvent

export interface Session {
  readonly id: string
  append(event: SessionEvent): void
  events(): readonly SessionEvent[]
}

export interface SessionStore {
  create(options?: { id?: string }): Promise<Session>
  get(id: string): Session | undefined
  list(): readonly Session[]
}

export type { ContentBlock, Message }
