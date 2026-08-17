import type { ChildProcess } from 'child_process'

type KillableChild = Pick<ChildProcess, 'pid' | 'exitCode' | 'signalCode' | 'kill'>
type GroupSignaler = (pid: number, signal: NodeJS.Signals) => void

/** How long a CLI gets to honour SIGTERM before the group is killed outright. */
const KILL_ESCALATION_MS = 2000

/**
 * Signal a spawned CLI and everything it started.
 *
 * Agent CLIs spawn their own children, and signalling only the direct child leaves those
 * grandchildren alive holding the stdout pipe open. Callers spawn detached so the child leads its
 * own process group, which is what makes the negative pid reach the whole tree; the direct-child
 * kill is a fallback for when the group signal did not happen (no pid, Windows) or failed (group
 * already reaped), not an alternative to it.
 */
export function signalProcessTree(
  child: KillableChild,
  signal: NodeJS.Signals,
  signalGroup: GroupSignaler = (pid, nextSignal) => process.kill(-pid, nextSignal),
): 'group' | 'child' | 'none' {
  if (process.platform !== 'win32' && child.pid) {
    try {
      signalGroup(child.pid, signal)
      return 'group'
    } catch {}
  }
  try {
    child.kill(signal)
    return 'child'
  } catch {
    return 'none'
  }
}

/**
 * SIGTERM the tree, then SIGKILL it, then tell the caller it can stop waiting.
 *
 * The escalation is deliberately unconditional rather than guarded on the direct child still being
 * alive. That guard observes only the direct child, so a CLI that exits cleanly on SIGTERM while
 * leaving a group member that traps it would skip the group SIGKILL entirely and leak live
 * processes -- at exactly the boundary this exists to harden. signalProcessTree already swallows
 * the already-gone case, so signalling unconditionally costs nothing and closes that hole.
 *
 * `onEscalated` is what makes this usable where a turn has no deadline: it fires after SIGKILL so
 * the caller can settle from whatever it captured. That matters because 'close' needs every stdio
 * pipe closed, and a grandchild that escaped the group holds stdout open indefinitely -- a caller
 * waiting on 'close' would hang its promise, and with it the per-agent execution lock, with nothing
 * left to clear either.
 *
 * This is the ONLY escalation in the codebase, deliberately. Two existed after a merge -- one from
 * each side, doing the same thing -- and a second copy is how the guarded-SIGKILL bug spread to five
 * call sites in the first place. The single-timer rule is asserted by a test.
 *
 * Returns the escalation timer so a caller can clear it when the process exits on its own.
 */
export function cancelProcessTree(
  child: KillableChild,
  onEscalated: () => void = () => {},
  graceMs: number = KILL_ESCALATION_MS,
): NodeJS.Timeout {
  signalProcessTree(child, 'SIGTERM')
  const timer = setTimeout(() => {
    signalProcessTree(child, 'SIGKILL')
    onEscalated()
  }, graceMs)
  timer.unref?.()
  return timer
}

/**
 * Stop a process tree without needing to be told when it is gone.
 *
 * For callers that only want the process dead -- an operator cancelling an execution, a runaway
 * output ceiling -- and have no promise waiting on the outcome.
 */
export function terminateProcessTree(child: KillableChild, graceMs = KILL_ESCALATION_MS): NodeJS.Timeout {
  return cancelProcessTree(child, () => {}, graceMs)
}

/**
 * Stop reading a finished process's output.
 *
 * Called from every settle path. Detaching matters because a grandchild that escaped the process
 * group keeps writing to the still-open pipe, re-entering the caller's closure long after it has
 * moved on. Guarded because settle() is the one path that MUST NOT throw: it is what releases the
 * turn registry entry and the per-agent execution lock, and a throw here would strand both.
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
