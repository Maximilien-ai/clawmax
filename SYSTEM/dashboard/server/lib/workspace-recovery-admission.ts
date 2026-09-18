import fs from 'fs'
import path from 'path'
import { PortableTemplateError } from './portable-template-zip'
import { templateStoragePath } from './template-storage-path'

const recoveringOrFailed = new Set<string>()

// Internal recovery owner only; ordinary workspace operations cannot clear this.
export function setWorkspaceRecoveryPending(root: string, pending: boolean): void {
  if (pending) recoveringOrFailed.add(path.resolve(root))
  else recoveringOrFailed.delete(path.resolve(root))
}

/** Durable journals are the quarantine marker, including after a process restart.
 * Never clear quarantine merely because an in-memory retry completed or timed out.
 */
export function assertWorkspaceRecovered(root: string): void {
  try {
    if (recoveringOrFailed.has(path.resolve(root))) throw new Error('recovery not verified')
    for (const relative of ['.clawmax/template-transaction.json', '.clawmax/template-gateway-transaction.json']) {
      if (fs.existsSync(templateStoragePath(root, relative))) throw new Error('pending recovery')
    }
  } catch {
    throw new PortableTemplateError('workspace_recovery_required', 'Workspace recovery is required before accessing its resources', 503)
  }
}

export function workspaceRecoveryBlocked(root: string): boolean {
  try { assertWorkspaceRecovered(root); return false } catch { return true }
}
