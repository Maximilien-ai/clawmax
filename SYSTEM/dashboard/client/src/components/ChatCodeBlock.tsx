import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  getAgentChatCodeBlockClassName,
  getAgentChatCodeFrameClassName,
  getAgentChatCodeHeaderClassName,
  getCodeBlockContent,
  type AgentChatMarkdownRole,
  type MarkdownNode,
} from '../lib/agentChatMarkdown'
import { copyText } from '../lib/clipboard'

type CopyState = 'idle' | 'copied' | 'failed'

const COPY_LABELS: Record<CopyState, string> = { idle: 'Copy', copied: 'Copied', failed: 'Copy failed' }
const COPY_ANNOUNCEMENTS: Record<CopyState, string> = { idle: '', copied: 'Code copied to clipboard', failed: 'Could not copy the code' }

export function CopyIcon({ state, className = 'h-3.5 w-3.5' }: { state: CopyState; className?: string }) {
  if (state === 'copied') {
    return (
      <svg className={className} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
      </svg>
    )
  }
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
      <rect x="6.75" y="6.75" width="10" height="10" rx="1.75" />
      <path d="M13.25 6.75V4.5a1.75 1.75 0 0 0-1.75-1.75h-6.75A1.75 1.75 0 0 0 3 4.5v6.75A1.75 1.75 0 0 0 4.75 13h2" />
    </svg>
  )
}

/**
 * A fenced code block: its language, a Copy button that copies exactly the code, then the code.
 * Always visible, not on hover, so it works on touch screens and is reachable by keyboard.
 */
export function ChatCodeBlock({ node, children, role }: { node?: MarkdownNode; children?: ReactNode; role: AgentChatMarkdownRole }) {
  const [copyState, setCopyState] = useState<CopyState>('idle')
  const resetTimer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(resetTimer.current), [])
  const { language } = getCodeBlockContent(node)

  async function copy() {
    window.clearTimeout(resetTimer.current)
    try {
      // From the node this render shows, so a block still streaming copies what is on screen.
      await copyText(getCodeBlockContent(node).code)
      setCopyState('copied')
    } catch {
      setCopyState('failed')
    }
    resetTimer.current = window.setTimeout(() => setCopyState('idle'), 2000)
  }

  const userRole = role === 'user'
  return (
    <div className={getAgentChatCodeFrameClassName(role)}>
      <div className={getAgentChatCodeHeaderClassName(role)}>
        <span className="truncate font-mono">{language ?? 'code'}</span>
        <button
          type="button"
          onClick={() => { void copy() }}
          aria-label={language ? `Copy ${language} code` : 'Copy code'}
          className={`inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 font-medium transition-colors focus:outline-none focus-visible:ring-2 ${
            userRole
              ? 'hover:bg-white/15 focus-visible:ring-white/70'
              : 'hover:bg-gray-200 hover:text-gray-900 focus-visible:ring-sky-500 dark:hover:bg-slate-800 dark:hover:text-gray-100'
          } ${copyState === 'failed' ? (userRole ? 'text-red-200' : 'text-red-600 dark:text-red-400') : ''}`}
        >
          <CopyIcon state={copyState} />
          <span>{COPY_LABELS[copyState]}</span>
        </button>
      </div>
      <pre className={getAgentChatCodeBlockClassName(role)}>{children}</pre>
      <span className="sr-only" aria-live="polite">{COPY_ANNOUNCEMENTS[copyState]}</span>
    </div>
  )
}

// Stable component identities for react-markdown: a component created per render would remount
// every block on each re-render (a streamed delta, the elapsed-time tick) and drop "Copied".
export function AssistantCodeBlock(props: { node?: MarkdownNode; children?: ReactNode }) {
  return <ChatCodeBlock {...props} role="assistant" />
}

export function UserCodeBlock(props: { node?: MarkdownNode; children?: ReactNode }) {
  return <ChatCodeBlock {...props} role="user" />
}
