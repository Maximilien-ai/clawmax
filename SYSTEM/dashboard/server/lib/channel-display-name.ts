import fs from 'fs'
import path from 'path'
import { TEMPLATES_DIR } from './paths'
import { templateStoragePath } from './template-storage-path'

// Keep the routing ID stable; imported artifacts carry a separate human name.
export function channelDisplayName(root: string, type: 'group' | 'community', id: string, description?: string | null): string {
  if (!id || /[\/\\\x00-\x1f]/.test(id) || id === '.' || id === '..') return id
  const fallback = () => legacyChannelName(type, id, description)
  try {
    const file = templateStoragePath(root, `ORG/template-${type === 'group' ? 'groups' : 'communities'}/${encodeURIComponent(id)}.json`)
    const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK)
    try {
      const stat = fs.fstatSync(fd)
      if (!stat.isFile() || stat.size > 64 * 1024) return id
      const metadata = JSON.parse(fs.readFileSync(fd, 'utf8'))
      const name = typeof metadata.name === 'string' ? metadata.name.trim() : ''
      return metadata.id === id && name && name.length <= 160 ? name : id
    } finally { fs.closeSync(fd) }
  } catch { return fallback() }
}

// Older organization imports did not retain display metadata. Recover only an
// exact authored name AND purpose match from shipped templates, never by
// splitting arbitrary hyphenated names. Ambiguous or edited entries keep IDs.
let shippedChannels: Array<{ type: string; name: string; description: string }> | undefined
function legacyChannelName(type: string, id: string, description?: string | null): string {
  if (!description?.trim()) return id
  if (!shippedChannels) {
    shippedChannels = []
    const directory = path.join(TEMPLATES_DIR, 'organizations')
    try {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue
        try {
          const file = templateStoragePath(directory, `${entry.name}/template.json`)
          const template = JSON.parse(fs.readFileSync(file, 'utf8'))
          for (const kind of ['group', 'community']) {
            for (const channel of template[kind === 'group' ? 'groups' : 'communities'] || []) {
              if (typeof channel.name === 'string' && typeof channel.description === 'string')
                shippedChannels.push({ type: kind, name: channel.name.trim(), description: channel.description.trim() })
            }
          }
        } catch { /* An unavailable template cannot establish a display name. */ }
      }
    } catch { /* Keep the original ID if the catalog is unavailable. */ }
  }
  const names = new Set(shippedChannels.filter(channel => channel.type === type && channel.name &&
    channel.description === description.trim() && id.endsWith(`-${channel.name}`)).map(channel => channel.name))
  return names.size === 1 ? [...names][0] : id
}

export function saveChannelDisplayName(root: string, type: 'group' | 'community', id: string, name: string): void {
  if (id === name) return
  const file = templateStoragePath(root, `ORG/template-${type === 'group' ? 'groups' : 'communities'}/${encodeURIComponent(id)}.json`)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  try { fs.writeFileSync(file, JSON.stringify({ id, name }), { encoding: 'utf8', flag: 'wx' }) }
  catch (error: any) { if (error.code !== 'EEXIST') throw error }
}
