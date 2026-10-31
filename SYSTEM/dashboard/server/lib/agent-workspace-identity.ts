import fs from 'fs'
import path from 'path'

// Shared discovery contract for the agent roster and workspace picker.
export function extractIdentityField(content: string, field: string): string {
  const match = content.match(new RegExp(`^[ \\t]*(?:-[ \\t]*)?(?:\\*\\*)?${field}:(?:\\*\\*)?[ \\t]*([^\\n]*)`, 'im'))
  return match?.[1]?.trim() || ''
}

export function isManagedAgentWorkspaceDir(agentDir: string): boolean {
  try {
    const stats = fs.statSync(agentDir)
    if (!stats.isDirectory()) return false
  } catch {
    return false
  }

  try {
    const identityPath = path.join(agentDir, 'IDENTITY.md')
    const identity = fs.readFileSync(identityPath, 'utf-8')
    const name = extractIdentityField(identity, 'Name')
    return !!name
  } catch {
    return false
  }
}

