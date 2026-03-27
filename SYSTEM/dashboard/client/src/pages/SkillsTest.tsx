import { useState, useEffect } from 'react'
import { SkillCard } from '../components/skills/SkillCard'
import { useToast } from '../components/Toast'
import type { OpenClawSkill, SkillsResponse, AgentSkillsResponse } from '../types'

// Use relative path so it works with ngrok and localhost
const API_BASE = ''

export function SkillsTest({ initialAgentId }: { initialAgentId?: string } = {}) {
  const { showSuccess, showError: showToastError } = useToast()
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
  const [showImportDialog, setShowImportDialog] = useState(false)
  const [importPath, setImportPath] = useState('')
  const [importing, setImporting] = useState(false)
  const [importSource, setImportSource] = useState<'local' | 'github'>('local')

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

  // Reload skills when agent changes (or on mount if no agents)
  useEffect(() => {
    loadSkills()
  }, [agentId])

  async function loadAgents() {
    try {
      const res = await fetch(`${API_BASE}/api/agents`)
      const data = await res.json()
      const agents = Array.isArray(data.agents) ? data.agents : []
      const agentIds = agents.map((a: any) => a.id)
      setAvailableAgents(agentIds)

      // Set default agent to first available, or reset if current agent isn't in this workspace
      if (agentIds.length > 0 && (!agentId || !agentIds.includes(agentId))) {
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

      // Fetch agent's assigned skills (only if agentId is set)
      if (agentId) {
        const agentSkillsRes = await fetch(`${API_BASE}/api/skills/agent/${agentId}`)
        const agentSkillsData: AgentSkillsResponse = await agentSkillsRes.json()
        setAssignedSkills(new Set(agentSkillsData.skillIds))
      } else {
        setAssignedSkills(new Set())
      }

      setAllSkills(skillsData.skills || [])
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

  async function handleImportSkill() {
    if (!importPath.trim()) {
      setError('Please enter a skill directory path or GitHub URL')
      return
    }

    setImporting(true)
    setError(null)

    try {
      const isGitHub = importSource === 'github' || importPath.includes('github.com')
      const endpoint = isGitHub ? '/api/skills/import-github' : '/api/skills/import'
      const payload = isGitHub
        ? { githubUrl: importPath }
        : { sourcePath: importPath }

      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const data = await res.json()

      if (res.ok) {
        setShowImportDialog(false)
        setImportPath('')
        setImportSource('local')
        await loadSkills() // Reload skills list
        // Handle multi-skill import response
        if (data.total && data.total > 1) {
          const failed = data.skills?.filter((s: any) => !s.ok) || []
          showSuccess(`Imported ${data.imported}/${data.total} skills`)
          if (failed.length > 0) {
            showToastError(`Failed: ${failed.map((f: any) => f.skillId).join(', ')}`)
          }
        } else {
          showSuccess(`Imported skill: ${data.skillId}`)
        }
      } else {
        setError(data.error || 'Failed to import skill')
      }
    } catch (error: any) {
      setError(error.message || 'Error importing skill')
    } finally {
      setImporting(false)
    }
  }

  // Filter skills
  const filteredSkills = allSkills.filter(skill => {
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      const matchesSearch =
        skill.name.toLowerCase().includes(query) ||
        skill.description.toLowerCase().includes(query) ||
        (skill.tags || []).some(t => t.toLowerCase().includes(query))
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
    <div className="min-h-screen bg-gray-50 px-4 sm:p-6 py-4 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
            <div className="flex flex-wrap items-center gap-3 sm:gap-4">
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">
                Skills Manager
              </h1>
              <button
                onClick={() => setShowImportDialog(true)}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm font-medium"
                title="Import a custom skill from your local filesystem"
              >
                + Import Skill
              </button>
            </div>

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
                  className="px-4 py-2 pr-10 border rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-w-48"
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
                  <div className="absolute z-10 mt-1 w-full bg-white dark:bg-gray-800 border rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    {filteredAgents.map(id => (
                      <button
                        key={id}
                        onClick={() => {
                          setAgentId(id)
                          setAgentSearchQuery('')
                          setShowAgentDropdown(false)
                          setFilterAssigned('assigned') // Auto-filter to assigned skills when selecting agent
                        }}
                        className={`w-full text-left px-4 py-2 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors ${
                          id === agentId ? 'bg-blue-100 dark:bg-blue-900/30 font-medium' : ''
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
          {availableAgents.length > 0 ? (
            <p className="text-gray-600">
              Assign skills to <span className="font-semibold text-gray-900 dark:text-gray-100">{agentId}</span> agent
            </p>
          ) : (
            <p className="text-gray-600">
              No agents found in workspace. Create an agent to manage skills.
            </p>
          )}
        </div>

        {availableAgents.length === 0 && !loading && (
          <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg text-sm text-amber-800 dark:text-amber-300">
            No agents in workspace — browsing skill catalog. Create an agent to start assigning skills.
          </div>
        )}

        {(availableAgents.length > 0 || allSkills.length > 0) && (
          <>
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <button
            onClick={() => setFilterAssigned('all')}
            className={`bg-white dark:bg-gray-800 p-4 rounded-lg border dark:border-gray-700 text-left hover:shadow-md transition-shadow ${
              filterAssigned === 'all' ? 'ring-2 ring-blue-500' : ''
            }`}
          >
            <div className="text-2xl font-bold text-blue-600">{allSkills.length}</div>
            <div className="text-sm text-gray-600 dark:text-gray-300">Total Skills</div>
          </button>
          <button
            onClick={() => setFilterAssigned('assigned')}
            className={`bg-white dark:bg-gray-800 p-4 rounded-lg border dark:border-gray-700 text-left hover:shadow-md transition-shadow ${
              filterAssigned === 'assigned' ? 'ring-2 ring-green-500' : ''
            }`}
          >
            <div className="text-2xl font-bold text-green-600">{assignedSkills.size}</div>
            <div className="text-sm text-gray-600 dark:text-gray-300">Assigned</div>
          </button>
          <button
            onClick={() => setFilterAssigned('available')}
            className={`bg-white dark:bg-gray-800 p-4 rounded-lg border dark:border-gray-700 text-left hover:shadow-md transition-shadow ${
              filterAssigned === 'available' ? 'ring-2 ring-gray-500' : ''
            }`}
          >
            <div className="text-2xl font-bold text-gray-600">{allSkills.length - assignedSkills.size}</div>
            <div className="text-sm text-gray-600">Available</div>
          </button>
        </div>

        {/* Popular Skills */}
        {skillUsage.size > 0 && (
          <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border mb-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-3 dark:text-gray-300">Most Popular Skills</h3>
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
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-700 hover:bg-purple-100 dark:hover:bg-purple-900/50 hover:border-purple-300 dark:hover:border-purple-600 transition-colors cursor-pointer"
                    title={`Search for ${skillName}`}
                  >
                    <span className="text-sm font-medium text-purple-900 dark:text-purple-400">{skillName}</span>
                    <span className="text-xs text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/50 px-2 py-0.5 rounded-full">
                      {users.length}
                    </span>
                  </button>
                ))}
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border mb-6">
          <div className="flex gap-4 flex-wrap">
            {/* Search */}
            <div className="relative flex-1 min-w-64">
              <input
                type="text"
                placeholder="Search skills..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-4 py-2 pr-10 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
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
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setFilterAssigned('assigned')}
                className={`px-4 py-2 rounded-lg font-medium ${
                  filterAssigned === 'assigned'
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                Assigned
              </button>
              <button
                onClick={() => setFilterAssigned('available')}
                className={`px-4 py-2 rounded-lg font-medium ${
                  filterAssigned === 'available'
                    ? 'bg-gray-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
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
          <div className="bg-white dark:bg-gray-800 p-12 rounded-lg border text-center">
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
        </>
        )}

        {/* Import Skill Dialog */}
        {showImportDialog && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full mx-4">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Import Custom Skill</h2>
                  <button
                    onClick={() => {
                      setShowImportDialog(false)
                      setImportPath('')
                      setError(null)
                    }}
                    className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
                  >
                    ×
                  </button>
                </div>

                {/* Source Tabs */}
                <div className="flex gap-2 mb-6 border-b">
                  <button
                    onClick={() => setImportSource('local')}
                    className={`px-4 py-2 font-medium transition-colors ${
                      importSource === 'local'
                        ? 'text-purple-600 dark:text-purple-400 border-b-2 border-purple-600 dark:border-purple-400'
                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                    }`}
                  >
                    📁 Local Directory
                  </button>
                  <button
                    onClick={() => setImportSource('github')}
                    className={`px-4 py-2 font-medium transition-colors ${
                      importSource === 'github'
                        ? 'text-purple-600 dark:text-purple-400 border-b-2 border-purple-600 dark:border-purple-400'
                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                    }`}
                  >
                    🐙 GitHub Repository
                  </button>
                </div>

                {/* Local Import */}
                {importSource === 'local' && (
                  <div className="space-y-4">
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                      Enter the path to a skill directory or a directory containing multiple skills. Each skill needs:
                    </p>
                    <ul className="text-sm text-gray-600 dark:text-gray-300 list-disc list-inside space-y-1 ml-2">
                      <li><code className="bg-gray-100 px-1 rounded dark:bg-gray-800">SKILL.md</code> - Skill description (YAML frontmatter + markdown)</li>
                      <li><code className="bg-gray-100 px-1 rounded dark:bg-gray-800">index.ts</code> - Skill implementation (optional)</li>
                    </ul>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2 dark:text-gray-300">
                        Directory Path
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={importPath}
                          onChange={(e) => setImportPath(e.target.value)}
                          placeholder="/path/to/your/custom-skill"
                          className="flex-1 px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                        />
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              const res = await fetch(`${API_BASE}/api/skills/browse-directory`)
                              const data = await res.json()

                              if (data.cancelled) {
                                // User cancelled - do nothing
                                return
                              }

                              if (data.path) {
                                setImportPath(data.path)
                                setError(null)
                              } else if (data.error) {
                                setError(data.error)
                              }
                            } catch (err: any) {
                              setError('Failed to open directory picker: ' + err.message)
                            }
                          }}
                          className="px-4 py-2 bg-gray-100 text-gray-700 border rounded-lg hover:bg-gray-200 font-medium whitespace-nowrap dark:bg-gray-800 dark:text-gray-300"
                        >
                          📁 Browse...
                        </button>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        Click Browse to select a directory, or paste the full path manually
                      </p>
                      <p className="text-xs text-gray-500">
                        Example: /Users/you/projects/mechdog-skill
                      </p>
                    </div>
                  </div>
                )}

                {/* GitHub Import */}
                {importSource === 'github' && (
                  <div className="space-y-4">
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                      Import skills from a GitHub repository. Supports single-skill repos and multi-skill repos (auto-detects <code className="bg-gray-100 px-1 rounded dark:bg-gray-800">skills/</code> directory).
                    </p>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2 dark:text-gray-300">
                        GitHub Repository URL
                      </label>
                      <input
                        type="text"
                        value={importPath}
                        onChange={(e) => setImportPath(e.target.value)}
                        placeholder="https://github.com/username/skill-name"
                        className="w-full px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-purple-500 dark:focus:ring-purple-600 focus:border-purple-500 dark:focus:border-purple-600"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Single skill repo or multi-skill repo with skills/ directory (e.g., github.com/user/my-skills)
                      </p>
                    </div>
                  </div>
                )}

                {/* Error Display */}
                {error && (
                  <div className="mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                    ❌ {error}
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-3 mt-6">
                  <button
                    onClick={handleImportSkill}
                    disabled={importing || !importPath.trim()}
                    className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors ${
                      importing || !importPath.trim()
                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        : 'bg-purple-600 text-white hover:bg-purple-700'
                    }`}
                  >
                    {importing ? 'Importing...' : 'Import Skill'}
                  </button>
                  <button
                    onClick={() => {
                      setShowImportDialog(false)
                      setImportPath('')
                      setError(null)
                    }}
                    className="px-6 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition-colors dark:bg-gray-900 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
