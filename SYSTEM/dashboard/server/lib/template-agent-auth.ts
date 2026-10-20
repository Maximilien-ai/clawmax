import fs from 'fs'
import path from 'path'

/** Project only credential names. Never return a binding reference, token, or
 * workspace-controlled sign-in URL to the browser. */
export function listTemplateHostCredentialRequirements(agentDir: string): string[] {
  let fd: number | undefined
  try {
    fd = fs.openSync(path.join(agentDir, 'TEMPLATE_AUTHORITY.json'), fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK)
    const stat = fs.fstatSync(fd)
    if (!stat.isFile() || stat.size > 64 * 1024) return []
    const binding = JSON.parse(fs.readFileSync(fd, 'utf8'))
    if (!Array.isArray(binding?.credentials) || binding.credentials.length > 16) return []
    const names: string[] = []
    for (const item of binding.credentials as unknown[]) {
      const name = item !== null && typeof item === 'object' ? (item as { name?: unknown }).name : null
      if (typeof name === 'string' && /^[A-Z][A-Z0-9_]{1,127}$/.test(name)) names.push(name)
    }
    return [...new Set(names)].sort()
  } catch { return [] } finally { if (fd !== undefined) fs.closeSync(fd) }
}
