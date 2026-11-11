import fs from 'fs'
import path from 'path'
import { getWorkspacePath } from './workspace'
import { generateArchiveTitle } from './ai-generator'
import { normalizeChatMessage } from './chat-normalization'
import { archiveMatches, messageStorageIdentity, messageStoragePath, MessageHistoryRecoveryError } from './message-storage-identity'

export interface Message {
  id: string
  from: string
  content: string
  timestamp: number
  mentions: string[]
}

interface MessageStore {
  [key: string]: Message[]
}

// In-memory message store (for MVP)
// Format: 'community:name' or 'group:name' -> Message[]
const messageStore: MessageStore = {}

function getStoreKey(type: 'community' | 'group' | 'direct', name: string): string {
  return JSON.stringify([path.resolve(getWorkspacePath()), type, name])
}

/** Generate a canonical direct message key between two agents (alphabetical order) */
export function directMessageKey(agent1: string, agent2: string): string {
  return [agent1, agent2].sort().join(':')
}

function getMessageFile(type: 'community' | 'group' | 'direct', name: string): string {
  const identity = messageStorageIdentity(type, name)
  fs.mkdirSync(identity.directory, { recursive: true })
  return messageStoragePath(identity.directory, `${identity.prefix}.json`)
}

function loadMessagesFromFile(type: 'community' | 'group' | 'direct', name: string): Message[] {
  try {
    const identity = messageStorageIdentity(type, name)
    const current = messageStoragePath(identity.directory, `${identity.prefix}.json`)
    const legacy = messageStoragePath(identity.legacyDirectory, `${identity.legacyPrefix}.json`)
    const file = fs.existsSync(current) ? current : identity.ownsLegacy ? legacy : current
    if (fs.existsSync(file)) {
      const data = fs.readFileSync(file, 'utf-8')
      const parsed = JSON.parse(data)
      if (Array.isArray(parsed)) {
        return parsed.map((message) => ({
          ...message,
          content: normalizeChatMessage(message?.content || ''),
        }))
      }
      return []
    }
  } catch (err) {
    if (err instanceof MessageHistoryRecoveryError) throw err
    console.error("Failed to load messages for %s:%s:", type, name, err)
  }
  return []
}

function saveMessagesToFile(type: 'community' | 'group' | 'direct', name: string, messages: Message[]) {
  try {
    const file = getMessageFile(type, name)
    const temporary = `${file}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`
    try {
      fs.writeFileSync(temporary, JSON.stringify(messages, null, 2), { mode: 0o600 })
      fs.renameSync(temporary, file)
    } finally {
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary)
    }
  } catch (err) {
    console.error("Failed to save messages for %s:%s:", type, name, err)
    throw err
  }
}

export function getMessages(type: 'community' | 'group' | 'direct', name: string): Message[] {
  messageStorageIdentity(type, name) // Revalidate even when the message cache is warm.
  const key = getStoreKey(type, name)

  // Load from file if not in memory
  if (!messageStore[key]) {
    messageStore[key] = loadMessagesFromFile(type, name)
  }

  return messageStore[key] || []
}

export function addMessage(
  type: 'community' | 'group' | 'direct',
  name: string,
  data: { from: string; content: string; mentions: string[] }
): Message {
  messageStorageIdentity(type, name) // Revalidate even when the message cache is warm.
  const key = getStoreKey(type, name)

  // Load existing messages if not in memory
  if (!messageStore[key]) {
    messageStore[key] = loadMessagesFromFile(type, name)
  }

  const message: Message = {
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    from: data.from,
    content: normalizeChatMessage(data.content),
    timestamp: Date.now(),
    mentions: data.mentions
  }

  const nextMessages = [...(messageStore[key] || []), message]
  saveMessagesToFile(type, name, nextMessages)
  messageStore[key] = nextMessages

  return message
}

function getArchiveFile(type: 'community' | 'group' | 'direct', name: string, timestamp: number): string {
  const identity = messageStorageIdentity(type, name)
  const archiveDir = path.join(identity.directory, 'archive')
  fs.mkdirSync(archiveDir, { recursive: true })
  const date = new Date(timestamp).toISOString().split('T')[0]
  return messageStoragePath(archiveDir, `${identity.prefix}_${date}_${timestamp}.json`)
}

export function archiveSources(type: 'community' | 'group' | 'direct', name: string) {
  const identity = messageStorageIdentity(type, name)
  const sources = [{ directory: path.join(identity.directory, 'archive'), prefix: identity.prefix }]
  if (identity.ownsLegacy && identity.directory !== identity.legacyDirectory) {
    sources.push({ directory: path.join(identity.legacyDirectory, 'archive'), prefix: identity.legacyPrefix })
  }
  return sources
}

function findArchive(type: 'community' | 'group' | 'direct', name: string, filename: string): string | undefined {
  const source = archiveSources(type, name).find(entry => archiveMatches(entry.prefix, filename))
  return source && messageStoragePath(source.directory, filename)
}

export function clearMessages(type: 'community' | 'group' | 'direct', name: string): { archived: boolean; archiveFile?: string } {
  messageStorageIdentity(type, name) // Revalidate even when the message cache is warm.
  const key = getStoreKey(type, name)
  const currentMessages = messageStore[key] || loadMessagesFromFile(type, name)

  let savedArchive: string | undefined
  // Archive current messages if any exist
  if (currentMessages.length > 0) {
    const timestamp = Date.now()
    const archiveFile = getArchiveFile(type, name, timestamp)
    try {
      fs.writeFileSync(archiveFile, JSON.stringify(currentMessages, null, 2), { flag: 'wx', mode: 0o600 })
      savedArchive = path.basename(archiveFile)
      console.log("[Messages] Archived %s messages to %s", currentMessages.length, archiveFile)
    } catch (err) {
      console.error("Failed to archive messages for %s:%s:", type, name, err)
      throw err
    }
  }

  // Clear current messages
  saveMessagesToFile(type, name, [])
  messageStore[key] = []

  return { archived: currentMessages.length > 0, archiveFile: savedArchive }
}

export async function getArchives(type: 'community' | 'group' | 'direct', name: string): Promise<Array<{ filename: string; timestamp: number; messageCount: number; title: string }>> {
  const sources = archiveSources(type, name)
  const allArchives: Array<{ filename: string; timestamp: number; messageCount: number; title: string }> = []
  for (const { directory: archiveDir, prefix } of sources) {
    if (!fs.existsSync(archiveDir)) continue
    try {
      const fileInfos = fs.readdirSync(archiveDir)
        .filter(f => archiveMatches(prefix, f))
        .map(filename => {
          const fullPath = messageStoragePath(archiveDir, filename)
          const timestampMatch = filename.match(/_(\d+)\.json$/)
          const timestamp = timestampMatch ? parseInt(timestampMatch[1]) : 0

          let messageCount = 0
          const messages: Array<{ role: 'user' | 'assistant'; content: string }> = []

          try {
            const data = JSON.parse(fs.readFileSync(fullPath, 'utf-8'))
            if (Array.isArray(data)) {
              messageCount = data.length
              // Extract messages for title generation (max first 5)
              for (const msg of data.slice(0, 5)) {
                if (msg.from && msg.content) {
                  // Map agent names to 'assistant' role, others to 'user'
                  const role = msg.from === 'user' ? 'user' : 'assistant'
                  messages.push({ role, content: msg.content })
                }
              }
            }
          } catch {
            // ignore
          }

          return { filename, timestamp, messageCount, messages }
        })
        .sort((a, b) => b.timestamp - a.timestamp) // newest first

      // Check for cached titles
      const titlesPath = path.join(archiveDir, '.titles.json')
      let cachedTitles: Record<string, string> = {}
      try {
        if (fs.existsSync(titlesPath)) {
          cachedTitles = JSON.parse(fs.readFileSync(titlesPath, 'utf-8'))
        }
      } catch {
        // ignore
      }

      // Generate titles (using cache when available)
      const archives = await Promise.all(
        fileInfos.map(async info => {
          let title = cachedTitles[info.filename]

          if (!title) {
            // Generate new title
            title = await generateArchiveTitle(info.messages)
            cachedTitles[info.filename] = title
          }

          return {
            filename: info.filename,
            timestamp: info.timestamp,
            messageCount: info.messageCount,
            title
          }
        })
      )

      // Save updated cache
      try {
        fs.writeFileSync(titlesPath, JSON.stringify(cachedTitles, null, 2))
      } catch (err) {
        console.error('Failed to save title cache:', err)
      }

      allArchives.push(...archives)
    } catch (err) {
      console.error("Failed to read archives for %s:%s:", type, name, err)
      throw err
    }
  }
  return allArchives.sort((a, b) => b.timestamp - a.timestamp)
}

export function getArchivedMessages(type: 'community' | 'group' | 'direct', name: string, filename: string): Message[] {
  const filePath = findArchive(type, name, filename)
  if (!filePath) return []

  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8')
      const parsed = JSON.parse(data)
      if (Array.isArray(parsed)) {
        return parsed.map((message) => ({
          ...message,
          content: normalizeChatMessage(message?.content || ''),
        }))
      }
      return []
    }
  } catch (err) {
    console.error("Failed to load archived messages from %s:", filename, err)
  }
  return []
}

export function deleteArchivedMessages(type: 'community' | 'group' | 'direct', name: string, filename: string): boolean {
  const filePath = findArchive(type, name, filename)
  if (!filePath) return false
  const archiveDir = path.dirname(filePath)

  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
      console.log("[Messages] Deleted archive %s", filePath)

      // Also remove from title cache
      const titlesPath = path.join(archiveDir, '.titles.json')
      if (fs.existsSync(titlesPath)) {
        try {
          const cachedTitles = JSON.parse(fs.readFileSync(titlesPath, 'utf-8'))
          delete cachedTitles[filename]
          fs.writeFileSync(titlesPath, JSON.stringify(cachedTitles, null, 2))
        } catch (err) {
          console.error('Failed to update title cache after delete:', err)
        }
      }

      return true
    }
  } catch (err) {
    console.error("Failed to delete archived messages %s:", filename, err)
  }
  return false
}
