import type { ChildProcess } from 'child_process'

type KillableChild = Pick<ChildProcess, 'pid' | 'exitCode' | 'signalCode' | 'kill'>
type GroupSignaler = (pid: number, signal: NodeJS.Signals) => void

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

export function terminateProcessTree(child: KillableChild, graceMs = 2000): NodeJS.Timeout {
  signalProcessTree(child, 'SIGTERM')
  const escalation = setTimeout(() => {
    // Escalate unconditionally. The direct child can exit cleanly after SIGTERM
    // while leaving a descendant in its process group alive. Looking only at the
    // direct child's exit state would then skip SIGKILL and retain that process
    // (and potentially the stdio pipe it inherited).
    signalProcessTree(child, 'SIGKILL')
  }, graceMs)
  escalation.unref?.()
  return escalation
}
