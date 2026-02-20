import fs from 'fs'
import path from 'path'
import { WORKSPACE } from './workspace'

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

// Directory for persistent message storage
const MESSAGES_DIR = path.join(WORKSPACE, 'SYSTEM', 'messages')

// Ensure messages directory exists
if (!fs.existsSync(MESSAGES_DIR)) {
  fs.mkdirSync(MESSAGES_DIR, { recursive: true })
}

function getStoreKey(type: 'community' | 'group', name: string): string {
  return `${type}:${name}`
}

function getMessageFile(type: 'community' | 'group', name: string): string {
  const subdir = type === 'community' ? 'communities' : 'groups'
  const dir = path.join(MESSAGES_DIR, subdir)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  // Sanitize name for filesystem
  const safeName = name.replace(/[^a-z0-9_-]/gi, '_').toLowerCase()
  return path.join(dir, `${safeName}.json`)
}

function loadMessagesFromFile(type: 'community' | 'group', name: string): Message[] {
  try {
    const file = getMessageFile(type, name)
    if (fs.existsSync(file)) {
      const data = fs.readFileSync(file, 'utf-8')
      return JSON.parse(data)
    }
  } catch (err) {
    console.error(`Failed to load messages for ${type}:${name}:`, err)
  }
  return []
}

function saveMessagesToFile(type: 'community' | 'group', name: string, messages: Message[]) {
  try {
    const file = getMessageFile(type, name)
    fs.writeFileSync(file, JSON.stringify(messages, null, 2), 'utf-8')
  } catch (err) {
    console.error(`Failed to save messages for ${type}:${name}:`, err)
  }
}

export function getMessages(type: 'community' | 'group', name: string): Message[] {
  const key = getStoreKey(type, name)

  // Load from file if not in memory
  if (!messageStore[key]) {
    messageStore[key] = loadMessagesFromFile(type, name)
  }

  return messageStore[key] || []
}

export function addMessage(
  type: 'community' | 'group',
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
    content: data.content,
    timestamp: Date.now(),
    mentions: data.mentions
  }

  messageStore[key] = [...(messageStore[key] || []), message]

  // Save to file asynchronously
  saveMessagesToFile(type, name, messageStore[key])

  return message
}

function getArchiveFile(type: 'community' | 'group', name: string, timestamp: number): string {
  const subdir = type === 'community' ? 'communities' : 'groups'
  const archiveDir = path.join(MESSAGES_DIR, subdir, 'archive')
  if (!fs.existsSync(archiveDir)) {
    fs.mkdirSync(archiveDir, { recursive: true })
  }
  const safeName = name.replace(/[^a-z0-9_-]/gi, '_').toLowerCase()
  const date = new Date(timestamp).toISOString().split('T')[0] // YYYY-MM-DD
  return path.join(archiveDir, `${safeName}_${date}_${timestamp}.json`)
}

export function clearMessages(type: 'community' | 'group', name: string): { archived: boolean; archiveFile?: string } {
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

export function getArchives(type: 'community' | 'group', name: string): Array<{ filename: string; timestamp: number; messageCount: number }> {
  const subdir = type === 'community' ? 'communities' : 'groups'
  const archiveDir = path.join(MESSAGES_DIR, subdir, 'archive')
  const safeName = name.replace(/[^a-z0-9_-]/gi, '_').toLowerCase()

  if (!fs.existsSync(archiveDir)) {
    return []
  }

  try {
    const files = fs.readdirSync(archiveDir)
      .filter(f => f.startsWith(safeName) && f.endsWith('.json'))
      .map(filename => {
        const fullPath = path.join(archiveDir, filename)
        const timestampMatch = filename.match(/_(\d+)\.json$/)
        const timestamp = timestampMatch ? parseInt(timestampMatch[1]) : 0

        let messageCount = 0
        try {
          const data = JSON.parse(fs.readFileSync(fullPath, 'utf-8'))
          messageCount = Array.isArray(data) ? data.length : 0
        } catch {
          // ignore
        }

        return { filename, timestamp, messageCount }
      })
      .sort((a, b) => b.timestamp - a.timestamp) // newest first

    return files
  } catch (err) {
    console.error(`Failed to read archives for ${type}:${name}:`, err)
    return []
  }
}

export function getArchivedMessages(type: 'community' | 'group', name: string, filename: string): Message[] {
  const subdir = type === 'community' ? 'communities' : 'groups'
  const archiveDir = path.join(MESSAGES_DIR, subdir, 'archive')
  const filePath = path.join(archiveDir, filename)

  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8')
      return JSON.parse(data)
    }
  } catch (err) {
    console.error(`Failed to load archived messages from ${filename}:`, err)
  }
  return []
}
