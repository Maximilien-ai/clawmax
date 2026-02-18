import React, { useEffect, useState, useCallback } from 'react'

interface ActivityEntry {
  agentId: string
  file: string
  mtime: string
  ageMins: number
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

export default function Activity() {
  const [feed, setFeed] = useState<ActivityEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastRefreshed, setLastRefreshed] = useState<number>(Date.now())
  const [refreshedLabel, setRefreshedLabel] = useState<string>('just now')
  const [cooling, setCooling] = useState(false)

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

  // Initial load + auto-refresh every 30s
  useEffect(() => {
    fetchFeed()
    const interval = setInterval(fetchFeed, 30000)
    return () => clearInterval(interval)
  }, [fetchFeed])

  // Live "refreshed Xs ago" ticker
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

  // Group consecutive entries by agentId to show agent headers
  const rows = feed

  return (
    <div className="flex-1 overflow-y-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Installation Activity</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            All file writes across all agents · refreshed {refreshedLabel}
          </p>
        </div>
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
              <tr className="border-b border-gray-100 text-left">
                <th className="px-4 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wider w-24">Age</th>
                <th className="px-4 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wider w-24">Agent</th>
                <th className="px-4 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">File</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map((entry, i) => (
                <tr key={`${entry.agentId}-${entry.file}-${i}`} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-2 text-xs text-gray-400 font-mono shrink-0">
                    {timeAgo(entry.ageMins)}
                  </td>
                  <td className="px-4 py-2">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-medium bg-sky-50 text-sky-700">
                      {entry.agentId}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-600 font-mono">
                    {entry.file}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
