import React, { useEffect, useState, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { byokForRequest, hasAiGenerationAccess, readStoredByokKeys } from '../lib/byok'
import {
  buildCommunicationCacheKey,
  mergeTypingAgents,
  removeRespondedAgentsFromPending,
  shouldUpdateChannelMessages,
} from '../lib/communicationMessages'
import { ProductIconCell } from '../lib/productIcons'
import { useAuth } from '../contexts/AuthContext'

interface Message {
  id: string
  from: string
  content: string
  timestamp: number
  mentions: string[]
}

interface Agent {
  id: string
  name: string
  status: 'online' | 'offline' | 'unknown'
}

interface Channel {
  name: string
  description: string | null
  tags: string[]
  type: 'community' | 'group'
  community: string | null
  channels: string[]
  members: Agent[]
}

interface Props {
  channel: Channel
  onClose: () => void
  mode?: 'overlay' | 'pane'
  onExpand?: () => void
  onMessageSent?: (mentionedAgentIds: string[], hasAll: boolean) => void
  onNavigateToDoc?: (path: string) => void
}

const groupChatMessageCache = new Map<string, Message[]>()
const groupChatArchiveCache = new Map<string, Array<{ filename: string; timestamp: number; messageCount: number; title: string }>>()

const STATUS_DOT: Record<string, string> = {
  online: 'bg-green-400',
  offline: 'bg-yellow-400',
  unknown: 'bg-gray-300',
}

// Strip OpenClaw internal data from message content (brace-depth tracking)
function cleanContent(content: string): string {
  if (!content) return content
  const lines = content.split('\n')
  const cleanedLines: string[] = []
  let braceDepth = 0
  let bracketDepth = 0

  for (const line of lines) {
    const trimmed = line.trim()

    // Inside a JSON block — track depth and skip
    if (braceDepth > 0 || bracketDepth > 0) {
      for (const ch of trimmed) {
        if (ch === '{') braceDepth++
        else if (ch === '}') braceDepth = Math.max(0, braceDepth - 1)
        else if (ch === '[') bracketDepth++
        else if (ch === ']') bracketDepth = Math.max(0, bracketDepth - 1)
      }
      continue
    }

    // Detect start of JSON block
    if (trimmed === '{' || trimmed.startsWith('{"') || trimmed.startsWith('[{') || trimmed === '[') {
      braceDepth += (trimmed.match(/\{/g) || []).length - (trimmed.match(/\}/g) || []).length
      bracketDepth += (trimmed.match(/\[/g) || []).length - (trimmed.match(/\]/g) || []).length
      if (braceDepth > 0 || bracketDepth > 0) continue
      continue
    }

    if (trimmed.match(/\[[\d;]*m/) || trimmed.match(/\x1b\[/)) continue
    if (trimmed.startsWith('🦞 OpenClaw') || trimmed.match(/^(Usage|Options|Commands|Examples|Docs|Available fields|Unknown JSON|GraphQL|\(Command exited|Command still|Process exited|Successfully wrote|store:)/)) continue
    if (trimmed.match(/\{"type"\s*:\s*"/)) continue
    if (trimmed.match(/^\d{1,2}:\d{2}:\d{2}\s*(AM|PM)?\s*$/)) continue
    if (trimmed.match(/^[}\]],?\s*$/)) continue

    cleanedLines.push(line)
  }

  return cleanedLines.join('\n').replace(/\n{3,}/g, '\n\n').trim() || content
}

function linkifyWorkspaceFiles(content: string): string {
  return content
    .replace(/(^|[\s(])([A-Za-z0-9_./-]+\.(?:md|txt|json|csv|pdf|html|yml|yaml))(?!\])/gm, (_m, prefix, target) => {
      if (!target.includes('/')) {
        return `${prefix}[${target}](workspace-file:${target})`
      }
      if (/^(AGENTS|GROUPS|COMMUNITIES|WORKFLOWS|SYSTEM|ORG)\//.test(target)) {
        return `${prefix}[${target}](workspace-file:${target})`
      }
      return `${prefix}${target}`
    })
}

function extractWorkspaceFileMentions(content: string): string[] {
  const matches = Array.from(
    content.matchAll(/\b(?:AGENTS|GROUPS|COMMUNITIES|WORKFLOWS|SYSTEM|ORG)\/[A-Za-z0-9_./-]+\.(?:md|txt|json|csv|pdf|html|yml|yaml)\b|\b[A-Za-z0-9][A-Za-z0-9._-]*\.(?:md|txt|json|csv|pdf|html|yml|yaml)\b/g)
  ).map((m) => m[0])
  return Array.from(new Set(matches))
}

function GroupChatPanel({ channel, onClose, mode = 'overlay', onExpand, onMessageSent, onNavigateToDoc }: Props) {
  const { config } = useAuth()
  const chatEnabled = hasAiGenerationAccess(config)
  const cacheKey = buildCommunicationCacheKey(channel.type, channel.name)
  const [messages, setMessages] = useState<Message[]>(() => groupChatMessageCache.get(cacheKey) || [])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(() => (groupChatMessageCache.get(cacheKey) || []).length === 0)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showMentions, setShowMentions] = useState(false)
  const [mentionQuery, setMentionQuery] = useState('')
  const [mentionPosition, setMentionPosition] = useState(0)
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0)
  const [expandedMentionGroup, setExpandedMentionGroup] = useState<string | null>(null)
  const [typingAgents, setTypingAgents] = useState<Set<string>>(new Set())
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [showArchives, setShowArchives] = useState(false)
  const [archives, setArchives] = useState<Array<{ filename: string; timestamp: number; messageCount: number; title: string }>>(
    () => groupChatArchiveCache.get(cacheKey) || []
  )
  const [viewingArchive, setViewingArchive] = useState<{ filename: string; messages: Message[] } | null>(null)
  const [copyFeedback, setCopyFeedback] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [isListening, setIsListening] = useState(false)
  const [inputHistory, setInputHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const sendButtonRef = useRef<HTMLButtonElement>(null)
  const recognitionRef = useRef<any>(null)
  const userScrolledUp = useRef(false)
  const prevMessageCount = useRef(0)
  const userJustSent = useRef(false)
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingReplyAgentsRef = useRef<Set<string>>(new Set())
  const activeWorkflowAgentsRef = useRef<Set<string>>(new Set())

  function syncTypingAgents() {
    setTypingAgents(mergeTypingAgents(pendingReplyAgentsRef.current, activeWorkflowAgentsRef.current))
  }

  useEffect(() => {
    fetchMessages()
    fetchArchivesList()
    fetchActiveWorkflows()
    // Poll for new messages every 2 seconds
    const interval = setInterval(fetchMessages, 3000)
    // Check for active workflows every 5 seconds
    const workflowInterval = setInterval(fetchActiveWorkflows, 5000)

    // Initialize speech recognition
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition()
      recognitionRef.current.continuous = false
      recognitionRef.current.interimResults = false
      recognitionRef.current.lang = 'en-US'

      recognitionRef.current.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript
        setInput(transcript)
        setIsListening(false)
        // Focus send button after transcription
        setTimeout(() => sendButtonRef.current?.focus(), 100)
      }

      recognitionRef.current.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error)
        setIsListening(false)
        setError(`Voice input error: ${event.error}`)
        setTimeout(() => setError(null), 3000)
      }

      recognitionRef.current.onend = () => {
        setIsListening(false)
      }
    }

    return () => {
      clearInterval(interval)
      clearInterval(workflowInterval)
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
      if (recognitionRef.current) {
        recognitionRef.current.stop()
      }
    }
  }, [channel.name])

  useEffect(() => {
    // Only auto-scroll if user is near bottom or just sent a message
    // This prevents the input field from being disrupted on mobile during polling
    if (userJustSent.current || !userScrolledUp.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
      userJustSent.current = false
    }
    prevMessageCount.current = messages.length
  }, [messages])

  async function fetchActiveWorkflows() {
    try {
      // Get all workflows
      const workflowsRes = await fetch('/api/workflows')
      const workflowsData = await workflowsRes.json()
      const workflows = workflowsData.workflows || []

      // Find workflows targeting this channel
      const relevantWorkflows = workflows.filter((w: any) => {
        if (channel.type === 'community') {
          return w.targeting.communities.includes(channel.name)
        } else {
          return w.targeting.groups.includes(channel.name)
        }
      })

      // Check if any have running executions
      for (const workflow of relevantWorkflows) {
        const execRes = await fetch(`/api/workflows/${workflow.id}/executions?limit=1`)
        const execData = await execRes.json()
        const executions = execData.executions || []

        if (executions.length > 0) {
          const latestExec = executions[0]
          if (latestExec.status === 'running' || latestExec.status === 'pending') {
            // Fetch full execution details to get participants
            const detailsRes = await fetch(`/api/workflows/${workflow.id}/executions/${latestExec.id}`)
            const fullExec = await detailsRes.json()

            if (fullExec.participants) {
              // Find participants that are still pending or running
              const workingAgents = new Set<string>()
              for (const participant of fullExec.participants) {
                if (participant.status === 'pending' || participant.status === 'running') {
                  // Check if this agent is in the current channel
                  const agentInChannel = channel.members.some(m => m.id === participant.agentId)
                  if (agentInChannel) {
                    workingAgents.add(participant.agentId)
                  }
                }
              }

              if (workingAgents.size > 0) {
                activeWorkflowAgentsRef.current = workingAgents
                syncTypingAgents()
                return // Found active workflow, stop checking others
              }
            }
          }
        }
      }

      // No active workflows. Keep any pending reply indicators until real replies land or timeout.
      activeWorkflowAgentsRef.current = new Set()
      syncTypingAgents()
    } catch (err) {
      console.error('[Typing Indicators] Failed to fetch active workflows:', err)
    }
  }

  async function fetchMessages() {
    // Only show loading on initial fetch, not on polling
    if (messages.length === 0) {
      setLoading(true)
      setError(null)
    }
    try {
      const endpoint = channel.type === 'community'
        ? `/api/communities/${encodeURIComponent(channel.name)}/messages`
        : `/api/groups/${encodeURIComponent(channel.name)}/messages`
      const r = await fetch(endpoint)
      const data = await r.json()
      const newMessages = data.messages || []
      groupChatMessageCache.set(cacheKey, newMessages)

      // Clear typing indicators for agents who have responded
      // Only update messages state if content actually changed (prevents flicker)
      setMessages(prevMessages => {
        const changed = shouldUpdateChannelMessages(prevMessages, newMessages)

        if (changed) {
          pendingReplyAgentsRef.current = removeRespondedAgentsFromPending(
            pendingReplyAgentsRef.current,
            newMessages,
            prevMessages.length,
            channel.members
          )
          syncTypingAgents()
          return newMessages
        }
        return prevMessages // Same reference — no re-render
      })
    } catch (e) {
      setError(String(e))
    } finally {
      if (messages.length === 0) {
        setLoading(false)
      }
    }
  }

  async function sendMessage() {
    if (!input.trim() || sending) return
    if (!chatEnabled) {
      setError('Group chat is disabled because no AI execution path is configured. Open BYOK or Keys & Secrets first.')
      return
    }

    const userMessage = input.trim()

    // Add to input history
    setInputHistory(prev => [...prev, userMessage])
    setHistoryIndex(-1)

    // For bulk chat (temporary ad-hoc groups), auto-mention all members
    const isBulkChat = channel.tags?.includes('bulk-chat')

    // Extract @mentions
    const mentionRegex = /@(\w+)/g
    const matches = Array.from(userMessage.matchAll(mentionRegex))
    const mentionedNames = matches.map(m => m[1])

    // Check for @all
    const hasAll = mentionedNames.some(name => name.toLowerCase() === 'all')

    const hasExplicitMentions = mentionedNames.length > 0

    // Default channel posts to all members unless the user narrows with explicit @mentions.
    const mentionedAgents = (!hasExplicitMentions || hasAll || isBulkChat)
      ? channel.members
      : channel.members.filter(agent =>
          mentionedNames.some(name =>
            agent.name.toLowerCase().includes(name.toLowerCase()) ||
            agent.id.toLowerCase() === name.toLowerCase()
          )
        )
    setInput('')
    setSending(true)
    setError(null)
    setShowMentions(false)
    userJustSent.current = true

    try {
      const endpoint = channel.type === 'community'
        ? `/api/communities/${encodeURIComponent(channel.name)}/messages`
        : `/api/groups/${encodeURIComponent(channel.name)}/messages`

      const r = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: userMessage,
          mentions: mentionedAgents.map(a => a.id),
          byok: byokForRequest(),
        }),
      })

      if (r.ok) {
        // Show typing indicators for mentioned agents
        if (mentionedAgents.length > 0) {
          pendingReplyAgentsRef.current = new Set(mentionedAgents.map(a => a.id))
          syncTypingAgents()
          // Clear any previous timeout
          if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
          // Auto-clear typing indicators after 30 seconds to prevent stuck state
          typingTimeoutRef.current = setTimeout(() => {
            pendingReplyAgentsRef.current = new Set()
            syncTypingAgents()
          }, 30000)
        }
        fetchMessages()
        // Focus back on input after sending
        setTimeout(() => inputRef.current?.focus(), 0)
        // Notify parent about message sent (for status refresh and toasts)
        onMessageSent?.(mentionedAgents.map(a => a.id), !hasExplicitMentions || hasAll)
      } else {
        const data = await r.json()
        setError(data.error || 'Failed to send message')
      }
    } catch (e) {
      setError(String(e))
    } finally {
      setSending(false)
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const text = e.target.value
    setInput(text)

    // Check for @ mentions
    const cursorPos = e.target.selectionStart || 0
    const textBeforeCursor = text.substring(0, cursorPos)
    const lastAtIndex = textBeforeCursor.lastIndexOf('@')

    if (lastAtIndex !== -1 && lastAtIndex === cursorPos - 1) {
      setShowMentions(true)
      setMentionQuery('')
      setMentionPosition(lastAtIndex)
      setSelectedMentionIndex(0)
    } else if (lastAtIndex !== -1) {
      const afterAt = textBeforeCursor.substring(lastAtIndex + 1)
      if (/^\w*$/.test(afterAt)) {
        setShowMentions(true)
        setMentionQuery(afterAt)
        setMentionPosition(lastAtIndex)
        setSelectedMentionIndex(0)
      } else {
        setShowMentions(false)
      }
    } else {
      setShowMentions(false)
    }
  }

  function insertMention(agentName: string) {
    const before = input.substring(0, mentionPosition)
    const after = input.substring(mentionPosition + mentionQuery.length + 1)
    setInput(`${before}@${agentName} ${after}`)
    setShowMentions(false)
    setExpandedMentionGroup(null)
  }

  // Build mention list: @all first, then grouped by role, then individuals
  const filteredMentionAgents = showMentions
    ? (() => {
        const matchingAgents = channel.members.filter(agent =>
          agent.name.toLowerCase().includes(mentionQuery.toLowerCase()) ||
          agent.id.toLowerCase().includes(mentionQuery.toLowerCase())
        )

        const mentions: Array<{ id: string; name: string; status: string; isAll?: boolean; isGroup?: boolean; count?: number; agentIds?: string[] }> = []

        // @all option
        if ('all'.includes(mentionQuery.toLowerCase())) {
          mentions.push({ id: 'all', name: 'all', status: 'online', isAll: true })
        }

        // Group agents by base name (strip trailing numbers: engineer1,engineer2 → Engineer)
        const roleGroups = new Map<string, typeof matchingAgents>()
        for (const agent of matchingAgents) {
          // Extract base name: "Engineer 1" → "Engineer", "engineer1" → "engineer"
          const baseName = (agent.name || agent.id).replace(/\s*\d+$/, '').trim()
          const key = baseName.toLowerCase()
          if (!roleGroups.has(key)) roleGroups.set(key, [])
          roleGroups.get(key)!.push(agent)
        }

        // Add grouped entries (only group if 2+ agents share a role)
        for (const [key, group] of roleGroups) {
          if (group.length > 1) {
            const baseName = (group[0].name || group[0].id).replace(/\s*\d+$/, '').trim()
            const groupId = `group-${baseName.toLowerCase()}`

            if (expandedMentionGroup === groupId) {
              // Show individual agents when expanded
              for (const agent of group) {
                mentions.push({ ...agent, isExpanded: true } as any)
              }
            } else {
              mentions.push({
                id: groupId,
                name: baseName,
                status: 'online',
                isGroup: true,
                count: group.length,
                agentIds: group.map(a => a.id)
              })
            }
          } else {
            mentions.push(group[0])
          }
        }

        return mentions
      })()
    : []

  function toggleVoiceInput() {
    if (!recognitionRef.current) {
      setError('Voice input not supported in this browser')
      setTimeout(() => setError(null), 3000)
      return
    }

    if (isListening) {
      recognitionRef.current.stop()
      setIsListening(false)
    } else {
      try {
        recognitionRef.current.start()
        setIsListening(true)
        setError(null)
      } catch (err) {
        console.error('Failed to start recognition:', err)
        setError('Failed to start voice input')
        setTimeout(() => setError(null), 3000)
      }
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (showMentions && filteredMentionAgents.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedMentionIndex((prev) =>
          prev < filteredMentionAgents.length - 1 ? prev + 1 : prev
        )
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedMentionIndex((prev) => prev > 0 ? prev - 1 : 0)
      } else if (e.key === 'Tab') {
        e.preventDefault()
        const selected = filteredMentionAgents[selectedMentionIndex]
        if (selected && 'isGroup' in selected && (selected as any).isGroup) {
          // Expand group to show individual agents
          setExpandedMentionGroup(selected.id)
          setSelectedMentionIndex(0)
        } else if (expandedMentionGroup) {
          // Collapse back to grouped view
          setExpandedMentionGroup(null)
          setSelectedMentionIndex(0)
        }
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const selected = filteredMentionAgents[selectedMentionIndex]
        if (selected && 'isGroup' in selected && (selected as any).isGroup) {
          insertMention(selected.name)
        } else if (selected && (selected as any).isExpanded) {
          // Individual from expanded group — use ID for exact match
          insertMention(selected.id)
        } else {
          insertMention(filteredMentionAgents[selectedMentionIndex].name)
        }
        setExpandedMentionGroup(null)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        if (expandedMentionGroup) {
          setExpandedMentionGroup(null)
        } else {
          setShowMentions(false)
        }
      }
    } else if (e.key === 'Enter') {
      e.preventDefault()
      sendMessage()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (inputHistory.length > 0) {
        const newIndex = historyIndex === -1
          ? inputHistory.length - 1
          : Math.max(0, historyIndex - 1)
        setHistoryIndex(newIndex)
        setInput(inputHistory[newIndex])
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (historyIndex !== -1) {
        const newIndex = historyIndex + 1
        if (newIndex >= inputHistory.length) {
          setHistoryIndex(-1)
          setInput('')
        } else {
          setHistoryIndex(newIndex)
          setInput(inputHistory[newIndex])
        }
      }
    }
  }

  async function handleClearChat() {
    try {
      const endpoint = channel.type === 'community'
        ? `/api/communities/${encodeURIComponent(channel.name)}/messages`
        : `/api/groups/${encodeURIComponent(channel.name)}/messages`

      const r = await fetch(endpoint, { method: 'DELETE' })
      if (r.ok) {
        setMessages([])
        groupChatMessageCache.set(cacheKey, [])
        setShowClearConfirm(false)
        setInputHistory([]) // Clear input history when chat is archived
        setHistoryIndex(-1)
        fetchMessages()
        // Refresh archives list to show the new archive
        const archivesEndpoint = channel.type === 'community'
          ? `/api/communities/${encodeURIComponent(channel.name)}/archives`
          : `/api/groups/${encodeURIComponent(channel.name)}/archives`
        const archivesR = await fetch(archivesEndpoint)
        const archivesData = await archivesR.json()
        const nextArchives = archivesData.archives || []
        groupChatArchiveCache.set(cacheKey, nextArchives)
        setArchives(nextArchives)
      }
    } catch (err) {
      console.error('Failed to clear messages:', err)
    }
  }

  async function fetchArchives() {
    try {
      const endpoint = channel.type === 'community'
        ? `/api/communities/${encodeURIComponent(channel.name)}/archives`
        : `/api/groups/${encodeURIComponent(channel.name)}/archives`

      const r = await fetch(endpoint)
      const data = await r.json()
      const nextArchives = data.archives || []
      groupChatArchiveCache.set(cacheKey, nextArchives)
      setArchives(nextArchives)
      setShowArchives(true)
    } catch (err) {
      console.error('Failed to fetch archives:', err)
    }
  }

  async function fetchArchivesList() {
    try {
      const endpoint = channel.type === 'community'
        ? `/api/communities/${encodeURIComponent(channel.name)}/archives`
        : `/api/groups/${encodeURIComponent(channel.name)}/archives`

      const r = await fetch(endpoint)
      const data = await r.json()
      const nextArchives = data.archives || []
      groupChatArchiveCache.set(cacheKey, nextArchives)
      setArchives(nextArchives)
    } catch (err) {
      console.error('Failed to fetch archives list:', err)
    }
  }

  async function deleteArchive(filename: string) {
    try {
      const endpoint = channel.type === 'community'
        ? `/api/communities/${encodeURIComponent(channel.name)}/archives/${filename}`
        : `/api/groups/${encodeURIComponent(channel.name)}/archives/${filename}`

      await fetch(endpoint, { method: 'DELETE' })
      const nextArchives = archives.filter(a => a.filename !== filename)
      groupChatArchiveCache.set(cacheKey, nextArchives)
      setArchives(nextArchives)
      setDeleteConfirm(null)
      if (viewingArchive?.filename === filename) {
        setViewingArchive(null)
      }
    } catch (err) {
      console.error('Failed to delete archive:', err)
    }
  }

  async function viewArchive(filename: string) {
    try {
      const endpoint = channel.type === 'community'
        ? `/api/communities/${encodeURIComponent(channel.name)}/archives/${filename}`
        : `/api/groups/${encodeURIComponent(channel.name)}/archives/${filename}`

      const r = await fetch(endpoint)
      const data = await r.json()
      setViewingArchive({ filename, messages: data.messages || [] })
      setShowArchives(false)
    } catch (err) {
      console.error('Failed to load archive:', err)
    }
  }

  const isOverlay = mode === 'overlay'
  const isBulkChat = channel.tags?.includes('bulk-chat')
  const renderMarkdown = (content: string, clean = false) => (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: ({ href, children }) => {
          if (href?.startsWith('workspace-file:') && onNavigateToDoc) {
            const file = href.replace('workspace-file:', '')
            return (
              <button
                type="button"
                onClick={() => onNavigateToDoc(file)}
                className="text-sky-600 hover:text-sky-700 dark:text-sky-400 dark:hover:text-sky-300 underline"
              >
                {children}
              </button>
            )
          }
          return <a href={href} target="_blank" rel="noreferrer">{children}</a>
        },
      }}
    >
      {linkifyWorkspaceFiles(clean ? cleanContent(content) : content)}
    </ReactMarkdown>
  )

  return (
    <div
      className={isOverlay ? "fixed inset-0 z-50 flex items-end justify-end bg-black/20" : "h-full flex flex-col"}
      onClick={isOverlay && !isBulkChat ? onClose : undefined}
    >
      <div className={`bg-white dark:bg-gray-800 h-full ${isOverlay ? 'w-full sm:w-[480px] shadow-2xl' : 'w-full'} flex flex-col`} onClick={(e) => isOverlay && e.stopPropagation()}>
        {/* Header */}
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div className="flex-1 min-w-0">
            <h2 className="text-sm sm:text-base font-semibold text-gray-800 dark:text-gray-200 truncate">
              <span className="inline-flex items-center gap-2">
                <ProductIconCell
                  iconName={channel.type === 'community' ? 'community' : 'group'}
                  label={channel.type === 'community' ? 'Community' : 'Group'}
                  size="sm"
                  className="border-transparent bg-transparent text-current"
                />
                {channel.tags?.includes('bulk-chat') && channel.description ? channel.description : channel.name}
              </span>
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {channel.members.length} group member{channel.members.length !== 1 ? 's' : ''}
              {channel.tags?.includes('bulk-chat') && <span className="ml-2 text-blue-500">• Auto-mentions all members</span>}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={onClose}
              className="text-xs px-2 py-1.5 text-gray-600 hover:bg-gray-100 rounded transition-colors dark:bg-gray-800 dark:hover:bg-gray-700 inline-flex"
              title="Close chat"
            >
              Cancel
            </button>
            <button
              onClick={fetchArchives}
              disabled={archives.length === 0}
              className={`text-xs px-2 py-1.5 rounded transition-colors hidden sm:inline-flex ${
                archives.length === 0
                  ? 'text-gray-300 cursor-not-allowed'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
              title={archives.length === 0 ? 'No archived chats yet' : 'View archived chats'}
            >
              <span className="inline-flex items-center gap-1">
                <ProductIconCell iconName="history" label="History" size="sm" className="border-transparent bg-transparent text-current" />
                History
              </span>
            </button>
            <button
              onClick={() => setShowClearConfirm(true)}
              className="text-xs px-2 py-1.5 text-gray-600 hover:bg-gray-100 rounded transition-colors dark:bg-gray-800 dark:hover:bg-gray-700 hidden sm:inline-flex"
              title="Clear chat (archives first)"
              disabled={messages.length === 0}
            >
              <span className="inline-flex items-center gap-1">
                <ProductIconCell iconName="delete" label="Clear" size="sm" className="border-transparent bg-transparent text-current" />
                Clear
              </span>
            </button>
            {mode === 'pane' && onExpand && (
              <button
                onClick={onExpand}
                className="text-xs px-2 py-1.5 text-gray-600 hover:bg-gray-100 rounded transition-colors dark:bg-gray-800 dark:hover:bg-gray-700 hidden sm:inline-flex"
                title="Expand to full view"
              >
                <span className="inline-flex items-center gap-1">
                  <ProductIconCell iconName="expand" label="Expand" size="sm" className="border-transparent bg-transparent text-current" />
                  Expand
                </span>
              </button>
            )}
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors text-xl leading-none p-2 -mr-1 min-w-[40px] min-h-[40px] flex items-center justify-center"
            >
              <ProductIconCell iconName="close" label="Close" size="sm" className="border-transparent bg-transparent text-current" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div
          ref={messagesContainerRef}
          className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-3"
          onScroll={() => {
            const el = messagesContainerRef.current
            if (el) {
              // User is "scrolled up" if more than 100px from bottom
              userScrolledUp.current = el.scrollHeight - el.scrollTop - el.clientHeight > 100
            }
          }}
        >
          {loading && (
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <span className="animate-spin">↻</span> Loading messages…
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          {!loading && messages.length === 0 && (
            <p className="text-sm text-gray-400 text-center mt-8">
              No messages yet. Start a conversation below.
            </p>
          )}

          {messages.map((msg) => (
            <div key={msg.id} className="bg-gray-100 rounded-lg px-4 py-2.5 dark:bg-gray-800">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{msg.from}</span>
                <span className="text-xs text-gray-400">
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              {msg.from !== 'User' ? (
                <div className="text-sm prose prose-sm dark:prose-invert max-w-none break-words [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                  {renderMarkdown(msg.content, true)}
                </div>
              ) : (
                <div className="text-sm prose prose-sm dark:prose-invert max-w-none break-words [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                  {renderMarkdown(msg.content)}
                </div>
              )}
              {onNavigateToDoc && extractWorkspaceFileMentions(msg.content).length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400">Files:</span>
                  {extractWorkspaceFileMentions(msg.content).map((file) => (
                    <button
                      key={file}
                      type="button"
                      onClick={() => onNavigateToDoc(file)}
                      className="text-[11px] px-2 py-1 rounded-full bg-sky-100 text-sky-700 hover:bg-sky-200 dark:bg-sky-900/30 dark:text-sky-300 dark:hover:bg-sky-900/50"
                    >
                      {file}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}

          {/* Typing indicators */}
          {Array.from(typingAgents).map((agentId) => {
            const agent = channel.members.find(a => a.id === agentId)
            return agent ? (
              <div key={`typing-${agentId}`} className="bg-gray-100 rounded-lg px-4 py-2.5 border-l-2 border-sky-400 dark:bg-gray-800">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{agent.name}</span>
                  <span className="flex gap-0.5">
                    <span className="w-1.5 h-1.5 bg-sky-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 bg-sky-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 bg-sky-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </span>
                </div>
              </div>
            ) : null
          })}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-t border-gray-100 shrink-0">
          {!chatEnabled && (
            <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-800 dark:bg-red-900/20 dark:text-red-100">
              <div className="font-medium">Group chat is disabled because no AI execution path is configured</div>
              <div className="mt-1 text-xs opacity-90">
                This will fail until you add a model key and choose a preferred model in this browser or through a usable shared execution path.
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => window.dispatchEvent(new CustomEvent('open-workspaces-integrations', { detail: { step: 'models', focus: 'preferred-model' } }))}
                  className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-800 hover:bg-red-100 dark:border-red-700 dark:bg-transparent dark:text-red-200 dark:hover:bg-red-900/30"
                >
                  Open BYOK
                </button>
                <button
                  type="button"
                  onClick={() => window.dispatchEvent(new CustomEvent('navigate-to-page', { detail: { page: 'keys' } }))}
                  className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-800 hover:bg-red-100 dark:border-red-700 dark:bg-transparent dark:text-red-200 dark:hover:bg-red-900/30"
                >
                  Open Keys & Secrets
                </button>
              </div>
            </div>
          )}

          <div className="relative">
            {/* @Mention Dropdown */}
            {showMentions && filteredMentionAgents.length > 0 && (
              <div className="absolute bottom-full left-0 mb-2 w-full bg-white dark:bg-gray-800 border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto z-10 dark:border-gray-700">
                {filteredMentionAgents.map((agent, index) => {
                  const isAll = 'isAll' in agent && agent.isAll
                  const isGroup = 'isGroup' in agent && (agent as any).isGroup
                  return (
                    <button
                      key={agent.id}
                      onClick={() => {
                        if (isGroup) {
                          // Tap on group: expand to show individuals
                          setExpandedMentionGroup(agent.id)
                          setSelectedMentionIndex(0)
                        } else {
                          // Use agent ID for exact matching (avoids partial name matches)
                          insertMention((agent as any).isExpanded ? agent.id : agent.name)
                          setExpandedMentionGroup(null)
                        }
                      }}
                      className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 ${
                        index === selectedMentionIndex
                          ? 'bg-sky-100 text-sky-900 dark:bg-sky-900 dark:text-sky-100'
                          : 'hover:bg-sky-50 text-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                      } ${isAll ? 'font-semibold border-b border-gray-100 dark:border-gray-700' : ''}`}
                    >
                      {!isAll && !isGroup && (
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[agent.status]}`} />
                      )}
                      {isGroup && (
                        <ProductIconCell iconName="group" label="Group mention" size="sm" className="border-transparent bg-transparent text-current" />
                      )}
                      <span className="font-medium">
                        {isAll ? '@all' : `@${agent.name}`}
                      </span>
                      {isGroup && (
                        <span className="text-xs text-sky-600 dark:text-sky-400 ml-auto flex items-center gap-1">
                          {(agent as any).count} agent{(agent as any).count !== 1 ? 's' : ''}
                          <span className="text-gray-400 text-[10px]">Tab ▸</span>
                        </span>
                      )}
                      {(agent as any).isExpanded && (
                        <span className="text-xs text-gray-400 ml-auto">individual</span>
                      )}
                      {!isAll && !isGroup && (
                        <span className="text-xs text-gray-400 dark:text-gray-500">({agent.id})</span>
                      )}
                      {isAll && (
                        <span className="text-xs text-gray-500 dark:text-gray-400 ml-auto">
                          {channel.members.length} agent{channel.members.length !== 1 ? 's' : ''}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={toggleVoiceInput}
                disabled={sending}
                className={`p-2 rounded-lg transition-colors text-sm font-medium shrink-0 ${
                  isListening
                    ? 'bg-red-500 text-white hover:bg-red-600 animate-pulse'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                } disabled:bg-gray-50 dark:disabled:bg-gray-800 disabled:text-gray-300 dark:disabled:text-gray-500 disabled:cursor-not-allowed`}
                title={isListening ? 'Stop listening' : 'Start voice input'}
              >
                {isListening ? (
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                )}
              </button>
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder={isListening ? "Listening..." : "Type or speak... posts to everyone by default, or use @name"}
                className="flex-1 px-4 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-transparent disabled:bg-gray-50 disabled:cursor-not-allowed dark:border-gray-700 dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                disabled={sending || isListening || !chatEnabled}
              />
              <button
                ref={sendButtonRef}
                onClick={sendMessage}
                disabled={!input.trim() || sending || !chatEnabled}
                className="px-4 py-2 text-sm rounded-lg bg-sky-600 text-white hover:bg-sky-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
              >
                {sending ? 'Sending...' : 'Send'}
              </button>
            </div>
            <div className="mt-2">
              <span className="text-xs text-gray-400 dark:text-gray-500">
                Posts to everyone by default. Use @name to narrow or @all to be explicit.
              </span>
            </div>
          </div>
        </div>

        {/* Clear Confirmation Modal */}
        {showClearConfirm && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-10">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-sm mx-4 shadow-xl">
              <h3 className="text-lg font-semibold text-gray-800 mb-2 dark:text-gray-200">Clear Chat?</h3>
              <p className="text-sm text-gray-600 mb-4">
                This will archive all current messages and start a fresh chat. You can view archived chats anytime from History.
              </p>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setShowClearConfirm(false)}
                  className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded transition-colors dark:bg-gray-800 dark:hover:bg-gray-700"
                >
                  Cancel
                </button>
                <button
                  onClick={handleClearChat}
                  className="px-4 py-2 text-sm bg-red-600 text-white hover:bg-red-700 rounded transition-colors"
                >
                  Clear & Archive
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Archives List Modal */}
        {showArchives && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-10">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md mx-4 shadow-xl max-h-[80%] flex flex-col">
              <h3 className="text-lg font-semibold text-gray-800 mb-4 dark:text-gray-200">Chat History</h3>
              {archives.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">No archived chats</p>
              ) : (
                <div className="flex-1 overflow-y-auto space-y-2">
                  {archives.map(archive => (
                    <div
                      key={archive.filename}
                      className="flex items-start gap-2 border border-gray-200 rounded hover:bg-gray-50 transition-colors dark:border-gray-700 dark:bg-gray-900 dark:hover:bg-gray-700"
                    >
                      <button
                        onClick={() => viewArchive(archive.filename)}
                        className="flex-1 text-left p-3"
                      >
                        <div className="text-sm font-medium">
                          {archive.title || 'Untitled conversation'}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {new Date(archive.timestamp).toLocaleDateString()} • {archive.messageCount} messages
                        </div>
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeleteConfirm(archive.filename); }}
                        className="p-3 text-red-400 hover:text-red-600 transition-colors"
                        title="Delete archive"
                      >
                        <ProductIconCell iconName="delete" label="Delete archive" size="sm" className="border-transparent bg-transparent text-current" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <button
                onClick={() => setShowArchives(false)}
                className="mt-4 px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded transition-colors w-full dark:bg-gray-800 dark:hover:bg-gray-700"
              >
                Close
              </button>
            </div>
          </div>
        )}

        {/* Archive Viewer Modal */}
        {viewingArchive && (
          <div className="absolute inset-0 bg-white dark:bg-gray-800 z-10 flex flex-col">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
              <div className="flex-1">
                <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200">
                  <span className="inline-flex items-center gap-2">
                    <ProductIconCell iconName="history" label="Archive" size="sm" className="border-transparent bg-transparent text-current" />
                    {new Date(parseInt(viewingArchive.filename.match(/_(\d+)\.json$/)?.[1] || '0')).toLocaleDateString()}
                  </span>
                </h3>
                <p className="text-xs text-gray-400">{viewingArchive.messages.length} messages</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const text = viewingArchive.messages
                      .map(m => `[${new Date(m.timestamp).toLocaleString()}] ${m.from}: ${m.content}`)
                      .join('\n\n')
                    navigator.clipboard.writeText(text)
                    setCopyFeedback(true)
                    setTimeout(() => setCopyFeedback(false), 2000)
                  }}
                  className="text-xs px-2 py-1 text-gray-600 hover:bg-gray-100 rounded transition-colors dark:bg-gray-800 dark:hover:bg-gray-700"
                  title="Copy to clipboard"
                >
                  <span className="inline-flex items-center gap-1">
                    <ProductIconCell iconName="clone" label="Copy" size="sm" className="border-transparent bg-transparent text-current" />
                    Copy
                  </span>
                </button>
                <button
                  onClick={() => {
                    const text = viewingArchive.messages
                      .map(m => `[${new Date(m.timestamp).toLocaleString()}] ${m.from}: ${m.content}`)
                      .join('\n\n')
                    const blob = new Blob([text], { type: 'text/plain' })
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url
                    a.download = `${channel.name}_${new Date(parseInt(viewingArchive.filename.match(/_(\d+)\.json$/)?.[1] || '0')).toISOString().split('T')[0]}.txt`
                    a.click()
                    URL.revokeObjectURL(url)
                  }}
                  className="text-xs px-2 py-1 text-gray-600 hover:bg-gray-100 rounded transition-colors dark:bg-gray-800 dark:hover:bg-gray-700"
                  title="Download as text file"
                >
                  <span className="inline-flex items-center gap-1">
                    <ProductIconCell iconName="export" label="Download" size="sm" className="border-transparent bg-transparent text-current" />
                    Download
                  </span>
                </button>
                <button
                  onClick={() => setViewingArchive(null)}
                  className="text-gray-400 hover:text-gray-600 transition-colors text-lg"
                >
                  <ProductIconCell iconName="close" label="Close" size="sm" className="border-transparent bg-transparent text-current" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
              {viewingArchive.messages.map((msg) => (
                <div key={msg.id} className="bg-gray-100 rounded-lg px-4 py-2.5 dark:bg-gray-800">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{msg.from}</span>
                    <span className="text-xs text-gray-400">
                      {new Date(msg.timestamp).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-sm text-gray-800 whitespace-pre-wrap break-words dark:text-gray-200">{msg.content}</p>
                </div>
              ))}
            </div>
            <div className="px-6 py-4 border-t border-gray-100">
              <button
                onClick={() => setViewingArchive(null)}
                className="w-full px-4 py-2 text-sm bg-gray-600 text-white hover:bg-gray-700 rounded transition-colors"
              >
                Back to Current Chat
              </button>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {deleteConfirm && (
          <div className="absolute inset-0 bg-black/20 flex items-center justify-center z-30">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-sm mx-4">
              <h3 className="text-base font-semibold mb-2">Delete Archive?</h3>
              <p className="text-sm text-gray-600 mb-4">
                This archive will be permanently deleted. This action cannot be undone.
              </p>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded transition-colors dark:bg-gray-800 dark:hover:bg-gray-700"
                >
                  Cancel
                </button>
                <button
                  onClick={() => deleteArchive(deleteConfirm)}
                  className="px-4 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Copy Feedback Toast */}
        {copyFeedback && (
          <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-green-600 text-white px-4 py-2 rounded-lg shadow-lg text-sm z-20">
            ✓ Messages copied to clipboard
          </div>
        )}
      </div>
    </div>
  )
}

function areChannelsEquivalent(previous: Channel, next: Channel) {
  return previous.name === next.name && previous.type === next.type
}

export default React.memo(GroupChatPanel, (previousProps, nextProps) => (
  areChannelsEquivalent(previousProps.channel, nextProps.channel) &&
  previousProps.mode === nextProps.mode &&
  previousProps.onExpand === nextProps.onExpand &&
  previousProps.onClose === nextProps.onClose &&
  previousProps.onMessageSent === nextProps.onMessageSent &&
  previousProps.onNavigateToDoc === nextProps.onNavigateToDoc
))
