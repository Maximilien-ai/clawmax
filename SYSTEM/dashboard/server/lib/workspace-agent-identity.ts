import fs from 'fs'
import path from 'path'

export function extractIdentityField(content: string, field: string): string {
  const match = content.match(new RegExp(`^[ \\t]*(?:-[ \\t]*)?(?:\\*\\*)?${field}:(?:\\*\\*)?[ \\t]*([^\\n]*)`, 'im'))
  return match?.[1]?.trim() || ''
}

export function hasNamedAgentIdentity(agentDir: string): boolean {
  try {
    return !!extractIdentityField(fs.readFileSync(path.join(agentDir, 'IDENTITY.md'), 'utf8'), 'Name')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}
