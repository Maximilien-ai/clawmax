import { useState, useEffect, useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { SkillCard } from '../components/skills/SkillCard'
import { useToast } from '../components/Toast'
import type { OpenClawSkill, SkillsResponse, AgentSkillsResponse } from '../types'
import { readLocalSecrets, writeLocalSecrets, writeSharedSecrets } from '../lib/localSecrets'
import { hasAiGenerationAccess, readStoredByokKeys } from '../lib/byok'
import { getSkillAssignmentBuckets } from '../lib/skillAssignments'
import { filterAssignableAgents, partitionSkillsBySource, toggleItemSelection, toggleVisibleSelections } from '../lib/skillsSelection'
import { useAuth } from '../contexts/AuthContext'

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

function getSkillMatchScore(skill: OpenClawSkill, query: string): number {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return 0

  let score = 0
  const name = skill.name.toLowerCase()
  const description = skill.description.toLowerCase()
  const tags = (skill.tags || []).map((tag) => tag.toLowerCase())
  const tokens = normalized.split(/\s+/).filter(Boolean)

  if (name === normalized) score += 100
  if (name.startsWith(normalized)) score += 60
  if (name.includes(normalized)) score += 40
  if (description.includes(normalized)) score += 20
  if (tags.some((tag) => tag.includes(normalized))) score += 25

  for (const token of tokens) {
    if (name.includes(token)) score += 12
    if (description.includes(token)) score += 6
    if (tags.some((tag) => tag.includes(token))) score += 8
  }

  return score
}

const SKILL_SPEC_SECTIONS = [
  '## Purpose',
  '## When to Use',
  '## Instructions',
  '## Examples',
]

export function SkillsTest({ initialAgentId }: { initialAgentId?: string } = {}) {
  const { config } = useAuth()
  const { showSuccess, showWarning, showError: showToastError } = useToast()
  const aiEnabled = hasAiGenerationAccess(config)
  const [allSkills, setAllSkills] = useState<OpenClawSkill[]>([])
  const [assignedSkills, setAssignedSkills] = useState<Set<string>>(new Set())
  const [skillUsage, setSkillUsage] = useState<Map<string, string[]>>(new Map())
  const [agentSkillMap, setAgentSkillMap] = useState<Map<string, string[]>>(new Map())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterAssigned, setFilterAssigned] = useState<'all' | 'assigned' | 'available'>('all')
  const [agentId, setAgentId] = useState(initialAgentId || '')
  const [availableAgents, setAvailableAgents] = useState<string[]>([])
  const [agentSearchQuery, setAgentSearchQuery] = useState('')
  const [showAgentDropdown, setShowAgentDropdown] = useState(false)
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedSkillIds, setSelectedSkillIds] = useState<Set<string>>(new Set())
  const [showBulkAssignModal, setShowBulkAssignModal] = useState(false)
  const [selectedBulkAgentIds, setSelectedBulkAgentIds] = useState<Set<string>>(new Set())
  const [bulkAgentSearchQuery, setBulkAgentSearchQuery] = useState('')
  const [bulkAssigningSkills, setBulkAssigningSkills] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showSkillActionsMenu, setShowSkillActionsMenu] = useState(false)
  const [showImportDialog, setShowImportDialog] = useState(false)
  const [importPath, setImportPath] = useState('')
  const [importing, setImporting] = useState(false)
  const [importSource, setImportSource] = useState<'local' | 'github' | 'registry' | 'partner' | 'ai'>('local')
  const [registryQuery, setRegistryQuery] = useState('')
  const [registryResults, setRegistryResults] = useState<Array<{ name: string; description?: string; version?: string; downloads?: number }>>([])
  const [registrySearching, setRegistrySearching] = useState(false)
  const [registryInstalling, setRegistryInstalling] = useState<string | null>(null)
  const [registryTotal, setRegistryTotal] = useState(0)
  const [registryInstalledNames, setRegistryInstalledNames] = useState<Set<string>>(new Set())
  const [inlineRegistrySuggestions, setInlineRegistrySuggestions] = useState<Array<{ name: string; description?: string; latest_version?: string; downloads_weekly?: number; full_name?: string }>>([])
  const [inlineRegistryLoading, setInlineRegistryLoading] = useState(false)
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
  const [installedPartnerSlugs, setInstalledPartnerSlugs] = useState<Set<string>>(new Set())
  const [aiSkillPrompt, setAiSkillPrompt] = useState('')
  const [aiSkillRefinementPrompt, setAiSkillRefinementPrompt] = useState('')
  const [aiSkillGenerating, setAiSkillGenerating] = useState(false)
  const [aiSkillCreating, setAiSkillCreating] = useState(false)
  const [generatedSkillDraft, setGeneratedSkillDraft] = useState<null | {
    name: string
    description: string
    emoji?: string
    tags: string[]
    content: string
  }>(null)
  const [viewingSkill, setViewingSkill] = useState<OpenClawSkill | null>(null)
  const [skillContent, setSkillContent] = useState('')
  const [editingSkill, setEditingSkill] = useState(false)
  const [editingDraft, setEditingDraft] = useState('')
  const [loadingSkillContent, setLoadingSkillContent] = useState(false)
  const [savingSkillContent, setSavingSkillContent] = useState(false)
  const [skillSecrets, setSkillSecrets] = useState<Record<string, string>>({})
  const [viewerAgentSearchQuery, setViewerAgentSearchQuery] = useState('')
  const [savingSkillAssignmentAgentId, setSavingSkillAssignmentAgentId] = useState<string | null>(null)

  const focusSkill = (skillName: string) => {
    const normalized = skillName.trim().toLowerCase()
    if (!normalized) return
    setSearchQuery(skillName)
    const exactSkill = allSkills.find((skill) => skill.name.toLowerCase() === normalized)
    if (exactSkill) {
      void openSkillViewer(exactSkill)
    }
  }

  // Load agents list on mount
  useEffect(() => {
    loadAgents()
  }, [])

  useEffect(() => {
    const handleAgentsUpdated = () => {
      loadAgents()
    }

    window.addEventListener('agents-updated', handleAgentsUpdated)
    return () => window.removeEventListener('agents-updated', handleAgentsUpdated)
  }, [agentId])

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

  useEffect(() => {
    const handleOpenSkillSearch = (event: Event) => {
      const detail = (event as CustomEvent<{ skill?: string }>).detail
      if (detail?.skill) {
        focusSkill(detail.skill)
      }
    }
    window.addEventListener('clawmax-open-skill-search', handleOpenSkillSearch as EventListener)
    return () => window.removeEventListener('clawmax-open-skill-search', handleOpenSkillSearch as EventListener)
  }, [allSkills])

  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.trim().length < 2) {
      setInlineRegistrySuggestions([])
      setInlineRegistryLoading(false)
      return
    }

    const controller = new AbortController()
    const timeout = window.setTimeout(async () => {
      setInlineRegistryLoading(true)
      try {
        const resp = await fetch(`/api/skills/registry/search?q=${encodeURIComponent(searchQuery.trim())}&limit=6`, {
          signal: controller.signal,
        })
        const data = await resp.json()
        setInlineRegistrySuggestions(Array.isArray(data.results) ? data.results : [])
      } catch (err: any) {
        if (err?.name !== 'AbortError') {
          setInlineRegistrySuggestions([])
        }
      } finally {
        setInlineRegistryLoading(false)
      }
    }, 350)

    return () => {
      controller.abort()
      window.clearTimeout(timeout)
    }
  }, [searchQuery])

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
      const skillsByAgent = new Map<string, string[]>()

      // Set default agent to first available, or reset if current agent isn't in this workspace
      if (agentIds.length > 0 && (!agentId || !agentIds.includes(agentId))) {
        setAgentId(agentIds[0])
      }

      // Compute skill usage across all agents
      const usage = new Map<string, string[]>()
      for (const agent of agents) {
        const agentSkills = Array.isArray(agent.skills) ? agent.skills : []
        skillsByAgent.set(agent.id, agentSkills)
        if (agentSkills.length > 0) {
          for (const skill of agentSkills) {
            const users = usage.get(skill) || []
            users.push(agent.id)
            usage.set(skill, users)
          }
        }
      }
      setAgentSkillMap(skillsByAgent)
      setSkillUsage(usage)
    } catch (error) {
      console.error('Failed to load agents:', error)
      setAvailableAgents([])
      setAgentSkillMap(new Map())
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

  function updateLocalAgentSkillState(targetAgentId: string, nextSkills: string[]) {
    setAgentSkillMap((current) => {
      const next = new Map(current)
      next.set(targetAgentId, nextSkills)
      return next
    })
    setSkillUsage((current) => {
      const next = new Map<string, string[]>()
      for (const [skillName, users] of current.entries()) {
        const filtered = users.filter((id) => id !== targetAgentId)
        if (filtered.length > 0) {
          next.set(skillName, filtered)
        }
      }
      for (const skillName of nextSkills) {
        const users = next.get(skillName) || []
        if (!users.includes(targetAgentId)) {
          next.set(skillName, [...users, targetAgentId].sort((a, b) => a.localeCompare(b)))
        }
      }
      return next
    })
    if (targetAgentId === agentId) {
      setAssignedSkills(new Set(nextSkills))
    }
  }

  async function persistAgentSkills(targetAgentId: string, skillsList: string[]) {
    const response = await fetch(`${API_BASE}/api/skills/agent/${targetAgentId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skills: skillsList })
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error || 'Failed to update skills')
    }

    await response.json().catch(() => ({}))
    updateLocalAgentSkillState(targetAgentId, skillsList)
  }

  async function toggleSkill(skillId: string) {
    console.log('Toggle skill:', skillId, 'for agent:', agentId)

    const currentSkills = agentSkillMap.get(agentId) || Array.from(assignedSkills)
    const nextSkills = currentSkills.includes(skillId)
      ? currentSkills.filter((skill) => skill !== skillId)
      : [...currentSkills, skillId]

    setError(null)
    setSaving(true)

    try {
      console.log('Sending PUT request:', nextSkills)
      await persistAgentSkills(agentId, nextSkills)
      setError(null)
    } catch (error: any) {
      console.error('Failed to update skills:', error)
      setError(error.message || 'Failed to update skills')
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

  async function installRegistrySkill(installName: string) {
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
        await loadSkills()
      } else {
        showToastError(data.error || 'Install failed')
      }
    } catch {
      showToastError('Network error installing skill')
    } finally {
      setRegistryInstalling(null)
    }
  }

  function openImportDialog(source: 'local' | 'github' | 'registry' | 'partner' | 'ai') {
    setError(null)
    setImportSource(source)
    setShowImportDialog(true)
    setShowSkillActionsMenu(false)
    if (source !== 'registry') {
      setRegistryQuery('')
      setRegistryResults([])
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
        if (data.warning) {
          showWarning(data.warning)
        }
        // Handle multi-skill import response
        if (data.total && data.total > 1) {
          const failed = data.skills?.filter((s: any) => !s.ok) || []
          const warnings = data.skills?.filter((s: any) => s.warning).map((s: any) => s.warning) || []
          showSuccess(`Imported ${data.imported}/${data.total} skills`)
          if (warnings.length > 0) {
            showWarning(warnings.join(' '))
          }
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

  async function handleGenerateSkill(refine = false) {
    const activePrompt = refine ? aiSkillRefinementPrompt.trim() : aiSkillPrompt.trim()
    if (!activePrompt) {
      setError(refine ? 'Describe how you want to refine the draft' : 'Describe the skill you want to create')
      return
    }
    if (!aiEnabled) {
      setError('AI skill generation needs browser-local keys or a usable shared execution path first. Open Workspaces Integrations or Keys & Secrets before generating.')
      return
    }

    setAiSkillGenerating(true)
    setError(null)
    try {
      const byok = readStoredByokKeys()
      const res = await fetch(`${API_BASE}/api/skills/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: activePrompt,
          currentDraft: refine ? generatedSkillDraft : undefined,
          byokKeys: {
            openai: byok.openai,
            anthropic: byok.anthropic,
            gemini: byok.geminiApiKey,
          },
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.skill) {
        throw new Error(data.error || 'Failed to generate skill')
      }
      setGeneratedSkillDraft(data.skill)
      if (refine) {
        setAiSkillRefinementPrompt('')
        showSuccess(`Refined skill draft: ${data.skill.name}`)
      } else {
        showSuccess(`Generated skill draft: ${data.skill.name}`)
      }
    } catch (err: any) {
      setError(err.message || 'Failed to generate skill')
    } finally {
      setAiSkillGenerating(false)
    }
  }

  async function handleCreateGeneratedSkill() {
    if (!generatedSkillDraft) return

    setAiSkillCreating(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/api/skills`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(generatedSkillDraft),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.skill) {
        throw new Error(data.error || 'Failed to create skill')
      }
      await loadSkills()
      setShowImportDialog(false)
      setImportSource('local')
      setAiSkillPrompt('')
      setAiSkillRefinementPrompt('')
      setGeneratedSkillDraft(null)
      showSuccess(`Created skill: ${data.skill.name}`)
    } catch (err: any) {
      setError(err.message || 'Failed to create skill')
    } finally {
      setAiSkillCreating(false)
    }
  }

  async function openSkillViewer(skill: OpenClawSkill) {
    setViewingSkill(skill)
    setSkillSecrets(readLocalSecrets('skill', skill.name))
    setEditingSkill(false)
    setViewerAgentSearchQuery('')
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
      showSuccess(viewingSkill.source === 'bundled'
        ? `Saved ${viewingSkill.name} as a workspace copy and marked it dirty`
        : `Saved ${viewingSkill.name} and marked it dirty`)
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

  const { userSkills: sortedUserSkills, builtInSkills: sortedBuiltInSkills } = useMemo(
    () => partitionSkillsBySource(sortedSkills),
    [sortedSkills]
  )

  const closeMatchSkills = useMemo(() => {
    if (!searchQuery.trim()) return []
    const exactNames = new Set(filteredSkills.map((skill) => skill.name))
    return [...allSkills]
      .filter((skill) => !exactNames.has(skill.name))
      .map((skill) => ({ skill, score: getSkillMatchScore(skill, searchQuery) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || a.skill.name.localeCompare(b.skill.name))
      .slice(0, 5)
      .map((entry) => entry.skill)
  }, [allSkills, filteredSkills, searchQuery])

  const visibleInlineRegistrySuggestions = inlineRegistrySuggestions
    .map((skill) => ({ ...skill, installName: skill.full_name || skill.name }))
    .filter((skill) => !registryInstalledNames.has(skill.installName))
    .slice(0, 5)
  const visiblePartnerInstallers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    return partnerInstallers.filter((partner) => {
      if (!query) return true
      return [
        partner.name,
        partner.description,
        partner.skills.label || '',
        ...(partner.skills.items || []),
      ].join(' ').toLowerCase().includes(query)
    })
  }, [partnerInstallers, searchQuery])
  const missingGeneratedSkillSections = generatedSkillDraft
    ? SKILL_SPEC_SECTIONS.filter((section) => !generatedSkillDraft.content.includes(section))
    : []
  const viewingSkillAssignmentBuckets = useMemo(() => {
    if (!viewingSkill) {
      return { assignedAgentIds: [], unassignedAgentIds: [] }
    }
    return getSkillAssignmentBuckets(viewingSkill.name, availableAgents, agentSkillMap)
  }, [agentSkillMap, availableAgents, viewingSkill])
  const filteredViewerAvailableAgents = viewingSkillAssignmentBuckets.unassignedAgentIds.filter((agent) =>
    agent.toLowerCase().includes(viewerAgentSearchQuery.trim().toLowerCase())
  )
  const filteredBulkAgents = useMemo(
    () => filterAssignableAgents(availableAgents, bulkAgentSearchQuery),
    [availableAgents, bulkAgentSearchQuery]
  )

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
              <div className="relative">
                <button
                  onClick={() => setShowSkillActionsMenu(!showSkillActionsMenu)}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm font-medium"
                  title="Create, import, or export skills"
                >
                  ✨ Skill Actions <span className="text-xs">▾</span>
                </button>
                {showSkillActionsMenu && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowSkillActionsMenu(false)} />
                    <div className="absolute left-0 top-full z-20 mt-2 w-64 rounded-xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-800">
                      <button
                        onClick={() => openImportDialog('ai')}
                        className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50"
                      >
                        <span className="text-base leading-none">✨</span>
                        <span>
                          <span className="block text-sm font-medium text-gray-900 dark:text-gray-100">Create Skill with AI</span>
                          <span className="block text-xs text-gray-500 dark:text-gray-400">Generate, refine, and save a new custom skill.</span>
                        </span>
                      </button>
                      <button
                        onClick={() => openImportDialog('local')}
                        className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50"
                      >
                        <span className="text-base leading-none">📁</span>
                        <span>
                          <span className="block text-sm font-medium text-gray-900 dark:text-gray-100">Import Local Skill</span>
                          <span className="block text-xs text-gray-500 dark:text-gray-400">Bring in a skill from a directory on disk.</span>
                        </span>
                      </button>
                      <button
                        onClick={() => openImportDialog('github')}
                        className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50"
                      >
                        <span className="text-base leading-none">🌐</span>
                        <span>
                          <span className="block text-sm font-medium text-gray-900 dark:text-gray-100">Import from GitHub</span>
                          <span className="block text-xs text-gray-500 dark:text-gray-400">Clone and import a skill from a GitHub repo.</span>
                        </span>
                      </button>
                      <button
                        onClick={() => openImportDialog('registry')}
                        className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50"
                      >
                        <span className="text-base leading-none">🚢</span>
                        <span>
                          <span className="block text-sm font-medium text-gray-900 dark:text-gray-100">Browse Shipables</span>
                          <span className="block text-xs text-gray-500 dark:text-gray-400">Discover and install skills from the registry.</span>
                        </span>
                      </button>
                      {partnerInstallers.length > 0 && (
                        <button
                          onClick={() => openImportDialog('partner')}
                          className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50"
                        >
                          <span className="text-base leading-none">🤝</span>
                          <span>
                            <span className="block text-sm font-medium text-gray-900 dark:text-gray-100">Partner Skills</span>
                            <span className="block text-xs text-gray-500 dark:text-gray-400">Install or browse skills from integrated partners.</span>
                          </span>
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setShowSkillActionsMenu(false)
                          showWarning('Skill export is coming soon.')
                        }}
                        className="flex w-full items-start gap-3 border-t border-gray-200 px-4 py-3 text-left hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700/50"
                      >
                        <span className="text-base leading-none">📦</span>
                        <span>
                          <span className="block text-sm font-medium text-gray-900 dark:text-gray-100">Export Skill</span>
                          <span className="block text-xs text-gray-500 dark:text-gray-400">Coming soon. Package a skill for sharing or reuse.</span>
                        </span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Searchable Agent Selector */}
            {availableAgents.length > 0 && (
              <div className="relative">
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Selected Agent
                </label>
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
                onClick={() => {
                  setSelectionMode((current) => {
                    if (current) {
                      setSelectedSkillIds(new Set())
                    }
                    return !current
                  })
                }}
                className={`px-4 py-2 rounded-lg font-medium ${
                  selectionMode
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                {selectionMode ? 'Done Selecting' : 'Select'}
              </button>
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

          <div className="mt-2 flex flex-wrap items-center justify-between gap-3 text-sm text-gray-600 dark:text-gray-300">
            <span>
            Showing {filteredSkills.length} of {allSkills.length} skills
            </span>
            {selectionMode && filteredSkills.length > 0 && (
              <button
                onClick={() => setSelectedSkillIds((current) => toggleVisibleSelections(current, filteredSkills.map((skill) => skill.name)))}
                className="text-sm font-medium text-blue-600 hover:text-blue-700"
                title="Toggle select all visible skills"
              >
                {filteredSkills.every((skill) => selectedSkillIds.has(skill.name)) ? 'Deselect All Visible' : 'Select All Visible'}
              </button>
            )}
          </div>
        </div>

        {selectionMode && (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-purple-200 bg-purple-50 px-4 py-3 dark:border-purple-800 dark:bg-purple-900/20">
            <div className="text-sm font-medium text-purple-900 dark:text-purple-200">
              {selectedSkillIds.size} skill{selectedSkillIds.size !== 1 ? 's' : ''} selected
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setSelectedBulkAgentIds(new Set(agentId ? [agentId] : []))
                  setBulkAgentSearchQuery('')
                  setShowBulkAssignModal(true)
                }}
                disabled={selectedSkillIds.size === 0 || availableAgents.length === 0}
                className="px-4 py-2 rounded-lg bg-purple-600 text-white hover:bg-purple-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 disabled:cursor-not-allowed text-sm font-medium"
              >
                Add Selected Skills to Agents
              </button>
              <button
                onClick={() => setSelectedSkillIds(new Set())}
                disabled={selectedSkillIds.size === 0}
                className="px-4 py-2 rounded-lg border border-purple-300 text-purple-700 hover:bg-purple-100 dark:border-purple-700 dark:text-purple-200 dark:hover:bg-purple-900/30 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
              >
                Clear Selection
              </button>
            </div>
          </div>
        )}

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

        {visiblePartnerInstallers.length > 0 && (
          <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border mb-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-1 dark:text-gray-300">Install from Partner</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Skills available from enabled partner integrations.
                </p>
              </div>
              <button
                onClick={() => openImportDialog('partner')}
                className="text-xs font-medium text-purple-600 hover:text-purple-700"
              >
                Browse all
              </button>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {visiblePartnerInstallers.map((partner) => (
                <div key={`partner-surface-${partner.slug}`} className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                  <div className="flex items-center gap-2">
                    {partner.logoUrl ? (
                      <img
                        src={partner.logoUrl}
                        alt={`${partner.name} logo`}
                        className="h-6 w-auto max-w-[96px] object-contain rounded-sm bg-white/80 px-1 py-0.5 dark:bg-gray-800/80"
                        loading="lazy"
                      />
                    ) : null}
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{partner.name}</div>
                  </div>
                  <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">{partner.description}</div>
                  {partner.skills.items && partner.skills.items.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {partner.skills.items.map((item) => (
                        <button
                          key={`${partner.slug}-${item}`}
                          type="button"
                          onClick={() => focusSkill(item)}
                          className="inline-flex items-center rounded-full border border-gray-200 dark:border-gray-700 px-2.5 py-1 text-xs text-gray-700 dark:text-gray-300"
                        >
                          {item}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="mt-4 flex items-center justify-between gap-2">
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {partner.skills.label || 'Partner skill installer'}
                      {partner.skills.mode === 'curated-installer' ? ' · usually 1-3 minutes' : ''}
                    </div>
                    {partner.skills.mode === 'curated-installer' ? (
                      installedPartnerSlugs.has(partner.slug) ? (
                        <span className="px-3 py-1.5 text-xs font-medium text-gray-400 dark:text-gray-500 border border-gray-200 dark:border-gray-700 rounded-md shrink-0">
                          Installed
                        </span>
                      ) : (
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
                              if (!resp.ok) throw new Error(data.detail || data.error || 'Install failed')
                              showSuccess(`Installed ${partner.name} skills`)
                              setInstalledPartnerSlugs((current) => new Set([...current, partner.slug]))
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
                      )
                    ) : (
                      <button
                        onClick={() => openImportDialog('partner')}
                        className="px-3 py-1.5 text-xs font-medium rounded-md border border-purple-300 dark:border-purple-700 text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900/20"
                      >
                        Browse
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Skills Grid */}
        {filteredSkills.length === 0 ? (
          <div className="space-y-4">
            <div className="bg-white dark:bg-gray-800 p-5 rounded-lg border text-center">
              <div className="text-gray-400 text-3xl mb-2">🔍</div>
              <p className="text-sm text-gray-600 dark:text-gray-300">No exact skill matches yet</p>
              {searchQuery.trim() && (
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Try a close match below or discover something new from Shipables.
                </p>
              )}
            </div>
            {searchQuery.trim() && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-white dark:bg-gray-800 p-5 rounded-lg border">
                  <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Close matches in this workspace</div>
                  {closeMatchSkills.length > 0 ? (
                    <div className="space-y-2">
                      {closeMatchSkills.map((skill) => (
                        <button
                          key={skill.name}
                          onClick={() => setSearchQuery(skill.name)}
                          className="w-full text-left rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                        >
                          <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{skill.name}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{skill.description}</div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-gray-500 dark:text-gray-400">No close installed-skill matches yet.</div>
                  )}
                </div>
                <div className="bg-white dark:bg-gray-800 p-5 rounded-lg border">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">Discover on Shipables</div>
                    <button
                      onClick={() => {
                        setShowImportDialog(true)
                        setImportSource('registry')
                        setRegistryQuery(searchQuery.trim())
                        searchRegistry(searchQuery.trim())
                      }}
                      className="text-xs font-medium text-purple-600 hover:text-purple-700"
                    >
                      Open registry
                    </button>
                  </div>
                  {inlineRegistryLoading ? (
                    <div className="text-sm text-gray-500 dark:text-gray-400">Searching Shipables…</div>
                  ) : visibleInlineRegistrySuggestions.length > 0 ? (
                    <div className="space-y-2">
                      {visibleInlineRegistrySuggestions.map((skill) => (
                        <div key={skill.installName} className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{skill.installName}</div>
                              {skill.description && <div className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{skill.description}</div>}
                            </div>
                            <button
                              onClick={() => installRegistrySkill(skill.installName)}
                              disabled={!!registryInstalling}
                              className="shrink-0 px-2.5 py-1.5 text-xs font-medium bg-emerald-600 text-white rounded-md hover:bg-emerald-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 disabled:cursor-not-allowed"
                            >
                              {registryInstalling === skill.installName ? 'Installing...' : 'Install'}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-gray-500 dark:text-gray-400">No Shipables suggestions yet for “{searchQuery.trim()}”.</div>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {searchQuery.trim() && (closeMatchSkills.length > 0 || inlineRegistryLoading || visibleInlineRegistrySuggestions.length > 0) && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {closeMatchSkills.length > 0 && (
                  <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border">
                    <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Close installed-skill matches</div>
                    <div className="flex flex-wrap gap-2">
                      {closeMatchSkills.map((skill) => (
                        <button
                          key={skill.name}
                          onClick={() => setSearchQuery(skill.name)}
                          className="inline-flex items-center rounded-full border border-blue-200 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20 px-3 py-1.5 text-xs font-medium text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/40"
                        >
                          {skill.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {(inlineRegistryLoading || visibleInlineRegistrySuggestions.length > 0) && (
                  <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border">
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">Also discover on Shipables</div>
                      <button
                        onClick={() => {
                          setShowImportDialog(true)
                          setImportSource('registry')
                          setRegistryQuery(searchQuery.trim())
                          searchRegistry(searchQuery.trim())
                        }}
                        className="text-xs font-medium text-purple-600 hover:text-purple-700"
                      >
                        Open registry
                      </button>
                    </div>
                    {inlineRegistryLoading ? (
                      <div className="text-sm text-gray-500 dark:text-gray-400">Searching Shipables…</div>
                    ) : (
                      <div className="space-y-2">
                        {visibleInlineRegistrySuggestions.map((skill) => (
                          <div key={skill.installName} className="flex items-start justify-between gap-3 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2">
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{skill.installName}</div>
                              {skill.description && <div className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{skill.description}</div>}
                            </div>
                            <button
                              onClick={() => installRegistrySkill(skill.installName)}
                              disabled={!!registryInstalling}
                              className="shrink-0 px-2.5 py-1.5 text-xs font-medium bg-emerald-600 text-white rounded-md hover:bg-emerald-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 disabled:cursor-not-allowed"
                            >
                              {registryInstalling === skill.installName ? 'Installing...' : 'Install'}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            {sortedUserSkills.length > 0 && (
              <div className="mb-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">User Skills</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Imported, managed, or workspace-copy skills created in this workspace.
                    </p>
                  </div>
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    {sortedUserSkills.length} skill{sortedUserSkills.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {sortedUserSkills.map(skill => {
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
                        selectionMode={selectionMode}
                        isSelected={selectedSkillIds.has(skill.name)}
                        onToggleSelect={() => setSelectedSkillIds((current) => toggleItemSelection(current, skill.name))}
                      />
                    )
                  })}
                </div>
              </div>
            )}
            {sortedUserSkills.length > 0 && sortedBuiltInSkills.length > 0 && (
              <div className="pt-2">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Built-in Skills</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Core skills shipped with ClawMax and OpenClaw.
                    </p>
                  </div>
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    {sortedBuiltInSkills.length} skill{sortedBuiltInSkills.length !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {sortedBuiltInSkills.map(skill => {
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
                    selectionMode={selectionMode}
                    isSelected={selectedSkillIds.has(skill.name)}
                    onToggleSelect={() => setSelectedSkillIds((current) => toggleItemSelection(current, skill.name))}
                  />
                )
              })}
            </div>
          </div>
        )}
        </>
        )}

        {viewingSkill && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-5xl h-[90vh] overflow-hidden flex flex-col">
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
                  View the raw `skill.md` or inspect the rendered markdown. Editing a built-in skill creates a workspace copy before saving.
                </div>
                <div className="flex items-center gap-2">
                  {!editingSkill && (
                    <button
                      onClick={() => {
                        showWarning(viewingSkill.source === 'bundled'
                          ? 'Editing this built-in skill will create a workspace copy and mark that copy DIRTY.'
                          : 'Editing this skill will mark it DIRTY so the divergence stays visible.')
                        setEditingDraft(skillContent)
                        setEditingSkill(true)
                      }}
                      className="px-3 py-1.5 rounded-md bg-amber-600 text-white hover:bg-amber-700 text-sm font-medium"
                    >
                      {viewingSkill.source === 'bundled' ? 'Edit as Workspace Copy' : 'Edit Skill'}
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

              <div className="flex-1 min-h-0 overflow-auto">
                {viewingSkill.secretRequirements && viewingSkill.secretRequirements.length > 0 && (
                  <div className="px-6 py-4 border-b border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold text-amber-900 dark:text-amber-200">Browser-Local Secrets</div>
                        <div className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                          Stored in this browser only. The central `Keys & Secrets` vault is the source of truth, and these skill values can be promoted there for reuse.
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            writeSharedSecrets(skillSecrets, { scope: 'workspace' })
                            showSuccess('Saved skill secrets to workspace keys')
                          }}
                          className="rounded-md border border-amber-300 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-200 dark:hover:bg-amber-900/40"
                        >
                          Save to Workspace Keys
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            writeSharedSecrets(skillSecrets, { scope: 'global' })
                            showSuccess('Saved skill secrets to global keys')
                          }}
                          className="rounded-md border border-amber-300 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-200 dark:hover:bg-amber-900/40"
                        >
                          Save to Global Keys
                        </button>
                      </div>
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

                {viewingSkill && availableAgents.length > 0 && (
                  <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">Assign Agents To This Skill</div>
                        <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          Manage who has <span className="font-medium text-gray-700 dark:text-gray-200">{viewingSkill.name}</span> directly from the skill view.
                        </div>
                      </div>
                      <div className="rounded-full border border-gray-200 dark:border-gray-700 px-3 py-1 text-xs font-medium text-gray-600 dark:text-gray-300">
                        {viewingSkillAssignmentBuckets.assignedAgentIds.length} assigned · {viewingSkillAssignmentBuckets.unassignedAgentIds.length} available
                      </div>
                    </div>
                    <div className="mt-4 grid gap-4 lg:grid-cols-2">
                      <div className="rounded-xl border border-emerald-200 bg-white p-4 dark:border-emerald-800 dark:bg-gray-800/80">
                        <div className="mb-3 text-sm font-semibold text-emerald-800 dark:text-emerald-300">Assigned Agents</div>
                        {viewingSkillAssignmentBuckets.assignedAgentIds.length === 0 ? (
                          <div className="text-sm text-gray-500 dark:text-gray-400">No agents have this skill yet.</div>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {viewingSkillAssignmentBuckets.assignedAgentIds.map((targetAgentId) => (
                              <button
                                key={`remove-${targetAgentId}`}
                                type="button"
                                disabled={savingSkillAssignmentAgentId === targetAgentId}
                                onClick={async () => {
                                  setSavingSkillAssignmentAgentId(targetAgentId)
                                  setError(null)
                                  try {
                                    const currentSkills = agentSkillMap.get(targetAgentId) || []
                                    const nextSkills = currentSkills.filter((skill) => skill !== viewingSkill.name)
                                    await persistAgentSkills(targetAgentId, nextSkills)
                                    showSuccess(`Removed ${viewingSkill.name} from ${targetAgentId}`)
                                  } catch (err: any) {
                                    setError(err.message || 'Failed to remove skill from agent')
                                  } finally {
                                    setSavingSkillAssignmentAgentId(null)
                                  }
                                }}
                                className="inline-flex items-center gap-2 rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-sm text-emerald-900 transition-colors hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200 dark:hover:bg-emerald-900/40"
                                title={`Remove ${viewingSkill.name} from ${targetAgentId}`}
                              >
                                <span>{targetAgentId}</span>
                                <span className="text-xs">Remove</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="rounded-xl border border-blue-200 bg-white p-4 dark:border-blue-800 dark:bg-gray-800/80">
                        <div className="mb-3 text-sm font-semibold text-blue-800 dark:text-blue-300">Add Agents</div>
                        <input
                          type="text"
                          value={viewerAgentSearchQuery}
                          onChange={(e) => setViewerAgentSearchQuery(e.target.value)}
                          placeholder="Search agents to add..."
                          className="mb-3 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                        {filteredViewerAvailableAgents.length === 0 ? (
                          <div className="text-sm text-gray-500 dark:text-gray-400">
                            {viewingSkillAssignmentBuckets.unassignedAgentIds.length === 0
                              ? 'Every agent in this workspace already has this skill.'
                              : 'No matching agents found.'}
                          </div>
                        ) : (
                          <div className="max-h-44 space-y-2 overflow-auto pr-1">
                            {filteredViewerAvailableAgents.map((targetAgentId) => (
                              <button
                                key={`add-${targetAgentId}`}
                                type="button"
                                disabled={savingSkillAssignmentAgentId === targetAgentId}
                                onClick={async () => {
                                  setSavingSkillAssignmentAgentId(targetAgentId)
                                  setError(null)
                                  try {
                                    const currentSkills = agentSkillMap.get(targetAgentId) || []
                                    const nextSkills = Array.from(new Set([...currentSkills, viewingSkill.name])).sort((a, b) => a.localeCompare(b))
                                    await persistAgentSkills(targetAgentId, nextSkills)
                                    showSuccess(`Added ${viewingSkill.name} to ${targetAgentId}`)
                                  } catch (err: any) {
                                    setError(err.message || 'Failed to add skill to agent')
                                  } finally {
                                    setSavingSkillAssignmentAgentId(null)
                                  }
                                }}
                                className="flex w-full items-center justify-between rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-left text-sm text-blue-900 transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-blue-700 dark:bg-blue-900/30 dark:text-blue-200 dark:hover:bg-blue-900/40"
                              >
                                <span className="truncate">{targetAgentId}</span>
                                <span className="shrink-0 text-xs font-medium">Add</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-2 min-h-full lg:min-h-[28rem]">
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
                        className="flex-1 min-h-[24rem] w-full p-6 font-mono text-sm bg-white text-gray-900 dark:bg-gray-900 dark:text-gray-100 outline-none resize-none overflow-auto"
                        spellCheck={false}
                      />
                    ) : (
                      <div className="flex-1 min-h-[24rem] overflow-auto">
                        <pre className="p-6 text-sm whitespace-pre-wrap break-words text-gray-800 dark:text-gray-200">{skillContent}</pre>
                      </div>
                    )}
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-900/40 min-h-0 flex flex-col">
                    <div className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                      Rendered View
                    </div>
                    <div className="flex-1 min-h-[24rem] overflow-auto">
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
          </div>
        )}

        {showBulkAssignModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
            <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl dark:bg-gray-800">
              <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Add Selected Skills to Agents</h2>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    Add {selectedSkillIds.size} selected skill{selectedSkillIds.size !== 1 ? 's' : ''} to one or more agents from this workspace.
                  </p>
                </div>
                <button
                  onClick={() => setShowBulkAssignModal(false)}
                  className="text-2xl leading-none text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  ×
                </button>
              </div>

              <div className="space-y-4 px-6 py-4">
                <div className="rounded-lg border border-purple-200 bg-purple-50 px-4 py-3 text-sm text-purple-900 dark:border-purple-800 dark:bg-purple-900/20 dark:text-purple-200">
                  Skills: <span className="font-medium">{Array.from(selectedSkillIds).sort((a, b) => a.localeCompare(b)).join(', ')}</span>
                </div>
                <input
                  type="text"
                  value={bulkAgentSearchQuery}
                  onChange={(e) => setBulkAgentSearchQuery(e.target.value)}
                  placeholder="Search agents in this workspace..."
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                />
                <div className="max-h-72 space-y-2 overflow-auto rounded-lg border border-gray-200 p-3 dark:border-gray-700">
                  {filteredBulkAgents.map((candidateAgentId) => {
                    const isSelected = selectedBulkAgentIds.has(candidateAgentId)
                    return (
                      <label
                        key={candidateAgentId}
                        className={`flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2 text-sm transition-colors ${
                          isSelected
                            ? 'border-blue-500 bg-blue-50 dark:border-blue-700 dark:bg-blue-900/30'
                            : 'border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900/40'
                        }`}
                      >
                        <span className="truncate text-gray-900 dark:text-gray-100">{candidateAgentId}</span>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => setSelectedBulkAgentIds((current) => toggleItemSelection(current, candidateAgentId))}
                          className="h-4 w-4"
                        />
                      </label>
                    )
                  })}
                </div>
                <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-300">
                  <span>{selectedBulkAgentIds.size} agent{selectedBulkAgentIds.size !== 1 ? 's' : ''} selected</span>
                  <button
                    onClick={() => setSelectedBulkAgentIds(new Set(filteredBulkAgents))}
                    className="font-medium text-blue-600 hover:text-blue-700"
                  >
                    Select Visible Agents
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-6 py-4 dark:border-gray-700">
                <button
                  onClick={() => setShowBulkAssignModal(false)}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    setBulkAssigningSkills(true)
                    setError(null)
                    try {
                      const response = await fetch(`${API_BASE}/api/skills/bulk-assign`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          agentIds: Array.from(selectedBulkAgentIds),
                          addSkills: Array.from(selectedSkillIds),
                        }),
                      })
                      const data = await response.json().catch(() => ({}))
                      if (!response.ok) {
                        throw new Error(data.error || 'Failed to bulk assign skills')
                      }
                      showSuccess(`Added ${selectedSkillIds.size} skill${selectedSkillIds.size !== 1 ? 's' : ''} to ${selectedBulkAgentIds.size} agent${selectedBulkAgentIds.size !== 1 ? 's' : ''}`)
                      await loadAgents()
                      if (agentId) {
                        await loadSkills()
                      }
                      setShowBulkAssignModal(false)
                      setSelectedSkillIds(new Set())
                      setSelectionMode(false)
                    } catch (err: any) {
                      setError(err.message || 'Failed to bulk assign skills')
                    } finally {
                      setBulkAssigningSkills(false)
                    }
                  }}
                  disabled={selectedBulkAgentIds.size === 0 || selectedSkillIds.size === 0 || bulkAssigningSkills}
                  className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:cursor-not-allowed disabled:bg-gray-300 dark:disabled:bg-gray-600"
                >
                  {bulkAssigningSkills ? 'Assigning…' : 'Add Skills'}
                </button>
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
                    onClick={() => setImportSource('ai')}
                    className={`px-3 py-2 rounded-full text-sm font-medium transition-colors ${
                      importSource === 'ai'
                        ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300'
                        : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                  >
                    ✨ AI Create
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
                                    onClick={() => installRegistrySkill(installName)}
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
                              {partner.skills.mode === 'curated-installer' && (
                                <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                                  Usually takes 1-3 minutes.
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

                {importSource === 'ai' && (
                  <div className="space-y-4">
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                      Describe the skill you want, generate a draft scaffold, then save it as a custom skill you can edit further.
                    </p>

                    {!aiEnabled && (
                      <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20 px-4 py-3 text-sm text-red-800 dark:text-red-200">
                        <div className="font-medium">AI skill generation is disabled because no AI execution path is configured</div>
                        <div className="mt-1 text-xs opacity-90">
                          This will fail until you add a model key and choose a preferred model in this browser or through a usable shared execution path.
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => window.dispatchEvent(new CustomEvent('open-workspaces-integrations', { detail: { step: 'models', focus: 'preferred-model' } }))}
                            className="px-3 py-1.5 text-xs font-medium rounded-md border border-red-300 bg-white text-red-700 hover:bg-red-100 dark:border-red-700 dark:bg-transparent dark:text-red-200 dark:hover:bg-red-900/30"
                          >
                            Open BYOK
                          </button>
                          <button
                            type="button"
                            onClick={() => window.dispatchEvent(new CustomEvent('navigate-to-page', { detail: { page: 'keys' } }))}
                            className="px-3 py-1.5 text-xs font-medium rounded-md border border-red-300 bg-white text-red-700 hover:bg-red-100 dark:border-red-700 dark:bg-transparent dark:text-red-200 dark:hover:bg-red-900/30"
                          >
                            Keys & Secrets
                          </button>
                        </div>
                      </div>
                    )}

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2 dark:text-gray-300">
                        Skill prompt
                      </label>
                      <textarea
                        value={aiSkillPrompt}
                        onChange={(e) => setAiSkillPrompt(e.target.value)}
                        placeholder="e.g., A skill that helps an agent detect and summarize PII exposure risks in documents, with short actionable outputs and a cautious tone."
                        rows={5}
                        className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-purple-500 text-sm"
                      />
                    </div>

                    <div className="flex justify-end">
                      <button
                        onClick={() => handleGenerateSkill(false)}
                        disabled={!aiEnabled || aiSkillGenerating || !aiSkillPrompt.trim()}
                        className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 disabled:cursor-not-allowed text-sm font-medium"
                      >
                        {aiSkillGenerating ? 'Generating...' : !aiEnabled ? 'Generate Skill Draft (set up keys first)' : '✨ Generate Skill Draft'}
                      </button>
                    </div>

                    {generatedSkillDraft && (
                      <div className="rounded-lg border border-purple-200 dark:border-purple-800 bg-purple-50/60 dark:bg-purple-900/10 overflow-hidden">
                        <div className="px-4 py-3 border-b border-purple-200 dark:border-purple-800">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-lg">{generatedSkillDraft.emoji || '🛠️'}</span>
                            <div className="text-sm font-semibold text-purple-900 dark:text-purple-100">{generatedSkillDraft.name}</div>
                            {generatedSkillDraft.tags.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {generatedSkillDraft.tags.map((tag) => (
                                  <span key={tag} className="rounded-full border border-purple-200 dark:border-purple-700 px-2 py-0.5 text-[10px] text-purple-700 dark:text-purple-300">
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="mt-1 text-xs text-purple-700 dark:text-purple-300">{generatedSkillDraft.description}</div>
                        </div>
                        <div className="p-4">
                          <div className="text-xs font-semibold uppercase tracking-wide text-purple-700 dark:text-purple-300 mb-2">Generated skill body</div>
                          <textarea
                            value={generatedSkillDraft.content}
                            onChange={(e) => setGeneratedSkillDraft({ ...generatedSkillDraft, content: e.target.value })}
                            rows={12}
                            className="w-full px-3 py-2 border border-purple-200 dark:border-purple-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 font-mono text-sm focus:ring-2 focus:ring-purple-500"
                          />
                        </div>
                        {missingGeneratedSkillSections.length > 0 && (
                          <div className="px-4 pb-4">
                            <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-3 py-3">
                              <div className="text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-200 mb-2">Suggested missing SKILL.md sections</div>
                              <div className="flex flex-wrap gap-2">
                                {missingGeneratedSkillSections.map((section) => (
                                  <span key={section} className="rounded-full border border-amber-300 dark:border-amber-700 px-2.5 py-1 text-[11px] text-amber-800 dark:text-amber-200">
                                    {section.replace(/^##\s*/, '')}
                                  </span>
                                ))}
                              </div>
                              <div className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                                Refine the draft to add these sections if they would make the skill clearer and easier to reuse.
                              </div>
                            </div>
                          </div>
                        )}
                        <div className="px-4 pb-4">
                          <label className="block text-xs font-semibold uppercase tracking-wide text-purple-700 dark:text-purple-300 mb-2">Refine this draft</label>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={aiSkillRefinementPrompt}
                              onChange={(e) => setAiSkillRefinementPrompt(e.target.value)}
                              placeholder="e.g., Add missing When to Use and Examples sections, and make the instructions more specific to compliance reviews."
                              className="flex-1 px-3 py-2 border border-purple-200 dark:border-purple-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-purple-500"
                            />
                            <button
                              onClick={() => handleGenerateSkill(true)}
                              disabled={aiSkillGenerating || !aiSkillRefinementPrompt.trim()}
                              className="px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 disabled:cursor-not-allowed text-sm font-medium"
                            >
                              {aiSkillGenerating ? 'Refining...' : 'Refine'}
                            </button>
                          </div>
                        </div>
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
              {importSource !== 'registry' && importSource !== 'partner' && importSource !== 'ai' && (
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
              {importSource === 'ai' && (
                <div className="flex gap-3 p-6 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40">
                  <button
                    onClick={handleCreateGeneratedSkill}
                    disabled={aiSkillCreating || !generatedSkillDraft}
                    className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors ${
                      aiSkillCreating || !generatedSkillDraft
                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed dark:bg-gray-700 dark:text-gray-400'
                        : 'bg-emerald-600 text-white hover:bg-emerald-700'
                    }`}
                  >
                    {aiSkillCreating ? 'Creating...' : 'Create Skill'}
                  </button>
                  <button
                    onClick={() => {
                      setShowImportDialog(false)
                      setAiSkillPrompt('')
                      setAiSkillRefinementPrompt('')
                      setGeneratedSkillDraft(null)
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
