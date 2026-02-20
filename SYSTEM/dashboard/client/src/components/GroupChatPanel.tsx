import { useEffect, useState, useRef } from 'react'

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
}

const STATUS_DOT: Record<string, string> = {
  online: 'bg-green-400',
  offline: 'bg-yellow-400',
  unknown: 'bg-gray-300',
}

export default function GroupChatPanel({ channel, onClose }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showMentions, setShowMentions] = useState(false)
  const [mentionQuery, setMentionQuery] = useState('')
  const [mentionPosition, setMentionPosition] = useState(0)
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0)
  const [typingAgents, setTypingAgents] = useState<Set<string>>(new Set())
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetchMessages()
  }, [channel.name])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function fetchMessages() {
    setLoading(true)
    setError(null)
    try {
      const endpoint = channel.type === 'community'
        ? `/api/communities/${encodeURIComponent(channel.name)}/messages`
        : `/api/groups/${encodeURIComponent(channel.name)}/messages`
      const r = await fetch(endpoint)
      const data = await r.json()
      setMessages(data.messages || [])
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  async function sendMessage() {
    if (!input.trim() || sending) return

    // Extract @mentions
    const mentionRegex = /@(\w+)/g
    const matches = Array.from(input.matchAll(mentionRegex))
    const mentionedNames = matches.map(m => m[1])

    // Check for @all
    const hasAll = mentionedNames.some(name => name.toLowerCase() === 'all')

    // Find agents that match the mentions (or all if @all is used)
    const mentionedAgents = hasAll
      ? channel.members
      : channel.members.filter(agent =>
          mentionedNames.some(name =>
            agent.name.toLowerCase().includes(name.toLowerCase()) ||
            agent.id.toLowerCase() === name.toLowerCase()
          )
        )

    const userMessage = input.trim()
    setInput('')
    setSending(true)
    setError(null)
    setShowMentions(false)

    try {
      const endpoint = channel.type === 'community'
        ? `/api/communities/${encodeURIComponent(channel.name)}/messages`
        : `/api/groups/${encodeURIComponent(channel.name)}/messages`

      const r = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: userMessage,
          mentions: mentionedAgents.map(a => a.id)
        }),
      })

      if (r.ok) {
        fetchMessages()
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
  }

  // Build mention list: @all first, then matching agents
  const filteredMentionAgents = showMentions
    ? (() => {
        const agents = channel.members.filter(agent =>
          agent.name.toLowerCase().includes(mentionQuery.toLowerCase()) ||
          agent.id.toLowerCase().includes(mentionQuery.toLowerCase())
        )

        const mentions: Array<{ id: string; name: string; status: string; isAll?: boolean }> = []
        if ('all'.includes(mentionQuery.toLowerCase())) {
          mentions.push({ id: 'all', name: 'all', status: 'online', isAll: true })
        }

        return [...mentions, ...agents]
      })()
    : []

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
      } else if (e.key === 'Enter') {
        e.preventDefault()
        insertMention(filteredMentionAgents[selectedMentionIndex].name)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        setShowMentions(false)
      }
    } else if (e.key === 'Enter') {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end bg-black/20" onClick={onClose}>
      <div className="bg-white h-full w-[480px] shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-800">
              {channel.type === 'community' ? '🏘' : '👥'} {channel.name}
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {channel.members.length} member{channel.members.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors text-lg leading-none"
          >
            ×
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
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
            <div key={msg.id} className="bg-gray-100 rounded-lg px-4 py-2.5">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-gray-700">{msg.from}</span>
                <span className="text-xs text-gray-400">
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <p className="text-sm text-gray-800 whitespace-pre-wrap break-words">{msg.content}</p>
            </div>
          ))}

          {/* Typing indicators */}
          {Array.from(typingAgents).map((agentId) => {
            const agent = channel.members.find(a => a.id === agentId)
            return agent ? (
              <div key={`typing-${agentId}`} className="bg-gray-100 rounded-lg px-4 py-2.5 border-l-2 border-sky-400">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-gray-700">{agent.name}</span>
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
        <div className="px-6 py-4 border-t border-gray-100 shrink-0">
          <div className="relative">
            {/* @Mention Dropdown */}
            {showMentions && filteredMentionAgents.length > 0 && (
              <div className="absolute bottom-full left-0 mb-2 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto z-10">
                {filteredMentionAgents.map((agent, index) => (
                  <button
                    key={agent.id}
                    onClick={() => insertMention(agent.name)}
                    className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 ${
                      index === selectedMentionIndex
                        ? 'bg-sky-100 text-sky-900'
                        : 'hover:bg-sky-50'
                    } ${
                      'isAll' in agent && agent.isAll
                        ? 'font-semibold border-b border-gray-100'
                        : ''
                    }`}
                  >
                    {!('isAll' in agent && agent.isAll) && (
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[agent.status]}`} />
                    )}
                    <span className="font-medium">
                      {'isAll' in agent && agent.isAll ? '👥 @all' : agent.name}
                    </span>
                    {!('isAll' in agent && agent.isAll) && (
                      <span className="text-xs text-gray-400">({agent.id})</span>
                    )}
                    {('isAll' in agent && agent.isAll) && (
                      <span className="text-xs text-gray-500 ml-auto">
                        {channel.members.length} agents
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}

            <input
              type="text"
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Type a message... use @name or @all"
              className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-transparent"
              disabled={sending}
            />
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-gray-400">
              Use @name to mention agents or @all for everyone
            </span>
            <button
              onClick={sendMessage}
              disabled={!input.trim() || sending}
              className="px-4 py-2 text-sm rounded bg-sky-600 text-white hover:bg-sky-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              {sending ? 'Sending...' : 'Send'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
