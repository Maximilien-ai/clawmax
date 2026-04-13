import React, { useEffect, useMemo, useRef, useState } from 'react'
import { hasAiGenerationAccess, readStoredByokKeys } from '../lib/byok'
import { readSharedSecrets } from '../lib/localSecrets'
import { useAuth } from '../contexts/AuthContext'

// ============================================================================
// Types
// ============================================================================

interface WizardAgent {
  id: string
  name: string
  role: string
  tags: string[]
  skills: string[]
  communities?: string[]
  groups?: string[]
  count: number // how many instances (for scalable roles)
}

interface WizardCommunity {
  name: string
  description: string
  tags?: string[]
}

interface WizardGroup {
  name: string
  description: string
  community: string
  tags?: string[]
}

interface WizardWorkflow {
  id: string
  name: string
  description: string
  schedule: string
  executionMode: 'automated' | 'managed'
  scaling?: 'singleton' | 'parallel'
  parallelism?: number
  targetAgents: string[]
  targetCommunities?: string[]
  targetGroups?: string[]
  tags?: string[]
  dependsOn?: string[]
  content: string
}

interface WorkflowFormField {
  label: string
  type: 'text' | 'checkbox' | 'select'
  options: string[]
  defaultValue: string
}

interface WizardTeamParameter {
  agentId: string
  label: string
  default: number
  min: number
  max: number
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

  // Optional scalable team-size controls
  parameters: WizardTeamParameter[]

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
  parameters: [],
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
  initialTemplate?: any | null
}

type FocusableField = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'workflow'
}

function extractRunInputSections(content: string) {
  if (!content) return ''
  const runInputs = content.match(/## Run Inputs[\s\S]*?(?=\n## |\s*$)/)?.[0] || ''
  const inputNotes = content.match(/## Input Notes[\s\S]*?(?=\n## |\s*$)/)?.[0] || ''
  return [runInputs.trim(), inputNotes.trim()].filter(Boolean).join('\n\n')
}

function stripRunInputSections(content: string) {
  return (content || '')
    .replace(/\n?## Run Inputs[\s\S]*?(?=\n## |\s*$)/g, '')
    .replace(/\n?## Input Notes[\s\S]*?(?=\n## |\s*$)/g, '')
    .trim()
}

function buildSuggestedWorkflows(input: {
  teamName: string
  teamDescription: string
  workflowGoal: string
  agentIds: string[]
  targetCommunity?: string
  targetGroup?: string
  tags?: string[]
}): WizardWorkflow[] {
  const goal = (input.workflowGoal || input.teamDescription || input.teamName || 'team operations').trim()
  const targetAgents = input.agentIds.slice(0, 4)
  const titleBase = input.teamName.trim() || 'Team'
  const detail = goal.endsWith('.') ? goal.slice(0, -1) : goal
  const targetTags = (input.tags || []).slice(0, 2)
  const workflowPrefix = slugify(titleBase)

  const suggestions = [
    {
      id: `${workflowPrefix}-kickoff`,
      name: `${titleBase} Kickoff`,
      description: 'Start a new run with goals, constraints, and priorities.',
      schedule: 'manual',
      executionMode: 'managed' as const,
      scaling: 'singleton' as const,
      parallelism: 1,
      dependsOn: [] as string[],
      content: `# ${titleBase} Kickoff\n\n1. Review the latest request: ${detail}\n2. Clarify goals, deadlines, constraints, and target audience\n3. Assign work across the team and identify blockers\n4. Post a short kickoff plan and owners for each next step in the main team group/community\n\n## Output\n- Produce a visible kickoff brief or plan\n- Confirm in the team channels what the team will do next`,
    },
    {
      id: `${workflowPrefix}-execution-review`,
      name: `${titleBase} Execution Review`,
      description: 'Review current work, adjust priorities, and unblock execution.',
      schedule: 'manual',
      executionMode: 'managed' as const,
      scaling: 'parallel' as const,
      parallelism: 3,
      dependsOn: [`${workflowPrefix}-kickoff`],
      content: `# ${titleBase} Execution Review\n\n1. Review work completed so far for: ${detail}\n2. Identify what is working, what is blocked, and what needs revision\n3. Re-prioritize tasks, budget, or effort as needed\n4. Post the updated plan and next actions in the working group/community\n\n## Output\n- Produce a concrete intermediate artifact such as a revised brief, shortlist, recommendation set, draft, or checklist\n- Share a short summary of that artifact in the team channels`,
    },
    {
      id: `${workflowPrefix}-weekly-summary`,
      name: `${titleBase} Weekly Summary`,
      description: 'Summarize outputs, decisions, and next recommendations.',
      schedule: '0 16 * * 5',
      executionMode: 'automated' as const,
      scaling: 'singleton' as const,
      parallelism: 1,
      dependsOn: [`${workflowPrefix}-execution-review`],
      content: `# ${titleBase} Weekly Summary\n\n1. Summarize progress, results, and key decisions for: ${detail}\n2. Capture wins, risks, and open questions\n3. Recommend the top next actions for the next run\n4. Publish a concise summary for stakeholders in the shared channels\n\n## Final Output\n- Produce the final summary, recommendation, or confirmation of delivery for this run\n- State clearly where the final output was posted, saved, or shared`,
    },
  ]

  return suggestions.map((workflow) => ({
    id: workflow.id || slugify(workflow.name),
    name: workflow.name,
    description: workflow.description,
    schedule: workflow.schedule,
    executionMode: workflow.executionMode,
    scaling: workflow.scaling,
    parallelism: workflow.parallelism,
    targetAgents,
    targetCommunities: input.targetCommunity ? [input.targetCommunity] : [],
    targetGroups: input.targetGroup ? [input.targetGroup] : [],
    tags: targetTags,
    dependsOn: workflow.dependsOn,
    content: workflow.content,
  }))
}

function getSkillSuggestionScore(
  skill: { name?: string; description?: string; tags?: string[] },
  context: string
): number {
  const normalizedContext = context.trim().toLowerCase()
  if (!normalizedContext) return 0

  const tokens = normalizedContext.split(/[^a-z0-9]+/).filter(Boolean)
  const name = (skill.name || '').toLowerCase()
  const description = (skill.description || '').toLowerCase()
  const tags = (skill.tags || []).map((tag) => tag.toLowerCase())

  let score = 0
  for (const token of tokens) {
    if (token.length < 3) continue
    if (name === token) score += 50
    if (name.includes(token)) score += 18
    if (description.includes(token)) score += 8
    if (tags.some((tag) => tag.includes(token))) score += 12
  }

  return score
}

function MultiValueInput({
  values,
  suggestions,
  placeholder,
  onChange,
  onFocus,
  onBlur,
  inputRef,
}: {
  values: string[]
  suggestions: string[]
  placeholder: string
  onChange: (next: string[]) => void
  onFocus?: () => void
  onBlur?: () => void
  inputRef?: (el: FocusableField | null) => void
}) {
  const [draft, setDraft] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)

  const normalizedValues = useMemo(
    () => new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean)),
    [values]
  )

  const filteredSuggestions = useMemo(() => {
    const q = draft.trim().toLowerCase()
    return suggestions
      .filter((suggestion) => suggestion.trim())
      .filter((suggestion) => !normalizedValues.has(suggestion.trim().toLowerCase()))
      .filter((suggestion) => !q || suggestion.toLowerCase().includes(q))
      .slice(0, 8)
  }, [draft, normalizedValues, suggestions])

  const commitValue = (raw: string) => {
    const value = raw.trim()
    if (!value) return
    if (normalizedValues.has(value.toLowerCase())) {
      setDraft('')
      return
    }
    onChange([...values, value])
    setDraft('')
    setShowSuggestions(true)
  }

  const removeValue = (value: string) => {
    onChange(values.filter((entry) => entry !== value))
  }

  return (
    <div className="relative">
      <div className="min-h-[2.5rem] rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-2 text-sm focus-within:ring-2 focus-within:ring-purple-500">
        <div className="flex flex-wrap gap-1.5">
          {values.map((value) => (
            <span
              key={value}
              className="inline-flex items-center gap-1 rounded-full bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-700 px-2 py-0.5 text-xs text-purple-700 dark:text-purple-300"
            >
              {value}
              <button
                type="button"
                onClick={() => removeValue(value)}
                className="text-purple-500 hover:text-purple-700 dark:hover:text-purple-200"
                title={`Remove ${value}`}
              >
                ×
              </button>
            </span>
          ))}
          <input
            ref={inputRef}
            type="text"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value)
              setShowSuggestions(true)
            }}
            onFocus={() => {
              onFocus?.()
              setShowSuggestions(true)
            }}
            onBlur={() => {
              window.setTimeout(() => setShowSuggestions(false), 120)
              onBlur?.()
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault()
                commitValue(draft)
              } else if (e.key === 'Backspace' && !draft && values.length > 0) {
                e.preventDefault()
                removeValue(values[values.length - 1])
              }
            }}
            placeholder={values.length === 0 ? placeholder : 'Add another…'}
            className="min-w-[10rem] flex-1 bg-transparent text-xs text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 outline-none"
          />
        </div>
      </div>
      {showSuggestions && filteredSuggestions.length > 0 && (
        <div className="absolute z-20 mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg">
          {filteredSuggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => commitValue(suggestion)}
              className="block w-full px-3 py-2 text-left text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function TemplateWizard({ onClose, onSave, onApply, showSuccess, showError, initialTemplate }: TemplateWizardProps) {
  const { config } = useAuth()
  const aiEnabled = hasAiGenerationAccess(config)
  const [step, setStep] = useState(0)
  const [state, setState] = useState<WizardState>(INITIAL_STATE)
  const [aiGenerating, setAiGenerating] = useState(false)
  const [editingJson, setEditingJson] = useState(false)
  const [jsonDraft, setJsonDraft] = useState('')
  const [focusedAgentField, setFocusedAgentField] = useState<string | null>(null)
  const [focusedCommField, setFocusedCommField] = useState<string | null>(null)
  const [focusedWorkflowField, setFocusedWorkflowField] = useState<string | null>(null)
  const [availableSkills, setAvailableSkills] = useState<Array<{ name: string; description?: string; tags?: string[] }>>([])
  const [availableSkillNames, setAvailableSkillNames] = useState<string[]>([])
  const [aiCronLoadingIndex, setAiCronLoadingIndex] = useState<number | null>(null)
  const [workflowCronHints, setWorkflowCronHints] = useState<Record<number, string>>({})
  const [workflowGoalPrompt, setWorkflowGoalPrompt] = useState('')
  const [showFullPrompt, setShowFullPrompt] = useState(false)
  const [editingPrompt, setEditingPrompt] = useState(false)
  const [promptDraft, setPromptDraft] = useState('')
  const [aiSuggestedName, setAiSuggestedName] = useState<string | null>(null)
  const [aiPreservedWorkflowInputs, setAiPreservedWorkflowInputs] = useState<string[]>([])
  const [formBuilderWorkflowIndex, setFormBuilderWorkflowIndex] = useState<number | null>(null)
  const [workflowFormFields, setWorkflowFormFields] = useState<WorkflowFormField[]>([])
  const fieldRefs = useRef<Record<string, FocusableField | null>>({})

  const steps = ['Team Type', 'Composition', 'Communication', 'Workflows', 'Preview']

  const update = (partial: Partial<WizardState>) => setState(prev => ({ ...prev, ...partial }))

  useEffect(() => {
    fetch('/api/skills')
      .then((resp) => (resp.ok ? resp.json() : null))
      .then((data) => {
        const skills = Array.isArray(data?.skills) ? data.skills : []
        const normalized = skills
          .map((skill: any) => ({
            name: skill.name,
            description: skill.description || '',
            tags: Array.isArray(skill.tags) ? skill.tags : [],
          }))
          .filter((skill: any) => skill.name)
        setAvailableSkills(normalized)
        setAvailableSkillNames(normalized.map((skill: any) => skill.name))
      })
      .catch(() => {
        setAvailableSkills([])
        setAvailableSkillNames([])
      })
  }, [])

  useEffect(() => {
    if (!initialTemplate) {
      setState(INITIAL_STATE)
      setStep(0)
      setAiSuggestedName(null)
      return
    }

    const sourceIsWorkspace = initialTemplate.source === 'workspace'
    setState({
      domain: 'custom',
      teamDescription: initialTemplate.metadata?.aiPrompt || initialTemplate.description || '',
      teamName: sourceIsWorkspace ? (initialTemplate.name || '') : `${initialTemplate.name || 'Template'} Copy`,
      description: initialTemplate.description || '',
      tags: initialTemplate.tags || [],
      author: initialTemplate.author || '',
      agents: (initialTemplate.agents || []).map((a: any) => ({
        id: a.id,
        name: a.name || a.id,
        role: a.role || '',
        tags: a.tags || [],
        skills: a.skills || [],
        communities: a.communities || [],
        groups: a.groups || [],
        count: 1,
      })),
      communities: (initialTemplate.communities || []).map((c: any) => ({
        name: c.name,
        description: c.description || '',
        tags: c.tags || [],
      })),
      groups: (initialTemplate.groups || []).map((g: any) => ({
        name: g.name,
        description: g.description || '',
        community: g.community || '',
        tags: g.tags || [],
      })),
      workflows: (initialTemplate.workflows || []).map((w: any) => ({
        id: w.id || w.name?.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'workflow',
        name: w.name || '',
        description: w.description || '',
        schedule: w.schedule || 'manual',
        executionMode: w.executionMode || 'managed',
        scaling: w.scaling || undefined,
        parallelism: typeof w.parallelism === 'number' ? w.parallelism : undefined,
        targetAgents: w.targeting?.agents || [],
        targetCommunities: w.targeting?.communities || [],
        targetGroups: w.targeting?.groups || [],
        tags: w.targeting?.tags || [],
        dependsOn: w.dependsOn || [],
        content: w.content || '',
      })),
      parameters: (initialTemplate.parameters || []).map((p: any) => ({
        agentId: p.agentId,
        label: p.label || p.agentId,
        default: typeof p.default === 'number' ? p.default : 2,
        min: typeof p.min === 'number' ? p.min : 1,
        max: typeof p.max === 'number' ? p.max : 10,
      })),
    })
    setStep(1)
  }, [initialTemplate])

  // ---- AI Generate ----
  const handleAiGenerate = async () => {
    if (!state.teamDescription.trim()) return
    if (!aiEnabled) {
      showError('AI generation needs browser-local keys or a usable shared execution path first. Open Workspaces Integrations or Keys & Secrets before generating.')
      return
    }
    setAiGenerating(true)
    try {
      const byok = readStoredByokKeys()
      const shared = {
        ...readSharedSecrets('global'),
        ...readSharedSecrets('workspace'),
      }
      const openai = (shared.OPENAI_API_KEY || byok.openai || '').trim()
      const anthropic = (shared.ANTHROPIC_API_KEY || byok.anthropic || '').trim()
      const resp = await fetch('/api/templates/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: state.teamDescription,
          byokKeys: (openai || anthropic) ? { openai, anthropic } : undefined,
        }),
      })
      const data = await resp.json()
      if (resp.ok && data.template) {
        const t = data.template
        const preservedTeamName = state.teamName.trim()
        const preservedInputs: string[] = []
        const mergedWorkflows = (t.workflows || []).map((w: any, idx: number) => {
          const currentWorkflow = state.workflows[idx]
          const currentInputSections = currentWorkflow ? extractRunInputSections(currentWorkflow.content || '') : ''
          const generatedInputSections = extractRunInputSections(w.content || '')
          const mergedContent = currentInputSections && (!generatedInputSections || currentInputSections !== generatedInputSections)
            ? [stripRunInputSections(w.content || ''), currentInputSections].filter(Boolean).join('\n\n')
            : (w.content || '')
          if (currentInputSections && mergedContent !== (w.content || '')) {
            preservedInputs.push(currentWorkflow?.name || w.name || `Workflow ${idx + 1}`)
          }
          return {
            id: w.id || slugify(w.name || 'workflow'),
            name: w.name || '',
            description: w.description || '',
            schedule: w.schedule || 'manual',
            executionMode: w.executionMode || 'managed',
            scaling: w.scaling || undefined,
            parallelism: typeof w.parallelism === 'number' ? w.parallelism : undefined,
            targetAgents: w.targeting?.agents || [],
            targetCommunities: w.targeting?.communities || [],
            targetGroups: w.targeting?.groups || [],
            tags: w.targeting?.tags || [],
            dependsOn: w.dependsOn || [],
            content: mergedContent,
          }
        })
        setAiSuggestedName(t.name && preservedTeamName && t.name !== preservedTeamName ? t.name : null)
        setAiPreservedWorkflowInputs(Array.from(new Set(preservedInputs)))
        update({
          teamName: preservedTeamName || t.name || '',
          description: t.description || '',
          tags: t.tags || [],
          author: t.author || 'ClawMax AI',
          agents: (t.agents || []).map((a: any) => ({
            id: a.id,
            name: a.name || a.id,
            role: a.role || '',
            tags: a.tags || [],
            skills: a.skills || [],
            communities: a.communities || [],
            groups: a.groups || [],
            count: 1,
          })),
          communities: (t.communities || []).map((c: any) => ({
            name: c.name,
            description: c.description || '',
            tags: c.tags || [],
          })),
          groups: (t.groups || []).map((g: any) => ({
            name: g.name,
            description: g.description || '',
            community: g.community || (t.communities?.[0]?.name || ''),
            tags: g.tags || [],
          })),
          workflows: mergedWorkflows,
          parameters: (t.parameters || []).map((p: any) => ({
            agentId: p.agentId,
            label: p.label || p.agentId,
            default: typeof p.default === 'number' ? p.default : 2,
            min: typeof p.min === 'number' ? p.min : 1,
            max: typeof p.max === 'number' ? p.max : 10,
          })),
        })
        setStep((t.workflows || []).length > 0 ? 4 : 3)
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
          communities: agent.communities && agent.communities.length > 0 ? agent.communities : undefined,
          groups: agent.groups && agent.groups.length > 0 ? agent.groups : undefined,
        })
      } else {
        for (let i = 1; i <= agent.count; i++) {
          expandedAgents.push({
            id: `${agent.id}-${i}`,
            name: `${agent.name} ${i}`,
            role: agent.role,
            tags: agent.tags,
            skills: agent.skills.length > 0 ? agent.skills : undefined,
            communities: agent.communities && agent.communities.length > 0 ? agent.communities : undefined,
            groups: agent.groups && agent.groups.length > 0 ? agent.groups : undefined,
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
      parameters: state.parameters.length > 0 ? state.parameters : undefined,
      metadata: {
        aiPrompt: state.teamDescription || undefined,
      },
      agents: expandedAgents,
      communities: state.communities.length > 0 ? state.communities : undefined,
      groups: state.groups.length > 0 ? state.groups.map(g => ({
        name: g.name,
        description: g.description,
        community: g.community || undefined,
        tags: g.tags,
      })) : undefined,
      workflows: state.workflows.length > 0 ? state.workflows.map(w => ({
        id: w.id,
        name: w.name,
        description: w.description,
        schedule: w.schedule,
        enabled: true,
        executionMode: w.executionMode,
        scaling: w.scaling,
        parallelism: w.parallelism,
        targeting: {
          communities: w.targetCommunities || [],
          groups: w.targetGroups || [],
          tags: w.tags || [],
          agents: w.targetAgents,
        },
        dependsOn: w.dependsOn,
        content: w.content,
      })) : undefined,
    }
  }

  // ---- Helpers ----
  const addAgent = () => {
    update({
      agents: [...state.agents, { id: '', name: '', role: '', tags: [], skills: [], communities: [], groups: [], count: 1 }],
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

  const buildWorkflowInputBlock = (fields: WorkflowFormField[]) => {
    if (fields.length === 0) return ''
    const lines = fields.map((field) => {
      const trimmedLabel = field.label.trim() || 'Input'
      const trimmedDefault = field.defaultValue.trim() || (field.type === 'checkbox' ? 'false' : '')
      return `- **${trimmedLabel}:** ${trimmedDefault}`
    })
    const notes = fields
      .filter((field) => field.type !== 'text')
      .map((field) => {
        const base = `- ${field.label.trim()}: ${field.type}`
        return field.type === 'select' && field.options.length > 0
          ? `${base} (${field.options.join(', ')})`
          : base
      })
    return [
      '## Run Inputs',
      ...lines,
      notes.length > 0 ? '' : null,
      notes.length > 0 ? '## Input Notes' : null,
      ...notes,
    ].filter(Boolean).join('\n')
  }

  const openWorkflowFormBuilder = (idx: number) => {
    const workflow = state.workflows[idx]
    const content = workflow?.content || ''
    const existingFields = Array.from(content.matchAll(/^- \*\*(.+?):\*\*\s+(.+)$/gm)).map((match) => ({
      label: match[1]?.trim() || '',
      type: 'text' as const,
      options: [] as string[],
      defaultValue: match[2]?.trim() || '',
    }))
    setWorkflowFormFields(existingFields.length > 0 ? existingFields : [
      { label: 'Request', type: 'text', options: [], defaultValue: '' },
    ])
    setFormBuilderWorkflowIndex(idx)
  }

  const applyWorkflowFormBuilder = () => {
    if (formBuilderWorkflowIndex === null) return
    const workflows = [...state.workflows]
    const workflow = workflows[formBuilderWorkflowIndex]
    const inputBlock = buildWorkflowInputBlock(workflowFormFields.filter((field) => field.label.trim()))
    const stripped = (workflow.content || '').replace(/\n?## Run Inputs[\s\S]*?(?=\n## |\s*$)/, '').replace(/\n?## Input Notes[\s\S]*?(?=\n## |\s*$)/, '').trim()
    workflows[formBuilderWorkflowIndex] = {
      ...workflow,
      content: [stripped, inputBlock].filter(Boolean).join('\n\n'),
    }
    update({ workflows })
    setFormBuilderWorkflowIndex(null)
    setWorkflowFormFields([])
  }

  const addCommunity = () => {
    update({
      communities: [...state.communities, { name: '', description: '', tags: [] }],
    })
  }

  const addGroup = () => {
    update({
      groups: [...state.groups, { name: '', description: '', community: state.communities[0]?.name || '', tags: [] }],
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
        tags: [],
        dependsOn: [],
        content: '',
      }],
    })
  }

  const handleAiCronForWorkflow = async (idx: number) => {
    const workflow = state.workflows[idx]
    if (!workflow?.schedule.trim() || aiCronLoadingIndex !== null) return
    setAiCronLoadingIndex(idx)
    setWorkflowCronHints(prev => ({ ...prev, [idx]: '' }))
    try {
      const resp = await fetch('/api/workflows/generate-cron', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: workflow.schedule.trim() }),
      })
      const data = await resp.json().catch(() => ({}))
      if (data.valid && data.cron) {
        const workflows = [...state.workflows]
        workflows[idx] = { ...workflows[idx], schedule: data.cron }
        update({ workflows })
        setWorkflowCronHints(prev => ({ ...prev, [idx]: data.humanReadable || data.explanation || 'Cron generated' }))
      } else {
        setWorkflowCronHints(prev => ({ ...prev, [idx]: data.explanation || data.error || 'Could not generate a valid cron expression' }))
      }
    } catch {
      setWorkflowCronHints(prev => ({ ...prev, [idx]: 'Failed to connect to AI cron helper' }))
    } finally {
      setAiCronLoadingIndex(null)
    }
  }

  // ---- Styles ----
  const inputCls = 'w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-200 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500'
  const btnPrimary = 'px-4 py-2 text-sm bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors font-medium'
  const btnSecondary = 'px-4 py-2 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors'
  const labelCls = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'
  const registerFieldRef = (fieldKey: string) => (el: FocusableField | null) => {
    fieldRefs.current[fieldKey] = el
  }
  const focusField = (fieldKey: string) => {
    const el = fieldRefs.current[fieldKey]
    if (el) {
      el.focus()
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }
  const agentFieldPill = (fieldKey: string, label: string) => (
    <button
      type="button"
      onClick={() => focusField(fieldKey)}
      className={`rounded-full px-2 py-0.5 border text-[10px] font-semibold uppercase tracking-wide transition-colors ${
        focusedAgentField === fieldKey
          ? 'border-purple-300 bg-purple-100 text-purple-700 dark:border-purple-700 dark:bg-purple-900/50 dark:text-purple-300'
          : 'border-gray-200 bg-white text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400 hover:border-purple-200 hover:text-purple-600'
      }`}
    >
      {label}
    </button>
  )
  const commFieldPill = (fieldKey: string, label: string) => (
    <button
      type="button"
      onClick={() => focusField(fieldKey)}
      className={`rounded-full px-2 py-0.5 border text-[10px] font-semibold uppercase tracking-wide transition-colors ${
        focusedCommField === fieldKey
          ? 'border-blue-300 bg-blue-100 text-blue-700 dark:border-blue-700 dark:bg-blue-900/50 dark:text-blue-300'
          : 'border-gray-200 bg-white text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400 hover:border-blue-200 hover:text-blue-600'
      }`}
    >
      {label}
    </button>
  )
  const workflowFieldPill = (fieldKey: string, label: string) => (
    <button
      type="button"
      onClick={() => focusField(fieldKey)}
      className={`rounded-full px-2 py-0.5 border text-[10px] font-semibold uppercase tracking-wide transition-colors ${
        focusedWorkflowField === fieldKey
          ? 'border-amber-300 bg-amber-100 text-amber-700 dark:border-amber-700 dark:bg-amber-900/50 dark:text-amber-300'
          : 'border-gray-200 bg-white text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400 hover:border-amber-200 hover:text-amber-700'
      }`}
    >
      {label}
    </button>
  )
  const renderPromptSummary = () => {
    const prompt = state.teamDescription.trim()
    if (!prompt) return null
    const preview = prompt.length > 280 ? `${prompt.slice(0, 280).trim()}…` : prompt
    return (
      <div className="mb-4 rounded-lg border border-purple-200 dark:border-purple-700 bg-purple-50/70 dark:bg-purple-900/20 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-wide text-purple-600 dark:text-purple-300">AI Prompt</div>
            <pre className="mt-1 whitespace-pre-wrap break-words text-sm text-purple-900 dark:text-purple-100 font-sans">{preview}</pre>
            {prompt.length > preview.length && (
              <button
                type="button"
                onClick={() => setShowFullPrompt(true)}
                className="mt-2 text-xs font-medium text-purple-700 hover:text-purple-800 dark:text-purple-300 dark:hover:text-purple-200"
              >
                View Full Prompt
              </button>
            )}
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => {
                setPromptDraft(state.teamDescription)
                setEditingPrompt(true)
              }}
              className={btnSecondary}
            >
              Edit Prompt
            </button>
            <button
              type="button"
              onClick={handleAiGenerate}
              disabled={aiGenerating || !aiEnabled}
              className={btnSecondary}
            >
              {aiGenerating ? 'Generating…' : 'Regenerate'}
            </button>
            <button
              type="button"
              onClick={() => setStep(0)}
              className={btnSecondary}
            >
              Refine Prompt
            </button>
          </div>
        </div>
        {aiSuggestedName && (
          <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
            AI suggested renaming this template to <span className="font-semibold">{aiSuggestedName}</span>, but your current name was preserved.
          </div>
        )}
        {aiPreservedWorkflowInputs.length > 0 && (
          <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-200">
            Preserved your custom workflow inputs for: <span className="font-semibold">{aiPreservedWorkflowInputs.join(', ')}</span>.
          </div>
        )}
      </div>
    )
  }
  const availableTagSuggestions = useMemo(
    () =>
      Array.from(
        new Set([
          ...state.tags,
          ...state.agents.flatMap((agent) => agent.tags),
        ].map((tag) => tag.trim()).filter(Boolean))
      ),
    [state.tags, state.agents]
  )

  const suggestedSkillsByAgent = useMemo(
    () =>
      state.agents.map((agent) => {
        const context = [
          state.teamName,
          state.teamDescription,
          state.description,
          ...state.tags,
          agent.name,
          agent.role,
          ...agent.tags,
        ].join(' ')

        return availableSkills
          .map((skill) => ({
            name: skill.name,
            score: getSkillSuggestionScore(skill, context),
          }))
          .filter((entry) => entry.score > 0 && !agent.skills.includes(entry.name))
          .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
          .slice(0, 5)
          .map((entry) => entry.name)
      }),
    [availableSkills, state.agents, state.description, state.tags, state.teamDescription, state.teamName]
  )

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
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={() => {
              setPromptDraft(state.teamDescription)
              setEditingPrompt(true)
            }}
            className={btnSecondary}
          >
            Open Full Editor
          </button>
        </div>
      </div>

      {!aiEnabled && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-800 dark:bg-red-900/20 dark:text-red-100">
          <div className="font-medium">AI template generation is disabled because no AI execution path is configured</div>
          <div className="mt-1 text-xs opacity-90">
            This will fail until you add a model key and choose a preferred model in this browser or through a usable shared execution path.
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent('open-workspaces-integrations', { detail: { step: 'models', focus: 'preferred-model' } }))}
              className="px-3 py-1.5 text-xs font-medium rounded-md border border-red-300 bg-white text-red-800 hover:bg-red-100 dark:border-red-700 dark:bg-transparent dark:text-red-200 dark:hover:bg-red-900/30"
            >
              Open BYOK
            </button>
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent('navigate-to-page', { detail: { page: 'keys' } }))}
              className="px-3 py-1.5 text-xs font-medium rounded-md border border-red-300 bg-white text-red-800 hover:bg-red-100 dark:border-red-700 dark:bg-transparent dark:text-red-200 dark:hover:bg-red-900/30"
            >
              Open Keys & Secrets
            </button>
          </div>
        </div>
      )}

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
            disabled={aiGenerating || !state.teamDescription.trim() || !aiEnabled}
            className="px-4 py-2 text-sm bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-md hover:from-purple-700 hover:to-indigo-700 disabled:from-gray-300 disabled:to-gray-400 dark:disabled:from-gray-600 dark:disabled:to-gray-700 disabled:cursor-not-allowed transition-all font-medium"
            title={!aiEnabled ? 'Configure browser keys and a preferred model to enable AI generation' : ''}
          >
            {aiGenerating ? 'Generating...' : !aiEnabled ? 'AI Generate (set up keys first)' : '✨ AI Generate All'}
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
            ref={registerFieldRef('team-name')}
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
            ref={registerFieldRef('team-author')}
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
          ref={registerFieldRef('team-description')}
          placeholder="What does this team do?"
          rows={2}
          className={inputCls + ' resize-y'}
        />
      </div>

      <div className="mb-2">
        <label className={labelCls}>Tags</label>
        <MultiValueInput
          values={state.tags}
          suggestions={availableTagSuggestions}
          placeholder="Add team tags..."
          onChange={(tags) => update({ tags })}
          inputRef={registerFieldRef('team-tags')}
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
            <div className="mb-2 flex flex-wrap gap-2 text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {agentFieldPill(`name-${idx}`, 'Agent Name')}
              {agentFieldPill(`id-${idx}`, 'Agent ID')}
              {agentFieldPill(`role-${idx}`, 'Role')}
              {agentFieldPill(`tags-${idx}`, 'Tags')}
              {agentFieldPill(`skills-${idx}`, 'Skills')}
            </div>
            <div className="flex items-start gap-2">
              <div className="flex-1 grid grid-cols-3 gap-2">
                <div>
                  <input
                    ref={registerFieldRef(`name-${idx}`)}
                    type="text"
                    value={agent.name}
                    onChange={e => updateAgent(idx, { name: e.target.value })}
                    onFocus={() => setFocusedAgentField(`name-${idx}`)}
                    onBlur={() => setFocusedAgentField(current => current === `name-${idx}` ? null : current)}
                    placeholder="Agent name"
                    className={inputCls + ' text-xs'}
                  />
                </div>
                <div>
                  <input
                    ref={registerFieldRef(`id-${idx}`)}
                    type="text"
                    value={agent.id}
                    onChange={e => updateAgent(idx, { id: e.target.value })}
                    onFocus={() => setFocusedAgentField(`id-${idx}`)}
                    onBlur={() => setFocusedAgentField(current => current === `id-${idx}` ? null : current)}
                    placeholder="agent-id"
                    className={inputCls + ' text-xs font-mono'}
                  />
                </div>
                <div>
                  <input
                    ref={registerFieldRef(`role-${idx}`)}
                    type="text"
                    value={agent.role}
                    onChange={e => updateAgent(idx, { role: e.target.value })}
                    onFocus={() => setFocusedAgentField(`role-${idx}`)}
                    onBlur={() => setFocusedAgentField(current => current === `role-${idx}` ? null : current)}
                    placeholder="Role description"
                    className={inputCls + ' text-xs'}
                  />
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Count</label>
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
              <MultiValueInput
                values={agent.tags}
                suggestions={availableTagSuggestions}
                placeholder="Add agent tags..."
                onChange={(tags) => updateAgent(idx, { tags })}
                onFocus={() => setFocusedAgentField(`tags-${idx}`)}
                onBlur={() => setFocusedAgentField(current => current === `tags-${idx}` ? null : current)}
                inputRef={registerFieldRef(`tags-${idx}`)}
              />
              <div>
                {suggestedSkillsByAgent[idx]?.length > 0 && (
                  <div className="mb-1.5">
                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-sky-600 dark:text-sky-300">
                      Suggested Skills
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {suggestedSkillsByAgent[idx].map((skillName) => (
                        <button
                          key={skillName}
                          type="button"
                          onClick={() => updateAgent(idx, { skills: [...agent.skills, skillName] })}
                          className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-medium text-sky-700 transition-colors hover:border-sky-300 hover:bg-sky-100 dark:border-sky-700 dark:bg-sky-900/30 dark:text-sky-300"
                        >
                          + {skillName}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <MultiValueInput
                  values={agent.skills}
                  suggestions={Array.from(new Set([...availableSkillNames, ...state.agents.flatMap((entry) => entry.skills)]))}
                  placeholder="Search and add skills..."
                  onChange={(skills) => updateAgent(idx, { skills })}
                  onFocus={() => setFocusedAgentField(`skills-${idx}`)}
                  onBlur={() => setFocusedAgentField(current => current === `skills-${idx}` ? null : current)}
                  inputRef={registerFieldRef(`skills-${idx}`)}
                />
              </div>
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
            <div key={idx} className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-3">
              <div className="mb-2 flex flex-wrap gap-2">
                {commFieldPill(`community-name-${idx}`, 'Community Name')}
                {commFieldPill(`community-description-${idx}`, 'Description')}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] gap-2 items-start">
              <input
                ref={registerFieldRef(`community-name-${idx}`)}
                type="text"
                value={comm.name}
                onChange={e => {
                  const communities = [...state.communities]
                  communities[idx] = { ...communities[idx], name: e.target.value }
                  update({ communities })
                }}
                onFocus={() => setFocusedCommField(`community-name-${idx}`)}
                onBlur={() => setFocusedCommField(current => current === `community-name-${idx}` ? null : current)}
                placeholder="Community name"
                className={inputCls + ' text-xs flex-1'}
              />
              <input
                ref={registerFieldRef(`community-description-${idx}`)}
                type="text"
                value={comm.description}
                onChange={e => {
                  const communities = [...state.communities]
                  communities[idx] = { ...communities[idx], description: e.target.value }
                  update({ communities })
                }}
                onFocus={() => setFocusedCommField(`community-description-${idx}`)}
                onBlur={() => setFocusedCommField(current => current === `community-description-${idx}` ? null : current)}
                placeholder="Description"
                className={inputCls + ' text-xs flex-1'}
              />
              <button
                onClick={() => update({ communities: state.communities.filter((_, i) => i !== idx) })}
                className="h-9 px-3 text-red-400 hover:text-red-600 text-xs shrink-0 justify-self-start md:justify-self-auto"
              >
                ✕
              </button>
            </div>
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
            <div key={idx} className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-3">
              <div className="mb-2 flex flex-wrap gap-2">
                {commFieldPill(`group-name-${idx}`, 'Group Name')}
                {state.communities.length > 0 && commFieldPill(`group-community-${idx}`, 'Community')}
                {commFieldPill(`group-description-${idx}`, 'Description')}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,14rem)_auto] gap-2 items-start">
                <input
                  ref={registerFieldRef(`group-name-${idx}`)}
                  type="text"
                  value={group.name}
                  onChange={e => {
                    const groups = [...state.groups]
                    groups[idx] = { ...groups[idx], name: e.target.value }
                    update({ groups })
                  }}
                  onFocus={() => setFocusedCommField(`group-name-${idx}`)}
                  onBlur={() => setFocusedCommField(current => current === `group-name-${idx}` ? null : current)}
                  placeholder="Group name"
                  className={inputCls + ' text-xs'}
                />
                {state.communities.length > 0 ? (
                  <select
                    ref={registerFieldRef(`group-community-${idx}`)}
                    value={group.community}
                    onChange={e => {
                      const groups = [...state.groups]
                      groups[idx] = { ...groups[idx], community: e.target.value }
                      update({ groups })
                    }}
                    onFocus={() => setFocusedCommField(`group-community-${idx}`)}
                    onBlur={() => setFocusedCommField(current => current === `group-community-${idx}` ? null : current)}
                    className={inputCls + ' text-xs w-full'}
                  >
                    <option value="">No community</option>
                    {state.communities.map(c => (
                      <option key={c.name} value={c.name}>{c.name}</option>
                    ))}
                  </select>
                ) : (
                  <div />
                )}
                <button
                  onClick={() => update({ groups: state.groups.filter((_, i) => i !== idx) })}
                  className="h-9 px-3 text-red-400 hover:text-red-600 text-xs shrink-0 justify-self-start md:justify-self-auto"
                >
                  ✕
                </button>
              </div>
              <div className="mt-2">
                <textarea
                  ref={registerFieldRef(`group-description-${idx}`)}
                  value={group.description}
                  onChange={e => {
                    const groups = [...state.groups]
                    groups[idx] = { ...groups[idx], description: e.target.value }
                    update({ groups })
                  }}
                  onFocus={() => setFocusedCommField(`group-description-${idx}`)}
                  onBlur={() => setFocusedCommField(current => current === `group-description-${idx}` ? null : current)}
                  placeholder="Description"
                  rows={2}
                  className={inputCls + ' text-xs resize-y'}
                />
              </div>
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

      {renderPromptSummary()}

      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-gray-500">Define recurring or one-time workflows for this team.</p>
        <button onClick={addWorkflow} className="text-xs text-purple-600 hover:text-purple-700 font-medium">+ Add Workflow</button>
      </div>

      {state.workflows.length === 0 && (
        <div className="rounded-lg border border-dashed border-amber-300 dark:border-amber-700 bg-amber-50/70 dark:bg-amber-900/20 p-4">
          <div className="text-sm font-medium text-amber-800 dark:text-amber-300">
            No workflows yet
          </div>
          <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">
            AI created the team, but not the repeatable process. Add starter workflows now so the team knows how to operate.
          </p>
          <div className="mt-3">
            <label className={labelCls}>What should this team do each run?</label>
            <textarea
              value={workflowGoalPrompt}
              onChange={(e) => setWorkflowGoalPrompt(e.target.value)}
              placeholder='e.g., Review Meta ads performance, shift budget, propose new creative tests, and send a weekly summary'
              rows={3}
              className={inputCls + ' resize-y'}
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                update({
                  workflows: buildSuggestedWorkflows({
                    teamName: state.teamName,
                    teamDescription: state.teamDescription,
                    workflowGoal: workflowGoalPrompt,
                    agentIds: state.agents.map((agent) => agent.id).filter(Boolean),
                    targetCommunity: state.communities[0]?.name,
                    targetGroup: state.groups[0]?.name,
                    tags: state.tags,
                  }),
                })
              }
              className={btnPrimary}
            >
              ✨ Add Suggested Workflows
            </button>
            <button
              type="button"
              onClick={addWorkflow}
              className={btnSecondary}
            >
              + Add Manually
            </button>
          </div>
        </div>
      )}

      <div className="space-y-3 max-h-[50vh] overflow-y-auto">
        {state.workflows.map((wf, idx) => (
          <div key={idx} className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 bg-gray-50 dark:bg-gray-800/50">
            <div className="mb-2 flex flex-wrap gap-2">
              {workflowFieldPill(`workflow-name-${idx}`, 'Workflow Name')}
              {workflowFieldPill(`workflow-schedule-${idx}`, 'Schedule')}
              {workflowFieldPill(`workflow-mode-${idx}`, 'Mode')}
              {workflowFieldPill(`workflow-content-${idx}`, 'Content')}
            </div>
            <div className="mb-2">
              <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,11rem)_auto] gap-2 items-start">
                <input
                  ref={registerFieldRef(`workflow-name-${idx}`)}
                  type="text"
                  value={wf.name}
                  onChange={e => {
                    const workflows = [...state.workflows]
                    workflows[idx] = {
                      ...workflows[idx],
                      name: e.target.value,
                      id: slugify(e.target.value),
                    }
                    update({ workflows })
                  }}
                  onFocus={() => setFocusedWorkflowField(`workflow-name-${idx}`)}
                  onBlur={() => setFocusedWorkflowField(current => current === `workflow-name-${idx}` ? null : current)}
                  placeholder="Workflow name"
                  className={inputCls + ' text-xs'}
                />
                <select
                  ref={registerFieldRef(`workflow-mode-${idx}`)}
                  value={wf.executionMode}
                  onChange={e => {
                    const workflows = [...state.workflows]
                    workflows[idx] = { ...workflows[idx], executionMode: e.target.value as 'automated' | 'managed' }
                    update({ workflows })
                  }}
                  onFocus={() => setFocusedWorkflowField(`workflow-mode-${idx}`)}
                  onBlur={() => setFocusedWorkflowField(current => current === `workflow-mode-${idx}` ? null : current)}
                  className={inputCls + ' text-xs w-full'}
                >
                  <option value="managed">Managed</option>
                  <option value="automated">Automated</option>
                </select>
                <button
                  onClick={() => update({ workflows: state.workflows.filter((_, i) => i !== idx) })}
                  className="h-9 px-3 text-red-400 hover:text-red-600 text-xs shrink-0 justify-self-start md:justify-self-auto"
                >
                  ✕
                </button>
              </div>
              {wf.scaling === 'parallel' && (
                <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-sky-200 bg-sky-50 px-2.5 py-2 dark:border-sky-900/50 dark:bg-sky-900/20">
                  <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">
                    Parallel
                  </span>
                  <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Lanes</label>
                  <input
                    type="number"
                    min={2}
                    max={10}
                    value={wf.parallelism || 3}
                    onChange={e => {
                      const workflows = [...state.workflows]
                      workflows[idx] = { ...workflows[idx], parallelism: Math.min(10, Math.max(2, Number(e.target.value) || 2)) }
                      update({ workflows })
                    }}
                    className={inputCls + ' text-xs w-20'}
                  />
                  <span className="text-[11px] text-gray-500 dark:text-gray-400">
                    Default is 3. Use 2-3 for most cases.
                  </span>
                </div>
              )}
              <div className="mt-2">
                <input
                  ref={registerFieldRef(`workflow-schedule-${idx}`)}
                  type="text"
                  value={wf.schedule}
                  onChange={e => {
                    const workflows = [...state.workflows]
                    workflows[idx] = { ...workflows[idx], schedule: e.target.value }
                    update({ workflows })
                  }}
                  onFocus={() => setFocusedWorkflowField(`workflow-schedule-${idx}`)}
                  onBlur={() => setFocusedWorkflowField(current => current === `workflow-schedule-${idx}` ? null : current)}
                  placeholder='manual, cron, or plain English like "every weekday at 9am"'
                  className={inputCls + ' text-xs font-mono'}
                />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => openWorkflowFormBuilder(idx)}
                  className="px-3 py-1.5 text-xs font-medium rounded-md border border-sky-300 bg-sky-50 text-sky-700 hover:bg-sky-100 dark:border-sky-700 dark:bg-sky-900/30 dark:text-sky-300 dark:hover:bg-sky-900/50"
                >
                  Form Builder
                </button>
                {wf.schedule.trim().toLowerCase() !== 'manual' && (
                  <>
                    <button
                      type="button"
                      onClick={() => handleAiCronForWorkflow(idx)}
                      disabled={aiCronLoadingIndex !== null || !wf.schedule.trim()}
                      className="px-3 py-1.5 text-xs font-medium rounded-md border border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 disabled:opacity-60 disabled:cursor-not-allowed dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-300 dark:hover:bg-amber-900/50"
                    >
                      {aiCronLoadingIndex === idx ? 'Generating cron…' : '✨ Suggest Cron'}
                    </button>
                    <span className="text-[11px] text-gray-500 dark:text-gray-400">
                      Enter timing in plain English if you do not know the cron syntax.
                    </span>
                  </>
                )}
              </div>
              {workflowCronHints[idx] && (
                <div className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                  {workflowCronHints[idx]}
                </div>
              )}
            </div>
            <textarea
              ref={registerFieldRef(`workflow-content-${idx}`)}
              value={wf.content}
              onChange={e => {
                const workflows = [...state.workflows]
                workflows[idx] = { ...workflows[idx], content: e.target.value }
                update({ workflows })
              }}
              onFocus={() => setFocusedWorkflowField(`workflow-content-${idx}`)}
              onBlur={() => setFocusedWorkflowField(current => current === `workflow-content-${idx}` ? null : current)}
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
                      name: c.name, description: c.description || '', tags: c.tags || [],
                    })),
                    groups: (parsed.groups || []).map((g: any) => ({
                      name: g.name, description: g.description || '', community: g.community || '', tags: g.tags || [],
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
            {renderPromptSummary()}

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
                      {a.tags?.length > 0 && (
                        <span className="text-gray-400 shrink-0">[{a.tags.join(', ')}]</span>
                      )}
                      {a.skills?.length > 0 && (
                        <span className="text-gray-400 shrink-0">({a.skills.join(', ')})</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {template.parameters?.length > 0 && (
              <div className="mb-4">
                <h4 className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-2">Team Size</h4>
                <div className="space-y-1 text-xs">
                  {template.parameters.map((param: any, i: number) => (
                    <div key={i} className="py-1 px-2 rounded bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
                      <span className="font-medium">{param.label || param.agentId}</span>
                      <span className="rounded-full bg-emerald-100 dark:bg-emerald-900/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                        x{Math.max(1, Number(param.default) || 1)}
                      </span>
                      <span className="text-emerald-500">
                        ({param.min || 1}-{param.max || 10})
                      </span>
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
                      {c.tags?.length > 0 && <span className="text-blue-500"> [{c.tags.join(', ')}]</span>}
                    </div>
                  ))}
                  {(template.groups || []).map((g: any, i: number) => (
                    <div key={`g-${i}`} className="py-1 px-2 rounded bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300">
                      Group: {g.name} {g.community && <span className="text-green-500">({g.community})</span>}
                      {g.tags?.length > 0 && <span className="text-green-500"> [{g.tags.join(', ')}]</span>}
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
                      <span className="text-orange-500">⚡</span>
                      <span className="font-medium">{w.name}</span>
                      <span className="font-mono text-orange-500">{w.schedule}</span>
                      <span className="text-orange-400">{w.executionMode}</span>
                      {w.scaling && (
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                          w.scaling === 'parallel'
                            ? 'bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'
                        }`}>
                          {w.scaling === 'parallel' ? `Parallel x${Math.min(10, Math.max(2, Number(w.parallelism) || 3))}` : 'Singleton'}
                        </span>
                      )}
                      {w.targeting?.tags?.length > 0 && (
                        <span className="text-orange-500">[{w.targeting.tags.join(', ')}]</span>
                      )}
                      {w.dependsOn?.length > 0 && (
                        <span className="text-orange-400">depends on {w.dependsOn.join(', ')}</span>
                      )}
                      <span className="rounded-full bg-orange-100 dark:bg-orange-900/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-orange-700 dark:text-orange-300">
                        Suggested
                      </span>
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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Header with step indicators */}
        <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 z-10">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                {initialTemplate ? 'Edit Template' : 'Template Wizard'}
              </h2>
              {initialTemplate && (
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  Starting from {initialTemplate.name}. Save to create or update a workspace variant.
                </p>
              )}
            </div>
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
      {showFullPrompt && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={() => setShowFullPrompt(false)}>
          <div className="w-full max-w-3xl rounded-lg bg-white dark:bg-gray-800 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-5 py-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Full AI Prompt</h3>
              <button onClick={() => setShowFullPrompt(false)} className="text-gray-400 hover:text-gray-600 dark:text-gray-400">✕</button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
              <pre className="whitespace-pre-wrap break-words text-sm text-gray-900 dark:text-gray-100 font-sans">{state.teamDescription}</pre>
            </div>
          </div>
        </div>
      )}
      {editingPrompt && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={() => setEditingPrompt(false)}>
          <div className="w-full max-w-3xl rounded-lg bg-white dark:bg-gray-800 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-5 py-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Edit AI Prompt</h3>
              <button onClick={() => setEditingPrompt(false)} className="text-gray-400 hover:text-gray-600 dark:text-gray-400">✕</button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <textarea
                value={promptDraft}
                onChange={(e) => setPromptDraft(e.target.value)}
                rows={14}
                className={inputCls + ' resize-y font-sans'}
              />
              <div className="flex justify-between gap-2">
                <button
                  type="button"
                  onClick={() => {
                    update({ teamDescription: promptDraft })
                    setEditingPrompt(false)
                  }}
                  className={btnSecondary}
                >
                  Save
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingPrompt(false)}
                    className={btnSecondary}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      update({ teamDescription: promptDraft })
                      setEditingPrompt(false)
                      window.setTimeout(() => {
                        void handleAiGenerate()
                      }, 0)
                    }}
                    disabled={aiGenerating || !aiEnabled || !promptDraft.trim()}
                    className={btnPrimary}
                  >
                    {aiGenerating ? 'Generating…' : 'Save & Regenerate'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {formBuilderWorkflowIndex !== null && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={() => setFormBuilderWorkflowIndex(null)}>
          <div className="w-full max-w-3xl rounded-lg bg-white dark:bg-gray-800 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-5 py-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Workflow Form Builder</h3>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Generate a `Run Inputs` section for this workflow. Current runtime will render these as editable inputs.</p>
              </div>
              <button onClick={() => setFormBuilderWorkflowIndex(null)} className="text-gray-400 hover:text-gray-600 dark:text-gray-400">✕</button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto px-5 py-4 space-y-3">
              {workflowFormFields.map((field, idx) => (
                <div key={idx} className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
                  <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_10rem_auto] gap-2 items-start">
                    <input
                      type="text"
                      value={field.label}
                      onChange={(e) => setWorkflowFormFields((prev) => prev.map((entry, i) => i === idx ? { ...entry, label: e.target.value } : entry))}
                      placeholder="Field name"
                      className={inputCls + ' text-xs'}
                    />
                    <select
                      value={field.type}
                      onChange={(e) => setWorkflowFormFields((prev) => prev.map((entry, i) => i === idx ? { ...entry, type: e.target.value as WorkflowFormField['type'] } : entry))}
                      className={inputCls + ' text-xs'}
                    >
                      <option value="text">Text</option>
                      <option value="checkbox">Checkbox</option>
                      <option value="select">Selection</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => setWorkflowFormFields((prev) => prev.filter((_, i) => i !== idx))}
                      className="h-9 px-3 text-red-400 hover:text-red-600 text-xs"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={field.defaultValue}
                      onChange={(e) => setWorkflowFormFields((prev) => prev.map((entry, i) => i === idx ? { ...entry, defaultValue: e.target.value } : entry))}
                      placeholder={field.type === 'checkbox' ? 'false' : 'Default value / placeholder'}
                      className={inputCls + ' text-xs'}
                    />
                    {field.type === 'select' ? (
                      <input
                        type="text"
                        value={field.options.join(', ')}
                        onChange={(e) => setWorkflowFormFields((prev) => prev.map((entry, i) => i === idx ? { ...entry, options: e.target.value.split(',').map((value) => value.trim()).filter(Boolean) } : entry))}
                        placeholder="Possible values, comma-separated"
                        className={inputCls + ' text-xs'}
                      />
                    ) : (
                      <div className="text-[11px] text-gray-500 dark:text-gray-400 flex items-center px-2">
                        {field.type === 'checkbox' ? 'Stored as true/false in the generated markdown.' : 'Rendered as a text input in the current run UI.'}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setWorkflowFormFields((prev) => [...prev, { label: '', type: 'text', options: [], defaultValue: '' }])}
                className={btnSecondary}
              >
                + Add Input Field
              </button>
            </div>
            <div className="flex justify-between border-t border-gray-200 dark:border-gray-700 px-5 py-4">
              <button type="button" onClick={() => setFormBuilderWorkflowIndex(null)} className={btnSecondary}>Cancel</button>
              <button type="button" onClick={applyWorkflowFormBuilder} className={btnPrimary}>Insert Run Inputs</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
