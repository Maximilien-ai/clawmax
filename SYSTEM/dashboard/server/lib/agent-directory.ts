import fs from 'fs'

/** Resolve membership by enumerating the trusted root, never by joining a request id. */
export function hasAgentDirectory(root: string, id: string): boolean {
  if (!/^[a-z][a-z0-9_-]*$/.test(id)) return false
  try {
    return fs.readdirSync(root, { withFileTypes: true }).some(entry => entry.name === id && entry.isDirectory())
  } catch (error: any) {
    if (error.code === 'ENOENT') return false
    throw error
  }
}
