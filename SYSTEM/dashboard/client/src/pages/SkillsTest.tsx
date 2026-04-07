import { useState, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { SkillCard } from '../components/skills/SkillCard'
import { useToast } from '../components/Toast'
import type { OpenClawSkill, SkillsResponse, AgentSkillsResponse } from '../types'
import { readLocalSecrets, writeLocalSecrets } from '../lib/localSecrets'

// Use relative path so it works with ngrok and localhost
const API_BASE = ''

function stripFrontmatter(content: string): string {
  if (content.startsWith('---')) {
    const end = content.indexOf('\n---', 3)
    if (end !== -1) {
      return content.slice(end + 4).trim()
    }
  }
  return content
}

export function SkillsTest({ initialAgentId }: { initialAgentId?: string } = {}) {
  const { showSuccess, showWarning, showError: showToastError } = useToast()
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
  const [importSource, setImportSource] = useState<'local' | 'github' | 'registry' | 'partner'>('local')
  const [registryQuery, setRegistryQuery] = useState('')
  const [registryResults, setRegistryResults] = useState<Array<{ name: string; description?: string; version?: string; downloads?: number }>>([])
  const [registrySearching, setRegistrySearching] = useState(false)
  const [registryInstalling, setRegistryInstalling] = useState<string | null>(null)
  const [registryTotal, setRegistryTotal] = useState(0)
  const [registryInstalledNames, setRegistryInstalledNames] = useState<Set<string>>(new Set())
  const [partnerInstallers, setPartnerInstallers] = useState<Array<{
    slug: string
    name: string
    description: string
    logoUrl?: string
    website?: string
    docsUrl?: string
    skills: {
      mode: 'shipables' | 'curated-installer' | 'planned' | 'catalog'
      commandId?: string
      label?: string
      items?: string[]
    }
  }>>([])
  const [partnerInstalling, setPartnerInstalling] = useState<string | null>(null)
  const [viewingSkill, setViewingSkill] = useState<OpenClawSkill | null>(null)
  const [skillContent, setSkillContent] = useState('')
  const [editingSkill, setEditingSkill] = useState(false)
  const [editingDraft, setEditingDraft] = useState('')
  const [loadingSkillContent, setLoadingSkillContent] = useState(false)
  const [savingSkillContent, setSavingSkillContent] = useState(false)
  const [skillSecrets, setSkillSecrets] = useState<Record<string, string>>({})

  // Load agents list on mount
  useEffect(() => {
    loadAgents()
  }, [])

  useEffect(() => {
    fetch('/api/integrations/status')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const definitions = Array.isArray(data?.partnerDefinitions) ? data.partnerDefinitions : []
        setPartnerInstallers(
          definitions.filter((partner: any) => {
            const mode = partner?.skills?.mode
            return mode === 'curated-installer' || mode === 'catalog' || mode === 'shipables'
          })
        )
      })
      .catch(() => setPartnerInstallers([]))
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
      if (!res.ok) throw new Error('Failed to load agents')
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
      setAvailableAgents([])
    }
  }

  async function loadSkills() {
    setLoading(true)
    setError(null)
    try {
      // Fetch all available skills
      const skillsRes = await fetch(`${API_BASE}/api/skills`)
      if (!skillsRes.ok) throw new Error('Failed to load skills')
      const skillsData: SkillsResponse = await skillsRes.json()

      // Fetch agent's assigned skills (only if agentId is set)
      if (agentId) {
        const agentSkillsRes = await fetch(`${API_BASE}/api/skills/agent/${agentId}`)
        if (!agentSkillsRes.ok) throw new Error('Failed to load assigned skills')
        const agentSkillsData: AgentSkillsResponse = await agentSkillsRes.json()
        setAssignedSkills(new Set(Array.isArray(agentSkillsData.skillIds) ? agentSkillsData.skillIds : []))
      } else {
        setAssignedSkills(new Set())
      }

      setAllSkills(Array.isArray(skillsData.skills) ? skillsData.skills : [])
    } catch (error) {
      console.error('Failed to load skills:', error)
      setAllSkills([])
      setAssignedSkills(new Set())
      setError('Failed to load skills. Make sure the server is running and you are signed in.')
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

  async function searchRegistry(query: string, limit = 20) {
    setRegistrySearching(true)
    try {
      const resp = await fetch(`/api/skills/registry/search?q=${encodeURIComponent(query)}&limit=${limit}`)
      const data = await resp.json()
      setRegistryResults(data.results || [])
      setRegistryTotal(data.total || data.results?.length || 0)
    } catch { setRegistryResults([]) }
    finally { setRegistrySearching(false) }
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

  async function openSkillViewer(skill: OpenClawSkill) {
    setViewingSkill(skill)
    setSkillSecrets(readLocalSecrets('skill', skill.name))
    setEditingSkill(false)
    setLoadingSkillContent(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/api/skills/${encodeURIComponent(skill.name)}/content`)
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to load skill content')
      }
      setSkillContent(data.content || '')
      setEditingDraft(data.content || '')
    } catch (err: any) {
      setError(err.message || 'Failed to load skill content')
    } finally {
      setLoadingSkillContent(false)
    }
  }

  async function saveSkillContent() {
    if (!viewingSkill) return

    setSavingSkillContent(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/api/skills/${encodeURIComponent(viewingSkill.name)}/content`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editingDraft })
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save skill')
      }

      setSkillContent(data.content || editingDraft)
      setEditingDraft(data.content || editingDraft)
      setEditingSkill(false)
      showSuccess(`Saved ${viewingSkill.name} and marked it dirty`)
      await loadSkills()
      setViewingSkill(data.skill || viewingSkill)
    } catch (err: any) {
      setError(err.message || 'Failed to save skill')
    } finally {
      setSavingSkillContent(false)
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
                  onView={() => openSkillViewer(skill)}
                  usageCount={users.length}
                  usedBy={users}
                />
              )
            })}
          </div>
        )}
        </>
        )}

        {viewingSkill && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-5xl max-h-[90vh] overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-lg">{viewingSkill.emoji || '📄'}</span>
                    <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 truncate">{viewingSkill.name}</h2>
                    <span className="text-xs px-2 py-0.5 rounded border border-gray-200 text-gray-600 dark:border-gray-700 dark:text-gray-300">
                      {viewingSkill.source}
                    </span>
                    {viewingSkill.dirty && (
                      <span className="text-xs px-2 py-0.5 rounded border border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                        DIRTY
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 truncate">{viewingSkill.filePath}</p>
                </div>
                <button
                  onClick={() => {
                    setViewingSkill(null)
                    setEditingSkill(false)
                    setSkillContent('')
                    setEditingDraft('')
                  }}
                  className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
                >
                  ×
                </button>
              </div>

              <div className="px-6 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between gap-3">
                  <div className="text-sm text-gray-600 dark:text-gray-300">
                  View the raw `skill.md` or inspect the rendered markdown. Editing is only enabled for workspace and managed skills.
                </div>
                <div className="flex items-center gap-2">
                  {!editingSkill && viewingSkill.source !== 'bundled' && (
                    <button
                      onClick={() => {
                        showWarning('Editing this skill will mark it DIRTY so the divergence stays visible.')
                        setEditingDraft(skillContent)
                        setEditingSkill(true)
                      }}
                      className="px-3 py-1.5 rounded-md bg-amber-600 text-white hover:bg-amber-700 text-sm font-medium"
                    >
                      Edit Skill
                    </button>
                  )}
                  {editingSkill && (
                    <>
                      <button
                        onClick={() => {
                          setEditingDraft(skillContent)
                          setEditingSkill(false)
                        }}
                        className="px-3 py-1.5 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 text-sm font-medium"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={saveSkillContent}
                        disabled={savingSkillContent}
                        className="px-3 py-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 text-sm font-medium"
                      >
                        {savingSkillContent ? 'Saving...' : 'Save and Mark Dirty'}
                      </button>
                    </>
                  )}
                </div>
              </div>

              {viewingSkill.secretRequirements && viewingSkill.secretRequirements.length > 0 && (
                <div className="px-6 py-4 border-b border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20">
                  <div className="mb-2 text-sm font-semibold text-amber-900 dark:text-amber-200">Browser-Local Secrets</div>
                  <div className="mb-3 text-xs text-amber-700 dark:text-amber-300">
                    Stored in this browser only. Use these values when this skill needs runtime access to provider-specific inputs.
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {viewingSkill.secretRequirements.map((requirement) => {
                      const inputType = requirement.sensitive || requirement.kind === 'api_key' || requirement.kind === 'token'
                        ? 'password'
                        : requirement.kind === 'url'
                          ? 'url'
                          : 'text'
                      const value = skillSecrets[requirement.key] || ''
                      return (
                        <div key={requirement.key} className="space-y-1.5">
                          <label className="block text-sm font-medium text-amber-900 dark:text-amber-200">
                            {requirement.label}
                            {requirement.required !== false && <span className="ml-1 text-red-500">*</span>}
                          </label>
                          <input
                            type={inputType}
                            value={value}
                            onChange={(e) => {
                              const next = { ...skillSecrets, [requirement.key]: e.target.value }
                              setSkillSecrets(next)
                              writeLocalSecrets('skill', viewingSkill.name, next)
                            }}
                            placeholder={requirement.placeholder || requirement.key}
                            className="w-full rounded-md border border-amber-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500 dark:border-amber-700 dark:bg-gray-900 dark:text-gray-100"
                          />
                          {requirement.help && (
                            <div className="text-xs text-amber-800 dark:text-amber-200">{requirement.help}</div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {editingSkill && (
                <div className="px-6 py-3 border-b border-amber-200 bg-amber-50 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
                  You are editing this skill in the dashboard. Saving will set `metadata.openclaw.dirty: true`.
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 h-[calc(90vh-180px)] min-h-0">
                <div className="border-r border-gray-200 dark:border-gray-700 min-h-0 flex flex-col">
                  <div className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                    Raw skill.md
                  </div>
                  {loadingSkillContent ? (
                    <div className="p-6 text-sm text-gray-500 dark:text-gray-400">Loading skill content...</div>
                  ) : editingSkill ? (
                    <textarea
                      value={editingDraft}
                      onChange={(e) => setEditingDraft(e.target.value)}
                      className="flex-1 min-h-0 w-full p-6 font-mono text-sm bg-white text-gray-900 dark:bg-gray-900 dark:text-gray-100 outline-none resize-none overflow-auto"
                      spellCheck={false}
                    />
                  ) : (
                    <div className="flex-1 min-h-0 overflow-auto">
                      <pre className="p-6 text-sm whitespace-pre-wrap break-words text-gray-800 dark:text-gray-200">{skillContent}</pre>
                    </div>
                  )}
                </div>
                <div className="bg-gray-50 dark:bg-gray-900/40 min-h-0 flex flex-col">
                  <div className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                    Rendered View
                  </div>
                  <div className="flex-1 min-h-0 overflow-auto">
                    <div className="prose prose-sm max-w-none p-6 dark:prose-invert">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {stripFrontmatter(editingSkill ? editingDraft : skillContent)}
                      </ReactMarkdown>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Import Skill Dialog */}
        {showImportDialog && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-3xl w-full max-h-[85vh] mx-4 flex flex-col overflow-hidden">
              <div className="p-6 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between gap-4">
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
              </div>

              <div className="px-6 pt-4 pb-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setImportSource('local')}
                    className={`px-3 py-2 rounded-full text-sm font-medium transition-colors ${
                      importSource === 'local'
                        ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300'
                        : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                  >
                    📁 Local Directory
                  </button>
                  <button
                    onClick={() => setImportSource('github')}
                    className={`px-3 py-2 rounded-full text-sm font-medium transition-colors ${
                      importSource === 'github'
                        ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300'
                        : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                  >
                    🐙 GitHub Repository
                  </button>
                  <button
                    onClick={() => setImportSource('registry')}
                    className={`px-3 py-2 rounded-full text-sm font-medium transition-colors ${
                      importSource === 'registry'
                        ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300'
                        : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                  >
                    🚀 Shipables Registry
                  </button>
                  <button
                    onClick={() => setImportSource('partner')}
                    className={`px-3 py-2 rounded-full text-sm font-medium transition-colors ${
                      importSource === 'partner'
                        ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300'
                        : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                  >
                    🤝 Partner Skills
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-6">

                {/* Local Import */}
                {importSource === 'local' && (
                  <div className="space-y-4">
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                      Enter the path to a skill directory or a directory containing multiple skills. Each skill needs:
                    </p>
                    <ul className="text-sm text-gray-600 dark:text-gray-300 list-disc list-inside space-y-1 ml-2">
                      <li><code className="bg-gray-100 px-1 rounded dark:bg-gray-800">skill.md</code> - Skill description (YAML frontmatter + markdown)</li>
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
                          className="px-4 py-2 bg-gray-100 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-200 font-medium whitespace-nowrap dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600 dark:hover:bg-gray-600"
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

                {/* Shipables Registry */}
                {importSource === 'registry' && (
                  <div className="space-y-4">
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                      Browse and install skills from <a href="https://shipables.dev" target="_blank" rel="noopener noreferrer" className="text-purple-600 hover:underline">Shipables.dev</a> — agent skills using the open <a href="https://agentskills.io" target="_blank" rel="noopener noreferrer" className="text-purple-600 hover:underline">agentskills.io</a> standard.
                    </p>

                    {/* Search */}
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={registryQuery}
                        onChange={e => setRegistryQuery(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') searchRegistry(registryQuery) }}
                        placeholder="Search skills... (e.g., github, slack, salesforce)"
                        className="flex-1 px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-purple-500 text-sm"
                      />
                      <button
                        onClick={() => searchRegistry(registryQuery)}
                        disabled={registrySearching}
                        className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 disabled:cursor-not-allowed text-sm font-medium"
                      >
                        {registrySearching ? 'Searching...' : 'Search'}
                      </button>
                    </div>

                    {/* Quick category buttons */}
                    <div className="flex flex-wrap gap-1.5">
                      {['github', 'slack', 'api', 'data', 'ai', 'web', 'devops', 'crm'].map(cat => (
                        <button
                          key={cat}
                          onClick={() => { setRegistryQuery(cat); searchRegistry(cat) }}
                          className="px-2.5 py-1 text-xs rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-purple-100 dark:hover:bg-purple-900/30 hover:text-purple-700 dark:hover:text-purple-300 transition-colors"
                        >
                          {cat}
                        </button>
                      ))}
                    </div>

                    {/* Auto-load popular on first render */}
                    {registryResults.length === 0 && !registrySearching && !registryQuery && (
                      <div className="text-center py-4">
                        <button
                          onClick={() => searchRegistry('', 30)}
                          className="text-sm text-purple-600 hover:text-purple-700 font-medium"
                        >
                          Browse all skills →
                        </button>
                      </div>
                    )}

                    {/* Loading */}
                    {registrySearching && (
                      <div className="text-center py-6 text-gray-400 text-sm">Searching Shipables registry...</div>
                    )}

                    {/* Results */}
                    {!registrySearching && registryResults.length > 0 && (
                      <div>
                        <div className="text-xs text-gray-400 mb-2">
                          Showing {registryResults.length} of {registryTotal} skill{registryTotal !== 1 ? 's' : ''}
                        </div>
                        <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden max-h-80 overflow-y-auto">
                          {registryResults.map((skill: any, idx: number) => {
                            const installName = skill.full_name || skill.name
                            const isInstalled = registryInstalledNames.has(installName)
                            return (
                              <div key={idx} className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium text-sm text-gray-900 dark:text-gray-100">{installName}</div>
                                  {skill.description && <div className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{skill.description.split('\n')[0]}</div>}
                                  <div className="flex gap-3 mt-1 text-[10px] text-gray-400">
                                    {skill.latest_version && <span>v{skill.latest_version}</span>}
                                    {skill.downloads_weekly != null && <span>{skill.downloads_weekly}/week</span>}
                                    {skill.categories?.length > 0 && <span>{skill.categories.join(', ')}</span>}
                                  </div>
                                </div>
                                {isInstalled ? (
                                  <span className="ml-3 px-3 py-1.5 text-xs font-medium text-gray-400 dark:text-gray-500 border border-gray-200 dark:border-gray-700 rounded-md shrink-0">
                                    Installed
                                  </span>
                                ) : (
                                  <button
                                    onClick={async () => {
                                      setRegistryInstalling(installName)
                                      try {
                                        const resp = await fetch('/api/skills/registry/install', {
                                          method: 'POST',
                                          headers: { 'Content-Type': 'application/json' },
                                          body: JSON.stringify({ name: installName }),
                                        })
                                        const data = await resp.json()
                                        if (data.ok) {
                                          showSuccess(`Installed "${installName}" from Shipables`)
                                          setRegistryInstalledNames(prev => new Set([...prev, installName]))
                                          loadSkills()
                                        } else {
                                          showToastError(data.error || 'Install failed')
                                        }
                                      } catch {
                                        showToastError('Network error installing skill')
                                      } finally {
                                        setRegistryInstalling(null)
                                      }
                                    }}
                                    disabled={!!registryInstalling}
                                    className="ml-3 px-3 py-1.5 text-xs font-medium bg-emerald-600 text-white rounded-md hover:bg-emerald-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 disabled:cursor-not-allowed shrink-0"
                                  >
                                    {registryInstalling === installName ? 'Installing...' : 'Install'}
                                  </button>
                                )}
                              </div>
                            )
                          })}
                        </div>
                        {registryResults.length < registryTotal && (
                          <button
                            onClick={() => searchRegistry(registryQuery, registryResults.length + 20)}
                            className="mt-2 w-full py-2 text-sm text-purple-600 hover:text-purple-700 font-medium text-center border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                          >
                            Load more ({registryTotal - registryResults.length} remaining)
                          </button>
                        )}
                      </div>
                    )}

                    {!registrySearching && registryResults.length === 0 && registryQuery && (
                      <div className="text-center py-6 text-gray-400 text-sm">
                        No results for "{registryQuery}". Try a different term.
                      </div>
                    )}
                  </div>
                )}

                {importSource === 'partner' && (
                  <div className="space-y-4">
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                      Browse partner-backed skills and approved installers. Install buttons appear only for curated allowlisted commands.
                    </p>

                    {partnerInstallers.length === 0 ? (
                      <div className="text-center py-8 text-sm text-gray-400">
                        No partner-backed skills are enabled in this environment.
                      </div>
                    ) : (
                      <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                        {partnerInstallers.map((partner, idx) => (
                          <div key={partner.slug} className={`flex items-start justify-between gap-4 px-4 py-4 ${idx < partnerInstallers.length - 1 ? 'border-b border-gray-100 dark:border-gray-800' : ''}`}>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                {partner.logoUrl ? (
                                  <img
                                    src={partner.logoUrl}
                                    alt={`${partner.name} logo`}
                                    className="h-6 w-auto max-w-[96px] object-contain rounded-sm bg-white/80 px-1 py-0.5 dark:bg-gray-800/80"
                                    loading="lazy"
                                  />
                                ) : null}
                                <div className="font-medium text-sm text-gray-900 dark:text-gray-100">{partner.name}</div>
                              </div>
                              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{partner.description}</div>
                              <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                                {partner.skills.label || (
                                  partner.skills.mode === 'curated-installer'
                                    ? 'Curated skill install available'
                                    : partner.skills.mode === 'shipables'
                                      ? 'Known Shipables skills'
                                      : 'Known partner skills'
                                )}
                              </div>
                              {partner.skills.items && partner.skills.items.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {partner.skills.items.map((item) => (
                                    <span
                                      key={item}
                                      className="inline-flex items-center rounded-full border border-gray-200 dark:border-gray-700 px-2.5 py-1 text-xs text-gray-700 dark:text-gray-300"
                                    >
                                      {item}
                                    </span>
                                  ))}
                                </div>
                              )}
                              {(partner.website || partner.docsUrl) && (
                                <div className="mt-2 flex gap-3 text-xs">
                                  {partner.website ? <a href={partner.website} target="_blank" rel="noopener noreferrer" className="text-purple-600 hover:underline">Website</a> : null}
                                  {partner.docsUrl ? <a href={partner.docsUrl} target="_blank" rel="noopener noreferrer" className="text-purple-600 hover:underline">Docs</a> : null}
                                </div>
                              )}
                            </div>
                            {partner.skills.mode === 'curated-installer' ? (
                              <button
                                onClick={async () => {
                                  if (!partner.skills.commandId) return
                                  setPartnerInstalling(partner.slug)
                                  try {
                                    const resp = await fetch('/api/skills/partner-install', {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ commandId: partner.skills.commandId }),
                                    })
                                    const data = await resp.json().catch(() => ({}))
                                    if (!resp.ok) throw new Error(data.error || 'Install failed')
                                    showSuccess(`Installed ${partner.name} skills`)
                                    await loadSkills()
                                  } catch (err: any) {
                                    showToastError(err.message || `Failed to install ${partner.name} skills`)
                                  } finally {
                                    setPartnerInstalling(null)
                                  }
                                }}
                                disabled={!!partnerInstalling}
                                className="px-3 py-1.5 text-xs font-medium bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 disabled:cursor-not-allowed shrink-0"
                              >
                                {partnerInstalling === partner.slug ? 'Installing...' : 'Install'}
                              </button>
                            ) : (
                              <div className="shrink-0 text-xs text-gray-400 dark:text-gray-500">
                                {partner.skills.mode === 'shipables' ? 'Install from Shipables' : 'Reference'}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Error Display */}
                {error && (
                  <div className="mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                    ❌ {error}
                  </div>
                )}
              </div>

              {/* Actions (for local/github only) */}
              {importSource !== 'registry' && importSource !== 'partner' && (
                <div className="flex gap-3 p-6 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40">
                    <button
                      onClick={handleImportSkill}
                      disabled={importing || !importPath.trim()}
                      className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors ${
                        importing || !importPath.trim()
                          ? 'bg-gray-300 text-gray-500 cursor-not-allowed dark:bg-gray-700 dark:text-gray-400'
                          : 'bg-purple-600 text-white hover:bg-purple-700 dark:bg-purple-500 dark:hover:bg-purple-400'
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
                      className="px-6 py-2 border border-gray-300 dark:border-gray-600 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition-colors dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-700"
                    >
                      Cancel
                    </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
