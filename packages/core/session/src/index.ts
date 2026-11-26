/**
 * The session capability seam. Owns the append-only `SessionEvent` log and the
 * in-memory store; everything the model sees is a projection of these durable
 * facts, so any new model-visible input requires a new event type here.
 */
import { randomUUID } from 'node:crypto'
import { Context, Service } from '@deepseek-ai/cordis'
import type { Message } from '@coridis/llm'
import type { Session, SessionEvent, SessionStore } from './types.ts'

export type * from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    sessions: SessionStore
  }

  interface Events {
    'session/event'(sessionId: string, event: SessionEvent): void
  }
}

/** Project the durable event log into the messages the model sees. */
export function deriveMessages(events: readonly SessionEvent[]): Message[] {
  const messages: Message[] = []
  for (const event of events) {
    switch (event.type) {
      case 'user/message':
        messages.push({ role: 'user', content: [{ type: 'text', text: event.text }] })
        break
      case 'assistant/message': {
        const content: Message['content'] = []
        if (event.text) content.push({ type: 'text', text: event.text })
        for (const call of event.toolCalls) {
          content.push({ type: 'tool-call', callId: call.callId, name: call.name, arguments: call.arguments })
        }
        messages.push({ role: 'assistant', content })
        break
      }
      case 'tool/result':
        messages.push({
          role: 'tool',
          content: [{ type: 'tool-result', callId: event.callId, content: event.content, isError: event.isError }],
        })
        break
      default:
        break
    }
  }
  return messages
}

class SessionImpl implements Session {
  private readonly log: SessionEvent[] = []

  constructor(
    readonly id: string,
    private readonly emit: (event: SessionEvent) => void,
  ) {}

  append(event: SessionEvent): void {
    this.log.push(event)
    this.emit(event)
  }

  events(): readonly SessionEvent[] {
    return this.log
  }
}

export class SessionStoreService extends Service {
  private readonly sessions = new Map<string, SessionImpl>()

  constructor(ctx: Context) {
    super(ctx, 'sessions')
  }

  async create(options: { id?: string } = {}): Promise<Session> {
    const id = options.id ?? `session-${randomUUID()}`
    const session = new SessionImpl(id, event => this.ctx.emit('session/event', id, event))
    this.sessions.set(id, session)
    return session
  }

  get(id: string): Session | undefined {
    return this.sessions.get(id)
  }

  list(): readonly Session[] {
    return [...this.sessions.values()]
  }
}

export default SessionStoreService
