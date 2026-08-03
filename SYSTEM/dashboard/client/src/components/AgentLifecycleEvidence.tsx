import React, { useEffect, useState } from 'react'
import { ProductIconCell } from '../lib/productIcons'

export interface AgentLifecycleEvidenceData {
  subject: {
    kind?: 'agent' | 'workflow' | 'group' | 'community'
    id: string
    name: string
    createdAt: string | null
    lastModifiedAt: string | null
    currentModel: string | null
    currentStatus?: string | null
  }
  summary: {
    fileCount: number
    conversationCount: number
    messageCount: number
    observedModelCount: number
    observedChangeCount: number
    executionCount?: number
    participantCount?: number
    archiveCount?: number
  }
  files: Array<{ path: string; size: number; modifiedAt: string }>
  conversations: Array<{ id: string; active: boolean; messageCount: number; modifiedAt: string }>
  modelHistory: Array<{ model: string; observedAt: string | null; current: boolean }>
  events: Array<{
    id: string
    type: 'created' | 'modified' | 'file' | 'conversation' | 'model' | 'execution'
    at: string
    title: string
    detail: string
  }>
  limitations: string[]
  executions?: Array<{ id: string; status: string; startedAt: string; completedAt: string | null; participantCount: number }>
}

function formatDate(value: string | null): string {
  if (!value) return 'Not observed'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

function eventIcon(type: AgentLifecycleEvidenceData['events'][number]['type']): string {
  if (type === 'created') return 'create'
  if (type === 'conversation') return 'communications'
  if (type === 'model') return 'cpu'
  if (type === 'modified') return 'edit'
  if (type === 'execution') return 'workflow'
  return 'document'
}

export default function AgentLifecycleEvidence({
  pluginSlug,
  agentId,
  subjectType = 'agent',
  focus,
  timeWindow,
}: {
  pluginSlug: string
  agentId: string
  subjectType?: 'agent' | 'workflow' | 'group' | 'community'
  focus: string
  timeWindow: string
}) {
  const [evidence, setEvidence] = useState<AgentLifecycleEvidenceData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(() => {
    if (typeof window === 'undefined') return true
    return localStorage.getItem(`clawmax-lifecycle-xray-expanded:${subjectType}:${agentId}`) !== 'false'
  })

  useEffect(() => {
    setExpanded(localStorage.getItem(`clawmax-lifecycle-xray-expanded:${subjectType}:${agentId}`) !== 'false')
  }, [agentId, subjectType])

  const toggleExpanded = () => {
    setExpanded((current) => {
      const next = !current
      localStorage.setItem(`clawmax-lifecycle-xray-expanded:${subjectType}:${agentId}`, String(next))
      return next
    })
  }

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    const resource = subjectType === 'workflow' ? `workflows/${encodeURIComponent(agentId)}`
      : subjectType === 'agent' ? `agents/${encodeURIComponent(agentId)}`
        : `communications/${subjectType}/${encodeURIComponent(agentId)}`
    fetch(`/api/plugins/${encodeURIComponent(pluginSlug)}/lifecycle/${resource}`, { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json()
        if (!response.ok) throw new Error(payload?.error || 'Failed to load lifecycle evidence')
        setEvidence(payload.evidence)
      })
      .catch((reason) => {
        if (reason?.name !== 'AbortError') setError(reason?.message || 'Failed to load lifecycle evidence')
      })
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [agentId, pluginSlug, subjectType])

  if (loading) return <div className="rounded-lg border border-gray-200 bg-white p-5 text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-900/40">Loading agent lifecycle...</div>
  if (error) return <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/10 dark:text-red-300">{error}</div>
  if (!evidence) return null

  const isWorkflow = evidence.subject.kind === 'workflow' || subjectType === 'workflow'
  const isCommunication = evidence.subject.kind === 'group' || evidence.subject.kind === 'community' || subjectType === 'group' || subjectType === 'community'
  const summary = isWorkflow ? [
    { label: 'Created', value: formatDate(evidence.subject.createdAt), icon: 'calendar' },
    { label: 'Status', value: evidence.subject.currentStatus || 'unknown', icon: 'activity' },
    { label: 'Runs', value: String(evidence.summary.executionCount || 0), icon: 'workflow' },
    { label: 'Participants', value: String(evidence.summary.participantCount || 0), icon: 'agents' },
    { label: 'Artifacts', value: String(evidence.summary.fileCount), icon: 'document' },
  ] : isCommunication ? [
    { label: 'Started', value: formatDate(evidence.subject.createdAt), icon: 'calendar' },
    { label: 'Messages', value: String(evidence.summary.messageCount), icon: 'communications' },
    { label: 'Archives', value: String(evidence.summary.archiveCount || 0), icon: 'archive' },
    { label: 'Events', value: String(evidence.summary.observedChangeCount), icon: 'activity' },
  ] : [
    { label: 'Created', value: formatDate(evidence.subject.createdAt), icon: 'calendar' },
    { label: 'Current model', value: evidence.subject.currentModel || 'Not configured', icon: 'cpu' },
    { label: 'Files', value: String(evidence.summary.fileCount), icon: 'document' },
    { label: 'Conversations', value: `${evidence.summary.conversationCount} (${evidence.summary.messageCount} messages)`, icon: 'communications' },
    { label: 'Observed changes', value: String(evidence.summary.observedChangeCount), icon: 'edit' },
  ]
  const windowDays = timeWindow === '24-hours' ? 1 : timeWindow === '7-days' ? 7 : timeWindow === '30-days' ? 30 : null
  const cutoff = windowDays ? Date.now() - windowDays * 24 * 60 * 60 * 1000 : null
  const focusTypes = focus === 'activity'
    ? new Set(['conversation'])
    : focus === 'artifacts'
      ? new Set(['file'])
      : focus === 'configuration'
        ? new Set(['created', 'modified', 'model'])
        : null
  const visibleEvents = evidence.events
    .filter((event) => cutoff === null || new Date(event.at).getTime() >= cutoff)
    .filter((event) => focusTypes === null || focusTypes.has(event.type))
    .slice(-40)

  return (
    <section className="space-y-4" aria-label={`${evidence.subject.name} lifecycle evidence`}>
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-900/40">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{evidence.subject.name} X-ray</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{isWorkflow ? 'Observed configuration, executions, participants, and artifacts for this workflow.' : isCommunication ? 'Observed messages and archived conversations for this communication space.' : 'Observed configuration, files, conversations, and model history for this agent.'}</p>
        </div>
        <button
          type="button"
          onClick={toggleExpanded}
          aria-expanded={expanded}
          aria-label={`${expanded ? 'Collapse' : 'Expand'} ${evidence.subject.name} X-ray`}
          title={expanded ? 'Hide X-ray details' : 'Show X-ray details'}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-white text-lg text-gray-600 hover:border-sky-300 hover:text-sky-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
        >
          <span className={`transition-transform ${expanded ? 'rotate-90' : ''}`}>›</span>
        </button>
      </div>

      {expanded && <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {summary.map((entry) => (
          <div key={entry.label} className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900/40">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
              <ProductIconCell iconName={entry.icon} label={entry.label} size="sm" className="border-transparent bg-transparent text-current" />
              {entry.label}
            </div>
            <div className="mt-2 break-words text-sm font-semibold text-gray-900 dark:text-gray-100">{entry.value}</div>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-900/40">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Lifecycle timeline</h3>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Oldest to newest. Showing {focus} evidence for {timeWindow === 'all' ? 'all available history' : `the last ${timeWindow.replace('-', ' ')}`}.</p>
          </div>
          <span className="rounded-md bg-sky-50 px-2 py-1 text-xs font-medium text-sky-700 dark:bg-sky-900/20 dark:text-sky-300">Last observed {formatDate(evidence.subject.lastModifiedAt)}</span>
        </div>
        {visibleEvents.length === 0 ? (
          <div className="mt-5 rounded-lg border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-500 dark:border-gray-700">No lifecycle events are available yet.</div>
        ) : (
          <ol className="relative mt-6 space-y-0 before:absolute before:bottom-3 before:left-[19px] before:top-3 before:w-px before:bg-sky-200 dark:before:bg-sky-800 sm:before:left-1/2">
            {visibleEvents.map((event, index) => (
              <li key={event.id} className={`relative grid min-h-[88px] grid-cols-[40px_minmax(0,1fr)] gap-3 pb-4 sm:grid-cols-2 sm:gap-10 ${index % 2 === 0 ? '' : 'sm:text-right'}`}>
                <span className="absolute left-[10px] top-2 z-10 flex h-5 w-5 items-center justify-center rounded-full border-2 border-sky-500 bg-white dark:bg-gray-900 sm:left-1/2 sm:-translate-x-1/2" />
                <div className={`${index % 2 === 0 ? 'sm:col-start-2' : 'sm:col-start-1 sm:row-start-1'} col-start-2 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/60`}>
                  <div className={`flex items-center gap-2 ${index % 2 === 0 ? '' : 'sm:flex-row-reverse'}`}>
                    <ProductIconCell iconName={eventIcon(event.type)} label={event.title} size="sm" className="border-transparent bg-transparent text-current" />
                    <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{event.title}</span>
                  </div>
                  <div className="mt-1 break-words text-xs text-gray-600 dark:text-gray-300">{event.detail}</div>
                  <time className="mt-2 block text-xs text-gray-400">{formatDate(event.at)}</time>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900/40">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{isWorkflow ? 'Recent runs' : isCommunication ? 'Recent messages' : 'Models'}</h3>
          <div className="mt-3 space-y-2">
            {isWorkflow ? (evidence.executions || []).slice(0, 8).map((entry) => (
              <div key={entry.id} className="rounded-md bg-gray-50 px-3 py-2 text-sm dark:bg-gray-800/60">
                <div className="break-all font-medium text-gray-800 dark:text-gray-200">{entry.status} · {entry.participantCount} participants</div>
                <div className="mt-1 text-xs text-gray-500">{formatDate(entry.startedAt)}</div>
              </div>
            )) : isCommunication ? evidence.events.filter((entry) => entry.type === 'conversation').slice(-8).reverse().map((entry) => (
              <div key={entry.id} className="rounded-md bg-gray-50 px-3 py-2 text-sm dark:bg-gray-800/60">
                <div className="break-words font-medium text-gray-800 dark:text-gray-200">{entry.detail}</div>
                <div className="mt-1 text-xs text-gray-500">{formatDate(entry.at)}</div>
              </div>
            ) : evidence.modelHistory.length > 0 ? evidence.modelHistory.map((entry) => (
              <div key={entry.model} className="rounded-md bg-gray-50 px-3 py-2 text-sm dark:bg-gray-800/60">
                <div className="break-all font-medium text-gray-800 dark:text-gray-200">{entry.model}</div>
                <div className="mt-1 text-xs text-gray-500">{entry.current ? 'Current model' : `Observed ${formatDate(entry.observedAt)}`}</div>
              </div>
            )) : <div className="text-sm text-gray-500">{isWorkflow ? 'No workflow runs observed.' : isCommunication ? 'No retained messages observed.' : 'No model metadata observed.'}</div>}
          </div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900/40">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{isWorkflow ? 'Definition and artifacts' : isCommunication ? 'Archived history' : 'Recent files'}</h3>
          <div className="mt-3 space-y-2">
            {evidence.files.slice(0, 8).map((file) => <div key={file.path} className="min-w-0 text-sm"><div className="break-words font-medium text-gray-800 dark:text-gray-200">{file.path}</div><div className="text-xs text-gray-500">{formatDate(file.modifiedAt)}</div></div>)}
            {isCommunication ? evidence.events.filter((entry) => entry.type === 'file').slice(-8).reverse().map((entry) => <div key={entry.id} className="text-sm"><div className="font-medium text-gray-800 dark:text-gray-200">{entry.title}</div><div className="text-xs text-gray-500">{entry.detail} · {formatDate(entry.at)}</div></div>) : null}
            {evidence.files.length === 0 && !isCommunication && <div className="text-sm text-gray-500">No associated files observed.</div>}
            {isCommunication && evidence.summary.archiveCount === 0 && <div className="text-sm text-gray-500">No archived conversations observed.</div>}
          </div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900/40">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{isWorkflow ? 'Execution coverage' : isCommunication ? 'Scope' : 'Recent conversations'}</h3>
          <div className="mt-3 space-y-2">
            {isWorkflow ? <div className="text-sm text-gray-600 dark:text-gray-300">{evidence.summary.executionCount || 0} retained runs across {evidence.summary.participantCount || 0} unique agents.</div> : isCommunication ? <div className="text-sm text-gray-600 dark:text-gray-300">This {evidence.subject.kind || subjectType} is tracked as a shared communication space. Open Communications for members and full message content.</div> : evidence.conversations.slice(0, 8).map((entry) => <div key={entry.id} className="text-sm"><div className="break-all font-medium text-gray-800 dark:text-gray-200">{entry.active ? 'Current session' : entry.id}</div><div className="text-xs text-gray-500">{entry.messageCount} messages · {formatDate(entry.modifiedAt)}</div></div>)}
            {!isWorkflow && !isCommunication && evidence.conversations.length === 0 && <div className="text-sm text-gray-500">No user conversations observed.</div>}
          </div>
        </div>
      </div>

      <details className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-xs text-gray-500 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-400">
        <summary className="cursor-pointer font-medium text-gray-700 dark:text-gray-300">Evidence limitations</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">{evidence.limitations.map((entry) => <li key={entry}>{entry}</li>)}</ul>
      </details>
      </>}
    </section>
  )
}
