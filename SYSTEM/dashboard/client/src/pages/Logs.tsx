import React, { useState, useEffect, useRef } from 'react'

interface LogEntry {
  timestamp: string
  level: string
  agent?: string
  message: string
  raw: string
}

type DoctorResults = {
  healthy: boolean
  summary: { pass: number; fail: number; warn: number; fixed: number }
  results: Array<{ id: string; checks: Array<{ check: string; status: string; message: string }> }>
  platform: { cli?: boolean; gateway?: boolean; gatewayPort?: number | string | null }
  message?: string
}

function normalizeDoctorResults(data: any): DoctorResults {
  return {
    healthy: Boolean(data?.healthy),
    summary: {
      pass: Number(data?.summary?.pass || 0),
      fail: Number(data?.summary?.fail || 0),
      warn: Number(data?.summary?.warn || 0),
      fixed: Number(data?.summary?.fixed || 0),
    },
    results: Array.isArray(data?.results) ? data.results : [],
    platform: data?.platform || {},
    message: typeof data?.message === 'string' ? data.message : undefined,
  }
}

export default function Logs() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [paused, setPaused] = useState(false)
  const [autoScroll, setAutoScroll] = useState(true)
  const [searchFilter, setSearchFilter] = useState('')
  const [agentFilter, setAgentFilter] = useState('')
  const [levelFilter, setLevelFilter] = useState<string>('')
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showDoctor, setShowDoctor] = useState(false)
  const [doctorResults, setDoctorResults] = useState<DoctorResults | null>(null)
  const [doctorFixing, setDoctorFixing] = useState(false)
  const logsEndRef = useRef<HTMLDivElement>(null)
  const logsContainerRef = useRef<HTMLDivElement>(null)
  const eventSourceRef = useRef<EventSource | null>(null)
  const pausedLogsBufferRef = useRef<LogEntry[]>([])

  useEffect(() => {
    const handleOpenDoctor = async () => {
      setDoctorResults(null)
      setShowDoctor(true)
      try {
        const resp = await fetch('/api/agents/doctor', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fix: false }) })
        const data = await resp.json().catch(() => ({}))
        setDoctorResults(normalizeDoctorResults(resp.ok ? data : {
          ...data,
          healthy: false,
          message: data?.error || data?.message || `Doctor failed (${resp.status})`,
        }))
      } catch {
        setDoctorResults(normalizeDoctorResults(null))
      }
    }

    window.addEventListener('open-doctor', handleOpenDoctor)
    return () => window.removeEventListener('open-doctor', handleOpenDoctor)
  }, [])

  const runtimeHint = logs.find(log => log.raw.includes('missing dist/entry.(m)js'))
    ? 'OpenClaw is present but not built in this runtime image. Rebuild the image from the canonical Dockerfile with the pinned OpenClaw build stage.'
    : logs.find(log => log.raw.includes('openclaw fixture'))
      ? 'This runtime is still using a fixture OpenClaw build instead of the real CLI/runtime.'
      : null

  // Parse log line into structured entry
  const parseLogLine = (line: string): LogEntry => {
    // Example formats:
    // 2024-01-15 10:30:45 [INFO] [agent-name] Message here
    // [agent-name] Message
    // Or just plain text
    const timestampMatch = line.match(/^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})/)
    const levelMatch = line.match(/\b(ERROR|WARN|WARNING|INFO|DEBUG)\b/i)

    // Try multiple patterns for agent name
    let agent: string | undefined
    // Pattern 1: [agent-name]
    const bracketMatch = line.match(/\[([a-z0-9_-]+)\]/i)
    if (bracketMatch && bracketMatch[1] && !['ERROR', 'WARN', 'WARNING', 'INFO', 'DEBUG'].includes(bracketMatch[1].toUpperCase())) {
      agent = bracketMatch[1]
    }
    // Pattern 2: agent:message or agent -
    if (!agent) {
      const colonMatch = line.match(/^([a-z0-9_-]+)[:|\s-]/i)
      if (colonMatch) {
        agent = colonMatch[1]
      }
    }

    return {
      timestamp: timestampMatch?.[1] || new Date().toISOString().split('T').join(' ').split('.')[0],
      level: levelMatch?.[1]?.toUpperCase() || 'INFO',
      agent,
      message: line,
      raw: line
    }
  }

  // Connect to SSE stream
  useEffect(() => {
    const connectSSE = () => {
      setError(null)
      const eventSource = new EventSource('/api/system/logs')
      eventSourceRef.current = eventSource

      eventSource.onopen = () => {
        setConnected(true)
        setError(null)
      }

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          if (data.line) {
            const entry = parseLogLine(data.line)

            if (paused) {
              pausedLogsBufferRef.current.push(entry)
            } else {
              setLogs(prev => [...prev, entry].slice(-1000)) // Keep last 1000 logs
            }
          }
          if (data.error) {
            console.error('Log stream error:', data.error)
          }
        } catch (err) {
          console.error('Failed to parse log event:', err)
        }
      }

      eventSource.onerror = () => {
        setConnected(false)
        setError('Log stream interrupted — retrying...')
        eventSource.close()
        // Retry after 3 seconds
        setTimeout(connectSSE, 3000)
      }
    }

    connectSSE()

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
      }
    }
  }, [paused])

  // Auto-scroll to bottom
  useEffect(() => {
    if (autoScroll && !paused) {
      if (logsEndRef.current) {
        logsEndRef.current.scrollIntoView({ behavior: 'auto' })
      } else if (logsContainerRef.current) {
        logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight
      }
    }
  }, [logs, autoScroll, paused])

  // Resume from pause - apply buffered logs
  const handleResume = () => {
    if (pausedLogsBufferRef.current.length > 0) {
      setLogs(prev => [...prev, ...pausedLogsBufferRef.current].slice(-1000))
      pausedLogsBufferRef.current = []
    }
    setPaused(false)
  }

  // Filter logs
  const filteredLogs = logs.filter(log => {
    if (searchFilter && !log.raw.toLowerCase().includes(searchFilter.toLowerCase())) {
      return false
    }
    if (agentFilter && log.agent !== agentFilter) {
      return false
    }
    if (levelFilter && log.level !== levelFilter) {
      return false
    }
    return true
  })

  // Get unique agents from logs
  const uniqueAgents = Array.from(new Set(logs.map(l => l.agent).filter(Boolean)))

  // Get log level color
  const getLevelColor = (level: string) => {
    switch (level) {
      case 'ERROR': return 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30'
      case 'WARN': return 'text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/30'
      case 'DEBUG': return 'text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800'
      default: return 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30'
    }
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 sm:py-6 flex flex-col">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">System</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Live system logs
            {connected && <span className="ml-2 text-green-600">● Connected</span>}
            {error && <span className="ml-2 text-red-600">● {error}</span>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            <button
              onClick={async () => {
                setDoctorResults(null)
                setShowDoctor(true)
                try {
                  const resp = await fetch('/api/agents/doctor', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fix: false }) })
                  const data = await resp.json().catch(() => ({}))
                  setDoctorResults(normalizeDoctorResults(resp.ok ? data : {
                    ...data,
                    healthy: false,
                    message: data?.error || data?.message || `Doctor failed (${resp.status})`,
                  }))
                } catch {
                  setDoctorResults(normalizeDoctorResults(null))
                }
              }}
              className="px-3 py-1.5 text-sm bg-cyan-50 hover:bg-cyan-100 text-cyan-700 rounded transition-colors dark:bg-cyan-900/20 dark:text-cyan-300 dark:hover:bg-cyan-900/40 border border-cyan-200 dark:border-cyan-800"
            >
              🩺 Doctor
            </button>
            <button
              onClick={() => setLogs([])}
              className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded transition-colors dark:bg-gray-800 dark:text-gray-300"
            >
              Clear
            </button>
            <button
              onClick={() => setAutoScroll(!autoScroll)}
              className={`px-3 py-1.5 text-sm rounded transition-colors ${
                autoScroll
                  ? 'bg-sky-500 text-white hover:bg-sky-600'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Auto-scroll
            </button>
            {paused ? (
              <button
                onClick={handleResume}
                className="px-3 py-1.5 text-sm bg-green-500 hover:bg-green-600 text-white rounded transition-colors"
              >
                Resume {pausedLogsBufferRef.current.length > 0 && `(+${pausedLogsBufferRef.current.length})`}
              </button>
            ) : (
              <button
                onClick={() => setPaused(true)}
                className="px-3 py-1.5 text-sm bg-amber-500 hover:bg-amber-600 text-white rounded transition-colors"
              >
                Pause
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Doctor results */}
      {showDoctor && (
        <div className="mb-4 p-4 rounded-lg border border-cyan-200 dark:border-cyan-800 bg-cyan-50 dark:bg-cyan-900/20">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium text-cyan-800 dark:text-cyan-200 text-sm">Platform Health Check</h3>
            <div className="flex items-center gap-2">
              <button
                onClick={async () => {
                  setDoctorFixing(true)
                  setDoctorResults(null)
                try {
                  const resp = await fetch('/api/agents/doctor', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fix: true }) })
                  const data = await resp.json().catch(() => ({}))
                  setDoctorResults(normalizeDoctorResults(resp.ok ? data : {
                    ...data,
                    healthy: false,
                    message: data?.error || data?.message || `Doctor failed (${resp.status})`,
                  }))
                } catch (err) {
                  setDoctorResults(normalizeDoctorResults(null))
                }
                  setDoctorFixing(false)
                }}
                disabled={doctorFixing}
                className="text-xs px-2 py-1 bg-cyan-600 text-white rounded hover:bg-cyan-700 disabled:bg-gray-300 transition-colors"
              >{doctorFixing ? 'Fixing...' : 'Auto-Fix'}</button>
              <button onClick={() => setShowDoctor(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-sm">&times;</button>
            </div>
          </div>
          {!doctorResults ? (
            <div className="text-sm text-gray-500">Checking...</div>
          ) : (
            <div className="space-y-2">
              <div className="flex gap-2 text-xs flex-wrap">
                <span className={`px-2 py-1 rounded ${doctorResults.platform?.cli ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'}`}>{doctorResults.platform?.cli ? '✓' : '✗'} CLI</span>
                <span className={`px-2 py-1 rounded ${doctorResults.platform?.gateway ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'}`}>{doctorResults.platform?.gateway ? '✓' : '⚠'} Gateway{doctorResults.platform?.gatewayPort ? `:${doctorResults.platform.gatewayPort}` : ''}</span>
                <span className={`px-2 py-1 rounded ${doctorResults.healthy && doctorResults.summary.warn === 0 ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'}`}>{doctorResults.summary.pass} pass, {doctorResults.summary.fail} fail, {doctorResults.summary.warn} warn, {doctorResults.summary.fixed} fixed</span>
              </div>
              {(doctorResults.results || []).filter((r: any) => (r.checks || []).some((c: any) => c.status !== 'pass')).map((r: any) => (
                <div key={r.id} className="text-xs text-gray-600 dark:text-gray-400">
                  <span className="font-mono font-medium">{r.id}:</span> {(r.checks || []).filter((c: any) => c.status !== 'pass').map((c: any) => `${c.status === 'fixed' ? '⟳' : c.status === 'fail' ? '✗' : '⚠'} ${c.message}`).join(' | ')}
                </div>
              ))}
              {doctorResults.healthy && doctorResults.summary.warn === 0 && <div className="text-xs text-green-600 dark:text-green-400">All agents healthy</div>}
              {doctorResults.healthy && doctorResults.summary.warn > 0 && <div className="text-xs text-amber-700 dark:text-amber-300">Agents are healthy, but runtime warnings still need attention.</div>}
              {doctorResults.message && doctorResults.results.length === 0 && (
                <div className="text-xs text-gray-500 dark:text-gray-400 whitespace-pre-wrap break-words">{doctorResults.message}</div>
              )}
              {doctorResults.message && doctorResults.results.length > 0 && (
                <div className="text-xs text-amber-700 dark:text-amber-300 whitespace-pre-wrap break-words">{doctorResults.message}</div>
              )}
            </div>
          )}
        </div>
      )}

      {runtimeHint && (
        <div className="mb-4 p-3 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 text-sm text-amber-800 dark:text-amber-200">
          {runtimeHint}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 sm:gap-3 mb-6">
        <input
          type="text"
          placeholder="Search logs..."
          value={searchFilter}
          onChange={(e) => setSearchFilter(e.target.value)}
          className="flex-1 min-w-0 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:border-gray-600"
        />
        <select
          value={agentFilter}
          onChange={(e) => setAgentFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:border-gray-600"
        >
          <option value="">All Agents</option>
          {uniqueAgents.map(agent => (
            <option key={agent} value={agent}>{agent}</option>
          ))}
        </select>
        <select
          value={levelFilter}
          onChange={(e) => setLevelFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:border-gray-600"
        >
          <option value="">All Levels</option>
          <option value="ERROR">ERROR</option>
          <option value="WARN">WARN</option>
          <option value="INFO">INFO</option>
          <option value="DEBUG">DEBUG</option>
        </select>
      </div>

      {/* Logs display */}
      <div ref={logsContainerRef} className="flex-1 overflow-auto bg-gray-900 text-gray-100 font-mono text-xs rounded-lg border border-gray-800" style={{ maxHeight: 'calc(100vh - 320px)', minHeight: '300px' }}>
        <div className="p-4">
          {filteredLogs.length === 0 && (
            <div className="text-center text-gray-500 py-8">
              {logs.length === 0 ? 'Waiting for logs...' : 'No logs match the current filters'}
            </div>
          )}
          {filteredLogs.map((log, idx) => (
            <div key={idx} className="py-0.5 hover:bg-gray-800 px-2 rounded">
              <span className="text-gray-500">{log.timestamp}</span>
              <span className={`ml-3 px-1.5 py-0.5 rounded text-xs font-semibold ${getLevelColor(log.level)}`}>
                {log.level}
              </span>
              {log.agent && (
                <span className="ml-2 text-purple-400">[{log.agent}]</span>
              )}
              <span className="ml-2 text-gray-300">{log.message}</span>
            </div>
          ))}
          <div ref={logsEndRef} />
        </div>
      </div>

      {/* Footer stats */}
      <div className="mt-3 px-1 text-xs text-gray-500 dark:text-gray-400">
        {filteredLogs.length} / {logs.length} logs
        {paused && pausedLogsBufferRef.current.length > 0 && (
          <span className="ml-4 text-amber-600">
            {pausedLogsBufferRef.current.length} new logs buffered
          </span>
        )}
      </div>
    </div>
  )
}
