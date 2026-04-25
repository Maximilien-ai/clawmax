import React, { useEffect, useState } from 'react'
import { useToast } from '../components/Toast'
import ApplyOrgTemplateModal from '../components/ApplyOrgTemplateModal'
import ApplyAgentTemplateModal from '../components/ApplyAgentTemplateModal'
import { ConfirmDeleteDialog } from '../components/ConfirmDeleteDialog'
import TemplateWizard from '../components/TemplateWizard'
import AgentTemplateWizard from '../components/AgentTemplateWizard'
import { getDiscoverySuggestions } from '../lib/discoverySuggestions'
import { useAuth } from '../contexts/AuthContext'
import { hasAiGenerationAccess } from '../lib/byok'

interface AgentTemplate {
  name: string
  type: 'agent'
  source?: 'system' | 'workspace' | 'enterprise'
  slug?: string
  version: string
  emoji?: string
  description?: string
  author?: string
  tags?: string[]
  agents: Array<{
    id: string
    name?: string
    role: string
    tags?: string[]
  }>
  metadata?: {
    aiPrompt?: string
    model?: string
    createdAt?: string
    updatedAt?: string
    basedOnSlug?: string
    basedOnSource?: 'system' | 'workspace' | 'enterprise'
  }
}

interface OrganizationTemplate {
  name: string
  type: 'organization'
  kind?: 'team' | 'company'
  source?: 'system' | 'workspace' | 'enterprise'
  slug?: string
  version: string
  emoji?: string
  description?: string
  author?: string
  tags?: string[]
  agents: Array<{ id: string; role: string; tags?: string[] }>
  teams?: Array<{
    id: string
    name: string
    purpose?: string
    leaderAgentId?: string
    memberAgentIds?: string[]
    parentTeamId?: string
    tags?: string[]
  }>
  communities?: Array<{ name: string }>
  groups?: Array<{ name: string }>
  workflows?: Array<{
    id: string
    name: string
    description?: string
    schedule?: string
    owner?: string
    scaling?: 'singleton' | 'parallel'
    parallelism?: number
    targeting?: {
      communities?: string[]
      groups?: string[]
      tags?: string[]
      agents?: string[]
    }
    inputRefs?: Array<{
      workflowId: string
      outputKey: string
      label?: string
      required?: boolean
    }>
    outputDefinitions?: Array<{
      key: string
      label?: string
      type?: string
    }>
  }>
  metadata?: {
    createdAt?: string
    updatedAt?: string
    basedOnSlug?: string
    basedOnSource?: 'system' | 'workspace' | 'enterprise'
  }
}

interface WorkflowTemplate {
  id: string
  name: string
  type: 'workflow'
  source?: 'workspace'
  slug?: string
  emoji?: string
  description: string
  schedule: string
  enabled: boolean
  targeting: {
    communities: string[]
    groups: string[]
    tags: string[]
    agents: string[]
  }
  created: string
  modified: string
  author: string
  owner?: string
  executionMode: 'automated' | 'managed'
  content: string
}

interface TemplateFeedbackEntry {
  id: string
  rating: number
  easyToUse?: string
  solvedUseCase?: string
  customized?: string
  otherUseCases?: string
  suggestions?: string
  createdAt: string
}

interface TemplateFeedbackSummary {
  count: number
  avgRating: number
  entries: TemplateFeedbackEntry[]
}

type FeedbackSummaryMap = Record<string, { count: number; avgRating: number }>

type Template = AgentTemplate | OrganizationTemplate | WorkflowTemplate
type TemplateViewMode = 'grid' | 'list'
type TemplateSortColumn = 'name' | 'type' | 'agents' | 'groups' | 'workflows' | 'version' | 'author'

function ImportTemplateModal({
  onClose,
  onImport,
}: {
  onClose: () => void
  onImport: (content: string) => Promise<void>
}) {
  const [content, setContent] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleFile = async (file: File) => {
    const text = await file.text()
    setContent(text)
  }

  const handleSubmit = async () => {
    if (!content.trim()) {
      setError('TEMPLATE.md content is required')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await onImport(content)
      onClose()
    } catch (err: any) {
      setError(err.message || 'Failed to import template')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-2xl p-5 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Import Template from TEMPLATE.md</h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Paste markdown or upload a `TEMPLATE.md` file.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">✕</button>
        </div>

        {error && (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200">
            {error}
          </div>
        )}

        <div className="space-y-3">
          <label className="block">
            <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Upload file</span>
            <input
              type="file"
              accept=".md,text/markdown,text/plain"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void handleFile(file)
              }}
              className="block w-full text-sm text-gray-600 dark:text-gray-300"
            />
          </label>

          <label className="block">
            <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Markdown content</span>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={16}
              placeholder="---&#10;name: My Template&#10;type: organization&#10;version: 1.0.0&#10;---"
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm font-mono"
            />
          </label>
        </div>

        <div className="mt-4 flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300">Cancel</button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="px-4 py-2 text-sm rounded-md bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-60"
          >
            {submitting ? 'Importing…' : 'Import Template'}
          </button>
        </div>
      </div>
    </div>
  )
}

function getTemplateTeamDepth(team: NonNullable<OrganizationTemplate['teams']>[number], byId: Map<string, NonNullable<OrganizationTemplate['teams']>[number]>): number {
  let depth = 0
  let currentParentId = team.parentTeamId
  while (currentParentId) {
    const parent = byId.get(currentParentId)
    if (!parent) break
    depth += 1
    currentParentId = parent.parentTeamId
  }
  return depth
}

function getWorkflowTemplateTeamName(
  workflow: NonNullable<OrganizationTemplate['workflows']>[number],
  teams: NonNullable<OrganizationTemplate['teams']>
): string | null {
  const targetGroups = workflow.targeting?.groups || []
  if (targetGroups.length === 0) return null
  const normalizedGroups = new Set(targetGroups.map((group) => group.toLowerCase()))
  const matched = teams.find((team) => normalizedGroups.has(team.name.toLowerCase()) || normalizedGroups.has(team.id.toLowerCase()))
  return matched?.name || targetGroups[0] || null
}

interface TemplateRow {
  key: string
  name: string
  type: Template['type']
  source: 'system' | 'workspace' | 'enterprise'
  templateLabel: 'agent' | 'team' | 'company' | 'workflow'
  agentCount: number
  groupCount: number
  workflowCount: number
  version: string
  author: string
  tags: string[]
  template: Template
}

function getOrganizationTemplateKind(template: OrganizationTemplate): 'team' | 'company' {
  if (template.kind === 'team' || template.kind === 'company') {
    return template.kind
  }

  return (template.teams?.length || 0) > 0 ? 'company' : 'team'
}

function getTemplateLabel(template: Template): TemplateRow['templateLabel'] {
  if (template.type === 'agent') return 'agent'
  if (template.type === 'workflow') return 'workflow'
  return getOrganizationTemplateKind(template)
}

function getTemplateRow(template: Template): TemplateRow {
  const isOrg = template.type === 'organization'
  const isWorkflow = template.type === 'workflow'

  return {
    key: template.type === 'workflow' ? `workflow:${template.id}` : `${template.type}:${template.name}`,
    name: template.name,
    type: template.type,
    source: template.type === 'workflow' ? 'workspace' : (template.source || 'workspace'),
    templateLabel: getTemplateLabel(template),
    agentCount: isWorkflow ? template.targeting.agents.length : template.agents.length,
    groupCount: isOrg ? (template.groups?.length || 0) : isWorkflow ? template.targeting.groups.length : 0,
    workflowCount: isOrg ? (template.workflows?.length || 0) : isWorkflow ? 1 : 0,
    version: isWorkflow ? 'workflow' : template.version,
    author: template.author || '—',
    tags: isWorkflow ? [] : (template.tags || []),
    template,
  }
}

const TEMPLATE_CATEGORY_OPTIONS = [
  { key: 'all', label: 'All', icon: '' },
  { key: 'business', label: 'Business', icon: '💼' },
  { key: 'technical', label: 'Technical', icon: '⚙️' },
  { key: 'personal', label: 'Personal', icon: '📚' },
  { key: 'events', label: 'Events', icon: '🎤' },
  { key: 'travel', label: 'Travel', icon: '✈️' },
  { key: 'hobbies', label: 'Hobbies', icon: '🎨' },
  { key: 'family', label: 'Family', icon: '🏡' },
  { key: 'science', label: 'Science', icon: '🔬' },
] as const

export default function Templates() {
  const { config } = useAuth()
  const aiEnabled = hasAiGenerationAccess(config)
  const { showSuccess, showError } = useToast()
  const [agentTemplates, setAgentTemplates] = useState<AgentTemplate[]>([])
  const [orgTemplates, setOrgTemplates] = useState<OrganizationTemplate[]>([])
  const [workflowTemplates, setWorkflowTemplates] = useState<WorkflowTemplate[]>([])
  const [feedbackSummaries, setFeedbackSummaries] = useState<FeedbackSummaryMap>({})
  const [loading, setLoading] = useState(true)
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null)
  const [applyingTemplate, setApplyingTemplate] = useState<OrganizationTemplate | null>(null)
  const [applyingAgentTemplate, setApplyingAgentTemplate] = useState<AgentTemplate | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'business' | 'technical' | 'personal' | 'events' | 'science' | 'travel' | 'hobbies' | 'family'>('all')
  const [ratingFilter, setRatingFilter] = useState<'all' | 'unrated' | '4plus' | '3plus'>('all')
  const [viewMode, setViewMode] = useState<TemplateViewMode>(() => {
    const saved = localStorage.getItem('templates-view-mode')
    return saved === 'list' ? 'list' : 'grid'
  })
  useEffect(() => { localStorage.setItem('templates-view-mode', viewMode) }, [viewMode])
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedTemplateKeys, setSelectedTemplateKeys] = useState<Set<string>>(new Set())
  const [sortColumn, setSortColumn] = useState<TemplateSortColumn>('name')
  const [showWizard, setShowWizard] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<OrganizationTemplate | null>(null)
  const [showAgentWizard, setShowAgentWizard] = useState(false)
  const [editingAgentTemplate, setEditingAgentTemplate] = useState<AgentTemplate | null>(null)
  const [showActionsMenu, setShowActionsMenu] = useState(false)
  const [showImportTemplateModal, setShowImportTemplateModal] = useState(false)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [pendingOnboardingSelection, setPendingOnboardingSelection] = useState<null | {
    templateId?: string
    templateName?: string
    templateType?: string
  }>(null)
  const [deleteDialog, setDeleteDialog] = useState<{
    itemName: string
    itemType: string
    warningMessage?: string
    consequences: string[]
    onConfirm: () => Promise<void>
  } | null>(null)
  const [collapsedSections, setCollapsedSections] = useState<{ agents: boolean; teams: boolean; companies: boolean; workflows: boolean }>({
    agents: false,
    teams: false,
    companies: false,
    workflows: false,
  })

  const applyPendingOnboardingSelection = React.useCallback(() => {
    try {
      const raw = sessionStorage.getItem('clawmax-onboarding-template-query')
      if (!raw) return
      sessionStorage.removeItem('clawmax-onboarding-template-query')
      const parsed = JSON.parse(raw)
      if (typeof parsed?.search === 'string') {
        setSearchQuery(parsed.search)
      }
      if (typeof parsed?.category === 'string') {
        setCategoryFilter(parsed.category)
      }
      if (parsed?.templateId || parsed?.templateName) {
        setPendingOnboardingSelection({
          templateId: typeof parsed?.templateId === 'string' ? parsed.templateId : undefined,
          templateName: typeof parsed?.templateName === 'string' ? parsed.templateName : undefined,
          templateType: typeof parsed?.templateType === 'string' ? parsed.templateType : undefined,
        })
      }
    } catch {
      sessionStorage.removeItem('clawmax-onboarding-template-query')
    }
  }, [])

  const matchesOrgCategory = React.useCallback((template: OrganizationTemplate, filter: string) => {
    if (filter === 'all') return true
    if ((template as any).category === filter) return true
    const tags = template.tags || []
    if (tags.includes(filter)) return true
    if (filter === 'events' && (tags.includes('event') || tags.includes('events'))) return true
    return false
  }, [])

  const matchesOrgSearch = React.useCallback((template: OrganizationTemplate, query: string) => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return true
    return (
      template.name.toLowerCase().includes(normalized) ||
      template.description?.toLowerCase().includes(normalized) ||
      template.author?.toLowerCase().includes(normalized) ||
      template.tags?.some(tag => tag.toLowerCase().includes(normalized)) ||
      template.agents.some(a => a.id.toLowerCase().includes(normalized) || a.role.toLowerCase().includes(normalized)) ||
      template.communities?.some(c => c.name.toLowerCase().includes(normalized)) ||
      template.groups?.some(g => g.name.toLowerCase().includes(normalized)) ||
      template.workflows?.some(w =>
        w.name?.toLowerCase().includes(normalized) ||
        w.description?.toLowerCase().includes(normalized) ||
        (w as any).content?.toLowerCase().includes(normalized)
      )
    )
  }, [])

  const fetchTemplates = () => {
    setLoading(true)
    Promise.all([
      fetch('/api/templates').then(r => r.ok ? r.json() : Promise.reject(new Error('Failed to load templates'))),
      fetch('/api/templates/feedback/summary').then(r => r.ok ? r.json() : { summaries: {} }),
    ])
      .then(([data, feedbackData]) => {
        setAgentTemplates(Array.isArray(data.agents) ? data.agents : [])
        setOrgTemplates(Array.isArray(data.organizations) ? data.organizations : [])
        setWorkflowTemplates(Array.isArray(data.workflows) ? data.workflows : [])
        setFeedbackSummaries(feedbackData?.summaries && typeof feedbackData.summaries === 'object' ? feedbackData.summaries : {})
        setLoading(false)
      })
      .catch(() => {
        console.warn('Failed to load templates')
        setAgentTemplates([])
        setOrgTemplates([])
        setWorkflowTemplates([])
        setFeedbackSummaries({})
        setLoading(false)
      })
  }

  const matchesRatingFilter = React.useCallback((template: Template) => {
    if (template.type === 'workflow') return ratingFilter === 'all'
    const key = `${template.type}:${template.slug || ''}`
    const summary = feedbackSummaries[key]
    if (ratingFilter === 'all') return true
    if (ratingFilter === 'unrated') return !summary || summary.count === 0
    if (!summary || summary.count === 0) return false
    if (ratingFilter === '4plus') return summary.avgRating >= 4
    if (ratingFilter === '3plus') return summary.avgRating >= 3
    return true
  }, [feedbackSummaries, ratingFilter])

  useEffect(() => {
    fetchTemplates()

    // Listen for template save events to auto-refresh
    const handleTemplateCreated = () => {
      fetchTemplates()
    }

    window.addEventListener('template-created', handleTemplateCreated)
    return () => window.removeEventListener('template-created', handleTemplateCreated)
  }, [])

  useEffect(() => {
    applyPendingOnboardingSelection()
    const handleOpenFromOnboarding = () => applyPendingOnboardingSelection()
    window.addEventListener('clawmax-open-template-from-onboarding', handleOpenFromOnboarding)
    return () => window.removeEventListener('clawmax-open-template-from-onboarding', handleOpenFromOnboarding)
  }, [applyPendingOnboardingSelection])

  useEffect(() => {
    if (!pendingOnboardingSelection) return
    const candidateTemplates: Template[] = [
      ...agentTemplates,
      ...orgTemplates,
      ...workflowTemplates,
    ]
    const match = candidateTemplates.find((template) => {
      if (pendingOnboardingSelection.templateType && template.type !== pendingOnboardingSelection.templateType) {
        return false
      }
      if (template.type === 'workflow') {
        return template.id === pendingOnboardingSelection.templateId || template.name === pendingOnboardingSelection.templateName
      }
      return template.slug === pendingOnboardingSelection.templateId || template.name === pendingOnboardingSelection.templateName
    })
    if (!match) return
    setSelectedTemplate(match)
    setPendingOnboardingSelection(null)
  }, [pendingOnboardingSelection, agentTemplates, orgTemplates, workflowTemplates])

  const handleDelete = async (type: 'agent' | 'organization' | 'workflow', name: string, id?: string) => {
    const targetTemplate = type === 'workflow'
      ? workflowTemplates.find(template => template.id === id)
      : type === 'agent'
        ? agentTemplates.find(template => template.name === name)
        : orgTemplates.find(template => template.name === name)

    if (targetTemplate && targetTemplate.type !== 'workflow' && targetTemplate.source !== 'workspace') {
      showError('Only workspace templates can be deleted from the dashboard')
      return
    }

    if (type === 'workflow') {
      setDeleteDialog({
        itemName: name,
        itemType: 'workflow',
        warningMessage: 'This workflow will be permanently removed from the workspace and can no longer be run from the Templates page.',
        consequences: [
          'The workflow definition will be deleted from this workspace.',
          'Future runs from this template entry will no longer be available.',
          'This action cannot be undone from the dashboard.',
        ],
        onConfirm: async () => {
          try {
            const resp = await fetch(`/api/workflows/${id}`, {
              method: 'DELETE',
            })

            if (!resp.ok) throw new Error('Failed to delete')

            showSuccess(`Deleted workflow "${name}"`)
            fetchTemplates()
            setSelectedTemplate(null)
            setDeleteDialog(null)
          } catch (err) {
            showError('Failed to delete workflow')
          }
        }
      })
    } else {
      const slug = targetTemplate?.slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      const typeParam = type === 'agent' ? 'agents' : 'organizations'
      const templateLabel = type === 'agent'
        ? 'agent template'
        : targetTemplate && targetTemplate.type === 'organization'
          ? `${getOrganizationTemplateKind(targetTemplate)} template`
          : 'organization template'

      setDeleteDialog({
        itemName: name,
        itemType: templateLabel,
        warningMessage: 'This workspace template will be permanently deleted. System templates are protected and cannot be deleted here.',
        consequences: [
          `The ${templateLabel} file will be removed from this workspace.`,
          'Future apply/import reuse of this template from the workspace will no longer be available.',
          'This action cannot be undone from the dashboard.',
        ],
        onConfirm: async () => {
          try {
            const resp = await fetch(`/api/templates/${typeParam}/${slug}`, {
              method: 'DELETE',
            })

            if (!resp.ok) throw new Error('Failed to delete')

            showSuccess(`Deleted template "${name}"`)
            fetchTemplates()
            setSelectedTemplate(null)
            setDeleteDialog(null)
          } catch (err) {
            showError('Failed to delete template')
          }
        }
      })
    }
  }

  const handleEditWorkflow = (id: string) => {
    // Navigate to workflows page with this workflow selected
    // This will be implemented by the parent component
    window.location.hash = `#/workflows/${id}`
    window.location.reload()
  }

  const handleInstantiateWorkflow = async (id: string, name: string) => {
    try {
      const resp = await fetch(`/api/workflows/${id}/run`, {
        method: 'POST',
      })

      if (!resp.ok) throw new Error('Failed to run workflow')

      showSuccess(`Started workflow "${name}"`)
      setSelectedTemplate(null)
    } catch (err) {
      showError('Failed to run workflow')
    }
  }

  const handleImportTemplate = async (content: string) => {
    const resp = await fetch('/api/templates/import-md', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    })
    const data = await resp.json().catch(() => ({}))
    if (!resp.ok) {
      throw new Error(data.error || data.details?.join('\n') || 'Failed to import template')
    }
    showSuccess('Template imported successfully')
    fetchTemplates()
  }

  // Filter templates by search query
  const filteredAgentTemplates = React.useMemo(() => {
    const filteredAgents = agentTemplates.filter(matchesRatingFilter)
    if (!searchQuery.trim()) return filteredAgents
    const query = searchQuery.trim().toLowerCase()
    return filteredAgents.filter(t =>
      t.name.toLowerCase().includes(query) ||
      t.description?.toLowerCase().includes(query) ||
      t.author?.toLowerCase().includes(query) ||
      t.tags?.some(tag => tag.toLowerCase().includes(query)) ||
      t.agents.some(a => a.id.toLowerCase().includes(query) || a.role.toLowerCase().includes(query))
    )
  }, [agentTemplates, searchQuery, matchesRatingFilter])

  const filteredOrgTemplates = React.useMemo(() => {
    let filtered = orgTemplates.filter(matchesRatingFilter)
    // Category filter
    if (categoryFilter !== 'all') {
      filtered = filtered.filter(t => matchesOrgCategory(t, categoryFilter))
    }
    if (!searchQuery.trim()) return filtered
    return filtered.filter(t => matchesOrgSearch(t, searchQuery))
  }, [orgTemplates, searchQuery, categoryFilter, matchesOrgCategory, matchesRatingFilter, matchesOrgSearch])

  const filteredWorkflowTemplates = React.useMemo(() => {
    if (!searchQuery.trim()) return workflowTemplates
    const query = searchQuery.trim().toLowerCase()
    return workflowTemplates.filter(t =>
      t.name.toLowerCase().includes(query) ||
      t.description.toLowerCase().includes(query) ||
      t.author.toLowerCase().includes(query) ||
      t.targeting.communities.some(c => c.toLowerCase().includes(query)) ||
      t.targeting.groups.some(g => g.toLowerCase().includes(query)) ||
      t.targeting.tags.some(tag => tag.toLowerCase().includes(query)) ||
      t.targeting.agents.some(a => a.toLowerCase().includes(query))
    )
  }, [workflowTemplates, searchQuery])

  const filteredTeamTemplates = React.useMemo(
    () => filteredOrgTemplates.filter((template) => getOrganizationTemplateKind(template) === 'team'),
    [filteredOrgTemplates]
  )
  const filteredCompanyTemplates = React.useMemo(
    () => filteredOrgTemplates.filter((template) => getOrganizationTemplateKind(template) === 'company'),
    [filteredOrgTemplates]
  )

  const totalFiltered = filteredAgentTemplates.length + filteredOrgTemplates.length + filteredWorkflowTemplates.length
  const templateRows = React.useMemo(
    () => [...filteredAgentTemplates, ...filteredOrgTemplates, ...filteredWorkflowTemplates].map(getTemplateRow),
    [filteredAgentTemplates, filteredOrgTemplates, filteredWorkflowTemplates]
  )

  const sortedTemplateRows = React.useMemo(() => {
    const rows = [...templateRows]

    rows.sort((a, b) => {
      const direction = sortDirection === 'asc' ? 1 : -1

      switch (sortColumn) {
        case 'name':
          return a.name.localeCompare(b.name) * direction
        case 'type':
          return a.type.localeCompare(b.type) * direction
        case 'agents':
          return (a.agentCount - b.agentCount) * direction
        case 'groups':
          return (a.groupCount - b.groupCount) * direction
        case 'workflows':
          return (a.workflowCount - b.workflowCount) * direction
        case 'version':
          return a.version.localeCompare(b.version) * direction
        case 'author':
          return a.author.localeCompare(b.author) * direction
        default:
          return 0
      }
    })

    return rows
  }, [templateRows, sortColumn, sortDirection])

  const sourceRank = React.useCallback((source: TemplateRow['source']) => {
    if (source === 'workspace') return 0
    if (source === 'system') return 1
    return 2
  }, [])

  const totalTemplates = agentTemplates.length + orgTemplates.length + workflowTemplates.length
  const totalTeamTemplates = React.useMemo(
    () => orgTemplates.filter((template) => getOrganizationTemplateKind(template) === 'team').length,
    [orgTemplates]
  )
  const totalCompanyTemplates = React.useMemo(
    () => orgTemplates.filter((template) => getOrganizationTemplateKind(template) === 'company').length,
    [orgTemplates]
  )
  const workspaceTemplateCount = React.useMemo(
    () => [...agentTemplates, ...orgTemplates].filter((template) => (template.source || 'workspace') === 'workspace').length + workflowTemplates.length,
    [agentTemplates, orgTemplates, workflowTemplates]
  )
  const systemTemplateCount = React.useMemo(
    () => [...agentTemplates, ...orgTemplates].filter((template) => template.source === 'system').length,
    [agentTemplates, orgTemplates]
  )
  const sortedAgentRows = React.useMemo(
    () => [...sortedTemplateRows.filter(row => row.type === 'agent')].sort((a, b) => sourceRank(a.source) - sourceRank(b.source) || a.name.localeCompare(b.name)),
    [sortedTemplateRows, sourceRank]
  )
  const sortedOrgRows = React.useMemo(
    () => [...sortedTemplateRows.filter(row => row.type === 'organization')].sort((a, b) => sourceRank(a.source) - sourceRank(b.source) || a.name.localeCompare(b.name)),
    [sortedTemplateRows, sourceRank]
  )
  const sortedTeamRows = React.useMemo(
    () => sortedOrgRows.filter((row) => row.templateLabel === 'team'),
    [sortedOrgRows]
  )
  const sortedCompanyRows = React.useMemo(
    () => sortedOrgRows.filter((row) => row.templateLabel === 'company'),
    [sortedOrgRows]
  )
  const sortedWorkflowRows = React.useMemo(
    () => [...sortedTemplateRows.filter(row => row.type === 'workflow')].sort((a, b) => sourceRank(a.source) - sourceRank(b.source) || a.name.localeCompare(b.name)),
    [sortedTemplateRows, sourceRank]
  )
  const splitRowsBySource = React.useCallback((rows: TemplateRow[]) => ({
    workspace: rows.filter((row) => row.source === 'workspace'),
    other: rows.filter((row) => row.source !== 'workspace'),
  }), [])
  const agentRowBuckets = React.useMemo(() => splitRowsBySource(sortedAgentRows), [sortedAgentRows, splitRowsBySource])
  const teamRowBuckets = React.useMemo(() => splitRowsBySource(sortedTeamRows), [sortedTeamRows, splitRowsBySource])
  const companyRowBuckets = React.useMemo(() => splitRowsBySource(sortedCompanyRows), [sortedCompanyRows, splitRowsBySource])
  const templateSuggestionRows = React.useMemo(() => {
    if (!searchQuery.trim()) return []
    const visibleOrgTemplates = categoryFilter === 'all'
      ? orgTemplates
      : orgTemplates.filter(t => matchesOrgCategory(t, categoryFilter))
    const candidateRows = [
      ...agentTemplates.map(getTemplateRow),
      ...visibleOrgTemplates.map(getTemplateRow),
      ...workflowTemplates.map(getTemplateRow),
    ]
    const suggestions = getDiscoverySuggestions(
      searchQuery,
      candidateRows.map((row) => ({
        id: row.key,
        name: row.name,
        description: (row.template as any).description || '',
        type: row.type,
        category: (row.template as any).category,
        tags: row.tags,
        keywords:
          row.type === 'workflow'
            ? [
                ...(row.template as WorkflowTemplate).targeting.agents,
                ...(row.template as WorkflowTemplate).targeting.groups,
                ...(row.template as WorkflowTemplate).targeting.tags,
                ...(row.template as WorkflowTemplate).targeting.communities,
              ]
            : (row.template as any).agents?.flatMap((agent: any) => [agent.id, agent.role, ...(agent.tags || [])]) || [],
      })),
      6
    )
    return suggestions
      .map((suggestion) => ({
        row: candidateRows.find((row) => row.key === suggestion.id),
        reasons: suggestion.reasons,
      }))
      .filter((entry): entry is { row: TemplateRow; reasons: string[] } => !!entry.row)
  }, [agentTemplates, orgTemplates, workflowTemplates, searchQuery, categoryFilter, matchesOrgCategory])
  const shouldShowTemplateSuggestions = !!searchQuery.trim() && templateSuggestionRows.length > 0 && totalFiltered < 4
  const matchingOrgTemplatesIgnoringCategory = React.useMemo(() => {
    if (!searchQuery.trim()) return []
    return orgTemplates.filter((template) => matchesRatingFilter(template) && matchesOrgSearch(template, searchQuery))
  }, [searchQuery, orgTemplates, matchesRatingFilter, matchesOrgSearch])
  const suggestedCategoriesForSearch = React.useMemo(() => {
    if (!searchQuery.trim()) return []
    const matchingCategories = new Set<string>()
    matchingOrgTemplatesIgnoringCategory
      .forEach((template) => {
        const match = TEMPLATE_CATEGORY_OPTIONS.find((option) => option.key !== 'all' && matchesOrgCategory(template, option.key))
        if (match) matchingCategories.add(match.key)
      })
    return TEMPLATE_CATEGORY_OPTIONS.filter(
      (option) =>
        option.key !== 'all' &&
        option.key !== categoryFilter &&
        matchingCategories.has(option.key)
    )
  }, [searchQuery, matchingOrgTemplatesIgnoringCategory, matchesOrgCategory, categoryFilter])
  const hasHiddenCategoryMatches = totalFiltered === 0 && categoryFilter !== 'all' && matchingOrgTemplatesIgnoringCategory.length > 0
  const suggestedCategoryLabels = suggestedCategoriesForSearch.map((category) => category.label)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-400">Loading templates...</div>
      </div>
    )
  }

  const toggleSectionCollapsed = (section: 'agents' | 'teams' | 'companies' | 'workflows') => {
    setCollapsedSections(prev => ({ ...prev, [section]: !prev[section] }))
  }
  const selectedRows = sortedTemplateRows.filter(row => selectedTemplateKeys.has(row.key))
  const canApplySelected = selectedRows.length === 1 && selectedRows[0].template.type !== 'workflow'

  const openApplyForTemplate = (template: Template) => {
    if (template.type === 'organization') {
      setApplyingTemplate(template)
      return
    }
    if (template.type === 'agent') {
      setApplyingAgentTemplate(template)
    }
  }

  const openEditForTemplate = (template: Template) => {
    if (template.type === 'agent') {
      setEditingAgentTemplate(template)
      setShowAgentWizard(true)
      return
    }
    if (template.type !== 'organization') {
      showError('Template editing is available for agent and organization templates.')
      return
    }
    setEditingTemplate(template)
    setShowWizard(true)
  }

  const toggleTemplateSelection = (key: string) => {
    setSelectedTemplateKeys(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const handleSort = (column: TemplateSortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortColumn(column)
      setSortDirection('asc')
    }
  }

  const handleBulkDelete = async () => {
    if (selectedTemplateKeys.size === 0) return

    const rowsToDelete = selectedRows.filter(row => row.source === 'workspace')
    if (rowsToDelete.length === 0) {
      showError('Only workspace templates can be deleted')
      return
    }

    setDeleteDialog({
      itemName: `${rowsToDelete.length} templates`,
      consequences: rowsToDelete.map(row => `${row.name} (${row.templateLabel})`),
      onConfirm: async () => {
        try {
          await Promise.all(rowsToDelete.map(async ({ template }) => {
            if (template.type === 'workflow') {
              const resp = await fetch(`/api/workflows/${template.id}`, { method: 'DELETE' })
              if (!resp.ok) throw new Error(`Failed to delete workflow ${template.name}`)
              return
            }

            const slug = template.slug || template.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
            const typeParam = template.type === 'agent' ? 'agents' : 'organizations'
            const resp = await fetch(`/api/templates/${typeParam}/${slug}`, { method: 'DELETE' })
            if (!resp.ok) throw new Error(`Failed to delete template ${template.name}`)
          }))

          showSuccess(`Deleted ${rowsToDelete.length} template${rowsToDelete.length !== 1 ? 's' : ''}`)
          setSelectedTemplateKeys(new Set())
          setSelectionMode(false)
          fetchTemplates()
          if (selectedTemplate && rowsToDelete.some(row => row.key === getTemplateRow(selectedTemplate).key)) {
            setSelectedTemplate(null)
          }
          setDeleteDialog(null)
        } catch {
          showError('Failed to delete selected templates')
        }
      }
    })
  }

  const handleApplySelected = () => {
    if (!canApplySelected) {
      showError('Apply Selected currently supports one agent or organization template at a time')
      return
    }
    openApplyForTemplate(selectedRows[0].template)
  }

  const toggleSectionSelection = (rows: TemplateRow[]) => {
    const rowKeys = rows.map(row => row.key)
    const allSelected = rowKeys.every(key => selectedTemplateKeys.has(key))
    if (allSelected) {
      setSelectedTemplateKeys(prev => {
        const next = new Set(prev)
        rowKeys.forEach(key => next.delete(key))
        return next
      })
      return
    }

    setSelectedTemplateKeys(prev => {
      const next = new Set(prev)
      rowKeys.forEach(key => next.add(key))
      return next
    })
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 sm:py-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Templates</h1>
          <p className="text-sm text-gray-500 mt-0.5">
              {searchQuery ? (
                <>
                  {totalFiltered} of {totalTemplates} template{totalTemplates !== 1 ? 's' : ''} •
                  {' '}{filteredAgentTemplates.length} agent{filteredAgentTemplates.length !== 1 ? 's' : ''},
                  {' '}{filteredTeamTemplates.length} team{filteredTeamTemplates.length !== 1 ? 's' : ''},
                  {' '}{filteredCompanyTemplates.length} compan{filteredCompanyTemplates.length !== 1 ? 'y' : 'ies'},
                  {' '}{filteredWorkflowTemplates.length} workflow{filteredWorkflowTemplates.length !== 1 ? 's' : ''}
                </>
              ) : (
                <>
                  {totalTemplates} template{totalTemplates !== 1 ? 's' : ''} •
                  {' '}{agentTemplates.length} agent{agentTemplates.length !== 1 ? 's' : ''},
                  {' '}{totalTeamTemplates} team{totalTeamTemplates !== 1 ? 's' : ''},
                  {' '}{totalCompanyTemplates} compan{totalCompanyTemplates !== 1 ? 'y' : 'ies'},
                  {' '}{workflowTemplates.length} workflow{workflowTemplates.length !== 1 ? 's' : ''}
                </>
              )}
            </p>
          <p className="text-xs text-gray-400 mt-1">
            Your templates: {workspaceTemplateCount} · System templates: {systemTemplateCount}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="flex gap-2">
            <div className="flex items-center border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden dark:border-gray-700 bg-white dark:bg-gray-800">
              <button
                onClick={() => setViewMode('grid')}
                title="Grid view"
                className={`px-2.5 py-1.5 text-xs transition-colors ${viewMode === 'grid' ? 'bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400' : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
              >
                ⊞
              </button>
              <button
                onClick={() => setViewMode('list')}
                title="List view"
                className={`px-2.5 py-1.5 text-xs transition-colors border-l border-gray-200 dark:border-gray-700 ${viewMode === 'list' ? 'bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400' : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
              >
                ☰
              </button>
            </div>
            <button
              onClick={() => {
                setSelectionMode(!selectionMode)
                if (selectionMode) {
                  setSelectedTemplateKeys(new Set())
                }
              }}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors flex items-center gap-1.5 ${
                selectionMode
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
              }`}
            >
              <span className="text-base leading-none">☑</span> {selectionMode ? 'Cancel' : 'Select'}
            </button>
            {selectionMode && (
              <button
                onClick={() => {
                  if (selectedTemplateKeys.size === sortedTemplateRows.length) {
                    setSelectedTemplateKeys(new Set())
                  } else {
                    setSelectedTemplateKeys(new Set(sortedTemplateRows.map(row => row.key)))
                  }
                }}
                className="px-3 py-1.5 text-sm font-medium rounded-md bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
              >
                {selectedTemplateKeys.size === sortedTemplateRows.length ? 'Deselect All' : 'Select All'}
              </button>
            )}
            {selectionMode && selectedTemplateKeys.size > 0 && (
              <button
                onClick={handleApplySelected}
                className="px-3 py-1.5 text-sm font-medium rounded-md bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
              >
                Apply Selected
              </button>
            )}
            {selectionMode && selectedTemplateKeys.size > 0 && (
              <button
                onClick={handleBulkDelete}
                className="px-3 py-1.5 text-sm font-medium rounded-md border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200 dark:hover:bg-red-900/40 transition-colors"
              >
                Delete Selected ({selectedTemplateKeys.size})
              </button>
            )}
            <div className="relative">
              <button
                onClick={() => setShowActionsMenu((v) => !v)}
                className="px-3 py-1.5 text-sm font-medium rounded-md bg-purple-600 text-white hover:bg-purple-700 transition-colors flex items-center gap-1.5"
              >
                <span className="text-base leading-none">⚙️</span> Template Actions <span className="text-xs">▾</span>
              </button>
              {showActionsMenu && (
                <div className="absolute right-0 mt-2 w-56 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-xl z-20 overflow-hidden">
                  <button
                    onClick={() => {
                      if (!aiEnabled) return
                      setShowWizard(true)
                      setShowActionsMenu(false)
                    }}
                    disabled={!aiEnabled}
                    className={`w-full text-left px-4 py-3 text-sm flex items-center gap-2 ${
                      aiEnabled
                        ? 'hover:bg-gray-50 dark:hover:bg-gray-700'
                        : 'text-gray-400 dark:text-gray-500 cursor-not-allowed'
                    }`}
                    title={aiEnabled ? 'Create template with AI' : 'Configure browser keys or a shared execution path first'}
                  >
                    <span className="text-purple-500">✨</span> AI Create Template
                  </button>
                  <button
                    onClick={() => {
                      setShowImportTemplateModal(true)
                      setShowActionsMenu(false)
                    }}
                    className="w-full text-left px-4 py-3 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2 border-t border-gray-100 dark:border-gray-700"
                  >
                    <span className="text-sky-500">📥</span> Import TEMPLATE.md
                  </button>
                  <button
                    onClick={() => {
                      fetchTemplates()
                      setShowActionsMenu(false)
                    }}
                    className="w-full text-left px-4 py-3 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2 border-t border-gray-100 dark:border-gray-700"
                  >
                    <span className="text-emerald-500">↻</span> Refresh Templates
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

      </div>

      {/* Category filter */}
      <div className="flex gap-2 mb-4">
        {TEMPLATE_CATEGORY_OPTIONS.map(cat => (
          <button
            key={cat.key}
            onClick={() => setCategoryFilter(cat.key)}
            className={`px-3 py-1.5 text-sm font-medium rounded-full transition-colors ${
              categoryFilter === cat.key
                ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 border border-purple-300 dark:border-purple-700'
                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
            }`}
          >
            {cat.icon && <span className="mr-1">{cat.icon}</span>}{cat.label}
          </button>
        ))}
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        {([
          { key: 'all', label: 'All Ratings' },
          { key: '4plus', label: '4★+' },
          { key: '3plus', label: '3★+' },
          { key: 'unrated', label: 'Unrated' },
        ] as const).map(option => (
          <button
            key={option.key}
            onClick={() => setRatingFilter(option.key)}
            className={`px-3 py-1.5 text-sm font-medium rounded-full transition-colors ${
              ratingFilter === option.key
                ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700'
                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {/* Search bar */}
      <div className="mb-6">
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search templates by name, description, tags, or agents..."
            className="w-full px-4 py-2 pr-10 border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent text-sm"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:text-gray-400 transition-colors"
              title="Clear search"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div>
        {totalTemplates === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="text-6xl mb-4">📑</div>
            <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2 dark:text-gray-300">No templates yet</h2>
            <p className="text-gray-500 mb-4">
              Save agents as templates to reuse them later
            </p>
            <p className="text-sm text-gray-400">
              Click the 💾 button on any agent card to create a template
            </p>
          </div>
        ) : totalFiltered === 0 && searchQuery ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="text-6xl mb-4">🔍</div>
            <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2 dark:text-gray-300">No templates found</h2>
            {hasHiddenCategoryMatches ? (
              <div className="mb-4 max-w-2xl rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4 text-left">
                <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
                  Your current filters are hiding search matches for "{searchQuery}".
                </p>
                <p className="mt-1 text-sm text-amber-800 dark:text-amber-200">
                  {suggestedCategoriesForSearch.length > 0
                    ? `Try ${suggestedCategoryLabels.join(', ')} instead.`
                    : 'This search has matches outside the current category filter.'}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {suggestedCategoriesForSearch.map((category) => (
                    <button
                      key={`suggest-category-${category.key}`}
                      onClick={() => setCategoryFilter(category.key)}
                      className="rounded-full border border-amber-300 dark:border-amber-700 bg-white dark:bg-gray-900 px-3 py-1.5 text-sm font-medium text-amber-800 dark:text-amber-200 hover:border-amber-400 dark:hover:border-amber-500"
                    >
                      {category.icon && <span className="mr-1">{category.icon}</span>}
                      {category.label}
                    </button>
                  ))}
                  <button
                    onClick={() => setCategoryFilter('all')}
                    className="rounded-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:border-gray-400 dark:hover:border-gray-500"
                  >
                    Show All Categories
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-gray-500 mb-4">
                No templates match your search query "{searchQuery}"
              </p>
            )}
            {templateSuggestionRows.length > 0 && (
              <div className="mb-5 w-full max-w-3xl rounded-xl border border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-900/20 p-4 text-left">
                <div className="text-sm font-semibold text-sky-900 dark:text-sky-100">Suggested starting points</div>
                <div className="mt-1 text-xs text-sky-700 dark:text-sky-300">
                  AI-assisted discovery based on names, descriptions, tags, categories, and roles.
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  {templateSuggestionRows.map(({ row, reasons }) => (
                    <button
                      key={`suggest-empty-${row.key}`}
                      onClick={() => setSelectedTemplate(row.template)}
                      className="rounded-lg border border-sky-200 dark:border-sky-700 bg-white/80 dark:bg-gray-900/40 px-3 py-3 text-left hover:border-sky-400 transition-colors"
                    >
                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{row.name}</div>
                      <div className="mt-1 text-xs text-gray-500 dark:text-gray-400 capitalize">
                        {row.templateLabel} · {(row.template as any).category || row.author || 'template'}
                      </div>
                      {reasons.length > 0 && (
                        <div className="mt-2 text-xs text-sky-700 dark:text-sky-300">
                          You may want this for: {reasons.join(', ')}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <button
              onClick={() => setSearchQuery('')}
              className="px-4 py-2 bg-sky-600 text-white rounded-md hover:bg-sky-700 transition-colors text-sm"
            >
              Clear Search
            </button>
          </div>
        ) : (
          viewMode === 'grid' ? (
          <div className="space-y-8">
            {shouldShowTemplateSuggestions && (
              <section className="rounded-xl border border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-900/20 p-4">
                <div className="text-sm font-semibold text-sky-900 dark:text-sky-100">Suggested starting points</div>
                <div className="mt-1 text-xs text-sky-700 dark:text-sky-300">
                  AI-assisted discovery based on nearby names, descriptions, tags, categories, and roles.
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {templateSuggestionRows.map(({ row, reasons }) => (
                    <button
                      key={`suggest-${row.key}`}
                      onClick={() => setSelectedTemplate(row.template)}
                      className="rounded-lg border border-sky-200 dark:border-sky-700 bg-white/80 dark:bg-gray-900/40 px-3 py-3 text-left hover:border-sky-400 transition-colors"
                    >
                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{row.name}</div>
                      <div className="mt-1 text-xs text-gray-500 dark:text-gray-400 capitalize">{row.templateLabel}</div>
                      {reasons.length > 0 && (
                        <div className="mt-2 text-xs text-sky-700 dark:text-sky-300">
                          Matches: {reasons.join(', ')}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </section>
            )}
            {/* Agent Templates */}
            {filteredAgentTemplates.length > 0 && (
              <section>
                <div className="mb-3 flex items-center gap-2">
                  <button
                    onClick={() => toggleSectionCollapsed('agents')}
                    className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-gray-100 hover:text-sky-700 dark:hover:text-sky-400"
                  >
                    <span className="text-sm text-gray-500 dark:text-gray-400">{collapsedSections.agents ? '▸' : '▾'}</span>
                    <span>🤖 Agent Templates</span>
                    <span className="text-sm font-normal text-gray-400">({filteredAgentTemplates.length})</span>
                  </button>
                  {selectionMode && (
                    <button
                      onClick={() => toggleSectionSelection(filteredAgentTemplates.map(getTemplateRow))}
                      className="ml-auto text-xs px-2.5 py-1 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                    >
                      {filteredAgentTemplates.every(template => selectedTemplateKeys.has(getTemplateRow(template).key)) ? 'Deselect All Agents' : 'Select All Agents'}
                    </button>
                  )}
                </div>
                {!collapsedSections.agents && (
                  <div className="space-y-5">
                    {agentRowBuckets.workspace.length > 0 && (
                      <div>
                        {agentRowBuckets.other.length > 0 && (
                          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Your Templates</div>
                        )}
                        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                          {agentRowBuckets.workspace.map((row) => (
                            <TemplateCard
                              key={row.key}
                              template={row.template as AgentTemplate}
                              onDelete={() => handleDelete('agent', row.template.name)}
                              onApply={() => openApplyForTemplate(row.template)}
                              onClick={() => setSelectedTemplate(row.template)}
                              selected={selectedTemplate?.name === row.template.name}
                              ratingSummary={feedbackSummaries[`agent:${(row.template as AgentTemplate).slug || ''}`]}
                              selectionMode={selectionMode}
                              isSelected={selectedTemplateKeys.has(row.key)}
                              onToggleSelect={() => toggleTemplateSelection(row.key)}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                    {(agentRowBuckets.workspace.length === 0 || agentRowBuckets.other.length > 0) && agentRowBuckets.other.length > 0 && (
                      <div>
                        {agentRowBuckets.workspace.length > 0 && (
                          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">System Templates</div>
                        )}
                        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                          {agentRowBuckets.other.map((row) => (
                            <TemplateCard
                              key={row.key}
                              template={row.template as AgentTemplate}
                              onDelete={() => handleDelete('agent', row.template.name)}
                              onApply={() => openApplyForTemplate(row.template)}
                              onClick={() => setSelectedTemplate(row.template)}
                              selected={selectedTemplate?.name === row.template.name}
                              ratingSummary={feedbackSummaries[`agent:${(row.template as AgentTemplate).slug || ''}`]}
                              selectionMode={selectionMode}
                              isSelected={selectedTemplateKeys.has(row.key)}
                              onToggleSelect={() => toggleTemplateSelection(row.key)}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </section>
            )}

            {/* Team Templates */}
            {filteredTeamTemplates.length > 0 && (
              <section>
                <div className="mb-3 flex items-center gap-2">
                  <button
                    onClick={() => toggleSectionCollapsed('teams')}
                    className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-gray-100 hover:text-sky-700 dark:hover:text-sky-400"
                  >
                    <span className="text-sm text-gray-500 dark:text-gray-400">{collapsedSections.teams ? '▸' : '▾'}</span>
                    <span>👥 Team Templates</span>
                    <span className="text-sm font-normal text-gray-400">({filteredTeamTemplates.length})</span>
                  </button>
                  {selectionMode && (
                    <button
                      onClick={() => toggleSectionSelection(filteredTeamTemplates.map(getTemplateRow))}
                      className="ml-auto text-xs px-2.5 py-1 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                    >
                      {filteredTeamTemplates.every(template => selectedTemplateKeys.has(getTemplateRow(template).key)) ? 'Deselect All Teams' : 'Select All Teams'}
                    </button>
                  )}
                </div>
                {!collapsedSections.teams && (
                  <div className="space-y-5">
                    {teamRowBuckets.workspace.length > 0 && (
                      <div>
                        {teamRowBuckets.other.length > 0 && (
                          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Your Templates</div>
                        )}
                        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                          {teamRowBuckets.workspace.map((row) => (
                            <TemplateCard
                              key={row.key}
                              template={row.template as OrganizationTemplate}
                              onDelete={() => handleDelete('organization', row.template.name)}
                              onApply={() => openApplyForTemplate(row.template)}
                              onClick={() => setSelectedTemplate(row.template)}
                              selected={selectedTemplate?.name === row.template.name}
                              ratingSummary={feedbackSummaries[`organization:${(row.template as OrganizationTemplate).slug || ''}`]}
                              selectionMode={selectionMode}
                              isSelected={selectedTemplateKeys.has(row.key)}
                              onToggleSelect={() => toggleTemplateSelection(row.key)}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                    {(teamRowBuckets.workspace.length === 0 || teamRowBuckets.other.length > 0) && teamRowBuckets.other.length > 0 && (
                      <div>
                        {teamRowBuckets.workspace.length > 0 && (
                          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">System Templates</div>
                        )}
                        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                          {teamRowBuckets.other.map((row) => (
                            <TemplateCard
                              key={row.key}
                              template={row.template as OrganizationTemplate}
                              onDelete={() => handleDelete('organization', row.template.name)}
                              onApply={() => openApplyForTemplate(row.template)}
                              onClick={() => setSelectedTemplate(row.template)}
                              selected={selectedTemplate?.name === row.template.name}
                              ratingSummary={feedbackSummaries[`organization:${(row.template as OrganizationTemplate).slug || ''}`]}
                              selectionMode={selectionMode}
                              isSelected={selectedTemplateKeys.has(row.key)}
                              onToggleSelect={() => toggleTemplateSelection(row.key)}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </section>
            )}

            {/* Company Templates */}
            {filteredCompanyTemplates.length > 0 && (
              <section>
                <div className="mb-3 flex items-center gap-2">
                  <button
                    onClick={() => toggleSectionCollapsed('companies')}
                    className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-gray-100 hover:text-sky-700 dark:hover:text-sky-400"
                  >
                    <span className="text-sm text-gray-500 dark:text-gray-400">{collapsedSections.companies ? '▸' : '▾'}</span>
                    <span>🏢 Company Templates</span>
                    <span className="text-sm font-normal text-gray-400">({filteredCompanyTemplates.length})</span>
                  </button>
                  {selectionMode && (
                    <button
                      onClick={() => toggleSectionSelection(filteredCompanyTemplates.map(getTemplateRow))}
                      className="ml-auto text-xs px-2.5 py-1 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                    >
                      {filteredCompanyTemplates.every(template => selectedTemplateKeys.has(getTemplateRow(template).key)) ? 'Deselect All Companies' : 'Select All Companies'}
                    </button>
                  )}
                </div>
                {!collapsedSections.companies && (
                  <div className="space-y-5">
                    {companyRowBuckets.workspace.length > 0 && (
                      <div>
                        {companyRowBuckets.other.length > 0 && (
                          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Your Templates</div>
                        )}
                        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                          {companyRowBuckets.workspace.map((row) => (
                            <TemplateCard
                              key={row.key}
                              template={row.template as OrganizationTemplate}
                              onDelete={() => handleDelete('organization', row.template.name)}
                              onApply={() => openApplyForTemplate(row.template)}
                              onClick={() => setSelectedTemplate(row.template)}
                              selected={selectedTemplate?.name === row.template.name}
                              ratingSummary={feedbackSummaries[`organization:${(row.template as OrganizationTemplate).slug || ''}`]}
                              selectionMode={selectionMode}
                              isSelected={selectedTemplateKeys.has(row.key)}
                              onToggleSelect={() => toggleTemplateSelection(row.key)}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                    {(companyRowBuckets.workspace.length === 0 || companyRowBuckets.other.length > 0) && companyRowBuckets.other.length > 0 && (
                      <div>
                        {companyRowBuckets.workspace.length > 0 && (
                          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">System Templates</div>
                        )}
                        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                          {companyRowBuckets.other.map((row) => (
                            <TemplateCard
                              key={row.key}
                              template={row.template as OrganizationTemplate}
                              onDelete={() => handleDelete('organization', row.template.name)}
                              onApply={() => openApplyForTemplate(row.template)}
                              onClick={() => setSelectedTemplate(row.template)}
                              selected={selectedTemplate?.name === row.template.name}
                              ratingSummary={feedbackSummaries[`organization:${(row.template as OrganizationTemplate).slug || ''}`]}
                              selectionMode={selectionMode}
                              isSelected={selectedTemplateKeys.has(row.key)}
                              onToggleSelect={() => toggleTemplateSelection(row.key)}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </section>
            )}

            {/* Workflow Templates */}
            {filteredWorkflowTemplates.length > 0 && (
              <section>
                <div className="mb-3 flex items-center gap-2">
                  <button
                    onClick={() => toggleSectionCollapsed('workflows')}
                    className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-gray-100 hover:text-sky-700 dark:hover:text-sky-400"
                  >
                    <span className="text-sm text-gray-500 dark:text-gray-400">{collapsedSections.workflows ? '▸' : '▾'}</span>
                    <span>⚡ Workflow Templates</span>
                    <span className="text-sm font-normal text-gray-400">({filteredWorkflowTemplates.length})</span>
                  </button>
                  {selectionMode && (
                    <button
                      onClick={() => toggleSectionSelection(filteredWorkflowTemplates.map(getTemplateRow))}
                      className="ml-auto text-xs px-2.5 py-1 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                    >
                      {filteredWorkflowTemplates.every(template => selectedTemplateKeys.has(getTemplateRow(template).key)) ? 'Deselect All Workflows' : 'Select All Workflows'}
                    </button>
                  )}
                </div>
                {!collapsedSections.workflows && (
                  <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {filteredWorkflowTemplates.map((template, idx) => (
                      <WorkflowTemplateCard
                        key={idx}
                        template={template}
                        onClick={() => setSelectedTemplate(template)}
                        selected={selectedTemplate?.name === template.name}
                        selectionMode={selectionMode}
                        isSelected={selectedTemplateKeys.has(getTemplateRow(template).key)}
                        onToggleSelect={() => toggleTemplateSelection(getTemplateRow(template).key)}
                      />
                    ))}
                  </div>
                )}
              </section>
            )}
          </div>
          ) : (
          <div className="space-y-8">
            {sortedAgentRows.length > 0 && (
              <section>
                <button
                  onClick={() => toggleSectionCollapsed('agents')}
                  className="mb-3 flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-gray-100 hover:text-sky-700 dark:hover:text-sky-400"
                >
                  <span className="text-sm text-gray-500 dark:text-gray-400">{collapsedSections.agents ? '▸' : '▾'}</span>
                  <span>🤖 Agent Templates</span>
                  <span className="text-sm font-normal text-gray-400">({sortedAgentRows.length})</span>
                </button>
                {!collapsedSections.agents && (
                  <div className="space-y-5">
                    {agentRowBuckets.workspace.length > 0 && (
                      <div>
                        {agentRowBuckets.other.length > 0 && (
                          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Your Templates</div>
                        )}
                        <TemplatesTable
                          rows={agentRowBuckets.workspace}
                          selectionMode={selectionMode}
                          selectedTemplateKeys={selectedTemplateKeys}
                          selectedTemplate={selectedTemplate}
                          onSort={handleSort}
                          sortColumn={sortColumn}
                          sortDirection={sortDirection}
                          onToggleSelect={toggleTemplateSelection}
                          onToggleSelectAll={setSelectedTemplateKeys}
                          onOpenTemplate={setSelectedTemplate}
                          onDeleteTemplate={(template) => handleDelete(template.type, template.name, template.type === 'workflow' ? template.id : undefined)}
                          onApplyTemplate={openApplyForTemplate}
                        />
                      </div>
                    )}
                    {(agentRowBuckets.workspace.length === 0 || agentRowBuckets.other.length > 0) && agentRowBuckets.other.length > 0 && (
                      <div>
                        {agentRowBuckets.workspace.length > 0 && (
                          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">System Templates</div>
                        )}
                        <TemplatesTable
                          rows={agentRowBuckets.other}
                          selectionMode={selectionMode}
                          selectedTemplateKeys={selectedTemplateKeys}
                          selectedTemplate={selectedTemplate}
                          onSort={handleSort}
                          sortColumn={sortColumn}
                          sortDirection={sortDirection}
                          onToggleSelect={toggleTemplateSelection}
                          onToggleSelectAll={setSelectedTemplateKeys}
                          onOpenTemplate={setSelectedTemplate}
                          onDeleteTemplate={(template) => handleDelete(template.type, template.name, template.type === 'workflow' ? template.id : undefined)}
                          onApplyTemplate={openApplyForTemplate}
                        />
                      </div>
                    )}
                  </div>
                )}
              </section>
            )}
            {sortedTeamRows.length > 0 && (
              <section>
                <button
                  onClick={() => toggleSectionCollapsed('teams')}
                  className="mb-3 flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-gray-100 hover:text-sky-700 dark:hover:text-sky-400"
                >
                  <span className="text-sm text-gray-500 dark:text-gray-400">{collapsedSections.teams ? '▸' : '▾'}</span>
                  <span>👥 Team Templates</span>
                  <span className="text-sm font-normal text-gray-400">({sortedTeamRows.length})</span>
                </button>
                {!collapsedSections.teams && (
                  <div className="space-y-5">
                    {teamRowBuckets.workspace.length > 0 && (
                      <div>
                        {teamRowBuckets.other.length > 0 && (
                          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Your Templates</div>
                        )}
                        <TemplatesTable
                          rows={teamRowBuckets.workspace}
                          selectionMode={selectionMode}
                          selectedTemplateKeys={selectedTemplateKeys}
                          selectedTemplate={selectedTemplate}
                          onSort={handleSort}
                          sortColumn={sortColumn}
                          sortDirection={sortDirection}
                          onToggleSelect={toggleTemplateSelection}
                          onToggleSelectAll={setSelectedTemplateKeys}
                          onOpenTemplate={setSelectedTemplate}
                          onDeleteTemplate={(template) => handleDelete(template.type, template.name, template.type === 'workflow' ? template.id : undefined)}
                          onApplyTemplate={openApplyForTemplate}
                        />
                      </div>
                    )}
                    {(teamRowBuckets.workspace.length === 0 || teamRowBuckets.other.length > 0) && teamRowBuckets.other.length > 0 && (
                      <div>
                        {teamRowBuckets.workspace.length > 0 && (
                          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">System Templates</div>
                        )}
                        <TemplatesTable
                          rows={teamRowBuckets.other}
                          selectionMode={selectionMode}
                          selectedTemplateKeys={selectedTemplateKeys}
                          selectedTemplate={selectedTemplate}
                          onSort={handleSort}
                          sortColumn={sortColumn}
                          sortDirection={sortDirection}
                          onToggleSelect={toggleTemplateSelection}
                          onToggleSelectAll={setSelectedTemplateKeys}
                          onOpenTemplate={setSelectedTemplate}
                          onDeleteTemplate={(template) => handleDelete(template.type, template.name, template.type === 'workflow' ? template.id : undefined)}
                          onApplyTemplate={openApplyForTemplate}
                        />
                      </div>
                    )}
                  </div>
                )}
              </section>
            )}
            {sortedCompanyRows.length > 0 && (
              <section>
                <button
                  onClick={() => toggleSectionCollapsed('companies')}
                  className="mb-3 flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-gray-100 hover:text-sky-700 dark:hover:text-sky-400"
                >
                  <span className="text-sm text-gray-500 dark:text-gray-400">{collapsedSections.companies ? '▸' : '▾'}</span>
                  <span>🏢 Company Templates</span>
                  <span className="text-sm font-normal text-gray-400">({sortedCompanyRows.length})</span>
                </button>
                {!collapsedSections.companies && (
                  <div className="space-y-5">
                    {companyRowBuckets.workspace.length > 0 && (
                      <div>
                        {companyRowBuckets.other.length > 0 && (
                          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Your Templates</div>
                        )}
                        <TemplatesTable
                          rows={companyRowBuckets.workspace}
                          selectionMode={selectionMode}
                          selectedTemplateKeys={selectedTemplateKeys}
                          selectedTemplate={selectedTemplate}
                          onSort={handleSort}
                          sortColumn={sortColumn}
                          sortDirection={sortDirection}
                          onToggleSelect={toggleTemplateSelection}
                          onToggleSelectAll={setSelectedTemplateKeys}
                          onOpenTemplate={setSelectedTemplate}
                          onDeleteTemplate={(template) => handleDelete(template.type, template.name, template.type === 'workflow' ? template.id : undefined)}
                          onApplyTemplate={openApplyForTemplate}
                        />
                      </div>
                    )}
                    {(companyRowBuckets.workspace.length === 0 || companyRowBuckets.other.length > 0) && companyRowBuckets.other.length > 0 && (
                      <div>
                        {companyRowBuckets.workspace.length > 0 && (
                          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">System Templates</div>
                        )}
                        <TemplatesTable
                          rows={companyRowBuckets.other}
                          selectionMode={selectionMode}
                          selectedTemplateKeys={selectedTemplateKeys}
                          selectedTemplate={selectedTemplate}
                          onSort={handleSort}
                          sortColumn={sortColumn}
                          sortDirection={sortDirection}
                          onToggleSelect={toggleTemplateSelection}
                          onToggleSelectAll={setSelectedTemplateKeys}
                          onOpenTemplate={setSelectedTemplate}
                          onDeleteTemplate={(template) => handleDelete(template.type, template.name, template.type === 'workflow' ? template.id : undefined)}
                          onApplyTemplate={openApplyForTemplate}
                        />
                      </div>
                    )}
                  </div>
                )}
              </section>
            )}
            {sortedWorkflowRows.length > 0 && (
              <section>
                <button
                  onClick={() => toggleSectionCollapsed('workflows')}
                  className="mb-3 flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-gray-100 hover:text-sky-700 dark:hover:text-sky-400"
                >
                  <span className="text-sm text-gray-500 dark:text-gray-400">{collapsedSections.workflows ? '▸' : '▾'}</span>
                  <span>⚡ Workflow Templates</span>
                  <span className="text-sm font-normal text-gray-400">({sortedWorkflowRows.length})</span>
                </button>
                {!collapsedSections.workflows && (
                  <TemplatesTable
                    rows={sortedWorkflowRows}
                    selectionMode={selectionMode}
                    selectedTemplateKeys={selectedTemplateKeys}
                    selectedTemplate={selectedTemplate}
                    onSort={handleSort}
                    sortColumn={sortColumn}
                    sortDirection={sortDirection}
                    onToggleSelect={toggleTemplateSelection}
                    onToggleSelectAll={setSelectedTemplateKeys}
                    onOpenTemplate={setSelectedTemplate}
                    onDeleteTemplate={(template) => handleDelete(template.type, template.name, template.type === 'workflow' ? template.id : undefined)}
                    onApplyTemplate={openApplyForTemplate}
                  />
                )}
              </section>
            )}
          </div>
          )
        )}
      </div>

      {/* Detail Panel */}
      {selectedTemplate && (
        <TemplateDetailPanel
          template={selectedTemplate}
          onClose={() => setSelectedTemplate(null)}
          onDelete={() => handleDelete(
            selectedTemplate.type,
            selectedTemplate.name,
            selectedTemplate.type === 'workflow' ? selectedTemplate.id : undefined
          )}
          onApply={selectedTemplate.type !== 'workflow' ? () => {
            openApplyForTemplate(selectedTemplate)
            setSelectedTemplate(null)
          } : undefined}
          onRefine={selectedTemplate.type !== 'workflow' ? () => {
            openEditForTemplate(selectedTemplate)
            setSelectedTemplate(null)
          } : undefined}
          onEdit={selectedTemplate.type === 'workflow' ? () => handleEditWorkflow(selectedTemplate.id) : undefined}
          onInstantiate={selectedTemplate.type === 'workflow' ? () => handleInstantiateWorkflow(selectedTemplate.id, selectedTemplate.name) : undefined}
        />
      )}

      {/* Apply Template Modal */}
      {applyingTemplate && (
        <ApplyOrgTemplateModal
          template={applyingTemplate}
          onClose={() => setApplyingTemplate(null)}
          onSuccess={() => {
            setApplyingTemplate(null)
            showSuccess('Organization template applied successfully! Refreshing...')
            fetchTemplates()
            window.dispatchEvent(new CustomEvent('agents-updated'))
            window.dispatchEvent(new CustomEvent('workflows-updated'))
            window.dispatchEvent(new CustomEvent('channels-updated'))
          }}
        />
      )}

      {applyingAgentTemplate && (
        <ApplyAgentTemplateModal
          template={applyingAgentTemplate}
          onClose={() => setApplyingAgentTemplate(null)}
          onSuccess={() => {
            setApplyingAgentTemplate(null)
            window.dispatchEvent(new CustomEvent('agents-updated'))
          }}
        />
      )}

      {/* Template Wizard */}
      {showWizard && (
        <TemplateWizard
          onClose={() => {
            setShowWizard(false)
            setEditingTemplate(null)
          }}
          initialTemplate={editingTemplate}
          onSave={async (template) => {
            try {
              const payload = editingTemplate && editingTemplate.type === 'organization'
                ? {
                    ...template,
                    metadata: {
                      ...(template.metadata || {}),
                      createdAt: editingTemplate.metadata?.createdAt,
                      basedOnSlug: editingTemplate.slug,
                      basedOnSource: editingTemplate.source,
                    },
                  }
                : template
              const slug = editingTemplate?.slug || template.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
              const resp = await fetch(`/api/templates/organizations/${slug}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
              })
              if (resp.ok) {
                showSuccess(`Template "${template.name}" saved!`)
                setShowWizard(false)
                setEditingTemplate(null)
                fetchTemplates()
              } else {
                showError('Failed to save template')
              }
            } catch {
              showError('Failed to save template')
            }
          }}
          onApply={(template) => {
            setApplyingTemplate(template as OrganizationTemplate)
            setShowWizard(false)
            setEditingTemplate(null)
          }}
          showSuccess={showSuccess}
          showError={showError}
        />
      )}

      {showAgentWizard && editingAgentTemplate && (
        <AgentTemplateWizard
          initialTemplate={editingAgentTemplate}
          onClose={() => {
            setShowAgentWizard(false)
            setEditingAgentTemplate(null)
          }}
          onSave={async (template) => {
            try {
              const payload = {
                ...template,
                metadata: {
                  ...(template.metadata || {}),
                  createdAt: editingAgentTemplate.metadata?.createdAt,
                  basedOnSlug: editingAgentTemplate.slug,
                  basedOnSource: editingAgentTemplate.source,
                },
              }
              const slug = editingAgentTemplate?.slug || template.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
              const resp = await fetch(`/api/templates/agents/${slug}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
              })
              if (resp.ok) {
                showSuccess(`Template "${template.name}" saved!`)
                setShowAgentWizard(false)
                setEditingAgentTemplate(null)
                fetchTemplates()
              } else {
                const data = await resp.json().catch(() => ({}))
                showError(data.error || 'Failed to save template')
              }
            } catch {
              showError('Failed to save template')
            }
          }}
          showError={showError}
        />
      )}

      {showImportTemplateModal && (
        <ImportTemplateModal
          onClose={() => setShowImportTemplateModal(false)}
          onImport={async (content) => {
            await handleImportTemplate(content)
            setShowImportTemplateModal(false)
          }}
        />
      )}

      <ConfirmDeleteDialog
        isOpen={deleteDialog !== null}
        itemName={deleteDialog?.itemName || ''}
        itemType={deleteDialog?.itemType || 'template'}
        warningMessage={deleteDialog?.warningMessage}
        consequences={deleteDialog?.consequences}
        onConfirm={async () => {
          if (deleteDialog) {
            await deleteDialog.onConfirm()
          }
        }}
        onCancel={() => setDeleteDialog(null)}
      />
    </div>
  )
}

function TemplatesTable({
  rows,
  selectionMode,
  selectedTemplateKeys,
  selectedTemplate,
  onSort,
  sortColumn,
  sortDirection,
  onToggleSelect,
  onToggleSelectAll,
  onOpenTemplate,
  onDeleteTemplate,
  onApplyTemplate,
}: {
  rows: TemplateRow[]
  selectionMode: boolean
  selectedTemplateKeys: Set<string>
  selectedTemplate: Template | null
  onSort: (column: TemplateSortColumn) => void
  sortColumn: TemplateSortColumn
  sortDirection: 'asc' | 'desc'
  onToggleSelect: (key: string) => void
  onToggleSelectAll: (keys: Set<string>) => void
  onOpenTemplate: (template: Template) => void
  onDeleteTemplate: (template: Template) => void
  onApplyTemplate: (template: Template) => void
}) {
  const SortHeader = ({ column, label }: { column: TemplateSortColumn; label: string }) => (
    <button
      onClick={() => onSort(column)}
      className="flex items-center gap-1 font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
    >
      {label}
      {sortColumn === column && (
        <span className="text-sky-600 dark:text-sky-400">{sortDirection === 'asc' ? '↑' : '↓'}</span>
      )}
    </button>
  )

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <div className="overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-900/40 border-b border-gray-200 dark:border-gray-700">
            <tr>
              {selectionMode && (
                <th className="px-4 py-3 text-left w-10 dark:bg-gray-800">
                  <button
                    type="button"
                    onClick={() => {
                      const allSelected = rows.length > 0 && rows.every(r => selectedTemplateKeys.has(r.key))
                      const next = new Set(selectedTemplateKeys)
                      rows.forEach(r => allSelected ? next.delete(r.key) : next.add(r.key))
                      onToggleSelectAll(next)
                    }}
                    className={`flex h-6 w-6 items-center justify-center rounded border text-xs font-bold transition-colors ${
                      rows.length > 0 && rows.every(r => selectedTemplateKeys.has(r.key))
                        ? 'bg-sky-600 border-sky-600 text-white'
                        : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-400 dark:text-gray-500'
                    } focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400`}
                    title="Toggle select all"
                  >
                    {rows.length > 0 && rows.every(r => selectedTemplateKeys.has(r.key)) ? '✓' : '□'}
                  </button>
                </th>
              )}
              <th className="px-4 py-3 text-left"><SortHeader column="name" label="Template" /></th>
              <th className="px-4 py-3 text-left"><SortHeader column="type" label="Type" /></th>
              <th className="px-4 py-3 text-left"><SortHeader column="agents" label="Agents" /></th>
              <th className="px-4 py-3 text-left"><SortHeader column="groups" label="Groups" /></th>
              <th className="px-4 py-3 text-left"><SortHeader column="workflows" label="Workflows" /></th>
              <th className="px-4 py-3 text-left"><SortHeader column="version" label="Version" /></th>
              <th className="px-4 py-3 text-left"><SortHeader column="author" label="Author" /></th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const isSelected = selectedTemplateKeys.has(row.key)
              const isActive = selectedTemplate && getTemplateRow(selectedTemplate).key === row.key

              return (
                <tr
                  key={row.key}
                  onClick={() => onOpenTemplate(row.template)}
                  className={`border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer ${
                    isActive ? 'bg-sky-50 dark:bg-sky-900/20' : ''
                  }`}
                >
                  {selectionMode && (
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onToggleSelect(row.key) }}
                        className={`flex h-6 w-6 items-center justify-center rounded border text-xs font-bold transition-colors ${
                          isSelected
                            ? 'bg-sky-600 border-sky-600 text-white'
                            : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-400 dark:text-gray-500'
                        } focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400`}
                        title={isSelected ? 'Deselect template' : 'Select template'}
                      >
                        {isSelected ? '✓' : '□'}
                      </button>
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900 dark:text-gray-100">{row.name}</div>
                    {row.tags.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {row.tags.slice(0, 3).map(tag => (
                          <span key={tag} className="text-[11px] px-1.5 py-0.5 rounded bg-sky-50 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400 border border-sky-200 dark:border-sky-700">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 capitalize text-gray-600 dark:text-gray-300">{row.templateLabel}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{row.agentCount}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{row.groupCount}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{row.workflowCount}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{row.version}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{row.author}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={(e) => { e.stopPropagation(); onOpenTemplate(row.template) }}
                        className="px-2 py-1 text-xs rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600"
                      >
                        View
                      </button>
                      {row.template.type !== 'workflow' && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onApplyTemplate(row.template) }}
                          className="px-2 py-1 text-xs rounded bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/40"
                        >
                          Apply
                        </button>
                      )}
                      {row.source === 'workspace' && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onDeleteTemplate(row.template) }}
                          className="px-2 py-1 text-xs rounded bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function TemplateCard({ template, onDelete, onApply, onClick, selected, ratingSummary, selectionMode, isSelected, onToggleSelect }: {
  template: AgentTemplate | OrganizationTemplate
  onDelete: () => void
  onApply: () => void
  onClick: () => void
  selected: boolean
  ratingSummary?: { count: number; avgRating: number }
  selectionMode?: boolean
  isSelected?: boolean
  onToggleSelect?: () => void
}) {
  const isOrg = template.type === 'organization'
  const templateEmoji = (template as any).emoji
  const agentCount = template.agents.length
  const communityCount = isOrg && template.communities ? template.communities.length : 0
  const groupCount = isOrg && template.groups ? template.groups.length : 0
  const workflowCount = isOrg && (template as any).workflows ? (template as any).workflows.length : 0
  const canDelete = template.source === 'workspace'

  return (
    <div
      onClick={onClick}
      className={`relative bg-white dark:bg-gray-800 rounded-lg border p-4 shadow-sm hover:shadow-md transition-all cursor-pointer ${
        selected ? 'border-sky-400 ring-2 ring-sky-100' : 'border-gray-200 dark:border-gray-700'
      }`}
    >
      {selectionMode && onToggleSelect && (
        <button
          onClick={(e) => { e.stopPropagation(); onToggleSelect() }}
          className={`absolute top-3 right-3 w-6 h-6 rounded border flex items-center justify-center text-xs font-bold transition-colors ${
            isSelected
              ? 'bg-sky-600 border-sky-600 text-white'
              : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-400 dark:text-gray-500'
          }`}
          title={isSelected ? 'Deselect template' : 'Select template'}
        >
          {isSelected ? '✓' : '□'}
        </button>
      )}
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-start gap-2 flex-1 min-w-0">
          {templateEmoji && (
            <span className="text-xl leading-none flex-shrink-0 mt-0.5">{templateEmoji}</span>
          )}
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm leading-tight flex-1 dark:text-gray-100">
            {template.name}
          </h3>
        </div>
        <div className="flex items-center gap-1 pr-7">
          <button
            onClick={(e) => { e.stopPropagation(); onApply(); }}
            className="text-gray-300 hover:text-emerald-500 transition-colors text-xs p-1"
            title="Apply template"
          >
            ⚡
          </button>
          {canDelete && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="text-gray-300 hover:text-red-500 transition-colors text-xs p-1"
              title="Delete template"
            >
              🗑
            </button>
          )}
        </div>
      </div>

      {template.description && (
        <p className="text-xs text-gray-500 mb-3 line-clamp-2">{template.description}</p>
      )}

      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-400 mb-2">
        <span>{agentCount} agent{agentCount !== 1 ? 's' : ''}</span>
        {isOrg && communityCount > 0 && (
          <>
            <span>•</span>
            <span>{communityCount} communit{communityCount !== 1 ? 'ies' : 'y'}</span>
          </>
        )}
        {isOrg && groupCount > 0 && (
          <>
            <span>•</span>
            <span>{groupCount} group{groupCount !== 1 ? 's' : ''}</span>
          </>
        )}
        {isOrg && workflowCount > 0 && (
          <>
            <span>•</span>
            <span>{workflowCount} workflow{workflowCount !== 1 ? 's' : ''}</span>
          </>
        )}
      </div>

      {template.tags && template.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {template.tags.slice(0, 3).map((tag: string) => (
            <span key={tag} className="text-xs px-1.5 py-0.5 rounded bg-sky-50 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400 border border-sky-200 dark:border-sky-700">
              {tag}
            </span>
          ))}
          {template.tags.length > 3 && (
            <span className="text-xs px-1.5 py-0.5 text-gray-400">+{template.tags.length - 3}</span>
          )}
        </div>
      )}

      <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between text-xs text-gray-400">
        <div className="flex flex-col items-start gap-1">
          <span>v{template.version}</span>
          {ratingSummary && ratingSummary.count > 0 && (
            <span className="text-amber-500 dark:text-amber-400">
              {'★'.repeat(Math.round(ratingSummary.avgRating))}
              <span className="ml-1 text-gray-500 dark:text-gray-400">
                {ratingSummary.avgRating.toFixed(1)} ({ratingSummary.count})
              </span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {template.source === 'system' && <span className="text-amber-500">System</span>}
          {template.source === 'enterprise' && <span className="text-fuchsia-500">Enterprise</span>}
          {template.author && <span>by {template.author}</span>}
        </div>
      </div>
    </div>
  )
}

function TemplateDetailPanel({ template, onClose, onDelete, onApply, onRefine, onEdit, onInstantiate }: {
  template: Template
  onClose: () => void
  onDelete: () => void
  onApply?: () => void
  onRefine?: () => void
  onEdit?: () => void
  onInstantiate?: () => void
}) {
  const { showSuccess, showError } = useToast()
  const isOrg = template.type === 'organization'
  const isWorkflow = template.type === 'workflow'
  const organizationKind = isOrg ? getOrganizationTemplateKind(template as OrganizationTemplate) : null
  const organizationTemplate = isOrg ? template as OrganizationTemplate : null
  const templateTeams = organizationTemplate?.teams || []
  const teamsById = new Map(templateTeams.map((team) => [team.id, team]))
  const sortedTeams = [...templateTeams].sort((a, b) => {
    const depthDiff = getTemplateTeamDepth(a, teamsById) - getTemplateTeamDepth(b, teamsById)
    if (depthDiff !== 0) return depthDiff
    return a.name.localeCompare(b.name)
  })
  const workflowsByTeamName = new Map<string, NonNullable<OrganizationTemplate['workflows']>[number][]>()
  for (const workflow of organizationTemplate?.workflows || []) {
    const teamName = getWorkflowTemplateTeamName(workflow, templateTeams) || 'Unassigned'
    workflowsByTeamName.set(teamName, [...(workflowsByTeamName.get(teamName) || []), workflow])
  }
  const canDelete = template.type === 'workflow' || template.source === 'workspace'
  const templateEmoji = (template as any).emoji
  const [feedbackSummary, setFeedbackSummary] = useState<TemplateFeedbackSummary | null>(null)
  const [loadingFeedback, setLoadingFeedback] = useState(false)
  const [submittingFeedback, setSubmittingFeedback] = useState(false)
  const [rating, setRating] = useState(0)
  const [easyToUse, setEasyToUse] = useState('')
  const [solvedUseCase, setSolvedUseCase] = useState('')
  const [customized, setCustomized] = useState('')
  const [otherUseCases, setOtherUseCases] = useState('')
  const [suggestions, setSuggestions] = useState('')
  const [showFeedbackDialog, setShowFeedbackDialog] = useState(false)

  useEffect(() => {
    if (isWorkflow || !template.slug) return
    setLoadingFeedback(true)
    fetch(`/api/templates/${template.type === 'organization' ? 'organizations' : 'agents'}/${template.slug}/feedback`)
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (data) setFeedbackSummary(data) })
      .catch(() => {})
      .finally(() => setLoadingFeedback(false))
  }, [isWorkflow, template.slug, template.type])

  const submitFeedback = async () => {
    if (isWorkflow || !template.slug || rating < 1) {
      showError('Select a star rating first')
      return
    }
    setSubmittingFeedback(true)
    try {
      const resp = await fetch(`/api/templates/${template.type === 'organization' ? 'organizations' : 'agents'}/${template.slug}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rating,
          easyToUse,
          solvedUseCase,
          customized,
          otherUseCases,
          suggestions,
        }),
      })
      const data = await resp.json().catch(() => ({}))
      if (!resp.ok) throw new Error(data.error || 'Failed to save feedback')
      setFeedbackSummary(data.summary)
      setRating(0)
      setEasyToUse('')
      setSolvedUseCase('')
      setCustomized('')
      setOtherUseCases('')
      setSuggestions('')
      setShowFeedbackDialog(false)
      showSuccess('Template feedback saved')
    } catch (err: any) {
      showError(err.message || 'Failed to save feedback')
    } finally {
      setSubmittingFeedback(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            {templateEmoji && <span className="text-2xl leading-none">{templateEmoji}</span>}
            <span>{template.name}</span>
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:text-gray-400 text-xl leading-none">
            ×
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Type & Version */}
          <div className="flex items-center gap-3">
            <span className="text-2xl">{templateEmoji || (isOrg ? (organizationKind === 'company' ? '🏢' : '👥') : isWorkflow ? '⚡' : '🤖')}</span>
            <div>
              <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {isOrg ? (organizationKind === 'company' ? 'Company Template' : 'Team Template') : isWorkflow ? 'Workflow Template' : 'Agent Template'}
              </div>
              <div className="text-xs text-gray-400">Version {template.version}</div>
            </div>
          </div>

          {/* Description */}
          {template.description && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1 dark:text-gray-300">Description</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">{template.description}</p>
            </div>
          )}

          {/* Author */}
          {template.author && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1 dark:text-gray-300">Author</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">{template.author}</p>
            </div>
          )}

          {!isWorkflow && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1 dark:text-gray-300">Template Source</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 capitalize">
                {template.source || 'workspace'}
                {((template as OrganizationTemplate).metadata?.basedOnSlug || (template as AgentTemplate).metadata?.basedOnSlug) && (
                  <span className="ml-2 text-xs text-gray-500 dark:text-gray-500">
                    based on {((template as OrganizationTemplate).metadata?.basedOnSource || (template as AgentTemplate).metadata?.basedOnSource || 'template')}:{' '}
                    {((template as OrganizationTemplate).metadata?.basedOnSlug || (template as AgentTemplate).metadata?.basedOnSlug)}
                  </span>
                )}
              </p>
            </div>
          )}

          {!isWorkflow && ((template as OrganizationTemplate).metadata?.updatedAt || (template as AgentTemplate).metadata?.updatedAt) && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1 dark:text-gray-300">Last Changed</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {new Date(((template as OrganizationTemplate).metadata?.updatedAt || (template as AgentTemplate).metadata?.updatedAt)!).toLocaleString()}
              </p>
            </div>
          )}

          {/* Tags */}
          {!isWorkflow && template.tags && template.tags.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 dark:text-gray-300">Tags</h3>
              <div className="flex flex-wrap gap-1">
                {template.tags.map(tag => (
                  <span key={tag} className="text-xs px-2 py-1 rounded bg-sky-50 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400 border border-sky-200 dark:border-sky-700">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {!isWorkflow && template.slug && (
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Template Feedback</h3>
                  <div className="mt-1 text-sm text-amber-600 dark:text-amber-400">
                    {loadingFeedback ? 'Loading…' : feedbackSummary && feedbackSummary.count > 0 ? `${feedbackSummary.avgRating.toFixed(1)} / 5` : 'No ratings yet'}
                    <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                      ({feedbackSummary?.count || 0} submission{(feedbackSummary?.count || 0) === 1 ? '' : 's'})
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setShowFeedbackDialog(true)}
                  className="px-3 py-2 rounded-md bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 text-sm font-medium hover:bg-amber-100 dark:hover:bg-amber-900/30"
                >
                  Leave Feedback
                </button>
              </div>
            </div>
          )}

          {/* Workflow-specific details */}
          {isWorkflow && (
            <>
              <div>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1 dark:text-gray-300">Schedule</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 font-mono">{template.schedule}</p>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1 dark:text-gray-300">Execution Mode</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 capitalize">{template.executionMode}</p>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1 dark:text-gray-300">Status</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">{template.enabled ? '✓ Enabled' : '○ Disabled'}</p>
              </div>

              {/* Targeting */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 dark:text-gray-300">Targeting</h3>
                <div className="space-y-2 text-sm">
                  {template.targeting.communities.length > 0 && (
                    <div>
                      <span className="text-gray-500">Communities:</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {template.targeting.communities.map((c, i) => (
                          <span key={i} className="text-xs px-2 py-1 rounded bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 border border-purple-200 dark:border-purple-700">
                            {c}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {template.targeting.groups.length > 0 && (
                    <div>
                      <span className="text-gray-500">Groups:</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {template.targeting.groups.map((g, i) => (
                          <span key={i} className="text-xs px-2 py-1 rounded bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-700">
                            {g}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {template.targeting.tags.length > 0 && (
                    <div>
                      <span className="text-gray-500">Tags:</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {template.targeting.tags.map((t, i) => (
                          <span key={i} className="text-xs px-2 py-1 rounded bg-sky-50 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400 border border-sky-200 dark:border-sky-700">
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {template.targeting.agents.length > 0 && (
                    <div>
                      <span className="text-gray-500">Agents:</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {template.targeting.agents.map((a, i) => (
                          <span key={i} className="text-xs px-2 py-1 rounded bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 border border-green-200 dark:border-green-800">
                            {a}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {template.targeting.communities.length === 0 &&
                   template.targeting.groups.length === 0 &&
                   template.targeting.tags.length === 0 &&
                   template.targeting.agents.length === 0 && (
                    <span className="text-xs text-gray-400 italic">No targeting configured</span>
                  )}
                </div>
              </div>

              {/* Workflow Content Preview */}
              {template.content && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 dark:text-gray-300">Content Preview</h3>
                  <pre className="text-xs bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded p-3 overflow-auto max-h-60 text-gray-700 dark:text-gray-300 whitespace-pre-wrap dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
                    {template.content.substring(0, 500)}{template.content.length > 500 ? '...' : ''}
                  </pre>
                </div>
              )}
            </>
          )}

          {/* Agents */}
          {!isWorkflow && (
          <div>
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 dark:text-gray-300">
              Agents ({template.agents.length})
            </h3>
            <div className="space-y-2">
              {template.agents.map((agent, idx) => (
                <div key={idx} className="bg-gray-50 dark:bg-gray-900 rounded px-3 py-2 text-sm dark:bg-gray-900">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-sky-600 dark:text-sky-400">{agent.id}</span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">{agent.role}</span>
                  </div>
                  {agent.skills && agent.skills.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {agent.skills.map((s: string) => (
                        <span key={s} className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-700">{s}</span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
          )}

          {/* Communities & Groups (for org templates) */}
          {isOrg && template.communities && template.communities.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 dark:text-gray-300">
                Communities ({template.communities.length})
              </h3>
              <div className="flex flex-wrap gap-2">
                {template.communities.map((comm, idx) => (
                  <span key={idx} className="text-xs px-2 py-1 rounded bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 border border-purple-200 dark:border-purple-700">
                    {comm.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {isOrg && template.groups && template.groups.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 dark:text-gray-300">
                Groups ({template.groups.length})
              </h3>
              <div className="flex flex-wrap gap-2">
                {template.groups.map((group, idx) => (
                  <span key={idx} className="text-xs px-2 py-1 rounded bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 border border-green-200 dark:border-green-700">
                    {group.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {isOrg && sortedTeams.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 dark:text-gray-300">
                Teams ({sortedTeams.length})
              </h3>
              <div className="space-y-2">
                {sortedTeams.map((team) => {
                  const depth = getTemplateTeamDepth(team, teamsById)
                  return (
                    <div
                      key={team.id}
                      className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded px-3 py-2"
                      style={{ marginLeft: depth * 16 }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium text-amber-900 dark:text-amber-200">{team.name}</span>
                            <span className="text-[11px] font-mono text-amber-700 dark:text-amber-400">{team.id}</span>
                          </div>
                          {team.purpose && (
                            <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-300">{team.purpose}</p>
                          )}
                        </div>
                        <div className="text-[11px] text-amber-700 dark:text-amber-400">
                          {team.leaderAgentId ? `Lead: ${team.leaderAgentId}` : 'No lead'}
                        </div>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-3 text-[11px] text-amber-700 dark:text-amber-400">
                        {team.parentTeamId && <span>Parent: {team.parentTeamId}</span>}
                        <span>Members: {team.memberAgentIds?.length || 0}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Workflows (for org templates) */}
          {isOrg && (template as any).workflows && (template as any).workflows.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 dark:text-gray-300">
                Workflows ({(template as any).workflows.length})
              </h3>
              <div className="space-y-2">
                {Array.from(workflowsByTeamName.entries()).map(([teamName, workflows]) => (
                  <div key={teamName} className="rounded border border-amber-200 dark:border-amber-700 bg-amber-50/40 dark:bg-amber-900/10 p-3">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                      {teamName} Team
                    </div>
                    <div className="space-y-2">
                      {workflows.map((wf, idx) => (
                        <div key={`${wf.id}:${idx}`} className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded px-3 py-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-medium text-amber-900 dark:text-amber-200">{wf.name}</span>
                            <span className="text-xs font-mono text-amber-600 dark:text-amber-400">{wf.schedule === 'manual' ? 'Manual' : wf.schedule}</span>
                          </div>
                          <div className="mt-1 flex flex-wrap gap-3 text-[11px] text-amber-700 dark:text-amber-300">
                            {wf.owner && <span>Owner: {wf.owner}</span>}
                            {wf.inputRefs && wf.inputRefs.length > 0 && <span>{wf.inputRefs.length} input{wf.inputRefs.length === 1 ? '' : 's'}</span>}
                            {wf.outputDefinitions && wf.outputDefinitions.length > 0 && <span>{wf.outputDefinitions.length} output{wf.outputDefinitions.length === 1 ? '' : 's'}</span>}
                          </div>
                          {wf.description && (
                            <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">{wf.description}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Metadata (for agent templates) */}
          {!isOrg && !isWorkflow && template.metadata && (
            <div className="bg-sky-50 dark:bg-sky-900/30 border border-sky-200 dark:border-sky-700 rounded p-3 text-xs space-y-1">
              <div className="font-semibold text-sky-700 dark:text-sky-400">Template Metadata</div>
              {template.metadata.model && (
                <div className="text-sky-600 dark:text-sky-400">Model: {template.metadata.model}</div>
              )}
              {template.metadata.createdAt && (
                <div className="text-sky-600 dark:text-sky-400">Created: {new Date(template.metadata.createdAt).toLocaleDateString()}</div>
              )}
              {template.metadata.updatedAt && (
                <div className="text-sky-600 dark:text-sky-400">Updated: {new Date(template.metadata.updatedAt).toLocaleString()}</div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            {!isWorkflow && onApply && (
              <button
                onClick={onApply}
                className="flex-1 px-4 py-2 bg-sky-600 text-white rounded-md hover:bg-sky-700 transition-colors text-sm font-medium"
              >
                ⚡ Apply Template
              </button>
            )}
            {!isWorkflow && onRefine && (
              <button
                onClick={onRefine}
                className="px-4 py-2 bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-md hover:bg-purple-100 dark:hover:bg-purple-900/50 transition-colors text-sm font-medium"
              >
                ✨ Edit & Refine
              </button>
            )}
            {!isWorkflow && template.slug && (
              <button
                onClick={() => window.open(`/api/templates/organizations/${template.slug}/export-md`, '_blank')}
                className="px-3 py-2 text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/30 rounded-md transition-colors text-sm font-medium"
              >
                Export .md
              </button>
            )}
            {isWorkflow && onInstantiate && (
              <button
                onClick={onInstantiate}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors text-sm font-medium"
              >
                ▶ Run Workflow
              </button>
            )}
            {isWorkflow && onEdit && (
              <button
                onClick={onEdit}
                className="flex-1 px-4 py-2 bg-sky-600 text-white rounded-md hover:bg-sky-700 transition-colors text-sm font-medium"
              >
                ✏️ Edit Workflow
              </button>
            )}
            {canDelete && (
              <button
                onClick={onDelete}
                className="px-4 py-2 rounded-md border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200 dark:hover:bg-red-900/40 transition-colors text-sm font-medium"
              >
                {isWorkflow ? 'Delete Workflow' : 'Delete Template'}
              </button>
            )}
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors text-sm dark:bg-gray-800 dark:text-gray-300"
            >
              Close
            </button>
          </div>
        </div>
      </div>

      {!isWorkflow && template.slug && showFeedbackDialog && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4" onClick={() => setShowFeedbackDialog(false)}>
          <div className="w-full max-w-xl rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-2xl p-5 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Leave Template Feedback</h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Stored locally in this workspace for now.</p>
              </div>
              <button onClick={() => setShowFeedbackDialog(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-lg leading-none">✕</button>
            </div>

            <div className="space-y-4">
              <div>
                <div className="mb-2 text-xs font-medium text-gray-600 dark:text-gray-300">Star Rating</div>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map(value => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setRating(value)}
                      className={`text-2xl leading-none ${value <= rating ? 'text-amber-400' : 'text-gray-300 dark:text-gray-600'}`}
                      title={`${value} star${value === 1 ? '' : 's'}`}
                    >
                      ★
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className="block">
                  <span className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Easy to use?</span>
                  <select value={easyToUse} onChange={(e) => setEasyToUse(e.target.value)} className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-2 text-sm text-gray-900 dark:text-gray-100">
                    <option value="">Select…</option>
                    <option value="yes">Yes</option>
                    <option value="mixed">Mixed</option>
                    <option value="no">No</option>
                  </select>
                </label>
                <label className="block">
                  <span className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Solved your use case?</span>
                  <select value={solvedUseCase} onChange={(e) => setSolvedUseCase(e.target.value)} className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-2 text-sm text-gray-900 dark:text-gray-100">
                    <option value="">Select…</option>
                    <option value="yes">Yes</option>
                    <option value="partly">Partly</option>
                    <option value="no">No</option>
                  </select>
                </label>
                <label className="block">
                  <span className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Did you customize it?</span>
                  <select value={customized} onChange={(e) => setCustomized(e.target.value)} className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-2 text-sm text-gray-900 dark:text-gray-100">
                    <option value="">Select…</option>
                    <option value="yes">Yes</option>
                    <option value="a-little">A little</option>
                    <option value="no">No</option>
                  </select>
                </label>
              </div>

              <label className="block">
                <span className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">What other use case should this support?</span>
                <textarea value={otherUseCases} onChange={(e) => setOtherUseCases(e.target.value)} rows={2} className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100" />
              </label>

              <label className="block">
                <span className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Suggestions</span>
                <textarea value={suggestions} onChange={(e) => setSuggestions(e.target.value)} rows={3} className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100" />
              </label>

              {feedbackSummary && feedbackSummary.entries.length > 0 && (
                <div>
                  <div className="mb-2 text-xs font-medium text-gray-600 dark:text-gray-300">Recent Feedback</div>
                  <div className="space-y-2">
                    {feedbackSummary.entries.slice(0, 3).map(entry => (
                      <div key={entry.id} className="rounded-md bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 p-3 text-xs">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-amber-500">{'★'.repeat(entry.rating)}<span className="text-gray-300 dark:text-gray-600">{'★'.repeat(5 - entry.rating)}</span></div>
                          <div className="text-gray-400 dark:text-gray-500">{new Date(entry.createdAt).toLocaleString()}</div>
                        </div>
                        {entry.suggestions && <div className="mt-2 text-gray-700 dark:text-gray-300">{entry.suggestions}</div>}
                        {entry.otherUseCases && <div className="mt-1 text-gray-500 dark:text-gray-400">Other use case: {entry.otherUseCases}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2">
                <button onClick={() => setShowFeedbackDialog(false)} className="px-4 py-2 rounded-md border border-gray-300 dark:border-gray-600 text-sm text-gray-700 dark:text-gray-300">Cancel</button>
                <button
                  onClick={submitFeedback}
                  disabled={submittingFeedback || rating < 1}
                  className="px-4 py-2 rounded-md bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 disabled:opacity-60"
                >
                  {submittingFeedback ? 'Saving…' : 'Save Feedback'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function WorkflowTemplateCard({ template, onClick, selected, selectionMode, isSelected, onToggleSelect }: { template: WorkflowTemplate; onClick: () => void; selected: boolean; selectionMode?: boolean; isSelected?: boolean; onToggleSelect?: () => void }) {
  const templateEmoji = template.emoji || '⚡'
  const targetingCount =
    template.targeting.communities.length +
    template.targeting.groups.length +
    template.targeting.tags.length +
    template.targeting.agents.length

  return (
    <div
      onClick={onClick}
      className={`relative bg-white dark:bg-gray-800 rounded-lg border p-4 shadow-sm hover:shadow-md transition-all cursor-pointer ${
        selected ? 'border-sky-400 ring-2 ring-sky-100' : 'border-gray-200 dark:border-gray-700'
      }`}
    >
      {selectionMode && onToggleSelect && (
        <button
          onClick={(e) => { e.stopPropagation(); onToggleSelect() }}
          className={`absolute top-3 right-3 w-6 h-6 rounded border flex items-center justify-center text-xs font-bold transition-colors ${
            isSelected
              ? 'bg-sky-600 border-sky-600 text-white'
              : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-400 dark:text-gray-500'
          }`}
          title={isSelected ? 'Deselect template' : 'Select template'}
        >
          {isSelected ? '✓' : '□'}
        </button>
      )}
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-start gap-2 flex-1 min-w-0">
          <span className="text-xl leading-none flex-shrink-0 mt-0.5">{templateEmoji}</span>
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm leading-tight flex-1 dark:text-gray-100">
            {template.name}
          </h3>
        </div>
      </div>

      {template.description && (
        <p className="text-xs text-gray-500 mb-3 line-clamp-2">{template.description}</p>
      )}

      <div className="space-y-2 text-xs text-gray-600 dark:text-gray-400">
        <div className="flex items-center gap-2">
          <span className="text-gray-400">📅</span>
          <span>{template.schedule}</span>
        </div>
        {targetingCount > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-gray-400">🎯</span>
            <span>{targetingCount} target{targetingCount !== 1 ? 's' : ''}</span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <span className="text-gray-400">⚙️</span>
          <span className="capitalize">{template.executionMode}</span>
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between text-xs text-gray-400">
        <span>{template.enabled ? '✓ Enabled' : '○ Disabled'}</span>
        {template.author && <span>by {template.author}</span>}
      </div>
    </div>
  )
}
