import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { getWorkspacePath, parseGroupsWithMembers, parseGroups } from './workspace'

export type MessageKind = 'group' | 'community' | 'direct'
export class MessageHistoryRecoveryError extends Error {
  readonly code = 'message_history_recovery_required'
  constructor() {
    super('This channel’s older history needs recovery because it may contain messages from more than one channel. Existing messages are unchanged. Contact the workspace owner before sending or clearing messages.')
  }
}
export function archiveMatches(prefix: string, filename: string): boolean {
  return filename.startsWith(`${prefix}_`) && /^(?:\d{4}-\d{2}-\d{2}_)?\d+\.json$/.test(filename.slice(prefix.length + 1))
}

/** Storage filenames are single components and must remain inside their store. */
export function messageStoragePath(directory: string, filename: string): string {
  if (filename.includes('\0') || filename.includes('\\') || path.basename(filename) !== filename) {
    throw new Error('Invalid message storage filename')
  }
  const root = path.resolve(directory) + path.sep
  const target = path.resolve(directory, filename)
  if (!target.startsWith(root)) throw new Error('Message storage path escapes its directory')
  return target
}

/** Exact identities for new channel data; legacy bytes are retained. */
export function messageStorageIdentity(type: MessageKind, name: string) {
  const root = getWorkspacePath()
  const directory = path.join(root, 'SYSTEM', 'messages', type === 'group' ? 'groups' : type === 'community' ? 'communities' : 'direct')
  const legacyPrefix = name.replace(/[^a-z0-9_-]/gi, '_').toLowerCase()
  // Direct messages retain their existing contract; #404 concerns named channels.
  if (type === 'direct') return { directory, prefix: legacyPrefix, legacyDirectory: directory, legacyPrefix, ownsLegacy: true }
  const prefix = crypto.createHash('sha256').update(JSON.stringify([type, name])).digest('hex')
  const currentDirectory = path.join(directory, '.v2')
  const legacyArchive = path.join(directory, 'archive')
  const hasLegacy = fs.existsSync(messageStoragePath(directory, `${legacyPrefix}.json`))
    || (fs.existsSync(legacyArchive) && fs.readdirSync(legacyArchive).some(file => archiveMatches(legacyPrefix, file)))
  let ownsLegacy = false
  if (hasLegacy) {
    const owners = path.join(currentDirectory, 'legacy-owners')
    const receipt = path.join(owners, crypto.createHash('sha256').update(legacyPrefix).digest('hex') + '.json')
    const writeReceipt = (record: object) => {
      fs.mkdirSync(owners, { recursive: true })
      try { fs.writeFileSync(receipt, JSON.stringify(record), { flag: 'wx', mode: 0o600 }) }
      catch (error: any) { if (error.code !== 'EEXIST') throw error }
    }
    const readOwner = () => {
      try {
        const owner = JSON.parse(fs.readFileSync(receipt, 'utf8'))
        if (owner.version !== 1 || owner.type !== type || owner.blocked === true || typeof owner.name !== 'string'
          || owner.name.replace(/[^a-z0-9_-]/gi, '_').toLowerCase() !== legacyPrefix) throw new Error('invalid owner')
        return owner.name === name
      } catch { throw new MessageHistoryRecoveryError() }
    }
    if (fs.existsSync(receipt)) ownsLegacy = readOwner()
    else {
      // An ambiguous shared file must never belong to whichever reader arrives first.
      let names: string[]
      try {
        const catalog = fs.readFileSync(path.join(root, 'ORG', type === 'group' ? 'GROUPS.md' : 'COMMUNITIES.md'), 'utf8')
        const parsed = parseGroupsWithMembers(catalog)
        const legacy = parseGroups(catalog)
        names = [...(type === 'group' ? parsed.groups : parsed.communities), ...(type === 'group' ? legacy.groups : legacy.communities)].map(entry => entry.name)
      } catch { throw new MessageHistoryRecoveryError() }
      const candidates = new Set(names.filter(candidate => candidate.replace(/[^a-z0-9_-]/gi, '_').toLowerCase() === legacyPrefix))
      if (candidates.size > 1) {
        // Keep recovery durable if a conflicting channel is later removed or renamed.
        writeReceipt({ version: 1, type, blocked: true, legacyPrefix })
        throw new MessageHistoryRecoveryError()
      }
      if (candidates.size !== 1 || !candidates.has(name)) throw new MessageHistoryRecoveryError()
      writeReceipt({ version: 1, type, name })
      ownsLegacy = readOwner()
    }
  }
  return { directory: currentDirectory, prefix, legacyDirectory: directory, legacyPrefix, ownsLegacy }
}
