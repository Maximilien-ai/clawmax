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

export function clearMessages(type: 'community' | 'group', name: string): void {
  const key = getStoreKey(type, name)
  messageStore[key] = []
  saveMessagesToFile(type, name, [])
}
