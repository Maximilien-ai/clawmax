import { useEffect, useState, useRef } from 'react'

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
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetchMessages()
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
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
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
            <h2 className="text-base font-semibold text-gray-800">Chat with Agent</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              <span className="font-mono">{agentName}</span>
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
                <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
              </div>
            </div>
          ))}

          {sending && (
            <div className="flex justify-start">
              <div className="bg-gray-100 text-gray-800 rounded-lg px-4 py-2.5">
                <p className="text-sm text-gray-400">
                  <span className="animate-pulse">Agent is thinking…</span>
                </p>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="px-6 py-4 border-t border-gray-100 shrink-0">
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={sending}
              placeholder="Type a message…"
              className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 disabled:opacity-40 disabled:cursor-not-allowed"
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
      </div>
    </div>
  )
}
