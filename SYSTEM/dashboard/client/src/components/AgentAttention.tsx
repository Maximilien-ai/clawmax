import React, { useState } from 'react'
import { useAgentReadiness } from '../contexts/AgentReadinessContext'
import { agentAttentionKey, type AgentAttention as Attention } from '../lib/agentReadiness'

export function repairAgentAttention(attention: Attention, refresh: () => void) {
  if (attention.kind === 'unknown') { refresh(); return }
  if (attention.kind === 'runtime') {
    window.dispatchEvent(new CustomEvent('navigate-to-page', { detail: { page: 'logs' } }))
    return
  }
  window.dispatchEvent(new CustomEvent('open-byok-wizard', { detail: {
    step: 'models', provider: attention.provider,
    focus: attention.kind === 'model' ? 'preferred-model' : undefined,
  } }))
}

export function AgentAttention({ agentId, generation }: { agentId: string; generation?: string }) {
  const { entries, refresh } = useAgentReadiness()
  const [expanded, setExpanded] = useState(false)
  const entry = entries[agentAttentionKey(agentId, generation)]
  const attention = entry?.attention
  if (!attention) return null
  return <span className="inline-flex min-w-0 flex-wrap items-center gap-1 text-amber-800 dark:text-amber-200" onClick={event => event.stopPropagation()}>
    <button type="button" aria-label={`${entry.name}: needs attention. ${attention.message}`} aria-expanded={expanded}
      title={attention.message} onClick={() => setExpanded(value => !value)}
      className="inline-flex min-h-8 min-w-8 shrink-0 items-center justify-center rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-600">
      <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3 2 21h20L12 3Z" /><path d="M12 9v5m0 3v1" /></svg>
    </button>
    {expanded && <span role="status" className="block w-full whitespace-normal break-words rounded border border-amber-300 bg-amber-50 p-2 text-xs dark:border-amber-700 dark:bg-amber-950">
      {attention.message}{' '}<button type="button" className="font-semibold underline" onClick={() => repairAgentAttention(attention, refresh)}>{attention.action}</button>
    </span>}
  </span>
}

export function ByokAttentionSummary() {
  const { entries, refresh } = useAgentReadiness()
  const warnings = Object.values(entries).filter(entry => entry.attention?.kind === 'credentials' || entry.attention?.kind === 'model')
  if (!warnings.length) return null
  return <div role="status" className="mb-3 max-h-40 overflow-y-auto rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
    <p className="font-semibold">⚠ Needs attention</p>
    {warnings.map(entry => <p key={entry.id} className="mt-2 break-words">{entry.name}: {entry.attention!.message}{' '}
      <button type="button" className="font-semibold underline" onClick={() => repairAgentAttention(entry.attention!, refresh)}>{entry.attention!.action}</button>
    </p>)}
  </div>
}
