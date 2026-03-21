import React, { useState, useEffect, useRef } from 'react'

interface LogEntry {
  timestamp: string
  level: string
  agent?: string
  message: string
  raw: string
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
  const logsEndRef = useRef<HTMLDivElement>(null)
  const logsContainerRef = useRef<HTMLDivElement>(null)
  const eventSourceRef = useRef<EventSource | null>(null)
  const pausedLogsBufferRef = useRef<LogEntry[]>([])

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
        setError('Connection lost. Reconnecting...')
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
    if (autoScroll && !paused && logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight
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
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">System Logs</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Live streaming logs from OpenClaw
            {connected && <span className="ml-2 text-green-600">● Connected</span>}
            {error && <span className="ml-2 text-red-600">● {error}</span>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
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
      <div ref={logsContainerRef} className="flex-1 min-h-[420px] overflow-auto bg-gray-900 text-gray-100 font-mono text-xs rounded-lg border border-gray-800">
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
