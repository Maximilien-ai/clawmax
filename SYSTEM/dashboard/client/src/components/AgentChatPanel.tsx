import { useEffect, useState, useRef, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { byokForRequest, hasAiGenerationAccess, readStoredByokKeys } from '../lib/byok'
import { buildPersistentDashboardChatSessionId } from '../lib/agentChatSession'
import { ProductIconCell } from '../lib/productIcons'
import { useAuth } from '../contexts/AuthContext'

interface Message {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  id: string
}

interface GroupTarget {
  type: 'group' | 'community'
  name: string
}

interface Props {
  agentId: string
  agentName: string
  agentStatus?: 'online' | 'offline' | 'unknown'
  onClose: () => void
  onSuccess?: () => void
  onNavigateToDoc?: (path: string) => void
}

// Strip ANSI escape codes from text
function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, '').replace(/\[[\d;]*m/g, '')
}

// Detect if content is an error/diagnostic message
function isErrorContent(content: string): boolean {
  return /\[diagnostic\]|lane task error|session file locked|Error:|error="/i.test(content)
}

function isRuntimeStatusLine(trimmed: string): boolean {
  return /^(🕒|🧠|🔑|🧮|📚|🧹|🧵|⚙️|🪢)\s/.test(trimmed)
}

function isToolArtifactLine(trimmed: string): boolean {
  return (
    trimmed === '(processing...)' ||
    trimmed === 'Files:' ||
    /^total\s+\d+/.test(trimmed) ||
    /^[drwx-]{10}\s/.test(trimmed) ||
    /^-rw[rx-]{7}\s/.test(trimmed) ||
    /^[A-Za-z0-9_.-]+\.(md|txt|json|csv|pdf|html|yml|yaml)$/.test(trimmed) ||
    /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ||
    trimmed === 'No notes yet.'
  )
}

// Strip OpenClaw internal data from message content
function cleanMessageContent(content: string): string {
  if (!content) return content

  // Strip ANSI codes first
  content = stripAnsi(content)

  // Detect raw gateway message payloads: [ { "id": "...", "content": "..." } ]
  // Extract just the content fields
  try {
    const trimmed = content.trim()
    if ((trimmed.startsWith('[') && trimmed.endsWith(']')) || (trimmed.startsWith('{') && trimmed.endsWith('}'))) {
      const parsed = JSON.parse(trimmed)
      const items = Array.isArray(parsed) ? parsed : [parsed]
      if (items.length > 0 && items[0].content && items[0].from) {
        return items.map(m => m.content).filter(Boolean).join('\n\n')
      }
      if (items.length > 0 && items[0].payloads) {
        return items[0].payloads.map((p: any) => p.text).filter(Boolean).join('\n\n')
      }
    }
  } catch {}

  // Process line by line — keep only human-readable content
  const lines = content.split('\n')
  const cleanedLines: string[] = []
  let braceDepth = 0 // Track JSON nesting depth
  let bracketDepth = 0
  let skippingArtifactBlock = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()

    // Track JSON brace/bracket depth
    if (braceDepth > 0 || bracketDepth > 0) {
      for (const ch of trimmed) {
        if (ch === '{') braceDepth++
        else if (ch === '}') braceDepth = Math.max(0, braceDepth - 1)
        else if (ch === '[') bracketDepth++
        else if (ch === ']') bracketDepth = Math.max(0, bracketDepth - 1)
      }
      continue // Skip everything inside JSON blocks
    }

    // Detect start of JSON block
    if (trimmed === '{' || trimmed.startsWith('{') || trimmed.startsWith('[')) {
      braceDepth += (trimmed.match(/\{/g) || []).length - (trimmed.match(/\}/g) || []).length
      bracketDepth += (trimmed.match(/\[/g) || []).length - (trimmed.match(/\]/g) || []).length
      if (braceDepth > 0 || bracketDepth > 0) continue
      // Single-line JSON (opened and closed on same line)
      continue
    }

    if (!trimmed) {
      skippingArtifactBlock = false
      cleanedLines.push(line)
      continue
    }

    // Skip lines with ANSI escape codes
    if (trimmed.match(/\[[\d;]*m/) || trimmed.match(/\x1b\[/)) continue

    // Skip OpenClaw internal lines
    if (isRuntimeStatusLine(trimmed) || trimmed.startsWith('🦞 OpenClaw') || trimmed.match(/^(Usage|Options|Commands|Examples|Docs|Available fields|Unknown JSON|GraphQL|\(Command exited|Command still|Process exited|Successfully wrote|store:)/)) continue

    // Skip inline tool calls
    if (trimmed.match(/\{"type"\s*:\s*"/)) continue

    // Skip bare timestamps
    if (trimmed.match(/^\d{1,2}:\d{2}:\d{2}\s*(AM|PM)?\s*$/)) continue

    // Skip lines that are just closing braces
    if (trimmed.match(/^[}\]],?\s*$/)) continue

    if (isToolArtifactLine(trimmed)) {
      skippingArtifactBlock = true
      continue
    }

    if (skippingArtifactBlock) {
      continue
    }

    cleanedLines.push(line)
  }

  const cleaned = cleanedLines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
  return cleaned || '(processing...)'
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

function summarizeChatFailure(message: string): string {
  const text = String(message || '').trim()
  if (!text) return 'No reply from agent.'
  if (/unsupported model|Unknown model:/i.test(text)) return 'This agent is configured with a model that the current runtime does not support. Choose a different model for the agent and try again.'
  if (/No API key found for provider/i.test(text)) return text.match(/No API key found for provider "[^"]+"/i)?.[0] || 'The selected model provider is missing credentials for this agent runtime.'
  if (/gateway/i.test(text)) return 'Agent could not reach the gateway runtime.'
  if (/timeout/i.test(text)) return 'Agent timed out before producing a reply.'
  if (/No API keys available|No execution path configured/i.test(text)) return 'No model execution path is configured for this chat.'
  return text
}

export default function AgentChatPanel({ agentId, agentName, agentStatus, onClose, onSuccess, onNavigateToDoc }: Props) {
  const { config } = useAuth()
  const browserChatEnabled = hasAiGenerationAccess(config)
  const [messages, setMessages] = useState<Message[]>([])
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [rawViewIds, setRawViewIds] = useState<Set<string>>(new Set())
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string>(() => buildPersistentDashboardChatSessionId(agentId))
  const [gatewayAvailable, setGatewayAvailable] = useState<boolean | null>(null)
  const [chatEnabled, setChatEnabled] = useState(browserChatEnabled)
  const [resettingSession, setResettingSession] = useState(false)
  const [forwardTargetMsgId, setForwardTargetMsgId] = useState<string | null>(null)
  const [forwardGroups, setForwardGroups] = useState<GroupTarget[]>([])
  const [forwardingTo, setForwardingTo] = useState<string | null>(null)
  const [isSlideMode, setIsSlideMode] = useState(() => {
    // Load saved preference from localStorage
    const saved = localStorage.getItem(`agent-chat-mode-${agentId}`)
    return saved === 'slide'
  })
  const [isListening, setIsListening] = useState(false)
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [showArchives, setShowArchives] = useState(false)
  const [archives, setArchives] = useState<Array<{ filename: string; timestamp: number; messageCount: number; title: string }>>([])
  const [viewingArchive, setViewingArchive] = useState<{ filename: string; messages: any[] } | null>(null)
  const [copyFeedback, setCopyFeedback] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [inputHistory, setInputHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const sendButtonRef = useRef<HTMLButtonElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const recognitionRef = useRef<any>(null)

  // Poll for new messages (agent-initiated updates)
  useEffect(() => {
    const pollMessages = async () => {
      // Don't poll while actively streaming
      if (streaming) return
      try {
        const r = await fetch(`/api/agents/${agentId}/chat/messages`)
        const data = await r.json()
        const serverMessages: Message[] = (data.messages || []).map((m: any, i: number) => ({
          role: m.role,
          content: m.content,
          timestamp: m.timestamp || Date.now(),
          id: m.id || `poll-${i}`
        }))
        // Only update if server has more messages than local (agent posted something new)
        if (serverMessages.length > messages.length) {
          setMessages(serverMessages)
        }
        setLoadingHistory(false)
      } catch {
        setLoadingHistory(false)
      }
    }

    pollMessages() // Fetch immediately on mount
    const interval = setInterval(pollMessages, 3000)
    return () => clearInterval(interval)
  }, [agentId, messages.length, streaming])

  useEffect(() => {
    checkGateway()
    checkChatExecutionReadiness()
    fetchArchivesList() // Fetch archives on mount to enable/disable history button
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
  }, [agentId, agentStatus, agentName, browserChatEnabled])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

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
      {linkifyWorkspaceFiles(clean ? cleanMessageContent(content) : content)}
    </ReactMarkdown>
  )

  // Save slide mode preference to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem(`agent-chat-mode-${agentId}`, isSlideMode ? 'slide' : 'modal')
  }, [isSlideMode, agentId])

  async function checkGateway() {
    // Check for BYOK keys in browser — these can power chat without gateway or server keys
    const byokKeys = readStoredByokKeys()
    const hasByokKeys = !!(byokKeys.openai || byokKeys.anthropic || byokKeys.openaiCompatibleBaseUrl)

    try {
      const r = await fetch(`/api/agents/${agentId}/gateway`)
      const data = await r.json()
      if (data.available === true) {
        setGatewayAvailable(true)
        return
      }
    } catch {}

    // Gateway not available — check server-side keys or BYOK
    if (hasByokKeys) {
      setGatewayAvailable(true) // BYOK keys sent with each chat request
      return
    }

    try {
      const configResp = await fetch('/api/auth/config')
      const config = configResp.ok ? await configResp.json() : {}
      const hasServerKeys = config?.systemKeyDefaults?.openai || config?.systemKeyDefaults?.anthropic || config?.systemKeyDefaults?.openaiCompatible
      if (hasServerKeys) {
        setGatewayAvailable(true)
        return
      }
    } catch {}

    setGatewayAvailable(false)
    setError('No execution path is available. Add OpenAI, Anthropic, or OpenAI-compatible settings in BYOK, or configure server environment keys.')
  }

  async function checkChatExecutionReadiness() {
    if (!browserChatEnabled) {
      setChatEnabled(false)
      return
    }

    try {
      const r = await fetch(`/api/agents/${agentId}/chat/readiness`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ byok: byokForRequest() }),
      })
      const data = await r.json().catch(() => ({}))
      if (r.ok && data.available !== false) {
        setChatEnabled(true)
        return
      }
      setChatEnabled(false)
      if (data?.error) {
        setError(data.error)
      }
    } catch {
      setChatEnabled(browserChatEnabled)
    }
  }

  async function resetAgentSession() {
    try {
      setResettingSession(true)
      setError(null)
      const resp = await fetch(`/api/agents/${agentId}/reset-session`, { method: 'POST' })
      const data = await resp.json().catch(() => ({}))
      if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`)
      setMessages([])
      setInputHistory([])
      setHistoryIndex(-1)
      setSessionId(buildPersistentDashboardChatSessionId(agentId))
      setShowClearConfirm(false)
    } catch (err: any) {
      setError(err?.message || 'Failed to reset agent session')
    } finally {
      setResettingSession(false)
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
    if (!chatEnabled) {
      setError('Agent chat is disabled because no AI execution path is configured. Open BYOK or Keys & Secrets first.')
      return
    }

    // Add to input history
    if (!messageText && textToSend) {
      setInputHistory(prev => [...prev, textToSend])
      setHistoryIndex(-1)
    }

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
        body: JSON.stringify({ message: textToSend, sessionId, byok: byokForRequest() }),
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
              setMessages(prev => prev.map(m =>
                m.id === assistantId
                  ? { ...m, content: data.data?.text?.trim() ? data.data.text : (m.content.trim() ? m.content : 'No reply from agent.') }
                  : m
              ))
              setStreaming(false)
              // Notify parent of successful completion
              onSuccess?.()
            } else if (data.type === 'error') {
              const friendly = summarizeChatFailure(data.data || 'Chat error')
              setError(friendly)
              setMessages(prev => prev.map(m =>
                m.id === assistantId
                  ? { ...m, content: friendly }
                  : m
              ))
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
        setError(summarizeChatFailure(String(e)))
      }
      setMessages(prev => prev.map(m =>
        m.id === assistantId
          ? { ...m, content: summarizeChatFailure(String(e)) }
          : m
      ))
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

  const openForwardPicker = useCallback(async (messageId: string) => {
    setForwardTargetMsgId(messageId)
    if (forwardGroups.length === 0) {
      try {
        const [groupsResp, commsResp] = await Promise.all([
          fetch('/api/groups').then(r => r.json()),
          fetch('/api/communities').then(r => r.json()),
        ])
        const targets: GroupTarget[] = [
          ...(groupsResp.groups || []).map((g: any) => ({ type: 'group' as const, name: g.name })),
          ...(commsResp.communities || []).map((c: any) => ({ type: 'community' as const, name: c.name })),
        ]
        setForwardGroups(targets)
      } catch {}
    }
  }, [forwardGroups.length])

  async function forwardToGroup(target: GroupTarget) {
    const msg = messages.find(m => m.id === forwardTargetMsgId)
    if (!msg) return
    setForwardingTo(`${target.type}:${target.name}`)
    try {
      const endpoint = target.type === 'community'
        ? `/api/communities/${encodeURIComponent(target.name)}/messages`
        : `/api/groups/${encodeURIComponent(target.name)}/messages`
      const prefix = msg.role === 'assistant' ? `**[Forwarded from ${agentName}]**\n\n` : `**[Forwarded by user from chat with ${agentName}]**\n\n`
      await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: prefix + msg.content,
          from: msg.role === 'assistant' ? agentId : 'user',
          mentions: [],
        }),
      })
      setForwardTargetMsgId(null)
      setForwardingTo(null)
    } catch {
      setForwardingTo(null)
    }
  }

  async function clearMessages() {
    try {
      const r = await fetch(`/api/agents/${agentId}/chat/messages`, { method: 'DELETE' })
      const data = await r.json()
      if (data.ok) {
        setMessages([])
        setShowClearConfirm(false)
        setInputHistory([]) // Clear input history when chat is archived
        setHistoryIndex(-1)
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

  function copyToClipboard(msgs: any[]) {
    const text = msgs
      .map(m => `[${m.timestamp ? new Date(m.timestamp).toLocaleString() : ''}] ${m.role === 'user' ? 'You' : agentName}: ${m.content}`)
      .join('\n\n')
    navigator.clipboard.writeText(text)
    setCopyFeedback(true)
    setTimeout(() => setCopyFeedback(false), 2000)
  }

  function downloadArchive(msgs: any[], filename: string) {
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

  if (gatewayAvailable === false) {
    return (
      <div className={`fixed inset-0 z-50 ${isSlideMode ? '' : 'flex items-center justify-center bg-black/40'}`}>
        <div className={`bg-white dark:bg-gray-800 shadow-2xl ${isSlideMode ? 'h-full w-full sm:w-[600px] absolute right-0 top-0' : 'rounded-xl w-full sm:w-[600px] mx-2 sm:mx-0'} p-4 sm:p-6`}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Agent Chat: {agentName}</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsSlideMode(!isSlideMode)}
                className="text-gray-400 hover:text-gray-600 text-sm px-2 py-1 hover:bg-gray-100 rounded transition-colors dark:bg-gray-800 dark:hover:bg-gray-700"
                title={isSlideMode ? "Switch to modal" : "Switch to slide"}
              >
                {isSlideMode ? '◧' : '»'}
              </button>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl p-2 min-w-[40px] min-h-[40px] flex items-center justify-center">×</button>
            </div>
          </div>
          <div className="text-center py-8">
            <div className="text-6xl mb-4">⚠️</div>
            <h3 className="text-lg font-semibold text-gray-700 mb-2 dark:text-gray-300">Agent Chat Unavailable</h3>
            <div className="mx-auto max-w-md rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-left text-sm text-red-900 dark:border-red-800 dark:bg-red-900/20 dark:text-red-100">
              <div className="font-medium">Agent chat is disabled because no AI execution path is configured</div>
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
              <div className="mt-3 text-xs opacity-90 space-y-1">
                <p>Check <span className="font-medium">System → Doctor</span> if runtime warnings are still active.</p>
                <p>If this is a hosted or remote runtime, enable the gateway in the instance runtime instead of using local machine commands.</p>
              </div>
            </div>
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
        className={`bg-white dark:bg-gray-800 shadow-2xl ${isSlideMode ? 'h-full absolute right-0 top-0' : 'rounded-xl h-[90vh] sm:h-[600px]'} w-full sm:w-[700px] flex flex-col`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 flex items-center justify-between shrink-0 dark:border-gray-700">
          <div className="min-w-0 flex-1">
            <h2 className="text-base sm:text-lg font-semibold text-gray-800 dark:text-gray-200 truncate">Agent Chat: {agentName}</h2>
            <p className="text-xs text-gray-400 mt-0.5">Real-time streaming from the active runtime</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={resetAgentSession}
              disabled={resettingSession}
              className={`text-xs px-2 py-1 rounded transition-colors ${
                resettingSession
                  ? 'text-gray-300 cursor-not-allowed'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
              title="Reset the agent runtime session for a completely fresh chat"
            >
              <span className="inline-flex items-center gap-2">
                <ProductIconCell iconName="restart" label="Reset Session" size="sm" className="border-transparent bg-transparent text-current" />
                Reset Session
              </span>
            </button>
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
              <span className="inline-flex items-center gap-2">
                <ProductIconCell iconName="history" label="History" size="sm" className="border-transparent bg-transparent text-current" />
                History
              </span>
            </button>
            <button
              onClick={() => setShowClearConfirm(true)}
              className="text-xs px-2 py-1 text-gray-600 hover:bg-gray-100 rounded transition-colors dark:bg-gray-800 dark:hover:bg-gray-700"
              title="Clear messages"
            >
              <span className="inline-flex items-center gap-2">
                <ProductIconCell iconName="delete" label="Clear" size="sm" className="border-transparent bg-transparent text-current" />
                Clear
              </span>
            </button>
            <button
              onClick={() => setIsSlideMode(!isSlideMode)}
              className="text-gray-400 hover:text-gray-600 text-sm px-2 py-1 hover:bg-gray-100 rounded transition-colors dark:bg-gray-800 dark:hover:bg-gray-700"
              title={isSlideMode ? "Switch to modal" : "Switch to slide"}
            >
              <ProductIconCell
                iconName={isSlideMode ? 'clone' : 'expand'}
                label={isSlideMode ? 'Switch to modal' : 'Switch to slide'}
                size="sm"
                className="border-transparent bg-transparent text-current"
              />
            </button>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <ProductIconCell iconName="close" label="Close" size="sm" className="border-transparent bg-transparent text-current" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4">
          {!chatEnabled && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-800 dark:bg-red-900/20 dark:text-red-100">
              <div className="font-medium">Agent chat is disabled because no AI execution path is configured</div>
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

          {loadingHistory && messages.length === 0 && (
            <div className="text-center py-12 text-gray-400 text-sm">
              <div className="text-2xl mb-3 animate-spin">↻</div>
              <p>Loading chat history...</p>
            </div>
          )}

          {!loadingHistory && messages.length === 0 && (
            <div className="text-center py-12 text-gray-400 text-sm">
              <div className="text-4xl mb-3">💬</div>
              <p>Start a conversation with {agentName}</p>
            </div>
          )}

          {messages.map((msg, idx) => {
            const msgIsError = msg.role === 'assistant' && isErrorContent(msg.content)
            return (
            <div
              key={msg.id}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-lg px-4 py-2 relative group ${
                  msgIsError
                    ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
                    : msg.role === 'user'
                      ? 'bg-sky-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-100'
                }`}
              >
                {msg.role === 'assistant' ? (
                  <>
                    {rawViewIds.has(msg.id) ? (
                      <pre className="text-xs whitespace-pre-wrap break-words font-mono overflow-auto max-h-60">{cleanMessageContent(msg.content)}</pre>
                    ) : (
                      <div className="text-sm prose prose-sm dark:prose-invert max-w-none break-words [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                        {renderMarkdown(msg.content || (streaming && idx === messages.length - 1 ? '▌' : ''), true)}
                      </div>
                    )}
                    {onNavigateToDoc && extractWorkspaceFileMentions(msg.content || '').length > 0 && (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="text-[11px] opacity-70">Files:</span>
                        {extractWorkspaceFileMentions(msg.content || '').map((file) => (
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
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-xs opacity-60">{new Date(msg.timestamp).toLocaleTimeString()}</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); setRawViewIds(prev => { const next = new Set(prev); next.has(msg.id) ? next.delete(msg.id) : next.add(msg.id); return next }) }}
                        className="text-xs opacity-40 hover:opacity-80 transition-opacity"
                        title={rawViewIds.has(msg.id) ? 'Show preview' : 'Show source'}
                      >
                        {rawViewIds.has(msg.id) ? '📝' : '</>'}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-sm prose prose-sm prose-invert max-w-none break-words [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                      {renderMarkdown(msg.content || '')}
                    </div>
                    {onNavigateToDoc && extractWorkspaceFileMentions(msg.content || '').length > 0 && (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="text-[11px] opacity-70">Files:</span>
                        {extractWorkspaceFileMentions(msg.content || '').map((file) => (
                          <button
                            key={file}
                            type="button"
                            onClick={() => onNavigateToDoc(file)}
                            className="text-[11px] px-2 py-1 rounded-full bg-white/20 hover:bg-white/30 underline"
                          >
                            {file}
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="text-xs opacity-60 mt-1">
                      {new Date(msg.timestamp).toLocaleTimeString()}
                    </div>
                  </>
                )}

                {/* Action buttons on hover */}
                <div className="absolute -bottom-2 right-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {/* Forward to group */}
                  <div className="relative">
                    <button
                      onClick={(e) => { e.stopPropagation(); forwardTargetMsgId === msg.id ? setForwardTargetMsgId(null) : openForwardPicker(msg.id) }}
                      className="bg-white dark:bg-gray-800 text-purple-600 dark:text-purple-400 rounded-full p-1.5 shadow-md hover:bg-purple-50 dark:hover:bg-purple-900/30"
                      title="Forward to group"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                      </svg>
                    </button>
                    {forwardTargetMsgId === msg.id && (
                      <div className="absolute bottom-full right-0 mb-1 w-48 max-h-40 overflow-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl z-50">
                        <div className="px-3 py-1.5 text-[10px] font-semibold text-gray-400 uppercase">Forward to</div>
                        {forwardGroups.length === 0 && (
                          <div className="px-3 py-2 text-xs text-gray-400">Loading...</div>
                        )}
                        {forwardGroups.map(g => (
                          <button
                            key={`${g.type}:${g.name}`}
                            onClick={() => forwardToGroup(g)}
                            disabled={forwardingTo === `${g.type}:${g.name}`}
                            className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center gap-1.5 disabled:opacity-50"
                          >
                            <span className="text-gray-400">{g.type === 'community' ? '🏘' : '👥'}</span>
                            <span className="truncate text-gray-700 dark:text-gray-200">{g.name}</span>
                            {forwardingTo === `${g.type}:${g.name}` && <span className="text-[10px] text-gray-400">sending...</span>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {/* Resend for user messages */}
                  {msg.role === 'user' && (
                    <button
                      onClick={() => resendMessage(msg.id)}
                      disabled={sending}
                      className="bg-white dark:bg-gray-800 text-sky-600 rounded-full p-1.5 shadow-md hover:bg-sky-50 disabled:opacity-40 disabled:cursor-not-allowed"
                      title="Resend this message"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            </div>
            )
          })}

          <div ref={messagesEndRef} />
        </div>

        {/* Error */}
        {error && (
          <div className="px-6 py-2 bg-red-50 dark:bg-red-900/20 border-t border-red-200 dark:border-red-800 flex items-center justify-between">
            <p className="text-sm text-red-600 dark:text-red-400">{stripAnsi(error)}</p>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 dark:hover:text-red-300 text-xs ml-2 shrink-0">✕</button>
          </div>
        )}

        {/* Typing indicator */}
        {streaming && (
          <div className="px-6 py-2 bg-sky-50 dark:bg-sky-900/30 border-t border-sky-200 dark:border-sky-800">
            <p className="text-xs text-sky-600 dark:text-sky-400">Agent is typing...</p>
          </div>
        )}

        {/* Input */}
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-t border-gray-200 shrink-0 dark:border-gray-700">
          <div className="flex gap-2">
            <button
              onClick={toggleVoiceInput}
              disabled={sending || !gatewayAvailable || !chatEnabled}
              className={`p-2 rounded-lg transition-colors text-sm font-medium shrink-0 ${
                isListening
                  ? 'bg-red-500 text-white hover:bg-red-600 animate-pulse'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              } disabled:bg-gray-50 dark:disabled:bg-gray-800 disabled:text-gray-300 dark:disabled:text-gray-600 disabled:cursor-not-allowed`}
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
              }}
              placeholder={isListening ? "Listening..." : "Type or speak your message... (Enter to send)"}
              disabled={sending || !gatewayAvailable || isListening || !chatEnabled}
              className="flex-1 px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent text-sm disabled:bg-gray-50 disabled:cursor-not-allowed dark:border-gray-700 dark:bg-gray-900"
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
                disabled={!input.trim() || sending || !gatewayAvailable || !chatEnabled}
                className="px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 transition-colors text-sm font-medium disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:cursor-not-allowed"
              >
                Send
              </button>
            )}
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
                        <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
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
