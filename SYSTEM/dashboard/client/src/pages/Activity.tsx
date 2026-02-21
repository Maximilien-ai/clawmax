import React, { useEffect, useState, useCallback } from 'react'

interface ActivityEntry {
  agentId: string
  file: string
  mtime: string
  ageMins: number
}

type SortCol = 'age' | 'agent' | 'type' | 'file'
type SortDir = 'asc' | 'desc'

const FILE_TYPES: Record<string, { label: string; cls: string }> = {
  'TODOs.md':     { label: 'tasks',     cls: 'bg-orange-50 text-orange-700' },
  'COMPLETED.md': { label: 'done',      cls: 'bg-green-50 text-green-700' },
  'HEARTBEAT.md': { label: 'heartbeat', cls: 'bg-blue-50 text-blue-700' },
  'IDENTITY.md':  { label: 'identity',  cls: 'bg-purple-50 text-purple-700' },
}

function fileType(name: string) {
  return FILE_TYPES[name] ?? { label: name.replace(/\.md$/, ''), cls: 'bg-gray-100 text-gray-500' }
}

function timeAgo(mins: number): string {
  if (mins < 1) return 'just now'
  if (mins < 60) return `${Math.floor(mins)}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function secAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 5) return 'just now'
  if (s < 60) return `${s}s ago`
  return `${Math.floor(s / 60)}m ago`
}

function sortEntries(entries: ActivityEntry[], col: SortCol, dir: SortDir): ActivityEntry[] {
  const sorted = [...entries].sort((a, b) => {
    let cmp = 0
    if (col === 'age') cmp = a.ageMins - b.ageMins
    else if (col === 'agent') cmp = a.agentId.localeCompare(b.agentId)
    else if (col === 'type') cmp = fileType(a.file).label.localeCompare(fileType(b.file).label)
    else if (col === 'file') cmp = a.file.localeCompare(b.file)
    return dir === 'asc' ? cmp : -cmp
  })
  return sorted
}

function SortIndicator({ col, sortCol, sortDir }: { col: SortCol; sortCol: SortCol | null; sortDir: SortDir }) {
  if (sortCol !== col) return <span className="ml-1 opacity-20">↕</span>
  return <span className="ml-1 opacity-60">{sortDir === 'asc' ? '↑' : '↓'}</span>
}

interface ActivityProps {
  onNavigateToDoc?: (file: string) => void
}

export default function Activity({ onNavigateToDoc }: ActivityProps = {}) {
  const [feed, setFeed] = useState<ActivityEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastRefreshed, setLastRefreshed] = useState<number>(Date.now())
  const [refreshedLabel, setRefreshedLabel] = useState<string>('just now')
  const [cooling, setCooling] = useState(false)
  const [sortCol, setSortCol] = useState<SortCol>('age')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [debugAgent, setDebugAgent] = useState<string | null>(null)
  const [showSystemLogs, setShowSystemLogs] = useState(false)

  const fetchFeed = useCallback(() => {
    fetch('/api/activity')
      .then(r => r.json())
      .then(d => {
        setFeed(d.feed)
        setLoading(false)
        setLastRefreshed(Date.now())
      })
      .catch(() => {
        setError('Failed to load activity')
        setLoading(false)
      })
  }, [])

  useEffect(() => {
    fetchFeed()
    const interval = setInterval(fetchFeed, 30000)
    return () => clearInterval(interval)
  }, [fetchFeed])

  useEffect(() => {
    const ticker = setInterval(() => {
      setRefreshedLabel(secAgo(lastRefreshed))
    }, 5000)
    setRefreshedLabel(secAgo(lastRefreshed))
    return () => clearInterval(ticker)
  }, [lastRefreshed])

  const handleRefresh = () => {
    if (cooling) return
    setCooling(true)
    fetchFeed()
    setTimeout(() => setCooling(false), 3000)
  }

  const handleSort = (col: SortCol) => {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortCol(col)
      setSortDir('asc')
    }
  }

  const rows = sortEntries(feed, sortCol, sortDir)

  const thCls = 'px-4 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wider cursor-pointer select-none hover:text-gray-600 transition-colors text-left'

  return (
    <div className="flex-1 overflow-y-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Installation Activity</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            <span className="flex items-center gap-1.5">
            All file writes across all agents
            <span className="text-gray-300">·</span>
            <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse inline-block" title="Auto-refreshes every 30s" />
            refreshed {refreshedLabel}
          </span>
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setShowSystemLogs(true)}
            className="text-sm font-medium text-gray-600 hover:text-gray-800 transition-colors"
          >
            📋 System Logs
          </button>
          <button
            onClick={handleRefresh}
            disabled={cooling}
            className={`text-sm font-medium transition-colors ${
              cooling
                ? 'text-gray-300 cursor-not-allowed'
                : 'text-sky-600 hover:text-sky-800'
            }`}
          >
            {cooling ? 'Refreshing…' : '↻ Refresh'}
          </button>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center h-32 text-gray-400 text-sm">
          Loading activity...
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>
      )}

      {!loading && !error && rows.length === 0 && (
        <div className="flex flex-col items-center justify-center h-48 text-gray-400">
          <p className="text-sm">No activity found</p>
          <p className="text-xs mt-1 text-gray-300">Agent file writes will appear here</p>
        </div>
      )}

      {!loading && !error && rows.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className={`${thCls} w-24`} onClick={() => handleSort('age')}>
                  Age<SortIndicator col="age" sortCol={sortCol} sortDir={sortDir} />
                </th>
                <th className={`${thCls} w-24`} onClick={() => handleSort('agent')}>
                  Agent<SortIndicator col="agent" sortCol={sortCol} sortDir={sortDir} />
                </th>
                <th className={`${thCls} w-28`} onClick={() => handleSort('type')}>
                  Type<SortIndicator col="type" sortCol={sortCol} sortDir={sortDir} />
                </th>
                <th className={thCls} onClick={() => handleSort('file')}>
                  File<SortIndicator col="file" sortCol={sortCol} sortDir={sortDir} />
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map((entry, i) => {
                const ft = fileType(entry.file)
                return (
                  <tr key={`${entry.agentId}-${entry.file}-${i}`} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-2 text-xs text-gray-400 font-mono shrink-0">
                      {timeAgo(entry.ageMins)}
                    </td>
                    <td className="px-4 py-2">
                      <button
                        onClick={() => setDebugAgent(entry.agentId)}
                        className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-medium bg-sky-50 text-sky-700 hover:bg-sky-100 transition-colors cursor-pointer"
                        title="View agent logs and status"
                      >
                        {entry.agentId}
                      </button>
                    </td>
                    <td className="px-4 py-2">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${ft.cls}`}>
                        {ft.label}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-xs font-mono">
                      {onNavigateToDoc ? (
                        <button
                          onClick={() => onNavigateToDoc(`AGENTS/${entry.agentId}/${entry.file}`)}
                          className="text-sky-600 hover:text-sky-800 hover:underline transition-colors text-left"
                          title="Open in Documents tab"
                        >
                          {entry.file}
                        </button>
                      ) : (
                        <span className="text-gray-400">{entry.file}</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Agent Debug Modal */}
      {debugAgent && (
        <AgentDebugModal agentId={debugAgent} onClose={() => setDebugAgent(null)} />
      )}

      {/* System Logs Modal */}
      {showSystemLogs && (
        <SystemLogsModal onClose={() => setShowSystemLogs(false)} />
      )}
    </div>
  )
}

// Agent Debug Modal Component
function AgentDebugModal({ agentId, onClose }: { agentId: string; onClose: () => void }) {
  const [tab, setTab] = useState<'health' | 'status'>('health')
  const [health, setHealth] = useState<any>(null)
  const [status, setStatus] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [showRawJson, setShowRawJson] = useState(false)

  // Fetch health
  React.useEffect(() => {
    if (tab !== 'health') return
    setLoading(true)
    fetch(`/api/agents/${agentId}/health`)
      .then(r => r.json())
      .then(d => {
        setHealth(d)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [agentId, tab])

  // Fetch gateway status
  React.useEffect(() => {
    if (tab !== 'status') return
    setLoading(true)
    fetch(`/api/agents/${agentId}/gateway-status`)
      .then(r => r.json())
      .then(d => {
        setStatus(d.status || '')
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [agentId, tab])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-2xl w-[90vw] max-w-5xl h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between shrink-0">
          <h2 className="text-lg font-semibold text-gray-800">
            Agent Debug: <span className="font-mono text-sky-600">{agentId}</span>
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors text-xl"
          >
            ×
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 px-6 shrink-0 items-center justify-between">
          <div className="flex">
            {(['health', 'status'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
                  tab === t
                    ? 'border-sky-600 text-sky-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
          {tab === 'health' && health && (
            <button
              onClick={() => setShowRawJson(!showRawJson)}
              className="text-xs px-3 py-1 mr-4 rounded bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors"
            >
              {showRawJson ? 'Show Friendly' : 'Show JSON'}
            </button>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {tab === 'health' && (
            <div>
              {loading && <div className="text-gray-400">Loading health...</div>}
              {!loading && health && (
                showRawJson ? (
                  <pre className="bg-gray-50 rounded-lg p-4 text-xs overflow-auto">
                    {JSON.stringify(health, null, 2)}
                  </pre>
                ) : (
                  <HealthDisplay health={health} />
                )
              )}
            </div>
          )}

          {tab === 'status' && (
            <div>
              {loading && <div className="text-gray-400">Loading status...</div>}
              {!loading && status && (
                <pre className="bg-gray-900 text-green-400 rounded-lg p-4 text-xs overflow-auto font-mono whitespace-pre-wrap">
                  {status}
                </pre>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

// Health Display Component - human-friendly format
function HealthDisplay({ health }: { health: any }) {
  return (
    <div className="space-y-4">
      {/* Overall Status */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${health.ok ? 'bg-green-400' : 'bg-red-400'}`} />
          <div>
            <div className="font-semibold text-gray-800">
              {health.ok ? 'Healthy' : 'Unhealthy'}
            </div>
            <div className="text-xs text-gray-500">
              Response time: {health.durationMs}ms
            </div>
          </div>
        </div>
      </div>

      {/* Channels */}
      {health.channels && Object.keys(health.channels).length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h3 className="font-semibold text-gray-800 mb-3">Channels</h3>
          <div className="space-y-3">
            {Object.entries(health.channels).map(([name, info]: [string, any]) => (
              <div key={name} className="border-l-2 border-sky-400 pl-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-gray-700">{name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded ${info.connected ? 'bg-green-100 text-green-700' : info.linked ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-500'}`}>
                    {info.connected ? 'Connected' : info.linked ? 'Linked' : 'Not linked'}
                  </span>
                </div>
                {info.self?.e164 && (
                  <div className="text-xs text-gray-500 font-mono">{info.self.e164}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Gateway */}
      {health.gateway && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h3 className="font-semibold text-gray-800 mb-3">Gateway</h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-gray-500">Port:</span>
              <span className="ml-2 font-mono">{health.gateway.port || 'N/A'}</span>
            </div>
            <div>
              <span className="text-gray-500">Mode:</span>
              <span className="ml-2">{health.gateway.mode || 'N/A'}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// System Logs Modal Component
function SystemLogsModal({ onClose }: { onClose: () => void }) {
  const [logs, setLogs] = useState<string[]>([])
  const logsEndRef = React.useRef<HTMLDivElement>(null)

  // Auto-scroll logs
  React.useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs])

  // Fetch logs via SSE - system-wide, no agent ID
  React.useEffect(() => {
    const eventSource = new EventSource('/api/system/logs')

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data)
      if (data.line) {
        setLogs(prev => [...prev, data.line])
      }
    }

    eventSource.onerror = () => {
      eventSource.close()
    }

    return () => {
      eventSource.close()
    }
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-2xl w-[90vw] max-w-5xl h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between shrink-0">
          <h2 className="text-lg font-semibold text-gray-800">System Logs</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors text-xl"
          >
            ×
          </button>
        </div>

        {/* Logs Content */}
        <div className="flex-1 overflow-auto p-6">
          <div className="bg-gray-900 rounded-lg p-4 font-mono text-xs text-green-400 h-full overflow-auto">
            {logs.length === 0 && <div className="text-gray-500">Waiting for logs...</div>}
            {logs.map((line, i) => (
              <div key={i} className="whitespace-pre-wrap break-all">{line}</div>
            ))}
            <div ref={logsEndRef} />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
