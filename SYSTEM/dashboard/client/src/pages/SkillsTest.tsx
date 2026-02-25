import { useState, useEffect } from 'react'
import { SkillCard } from '../components/skills/SkillCard'
import type { OpenClawSkill, SkillsResponse, AgentSkillsResponse } from '../types'

const API_BASE = 'http://localhost:3001'

export function SkillsTest() {
  const [allSkills, setAllSkills] = useState<OpenClawSkill[]>([])
  const [assignedSkills, setAssignedSkills] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterAssigned, setFilterAssigned] = useState<'all' | 'assigned' | 'available'>('all')
  const [agentId, setAgentId] = useState('engineer')
  const [availableAgents, setAvailableAgents] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  // Load agents list on mount
  useEffect(() => {
    loadAgents()
  }, [])

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
      const agentIds = data.agents.map((a: any) => a.id)
      setAvailableAgents(agentIds)
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

            {/* Agent Selector */}
            {availableAgents.length > 0 && (
              <select
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
                className="px-4 py-2 border rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                {availableAgents.map(id => (
                  <option key={id} value={id}>{id}</option>
                ))}
              </select>
            )}
          </div>
          <p className="text-gray-600">
            Assign skills to <span className="font-semibold text-gray-900">{agentId}</span> agent
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white p-4 rounded-lg border">
            <div className="text-2xl font-bold text-blue-600">{allSkills.length}</div>
            <div className="text-sm text-gray-600">Total Skills</div>
          </div>
          <div className="bg-white p-4 rounded-lg border">
            <div className="text-2xl font-bold text-green-600">{assignedSkills.size}</div>
            <div className="text-sm text-gray-600">Assigned</div>
          </div>
          <div className="bg-white p-4 rounded-lg border">
            <div className="text-2xl font-bold text-gray-600">{allSkills.length - assignedSkills.size}</div>
            <div className="text-sm text-gray-600">Available</div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white p-4 rounded-lg border mb-6">
          <div className="flex gap-4 flex-wrap">
            {/* Search */}
            <input
              type="text"
              placeholder="Search skills..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 min-w-64 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />

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
            {sortedSkills.map(skill => (
              <SkillCard
                key={skill.name}
                skill={skill}
                assigned={assignedSkills.has(skill.name)}
                onToggle={() => toggleSkill(skill.name)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
