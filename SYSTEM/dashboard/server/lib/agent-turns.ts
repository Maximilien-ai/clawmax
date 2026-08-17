/**
 * Registry of agent turns that are currently running.
 *
 * Agent turns have no deadline: they run until the process exits or someone cancels them. That
 * makes cancellation the only kill switch, and a kill switch needs something to aim at -- this is
 * it. Before this, `routes/chat.ts` kept a single `proc` handle that was only ever assigned on the
 * openclaw path, so Cancel and the disconnect handler were structural no-ops for claude and droid:
 * the UI cleared, said "Request cancelled", and the CLI kept running unseen.
 *
 * Deliberately in-memory. A turn cannot outlive the process that spawned it (the child is killed
 * with its parent's process group), so a registry that survived a restart would only ever describe
 * turns that are already dead. Reconciling records for a crashed process is a separate concern from
 * cancelling a live one, and conflating them is how you end up with a job queue nobody asked for.
 */

export interface ActiveTurn {
  turnId: string
  agentId: string
  startedAt: number
  /** Last time the CLI produced any output. The only evidence a long silent turn is still alive. */
  lastActivityAt: number
  controller: AbortController
}

const activeTurns = new Map<string, ActiveTurn>()

/** Monotonic within a process; the registry is in-memory so it need not survive a restart. */
let turnCounter = 0

export function registerTurn(agentId: string): ActiveTurn {
  turnCounter += 1
  const turn: ActiveTurn = {
    turnId: `${agentId}:${turnCounter}`,
    agentId,
    startedAt: Date.now(),
    lastActivityAt: Date.now(),
    controller: new AbortController(),
  }
  activeTurns.set(turn.turnId, turn)
  return turn
}

export function touchTurn(turnId: string): void {
  const turn = activeTurns.get(turnId)
  if (turn) turn.lastActivityAt = Date.now()
}

export function releaseTurn(turnId: string): void {
  activeTurns.delete(turnId)
}

/**
 * Stop one turn by id. This is the right default for a UI Stop button: nothing stops
 * `registerTurn(agentId)` from being called twice for the same agent (two browser tabs open on
 * the same agent, or a second request queued behind `runExclusiveAgentExecution` while the first
 * still runs) -- an agentId alone cannot tell those turns apart, only the turnId minted for that
 * specific request can. Returns false when there is nothing to stop, so a caller can tell
 * "already finished" apart from "cancelled", rather than reporting success either way.
 */
export function cancelTurn(turnId: string): boolean {
  const turn = activeTurns.get(turnId)
  if (!turn) return false
  turn.controller.abort()
  return true
}

/**
 * Stop every turn for one agent. This is for a bulk "stop this agent" action (an admin panel, or
 * a caller that genuinely has no turnId to target) -- NOT the per-tab Stop button, because it
 * aborts every concurrent turn for the agent indiscriminately, including turns other tabs/requests
 * started. Prefer `cancelTurn(turnId)` whenever a turnId is available.
 */
export function cancelTurnsForAgent(agentId: string): number {
  let cancelled = 0
  for (const turn of activeTurns.values()) {
    if (turn.agentId === agentId) {
      turn.controller.abort()
      cancelled += 1
    }
  }
  return cancelled
}

/** The subset of a registered turn a running callback actually needs -- never the raw map entry. */
export interface RegisteredTurn {
  turnId: string
  agentId: string
  /** The turn's only stop condition. Pass straight through to whatever spawns the CLI. */
  signal: AbortSignal
  /** Record that the turn is still alive. See `lastActivityAt` for why this matters. */
  touch: () => void
}

/**
 * Register a turn, hand it to `fn`, and release it no matter how `fn` ends.
 *
 * Every call site that registers a turn by hand has to remember to release it on every exit path
 * -- success, a thrown error, an early return -- and the openclaw branch in `routes/chat.ts` is
 * exactly the case where that was missed: it released on the error path but not the success path,
 * so every completed turn leaked in the registry forever. `channels.ts`, `workflows.ts`, and
 * `routes/agents.ts` don't call `registerTurn` at all today, which is worse: those turns hold
 * `runExclusiveAgentExecution`'s per-agent lock but are invisible to `listActiveTurns` and
 * unreachable by `cancelTurn`/`cancelTurnsForAgent`, so a wedged one blocks that agent's chat
 * turns forever with no way to see or stop the thing actually stuck.
 *
 * A `finally` here makes leaking structurally impossible instead of relying on five call sites to
 * each get it right, and gives every caller a real `signal` to pass to `runExclusiveAgentExecution`
 * instead of the throwaway `new AbortController().signal` those three routes use today, which
 * nothing can ever abort.
 */
export async function withRegisteredTurn<T>(
  agentId: string,
  fn: (turn: RegisteredTurn) => Promise<T>,
): Promise<T> {
  const turn = registerTurn(agentId)
  try {
    return await fn({
      turnId: turn.turnId,
      agentId: turn.agentId,
      signal: turn.controller.signal,
      touch: () => touchTurn(turn.turnId),
    })
  } finally {
    releaseTurn(turn.turnId)
  }
}

export interface ActiveTurnSummary {
  turnId: string
  agentId: string
  startedAt: number
  lastActivityAt: number
  elapsedMs: number
  idleMs: number
}

/**
 * What is running right now. With no timeout, this and the elapsed/idle numbers in the UI are the
 * only way a wedged turn ever becomes visible -- nothing will notice it automatically any more.
 */
export function listActiveTurns(): ActiveTurnSummary[] {
  const now = Date.now()
  return [...activeTurns.values()].map((turn) => ({
    turnId: turn.turnId,
    agentId: turn.agentId,
    startedAt: turn.startedAt,
    lastActivityAt: turn.lastActivityAt,
    elapsedMs: now - turn.startedAt,
    idleMs: now - turn.lastActivityAt,
  }))
}

export function activeTurnCount(): number {
  return activeTurns.size
}
