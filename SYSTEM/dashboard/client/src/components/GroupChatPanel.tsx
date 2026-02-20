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
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [showArchives, setShowArchives] = useState(false)
  const [archives, setArchives] = useState<Array<{ filename: string; timestamp: number; messageCount: number }>>([])
  const [viewingArchive, setViewingArchive] = useState<{ filename: string; messages: Message[] } | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetchMessages()
    // Poll for new messages every 2 seconds
    const interval = setInterval(fetchMessages, 2000)
    return () => clearInterval(interval)
  }, [channel.name])

  useEffect(() => {
    // Always scroll to bottom when messages change
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function fetchMessages() {
    // Only show loading on initial fetch, not on polling
    if (messages.length === 0) {
      setLoading(true)
    }
    setError(null)
    try {
      const endpoint = channel.type === 'community'
        ? `/api/communities/${encodeURIComponent(channel.name)}/messages`
        : `/api/groups/${encodeURIComponent(channel.name)}/messages`
      const r = await fetch(endpoint)
      const data = await r.json()
      const newMessages = data.messages || []

      // Clear typing indicators for agents who have responded
      // Use functional update to get current state
      setTypingAgents(currentTypingAgents => {
        if (currentTypingAgents.size > 0 && newMessages.length > messages.length) {
          const latestMessages = newMessages.slice(messages.length)
          // Only count agent responses, not user messages
          const respondedAgentIds = new Set(
            latestMessages
              .filter((m: any) => m.from !== 'User')
              .map((m: any) => m.from)
          )
          if (respondedAgentIds.size > 0) {
            const updated = new Set(currentTypingAgents)
            respondedAgentIds.forEach(id => updated.delete(id))
            return updated
          }
        }
        return currentTypingAgents
      })

      setMessages(newMessages)
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
        // Show typing indicators for mentioned agents
        if (mentionedAgents.length > 0) {
          setTypingAgents(new Set(mentionedAgents.map(a => a.id)))
          // Clear typing indicators after 60 seconds (agent timeout)
          setTimeout(() => setTypingAgents(new Set()), 60000)
        }
        fetchMessages()
        // Focus back on input after sending
        setTimeout(() => inputRef.current?.focus(), 0)
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

  async function handleClearChat() {
    try {
      const endpoint = channel.type === 'community'
        ? `/api/communities/${encodeURIComponent(channel.name)}/messages`
        : `/api/groups/${encodeURIComponent(channel.name)}/messages`

      const r = await fetch(endpoint, { method: 'DELETE' })
      if (r.ok) {
        setMessages([])
        setShowClearConfirm(false)
        fetchMessages()
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
      setArchives(data.archives || [])
      setShowArchives(true)
    } catch (err) {
      console.error('Failed to fetch archives:', err)
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

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end bg-black/20" onClick={onClose}>
      <div className="bg-white h-full w-[480px] shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div className="flex-1">
            <h2 className="text-base font-semibold text-gray-800">
              {channel.type === 'community' ? '🏘' : '👥'} {channel.name}
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {channel.members.length} member{channel.members.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchArchives}
              className="text-xs px-2 py-1 text-gray-600 hover:bg-gray-100 rounded transition-colors"
              title="View archived chats"
            >
              📂 History
            </button>
            <button
              onClick={() => setShowClearConfirm(true)}
              className="text-xs px-2 py-1 text-gray-600 hover:bg-gray-100 rounded transition-colors"
              title="Clear chat (archives first)"
              disabled={messages.length === 0}
            >
              🗑️ Clear
            </button>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors text-lg leading-none"
            >
              ×
            </button>
          </div>
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
              ref={inputRef}
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

        {/* Clear Confirmation Modal */}
        {showClearConfirm && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-10">
            <div className="bg-white rounded-lg p-6 max-w-sm mx-4 shadow-xl">
              <h3 className="text-lg font-semibold text-gray-800 mb-2">Clear Chat?</h3>
              <p className="text-sm text-gray-600 mb-4">
                This will archive all current messages and start a fresh chat. You can view archived chats anytime from History.
              </p>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setShowClearConfirm(false)}
                  className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded transition-colors"
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
            <div className="bg-white rounded-lg p-6 max-w-md mx-4 shadow-xl max-h-[80%] flex flex-col">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Chat History</h3>
              {archives.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">No archived chats</p>
              ) : (
                <div className="flex-1 overflow-y-auto space-y-2">
                  {archives.map(archive => (
                    <button
                      key={archive.filename}
                      onClick={() => viewArchive(archive.filename)}
                      className="w-full text-left px-4 py-3 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-800">
                          {new Date(archive.timestamp).toLocaleDateString()}
                        </span>
                        <span className="text-xs text-gray-500">
                          {archive.messageCount} messages
                        </span>
                      </div>
                      <div className="text-xs text-gray-400 mt-1">
                        {new Date(archive.timestamp).toLocaleTimeString()}
                      </div>
                    </button>
                  ))}
                </div>
              )}
              <button
                onClick={() => setShowArchives(false)}
                className="mt-4 px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded transition-colors w-full"
              >
                Close
              </button>
            </div>
          </div>
        )}

        {/* Archive Viewer Modal */}
        {viewingArchive && (
          <div className="absolute inset-0 bg-white z-10 flex flex-col">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
              <div className="flex-1">
                <h3 className="text-base font-semibold text-gray-800">
                  📂 {new Date(parseInt(viewingArchive.filename.match(/_(\d+)\.json$/)?.[1] || '0')).toLocaleDateString()}
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
                  }}
                  className="text-xs px-2 py-1 text-gray-600 hover:bg-gray-100 rounded transition-colors"
                  title="Copy to clipboard"
                >
                  📋 Copy
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
                  className="text-xs px-2 py-1 text-gray-600 hover:bg-gray-100 rounded transition-colors"
                  title="Download as text file"
                >
                  💾 Download
                </button>
                <button
                  onClick={() => setViewingArchive(null)}
                  className="text-gray-400 hover:text-gray-600 transition-colors text-lg"
                >
                  ×
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
              {viewingArchive.messages.map((msg) => (
                <div key={msg.id} className="bg-gray-100 rounded-lg px-4 py-2.5">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-gray-700">{msg.from}</span>
                    <span className="text-xs text-gray-400">
                      {new Date(msg.timestamp).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-sm text-gray-800 whitespace-pre-wrap break-words">{msg.content}</p>
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
      </div>
    </div>
  )
}
