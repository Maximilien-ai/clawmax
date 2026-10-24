import { channelLabel } from '../lib/channelLabel'
import { useEffect, useLayoutEffect, useState, useRef, useCallback, type ChangeEvent } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { nextChatFollowState } from '../lib/agentChatScroll'
import { byokForRequest, hasChatExecutionAccess, readStoredByokKeys } from '../lib/byok'
import { buildPersistentDashboardChatSessionId, resolveDashboardChatSessionId } from '../lib/agentChatSession'
import { buildAgentChatTimelineRows, shouldShowCalendarDate } from '../lib/agentChatTimeline'
import { getAgentChatInlineCodeClassName, getAgentChatLinkClassName, isCodeBlockNode, type AgentChatMarkdownRole } from '../lib/agentChatMarkdown'
import { copyText } from '../lib/clipboard'
import { AssistantCodeBlock, CopyIcon, UserCodeBlock } from './ChatCodeBlock'
import { ProductIconCell } from '../lib/productIcons'
import { useAuth } from '../contexts/AuthContext'
import { resolveAgentChatDocPath } from '../lib/agentChatDocs'
import { forwardChatMessage, loadForwardTargets, type ForwardTarget } from '../lib/agentChatForward'
import { appendAgentInboxAttachmentContext, buildAgentInboxDisplayMessage, buildAgentInboxTargetPath, type AgentInboxAttachmentRef } from '../lib/agentInbox'
import { transformWorkspaceMarkdownUrl } from '../lib/markdownLinks'
import { normalizeChatMessage } from '../../../server/lib/chat-normalization'
import { createPromptAttachment } from '../lib/promptAttachments'
import { extractWorkspaceFileMentions, linkifyWorkspaceFiles, parseWorkspaceDocEntriesResponse } from '../lib/workspaceFiles'
import { formatAgentWorkStatus, isRuntimeDiagnosticText, summarizeAgentChatFailure } from '../lib/chatRuntimeErrors'
import { INCOMPLETE_AGENT_CHAT_MESSAGE, markIncompleteAgentReply } from '../lib/agentChatStream'
import { buildAgentChatMarkdown, getAgentChatDownloadState } from '../lib/agentChatExport'
import { useToast } from './Toast'
import { AgentAttention } from './AgentAttention'
import { shouldSendChatOnKeyDown } from '../lib/chatComposer'
import { readChatComposerExpanded, saveChatComposerExpanded } from '../lib/chatComposerSize'

interface Message {
  role: 'user' | 'assistant'
  content: string
  /** A reply bubble this tab filled with a failure summary instead of the agent's text. */
  failed?: boolean
  timestamp: number
  id: string
}

type ForwardTargetsState = { status: 'idle' | 'loading' | 'ready' | 'error'; targets: ForwardTarget[]; error?: string }
const FORWARD_MENU_WIDTH_PX = 192 // w-48

interface Props {
  agentId: string
  agentName: string
  agentStatus?: 'online' | 'offline' | 'unknown'
  agentGeneration?: string
  onClose: () => void
  onSuccess?: () => void
  onNavigateToDoc?: (path: string) => void
}

interface DocEntryRef {
  path: string
}

interface ChatAttachment extends AgentInboxAttachmentRef {
  id: string
  type: string
  size: number
  file: File
}

function AttachIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path d="M8.5 3.5a3.5 3.5 0 0 1 7 0v8.25a5.75 5.75 0 1 1-11.5 0V5.5a2.75 2.75 0 0 1 5.5 0v5.5a1 1 0 1 1-2 0V6.5a.75.75 0 0 0-1.5 0V11a2.5 2.5 0 1 0 5 0V5.5a4.25 4.25 0 0 0-8.5 0v6.25a6.75 6.75 0 1 0 13.5 0V3.5a4.5 4.5 0 0 0-9 0 1 1 0 1 1-2 0Z" />
    </svg>
  )
}

function formatChatTime(timestamp: number | undefined, includeDate: boolean): string {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  const timeLabel = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  if (!includeDate) return timeLabel
  return `${date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })} ${timeLabel}`
}

function formatDurationShort(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  if (seconds < 60) return `${seconds}s`
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}

// Strip ANSI escape codes from text
function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, '').replace(/\[[\d;]*m/g, '')
}

// Persisted history and `complete` text are normalized by the server already; live deltas pass only
// its line-level warning filter. Render both through the same normalizer, so a reply looks the same
// while streaming, after it finishes, and after a reopen. (This used to be a drifted copy that also
// deleted fenced code and JSON examples.)
function cleanMessageContent(content: string): string {
  if (!content) return content
  return normalizeChatMessage(content) || '(processing...)'
}

/**
 * OpenClaw's built-in memory-core tool, when its search index is stale, hands the model a tool
 * result whose warning/action fields are literal second-person instructions ("Tell the user:
 * memory search is paused...", "Tell the user to run: openclaw memory index --force."). The model
 * follows that instruction like any other and appends it to its visible reply as ordinary prose —
 * see https://github.com/Maximilien-ai/clawmax/issues/197. There is no structural signal
 * distinguishing this from the model's real answer once it's written, so detection is by content:
 * a paragraph mentioning a paused memory search alongside the operator command to fix it is
 * reliably this notice and not something a user's own question would produce. Kept narrow (a
 * specific, confirmed leak) rather than a general "looks like an aside" heuristic, which would
 * risk swallowing real answers; extend this list if OpenClaw's other built-in tools are found to
 * do the same thing.
 */
export function isMemoryIndexPausedNotice(paragraph: string): boolean {
  const p = paragraph.toLowerCase()
  return /memory (search|index)/.test(p)
    && /paused/.test(p)
    && (/embedding/.test(p) || /openclaw memory (index|status)/.test(p))
}

/**
 * Pulls a recognized internal-tool notice (see isMemoryIndexPausedNotice) out of an assistant
 * reply so it renders as a separate system note instead of inline conversational text. Returns
 * the content unchanged when nothing matches. Paragraph-level, not line-level, since the notice is
 * model-written prose (often a full sentence or two), unlike cleanMessageContent's raw log/tool
 * artifact lines.
 */
export function splitTrailingSystemNotice(content: string): { text: string; notice?: string } {
  if (!content) return { text: content }
  const paragraphs = content.split(/\n{2,}/)
  const noticeIndex = paragraphs.findIndex(isMemoryIndexPausedNotice)
  if (noticeIndex === -1) return { text: content }
  const notice = paragraphs[noticeIndex].trim()
  const rest = paragraphs.filter((_, i) => i !== noticeIndex).join('\n\n').trim()
  return { text: rest, notice }
}

export default function AgentChatPanel({ agentId, agentName, agentStatus, agentGeneration, onClose, onSuccess, onNavigateToDoc }: Props) {
  const { config } = useAuth()
  const { showSuccess, showError } = useToast()
  // Staged Template Agents can only chat when their server-owned dev runtime
  // passes readiness. Do not infer access from browser BYOK or expose a key.
  const stagedTemplateAgent = /^tr-[a-f0-9]{16}-agent-[a-f0-9]{12}$/.test(agentId)
  const browserChatEnabled = hasChatExecutionAccess(config) || stagedTemplateAgent
  const [messages, setMessages] = useState<Message[]>([])
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [rawViewIds, setRawViewIds] = useState<Set<string>>(new Set())
  const [input, setInput] = useState('')
  const [composerExpanded, setComposerExpanded] = useState(readChatComposerExpanded)
  const [sending, setSending] = useState(false)
  const [streaming, setStreaming] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  // The turn this panel started, so Stop cancels only it. Two tabs on one agent is an ordinary
  // state, and so is a turn still queued behind another -- cancelling by agent would stop both.
  const activeTurnIdRef = useRef<string | null>(null)
  const [streamingStartedAt, setStreamingStartedAt] = useState<number | null>(null)
  const [streamingElapsedMs, setStreamingElapsedMs] = useState(0)
  // Time since the runtime last produced output, from GET /turns/active -- the only source for
  // this, since a page refresh or another tab can't see the deltas this tab isn't receiving.
  const [quietForMs, setQuietForMs] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string>(() => buildPersistentDashboardChatSessionId(agentId))
  const [gatewayAvailable, setGatewayAvailable] = useState<boolean | null>(null)
  const [chatEnabled, setChatEnabled] = useState(browserChatEnabled && !stagedTemplateAgent)
  const [resettingSession, setResettingSession] = useState(false)
  const [forwardTargetMsgId, setForwardTargetMsgId] = useState<string | null>(null)
  const [forwardTargets, setForwardTargets] = useState<ForwardTargetsState>({ status: 'idle', targets: [] })
  const [forwardingTo, setForwardingTo] = useState<string | null>(null)
  const [forwardError, setForwardError] = useState<string | null>(null)
  const [forwardMenuAlign, setForwardMenuAlign] = useState<'left' | 'right'>('right')
  const [isSlideMode, setIsSlideMode] = useState(() => {
    // Load saved preference from localStorage
    const saved = localStorage.getItem(`agent-chat-mode-${agentId}`)
    return saved === 'slide'
  })
  const [isListening, setIsListening] = useState(false)
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [showArchives, setShowArchives] = useState(false)
  const [archives, setArchives] = useState<Array<{ filename: string; timestamp: number; messageCount: number; title: string; active?: boolean }>>([])
  const [viewingArchive, setViewingArchive] = useState<{ filename: string; messages: any[]; active?: boolean } | null>(null)
  const [copyFeedback, setCopyFeedback] = useState(false)
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [inputHistory, setInputHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [docEntries, setDocEntries] = useState<DocEntryRef[]>([])
  const [attachments, setAttachments] = useState<ChatAttachment[]>([])
  // Follow new content only while the reader is at the end of the conversation: a poll, a re-render
  // or a reconciled history must never pull someone reading older messages back down.
  const messagesViewportRef = useRef<HTMLDivElement>(null)
  const followingRef = useRef(true)
  const lastScrollTopRef = useRef(0)
  const latestContentRef = useRef('')
  const [isFollowing, setIsFollowing] = useState(true)
  const [hasUnseen, setHasUnseen] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [draggingAttachment, setDraggingAttachment] = useState(false)
  const sendButtonRef = useRef<HTMLButtonElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const recognitionRef = useRef<any>(null)
  // Set the moment Cancel is clicked; a cancelled turn stays in the active-turns list for up to
  // ~2s while the server waits out SIGTERM before SIGKILL, and without this the status poll below
  // would see it as still running and flip the Cancel button straight back on.
  const suppressTurnAdoptionRef = useRef(false)
  const generationHeaders = agentGeneration
    ? { 'X-ClawMax-Agent-Generation': agentGeneration }
    : {}

  useEffect(() => {
    const handleDeleted = (event: Event) => {
      const deletedId = (event as CustomEvent<{ agentId?: string }>).detail?.agentId
      if (deletedId !== agentId) return
      abortControllerRef.current?.abort()
      setMessages([])
      setError(null)
      onClose()
    }
    window.addEventListener('agent-deleted', handleDeleted)
    return () => window.removeEventListener('agent-deleted', handleDeleted)
  }, [agentId, onClose])

  const resolveDocPath = useCallback((target: string) => (
    resolveAgentChatDocPath(target, agentId, docEntries)
  ), [agentId, docEntries])

  const getResolvedFileMentions = useCallback((content: string) => (
    extractWorkspaceFileMentions(content)
      .map((file) => ({ file, path: resolveDocPath(file) }))
      .filter((entry): entry is { file: string; path: string } => !!entry.path)
  ), [resolveDocPath])

  const timelineRows = buildAgentChatTimelineRows(messages)
  const timelineMessageMap = new Map(messages.map((message) => [message.id, message]))

  // Poll for new messages (agent-initiated updates)
  useEffect(() => {
    const pollMessages = async () => {
      // Don't poll while actively streaming
      if (streaming) return
      try {
        const r = await fetch(`/api/agents/${agentId}/chat/messages`, { headers: generationHeaders })
        if (r.status === 404 || r.status === 410) {
          setMessages([])
          onClose()
          return
        }
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
  }, [agentId, agentGeneration, messages.length, onClose, streaming])

  // Poll the server's view of what's actually running. This is the only way a turn already in
  // flight ever becomes visible in this tab: `streaming` is local state that a page refresh
  // resets to false and a second browser tab never sees, but the CLI behind it keeps running
  // either way. Runs continuously (not just while `streaming` is already true) so a turn started
  // before this tab existed still shows up and grows a Cancel button.
  useEffect(() => {
    const pollTurnStatus = async () => {
      try {
        const r = await fetch('/api/agents/turns/active')
        const data = await r.json().catch(() => ({}))
        const turns: Array<{ turnId: string; agentId: string; elapsedMs: number; idleMs: number }> = Array.isArray(data.turns) ? data.turns : []
        const mine = turns.find((t) => t.agentId === agentId)
        if (mine) {
          setQuietForMs(mine.idleMs)
          // Only adopt a turn this tab didn't start itself -- one we did start is already driven
          // by sendMessage()'s own state, and re-deriving streamingStartedAt from a 5s-old poll
          // would make its elapsed time jump backwards every tick.
          if (!sending && !suppressTurnAdoptionRef.current) {
            // A reload did not receive this turn's original SSE `start` event. Adopt the
            // registry's id as well as its visual status so Stop remains scoped to this turn
            // instead of falling back to the bulk "stop every turn for this agent" route.
            activeTurnIdRef.current = mine.turnId
            setStreaming(true)
            setStreamingStartedAt(Date.now() - mine.elapsedMs)
          }
        } else {
          activeTurnIdRef.current = null
          setQuietForMs(null)
          suppressTurnAdoptionRef.current = false
          if (!sending && streaming) {
            setStreaming(false)
            setStreamingStartedAt(null)
            setStreamingElapsedMs(0)
          }
        }
      } catch {
        // Transient network hiccup -- keep the last known status rather than flashing it away.
      }
    }

    pollTurnStatus() // Fetch immediately on mount so a reload shows the truth right away
    const interval = setInterval(pollTurnStatus, 5000)
    return () => clearInterval(interval)
  }, [agentId, sending, streaming])

  const refreshDocEntries = useCallback(async () => {
    const response = await fetch('/api/docs')
    const data = response.ok ? await response.json() : {}
    setDocEntries(parseWorkspaceDocEntriesResponse(data))
  }, [])

  useEffect(() => {
    refreshDocEntries().catch(() => {})
  }, [refreshDocEntries])

  async function addAttachmentFiles(files: File[]) {
    if (!files.length) return
    try {
      const nextAttachments = await Promise.all(files.map(async (file) => {
        const attachment = await createPromptAttachment(file)
        return { ...attachment, file } satisfies ChatAttachment
      }))
      setAttachments((current) => {
        const seen = new Set(current.map((attachment) => attachment.id))
        return current.concat(nextAttachments.filter((attachment) => !seen.has(attachment.id)))
      })
    } catch (err: any) {
      setError(err?.message || 'Failed to prepare attachments')
    }
  }

  async function handleAttachFiles(event: ChangeEvent<HTMLInputElement>) {
    await addAttachmentFiles(Array.from(event.target.files || []))
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function removeAttachment(attachmentId: string) {
    setAttachments((current) => current.filter((attachment) => attachment.id !== attachmentId))
  }

  async function ensureUploadedAttachments(currentAttachments: ChatAttachment[]): Promise<ChatAttachment[]> {
    const nextAttachments = [...currentAttachments]
    const inboxTarget = buildAgentInboxTargetPath(agentId)

    for (let index = 0; index < nextAttachments.length; index += 1) {
      const attachment = nextAttachments[index]
      if (attachment.uploadedPath) continue
      const shouldExtractZip = attachment.name.toLowerCase().endsWith('.zip')
      const response = await fetch(`/api/docs/upload?target=${encodeURIComponent(inboxTarget)}&extractZip=${shouldExtractZip ? 'true' : 'false'}`, {
        method: 'POST',
        headers: {
          'Content-Type': attachment.type || 'application/octet-stream',
          'x-file-name': encodeURIComponent(attachment.name),
          'x-file-name-encoding': 'percent',
        },
        body: await attachment.file.arrayBuffer(),
      })
      const data = await response.json().catch(() => ({}))
      const uploadedPaths = Array.isArray(data.files)
        ? data.files.filter((entry: unknown): entry is string => typeof entry === 'string' && entry.trim().length > 0)
        : typeof data.path === 'string'
          ? [data.path]
          : []
      if (!response.ok || !data.ok || uploadedPaths.length === 0) {
        throw new Error(data.error || `Failed to upload ${attachment.name}`)
      }
      nextAttachments[index] = {
        ...attachment,
        uploadedPath: uploadedPaths[0],
        uploadedPaths,
      }
    }

    setAttachments(nextAttachments)
    await refreshDocEntries().catch(() => {})
    return nextAttachments
  }

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

  const setFollowing = useCallback((following: boolean) => {
    followingRef.current = following
    setIsFollowing(following)
    if (following) setHasUnseen(false)
  }, [])

  // Scrolls only the conversation. scrollIntoView also scrolled every scrollable ancestor.
  const scrollToLatest = useCallback((behavior: ScrollBehavior = 'auto') => {
    const viewport = messagesViewportRef.current
    viewport?.scrollTo({ top: viewport.scrollHeight, behavior })
  }, [])

  const handleMessagesScroll = useCallback(() => {
    const viewport = messagesViewportRef.current
    if (!viewport) return
    const following = nextChatFollowState(followingRef.current, lastScrollTopRef.current, viewport)
    lastScrollTopRef.current = viewport.scrollTop
    if (following !== followingRef.current) setFollowing(following)
  }, [setFollowing])

  function jumpToLatest() {
    setFollowing(true)
    scrollToLatest(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth')
  }

  // Before paint, so streamed text never flashes below the fold first. Runs only when the message
  // list itself changes.
  useLayoutEffect(() => {
    const latest = messages[messages.length - 1]
    const latestContent = `${messages.length}:${latest?.id ?? ''}:${latest?.content.length ?? 0}`
    if (followingRef.current) scrollToLatest()
    else if (latestContent !== latestContentRef.current) setHasUnseen(true)
    latestContentRef.current = latestContent
  }, [messages, scrollToLatest])

  // The viewport also shrinks without a message change: the status bar appearing, an error, a
  // phone keyboard opening. Keep the latest message in view then too, while following.
  useEffect(() => {
    const viewport = messagesViewportRef.current
    if (!viewport || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => { if (followingRef.current) scrollToLatest() })
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [scrollToLatest])

  const renderMarkdown = (content: string, clean = false, role: AgentChatMarkdownRole = 'assistant') => (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      urlTransform={transformWorkspaceMarkdownUrl}
      components={{
        a: ({ href, children }) => {
          if (href?.startsWith('workspace-file:') && onNavigateToDoc) {
            const file = href.replace('workspace-file:', '')
            const resolvedPath = resolveDocPath(file)
            if (!resolvedPath) {
              return <>{children}</>
            }
            return (
              <button
                type="button"
                onClick={() => onNavigateToDoc(resolvedPath)}
                className={getAgentChatLinkClassName(role)}
              >
                {children}
              </button>
            )
          }
          if (href?.startsWith('/agents?')) {
            return <a href={href} className={getAgentChatLinkClassName(role)}>{children}</a>
          }
          return <a href={href} target="_blank" rel="noreferrer" className={getAgentChatLinkClassName(role)}>{children}</a>
        },
        // A block without a language has no class either; it is still a block, not inline code.
        code: ({ node, children, className }) => (
          <code className={className?.includes('language-') || isCodeBlockNode(node) ? className : getAgentChatInlineCodeClassName(role)}>
            {children}
          </code>
        ),
        pre: role === 'user' ? UserCodeBlock : AssistantCodeBlock,
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
    const hasByokKeys = !!(byokKeys.openai || byokKeys.anthropic || byokKeys.geminiApiKey || byokKeys.openrouter || byokKeys.xai || byokKeys.openaiCompatibleBaseUrl)

    try {
      const r = await fetch(`/api/agents/${agentId}/gateway`, { headers: generationHeaders })
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
      const hasServerKeys = config?.systemKeyDefaults?.openai || config?.systemKeyDefaults?.anthropic || config?.systemKeyDefaults?.gemini || config?.systemKeyDefaults?.openrouter || config?.systemKeyDefaults?.xai || config?.systemKeyDefaults?.openaiCompatible
      if (hasServerKeys) {
        setGatewayAvailable(true)
        return
      }
    } catch {}

    setGatewayAvailable(false)
    setError('No execution path is available. Add OpenAI, Anthropic, Gemini, OpenRouter, xAI, or OpenAI-compatible settings in BYOK, or configure server environment keys.')
  }

  async function checkChatExecutionReadiness() {
    if (!browserChatEnabled) {
      setChatEnabled(false)
      return
    }

    try {
      const r = await fetch(`/api/agents/${agentId}/chat/readiness`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...generationHeaders },
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
      setChatEnabled(browserChatEnabled && !stagedTemplateAgent)
    }
  }

  async function resetAgentSession() {
    try {
      setResettingSession(true)
      setError(null)
      const resp = await fetch(`/api/agents/${agentId}/reset-session`, { method: 'POST', headers: generationHeaders })
      const data = await resp.json().catch(() => ({}))
      if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`)
      setMessages([])
      setInputHistory([])
      setHistoryIndex(-1)
      setSessionId(buildPersistentDashboardChatSessionId(agentId))
      setShowClearConfirm(false)
      setFollowing(true)
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
    const queuedAttachments = messageText ? [] : attachments
    // `streaming` can be true here with `sending` still false -- a turn adopted from the active-
    // turns poll (this tab reloaded, or another tab started it) has no local fetch of its own.
    // The Send button is hidden in that state for the same reason; guard the keyboard/resend paths
    // that don't go through the button.
    if ((!textToSend && queuedAttachments.length === 0) || sending || streaming) return
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
    setStreamingStartedAt(Date.now())
    setStreamingElapsedMs(0)
    let assistantId = ''
    let preparedAttachments = queuedAttachments

    try {
      const uploadedAttachments = queuedAttachments.length > 0
        ? await ensureUploadedAttachments(queuedAttachments)
        : []
      preparedAttachments = uploadedAttachments
      const displayMessage = buildAgentInboxDisplayMessage(textToSend, uploadedAttachments)
      const executionMessage = appendAgentInboxAttachmentContext(textToSend, uploadedAttachments)

      const userMsg: Message = {
        role: 'user',
        content: displayMessage,
        timestamp: Date.now(),
        id: `user-${Date.now()}`
      }
      assistantId = `assistant-${Date.now()}`
      const assistantMsg: Message = {
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        id: assistantId
      }
      // Sending is a request to see the reply, wherever the reader had scrolled to.
      setFollowing(true)
      setMessages(prev => [...prev, userMsg, assistantMsg])
      if (!messageText) {
        setAttachments([])
      }

      // Create abort controller for this request
      abortControllerRef.current = new AbortController()

      const response = await fetch(`/api/agents/${agentId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...generationHeaders },
        body: JSON.stringify({
          message: executionMessage,
          sessionId,
          contextMessages: messages.slice(-6).map(({ role, content }) => ({ role, content })),
          byok: byokForRequest(),
        }),
        signal: abortControllerRef.current.signal
      })

      if (response.status === 404 || response.status === 410) {
        setMessages([])
        onClose()
        return
      }
      if (!response.ok || !response.body) {
        throw new Error(`HTTP ${response.status}`)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      // A stream can end without ever delivering 'complete' or 'error' — the server being
      // restarted or recreated mid-turn, or the connection dropping, both look like a clean EOF
      // here. Without this flag the loop simply exits and the finally block clears the spinner,
      // leaving the user with a half-written bubble and no indication anything went wrong.
      let sawTerminalEvent = false

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

            if (data.type === 'start') {
              activeTurnIdRef.current = data.data?.turnId ?? null
              setSessionId(current => resolveDashboardChatSessionId(current, data))
            } else if (data.type === 'delta') {
              // Append delta to assistant message
              setMessages(prev => prev.map(m =>
                m.id === assistantId
                  ? { ...m, content: m.content + (data.data.text || '') }
                  : m
              ))
            } else if (data.type === 'complete') {
              sawTerminalEvent = true
              setMessages(prev => prev.map(m =>
                m.id === assistantId
                  ? { ...m, content: data.data?.text?.trim() ? data.data.text : (m.content.trim() ? m.content : 'No reply from agent.') }
                  : m
              ))
              setStreaming(false)
              // Notify parent of successful completion
              onSuccess?.()
            } else if (data.type === 'error') {
              sawTerminalEvent = true
              const friendly = summarizeAgentChatFailure(data.data || 'Chat error', { agentId })
              setError(friendly)
              setMessages(prev => prev.map(m =>
                m.id === assistantId
                  ? { ...m, content: friendly, failed: true }
                  : m
              ))
              setStreaming(false)
            }
          } catch (e) {
            console.error('Failed to parse SSE message:', e)
          }
        }
      }

      // The stream ended cleanly but the turn never reported a result. Say so, rather than
      // clearing the spinner and leaving a half-written bubble that looks like the agent simply
      // stopped talking. Most often the server was restarted or recreated mid-turn.
      if (!sawTerminalEvent) {
        setError(INCOMPLETE_AGENT_CHAT_MESSAGE)
        setMessages(prev => prev.map(m =>
          m.id === assistantId
            ? { ...m, content: markIncompleteAgentReply(m.content) }
            : m
        ))
      }
    } catch (e: any) {
      const friendly = e.name === 'AbortError'
        ? 'Request cancelled'
        : summarizeAgentChatFailure(String(e), { agentId, transportFailure: true })
      setError(friendly)
      if (!messageText) {
        setInput(textToSend)
        if (preparedAttachments.length > 0) {
          setAttachments(preparedAttachments)
        }
      }
      if (assistantId) {
        setMessages(prev => prev.map(m =>
          m.id === assistantId
            ? { ...m, content: friendly, failed: true }
            : m
        ))
      }
    } finally {
      setSending(false)
      setStreaming(false)
      setStreamingStartedAt(null)
      setStreamingElapsedMs(0)
      abortControllerRef.current = null
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }

  useEffect(() => {
    if (!streaming || streamingStartedAt === null) return
    const updateElapsed = () => setStreamingElapsedMs(Date.now() - streamingStartedAt)
    updateElapsed()
    const timer = window.setInterval(updateElapsed, 1000)
    return () => window.clearInterval(timer)
  }, [streaming, streamingStartedAt])

  /**
   * Stop the running turn, server-side.
   *
   * Aborting the fetch alone only hangs up our end of the stream: the CLI keeps running, keeps
   * spending, and keeps writing files, while the UI says "Request cancelled". That was the actual
   * behaviour for claude and droid turns, because the server's kill handle was only ever wired on
   * the openclaw path. Turns have no deadline any more either, so nothing would have cleaned it up
   * afterwards -- the request has to be sent, and it has to be sent before we drop the stream.
   */
  async function cancelStreaming() {
    suppressTurnAdoptionRef.current = true
    setCancelling(true)
    try {
      const response = await fetch(`/api/agents/${agentId}/chat/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...generationHeaders },
        // Scope the stop to this panel's own turn. Omitting it falls back to stopping every turn
        // for the agent, which would reach turns this user never started.
        body: JSON.stringify({ turnId: activeTurnIdRef.current || undefined }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      if (!body?.cancelled) {
        // Nothing was running: it finished on its own between the click and the request.
        setError('That turn had already finished.')
      }
    } catch {
      setError('Could not stop the agent — it may still be running. Try again.')
    } finally {
      setCancelling(false)
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    activeTurnIdRef.current = null
    setStreaming(false)
    setSending(false)
  }

  function resendMessage(messageId: string) {
    const message = messages.find(m => m.id === messageId)
    if (message && message.role === 'user') {
      sendMessage(message.content)
    }
  }

  // Fetched on every open, so a group created meanwhile shows up; targets already loaded stay listed
  // while the refresh runs.
  const refreshForwardTargets = useCallback(async () => {
    setForwardTargets(current => ({ status: 'loading', targets: current.targets }))
    try {
      setForwardTargets({ status: 'ready', targets: await loadForwardTargets() })
    } catch (err) {
      setForwardTargets(current => ({ status: 'error', targets: current.targets, error: err instanceof Error ? err.message : String(err) }))
    }
  }, [])

  // Opens toward the side with room: a short reply's Forward button sits near the panel's left edge,
  // where a menu opening leftwards was cut off by the scrolling message list.
  function openForwardPicker(messageId: string, anchor: HTMLElement) {
    const viewport = anchor.closest('.overflow-y-auto')?.getBoundingClientRect()
    setForwardMenuAlign(viewport && anchor.getBoundingClientRect().right - FORWARD_MENU_WIDTH_PX < viewport.left + 8 ? 'left' : 'right')
    setForwardTargetMsgId(messageId)
    setForwardError(null)
    void refreshForwardTargets()
  }

  async function forwardToGroup(target: ForwardTarget) {
    const msg = messages.find(m => m.id === forwardTargetMsgId)
    if (!msg) return
    setForwardingTo(`${target.type}:${target.name}`)
    setForwardError(null)
    try {
      const prefix = msg.role === 'assistant' ? `**[Forwarded from ${agentName}]**\n\n` : `**[Forwarded by user from chat with ${agentName}]**\n\n`
      await forwardChatMessage(target, {
        content: prefix + msg.content,
        from: msg.role === 'assistant' ? agentId : 'user',
      })
      setForwardTargetMsgId(null)
      showSuccess(`Forwarded to ${channelLabel(target)}`)
    } catch (err) {
      setForwardError(err instanceof Error ? err.message : String(err))
    } finally {
      setForwardingTo(null)
    }
  }

  async function clearMessages() {
    try {
      const r = await fetch(`/api/agents/${agentId}/chat/messages`, { method: 'DELETE', headers: generationHeaders })
      const data = await r.json()
      if (data.ok) {
        setMessages([])
        setShowClearConfirm(false)
        setInputHistory([]) // Clear input history when chat is archived
        setHistoryIndex(-1)
        fetchArchives()
        setFollowing(true)
      }
    } catch (e) {
      setError(String(e))
    }
  }

  async function fetchArchives() {
    try {
      const r = await fetch(`/api/agents/${agentId}/chat/archives`, { headers: generationHeaders })
      const data = await r.json()
      setArchives(data.archives || [])
    } catch (e) {
      console.error('Failed to fetch archives:', e)
    }
  }

  async function fetchArchivesList() {
    try {
      const r = await fetch(`/api/agents/${agentId}/chat/archives`, { headers: generationHeaders })
      const data = await r.json()
      setArchives(data.archives || [])
    } catch (err) {
      console.error('Failed to fetch archives list:', err)
    }
  }

  async function viewArchive(filename: string) {
    try {
      const r = await fetch(`/api/agents/${agentId}/chat/archives/${filename}`, { headers: generationHeaders })
      const data = await r.json()
      const archiveMeta = archives.find((archive) => archive.filename === filename)
      setViewingArchive({ filename, messages: data.messages || [], active: archiveMeta?.active })
      setShowArchives(false)
    } catch (e) {
      console.error('Failed to load archive:', e)
    }
  }

  async function restoreArchive(filename: string) {
    try {
      const r = await fetch(`/api/agents/${agentId}/chat/archives/${filename}/restore`, { method: 'POST', headers: generationHeaders })
      const data = await r.json()
      if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`)
      setMessages(data.messages || [])
      setViewingArchive(null)
      setShowArchives(false)
      setError(null)
      setFollowing(true)
      fetchArchives()
      setTimeout(() => inputRef.current?.focus(), 0)
    } catch (e: any) {
      setError(e?.message || 'Failed to restore archived chat')
    }
  }

  async function deleteArchive(filename: string) {
    try {
      await fetch(`/api/agents/${agentId}/chat/archives/${filename}`, { method: 'DELETE', headers: generationHeaders })
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

  async function copyMessage(message: Message) {
    try {
      // What the bubble shows: the reply as rendered from, never the raw runtime transcript.
      await copyText(message.role === 'assistant' ? cleanMessageContent(message.content) : message.content)
      setCopiedMessageId(message.id)
      setTimeout(() => setCopiedMessageId(current => (current === message.id ? null : current)), 2000)
    } catch {
      showError('Could not copy the message. Your browser blocked clipboard access.')
    }
  }

  function downloadConversation() {
    try {
      const exported = buildAgentChatMarkdown(agentName, messages.map(message => ({
        ...message,
        content: message.role === 'assistant' ? cleanMessageContent(message.content) : message.content,
      })), new Date(), streaming)
      const url = URL.createObjectURL(new Blob([exported.markdown], { type: 'text/markdown;charset=utf-8' }))
      const anchor = document.createElement('a')
      try {
        anchor.href = url
        anchor.download = exported.filename
        document.body.appendChild(anchor)
        anchor.click()
        showSuccess('Conversation download started. Review the file before sharing.')
      } finally {
        anchor.remove()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
      }
    } catch {
      showError('Could not download the conversation. Please try again.')
    }
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

  const downloadState = getAgentChatDownloadState(messages, loadingHistory, streaming)

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
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 shrink-0 dark:border-gray-700">
          <div className="flex items-start gap-3">
            <div className="min-w-0 w-0 flex-1">
              <h2 className="text-base sm:text-lg font-semibold text-gray-800 dark:text-gray-200 truncate">Agent Chat: {agentName}</h2>
              <AgentAttention agentId={agentId} generation={agentGeneration} />
            </div>
            <button
              type="button"
              onClick={downloadConversation}
              disabled={downloadState.disabled}
              aria-label="Download conversation as Markdown"
              title={downloadState.title}
              className="inline-flex shrink-0 items-center gap-1 rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ProductIconCell iconName="download" label={downloadState.title} size="sm" className="border-transparent bg-transparent text-current" />
              <span>Download</span>
            </button>
            <button
              onClick={onClose}
              className="shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <ProductIconCell iconName="close" label="Close" size="sm" className="border-transparent bg-transparent text-current" />
            </button>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
            <p className="min-w-0 text-xs text-gray-400">Real-time streaming from the active runtime</p>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5 sm:gap-2">
              <button
                onClick={resetAgentSession}
                disabled={resettingSession}
                className={`text-xs px-2 py-1 rounded transition-colors shrink-0 ${
                  resettingSession
                    ? 'text-gray-300 cursor-not-allowed'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
                title="Reset the agent runtime session for a completely fresh chat"
              >
                <span className="inline-flex items-center gap-1.5 sm:gap-2">
                  <ProductIconCell iconName="restart" label="Reset Session" size="sm" className="border-transparent bg-transparent text-current" />
                  <span className="hidden sm:inline">Reset Session</span>
                </span>
              </button>
              <button
                onClick={() => { fetchArchives(); setShowArchives(true); }}
                disabled={archives.length === 0}
                className={`text-xs px-2 py-1 rounded transition-colors shrink-0 ${
                  archives.length === 0
                    ? 'text-gray-300 cursor-not-allowed'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
                title={archives.length === 0 ? 'No chat history yet' : 'View chat history'}
              >
                <span className="inline-flex items-center gap-1.5 sm:gap-2">
                  <ProductIconCell iconName="history" label="History" size="sm" className="border-transparent bg-transparent text-current" />
                  <span className="hidden sm:inline">History</span>
                </span>
              </button>
              <button
                onClick={() => setShowClearConfirm(true)}
                className="text-xs px-2 py-1 text-gray-600 hover:bg-gray-100 rounded transition-colors dark:bg-gray-800 dark:hover:bg-gray-700 shrink-0"
                title="Clear messages"
              >
                <span className="inline-flex items-center gap-1.5 sm:gap-2">
                  <ProductIconCell iconName="delete" label="Clear" size="sm" className="border-transparent bg-transparent text-current" />
                  <span className="hidden sm:inline">Clear</span>
                </span>
              </button>
              <button
                onClick={() => setIsSlideMode(!isSlideMode)}
                className="text-gray-400 hover:text-gray-600 text-sm px-2 py-1 hover:bg-gray-100 rounded transition-colors dark:bg-gray-800 dark:hover:bg-gray-700 shrink-0"
                title={isSlideMode ? "Switch to modal" : "Switch to slide"}
              >
                <ProductIconCell
                  iconName={isSlideMode ? 'clone' : 'expand'}
                  label={isSlideMode ? 'Switch to modal' : 'Switch to slide'}
                  size="sm"
                  className="border-transparent bg-transparent text-current"
                />
              </button>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div ref={messagesViewportRef} onScroll={handleMessagesScroll} className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4">
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

          {timelineRows.map((row) => {
            if (row.type === 'separator') {
              return (
                <div key={row.key} className="flex items-center gap-3 py-2">
                  <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
                  <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-400 dark:text-gray-500">
                    {row.label}
                  </div>
                  <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
                </div>
              )
            }

            const msg = timelineMessageMap.get(row.key)
            if (!msg) return null
            const msgIsError = msg.role === 'assistant' && (msg.failed === true || isRuntimeDiagnosticText(msg.content))
            const isStreamingPlaceholder = streaming && msg.role === 'assistant' && msg.id === messages[messages.length - 1]?.id
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
                      ? 'bg-sky-700 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-100'
                }`}
              >
                {msg.role === 'assistant' ? (
                  <>
                    {(() => { const { text: bubbleText, notice: systemNotice } = splitTrailingSystemNotice(msg.content || ''); return (
                    <>
                    {rawViewIds.has(msg.id) ? (
                      <pre className="text-xs whitespace-pre-wrap break-words font-mono overflow-auto max-h-60">{cleanMessageContent(msg.content)}</pre>
                    ) : (
                      <div className="text-sm prose prose-sm dark:prose-invert max-w-none break-words [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                        {renderMarkdown(bubbleText || (isStreamingPlaceholder ? '▌' : ''), true, 'assistant')}
                      </div>
                    )}
                    {systemNotice && !rawViewIds.has(msg.id) && (
                      <div className="mt-2 flex items-start gap-1.5 text-xs opacity-60" title="A note from the agent's tooling, not part of its answer">
                        <span aria-hidden="true">ⓘ</span>
                        <span className="whitespace-pre-wrap break-words">{systemNotice}</span>
                      </div>
                    )}
                    </>
                    ) })()}
                    {onNavigateToDoc && getResolvedFileMentions(msg.content || '').length > 0 && (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="text-[11px] opacity-70">Files:</span>
                        {getResolvedFileMentions(msg.content || '').map(({ file, path }) => (
                          <button
                            key={path}
                            type="button"
                            onClick={() => onNavigateToDoc(path)}
                            className="cursor-pointer text-[11px] px-2 py-1 rounded-full bg-sky-100 text-sky-700 underline decoration-sky-300 underline-offset-2 hover:bg-sky-200 hover:text-sky-900 dark:bg-sky-900/30 dark:text-sky-300 dark:decoration-sky-500 dark:hover:bg-sky-900/50"
                            title="Open in Documents"
                          >
                            {file}
                            <span className="ml-1 font-semibold">Open</span>
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-xs opacity-60">{formatChatTime(msg.timestamp, row.showDate)}</span>
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
                    <div className="text-sm prose prose-sm prose-invert agent-chat-user-markdown max-w-none break-words [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                      {renderMarkdown(msg.content || '', false, 'user')}
                    </div>
                    {onNavigateToDoc && getResolvedFileMentions(msg.content || '').length > 0 && (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="text-[11px] text-sky-100">Files:</span>
                        {getResolvedFileMentions(msg.content || '').map(({ file, path }) => (
                          <button
                            key={path}
                            type="button"
                            onClick={() => onNavigateToDoc(path)}
                            className="cursor-pointer text-[11px] px-2 py-1 rounded-full bg-sky-800 hover:bg-sky-900 text-white underline underline-offset-2"
                            title="Open in Documents"
                          >
                            {file}
                            <span className="ml-1 font-semibold">Open</span>
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="text-xs text-sky-100 mt-1">
                      {formatChatTime(msg.timestamp, row.showDate)}
                    </div>
                  </>
                )}

                {/* Action buttons on hover */}
                <div className="absolute -bottom-2 right-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); void copyMessage(msg) }}
                    className="bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-full p-1.5 shadow-md hover:bg-gray-50 dark:hover:bg-gray-700"
                    title={copiedMessageId === msg.id ? 'Copied' : 'Copy message'}
                    aria-label={copiedMessageId === msg.id ? 'Message copied' : 'Copy message'}
                  >
                    <CopyIcon state={copiedMessageId === msg.id ? 'copied' : 'idle'} className="w-3 h-3" />
                  </button>
                  {/* Forward to group */}
                  <div
                    className="relative"
                    onKeyDown={(e) => {
                      if (e.key === 'Escape' && forwardTargetMsgId === msg.id) {
                        e.stopPropagation()
                        setForwardTargetMsgId(null)
                      }
                    }}
                  >
                    <button
                      onClick={(e) => { e.stopPropagation(); forwardTargetMsgId === msg.id ? setForwardTargetMsgId(null) : openForwardPicker(msg.id, e.currentTarget) }}
                      className="bg-white dark:bg-gray-800 text-purple-600 dark:text-purple-400 rounded-full p-1.5 shadow-md hover:bg-purple-50 dark:hover:bg-purple-900/30"
                      title="Forward to group"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                      </svg>
                    </button>
                    {forwardTargetMsgId === msg.id && (
                      <div className={`absolute bottom-full ${forwardMenuAlign === 'left' ? 'left-0' : 'right-0'} mb-1 w-48 max-h-40 overflow-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl z-50`}>
                        <div className="px-3 py-1.5 text-[10px] font-semibold text-gray-400 uppercase">Forward to</div>
                        {forwardTargets.targets.length === 0 && forwardTargets.status === 'loading' && (
                          <div className="px-3 py-2 text-xs text-gray-400" role="status">Loading...</div>
                        )}
                        {forwardTargets.targets.length === 0 && forwardTargets.status === 'ready' && (
                          <div className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">No groups or communities yet.</div>
                        )}
                        {forwardTargets.status === 'error' && (
                          <div className="px-3 py-2 text-xs text-red-600 dark:text-red-400" role="alert">
                            <p className="break-words">{forwardTargets.error}</p>
                            <button type="button" onClick={(e) => { e.stopPropagation(); void refreshForwardTargets() }} className="mt-1 font-medium underline">Retry</button>
                          </div>
                        )}
                        {forwardError && (
                          <div className="px-3 py-2 text-xs text-red-600 dark:text-red-400 break-words" role="alert">{forwardError}</div>
                        )}
                        {forwardTargets.targets.map(g => (
                          <button
                            key={`${g.type}:${g.name}`}
                            onClick={() => forwardToGroup(g)}
                            disabled={forwardingTo === `${g.type}:${g.name}`}
                            className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center gap-1.5 disabled:opacity-50"
                          >
                            <span className="text-gray-400">{g.type === 'community' ? '🏘' : '👥'}</span>
                            <span className="truncate text-gray-700 dark:text-gray-200">{channelLabel(g)}</span>
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
                      disabled={sending || streaming}
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

          {!isFollowing && (
            // Sticky and zero-height: pinned to the bottom edge of the viewport without adding to the
            // conversation's height, which would move the end the reader is trying to reach.
            <div className="sticky bottom-3 !mt-0 flex h-0 items-start justify-center">
              <button
                type="button"
                onClick={jumpToLatest}
                className="-translate-y-full inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white/95 px-3 py-1.5 text-xs font-medium text-gray-700 shadow-md backdrop-blur hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:border-gray-600 dark:bg-gray-800/95 dark:text-gray-100 dark:hover:bg-gray-700"
              >
                {hasUnseen && <span className="h-2 w-2 rounded-full bg-sky-500" aria-hidden="true" />}
                <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fillRule="evenodd" d="M10 3a.75.75 0 0 1 .75.75v10.638l3.96-4.158a.75.75 0 1 1 1.08 1.04l-5.25 5.5a.75.75 0 0 1-1.08 0l-5.25-5.5a.75.75 0 1 1 1.08-1.04l3.96 4.158V3.75A.75.75 0 0 1 10 3Z" clipRule="evenodd" />
                </svg>
                Jump to latest
                {hasUnseen && <span className="sr-only">(new messages below)</span>}
              </button>
            </div>
          )}
        </div>

        <span className="sr-only" aria-live="polite">{copiedMessageId ? 'Message copied' : ''}</span>

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
            <p className="text-xs text-sky-600 dark:text-sky-400">
              {formatAgentWorkStatus(streamingElapsedMs)}
              {/* Agent turns have no time limit, so a run can go quiet for minutes and still be
                  fine -- say so explicitly once the gap is long enough to otherwise read as a
                  hang, instead of leaving the user staring at a stalled-looking spinner. */}
              {quietForMs !== null && quietForMs >= 30_000 && (
                <> It's been quiet for {formatDurationShort(quietForMs)} — still working, not stuck.</>
              )}
            </p>
          </div>
        )}

        {/* Input */}
        <div
          className={`px-4 sm:px-6 py-3 sm:py-4 border-t shrink-0 ${draggingAttachment ? 'border-sky-500 bg-sky-50 dark:bg-sky-950/30' : 'border-gray-200 dark:border-gray-700'}`}
          onDragOver={(event) => { if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); setDraggingAttachment(true) } }}
          onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDraggingAttachment(false) }}
          onDrop={(event) => {
            event.preventDefault()
            setDraggingAttachment(false)
            if (!sending) void addAttachmentFiles(Array.from(event.dataTransfer.files))
          }}
        >
          {draggingAttachment && <p className="mb-2 text-xs font-medium text-sky-700 dark:text-sky-300">Drop files to attach</p>}
          {attachments.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {attachments.map((attachment) => (
                <div key={attachment.id} className="inline-flex max-w-full items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs text-gray-700 dark:border-sky-800 dark:bg-sky-950/20 dark:text-gray-200">
                  <span className="truncate">
                    {attachment.isImage ? 'Image' : 'File'}: {attachment.name}
                    {attachment.uploadedPath ? <span className="ml-1 text-sky-700 dark:text-sky-300">in inbox</span> : null}
                  </span>
                  <button onClick={() => removeAttachment(attachment.id)} className="text-gray-400 hover:text-red-500">×</button>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={sending}
              className="inline-flex items-center justify-center rounded-lg border border-gray-200 bg-gray-50 p-2 text-gray-600 transition-colors hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
              title="Attach files to this agent inbox"
              aria-label="Attach files to this agent inbox"
            >
              <AttachIcon />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,.txt,.md,.json,.csv,.yaml,.yml,.pdf"
              onChange={handleAttachFiles}
              className="hidden"
            />
            <button
              onClick={toggleVoiceInput}
              disabled={sending || streaming || !gatewayAvailable || !chatEnabled}
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
            <div className="relative min-w-0 flex-1">
            <textarea
              ref={inputRef}
              rows={composerExpanded ? 4 : 1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (shouldSendChatOnKeyDown(e) && !sending) {
                  e.preventDefault()
                  sendMessage()
                } else if (e.key === 'Escape') {
                  if (streaming) {
                    cancelStreaming()
                  } else {
                    onClose()
                  }
                } else if (e.key === 'ArrowUp' && !input.includes('\n') && e.currentTarget.selectionStart === 0) {
                  e.preventDefault()
                  if (inputHistory.length > 0) {
                    const newIndex = historyIndex === -1
                      ? inputHistory.length - 1
                      : Math.max(0, historyIndex - 1)
                    setHistoryIndex(newIndex)
                    setInput(inputHistory[newIndex])
                  }
                } else if (e.key === 'ArrowDown' && !input.includes('\n') && e.currentTarget.selectionStart === input.length) {
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
              placeholder={isListening ? "Listening…" : "Message…"}
              aria-label="Message agent"
              title="Type, speak, or drop files. Enter to send; Option+Enter or Shift+Enter for a new line."
              disabled={sending || streaming || !gatewayAvailable || isListening || !chatEnabled}
              className="block w-full min-h-10 max-h-40 resize-y px-4 pr-10 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent text-sm disabled:bg-gray-50 disabled:cursor-not-allowed dark:border-gray-700 dark:bg-gray-900"
            />
            <button
              type="button"
              onClick={() => { if (inputRef.current) inputRef.current.style.height = ''; const next = !composerExpanded; saveChatComposerExpanded(next); setComposerExpanded(next) }}
              className="absolute right-2 top-1.5 rounded p-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
              aria-label={composerExpanded ? 'Collapse message box' : 'Expand message box'}
              title={composerExpanded ? 'Collapse message box' : 'Expand message box'}
              aria-expanded={composerExpanded}
            >
              <svg className={`h-4 w-4 transition-transform ${composerExpanded ? '' : 'rotate-180'}`} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m5 7 5 5 5-5" /></svg>
            </button>
            </div>
            {streaming ? (
              <button
                onClick={cancelStreaming}
                disabled={cancelling}
                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors text-sm font-medium disabled:opacity-60"
              >
                {cancelling ? 'Stopping…' : 'Cancel'}
              </button>
            ) : (
              <button
                ref={sendButtonRef}
                onClick={() => sendMessage()}
                disabled={(!input.trim() && attachments.length === 0) || sending || !gatewayAvailable || !chatEnabled}
                className="px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 transition-colors text-sm font-medium disabled:bg-gray-200 disabled:text-gray-600 dark:disabled:bg-gray-700 dark:disabled:text-gray-300 disabled:cursor-not-allowed"
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
                  <p className="text-sm text-gray-400 text-center py-8">No conversations yet</p>
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
                            {archive.active ? 'Current conversation' : new Date(archive.timestamp).toLocaleDateString()} • {archive.messageCount} messages
                          </div>
                        </button>
                        {!archive.active && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setDeleteConfirm(archive.filename); }}
                            className="p-3 text-red-400 hover:text-red-600 transition-colors"
                            title="Delete archive"
                          >
                            🗑
                          </button>
                        )}
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
                  {!viewingArchive.active && (
                    <button
                      onClick={() => restoreArchive(viewingArchive.filename)}
                      className="text-xs px-2 py-1 text-sky-600 hover:bg-sky-50 rounded transition-colors"
                      title="Continue this conversation"
                    >
                      ↺ Continue
                    </button>
                  )}
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
                  (() => {
                    const archiveRows = buildAgentChatTimelineRows(
                      viewingArchive.messages.map((message, index) => ({
                        id: `${index}`,
                        timestamp: message.timestamp,
                      }))
                    )
                    return archiveRows.map((row) => {
                      if (row.type === 'separator') {
                        return (
                          <div key={row.key} className="flex items-center gap-3 py-1">
                            <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
                            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-400 dark:text-gray-500">
                              {row.label}
                            </div>
                            <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
                          </div>
                        )
                      }

                      const idx = Number.parseInt(row.key, 10)
                      const msg = viewingArchive.messages[idx]
                      if (!msg) return null

                      return (
                        <div
                          key={row.key}
                          className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={`max-w-[75%] rounded-lg px-4 py-2.5 ${
                              msg.role === 'user'
                                ? 'bg-sky-700 text-white'
                                : 'bg-gray-100 text-gray-800'
                            }`}
                          >
                            <p className={`text-xs mb-1 ${msg.role === 'user' ? 'text-sky-100' : 'text-gray-600'}`}>
                              {formatChatTime(msg.timestamp, shouldShowCalendarDate(msg.timestamp))}
                            </p>
                            <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                          </div>
                        </div>
                      )
                    })
                  })()
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
