import React, { useState, useEffect, useRef } from 'react'
import { detectDoctorRuntimeSignal } from '../lib/doctorRuntimeSignals'
import { detectLogRuntimeSignal } from '../lib/logRuntimeSignals'
import {
  formatPluginDiagnosticsSummary,
  normalizePluginDiagnosticsReport,
  type PluginDiagnosticStatus,
  type PluginDiagnosticsReport,
} from '../lib/plugins'

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
  platform: {
    cli?: boolean
    gateway?: boolean
    gatewayPort?: number | string | null
    gatewayRecovery?: { attempted?: boolean; status?: string; message?: string }
  }
  message?: string
}

function isGatewayBadgeHealthy(results: DoctorResults): boolean {
  if (results.healthy && results.summary.warn === 0) return true
  return !!results.platform?.gateway
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
  const [showDoctorInfoChecks, setShowDoctorInfoChecks] = useState(false)
  const [showPluginDiagnostics, setShowPluginDiagnostics] = useState(false)
  const [pluginDiagnostics, setPluginDiagnostics] = useState<PluginDiagnosticsReport | null>(null)
  const [pluginDiagnosticsLoading, setPluginDiagnosticsLoading] = useState(false)
  const [pluginDiagnosticsError, setPluginDiagnosticsError] = useState<string | null>(null)
  const [refreshNonce, setRefreshNonce] = useState(0)
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

  const logRuntimeSignal = detectLogRuntimeSignal(logs.map((log) => log.raw), error)
  const visibleDoctorResults = (doctorResults?.results || [])
    .map((agent) => ({
      ...agent,
      visibleChecks: (agent.checks || []).filter((check) => showDoctorInfoChecks || check.status !== 'pass'),
    }))
    .filter((agent) => showDoctorInfoChecks || agent.visibleChecks.length > 0)
  const doctorRuntimeSignal = detectDoctorRuntimeSignal(doctorResults)

  const downloadLogs = () => {
    const lines = filteredLogs.map((log) => log.raw)
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `clawmax-system-logs-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const refreshLogs = () => {
    setError(null)
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
    pausedLogsBufferRef.current = []
    setPaused(false)
    setRefreshNonce((value) => value + 1)
  }

  const loadPluginDiagnostics = async () => {
    setPluginDiagnosticsLoading(true)
    setPluginDiagnosticsError(null)
    try {
      const response = await fetch('/api/plugins/diagnostics')
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data?.error || `Plugin diagnostics failed (${response.status})`)
      setPluginDiagnostics(normalizePluginDiagnosticsReport(data))
    } catch (err: any) {
      setPluginDiagnostics(null)
      setPluginDiagnosticsError(err?.message || 'Plugin diagnostics are unavailable.')
    } finally {
      setPluginDiagnosticsLoading(false)
    }
  }

  const pluginStatusClass = (status: PluginDiagnosticStatus) => {
    if (status === 'loaded') return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
    if (status === 'disabled') return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
    if (status === 'missing' || status === 'duplicate') return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200'
    return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
  }

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
  }, [paused, refreshNonce])

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
        <div className="w-full sm:w-auto">
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
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
              className="inline-flex w-full items-center justify-center rounded border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-sm text-cyan-700 transition-colors hover:bg-cyan-100 dark:border-cyan-800 dark:bg-cyan-900/20 dark:text-cyan-300 dark:hover:bg-cyan-900/40 sm:w-auto"
            >
              🩺 Doctor
            </button>
            <button
              onClick={() => {
                setShowPluginDiagnostics(true)
                void loadPluginDiagnostics()
              }}
              className={`inline-flex w-full items-center justify-center rounded border px-3 py-1.5 text-sm transition-colors sm:w-auto ${
                pluginDiagnostics && !pluginDiagnostics.healthy
                  ? 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200'
                  : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800'
              }`}
            >
              Plugins
            </button>
            <button
              onClick={() => setLogs([])}
              className="inline-flex w-full items-center justify-center rounded bg-gray-100 px-3 py-1.5 text-sm text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 sm:w-auto"
            >
              Clear
            </button>
            <button
              onClick={downloadLogs}
              disabled={filteredLogs.length === 0}
              className={`inline-flex w-full items-center justify-center rounded px-3 py-1.5 text-sm transition-colors sm:w-auto ${
                filteredLogs.length === 0
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed dark:bg-gray-800 dark:text-gray-500'
                  : 'bg-violet-50 hover:bg-violet-100 text-violet-700 dark:bg-violet-900/20 dark:text-violet-300 dark:hover:bg-violet-900/40 border border-violet-200 dark:border-violet-800'
              }`}
            >
              Download Logs
            </button>
            <button
              onClick={refreshLogs}
              className="inline-flex w-full items-center justify-center rounded bg-gray-100 px-3 py-1.5 text-sm text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 sm:w-auto"
            >
              Refresh
            </button>
            <button
              onClick={() => setAutoScroll(!autoScroll)}
              className={`inline-flex w-full items-center justify-center rounded px-3 py-1.5 text-sm transition-colors sm:w-auto ${
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
                className="inline-flex w-full items-center justify-center rounded bg-green-500 px-3 py-1.5 text-sm text-white transition-colors hover:bg-green-600 sm:w-auto"
              >
                Resume {pausedLogsBufferRef.current.length > 0 && `(+${pausedLogsBufferRef.current.length})`}
              </button>
            ) : (
              <button
                onClick={() => setPaused(true)}
                className="inline-flex w-full items-center justify-center rounded bg-amber-500 px-3 py-1.5 text-sm text-white transition-colors hover:bg-amber-600 sm:w-auto"
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
              <label className="inline-flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mr-1">
                <input
                  type="checkbox"
                  checked={showDoctorInfoChecks}
                  onChange={(e) => setShowDoctorInfoChecks(e.target.checked)}
                  className="rounded"
                />
                Show info checks
              </label>
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
              {doctorRuntimeSignal && (
                <div className={`rounded-lg border px-3 py-2 text-xs ${
                  doctorRuntimeSignal.severity === 'critical'
                    ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200'
                    : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200'
                }`}>
                  <div className="font-semibold">{doctorRuntimeSignal.title}</div>
                  <div className="mt-1">{doctorRuntimeSignal.detail}</div>
                  <div className="mt-1 opacity-90">{doctorRuntimeSignal.hint}</div>
                </div>
              )}
              <div className="flex gap-2 text-xs flex-wrap">
                <span className={`px-2 py-1 rounded ${doctorResults.platform?.cli ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'}`}>{doctorResults.platform?.cli ? '✓' : '✗'} CLI</span>
                <span className={`px-2 py-1 rounded ${isGatewayBadgeHealthy(doctorResults) ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'}`}>{isGatewayBadgeHealthy(doctorResults) ? '✓' : '⚠'} Gateway{doctorResults.platform?.gatewayPort ? `:${doctorResults.platform.gatewayPort}` : ''}</span>
                <span className={`px-2 py-1 rounded ${doctorResults.healthy && doctorResults.summary.warn === 0 ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'}`}>{doctorResults.summary.pass} pass, {doctorResults.summary.fail} fail, {doctorResults.summary.warn} warn, {doctorResults.summary.fixed} fixed</span>
              </div>
              {doctorResults.platform?.gatewayRecovery?.message && (
                <div className="text-xs rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-cyan-800 dark:border-cyan-800 dark:bg-cyan-900/20 dark:text-cyan-200">
                  <span className="font-semibold">Gateway recovery:</span>{' '}
                  <span className="font-mono">{doctorResults.platform.gatewayRecovery.status || 'unknown'}</span>
                  {' '}· {doctorResults.platform.gatewayRecovery.message}
                </div>
              )}
              {visibleDoctorResults.map((r: any) => (
                <div key={r.id} className="text-xs text-gray-600 dark:text-gray-400">
                  <span className="font-mono font-medium">{r.id}:</span> {r.visibleChecks.map((c: any) => `${c.status === 'pass' ? '✓' : c.status === 'fixed' ? '⟳' : c.status === 'fail' ? '✗' : '⚠'} ${c.message}`).join(' | ')}
                </div>
              ))}
              {doctorResults.results.length > 0 && visibleDoctorResults.length === 0 && !showDoctorInfoChecks && (
                <div className="text-xs text-gray-500 dark:text-gray-400">No warnings or failures. Enable info checks to see full agent details.</div>
              )}
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

      {showPluginDiagnostics && (
        <section className="mb-4 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900" aria-labelledby="plugin-health-title">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 id="plugin-health-title" className="text-sm font-semibold text-gray-900 dark:text-gray-100">Plugin Health</h3>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {pluginDiagnostics ? formatPluginDiagnosticsSummary(pluginDiagnostics) : 'Checking configured plugin paths and manifests'}
                {pluginDiagnostics ? ` · Host ${pluginDiagnostics.hostApiVersion}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => void loadPluginDiagnostics()}
                disabled={pluginDiagnosticsLoading}
                className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:text-gray-400 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                {pluginDiagnosticsLoading ? 'Checking...' : 'Refresh'}
              </button>
              <button
                onClick={() => setShowPluginDiagnostics(false)}
                aria-label="Close plugin health"
                className="rounded px-2 py-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-300"
              >
                &times;
              </button>
            </div>
          </div>

          {pluginDiagnosticsError && (
            <div className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200">
              {pluginDiagnosticsError}
            </div>
          )}

          {pluginDiagnostics && pluginDiagnostics.diagnostics.length === 0 && (
            <div className="mt-3 text-xs text-gray-500 dark:text-gray-400">No plugins or plugin manifests were discovered.</div>
          )}

          {pluginDiagnostics && pluginDiagnostics.diagnostics.length > 0 && (
            <div className="mt-3 divide-y divide-gray-200 border-y border-gray-200 dark:divide-gray-700 dark:border-gray-700">
              {pluginDiagnostics.diagnostics.map((diagnostic, index) => (
                <div key={`${diagnostic.status}-${diagnostic.pluginId || diagnostic.path}-${index}`} className="py-3 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 font-medium ${pluginStatusClass(diagnostic.status)}`}>{diagnostic.status}</span>
                    <span className="font-medium text-gray-900 dark:text-gray-100">{diagnostic.name || diagnostic.pluginId || 'Plugin path'}</span>
                    {diagnostic.pluginVersion ? <span className="text-gray-500">v{diagnostic.pluginVersion}</span> : null}
                    {diagnostic.apiVersion ? <span className="font-mono text-gray-500">{diagnostic.apiVersion}</span> : null}
                  </div>
                  <div className="mt-1 text-gray-700 dark:text-gray-300">{diagnostic.message}</div>
                  {diagnostic.remediation ? <div className="mt-1 text-gray-500 dark:text-gray-400">{diagnostic.remediation}</div> : null}
                  {diagnostic.path ? <div className="mt-1 break-all font-mono text-gray-400">{diagnostic.path}</div> : null}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {logRuntimeSignal && (
        <div className={`mb-4 rounded-lg border p-3 text-sm ${
          logRuntimeSignal.severity === 'critical'
            ? 'border-red-300 bg-red-50 text-red-800 dark:border-red-700 dark:bg-red-900/20 dark:text-red-200'
            : 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200'
        }`}>
          <div className="font-semibold">{logRuntimeSignal.title}</div>
          <div className="mt-1">{logRuntimeSignal.detail}</div>
          <div className="mt-1 opacity-90">{logRuntimeSignal.hint}</div>
        </div>
      )}

      {/* Filters */}
      <div className="grid grid-cols-1 gap-2 mb-6 sm:grid-cols-3 sm:gap-3">
        <input
          type="text"
          placeholder="Search logs..."
          value={searchFilter}
          onChange={(e) => setSearchFilter(e.target.value)}
          className="min-w-0 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:border-gray-600"
        />
        <select
          value={agentFilter}
          onChange={(e) => setAgentFilter(e.target.value)}
          className="min-w-0 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:border-gray-600"
        >
          <option value="">All Agents</option>
          {uniqueAgents.map(agent => (
            <option key={agent} value={agent}>{agent}</option>
          ))}
        </select>
        <select
          value={levelFilter}
          onChange={(e) => setLevelFilter(e.target.value)}
          className="min-w-0 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:border-gray-600"
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
