import React, { useState, useEffect } from 'react'

interface AgentTargeting {
  communities: string[]
  groups: string[]
  tags: string[]
  agents: string[]
}

interface WorkflowFormData {
  name: string
  description: string
  schedule: string
  enabled: boolean
  executionMode: 'automated' | 'managed'
  owner?: string
  targeting: AgentTargeting
  content: string
}

interface Agent {
  id: string
  name?: string
}

interface Community {
  name: string
}

interface Group {
  name: string
}

interface WorkflowEditorDialogProps {
  isOpen: boolean
  onClose: () => void
  onSave: (data: WorkflowFormData) => Promise<void>
  initialData?: Partial<WorkflowFormData>
  mode: 'create' | 'edit'
}

export default function WorkflowEditorDialog({ isOpen, onClose, onSave, initialData, mode }: WorkflowEditorDialogProps) {
  const [formData, setFormData] = useState<WorkflowFormData>({
    name: '',
    description: '',
    schedule: '0 9 * * *',
    enabled: true,
    executionMode: 'automated',
    targeting: {
      communities: [],
      groups: [],
      tags: [],
      agents: []
    },
    content: '',
    ...initialData
  })
  const [saving, setSaving] = useState(false)
  const [cronError, setCronError] = useState<string | null>(null)
  const [cronHuman, setCronHuman] = useState<string>('')
  const [validationErrors, setValidationErrors] = useState<{
    name?: string
    description?: string
    schedule?: string
    content?: string
    targeting?: string
    owner?: string
  }>({})

  // Available options for targeting
  const [agents, setAgents] = useState<Agent[]>([])
  const [communities, setCommunities] = useState<Community[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [allTags, setAllTags] = useState<string[]>([])

  // Search filters for checkbox lists
  const [groupSearch, setGroupSearch] = useState('')
  const [communitySearch, setCommunitySearch] = useState('')
  const [agentSearch, setAgentSearch] = useState('')
  const [showCronBuilder, setShowCronBuilder] = useState(false)
  const [recentCrons, setRecentCrons] = useState<string[]>(() => {
    const saved = localStorage.getItem('recent-cron-expressions')
    return saved ? JSON.parse(saved) : []
  })

  // Load available agents, communities, groups, and extract all tags
  useEffect(() => {
    if (isOpen) {
      Promise.all([
        fetch('/api/agents').then(r => r.json()),
        fetch('/api/communities').then(r => r.json()),
        fetch('/api/groups').then(r => r.json())
      ]).then(([agentsData, communitiesData, groupsData]) => {
        setAgents(agentsData.agents || [])
        setCommunities(communitiesData.communities || [])
        setGroups(groupsData.groups || [])

        // Extract unique tags from all agents
        const tagSet = new Set<string>()
        ;(agentsData.agents || []).forEach((agent: any) => {
          ;(agent.tags || []).forEach((tag: string) => tagSet.add(tag))
        })
        setAllTags(Array.from(tagSet).sort())
      })
    }
  }, [isOpen])

  // Validate cron expression - basic client-side validation
  useEffect(() => {
    const validateCron = () => {
      if (!formData.schedule) {
        setCronError(null)
        setCronHuman('')
        return
      }

      // Basic cron format check: 5 or 6 fields separated by spaces
      const parts = formData.schedule.trim().split(/\s+/)
      if (parts.length < 5 || parts.length > 6) {
        setCronError('Cron expression must have 5 or 6 fields')
        setCronHuman('')
        return
      }

      // Check for valid characters (numbers, *, /, -, ,)
      const validPattern = /^[0-9*,\-/]+$/
      const allValid = parts.every(part => validPattern.test(part))

      if (!allValid) {
        setCronError('Invalid characters in cron expression')
        setCronHuman('')
        return
      }

      setCronError(null)
      setCronHuman('') // Real validation will happen on server
    }

    const timer = setTimeout(validateCron, 300)
    return () => clearTimeout(timer)
  }, [formData.schedule])

  const handleSave = async () => {
    // Validation
    const errors: typeof validationErrors = {}

    if (!formData.name.trim()) {
      errors.name = 'Name is required'
    }

    if (!formData.description.trim()) {
      errors.description = 'Description is required'
    }

    if (!formData.schedule.trim()) {
      errors.schedule = 'Schedule is required'
    } else if (cronError) {
      errors.schedule = cronError
    }

    if (!formData.content.trim()) {
      errors.content = 'Workflow content is required'
    }

    // Check if at least one targeting criterion is selected
    const hasTargeting =
      formData.targeting.agents.length > 0 ||
      formData.targeting.groups.length > 0 ||
      formData.targeting.communities.length > 0 ||
      formData.targeting.tags.length > 0

    if (!hasTargeting) {
      errors.targeting = 'At least one targeting criterion is required (agents, groups, communities, or tags)'
    }

    if (formData.executionMode === 'managed' && !formData.owner) {
      errors.owner = 'Owner is required for managed workflows'
    }

    // If there are errors, show them and don't save
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors)
      return
    }

    // Clear any previous errors
    setValidationErrors({})

    // Save cron to recent list if it's custom (not in presets)
    const presetCrons = [
      '0 * * * *', '0 */6 * * *', '0 9 * * *', '0 17 * * *',
      '0 9 * * 1-5', '0 9 * * 0,6', '0 9 * * 1,3,5', '0 9 * * 2,4',
      '0 9 * * 1', '0 9 1 * *'
    ]
    if (!presetCrons.includes(formData.schedule) && !recentCrons.includes(formData.schedule)) {
      const updated = [formData.schedule, ...recentCrons].slice(0, 3)
      setRecentCrons(updated)
      localStorage.setItem('recent-cron-expressions', JSON.stringify(updated))
    }

    setSaving(true)
    try {
      await onSave(formData)
      onClose()
    } catch (err) {
      // Error handling is done by parent
    } finally {
      setSaving(false)
    }
  }

  const handleTargetingChange = (field: keyof AgentTargeting, value: string[]) => {
    setFormData({
      ...formData,
      targeting: {
        ...formData.targeting,
        [field]: value
      }
    })
    // Clear targeting error when any targeting changes
    if (validationErrors.targeting) {
      setValidationErrors({ ...validationErrors, targeting: undefined })
    }
  }

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 z-50" onClick={onClose} />

      {/* Dialog */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-auto">
        <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
          {/* Header */}
          <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-900">
              {mode === 'create' ? 'Create Workflow' : 'Edit Workflow'}
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          </div>

          {/* Form */}
          <div className="p-6 space-y-6">
            {/* Name */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Name *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={e => {
                  setFormData({ ...formData, name: e.target.value })
                  if (validationErrors.name) {
                    setValidationErrors({ ...validationErrors, name: undefined })
                  }
                }}
                className={`w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 ${
                  validationErrors.name ? 'border-red-300 focus:ring-red-500' : 'border-gray-300 focus:ring-sky-500'
                }`}
                placeholder="e.g., Daily Standup Report"
              />
              {validationErrors.name && (
                <p className="text-xs text-red-600 mt-1">{validationErrors.name}</p>
              )}
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Description *
              </label>
              <textarea
                value={formData.description}
                onChange={e => {
                  setFormData({ ...formData, description: e.target.value })
                  if (validationErrors.description) {
                    setValidationErrors({ ...validationErrors, description: undefined })
                  }
                }}
                className={`w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 ${
                  validationErrors.description ? 'border-red-300 focus:ring-red-500' : 'border-gray-300 focus:ring-sky-500'
                }`}
                rows={2}
                placeholder="Brief description of what this workflow does"
              />
              {validationErrors.description && (
                <p className="text-xs text-red-600 mt-1">{validationErrors.description}</p>
              )}
            </div>

            {/* Schedule */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Schedule (Cron Expression) *
              </label>

              {/* Recent crons */}
              {recentCrons.length > 0 && (
                <div className="mb-2">
                  <span className="text-xs text-gray-500 font-medium mr-2">Recent:</span>
                  {recentCrons.map(cron => (
                    <button
                      key={cron}
                      type="button"
                      onClick={() => {
                        setFormData({ ...formData, schedule: cron })
                        if (validationErrors.schedule) {
                          setValidationErrors({ ...validationErrors, schedule: undefined })
                        }
                      }}
                      className={`text-xs px-2.5 py-1.5 rounded border transition-colors mr-2 ${
                        formData.schedule === cron
                          ? 'bg-purple-100 border-purple-500 text-purple-700 font-medium'
                          : 'bg-white border-gray-300 text-gray-700 hover:border-purple-400 hover:bg-purple-50'
                      }`}
                    >
                      {cron}
                    </button>
                  ))}
                </div>
              )}

              {/* Cron presets */}
              <div className="mb-3 flex flex-wrap gap-2">
                {[
                  { label: 'Every hour', cron: '0 * * * *' },
                  { label: 'Every 6 hours', cron: '0 */6 * * *' },
                  { label: 'Daily 9am', cron: '0 9 * * *' },
                  { label: 'Daily 5pm', cron: '0 17 * * *' },
                  { label: 'Weekdays 9am', cron: '0 9 * * 1-5' },
                  { label: 'Weekends 9am', cron: '0 9 * * 0,6' },
                  { label: 'M-W-F 9am', cron: '0 9 * * 1,3,5' },
                  { label: 'Tu-Th 9am', cron: '0 9 * * 2,4' },
                  { label: 'Monday 9am', cron: '0 9 * * 1' },
                  { label: 'Monthly 1st 9am', cron: '0 9 1 * *' },
                ].map(preset => (
                  <button
                    key={preset.cron}
                    type="button"
                    onClick={() => {
                      setFormData({ ...formData, schedule: preset.cron })
                      if (validationErrors.schedule) {
                        setValidationErrors({ ...validationErrors, schedule: undefined })
                      }
                    }}
                    className={`text-xs px-2.5 py-1.5 rounded border transition-colors ${
                      formData.schedule === preset.cron
                        ? 'bg-sky-100 border-sky-500 text-sky-700 font-medium'
                        : 'bg-white border-gray-300 text-gray-700 hover:border-sky-400 hover:bg-sky-50'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setShowCronBuilder(!showCronBuilder)}
                  className="text-xs px-2.5 py-1.5 rounded border bg-white border-gray-300 text-gray-700 hover:border-sky-400 hover:bg-sky-50 transition-colors"
                >
                  {showCronBuilder ? '✕ Close' : '🔧 Builder'}
                </button>
              </div>

              {/* Cron builder */}
              {showCronBuilder && (
                <div className="mb-3 p-3 bg-gray-50 border border-gray-200 rounded-md space-y-3">
                  <div className="grid grid-cols-5 gap-2 text-xs">
                    <div>
                      <label className="block text-gray-600 mb-1 font-medium">Minute</label>
                      <input
                        type="text"
                        placeholder="0-59 or *"
                        className="w-full px-2 py-1 border border-gray-300 rounded text-xs font-mono focus:outline-none focus:ring-1 focus:ring-sky-500"
                        onChange={e => {
                          const parts = formData.schedule.split(' ')
                          parts[0] = e.target.value || '*'
                          setFormData({ ...formData, schedule: parts.join(' ') })
                        }}
                      />
                    </div>
                    <div>
                      <label className="block text-gray-600 mb-1 font-medium">Hour</label>
                      <input
                        type="text"
                        placeholder="0-23 or *"
                        className="w-full px-2 py-1 border border-gray-300 rounded text-xs font-mono focus:outline-none focus:ring-1 focus:ring-sky-500"
                        onChange={e => {
                          const parts = formData.schedule.split(' ')
                          parts[1] = e.target.value || '*'
                          setFormData({ ...formData, schedule: parts.join(' ') })
                        }}
                      />
                    </div>
                    <div>
                      <label className="block text-gray-600 mb-1 font-medium">Day</label>
                      <input
                        type="text"
                        placeholder="1-31 or *"
                        className="w-full px-2 py-1 border border-gray-300 rounded text-xs font-mono focus:outline-none focus:ring-1 focus:ring-sky-500"
                        onChange={e => {
                          const parts = formData.schedule.split(' ')
                          parts[2] = e.target.value || '*'
                          setFormData({ ...formData, schedule: parts.join(' ') })
                        }}
                      />
                    </div>
                    <div>
                      <label className="block text-gray-600 mb-1 font-medium">Month</label>
                      <input
                        type="text"
                        placeholder="1-12 or *"
                        className="w-full px-2 py-1 border border-gray-300 rounded text-xs font-mono focus:outline-none focus:ring-1 focus:ring-sky-500"
                        onChange={e => {
                          const parts = formData.schedule.split(' ')
                          parts[3] = e.target.value || '*'
                          setFormData({ ...formData, schedule: parts.join(' ') })
                        }}
                      />
                    </div>
                    <div>
                      <label className="block text-gray-600 mb-1 font-medium">Weekday</label>
                      <input
                        type="text"
                        placeholder="0-6 or *"
                        className="w-full px-2 py-1 border border-gray-300 rounded text-xs font-mono focus:outline-none focus:ring-1 focus:ring-sky-500"
                        onChange={e => {
                          const parts = formData.schedule.split(' ')
                          parts[4] = e.target.value || '*'
                          setFormData({ ...formData, schedule: parts.join(' ') })
                        }}
                      />
                    </div>
                  </div>
                  <p className="text-xs text-gray-500">
                    Use * for any, numbers for specific values, or ranges like 1-5
                  </p>
                </div>
              )}

              {/* Manual input */}
              <input
                type="text"
                value={formData.schedule}
                onChange={e => {
                  setFormData({ ...formData, schedule: e.target.value })
                  if (validationErrors.schedule) {
                    setValidationErrors({ ...validationErrors, schedule: undefined })
                  }
                }}
                className={`w-full px-3 py-2 border rounded-md text-sm font-mono focus:outline-none focus:ring-2 ${
                  cronError || validationErrors.schedule ? 'border-red-300 focus:ring-red-500' : 'border-gray-300 focus:ring-sky-500'
                }`}
                placeholder="0 9 * * *"
              />
              {(cronError || validationErrors.schedule) && (
                <p className="text-xs text-red-600 mt-1">{validationErrors.schedule || cronError}</p>
              )}
              <p className="text-xs text-gray-500 mt-1">
                Format: minute hour day month weekday
              </p>
            </div>

            {/* Execution Mode */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Execution Mode *
              </label>
              <div className="space-y-2">
                <label className="flex items-start gap-3">
                  <input
                    type="radio"
                    checked={formData.executionMode === 'automated'}
                    onChange={() => setFormData({ ...formData, executionMode: 'automated', owner: undefined })}
                    className="mt-0.5"
                  />
                  <div>
                    <div className="text-sm font-medium text-gray-900">Automated</div>
                    <div className="text-xs text-gray-500">Fully automated by execution engine</div>
                  </div>
                </label>
                <label className="flex items-start gap-3">
                  <input
                    type="radio"
                    checked={formData.executionMode === 'managed'}
                    onChange={() => setFormData({ ...formData, executionMode: 'managed' })}
                    className="mt-0.5"
                  />
                  <div>
                    <div className="text-sm font-medium text-gray-900">Managed</div>
                    <div className="text-xs text-gray-500">Agent owner manages execution lifecycle</div>
                  </div>
                </label>
              </div>
            </div>

            {/* Owner (for managed mode) */}
            {formData.executionMode === 'managed' && (
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Owner Agent *
                </label>
                <select
                  value={formData.owner || ''}
                  onChange={e => {
                    setFormData({ ...formData, owner: e.target.value })
                    if (validationErrors.owner) {
                      setValidationErrors({ ...validationErrors, owner: undefined })
                    }
                  }}
                  className={`w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 ${
                    validationErrors.owner ? 'border-red-300 focus:ring-red-500' : 'border-gray-300 focus:ring-sky-500'
                  }`}
                >
                  <option value="">Select agent...</option>
                  {agents.map(agent => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name || agent.id}
                    </option>
                  ))}
                </select>
                {validationErrors.owner && (
                  <p className="text-xs text-red-600 mt-1">{validationErrors.owner}</p>
                )}
              </div>
            )}

            {/* Agent Targeting */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Target Agents (OR logic) *
              </label>
              <div className={`space-y-4 bg-gray-50 border rounded-md p-4 ${
                validationErrors.targeting ? 'border-red-300' : 'border-gray-200'
              }`}>
                {/* Specific Agents */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-2">Specific Agents</label>
                  {/* Search */}
                  <div className="relative mb-2">
                    <input
                      type="text"
                      placeholder="Search agents..."
                      value={agentSearch}
                      onChange={e => setAgentSearch(e.target.value)}
                      className="w-full px-3 py-1.5 pr-8 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-sky-500"
                    />
                    {agentSearch && (
                      <button
                        onClick={() => setAgentSearch('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        ×
                      </button>
                    )}
                  </div>
                  <div className="space-y-1.5 max-h-40 overflow-auto border border-gray-200 rounded-md bg-white p-2">
                    {agents.length === 0 ? (
                      <p className="text-xs text-gray-400 py-2 px-1">No agents available</p>
                    ) : agents.filter(a => (a.name || a.id).toLowerCase().includes(agentSearch.toLowerCase())).length === 0 ? (
                      <p className="text-xs text-gray-400 py-2 px-1">No agents match search</p>
                    ) : (
                      agents.filter(a => (a.name || a.id).toLowerCase().includes(agentSearch.toLowerCase())).map(agent => (
                        <label key={agent.id} className="flex items-center gap-2 px-1 py-1 hover:bg-gray-50 rounded cursor-pointer">
                          <input
                            type="checkbox"
                            checked={formData.targeting.agents.includes(agent.id)}
                            onChange={e => {
                              const newAgents = e.target.checked
                                ? [...formData.targeting.agents, agent.id]
                                : formData.targeting.agents.filter(a => a !== agent.id)
                              handleTargetingChange('agents', newAgents)
                            }}
                            className="rounded"
                          />
                          <span className="text-sm text-gray-700">{agent.name || agent.id}</span>
                        </label>
                      ))
                    )}
                  </div>
                </div>

                {/* Groups */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-2">Groups</label>
                  {/* Search */}
                  <div className="relative mb-2">
                    <input
                      type="text"
                      placeholder="Search groups..."
                      value={groupSearch}
                      onChange={e => setGroupSearch(e.target.value)}
                      className="w-full px-3 py-1.5 pr-8 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-sky-500"
                    />
                    {groupSearch && (
                      <button
                        onClick={() => setGroupSearch('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        ×
                      </button>
                    )}
                  </div>
                  <div className="space-y-1.5 max-h-40 overflow-auto border border-gray-200 rounded-md bg-white p-2">
                    {groups.length === 0 ? (
                      <p className="text-xs text-gray-400 py-2 px-1">No groups available</p>
                    ) : groups.filter(g => g.name.toLowerCase().includes(groupSearch.toLowerCase())).length === 0 ? (
                      <p className="text-xs text-gray-400 py-2 px-1">No groups match search</p>
                    ) : (
                      groups.filter(g => g.name.toLowerCase().includes(groupSearch.toLowerCase())).map(group => (
                        <label key={group.name} className="flex items-center gap-2 px-1 py-1 hover:bg-gray-50 rounded cursor-pointer">
                          <input
                            type="checkbox"
                            checked={formData.targeting.groups.includes(group.name)}
                            onChange={e => {
                              const newGroups = e.target.checked
                                ? [...formData.targeting.groups, group.name]
                                : formData.targeting.groups.filter(g => g !== group.name)
                              handleTargetingChange('groups', newGroups)
                            }}
                            className="rounded"
                          />
                          <span className="text-sm text-gray-700">{group.name}</span>
                        </label>
                      ))
                    )}
                  </div>
                </div>

                {/* Communities */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-2">Communities</label>
                  <div className="relative mb-2">
                    <input
                      type="text"
                      placeholder="Search communities..."
                      value={communitySearch}
                      onChange={e => setCommunitySearch(e.target.value)}
                      className="w-full px-3 py-1.5 pr-8 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-sky-500"
                    />
                    {communitySearch && (
                      <button onClick={() => setCommunitySearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">×</button>
                    )}
                  </div>
                  <div className="space-y-1.5 max-h-40 overflow-auto border border-gray-200 rounded-md bg-white p-2">
                    {communities.filter(c => c.name.toLowerCase().includes(communitySearch.toLowerCase())).map(community => (
                      <label key={community.name} className="flex items-center gap-2 px-1 py-1 hover:bg-gray-50 rounded cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.targeting.communities.includes(community.name)}
                          onChange={e => {
                            const newCommunities = e.target.checked
                              ? [...formData.targeting.communities, community.name]
                              : formData.targeting.communities.filter(c => c !== community.name)
                            handleTargetingChange('communities', newCommunities)
                          }}
                          className="rounded"
                        />
                        <span className="text-sm text-gray-700">{community.name}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Tags */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-2">Tags</label>

                  {/* Selected tags */}
                  {formData.targeting.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {formData.targeting.tags.map(tag => (
                        <span
                          key={tag}
                          className="inline-flex items-center gap-1 px-2 py-1 bg-sky-100 text-sky-700 text-xs rounded"
                        >
                          {tag}
                          <button
                            onClick={() => handleTargetingChange('tags', formData.targeting.tags.filter(t => t !== tag))}
                            className="hover:text-sky-900"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Available tags to select */}
                  {allTags.length > 0 && (
                    <div className="space-y-1.5 max-h-32 overflow-auto border border-gray-200 rounded-md bg-white p-2">
                      {allTags.filter(tag => !formData.targeting.tags.includes(tag)).map(tag => (
                        <label key={tag} className="flex items-center gap-2 px-1 py-1 hover:bg-gray-50 rounded cursor-pointer">
                          <input
                            type="checkbox"
                            checked={false}
                            onChange={() => handleTargetingChange('tags', [...formData.targeting.tags, tag])}
                            className="rounded"
                          />
                          <span className="text-sm text-gray-700">{tag}</span>
                        </label>
                      ))}
                    </div>
                  )}

                  {/* Manual tag input */}
                  <input
                    type="text"
                    placeholder="Type custom tag and press Enter..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 mt-2"
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        const input = e.currentTarget
                        const newTag = input.value.trim()
                        if (newTag && !formData.targeting.tags.includes(newTag)) {
                          handleTargetingChange('tags', [...formData.targeting.tags, newTag])
                          input.value = ''
                        }
                      }
                    }}
                  />
                </div>
              </div>
              {validationErrors.targeting && (
                <p className="text-xs text-red-600 mt-1">{validationErrors.targeting}</p>
              )}
            </div>

            {/* Workflow Content */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Workflow Content (Markdown) *
              </label>
              <textarea
                value={formData.content}
                onChange={e => {
                  setFormData({ ...formData, content: e.target.value })
                  if (validationErrors.content) {
                    setValidationErrors({ ...validationErrors, content: undefined })
                  }
                }}
                className={`w-full px-3 py-2 border rounded-md text-sm font-mono focus:outline-none focus:ring-2 ${
                  validationErrors.content ? 'border-red-300 focus:ring-red-500' : 'border-gray-300 focus:ring-sky-500'
                }`}
                rows={10}
                placeholder="# Task Description&#10;&#10;Write the instructions for what agents should do..."
              />
              {validationErrors.content && (
                <p className="text-xs text-red-600 mt-1">{validationErrors.content}</p>
              )}
              <p className="text-xs text-gray-500 mt-1">
                This content will be sent to all matching agents when the workflow executes
              </p>
            </div>

            {/* Enabled */}
            <div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.enabled}
                  onChange={e => setFormData({ ...formData, enabled: e.target.checked })}
                  className="rounded"
                />
                <span className="text-sm text-gray-700">Enable workflow immediately</span>
              </label>
            </div>
          </div>

          {/* Footer */}
          <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4 flex items-center justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
              disabled={saving}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-sky-600 text-white text-sm font-medium rounded-md hover:bg-sky-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={saving || !!cronError}
            >
              {saving ? 'Saving...' : mode === 'create' ? 'Create Workflow' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
