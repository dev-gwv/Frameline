import { DurableObject } from 'cloudflare:workers'
import type { ChangeTopic } from '@frameline/shared'
import type { Env } from '../env'

interface Attachment { userId: string; connectedAt: number }

/**
 * One EventHub per studio. Clients connect over WebSocket (hibernation API, so idle sockets cost nothing)
 * and receive `{"topic": "<ChangeTopic>"}` messages whenever data in that studio changes.
 * Clients may send "ping" and receive "pong" (answered without waking the object).
 */
export class EventHub extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'))
  }

  /** Called by the Worker after it has authenticated the upgrade request. */
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('Expected WebSocket', { status: 426 })
    const pair = new WebSocketPair()
    const [client, server] = [pair[0], pair[1]]
    const userId = request.headers.get('x-user-id') ?? 'unknown'
    this.ctx.acceptWebSocket(server, [`user:${userId}`])
    server.serializeAttachment({ userId, connectedAt: Date.now() } satisfies Attachment)
    server.send(JSON.stringify({ type: 'hello', topics: [] }))
    const protocol = request.headers.get('sec-websocket-protocol')?.split(',').map((s) => s.trim()).includes('frameline') ? 'frameline' : undefined
    return new Response(null, { status: 101, webSocket: client, headers: protocol ? { 'Sec-WebSocket-Protocol': protocol } : {} })
  }

  /** RPC: fan a change notification out to every connected client. Returns how many sockets received it. */
  async publish(topics: ChangeTopic[]): Promise<number> {
    const sockets = this.ctx.getWebSockets()
    const unique = [...new Set(topics)]
    let sent = 0
    for (const ws of sockets) {
      try {
        for (const topic of unique) ws.send(JSON.stringify({ topic }))
        sent++
      } catch {
        // Socket already closing; the runtime will call webSocketClose.
      }
    }
    return sent
  }

  async connections(): Promise<number> {
    return this.ctx.getWebSockets().length
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (message === 'ping') ws.send('pong')
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    try { ws.close(code, reason) } catch { /* already closed */ }
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    try { ws.close(1011, 'error') } catch { /* already closed */ }
  }
}
