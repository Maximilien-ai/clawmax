import React, { useState } from 'react'

// ============================================================================
// Types
// ============================================================================

interface WizardAgent {
  id: string
  name: string
  role: string
  tags: string[]
  skills: string[]
  count: number // how many instances (for scalable roles)
}

interface WizardCommunity {
  name: string
  description: string
}

interface WizardGroup {
  name: string
  description: string
  community: string
}

interface WizardWorkflow {
  id: string
  name: string
  description: string
  schedule: string
  executionMode: 'automated' | 'managed'
  targetAgents: string[]
  content: string
}

interface WizardState {
  // Step 1: Team Type
  domain: 'business' | 'technical' | 'personal' | 'custom'
  teamDescription: string
  teamName: string

  // Step 2: Team Composition
  agents: WizardAgent[]

  // Step 3: Communication
  communities: WizardCommunity[]
  groups: WizardGroup[]

  // Step 4: Workflows
  workflows: WizardWorkflow[]

  // Metadata
  description: string
  tags: string[]
  author: string
}

const DOMAIN_PRESETS: Record<string, { label: string; icon: string; description: string; examples: string[] }> = {
  business: { label: 'Business', icon: '💼', description: 'Sales, support, HR, marketing, legal teams', examples: ['Sales team with SDRs and account execs', 'Customer support with escalation'] },
  technical: { label: 'Technical', icon: '⚙️', description: 'Engineering, data, DevOps, QA teams', examples: ['Dev team with QA and DevOps', 'Data pipeline team with analysts'] },
  personal: { label: 'Personal', icon: '📚', description: 'Research, writing, study, planning', examples: ['Student research group', 'Technical writing team'] },
  custom: { label: 'Custom', icon: '✨', description: 'Describe any team from scratch', examples: [] },
}

const INITIAL_STATE: WizardState = {
  domain: 'custom',
  teamDescription: '',
  teamName: '',
  agents: [],
  communities: [],
  groups: [],
  workflows: [],
  description: '',
  tags: [],
  author: '',
}

// ============================================================================
// Component
// ============================================================================

interface TemplateWizardProps {
  onClose: () => void
  onSave: (template: any) => Promise<void>
  onApply: (template: any) => void
  showSuccess: (msg: string) => void
  showError: (msg: string) => void
}

export default function TemplateWizard({ onClose, onSave, onApply, showSuccess, showError }: TemplateWizardProps) {
  const [step, setStep] = useState(0)
  const [state, setState] = useState<WizardState>(INITIAL_STATE)
  const [aiGenerating, setAiGenerating] = useState(false)
  const [editingJson, setEditingJson] = useState(false)
  const [jsonDraft, setJsonDraft] = useState('')

  const steps = ['Team Type', 'Composition', 'Communication', 'Workflows', 'Preview']

  const update = (partial: Partial<WizardState>) => setState(prev => ({ ...prev, ...partial }))

  // ---- AI Generate ----
  const handleAiGenerate = async () => {
    if (!state.teamDescription.trim()) return
    setAiGenerating(true)
    try {
      const resp = await fetch('/api/templates/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: state.teamDescription }),
      })
      const data = await resp.json()
      if (resp.ok && data.template) {
        const t = data.template
        update({
          teamName: t.name || '',
          description: t.description || '',
          tags: t.tags || [],
          author: t.author || 'ClawMax AI',
          agents: (t.agents || []).map((a: any) => ({
            id: a.id,
            name: a.name || a.id,
            role: a.role || '',
            tags: a.tags || [],
            skills: a.skills || [],
            count: 1,
          })),
          communities: (t.communities || []).map((c: any) => ({
            name: c.name,
            description: c.description || '',
          })),
          groups: (t.groups || []).map((g: any) => ({
            name: g.name,
            description: g.description || '',
            community: g.community || (t.communities?.[0]?.name || ''),
          })),
          workflows: (t.workflows || []).map((w: any) => ({
            id: w.id || w.name?.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'workflow',
            name: w.name || '',
            description: w.description || '',
            schedule: w.schedule || 'manual',
            executionMode: w.executionMode || 'managed',
            targetAgents: w.targeting?.agents || [],
            content: w.content || '',
          })),
        })
        setStep(4) // jump to preview
      } else {
        showError(data.error || 'Failed to generate template')
      }
    } catch {
      showError('Network error generating template')
    } finally {
      setAiGenerating(false)
    }
  }

  // ---- Build final template object ----
  const buildTemplate = () => {
    // Expand agents with count > 1
    const expandedAgents: any[] = []
    for (const agent of state.agents) {
      if (agent.count <= 1) {
        expandedAgents.push({
          id: agent.id,
          name: agent.name,
          role: agent.role,
          tags: agent.tags,
          skills: agent.skills.length > 0 ? agent.skills : undefined,
        })
      } else {
        for (let i = 1; i <= agent.count; i++) {
          expandedAgents.push({
            id: `${agent.id}-${i}`,
            name: `${agent.name} ${i}`,
            role: agent.role,
            tags: agent.tags,
            skills: agent.skills.length > 0 ? agent.skills : undefined,
          })
        }
      }
    }

    return {
      name: state.teamName,
      type: 'organization' as const,
      version: '1.0.0',
      description: state.description,
      author: state.author || 'ClawMax AI',
      tags: state.tags,
      agents: expandedAgents,
      communities: state.communities.length > 0 ? state.communities : undefined,
      groups: state.groups.length > 0 ? state.groups.map(g => ({
        name: g.name,
        description: g.description,
        community: g.community || undefined,
      })) : undefined,
      workflows: state.workflows.length > 0 ? state.workflows.map(w => ({
        id: w.id,
        name: w.name,
        description: w.description,
        schedule: w.schedule,
        enabled: true,
        executionMode: w.executionMode,
        targeting: {
          communities: [],
          groups: [],
          tags: [],
          agents: w.targetAgents,
        },
        content: w.content,
      })) : undefined,
    }
  }

  // ---- Helpers ----
  const addAgent = () => {
    update({
      agents: [...state.agents, { id: '', name: '', role: '', tags: [], skills: [], count: 1 }],
    })
  }

  const updateAgent = (idx: number, partial: Partial<WizardAgent>) => {
    const agents = [...state.agents]
    agents[idx] = { ...agents[idx], ...partial }
    // Auto-generate id from name
    if (partial.name !== undefined && !agents[idx].id) {
      agents[idx].id = partial.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    }
    update({ agents })
  }

  const removeAgent = (idx: number) => {
    update({ agents: state.agents.filter((_, i) => i !== idx) })
  }

  const addCommunity = () => {
    update({
      communities: [...state.communities, { name: '', description: '' }],
    })
  }

  const addGroup = () => {
    update({
      groups: [...state.groups, { name: '', description: '', community: state.communities[0]?.name || '' }],
    })
  }

  const addWorkflow = () => {
    update({
      workflows: [...state.workflows, {
        id: '',
        name: '',
        description: '',
        schedule: 'manual',
        executionMode: 'managed',
        targetAgents: [],
        content: '',
      }],
    })
  }

  // ---- Styles ----
  const inputCls = 'w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-200 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500'
  const btnPrimary = 'px-4 py-2 text-sm bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors font-medium'
  const btnSecondary = 'px-4 py-2 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors'
  const labelCls = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'

  // ---- Render Steps ----
  const renderStep0 = () => (
    <div>
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">What kind of team?</h3>

      <div className="grid grid-cols-2 gap-3 mb-6">
        {Object.entries(DOMAIN_PRESETS).map(([key, preset]) => (
          <button
            key={key}
            onClick={() => update({ domain: key as WizardState['domain'] })}
            className={`p-4 rounded-lg border text-left transition-all ${
              state.domain === key
                ? 'border-purple-400 bg-purple-50 dark:bg-purple-900/20 ring-2 ring-purple-200 dark:ring-purple-700'
                : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
            }`}
          >
            <div className="text-2xl mb-1">{preset.icon}</div>
            <div className="font-medium text-gray-900 dark:text-gray-100">{preset.label}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">{preset.description}</div>
          </button>
        ))}
      </div>

      <div className="mb-4">
        <label className={labelCls}>Describe your team</label>
        <textarea
          value={state.teamDescription}
          onChange={e => update({ teamDescription: e.target.value })}
          placeholder="e.g., A customer support team with 3 support agents, an escalation engineer, and a knowledge base manager..."
          rows={3}
          className={inputCls + ' resize-y'}
        />
      </div>

      {DOMAIN_PRESETS[state.domain]?.examples.length > 0 && (
        <div className="mb-4">
          <p className="text-xs text-gray-400 mb-2">Quick examples:</p>
          <div className="flex flex-wrap gap-2">
            {DOMAIN_PRESETS[state.domain].examples.map(ex => (
              <button
                key={ex}
                onClick={() => update({ teamDescription: ex })}
                className="text-xs px-2 py-1 rounded bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 border border-purple-200 dark:border-purple-700 hover:bg-purple-100 dark:hover:bg-purple-900/50 transition-colors"
              >
                {ex}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-between items-center pt-4 border-t border-gray-200 dark:border-gray-700">
        <button onClick={onClose} className={btnSecondary}>Cancel</button>
        <div className="flex gap-2">
          <button
            onClick={handleAiGenerate}
            disabled={aiGenerating || !state.teamDescription.trim()}
            className="px-4 py-2 text-sm bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-md hover:from-purple-700 hover:to-indigo-700 disabled:from-gray-300 disabled:to-gray-400 dark:disabled:from-gray-600 dark:disabled:to-gray-700 disabled:cursor-not-allowed transition-all font-medium"
          >
            {aiGenerating ? 'Generating...' : '✨ AI Generate All'}
          </button>
          <button onClick={() => setStep(1)} className={btnPrimary}>
            Manual Setup →
          </button>
        </div>
      </div>
    </div>
  )

  const renderStep1 = () => (
    <div>
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Team Composition</h3>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <label className={labelCls}>Team Name</label>
          <input
            type="text"
            value={state.teamName}
            onChange={e => update({ teamName: e.target.value })}
            placeholder="e.g., Customer Support Team"
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Author</label>
          <input
            type="text"
            value={state.author}
            onChange={e => update({ author: e.target.value })}
            placeholder="Your name"
            className={inputCls}
          />
        </div>
      </div>

      <div className="mb-2">
        <label className={labelCls}>Description</label>
        <textarea
          value={state.description}
          onChange={e => update({ description: e.target.value })}
          placeholder="What does this team do?"
          rows={2}
          className={inputCls + ' resize-y'}
        />
      </div>

      <div className="mb-2">
        <label className={labelCls}>Tags (comma-separated)</label>
        <input
          type="text"
          value={state.tags.join(', ')}
          onChange={e => update({ tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean) })}
          placeholder="support, customer-service, sla"
          className={inputCls}
        />
      </div>

      <div className="mt-6 mb-3 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Agents ({state.agents.length})</h4>
        <button onClick={addAgent} className="text-xs text-purple-600 hover:text-purple-700 font-medium">+ Add Agent</button>
      </div>

      {state.agents.length === 0 && (
        <div className="text-center py-8 text-gray-400 text-sm border border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
          No agents yet. Click "+ Add Agent" or go back and use AI Generate.
        </div>
      )}

      <div className="space-y-3 max-h-[40vh] overflow-y-auto">
        {state.agents.map((agent, idx) => (
          <div key={idx} className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 bg-gray-50 dark:bg-gray-800/50">
            <div className="flex items-start gap-2">
              <div className="flex-1 grid grid-cols-3 gap-2">
                <div>
                  <input
                    type="text"
                    value={agent.name}
                    onChange={e => updateAgent(idx, { name: e.target.value })}
                    placeholder="Agent name"
                    className={inputCls + ' text-xs'}
                  />
                </div>
                <div>
                  <input
                    type="text"
                    value={agent.id}
                    onChange={e => updateAgent(idx, { id: e.target.value })}
                    placeholder="agent-id"
                    className={inputCls + ' text-xs font-mono'}
                  />
                </div>
                <div>
                  <input
                    type="text"
                    value={agent.role}
                    onChange={e => updateAgent(idx, { role: e.target.value })}
                    placeholder="Role description"
                    className={inputCls + ' text-xs'}
                  />
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <label className="text-[10px] text-gray-400">×</label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={agent.count}
                  onChange={e => updateAgent(idx, { count: parseInt(e.target.value) || 1 })}
                  className="w-12 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-200 text-xs px-1.5 py-2 text-center"
                />
                <button onClick={() => removeAgent(idx)} className="text-red-400 hover:text-red-600 text-xs ml-1">✕</button>
              </div>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <input
                type="text"
                value={agent.tags.join(', ')}
                onChange={e => updateAgent(idx, { tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean) })}
                placeholder="Tags (comma-separated)"
                className={inputCls + ' text-xs'}
              />
              <input
                type="text"
                value={agent.skills.join(', ')}
                onChange={e => updateAgent(idx, { skills: e.target.value.split(',').map(t => t.trim()).filter(Boolean) })}
                placeholder="Skills (comma-separated)"
                className={inputCls + ' text-xs'}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-between items-center pt-4 mt-4 border-t border-gray-200 dark:border-gray-700">
        <button onClick={() => setStep(0)} className={btnSecondary}>← Back</button>
        <button onClick={() => setStep(2)} disabled={state.agents.length === 0} className={btnPrimary}>
          Communication →
        </button>
      </div>
    </div>
  )

  const renderStep2 = () => (
    <div>
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Communication</h3>

      {/* Communities */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Communities ({state.communities.length})</h4>
          <button onClick={addCommunity} className="text-xs text-purple-600 hover:text-purple-700 font-medium">+ Add Community</button>
        </div>
        {state.communities.length === 0 && (
          <div className="text-center py-4 text-gray-400 text-xs border border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
            Optional. Communities group agents for broader coordination.
          </div>
        )}
        <div className="space-y-2">
          {state.communities.map((comm, idx) => (
            <div key={idx} className="flex gap-2 items-center">
              <input
                type="text"
                value={comm.name}
                onChange={e => {
                  const communities = [...state.communities]
                  communities[idx] = { ...communities[idx], name: e.target.value }
                  update({ communities })
                }}
                placeholder="Community name"
                className={inputCls + ' text-xs flex-1'}
              />
              <input
                type="text"
                value={comm.description}
                onChange={e => {
                  const communities = [...state.communities]
                  communities[idx] = { ...communities[idx], description: e.target.value }
                  update({ communities })
                }}
                placeholder="Description"
                className={inputCls + ' text-xs flex-1'}
              />
              <button onClick={() => update({ communities: state.communities.filter((_, i) => i !== idx) })} className="text-red-400 hover:text-red-600 text-xs shrink-0">✕</button>
            </div>
          ))}
        </div>
      </div>

      {/* Groups */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Groups ({state.groups.length})</h4>
          <button onClick={addGroup} className="text-xs text-purple-600 hover:text-purple-700 font-medium">+ Add Group</button>
        </div>
        {state.groups.length === 0 && (
          <div className="text-center py-4 text-gray-400 text-xs border border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
            Optional. Groups are focused channels within a community.
          </div>
        )}
        <div className="space-y-2">
          {state.groups.map((group, idx) => (
            <div key={idx} className="flex gap-2 items-center">
              <input
                type="text"
                value={group.name}
                onChange={e => {
                  const groups = [...state.groups]
                  groups[idx] = { ...groups[idx], name: e.target.value }
                  update({ groups })
                }}
                placeholder="Group name"
                className={inputCls + ' text-xs flex-1'}
              />
              <input
                type="text"
                value={group.description}
                onChange={e => {
                  const groups = [...state.groups]
                  groups[idx] = { ...groups[idx], description: e.target.value }
                  update({ groups })
                }}
                placeholder="Description"
                className={inputCls + ' text-xs flex-1'}
              />
              {state.communities.length > 0 && (
                <select
                  value={group.community}
                  onChange={e => {
                    const groups = [...state.groups]
                    groups[idx] = { ...groups[idx], community: e.target.value }
                    update({ groups })
                  }}
                  className={inputCls + ' text-xs w-36'}
                >
                  <option value="">No community</option>
                  {state.communities.map(c => (
                    <option key={c.name} value={c.name}>{c.name}</option>
                  ))}
                </select>
              )}
              <button onClick={() => update({ groups: state.groups.filter((_, i) => i !== idx) })} className="text-red-400 hover:text-red-600 text-xs shrink-0">✕</button>
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-between items-center pt-4 mt-6 border-t border-gray-200 dark:border-gray-700">
        <button onClick={() => setStep(1)} className={btnSecondary}>← Back</button>
        <button onClick={() => setStep(3)} className={btnPrimary}>
          Workflows →
        </button>
      </div>
    </div>
  )

  const renderStep3 = () => (
    <div>
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Workflows</h3>

      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-gray-500">Define recurring or one-time workflows for this team.</p>
        <button onClick={addWorkflow} className="text-xs text-purple-600 hover:text-purple-700 font-medium">+ Add Workflow</button>
      </div>

      {state.workflows.length === 0 && (
        <div className="text-center py-8 text-gray-400 text-sm border border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
          No workflows yet. Optional — you can add workflows later from the Workflows page.
        </div>
      )}

      <div className="space-y-3 max-h-[50vh] overflow-y-auto">
        {state.workflows.map((wf, idx) => (
          <div key={idx} className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 bg-gray-50 dark:bg-gray-800/50">
            <div className="flex items-start gap-2 mb-2">
              <div className="flex-1 grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={wf.name}
                  onChange={e => {
                    const workflows = [...state.workflows]
                    workflows[idx] = {
                      ...workflows[idx],
                      name: e.target.value,
                      id: e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
                    }
                    update({ workflows })
                  }}
                  placeholder="Workflow name"
                  className={inputCls + ' text-xs'}
                />
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={wf.schedule}
                    onChange={e => {
                      const workflows = [...state.workflows]
                      workflows[idx] = { ...workflows[idx], schedule: e.target.value }
                      update({ workflows })
                    }}
                    placeholder="manual or cron (0 9 * * *)"
                    className={inputCls + ' text-xs flex-1 font-mono'}
                  />
                  <select
                    value={wf.executionMode}
                    onChange={e => {
                      const workflows = [...state.workflows]
                      workflows[idx] = { ...workflows[idx], executionMode: e.target.value as 'automated' | 'managed' }
                      update({ workflows })
                    }}
                    className={inputCls + ' text-xs w-28'}
                  >
                    <option value="managed">Managed</option>
                    <option value="automated">Automated</option>
                  </select>
                </div>
              </div>
              <button onClick={() => update({ workflows: state.workflows.filter((_, i) => i !== idx) })} className="text-red-400 hover:text-red-600 text-xs shrink-0 mt-2">✕</button>
            </div>
            <textarea
              value={wf.content}
              onChange={e => {
                const workflows = [...state.workflows]
                workflows[idx] = { ...workflows[idx], content: e.target.value }
                update({ workflows })
              }}
              placeholder="Workflow instructions (markdown)..."
              rows={3}
              className={inputCls + ' text-xs resize-y'}
            />
          </div>
        ))}
      </div>

      <div className="flex justify-between items-center pt-4 mt-4 border-t border-gray-200 dark:border-gray-700">
        <button onClick={() => setStep(2)} className={btnSecondary}>← Back</button>
        <button onClick={() => setStep(4)} className={btnPrimary}>
          Preview →
        </button>
      </div>
    </div>
  )

  const renderStep4 = () => {
    const template = buildTemplate()
    const agentCount = template.agents?.length || 0
    const communityCount = template.communities?.length || 0
    const groupCount = template.groups?.length || 0
    const workflowCount = template.workflows?.length || 0

    return (
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Preview</h3>
          <button
            onClick={() => {
              if (editingJson) {
                // Try to parse and apply
                try {
                  const parsed = JSON.parse(jsonDraft)
                  // Reverse-map into wizard state
                  update({
                    teamName: parsed.name || '',
                    description: parsed.description || '',
                    tags: parsed.tags || [],
                    author: parsed.author || '',
                    agents: (parsed.agents || []).map((a: any) => ({
                      id: a.id, name: a.name || a.id, role: a.role || '',
                      tags: a.tags || [], skills: a.skills || [], count: 1,
                    })),
                    communities: (parsed.communities || []).map((c: any) => ({
                      name: c.name, description: c.description || '',
                    })),
                    groups: (parsed.groups || []).map((g: any) => ({
                      name: g.name, description: g.description || '', community: g.community || '',
                    })),
                  })
                  setEditingJson(false)
                } catch {
                  showError('Invalid JSON')
                }
              } else {
                setJsonDraft(JSON.stringify(template, null, 2))
                setEditingJson(true)
              }
            }}
            className="text-xs text-purple-600 hover:text-purple-700 font-medium"
          >
            {editingJson ? 'Apply JSON' : 'Edit as JSON'}
          </button>
        </div>

        {editingJson ? (
          <textarea
            value={jsonDraft}
            onChange={e => setJsonDraft(e.target.value)}
            rows={20}
            className={inputCls + ' text-xs font-mono resize-y'}
          />
        ) : (
          <>
            {/* Template header */}
            <div className="mb-4 p-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-700 rounded-lg">
              <h4 className="text-sm font-bold text-purple-900 dark:text-purple-200">{state.teamName || 'Untitled Team'}</h4>
              <p className="text-xs text-purple-700 dark:text-purple-400 mt-1">{state.description || 'No description'}</p>
              <div className="flex gap-4 mt-3 text-xs text-purple-600 dark:text-purple-300">
                <span>{agentCount} agent{agentCount !== 1 ? 's' : ''}</span>
                <span>{communityCount} communit{communityCount !== 1 ? 'ies' : 'y'}</span>
                <span>{groupCount} group{groupCount !== 1 ? 's' : ''}</span>
                <span>{workflowCount} workflow{workflowCount !== 1 ? 's' : ''}</span>
              </div>
              {state.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {state.tags.map(tag => (
                    <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-800/40 text-purple-600 dark:text-purple-300">{tag}</span>
                  ))}
                </div>
              )}
            </div>

            {/* Agents list */}
            {agentCount > 0 && (
              <div className="mb-4">
                <h4 className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-2">Agents</h4>
                <div className="space-y-1">
                  {template.agents.map((a: any, i: number) => (
                    <div key={i} className="flex items-center gap-2 text-xs py-1 px-2 rounded bg-gray-50 dark:bg-gray-800/50">
                      <span className="font-mono text-purple-600 dark:text-purple-400 shrink-0">{a.id}</span>
                      <span className="text-gray-400">—</span>
                      <span className="text-gray-700 dark:text-gray-300 truncate">{a.role}</span>
                      {a.skills?.length > 0 && (
                        <span className="text-gray-400 shrink-0">({a.skills.join(', ')})</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Communities & Groups */}
            {(communityCount > 0 || groupCount > 0) && (
              <div className="mb-4">
                <h4 className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-2">Communication</h4>
                <div className="space-y-1 text-xs">
                  {(template.communities || []).map((c: any, i: number) => (
                    <div key={`c-${i}`} className="py-1 px-2 rounded bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300">
                      Community: {c.name}
                    </div>
                  ))}
                  {(template.groups || []).map((g: any, i: number) => (
                    <div key={`g-${i}`} className="py-1 px-2 rounded bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300">
                      Group: {g.name} {g.community && <span className="text-green-500">({g.community})</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Workflows */}
            {workflowCount > 0 && (
              <div className="mb-4">
                <h4 className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-2">Workflows</h4>
                <div className="space-y-1 text-xs">
                  {(template.workflows || []).map((w: any, i: number) => (
                    <div key={i} className="py-1 px-2 rounded bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300 flex items-center gap-2">
                      <span className="font-medium">{w.name}</span>
                      <span className="font-mono text-orange-500">{w.schedule}</span>
                      <span className="text-orange-400">{w.executionMode}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        <div className="flex justify-between items-center pt-4 mt-4 border-t border-gray-200 dark:border-gray-700">
          <button onClick={() => setStep(state.agents.length > 0 && !aiGenerating ? 3 : 0)} className={btnSecondary}>← Edit</button>
          <div className="flex gap-2">
            <button
              onClick={async () => {
                const t = buildTemplate()
                await onSave(t)
              }}
              disabled={!state.teamName.trim() || state.agents.length === 0}
              className={btnPrimary}
            >
              Save Template
            </button>
            <button
              onClick={() => {
                const t = buildTemplate()
                onApply(t)
              }}
              disabled={!state.teamName.trim() || state.agents.length === 0}
              className="px-4 py-2 text-sm bg-sky-600 text-white rounded-md hover:bg-sky-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors font-medium"
            >
              Apply Now
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ---- Main Render ----
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => !aiGenerating && onClose()}>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Header with step indicators */}
        <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 z-10">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Template Wizard</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg" disabled={aiGenerating}>✕</button>
          </div>
          <div className="flex items-center gap-1">
            {steps.map((label, idx) => (
              <React.Fragment key={idx}>
                <button
                  onClick={() => setStep(idx)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                    idx === step
                      ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300'
                      : idx < step
                        ? 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 cursor-pointer hover:bg-green-100'
                        : 'text-gray-400 dark:text-gray-500'
                  }`}
                >
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                    idx === step ? 'bg-purple-600 text-white' : idx < step ? 'bg-green-500 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-400'
                  }`}>
                    {idx < step ? '✓' : idx + 1}
                  </span>
                  <span className="hidden sm:inline">{label}</span>
                </button>
                {idx < steps.length - 1 && (
                  <div className={`flex-1 h-0.5 rounded ${idx < step ? 'bg-green-300 dark:bg-green-700' : 'bg-gray-200 dark:bg-gray-700'}`} />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Step content */}
        <div className="p-6">
          {step === 0 && renderStep0()}
          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
          {step === 4 && renderStep4()}
        </div>
      </div>
    </div>
  )
}
