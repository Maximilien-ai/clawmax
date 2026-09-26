import fs from 'fs'
import { templateStoragePath } from './template-storage-path'

// Keep the routing ID stable; imported artifacts carry a separate human name.
export function channelDisplayName(root: string, type: 'group' | 'community', id: string): string {
  if (!/^tr-[a-z0-9-]+$/.test(id)) return id
  try {
    const file = templateStoragePath(root, `ORG/template-${type === 'group' ? 'groups' : 'communities'}/${id}.json`)
    const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK)
    try {
      const stat = fs.fstatSync(fd)
      if (!stat.isFile() || stat.size > 64 * 1024) return id
      const metadata = JSON.parse(fs.readFileSync(fd, 'utf8'))
      const name = typeof metadata.name === 'string' ? metadata.name.trim() : ''
      return metadata.id === id && name && name.length <= 160 ? name : id
    } finally { fs.closeSync(fd) }
  } catch { return id }
}
