import WebSocket from 'ws'
import { randomUUID } from 'crypto'
import { GATEWAY_PROTOCOL_VERSION, loadGatewayConfigFromDisk } from './gateway-rpc'
import { resolveNativeChatSessionKeys } from './native-chat-history'

/**
 * Live assistant text for a dashboard chat turn.
 *
 * `openclaw agent` prints its reply only once the turn has finished (via the Gateway it waits on a
 * single `expectFinal` RPC; with `--local` it delivers the final payloads), so forwarding its stdout
 * can never be incremental. The Gateway does broadcast every visible run's text as `chat` events
 * with `state: "delta"` while the model generates, so a read-only observer subscribed for the
 * turn's session key is the supported incremental source. `--local` runs emit those events only
 * inside the CLI process; for them the reply still arrives in one piece when the turn ends.
 *
 * Wire shapes this relies on (OpenClaw 2026.9, Gateway protocol 4): a run's first `agent` event carries
 * `seq: 1` (on OpenClaw's own runtime it is `{ runId, sessionKey, stream: 'lifecycle', data: { phase: 'start' } }`,
 * on the Codex runtime the app server's startup), then `chat` events with
 * `{ runId, sessionKey, seq, state: 'delta' | 'final', deltaText, replace?, message? }`, where `message` is a
 * snapshot of the whole reply so far. If they change, the observer simply forwards nothing and chat.ts
 * logs that live output matched no text.
 */

/** `final`: the Gateway's finished-reply snapshot, which proves nothing streamed before it. */
export type GatewayChatDelta = { text: string; replace: boolean; final?: true }

export interface GatewayChatDeltaObserver {
  /** Settles true once chat events are flowing, false once the observer has given up. Never rejects. */
  ready: Promise<boolean>
  close(): void
}

const READ_SCOPES = new Set(['operator.read', 'operator.write', 'operator.admin'])
const MAX_RECONNECTS = 3

/** The visible text of a `chat` frame's `message` snapshot, or undefined when it carries none. */
function snapshotText(message: unknown): string | undefined {
  const content = message && typeof message === 'object' ? (message as { content?: unknown }).content : undefined
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return undefined
  const parts = content.filter((part): part is { text: string } => part?.type === 'text' && typeof part.text === 'string')
  return parts.length ? parts.map((part) => part.text).join('') : undefined
}

export function observeGatewayChatDeltas(options: {
  wsUrl: string
  token: string
  sessionKeys: string[]
  onDelta: (delta: GatewayChatDelta) => void
  onUnavailable: (reason: string) => void
  connectTimeoutMs?: number
  reconnectDelayMs?: number
}): GatewayChatDeltaObserver {
  const sessionKeys = new Set(options.sessionKeys)
  let closed = false
  let subscribed = false
  let reconnects = 0
  let runId: string | undefined
  let lastSeq = -1
  let socket: WebSocket | undefined
  let timer: NodeJS.Timeout | undefined
  let settleReady: (value: boolean) => void = () => {}
  const ready = new Promise<boolean>((resolve) => { settleReady = resolve })

  const close = () => {
    if (closed) return
    closed = true
    clearTimeout(timer)
    settleReady(false)
    try { socket?.close() } catch { /* already closing */ }
  }
  const giveUp = (reason: string) => {
    if (closed) return
    options.onUnavailable(reason)
    close()
  }
  // Before the first subscription a failure ends live output at once: the turn must not wait on it.
  // After it, the run is still going, so reconnect. The Gateway sends no replay, but the first text
  // frame a connection receives for a run carries the whole reply so far, so nothing is lost or doubled.
  const connectionLost = (reason: string) => {
    if (closed) return
    if (!subscribed || reconnects >= MAX_RECONNECTS) return giveUp(reason)
    reconnects += 1
    clearTimeout(timer)
    timer = setTimeout(connect, (options.reconnectDelayMs ?? 250) * reconnects)
  }

  const handleEvent = (frame: any) => {
    const payload = frame?.type === 'event' ? frame.payload : undefined
    if (!payload || !sessionKeys.has(payload.sessionKey)) return
    // Follow only the run that starts after this subscription. A run already going on the same key
    // -- one whose CLI was stopped while its Gateway run continues -- never sends its first event
    // here. It can announce a later start (a retry, a tool loop, a model fallback all restart a run),
    // so only a run's first event, sequence 1, starts this reply. That event is the run's lifecycle
    // start on OpenClaw's own runtime, but the app server's startup on the Codex runtime, whose
    // lifecycle start follows as sequence 4.
    if (frame.event === 'agent') {
      const first = typeof payload.seq === 'number'
        ? payload.seq <= 1
        : payload.stream === 'lifecycle' && payload.data?.phase === 'start'
      if (first) runId ??= payload.runId
      return
    }
    if (frame.event !== 'chat' || !runId || payload.runId !== runId) return
    // A run's sequence numbers never decrease (they may repeat or skip); an older one is stale.
    if (typeof payload.seq === 'number') {
      if (payload.seq < lastSeq) return
      lastSeq = payload.seq
    }
    // A snapshot is the whole reply so far and already includes deltaText: replace, never append both.
    // On `final` it is the finished reply; the CLI's own result follows and stays authoritative.
    const snapshot = snapshotText(payload.message)
    if (snapshot !== undefined && (payload.state === 'delta' || payload.state === 'final')) {
      options.onDelta(payload.state === 'final' ? { text: snapshot, replace: true, final: true } : { text: snapshot, replace: true })
    } else if (payload.state === 'delta' && typeof payload.deltaText === 'string') {
      options.onDelta({ text: payload.deltaText, replace: payload.replace === true })
    }
  }

  function connect() {
    if (closed) return
    const connectId = randomUUID()
    // No Origin header: the Gateway treats any Origin as a browser and strips a token-only client of
    // its scopes, while a loopback backend client keeps them.
    const ws = new WebSocket(options.wsUrl)
    socket = ws
    let lost = false
    const lose = (reason: string) => {
      if (lost || socket !== ws) return
      lost = true
      try { ws.terminate() } catch { /* already gone */ }
      connectionLost(reason)
    }
    timer = setTimeout(() => lose('Gateway did not accept the live-output subscription in time'), options.connectTimeoutMs ?? 5000)

    ws.on('message', (raw) => {
      if (closed || socket !== ws) return
      let frame: any
      try { frame = JSON.parse(raw.toString()) } catch { return }
      if (frame?.type === 'event' && frame.event === 'connect.challenge') {
        ws.send(JSON.stringify({
          type: 'req',
          id: connectId,
          method: 'connect',
          params: {
            minProtocol: GATEWAY_PROTOCOL_VERSION,
            maxProtocol: GATEWAY_PROTOCOL_VERSION,
            client: { id: 'gateway-client', displayName: 'ClawMax chat live output', version: '1.0.0', platform: process.platform, mode: 'backend' },
            caps: [],
            auth: { token: options.token },
            role: 'operator',
            scopes: ['operator.read'],
          },
        }))
        return
      }
      if (frame?.type === 'res' && frame.id === connectId) {
        // Refusals are answers, not outages: retrying would get the same one.
        if (!frame.ok) return giveUp(`Gateway refused the live-output subscription: ${frame.error?.message || 'unknown error'}`)
        const scopes: unknown = frame.payload?.auth?.scopes ?? frame.payload?.scopes
        if (Array.isArray(scopes) && !scopes.some((scope) => READ_SCOPES.has(scope))) {
          return giveUp('Gateway granted no read scope for live output')
        }
        clearTimeout(timer)
        subscribed = true
        settleReady(true)
        return
      }
      handleEvent(frame)
    })
    ws.on('error', (err) => lose(`Gateway live-output connection failed: ${err.message}`))
    ws.on('close', () => lose('Gateway live-output connection closed'))
  }

  connect()
  return { ready, close }
}

/**
 * Subscribe to a Gateway-run turn's live text before the CLI starts it. Returns null when no Gateway
 * is configured or the subscription failed; the reply then arrives whole when the turn finishes.
 */
export async function openGatewayChatLiveOutput(
  agentId: string,
  sessionId: string,
  onDelta: (delta: GatewayChatDelta) => void,
): Promise<GatewayChatDeltaObserver | null> {
  const config = loadGatewayConfigFromDisk()
  if (!config) return null
  // `--session-id X` runs under `agent:<id>:explicit:X`, unless the agent store already maps X to
  // another key (a session migrated from the legacy dashboard-chat index), which the runtime reuses.
  let migratedKeys: string[] = []
  try {
    migratedKeys = resolveNativeChatSessionKeys(agentId, sessionId, process.env.HOME || '')
  } catch (err) {
    console.warn(`[Chat Live Output] Could not read session keys for ${agentId}: ${err instanceof Error ? err.message : String(err)}`)
  }
  const observer = observeGatewayChatDeltas({
    wsUrl: config.wsUrl || `ws://127.0.0.1:${config.port}`,
    token: config.auth.token,
    sessionKeys: [`agent:${agentId}:explicit:${sessionId}`, ...migratedKeys],
    onDelta,
    onUnavailable: (reason) => console.warn(`[Chat Live Output] ${agentId}: ${reason}. The reply will appear when the turn finishes.`),
  })
  return (await observer.ready) ? observer : null
}
