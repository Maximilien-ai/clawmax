import type { ChildProcess } from 'child_process'

/**
 * Signal a spawned CLI and everything it started.
 *
 * Agent CLIs spawn their own children, and signalling only the direct child leaves those
 * grandchildren alive holding the stdout pipe open -- which matters more than usual here, because
 * turns have no deadline: nothing else will ever clean up what this misses.
 *
 * Callers spawn with `detached: true` so the child leads its own process group, making the negative
 * pid reach the whole tree. The direct-child kill is a fallback, not an alternative: it runs
 * whenever the group signal did not happen (no pid yet) or failed (group already reaped).
 *
 * Lives in one place because five call sites need identical behaviour -- agent-runtime's runOnce,
 * and the raw openclaw spawns in chat, channels, workflows and the agents route. The first version
 * of this was copy-pasted, and every copy shared a bug: `if (pid) process.kill(-pid)` inside a try
 * meant that a process with no pid took neither branch, so nothing was signalled at all and the
 * caller believed it had killed something.
 */
export function killProcessTree(child: ChildProcess, signal: NodeJS.Signals): void {
  if (child.pid) {
    try {
      process.kill(-child.pid, signal)
      return
    } catch {
      // Group already gone, or never formed (spawn not detached). Fall through to the child.
    }
  }
  try {
    child.kill(signal)
  } catch {
    // Already exited.
  }
}

/** How long a CLI gets to honour SIGTERM before the group is killed outright. */
const KILL_ESCALATION_MS = 2000

/**
 * Cancel a spawned CLI and guarantee the caller gets to settle.
 *
 * SIGTERM is a request: a CLI that traps or ignores it keeps running. So the group is killed
 * unconditionally after a grace period, and `onEscalated` fires so the caller can settle from
 * whatever it captured -- necessary because 'close' needs every stdio pipe closed, and a grandchild
 * that escaped the group holds stdout open forever. With no deadline anywhere, a caller that waits
 * on 'close' here would hang its promise, and with it the per-agent execution lock, permanently.
 *
 * The escalation is deliberately NOT guarded on the direct child still being alive. That guard was
 * here, copied across five call sites, and it was wrong at every one: it observes only the direct
 * child, so a CLI that exits cleanly on SIGTERM while leaving a group member that traps it would
 * skip the group SIGKILL entirely and leak live processes -- at exactly the boundary this exists to
 * harden. killProcessTree already swallows the already-gone case, so an unconditional signal costs
 * nothing and closes that hole.
 *
 * Returns the escalation timer so the caller can clear it when the process exits on its own.
 */
export function cancelProcessTree(
  child: ChildProcess,
  onEscalated: () => void,
  graceMs: number = KILL_ESCALATION_MS,
): NodeJS.Timeout {
  killProcessTree(child, 'SIGTERM')
  const timer = setTimeout(() => {
    killProcessTree(child, 'SIGKILL')
    onEscalated()
  }, graceMs)
  timer.unref?.()
  return timer
}

/**
 * Stop reading a finished process's output.
 *
 * Called from every settle path. Detaching matters because a grandchild that escaped the process
 * group keeps writing to the still-open pipe, re-entering the caller's closure long after it has
 * moved on. Guarded because settle() is the one path that MUST NOT throw: it is what releases the
 * turn registry entry and the per-agent execution lock, and a throw here would wedge both -- with
 * no deadline anywhere left to clear them.
 */
export function detachProcessStreams(child: { stdout?: any; stderr?: any }): void {
  for (const stream of [child.stdout, child.stderr]) {
    if (!stream) continue
    try {
      if (typeof stream.removeAllListeners === 'function') stream.removeAllListeners()
      if (typeof stream.destroy === 'function') stream.destroy()
    } catch {
      // Nothing actionable: the stream is already gone, which is the state we wanted anyway.
    }
  }
}
