import { useEffect, useState, useRef } from 'react'
import { detectGatewayDiagnostics } from '../lib/gatewayDiagnostics'

interface Props {
  agentId: string
  agentName: string
  onClose: () => void
}

interface GatewayStatus {
  available: boolean
  port?: number
  code?: string
  status?: {
    uptime?: number
    version?: string
    connected?: boolean
  }
  error?: string
}

export default function AgentStatusPanel({ agentId, agentName, onClose }: Props) {
  const [gatewayStatus, setGatewayStatus] = useState<GatewayStatus | null>(null)
  const [logs, setLogs] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const logsEndRef = useRef<HTMLDivElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    loadGatewayStatus()
    startLogTail()

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [agentId])

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  async function loadGatewayStatus() {
    try {
      const res = await fetch(`/api/agents/${agentId}/status`)
      const data = await res.json()
      setGatewayStatus(data)
      setLoading(false)
    } catch (e) {
      setError('Failed to load gateway status')
      setLoading(false)
    }
  }

  async function startLogTail() {
    try {
      abortControllerRef.current = new AbortController()

      const response = await fetch(`/api/agents/${agentId}/logs?lines=100`, {
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

            if (data.type === 'logs' && data.data) {
              // Initial logs payload
              const logLines = Array.isArray(data.data) ? data.data : [data.data]
              setLogs(prev => [...prev, ...logLines])
            } else if (data.type === 'log' && data.data) {
              // Single log line
              setLogs(prev => [...prev, data.data])
            } else if (data.type === 'error') {
              setError(data.data || 'Log streaming error')
            }
          } catch (e) {
            console.error('Failed to parse SSE message:', e)
          }
        }
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        setError('Log streaming failed')
      }
    }
  }

  if (loading) {
    return (
      <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-[400px] bg-white dark:bg-gray-800 shadow-2xl flex items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    )
  }

  const gatewayDiagnostics = detectGatewayDiagnostics(logs, gatewayStatus)

  const statusCopy = (() => {
    switch (gatewayStatus?.code) {
      case 'gateway_not_configured':
        return {
          title: 'Gateway Not Configured',
          detail: 'This agent does not currently have a gateway runtime attached.',
          hint: 'Open Doctor to verify runtime configuration and gateway supervision for this instance.'
        }
      case 'gateway_auth_failed':
        return {
          title: 'Gateway Authentication Failed',
          detail: 'The dashboard reached the agent gateway, but the runtime rejected the status request.',
          hint: 'Open Doctor and check the runtime gateway credentials and agent registration state.'
        }
      case 'gateway_timeout':
        return {
          title: 'Gateway Timed Out',
          detail: 'The runtime gateway did not answer the status probe in time.',
          hint: 'Open Doctor to confirm the gateway is running and responsive in this runtime.'
        }
      case 'gateway_connection_error':
      case 'gateway_connection_closed':
        return {
          title: 'Gateway Connection Failed',
          detail: 'The dashboard could not maintain a connection to the agent gateway.',
          hint: 'Open Doctor to inspect runtime connectivity and supervisor health for this instance.'
        }
      case 'gateway_status_error':
        return {
          title: 'Gateway Status Failed',
          detail: 'The runtime gateway responded, but the status request itself failed.',
          hint: 'Open Doctor and review runtime logs for the gateway process.'
        }
      default:
        return {
          title: 'Agent Chat Unavailable',
          detail: gatewayStatus?.error || 'This agent cannot reach a healthy gateway runtime right now.',
          hint: 'Open Doctor to verify gateway health and the runtime execution path for this instance.'
        }
    }
  })()

  if (!gatewayStatus?.available) {
    return (
      <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-[400px] bg-white dark:bg-gray-800 shadow-2xl flex flex-col">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between shrink-0 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Agent Status: {agentName}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="text-center">
            <div className="text-6xl mb-4">⚠️</div>
            <h3 className="text-lg font-semibold text-gray-700 mb-2 dark:text-gray-300">{statusCopy.title}</h3>
            <p className="text-sm text-gray-500 mb-2">
              {statusCopy.detail}
            </p>
            {gatewayDiagnostics && (
              <div className={`mb-3 rounded-lg border px-3 py-2 text-left text-xs ${
                gatewayDiagnostics.severity === 'critical'
                  ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200'
                  : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200'
              }`}>
                <div className="font-semibold">{gatewayDiagnostics.title}</div>
                <div className="mt-1">{gatewayDiagnostics.detail}</div>
                <div className="mt-1 opacity-80">{gatewayDiagnostics.hint}</div>
              </div>
            )}
            <p className="text-xs text-gray-400 mb-3">
              {statusCopy.hint}
            </p>
            <div className="flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent('open-doctor'))}
                className="px-3 py-1.5 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 transition-colors"
              >
                Open Doctor
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const formatUptime = (ms?: number) => {
    if (!ms) return 'Unknown'
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)

    if (days > 0) return `${days}d ${hours % 24}h`
    if (hours > 0) return `${hours}h ${minutes % 60}m`
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`
    return `${seconds}s`
  }

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-[400px] bg-white dark:bg-gray-800 shadow-2xl flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between shrink-0 dark:border-gray-700">
        <div>
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Status: {agentName}</h2>
          <p className="text-xs text-gray-400 mt-0.5">Gateway & logs</p>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 transition-colors text-xl leading-none"
        >×</button>
      </div>

      {/* Gateway Status */}
      <div className="px-6 py-4 border-b border-gray-200 shrink-0 dark:border-gray-700">
        <div className="space-y-3">
          {gatewayDiagnostics && (
            <div className={`rounded-lg border px-3 py-2 text-xs ${
              gatewayDiagnostics.severity === 'critical'
                ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200'
                : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200'
            }`}>
              <div className="font-semibold">{gatewayDiagnostics.title}</div>
              <div className="mt-1">{gatewayDiagnostics.detail}</div>
              <div className="mt-1 opacity-80">{gatewayDiagnostics.hint}</div>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">Status</span>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500"></span>
              <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">Online</span>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">Port</span>
            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{gatewayStatus.port}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">Uptime</span>
            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {formatUptime(gatewayStatus.status?.uptime)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">Version</span>
            <span className="text-sm font-semibold text-gray-900 truncate dark:text-gray-100">
              {gatewayStatus.status?.version || 'dev'}
            </span>
          </div>
        </div>
      </div>

      {/* Logs */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="px-6 py-2 bg-gray-50 border-b border-gray-200 dark:border-gray-700 dark:bg-gray-900">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Live Logs</h3>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3 bg-gray-900">
          {logs.length === 0 && (
            <div className="text-center py-12 text-gray-500 text-sm">
              Waiting for log entries...
            </div>
          )}
          <div className="font-mono text-xs text-gray-300 space-y-1">
            {logs.map((log, idx) => (
              <div key={idx} className="whitespace-pre-wrap break-words">
                {log}
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="px-6 py-2 bg-red-50 border-t border-red-200 shrink-0">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {/* Footer */}
      <div className="px-6 py-3 border-t border-gray-200 shrink-0 dark:border-gray-700">
        <div className="text-xs text-gray-500 text-center">
          {logs.length} log {logs.length !== 1 ? 'entries' : 'entry'}
        </div>
      </div>
    </div>
  )
}
