import fs from 'fs'
import path from 'path'
import { assertTemplateRuntimeAdmitted } from './template-runtime-admission'

/** Legacy startup repair must never substitute for Template admission/recovery.
 * The guard precedes every callback that may inspect or mutate runtime state.
 */
export async function repairWorkspaceAgentRegistrations(options: {
  workspacePath: string
  registeredIds: ReadonlySet<string>
  isManaged: (workspace: string) => boolean
  register: (id: string, workspace: string) => Promise<void>
  skipped: (id: string, error: unknown) => void
}): Promise<number> {
  const agentsDir = path.join(options.workspacePath, 'AGENTS')
  if (!fs.existsSync(agentsDir)) return 0
  let repaired = 0
  for (const entry of fs.readdirSync(agentsDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === 'archive') continue
    if (options.registeredIds.has(entry.name)) continue
    try {
      assertTemplateRuntimeAdmitted(entry.name)
      const workspace = path.join(agentsDir, entry.name)
      if (!options.isManaged(workspace)) continue
      await options.register(entry.name, workspace)
      repaired++
    } catch (error) {
      options.skipped(entry.name, error)
    }
  }
  return repaired
}
