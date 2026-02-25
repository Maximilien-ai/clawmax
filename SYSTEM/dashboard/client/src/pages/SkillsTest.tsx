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

  const agentId = 'engineer' // Testing with engineer agent

  // Load skills data
  useEffect(() => {
    loadSkills()
  }, [])

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
    const newAssigned = new Set(assignedSkills)

    if (newAssigned.has(skillId)) {
      newAssigned.delete(skillId)
    } else {
      newAssigned.add(skillId)
    }

    setSaving(true)
    try {
      const response = await fetch(`${API_BASE}/api/skills/agent/${agentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skills: Array.from(newAssigned) })
      })

      if (!response.ok) {
        throw new Error('Failed to update skills')
      }

      setAssignedSkills(newAssigned)
      console.log('✓ Skills updated:', Array.from(newAssigned))
    } catch (error) {
      console.error('Failed to update skills:', error)
      alert('Failed to update skills')
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
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Skills Manager - {agentId}
          </h1>
          <p className="text-gray-600">
            Assign skills to the engineer agent
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

        {/* Saving indicator */}
        {saving && (
          <div className="bg-blue-100 border border-blue-300 text-blue-800 px-4 py-2 rounded-lg mb-4">
            Saving changes...
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
