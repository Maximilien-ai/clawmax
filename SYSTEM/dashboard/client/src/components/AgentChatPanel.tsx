import { useEffect, useState, useRef } from 'react'

interface Message {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  id: string
}

interface Props {
  agentId: string
  agentName: string
  agentStatus?: 'online' | 'offline' | 'unknown'
  onClose: () => void
  onSuccess?: () => void
}

export default function AgentChatPanel({ agentId, agentName, agentStatus, onClose, onSuccess }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sessionId] = useState<string>(`dashboard-${agentId}-${Date.now()}`)
  const [gatewayAvailable, setGatewayAvailable] = useState<boolean | null>(null)
  const [isSlideMode, setIsSlideMode] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const sendButtonRef = useRef<HTMLButtonElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const recognitionRef = useRef<any>(null)

  useEffect(() => {
    checkGateway()
    // Delay focus slightly to ensure component is fully mounted
    setTimeout(() => inputRef.current?.focus(), 100)

    // Show info if agent is offline
    if (agentStatus === 'offline') {
      console.log(`Starting chat with offline agent: ${agentName}. Agent will be activated.`)
    }

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
      if (recognitionRef.current) {
        recognitionRef.current.stop()
      }
    }
  }, [agentId, agentStatus, agentName])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function checkGateway() {
    try {
      const r = await fetch(`/api/agents/${agentId}/gateway`)
      const data = await r.json()
      setGatewayAvailable(data.available === true)
      if (!data.available) {
        setError('Agent gateway is not running. Start the agent gateway first.')
      }
    } catch (e) {
      setGatewayAvailable(false)
      setError('Failed to check gateway status')
    }
  }

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

  async function sendMessage(messageText?: string) {
    const textToSend = messageText || input.trim()
    if (!textToSend || sending) return

    if (!messageText) {
      setInput('')
    }
    setSending(true)
    setError(null)
    setStreaming(true)

    // Add user message
    const userMsg: Message = {
      role: 'user',
      content: textToSend,
      timestamp: Date.now(),
      id: `user-${Date.now()}`
    }
    setMessages(prev => [...prev, userMsg])

    // Create assistant message placeholder
    const assistantId = `assistant-${Date.now()}`
    const assistantMsg: Message = {
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      id: assistantId
    }
    setMessages(prev => [...prev, assistantMsg])

    try {
      // Create abort controller for this request
      abortControllerRef.current = new AbortController()

      const response = await fetch(`/api/agents/${agentId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: textToSend, sessionId }),
        signal: abortControllerRef.current.signal
      })

      if (!response.ok || !response.body) {
        throw new Error(`HTTP ${response.status}`)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const data = JSON.parse(line.slice(6))

            if (data.type === 'delta') {
              // Append delta to assistant message
              setMessages(prev => prev.map(m =>
                m.id === assistantId
                  ? { ...m, content: m.content + (data.data.text || '') }
                  : m
              ))
            } else if (data.type === 'complete') {
              setStreaming(false)
              // Notify parent of successful completion
              onSuccess?.()
            } else if (data.type === 'error') {
              setError(data.data || 'Chat error')
              setStreaming(false)
            }
          } catch (e) {
            console.error('Failed to parse SSE message:', e)
          }
        }
      }
    } catch (e: any) {
      if (e.name === 'AbortError') {
        setError('Request cancelled')
      } else {
        setError(String(e))
      }
      // Remove incomplete assistant message on error
      setMessages(prev => prev.filter(m => m.id !== assistantId))
    } finally {
      setSending(false)
      setStreaming(false)
      abortControllerRef.current = null
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }

  function cancelStreaming() {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
      setStreaming(false)
      setSending(false)
    }
  }

  function resendMessage(messageId: string) {
    const message = messages.find(m => m.id === messageId)
    if (message && message.role === 'user') {
      sendMessage(message.content)
    }
  }

  if (gatewayAvailable === false) {
    return (
      <div className={`fixed inset-0 z-50 ${isSlideMode ? '' : 'flex items-center justify-center bg-black/40'}`}>
        <div className={`bg-white shadow-2xl ${isSlideMode ? 'h-full w-[600px] absolute right-0 top-0' : 'rounded-xl w-[600px]'} p-6`}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-800">Agent Chat: {agentName}</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsSlideMode(!isSlideMode)}
                className="text-gray-400 hover:text-gray-600 text-sm px-2 py-1 hover:bg-gray-100 rounded transition-colors"
                title={isSlideMode ? "Switch to modal" : "Switch to slide"}
              >
                {isSlideMode ? '◧' : '»'}
              </button>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
          </div>
          <div className="text-center py-8">
            <div className="text-6xl mb-4">⚠️</div>
            <h3 className="text-lg font-semibold text-gray-700 mb-2">Gateway Not Available</h3>
            <p className="text-sm text-gray-500 mb-4">
              The agent gateway is not running. Start it first:
            </p>
            <code className="text-xs bg-gray-100 px-3 py-1 rounded">
              openclaw gateway install
            </code>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className={`fixed inset-0 z-50 ${isSlideMode ? '' : 'flex items-center justify-center bg-black/40'}`}
      onClick={(e) => {
        // Close when clicking outside panel (backdrop)
        if (e.target === e.currentTarget) {
          onClose()
        }
      }}
    >
      <div
        className={`bg-white shadow-2xl ${isSlideMode ? 'h-full absolute right-0 top-0' : 'rounded-xl h-[600px]'} w-[700px] flex flex-col`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">Agent Chat: {agentName}</h2>
            <p className="text-xs text-gray-400 mt-0.5">Real-time streaming via gateway</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsSlideMode(!isSlideMode)}
              className="text-gray-400 hover:text-gray-600 text-sm px-2 py-1 hover:bg-gray-100 rounded transition-colors"
              title={isSlideMode ? "Switch to modal" : "Switch to slide"}
            >
              {isSlideMode ? '◧' : '»'}
            </button>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors text-xl leading-none"
            >×</button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {messages.length === 0 && (
            <div className="text-center py-12 text-gray-400 text-sm">
              <div className="text-4xl mb-3">💬</div>
              <p>Start a conversation with {agentName}</p>
            </div>
          )}

          {messages.map((msg, idx) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-lg px-4 py-2 relative group ${
                  msg.role === 'user'
                    ? 'bg-sky-600 text-white'
                    : 'bg-gray-100 text-gray-800'
                }`}
              >
                <div className="text-sm whitespace-pre-wrap break-words">
                  {msg.content || (streaming && idx === messages.length - 1 ? '▌' : '')}
                </div>
                <div className="text-xs opacity-60 mt-1">
                  {new Date(msg.timestamp).toLocaleTimeString()}
                </div>

                {/* Resubmit button for user messages */}
                {msg.role === 'user' && (
                  <button
                    onClick={() => resendMessage(msg.id)}
                    disabled={sending}
                    className="absolute -bottom-2 -right-2 bg-white text-sky-600 rounded-full p-1.5 shadow-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-sky-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Resend this message"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          ))}

          <div ref={messagesEndRef} />
        </div>

        {/* Error */}
        {error && (
          <div className="px-6 py-2 bg-red-50 border-t border-red-200">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {/* Typing indicator */}
        {streaming && (
          <div className="px-6 py-2 bg-sky-50 border-t border-sky-200">
            <p className="text-xs text-sky-600">Agent is typing...</p>
          </div>
        )}

        {/* Input */}
        <div className="px-6 py-4 border-t border-gray-200 shrink-0">
          <div className="flex gap-2">
            <button
              onClick={toggleVoiceInput}
              disabled={sending || !gatewayAvailable}
              className={`p-2 rounded-lg transition-colors text-sm font-medium shrink-0 ${
                isListening
                  ? 'bg-red-500 text-white hover:bg-red-600 animate-pulse'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              } disabled:bg-gray-50 disabled:text-gray-300 disabled:cursor-not-allowed`}
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
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !sending) {
                  e.preventDefault()
                  sendMessage()
                } else if (e.key === 'Escape') {
                  if (streaming) {
                    cancelStreaming()
                  } else {
                    onClose()
                  }
                }
              }}
              placeholder={isListening ? "Listening..." : "Type or speak your message... (Enter to send)"}
              disabled={sending || !gatewayAvailable || isListening}
              className="flex-1 px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent text-sm disabled:bg-gray-50 disabled:cursor-not-allowed"
            />
            {streaming ? (
              <button
                onClick={cancelStreaming}
                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors text-sm font-medium"
              >
                Cancel
              </button>
            ) : (
              <button
                ref={sendButtonRef}
                onClick={() => sendMessage()}
                disabled={!input.trim() || sending || !gatewayAvailable}
                className="px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 transition-colors text-sm font-medium disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                Send
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
