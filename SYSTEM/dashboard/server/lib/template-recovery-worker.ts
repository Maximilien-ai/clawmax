import path from 'path'
import { assertWorkspaceRecovered } from './workspace-recovery-admission'

type Workspace = { id: string; path: string }
export interface RecoveryClock {
  now(): number
  schedule(task: () => Promise<void>, delayMs: number): () => void
}
const systemClock: RecoveryClock = {
  now: Date.now,
  schedule(task, delayMs) {
    const timer = setTimeout(() => { void task() }, delayMs)
    timer.unref()
    return () => clearTimeout(timer)
  },
}

/** Retries only the startup quarantine snapshot, never a newly active apply.
 * One awaited attempt at a time; a timeout must not abandon a gateway mutation
 * and start a competing attempt. Transport RPCs own their timeout handling.
 */
export class TemplateRecoveryWorker {
  private pending = new Map<string, Workspace>()
  private started = false
  private stopped = false
  private running = false
  private cancel?: () => void
  private delayMs = 30_000
  private attempts = 0
  private nextRetryAt: string | null = null
  private lastCompletedAt: string | null = null

  constructor(workspaces: ReadonlyArray<Workspace>, private recover: (workspace: Workspace) => Promise<void>, private clock: RecoveryClock = systemClock) {
    for (const workspace of workspaces) this.pending.set(path.resolve(workspace.path), { ...workspace })
  }
  diagnostics() {
    return {
      status: this.stopped ? 'stopped' : this.running ? 'retrying' : this.nextRetryAt ? 'waiting' : this.pending.size ? 'idle' : 'complete',
      pendingWorkspaces: this.pending.size, attempts: this.attempts,
      nextRetryAt: this.nextRetryAt, lastCompletedAt: this.lastCompletedAt,
    }
  }
  start(): void {
    if (this.started || this.stopped) return
    this.started = true
    this.schedule()
  }
  stop(): void {
    this.stopped = true
    this.cancel?.()
    this.cancel = undefined
    this.nextRetryAt = null
  }
  private schedule(): void {
    if (this.stopped || !this.pending.size) return
    this.nextRetryAt = new Date(this.clock.now() + this.delayMs).toISOString()
    this.cancel = this.clock.schedule(() => this.run(), this.delayMs)
  }
  private async run(): Promise<void> {
    if (this.stopped || this.running) return
    this.running = true
    this.nextRetryAt = null
    this.cancel = undefined
    try {
      for (const [root, workspace] of this.pending) {
        if (this.stopped) break
        this.attempts++
        try {
          await this.recover(workspace)
          assertWorkspaceRecovered(root)
          this.pending.delete(root)
        } catch {
          // Preserve quarantine. Never publish transport errors, paths or tokens.
        }
      }
    } finally {
      this.running = false
      this.lastCompletedAt = new Date(this.clock.now()).toISOString()
      this.delayMs = Math.min(this.delayMs * 2, 300_000)
      this.schedule()
    }
  }
}
