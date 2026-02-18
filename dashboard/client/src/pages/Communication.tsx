import React, { useEffect, useState, useCallback } from 'react'

interface GroupEntry {
  name: string
  description: string | null
}

interface Agent {
  id: string
  name: string
  status: 'online' | 'offline' | 'unknown'
  communities: GroupEntry[]
  groups: GroupEntry[]
}

const STATUS_DOT: Record<string, string> = {
  online: 'bg-green-400',
  offline: 'bg-yellow-400',
  unknown: 'bg-gray-300',
}

function secAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 5) return 'just now'
  if (s < 60) return `${s}s ago`
  return `${Math.floor(s / 60)}m ago`
}

export default function Communication() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [lastRefreshed, setLastRefreshed] = useState<number>(Date.now())
  const [refreshedLabel, setRefreshedLabel] = useState<string>('just now')
  const [cooling, setCooling] = useState(false)

  const fetchAgents = useCallback(() => {
    fetch('/api/agents')
      .then(r => r.json())
      .then(d => { setAgents(d.agents); setLoading(false); setLastRefreshed(Date.now()) })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => {
    fetchAgents()
    const t = setInterval(fetchAgents, 30000)
    return () => clearInterval(t)
  }, [fetchAgents])

  useEffect(() => {
    const ticker = setInterval(() => setRefreshedLabel(secAgo(lastRefreshed)), 5000)
    setRefreshedLabel(secAgo(lastRefreshed))
    return () => clearInterval(ticker)
  }, [lastRefreshed])

  const handleRefresh = () => {
    if (cooling) return
    setCooling(true)
    fetchAgents()
    setTimeout(() => setCooling(false), 3000)
  }

  // Build cross-agent maps: name → { agents, description }
  type ChannelData = { agents: Agent[]; description: string | null }
  const communityMap = new Map<string, ChannelData>()
  const groupMap = new Map<string, ChannelData>()

  for (const agent of agents) {
    for (const c of agent.communities) {
      if (!communityMap.has(c.name)) communityMap.set(c.name, { agents: [], description: c.description })
      communityMap.get(c.name)!.agents.push(agent)
    }
    for (const g of agent.groups) {
      if (!groupMap.has(g.name)) groupMap.set(g.name, { agents: [], description: g.description })
      groupMap.get(g.name)!.agents.push(agent)
    }
  }

  const hasCommunities = communityMap.size > 0
  const hasGroups = groupMap.size > 0

  return (
    <div className="flex-1 overflow-y-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Communication</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            WhatsApp communities & groups · refreshed {refreshedLabel}
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={cooling}
          className={`text-sm font-medium transition-colors ${
            cooling ? 'text-gray-300 cursor-not-allowed' : 'text-sky-600 hover:text-sky-800'
          }`}
        >
          {cooling ? 'Refreshing…' : '↻ Refresh'}
        </button>
      </div>

      {loading && (
        <div className="flex items-center justify-center h-32 text-gray-400 text-sm">
          Loading...
        </div>
      )}

      {!loading && !hasCommunities && !hasGroups && (
        <div className="flex flex-col items-center justify-center h-48 text-gray-400">
          <p className="text-sm">No groups configured</p>
          <p className="text-xs mt-1 text-gray-300">Add a GROUPS.md file to each agent's workspace directory</p>
        </div>
      )}

      {!loading && (hasCommunities || hasGroups) && (
        <div className="space-y-8">
          {/* Communities section */}
          {hasCommunities && (
            <div>
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                Communities
              </h2>
              <div className="grid gap-3 sm:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
                {Array.from(communityMap.entries()).map(([name, data]) => (
                  <ChannelCard
                    key={name}
                    name={name}
                    description={data.description}
                    type="community"
                    members={data.agents}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Groups section */}
          {hasGroups && (
            <div>
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                Groups
              </h2>
              <div className="grid gap-3 sm:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
                {Array.from(groupMap.entries()).map(([name, data]) => (
                  <ChannelCard
                    key={name}
                    name={name}
                    description={data.description}
                    type="group"
                    members={data.agents}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ChannelCard({
  name,
  description,
  type,
  members,
}: {
  name: string
  description: string | null
  type: 'community' | 'group'
  members: Agent[]
}) {
  const STATUS_DOT_MAP: Record<string, string> = {
    online: 'bg-green-400',
    offline: 'bg-yellow-400',
    unknown: 'bg-gray-300',
  }
  const typeStyle = type === 'community'
    ? 'bg-purple-50 text-purple-700'
    : 'bg-indigo-50 text-indigo-700'

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
      <div className="flex items-start justify-between mb-2">
        <div>
          <h3 className="font-semibold text-gray-900 text-sm">{name}</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            {members.length} agent{members.length !== 1 ? 's' : ''}
          </p>
        </div>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ml-2 ${typeStyle}`}>
          {type}
        </span>
      </div>

      {description && (
        <p className="text-xs text-gray-500 mb-3 leading-relaxed">{description}</p>
      )}

      <div className={`space-y-1.5 ${description ? '' : 'mt-1'}`}>
        {members.map(agent => (
          <div key={agent.id} className="flex items-center gap-2">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT_MAP[agent.status]}`} />
            <span className="text-xs text-gray-700 font-medium">{agent.name}</span>
            <span className="text-xs text-gray-400 font-mono">({agent.id})</span>
          </div>
        ))}
      </div>
    </div>
  )
}
