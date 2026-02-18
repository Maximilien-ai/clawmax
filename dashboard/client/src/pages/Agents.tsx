import React, { useEffect, useState } from 'react'
import AgentDetailPanel from '../components/AgentDetailPanel'

interface Agent {
  id: string
  name: string
  status: 'online' | 'offline' | 'unknown'
  lastHeartbeat: string | null
  whatsapp: string | null
  workspacePath: string
}

const STATUS_COLORS = {
  online: 'bg-green-400',
  offline: 'bg-yellow-400',
  unknown: 'bg-gray-300',
}

const STATUS_TEXT = {
  online: 'text-green-700 bg-green-50',
  offline: 'text-yellow-700 bg-yellow-50',
  unknown: 'text-gray-600 bg-gray-100',
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'never'
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function Agents() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null)

  function fetchAgents() {
    fetch('/api/agents')
      .then(r => r.json())
      .then(d => {
        setAgents(d.agents)
        setLoading(false)
      })
      .catch(() => {
        setError('Failed to load agents')
        setLoading(false)
      })
  }

  useEffect(() => {
    fetchAgents()
    const interval = setInterval(fetchAgents, 30000) // refresh every 30s
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="flex-1 overflow-y-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Agent Roster</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {agents.length} agent{agents.length !== 1 ? 's' : ''} in workspace
          </p>
        </div>
        <button
          onClick={fetchAgents}
          className="text-sm text-sky-600 hover:text-sky-800 font-medium"
        >
          Refresh
        </button>
      </div>

      {loading && (
        <div className="flex items-center justify-center h-32 text-gray-400 text-sm">
          Loading agents...
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>
      )}

      {!loading && !error && agents.length === 0 && (
        <div className="flex flex-col items-center justify-center h-48 text-gray-400">
          <span className="text-4xl mb-4">🤖</span>
          <p className="text-sm">No agents found in workspace</p>
          <p className="text-xs mt-1 text-gray-300">Run setup.sh to add the first agent</p>
        </div>
      )}

      {!loading && !error && agents.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
          {agents.map(agent => (
            <AgentCard
              key={agent.id}
              agent={agent}
              selected={selectedAgent?.id === agent.id}
              onClick={() => setSelectedAgent(agent)}
            />
          ))}
        </div>
      )}

      {selectedAgent && (
        <AgentDetailPanel
          agent={selectedAgent}
          onClose={() => setSelectedAgent(null)}
        />
      )}
    </div>
  )
}

function AgentCard({ agent, selected, onClick }: { agent: Agent; selected: boolean; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-xl border p-5 shadow-sm hover:shadow-md transition-all cursor-pointer ${
        selected ? 'border-sky-400 ring-2 ring-sky-100' : 'border-gray-200'
      }`}
    >
      {/* Top row */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-semibold text-gray-900">{agent.name}</h3>
          <span className="text-xs text-gray-400 font-mono">{agent.id}</span>
        </div>
        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_TEXT[agent.status]}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${STATUS_COLORS[agent.status]}`} />
          {agent.status}
        </span>
      </div>

      {/* Details */}
      <div className="space-y-1.5 text-sm text-gray-600">
        <div className="flex items-center gap-2">
          <span className="text-gray-400 w-20 shrink-0">Heartbeat</span>
          <span className="font-mono text-xs">{timeAgo(agent.lastHeartbeat)}</span>
        </div>
        {agent.whatsapp && (
          <div className="flex items-center gap-2">
            <span className="text-gray-400 w-20 shrink-0">WhatsApp</span>
            <span className="font-mono text-xs">+{agent.whatsapp}</span>
          </div>
        )}
        {!agent.whatsapp && (
          <div className="flex items-center gap-2">
            <span className="text-gray-400 w-20 shrink-0">WhatsApp</span>
            <span className="text-gray-300 text-xs">not connected</span>
          </div>
        )}
      </div>

      {/* Footer path */}
      <div className="mt-3 pt-3 border-t border-gray-100">
        <span className="text-xs text-gray-300 font-mono truncate block">
          {agent.workspacePath.replace(/^\/Users\/[^/]+/, '~')}
        </span>
      </div>
    </div>
  )
}
