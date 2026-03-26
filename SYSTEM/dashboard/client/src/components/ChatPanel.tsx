import { useEffect, useState, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface Message {
  role: 'user' | 'assistant'
  content: string
  timestamp?: number
}

interface Props {
  agentId: string
  agentName: string
  onClose: () => void
}

export default function ChatPanel({ agentId, agentName, onClose }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [showArchives, setShowArchives] = useState(false)
  const [archives, setArchives] = useState<Array<{ filename: string; timestamp: number; messageCount: number; title: string }>>([])
  const [viewingArchive, setViewingArchive] = useState<{ filename: string; messages: Message[] } | null>(null)
  const [copyFeedback, setCopyFeedback] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetchMessages()
    fetchArchivesList() // Fetch archives on mount to enable/disable history button
  }, [agentId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function fetchMessages() {
    setLoading(true)
    setError(null)
    try {
      const r = await fetch(`/api/agents/${agentId}/chat/messages`)
      const data = await r.json()
      if (data.error) {
        setError(data.error)
      } else {
        setMessages(data.messages || [])
      }
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  async function sendMessage() {
    if (!input.trim() || sending) return

    const userMessage = input.trim()
    setInput('')
    setSending(true)
    setError(null)

    // Optimistically add user message
    const userMsg: Message = { role: 'user', content: userMessage, timestamp: Date.now() }
    setMessages(prev => [...prev, userMsg])

    try {
      const r = await fetch(`/api/agents/${agentId}/chat/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage }),
      })
      const data = await r.json()

      if (data.error) {
        setError(data.error)
      } else if (data.result?.response) {
        // Add assistant response
        const assistantMsg: Message = {
          role: 'assistant',
          content: data.result.response,
          timestamp: Date.now()
        }
        setMessages(prev => [...prev, assistantMsg])
      }
    } catch (e) {
      setError(String(e))
    } finally {
      setSending(false)
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }

  async function clearMessages() {
    try {
      const r = await fetch(`/api/agents/${agentId}/chat/messages`, { method: 'DELETE' })
      const data = await r.json()
      if (data.ok) {
        setMessages([])
        setShowClearConfirm(false)
        fetchArchives()
      }
    } catch (e) {
      setError(String(e))
    }
  }

  async function fetchArchives() {
    try {
      const r = await fetch(`/api/agents/${agentId}/chat/archives`)
      const data = await r.json()
      setArchives(data.archives || [])
    } catch (e) {
      console.error('Failed to fetch archives:', e)
    }
  }

  async function fetchArchivesList() {
    try {
      const r = await fetch(`/api/agents/${agentId}/chat/archives`)
      const data = await r.json()
      setArchives(data.archives || [])
    } catch (err) {
      console.error('Failed to fetch archives list:', err)
    }
  }

  async function viewArchive(filename: string) {
    try {
      const r = await fetch(`/api/agents/${agentId}/chat/archives/${filename}`)
      const data = await r.json()
      setViewingArchive({ filename, messages: data.messages || [] })
      setShowArchives(false)
    } catch (e) {
      console.error('Failed to load archive:', e)
    }
  }

  async function deleteArchive(filename: string) {
    try {
      await fetch(`/api/agents/${agentId}/chat/archives/${filename}`, { method: 'DELETE' })
      setArchives(archives.filter(a => a.filename !== filename))
      setDeleteConfirm(null)
      if (viewingArchive?.filename === filename) {
        setViewingArchive(null)
      }
    } catch (e) {
      console.error('Failed to delete archive:', e)
    }
  }

  function copyToClipboard(msgs: Message[]) {
    const text = msgs
      .map(m => `[${m.timestamp ? new Date(m.timestamp).toLocaleString() : ''}] ${m.role === 'user' ? 'You' : agentName}: ${m.content}`)
      .join('\n\n')
    navigator.clipboard.writeText(text)
    setCopyFeedback(true)
    setTimeout(() => setCopyFeedback(false), 2000)
  }

  function downloadArchive(msgs: Message[], filename: string) {
    const text = msgs
      .map(m => `[${m.timestamp ? new Date(m.timestamp).toLocaleString() : ''}] ${m.role === 'user' ? 'You' : agentName}: ${m.content}`)
      .join('\n\n')
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const date = filename.match(/\d{4}-\d{2}-\d{2}/)?.[0] || new Date().toISOString().split('T')[0]
    a.download = `${agentName}_chat_${date}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end bg-black/20" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 h-full w-full sm:w-[480px] shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div className="min-w-0">
            <h2 className="text-sm sm:text-base font-semibold text-gray-800 dark:text-gray-200">Chat with Agent</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              <span className="font-mono">{agentName}</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { fetchArchives(); setShowArchives(true); }}
              disabled={archives.length === 0}
              className={`text-xs px-2 py-1 rounded transition-colors ${
                archives.length === 0
                  ? 'text-gray-300 cursor-not-allowed'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
              title={archives.length === 0 ? 'No chat history yet' : 'View chat history'}
            >
              📜 History
            </button>
            <button
              onClick={() => setShowClearConfirm(true)}
              className="text-xs px-2 py-1 text-gray-600 hover:bg-gray-100 rounded transition-colors dark:bg-gray-800 dark:hover:bg-gray-700"
              title="Clear messages"
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
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-3">
          {loading && (
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <span className="animate-spin">↻</span> Loading chat history…
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

          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[75%] rounded-lg px-4 py-2.5 ${
                  msg.role === 'user'
                    ? 'bg-sky-600 text-white'
                    : 'bg-gray-100 text-gray-800'
                }`}
              >
                <div className={`text-sm prose prose-sm max-w-none break-words [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 ${msg.role === 'user' ? 'prose-invert' : 'dark:prose-invert'}`}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {msg.content}
                  </ReactMarkdown>
                </div>
              </div>
            </div>
          ))}

          {sending && (
            <div className="flex justify-start">
              <div className="bg-gray-100 text-gray-800 rounded-lg px-4 py-2.5 dark:text-gray-200 dark:bg-gray-800">
                <p className="text-sm text-gray-400">
                  <span className="animate-pulse">Agent is thinking…</span>
                </p>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-t border-gray-100 shrink-0">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={sending}
              placeholder="Type a message…"
              className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 disabled:opacity-40 disabled:cursor-not-allowed dark:border-gray-700"
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || sending}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                !input.trim() || sending
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-sky-600 text-white hover:bg-sky-700'
              }`}
            >
              {sending ? '⋯' : 'Send'}
            </button>
          </div>
        </div>

        {/* Clear Confirmation Modal */}
        {showClearConfirm && (
          <div className="absolute inset-0 bg-black/20 flex items-center justify-center z-10">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-sm mx-4">
              <h3 className="text-base font-semibold mb-2">Clear Chat?</h3>
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
                  onClick={clearMessages}
                  className="px-4 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
                >
                  Clear & Archive
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Archives List Modal */}
        {showArchives && !viewingArchive && (
          <div className="absolute inset-0 bg-black/20 flex items-center justify-center z-10">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-md mx-4 max-h-[80vh] flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-semibold">Chat Archives</h3>
                <button
                  onClick={() => setShowArchives(false)}
                  className="text-gray-400 hover:text-gray-600 text-lg leading-none"
                >
                  ×
                </button>
              </div>
              <div className="overflow-y-auto flex-1">
                {archives.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-8">No archives yet</p>
                ) : (
                  <div className="space-y-2">
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
                          🗑
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Archive Viewer Modal */}
        {viewingArchive && (
          <div className="absolute inset-0 bg-black/20 flex items-center justify-center z-20">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-2xl mx-4 max-h-[80vh] flex flex-col w-full">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-semibold">Archived Chat</h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => copyToClipboard(viewingArchive.messages)}
                    className="text-xs px-2 py-1 text-gray-600 hover:bg-gray-100 rounded transition-colors dark:bg-gray-800 dark:hover:bg-gray-700"
                    title="Copy to clipboard"
                  >
                    📋 Copy
                  </button>
                  <button
                    onClick={() => downloadArchive(viewingArchive.messages, viewingArchive.filename)}
                    className="text-xs px-2 py-1 text-gray-600 hover:bg-gray-100 rounded transition-colors dark:bg-gray-800 dark:hover:bg-gray-700"
                    title="Download as text file"
                  >
                    💾 Download
                  </button>
                  <button
                    onClick={() => setDeleteConfirm(viewingArchive.filename)}
                    className="text-xs px-2 py-1 text-red-600 hover:bg-red-50 rounded transition-colors"
                    title="Delete archive"
                  >
                    🗑 Delete
                  </button>
                  <button
                    onClick={() => setViewingArchive(null)}
                    className="text-gray-400 hover:text-gray-600 text-lg leading-none"
                  >
                    ×
                  </button>
                </div>
              </div>
              <div className="overflow-y-auto flex-1 space-y-3 border border-gray-200 rounded p-4 dark:border-gray-700">
                {viewingArchive.messages.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                    No messages in this archive
                  </div>
                ) : (
                  viewingArchive.messages.map((msg, idx) => (
                    <div
                      key={idx}
                      className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[75%] rounded-lg px-4 py-2.5 ${
                          msg.role === 'user'
                            ? 'bg-sky-600 text-white'
                            : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        <p className="text-xs text-gray-500 mb-1">
                          {msg.timestamp ? new Date(msg.timestamp).toLocaleString() : ''}
                        </p>
                        <div className={`text-sm prose prose-sm max-w-none break-words [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 ${msg.role === 'user' ? 'prose-invert' : 'dark:prose-invert'}`}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {msg.content}
                  </ReactMarkdown>
                </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
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
