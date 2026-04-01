import fs from 'fs'
import path from 'path'
import { getWorkspacePath } from './workspace'
import { generateArchiveTitle } from './ai-generator'
import { normalizeChatMessage } from './chat-normalization'

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

// Directory for persistent message storage (dynamic, follows active workspace)
function getMessagesDir(): string {
  const dir = path.join(getWorkspacePath(), 'SYSTEM', 'messages')
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return dir
}

function getStoreKey(type: 'community' | 'group' | 'direct' | 'direct', name: string): string {
  return `${type}:${name}`
}

/** Generate a canonical direct message key between two agents (alphabetical order) */
export function directMessageKey(agent1: string, agent2: string): string {
  return [agent1, agent2].sort().join(':')
}

function getMessageFile(type: 'community' | 'group' | 'direct' | 'direct', name: string): string {
  const subdir = type === 'community' ? 'communities' : type === 'group' ? 'groups' : 'direct'
  const dir = path.join(getMessagesDir(), subdir)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  // Sanitize name for filesystem
  const safeName = name.replace(/[^a-z0-9_-]/gi, '_').toLowerCase()
  return path.join(dir, `${safeName}.json`)
}

function loadMessagesFromFile(type: 'community' | 'group' | 'direct' | 'direct', name: string): Message[] {
  try {
    const file = getMessageFile(type, name)
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
    console.error(`Failed to load messages for ${type}:${name}:`, err)
  }
  return []
}

function saveMessagesToFile(type: 'community' | 'group' | 'direct', name: string, messages: Message[]) {
  try {
    const file = getMessageFile(type, name)
    fs.writeFileSync(file, JSON.stringify(messages, null, 2), 'utf-8')
  } catch (err) {
    console.error(`Failed to save messages for ${type}:${name}:`, err)
  }
}

export function getMessages(type: 'community' | 'group' | 'direct' | 'direct', name: string): Message[] {
  const key = getStoreKey(type, name)

  // Load from file if not in memory
  if (!messageStore[key]) {
    messageStore[key] = loadMessagesFromFile(type, name)
  }

  return messageStore[key] || []
}

export function addMessage(
  type: 'community' | 'group' | 'direct' | 'direct',
  name: string,
  data: { from: string; content: string; mentions: string[] }
): Message {
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

  messageStore[key] = [...(messageStore[key] || []), message]

  // Save to file asynchronously
  saveMessagesToFile(type, name, messageStore[key])

  return message
}

function getArchiveFile(type: 'community' | 'group' | 'direct', name: string, timestamp: number): string {
  const subdir = type === 'community' ? 'communities' : 'groups'
  const archiveDir = path.join(getMessagesDir(), subdir, 'archive')
  if (!fs.existsSync(archiveDir)) {
    fs.mkdirSync(archiveDir, { recursive: true })
  }
  const safeName = name.replace(/[^a-z0-9_-]/gi, '_').toLowerCase()
  const date = new Date(timestamp).toISOString().split('T')[0] // YYYY-MM-DD
  return path.join(archiveDir, `${safeName}_${date}_${timestamp}.json`)
}

export function clearMessages(type: 'community' | 'group' | 'direct' | 'direct', name: string): { archived: boolean; archiveFile?: string } {
  const key = getStoreKey(type, name)
  const currentMessages = messageStore[key] || loadMessagesFromFile(type, name)

  // Archive current messages if any exist
  if (currentMessages.length > 0) {
    const timestamp = Date.now()
    const archiveFile = getArchiveFile(type, name, timestamp)
    try {
      fs.writeFileSync(archiveFile, JSON.stringify(currentMessages, null, 2), 'utf-8')
      console.log(`[Messages] Archived ${currentMessages.length} messages to ${archiveFile}`)
    } catch (err) {
      console.error(`Failed to archive messages for ${type}:${name}:`, err)
      return { archived: false }
    }
  }

  // Clear current messages
  messageStore[key] = []
  saveMessagesToFile(type, name, [])

  return { archived: currentMessages.length > 0, archiveFile: currentMessages.length > 0 ? path.basename(getArchiveFile(type, name, Date.now())) : undefined }
}

export async function getArchives(type: 'community' | 'group' | 'direct', name: string): Promise<Array<{ filename: string; timestamp: number; messageCount: number; title: string }>> {
  const subdir = type === 'community' ? 'communities' : 'groups'
  const archiveDir = path.join(getMessagesDir(), subdir, 'archive')
  const safeName = name.replace(/[^a-z0-9_-]/gi, '_').toLowerCase()

  if (!fs.existsSync(archiveDir)) {
    return []
  }

  try {
    const fileInfos = fs.readdirSync(archiveDir)
      .filter(f => f.startsWith(safeName) && f.endsWith('.json'))
      .map(filename => {
        const fullPath = path.join(archiveDir, filename)
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

    return archives
  } catch (err) {
    console.error(`Failed to read archives for ${type}:${name}:`, err)
    return []
  }
}

export function getArchivedMessages(type: 'community' | 'group' | 'direct', name: string, filename: string): Message[] {
  const subdir = type === 'community' ? 'communities' : 'groups'
  const archiveDir = path.join(getMessagesDir(), subdir, 'archive')
  const filePath = path.join(archiveDir, filename)

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
    console.error(`Failed to load archived messages from ${filename}:`, err)
  }
  return []
}

export function deleteArchivedMessages(type: 'community' | 'group' | 'direct', name: string, filename: string): boolean {
  const subdir = type === 'community' ? 'communities' : 'groups'
  const archiveDir = path.join(getMessagesDir(), subdir, 'archive')
  const filePath = path.join(archiveDir, filename)

  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
      console.log(`[Messages] Deleted archive ${filePath}`)

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
    console.error(`Failed to delete archived messages ${filename}:`, err)
  }
  return false
}
