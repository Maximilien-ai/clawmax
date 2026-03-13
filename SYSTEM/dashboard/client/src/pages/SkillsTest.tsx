import { useState, useEffect } from 'react'
import { SkillCard } from '../components/skills/SkillCard'
import type { OpenClawSkill, SkillsResponse, AgentSkillsResponse } from '../types'

const API_BASE = 'http://localhost:3001'

export function SkillsTest({ initialAgentId }: { initialAgentId?: string } = {}) {
  const [allSkills, setAllSkills] = useState<OpenClawSkill[]>([])
  const [assignedSkills, setAssignedSkills] = useState<Set<string>>(new Set())
  const [skillUsage, setSkillUsage] = useState<Map<string, string[]>>(new Map())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterAssigned, setFilterAssigned] = useState<'all' | 'assigned' | 'available'>('all')
  const [agentId, setAgentId] = useState(initialAgentId || '')
  const [availableAgents, setAvailableAgents] = useState<string[]>([])
  const [agentSearchQuery, setAgentSearchQuery] = useState('')
  const [showAgentDropdown, setShowAgentDropdown] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load agents list on mount
  useEffect(() => {
    loadAgents()
  }, [])

  // Update agent when initialAgentId prop changes
  useEffect(() => {
    if (initialAgentId) {
      setAgentId(initialAgentId)
    }
  }, [initialAgentId])

  // Reload skills when agent changes
  useEffect(() => {
    if (agentId) {
      loadSkills()
    }
  }, [agentId])

  async function loadAgents() {
    try {
      const res = await fetch(`${API_BASE}/api/agents`)
      const data = await res.json()
      const agents = Array.isArray(data.agents) ? data.agents : []
      const agentIds = agents.map((a: any) => a.id)
      setAvailableAgents(agentIds)

      // Set default agent to first available if not already set
      if (!agentId && agentIds.length > 0) {
        setAgentId(agentIds[0])
      }

      // Compute skill usage across all agents
      const usage = new Map<string, string[]>()
      for (const agent of agents) {
        if (agent.skills && Array.isArray(agent.skills)) {
          for (const skill of agent.skills) {
            const users = usage.get(skill) || []
            users.push(agent.id)
            usage.set(skill, users)
          }
        }
      }
      setSkillUsage(usage)
    } catch (error) {
      console.error('Failed to load agents:', error)
    }
  }

  async function loadSkills() {
    setLoading(true)
    try {
      // Fetch all available skills
      const skillsRes = await fetch(`${API_BASE}/api/skills`)
      const skillsData: SkillsResponse = await skillsRes.json()

      // Fetch agent's assigned skills
      const agentSkillsRes = await fetch(`${API_BASE}/api/skills/agent/${agentId}`)
      const agentSkillsData: AgentSkillsResponse = await agentSkillsRes.json()

      setAllSkills(skillsData.skills)
      setAssignedSkills(new Set(agentSkillsData.skillIds))
    } catch (error) {
      console.error('Failed to load skills:', error)
      alert('Failed to load skills. Make sure the server is running.')
    } finally {
      setLoading(false)
    }
  }

  async function toggleSkill(skillId: string) {
    console.log('Toggle skill:', skillId, 'for agent:', agentId)

    const newAssigned = new Set(assignedSkills)
    const wasAssigned = newAssigned.has(skillId)

    if (wasAssigned) {
      newAssigned.delete(skillId)
    } else {
      newAssigned.add(skillId)
    }

    setError(null)
    setSaving(true)

    try {
      const skillsList = Array.from(newAssigned)
      console.log('Sending PUT request:', skillsList)

      const response = await fetch(`${API_BASE}/api/skills/agent/${agentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skills: skillsList })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to update skills')
      }

      const result = await response.json()
      console.log('✓ Skills updated successfully:', result)

      setAssignedSkills(newAssigned)
      setError(null)
    } catch (error: any) {
      console.error('Failed to update skills:', error)
      setError(error.message || 'Failed to update skills')
      // Revert the UI change
      if (wasAssigned) {
        newAssigned.add(skillId)
      } else {
        newAssigned.delete(skillId)
      }
      setAssignedSkills(new Set(assignedSkills))
    } finally {
      setSaving(false)
    }
  }

  // Filter skills
  const filteredSkills = allSkills.filter(skill => {
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      const matchesSearch =
        skill.name.toLowerCase().includes(query) ||
        skill.description.toLowerCase().includes(query)
      if (!matchesSearch) return false
    }

    // Assignment filter
    if (filterAssigned === 'assigned' && !assignedSkills.has(skill.name)) return false
    if (filterAssigned === 'available' && assignedSkills.has(skill.name)) return false

    return true
  })

  // Sort: assigned first, then alphabetical
  const sortedSkills = [...filteredSkills].sort((a, b) => {
    const aAssigned = assignedSkills.has(a.name)
    const bAssigned = assignedSkills.has(b.name)

    if (aAssigned && !bAssigned) return -1
    if (!aAssigned && bAssigned) return 1
    return a.name.localeCompare(b.name)
  })

  // Filter agents for searchable dropdown
  const filteredAgents = availableAgents.filter(agent =>
    agent.toLowerCase().includes(agentSearchQuery.toLowerCase())
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading skills...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-3xl font-bold text-gray-900">
              Skills Manager
            </h1>

            {/* Searchable Agent Selector */}
            {availableAgents.length > 0 && (
              <div className="relative">
                <input
                  type="text"
                  value={agentSearchQuery || agentId}
                  onChange={(e) => {
                    setAgentSearchQuery(e.target.value)
                    setShowAgentDropdown(true)
                  }}
                  onFocus={() => setShowAgentDropdown(true)}
                  placeholder="Search agents..."
                  className="px-4 py-2 pr-10 border rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-w-48"
                />
                {(agentSearchQuery || agentId) && (
                  <button
                    onClick={() => {
                      setAgentId(availableAgents.length > 0 ? availableAgents[0] : '')
                      setAgentSearchQuery('')
                      setShowAgentDropdown(false)
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                    title="Clear agent selection"
                  >
                    ✕
                  </button>
                )}
                {showAgentDropdown && filteredAgents.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full bg-white border rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    {filteredAgents.map(id => (
                      <button
                        key={id}
                        onClick={() => {
                          setAgentId(id)
                          setAgentSearchQuery('')
                          setShowAgentDropdown(false)
                          setFilterAssigned('assigned') // Auto-filter to assigned skills when selecting agent
                        }}
                        className={`w-full text-left px-4 py-2 hover:bg-blue-50 transition-colors ${
                          id === agentId ? 'bg-blue-100 font-medium' : ''
                        }`}
                      >
                        {id}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <p className="text-gray-600">
            Assign skills to <span className="font-semibold text-gray-900">{agentId}</span> agent
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <button
            onClick={() => setFilterAssigned('all')}
            className={`bg-white p-4 rounded-lg border text-left hover:shadow-md transition-shadow ${
              filterAssigned === 'all' ? 'ring-2 ring-blue-500' : ''
            }`}
          >
            <div className="text-2xl font-bold text-blue-600">{allSkills.length}</div>
            <div className="text-sm text-gray-600">Total Skills</div>
          </button>
          <button
            onClick={() => setFilterAssigned('assigned')}
            className={`bg-white p-4 rounded-lg border text-left hover:shadow-md transition-shadow ${
              filterAssigned === 'assigned' ? 'ring-2 ring-green-500' : ''
            }`}
          >
            <div className="text-2xl font-bold text-green-600">{assignedSkills.size}</div>
            <div className="text-sm text-gray-600">Assigned</div>
          </button>
          <button
            onClick={() => setFilterAssigned('available')}
            className={`bg-white p-4 rounded-lg border text-left hover:shadow-md transition-shadow ${
              filterAssigned === 'available' ? 'ring-2 ring-gray-500' : ''
            }`}
          >
            <div className="text-2xl font-bold text-gray-600">{allSkills.length - assignedSkills.size}</div>
            <div className="text-sm text-gray-600">Available</div>
          </button>
        </div>

        {/* Popular Skills */}
        {skillUsage.size > 0 && (
          <div className="bg-white p-4 rounded-lg border mb-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Most Popular Skills</h3>
            <div className="flex flex-wrap gap-2">
              {Array.from(skillUsage.entries())
                .sort((a, b) => b[1].length - a[1].length)
                .slice(0, 10)
                .map(([skillName, users]) => (
                  <button
                    key={skillName}
                    onClick={() => {
                      setSearchQuery(skillName)
                      setFilterAssigned('all')
                    }}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-purple-50 border border-purple-200 hover:bg-purple-100 hover:border-purple-300 transition-colors cursor-pointer"
                    title={`Search for ${skillName}`}
                  >
                    <span className="text-sm font-medium text-purple-900">{skillName}</span>
                    <span className="text-xs text-purple-600 bg-purple-100 px-2 py-0.5 rounded-full">
                      {users.length}
                    </span>
                  </button>
                ))}
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="bg-white p-4 rounded-lg border mb-6">
          <div className="flex gap-4 flex-wrap">
            {/* Search */}
            <div className="relative flex-1 min-w-64">
              <input
                type="text"
                placeholder="Search skills..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-4 py-2 pr-10 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  title="Clear search"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Filter buttons */}
            <div className="flex gap-2">
              <button
                onClick={() => setFilterAssigned('all')}
                className={`px-4 py-2 rounded-lg font-medium ${
                  filterAssigned === 'all'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setFilterAssigned('assigned')}
                className={`px-4 py-2 rounded-lg font-medium ${
                  filterAssigned === 'assigned'
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Assigned
              </button>
              <button
                onClick={() => setFilterAssigned('available')}
                className={`px-4 py-2 rounded-lg font-medium ${
                  filterAssigned === 'available'
                    ? 'bg-gray-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Available
              </button>
            </div>
          </div>

          <div className="mt-2 text-sm text-gray-600">
            Showing {filteredSkills.length} of {allSkills.length} skills
          </div>
        </div>

        {/* Error display */}
        {error && (
          <div className="bg-red-100 border border-red-300 text-red-800 px-4 py-2 rounded-lg mb-4 flex items-center justify-between">
            <span>❌ {error}</span>
            <button
              onClick={() => setError(null)}
              className="text-red-600 hover:text-red-800 font-bold"
            >
              ×
            </button>
          </div>
        )}

        {/* Saving indicator */}
        {saving && (
          <div className="bg-blue-100 border border-blue-300 text-blue-800 px-4 py-2 rounded-lg mb-4">
            💾 Saving changes...
          </div>
        )}

        {/* Skills Grid */}
        {filteredSkills.length === 0 ? (
          <div className="bg-white p-12 rounded-lg border text-center">
            <div className="text-gray-400 text-5xl mb-4">🔍</div>
            <p className="text-gray-600">No skills found matching your criteria</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sortedSkills.map(skill => {
              const users = skillUsage.get(skill.name) || []
              return (
                <SkillCard
                  key={skill.name}
                  skill={skill}
                  assigned={assignedSkills.has(skill.name)}
                  onToggle={() => toggleSkill(skill.name)}
                  usageCount={users.length}
                  usedBy={users}
                />
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
