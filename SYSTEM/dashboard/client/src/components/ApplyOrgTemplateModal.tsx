import React, { useState } from 'react'
import { useToast } from './Toast'
import { fetchModelsWithByok, readStoredByokKeys } from '../lib/byok'

interface TemplateParameter {
  agentId: string
  label: string
  default: number
  min: number
  max: number
}

interface OrganizationTemplate {
  name: string
  type: 'organization'
  version: string
  description?: string
  parameters?: TemplateParameter[]
  agents: Array<{ id: string; name?: string; role: string; model?: string; tags?: string[]; skills?: string[] }>
  communities?: Array<{ name: string }>
  groups?: Array<{ name: string }>
  workflows?: Array<{ id: string; name: string }>
}

interface ApplyOrgTemplateModalProps {
  template: OrganizationTemplate
  onClose: () => void
  onSuccess: () => void
}

const FALLBACK_MODELS = [
  'openai/gpt-5',
  'openai/gpt-4.1',
  'openai/gpt-4.1-mini',
  'openai/gpt-4o',
  'openai/gpt-4o-mini',
  'anthropic/claude-sonnet-4-20250514',
  'anthropic/claude-opus-4-20250514',
  'anthropic/claude-3-5-sonnet-20241022',
]

export default function ApplyOrgTemplateModal({ template, onClose, onSuccess }: ApplyOrgTemplateModalProps) {
  const [prefix, setPrefix] = useState('')
  const [suffix, setSuffix] = useState('')
  const [includeBuiltIn, setIncludeBuiltIn] = useState(true)
  const [modelOverride, setModelOverride] = useState('')
  const [availableModels, setAvailableModels] = useState<string[]>([])
  const [modelsByProvider, setModelsByProvider] = useState<Record<string, { name: string; models: string[] }>>({})
  const [modelsLoaded, setModelsLoaded] = useState(false)
  const [modelLoadError, setModelLoadError] = useState<string | null>(null)
  const [showModelSection, setShowModelSection] = useState(false)
  const [applying, setApplying] = useState(false)
  const [applyProgress, setApplyProgress] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [useGithub, setUseGithub] = useState(false)
  const [githubRepo, setGithubRepo] = useState('')
  const [useSenso, setUseSenso] = useState(false)
  const [sensoFolder, setSensoFolder] = useState('')
  const [useWorkspaceFs, setUseWorkspaceFs] = useState(false)
  const [showWorkflowSection, setShowWorkflowSection] = useState(false)
  const [workflowOverrides, setWorkflowOverrides] = useState<Record<string, string>>({})
  // Local field values for controlled inputs — synced to markdown on blur
  const [fieldInputs, setFieldInputs] = useState<Record<string, string>>({})
  const [rawEditWorkflows, setRawEditWorkflows] = useState<Set<string>>(new Set())
  const [workflowStep, setWorkflowStep] = useState(0) // Current workflow being customized
  const { showSuccess, showError: showToastError } = useToast()

  const templateSlug = template.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

  // Prerequisites check
  const [prereqs, setPrereqs] = useState<{ ready: boolean; checks: Array<{ id: string; label: string; status: string; message: string; fixHint?: string; category: string }>; summary: { pass: number; fail: number; warn: number } } | null>(null)
  const [prereqsLoading, setPrereqsLoading] = useState(true)

  React.useEffect(() => {
    const stored = readStoredByokKeys()
    if (stored.githubDefaultRepo?.trim()) {
      setGithubRepo((current) => current || stored.githubDefaultRepo!.trim())
    }
    if (stored.sensoApiKey?.trim()) {
      setUseSenso(true)
    }
    if (stored.sensoContextLabel?.trim()) {
      setSensoFolder((current) => current || stored.sensoContextLabel!.trim())
    }
  }, [])

  React.useEffect(() => {
    fetch('/api/templates/organizations/prereqs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ templateSlug: template.slug || template.name }),
    })
      .then(r => r.json())
      .then(data => { setPrereqs(data); setPrereqsLoading(false) })
      .catch(() => setPrereqsLoading(false))
  }, [template.slug, template.name])

  // Agent count parameters — initialize from template defaults
  const [agentCounts, setAgentCounts] = useState<Record<string, number>>(() => {
    const counts: Record<string, number> = {}
    if (template.parameters) {
      for (const param of template.parameters) {
        counts[param.agentId] = param.default
      }
    }
    return counts
  })

  // Fetch available models
  React.useEffect(() => {
    fetchModelsWithByok()
      .then(d => {
        const models = Array.isArray(d.models) ? d.models : []
        const byProvider = d.modelsByProvider || {}
        setAvailableModels(models.length > 0 ? models : FALLBACK_MODELS)
        setModelsByProvider(byProvider)
        setModelLoadError(models.length === 0 && Object.keys(byProvider).length === 0 ? 'No discovered models found' : null)
      })
      .catch(err => {
        setAvailableModels(FALLBACK_MODELS)
        setModelsByProvider({})
        setModelLoadError(err?.message || 'Failed to load models')
      })
      .finally(() => setModelsLoaded(true))
  }, [])

  // Expand parameterized agents based on counts
  const paramAgentIds = new Set((template.parameters || []).map(p => p.agentId))

  const expandedAgents = template.agents.flatMap(agent => {
    if (paramAgentIds.has(agent.id)) {
      const count = agentCounts[agent.id] || 1
      return Array.from({ length: count }, (_, i) => ({
        ...agent,
        id: count === 1 ? agent.id : `${agent.id}${i + 1}`,
        name: count === 1 ? (agent.name || agent.id) : `${agent.name || agent.role} ${i + 1}`,
      }))
    }
    return [agent]
  })

  // Separate built-in agents from regular agents
  const builtInAgents = expandedAgents.filter(a => a.tags?.includes('built-in'))
  const regularAgents = expandedAgents.filter(a => !a.tags?.includes('built-in'))
  const agentsToCreate = includeBuiltIn ? expandedAgents : regularAgents

  // Calculate what the agent IDs will look like with current prefix/suffix
  const exampleAgentId = regularAgents[0]?.id || template.agents[0]?.id || 'agent'
  const previewId = `${prefix}${exampleAgentId}${suffix}`

  async function ensureWorkspaceSkills(skillSpecs: Array<{ name: string; registryName?: string }>) {
    const skillsResp = await fetch('/api/skills')
    const skillsData = await skillsResp.json()
    const installedNames = new Set(Array.isArray(skillsData.skills) ? skillsData.skills.map((s: any) => s.name) : [])

    for (const skill of skillSpecs) {
      if (installedNames.has(skill.name) || !skill.registryName) continue

      setApplyProgress(`Installing skill: ${skill.name}...`)
      const installResp = await fetch('/api/skills/registry/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: skill.registryName }),
      })
      const installData = await installResp.json().catch(() => ({}))

      if (!installResp.ok || installData.ok === false) {
        throw new Error(installData.error || `Failed to install skill: ${skill.name}`)
      }
    }
  }

  const handleApply = async () => {
    setApplying(true)
    setError(null)
    setApplyProgress(`Creating ${agentsToCreate.length} agent${agentsToCreate.length !== 1 ? 's' : ''}...`)

    try {
      // Show progress toasts
      showSuccess(`Creating ${agentsToCreate.length} agent${agentsToCreate.length !== 1 ? 's' : ''}...`)
      const steps = [
        ...(template.communities?.length ? [`Setting up ${template.communities.length} communit${template.communities.length !== 1 ? 'ies' : 'y'}...`] : []),
        ...(template.groups?.length ? [`Creating ${template.groups.length} group${template.groups.length !== 1 ? 's' : ''}...`] : []),
        ...(template.workflows?.length ? [`Configuring ${template.workflows.length} workflow${template.workflows.length !== 1 ? 's' : ''}...`] : []),
      ]
      let stepIdx = 0
      const progressInterval = setInterval(() => {
        if (stepIdx < steps.length) {
          showSuccess(steps[stepIdx])
          setApplyProgress(steps[stepIdx])
          stepIdx++
        }
      }, 800)

      // Build final workflow overrides — inject GitHub context if enabled
      const finalOverrides = { ...workflowOverrides }
      if (useGithub && githubRepo.trim() && template.workflows) {
        const ghBlock = `\n\n---\n**GitHub Coordination:** Use the repo \`${githubRepo.trim()}\` for all work.\n- Create GitHub issues for tasks and assignments\n- Push drafts and files to branches\n- Open PRs for review\n- Track progress via issue comments\n---\n`
        for (const wf of template.workflows) {
          const existing = finalOverrides[wf.id] ?? (wf as any).content ?? ''
          if (!existing.includes('GitHub Coordination')) {
            finalOverrides[wf.id] = existing + ghBlock
          }
        }
      }
      if (useSenso && template.workflows) {
        const sensoBlock = `\n\n---\n**Senso Shared Context:** Use Senso as the shared evidence and memory layer for this team.\n- Ingest new documents, screenshots, notes, and other evidence into Senso\n- Search Senso for prior incidents, briefs, and related context before acting\n- Generate concise summaries and handoff notes grounded in Senso evidence\n- Write back outcomes, lessons learned, and updated briefs to Senso\n${sensoFolder.trim() ? `- Preferred Senso folder/context: \`${sensoFolder.trim()}\`\n` : ''}---\n`
        for (const wf of template.workflows) {
          const existing = finalOverrides[wf.id] ?? (wf as any).content ?? ''
          if (!existing.includes('Senso Shared Context')) {
            finalOverrides[wf.id] = existing + sensoBlock
          }
        }
      }
      if (useWorkspaceFs && template.workflows) {
        const fsBlock = `\n\n---\n**Workspace File System:** Use the shared workspace filesystem for working artifacts and coordination.\n- Save drafts, notes, research snapshots, and intermediate outputs in the workspace\n- Read existing workspace files before duplicating work\n- Treat the workspace as a shared artifact layer across agents\n- Keep filenames and folders clear so other agents can reuse your work\n---\n`
        for (const wf of template.workflows) {
          const existing = finalOverrides[wf.id] ?? (wf as any).content ?? ''
          if (!existing.includes('Workspace File System')) {
            finalOverrides[wf.id] = existing + fsBlock
          }
        }
      }

      const validationResp = await fetch('/api/templates/organizations/validate-customization', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateSlug,
          githubRepo: githubRepo.trim() || undefined,
          useGithub,
          workflowOverrides: Object.keys(finalOverrides).length > 0 ? finalOverrides : undefined,
        }),
      })
      const validation = await validationResp.json().catch(() => ({ valid: true, warnings: [], errors: [] }))
      if (!validationResp.ok && Array.isArray(validation.errors) && validation.errors.length > 0) {
        const message = validation.errors.slice(0, 4).join(' ')
        setApplyProgress(null)
        setError(message)
        showToastError(message)
        setApplying(false)
        return
      }
      if (Array.isArray(validation.warnings) && validation.warnings.length > 0) {
        showSuccess(validation.warnings[0])
      }

      if (useSenso) {
        await ensureWorkspaceSkills([
          { name: 'senso-ingest', registryName: 'senso-ai/senso-ingest' },
          { name: 'senso-search', registryName: 'senso-ai/senso-search' },
          { name: 'senso-content-gen', registryName: 'senso-ai/senso-content-gen' },
        ])
      }

      const resp = await fetch('/api/templates/organizations/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateSlug,
          prefix: prefix || undefined,
          suffix: suffix || undefined,
          includeBuiltIn,
          modelOverride: modelOverride || undefined,
          agentCounts: Object.keys(agentCounts).length > 0 ? agentCounts : undefined,
          workflowOverrides: Object.keys(finalOverrides).length > 0 ? finalOverrides : undefined,
        }),
      })

      const data = await resp.json()
      clearInterval(progressInterval)

      if (resp.ok) {
        const createdAgentIds: string[] = data.agentIds || []

        // Add or remove github skills based on checkbox
        if (createdAgentIds.length > 0) {
          const githubSkills = ['github', 'gh-issues']
          const sensoSkills = ['senso-ingest', 'senso-search', 'senso-content-gen']
          if (useGithub) {
            setApplyProgress('Adding GitHub skills...')
            await fetch('/api/skills/bulk-assign', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ agentIds: createdAgentIds, addSkills: githubSkills }),
            }).catch(() => {})
          } else {
            // Remove github skills if user unchecked (template may have included them)
            setApplyProgress('Finalizing skills...')
            await fetch('/api/skills/bulk-assign', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ agentIds: createdAgentIds, addSkills: [], removeSkills: githubSkills }),
            }).catch(() => {})
          }

          if (useSenso) {
            setApplyProgress('Adding Senso skills...')
            await fetch('/api/skills/bulk-assign', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ agentIds: createdAgentIds, addSkills: sensoSkills }),
            }).catch(() => {})
          } else {
            setApplyProgress('Finalizing skills...')
            await fetch('/api/skills/bulk-assign', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ agentIds: createdAgentIds, addSkills: [], removeSkills: sensoSkills }),
            }).catch(() => {})
          }
        }

        showSuccess(`Template "${template.name}" applied successfully!`)
        setApplyProgress('Done! Refreshing workspace...')
        setTimeout(() => {
          onSuccess()
          onClose()
        }, 500)
      } else {
        setApplyProgress(null)
        showToastError(data.error || 'Failed to apply template')
        setError(data.error || 'Failed to apply template')
      }
    } catch (err) {
      setApplyProgress(null)
      showToastError('Network error')
      setError('Network error')
    } finally {
      setApplying(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-1 dark:text-gray-100">Apply Organization Template</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          <span className="font-semibold">{template.name}</span> —
          Will create {agentsToCreate.length} agent{agentsToCreate.length !== 1 ? 's' : ''}
          {template.communities && template.communities.length > 0 && `, ${template.communities.length} communit${template.communities.length !== 1 ? 'ies' : 'y'}`}
          {template.groups && template.groups.length > 0 && `, ${template.groups.length} group${template.groups.length !== 1 ? 's' : ''}`}
          {template.workflows && template.workflows.length > 0 && `, ${template.workflows.length} workflow${template.workflows.length !== 1 ? 's' : ''}`}
        </p>

        {/* Prerequisites check */}
        {prereqsLoading ? (
          <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-500 dark:text-gray-400">
            Checking prerequisites...
          </div>
        ) : prereqs && (prereqs.summary.fail > 0 || prereqs.summary.warn > 0) ? (
          <div className={`mb-4 p-3 rounded-lg border text-sm ${prereqs.summary.fail > 0 ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'}`}>
            <div className={`font-medium mb-2 ${prereqs.summary.fail > 0 ? 'text-red-800 dark:text-red-200' : 'text-amber-800 dark:text-amber-200'}`}>
              {prereqs.summary.fail > 0 ? `${prereqs.summary.fail} prerequisite(s) not met` : `${prereqs.summary.warn} warning(s)`}
            </div>
            <div className="space-y-1.5">
              {prereqs.checks.filter(c => c.status !== 'pass').map(c => (
                <div key={c.id} className="flex items-start gap-2">
                  <span className={c.status === 'fail' ? 'text-red-500' : 'text-amber-500'}>
                    {c.status === 'fail' ? '✗' : '⚠'}
                  </span>
                  <div>
                    <span className="text-gray-700 dark:text-gray-300">{c.label}: </span>
                    <span className="text-gray-500 dark:text-gray-400">{c.message}</span>
                    {c.fixHint && (
                      <div className="mt-0.5 font-mono text-xs text-gray-400 dark:text-gray-500">{c.fixHint}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {prereqs.summary.fail > 0 && (
              <div className="mt-2 pt-2 border-t border-red-200 dark:border-red-800 text-xs text-red-600 dark:text-red-400">
                You can still apply, but some features may not work. Run <code className="bg-red-100 dark:bg-red-900/40 px-1 rounded">./SYSTEM/doctor.sh --fix</code> to resolve.
              </div>
            )}
          </div>
        ) : prereqs ? (
          <div className="mb-4 p-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg text-sm text-green-700 dark:text-green-300 flex items-center gap-2">
            <span>✓</span> All prerequisites met ({prereqs.summary.pass} checks passed)
          </div>
        ) : null}

        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-sm text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200">
            {error}
          </div>
        )}

        <div className="space-y-4">
          {/* Built-in Agents Option */}
          {builtInAgents.length > 0 && (
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <input
                  id="include-built-in"
                  type="checkbox"
                  checked={includeBuiltIn}
                  onChange={e => setIncludeBuiltIn(e.target.checked)}
                  className="mt-0.5 w-4 h-4 text-purple-600 border-gray-300 dark:border-gray-600 rounded focus:ring-purple-500 dark:border-gray-600"
                />
                <div className="flex-1">
                  <label htmlFor="include-built-in" className="text-sm font-semibold text-purple-900 cursor-pointer">
                    Include built-in system agents 🤖
                  </label>
                  <p className="text-xs text-purple-700 mt-1">
                    This template includes {builtInAgents.length} built-in ClawMax system agent{builtInAgents.length !== 1 ? 's' : ''} that provide{builtInAgents.length === 1 ? 's' : ''} system functionality.
                  </p>
                  {includeBuiltIn && (
                    <div className="mt-2 bg-white dark:bg-gray-800 border border-purple-200 rounded p-2">
                      <div className="text-xs text-purple-600 font-medium mb-1">Will add:</div>
                      <div className="space-y-0.5">
                        {builtInAgents.map((agent, idx) => (
                          <div key={idx} className="text-xs flex items-center gap-2">
                            <span className="text-purple-500">🤖</span>
                            <span className="font-mono text-purple-700">{agent.id}</span>
                            <span className="text-purple-500">—</span>
                            <span className="text-purple-600">{agent.role}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {!includeBuiltIn && (
                    <p className="text-xs text-purple-600 mt-2">
                      ℹ️ You can add these agents later from the Templates page if needed.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Agent Count Parameters */}
          {template.parameters && template.parameters.length > 0 && (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 dark:bg-green-900/20 dark:border-green-700">
              <h3 className="text-sm font-semibold text-green-900 dark:text-green-200 mb-3">Team Size</h3>
              <div className="space-y-3">
                {template.parameters.map(param => (
                  <div key={param.agentId} className="flex items-center gap-3">
                    <label className="text-sm text-green-800 dark:text-green-300 flex-1">{param.label}</label>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setAgentCounts(prev => ({
                          ...prev,
                          [param.agentId]: Math.max(param.min, (prev[param.agentId] || param.default) - 1)
                        }))}
                        disabled={agentCounts[param.agentId] <= param.min}
                        className="w-8 h-8 rounded-md border border-green-300 dark:border-green-600 bg-white dark:bg-gray-800 text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors font-bold"
                      >
                        -
                      </button>
                      <span className="w-10 text-center text-lg font-bold text-green-800 dark:text-green-200">
                        {agentCounts[param.agentId] || param.default}
                      </span>
                      <button
                        onClick={() => setAgentCounts(prev => ({
                          ...prev,
                          [param.agentId]: Math.min(param.max, (prev[param.agentId] || param.default) + 1)
                        }))}
                        disabled={agentCounts[param.agentId] >= param.max}
                        className="w-8 h-8 rounded-md border border-green-300 dark:border-green-600 bg-white dark:bg-gray-800 text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors font-bold"
                      >
                        +
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-green-600 dark:text-green-400 mt-2">
                Agents will be created as {template.parameters[0]?.agentId}1, {template.parameters[0]?.agentId}2, etc.
              </p>
            </div>
          )}

          {/* Agent ID Customization */}
          <div className="bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-sky-900 dark:text-sky-200 mb-3">Agent ID Customization</h3>
            <p className="text-xs text-sky-700 dark:text-sky-400 mb-3">
              Add a prefix or suffix to avoid conflicts with existing agents. Leave blank to keep original IDs.
            </p>

            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Prefix
                </label>
                <input
                  type="text"
                  value={prefix}
                  onChange={e => setPrefix(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                  placeholder="e.g., proj1-"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Suffix
                </label>
                <input
                  type="text"
                  value={suffix}
                  onChange={e => setSuffix(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                  placeholder="e.g., -v2"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm"
                />
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 border border-sky-300 dark:border-sky-700 rounded p-2">
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Preview:</div>
              <div className="font-mono text-sm text-sky-700 dark:text-sky-400">
                {exampleAgentId} → <span className="font-semibold">{previewId}</span>
              </div>
            </div>
          </div>

          {/* External Context & Coordination */}
          <div className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">External Context & Coordination</h3>
            <div className="space-y-4">
              <div>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useGithub}
                    onChange={e => setUseGithub(e.target.checked)}
                    className="mt-0.5 rounded"
                  />
                  <div>
                    <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">GitHub</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      Use a GitHub repo for issues, PRs, code review, and shared code history. Adds `github` + `gh-issues` to all agents.
                    </div>
                  </div>
                </label>
                {useGithub && (
                  <div className="mt-3 ml-7">
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                      GitHub Repository
                    </label>
                    <input
                      type="text"
                      value={githubRepo}
                      onChange={e => {
                        const value = e.target.value
                        setGithubRepo(value)
                        if (value && template.workflows) {
                          const newOverrides = { ...workflowOverrides }
                          for (const wf of template.workflows) {
                            const content = newOverrides[wf.id] ?? (wf as any).content ?? ''
                            if (content.includes('**GitHub repo:**')) {
                              const updated = content.replace(
                                /^(-\s+\*\*GitHub repo:\*\*)\s+.*$/m,
                                `$1 ${value}`
                              )
                              if (updated !== content) newOverrides[wf.id] = updated
                            }
                          }
                          setWorkflowOverrides(newOverrides)
                        }
                      }}
                      placeholder="owner/repo-name"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm font-mono"
                    />
                    <p className="text-[10px] text-gray-400 mt-1">Agents will create issues, branches, and PRs in this repo</p>
                  </div>
                )}
              </div>

              <div>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useSenso}
                    onChange={e => setUseSenso(e.target.checked)}
                    className="mt-0.5 rounded"
                  />
                  <div>
                    <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">Senso Shared Context</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      Use Senso as the shared memory and evidence layer. Installs Senso skills into the workspace first so they show up in the Skills tab, then adds them to all agents.
                    </div>
                  </div>
                </label>
                {useSenso && (
                  <div className="mt-3 ml-7">
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Preferred Senso Folder / Context
                    </label>
                    <input
                      type="text"
                      value={sensoFolder}
                      onChange={e => setSensoFolder(e.target.value)}
                      placeholder="Optional label for evidence and briefs"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm"
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useWorkspaceFs}
                    onChange={e => setUseWorkspaceFs(e.target.checked)}
                    className="mt-0.5 rounded"
                  />
                  <div>
                    <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">Workspace File System</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      Tell agents to use the shared workspace files for drafts, notes, intermediate outputs, and cross-agent coordination artifacts.
                    </div>
                  </div>
                </label>
              </div>
            </div>
          </div>

          {/* Customize Workflows — paginated wizard */}
          {template.workflows && template.workflows.length > 0 && (
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() => { setShowWorkflowSection(!showWorkflowSection); setWorkflowStep(0) }}
                className="w-full px-4 py-3 flex items-center justify-between bg-gray-50 dark:bg-gray-900 hover:bg-gray-100 dark:bg-gray-800 transition-colors dark:bg-gray-800 dark:hover:bg-gray-700"
              >
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                  Customize Workflows ({template.workflows.length} workflow{template.workflows.length !== 1 ? 's' : ''})
                </h3>
                <span className="text-gray-400 text-xs">{showWorkflowSection ? '▼' : '▶'}</span>
              </button>
              {showWorkflowSection && (() => {
                const workflows = template.workflows || []
                const wf = workflows[workflowStep] as any
                if (!wf) return null

                const currentContent = typeof (workflowOverrides[wf.id] ?? wf.content) === 'string'
                  ? (workflowOverrides[wf.id] ?? wf.content)
                  : ''
                const isEdited = wf.id in workflowOverrides
                const editingRaw = rawEditWorkflows.has(wf.id)

                // Parse [placeholder] fields from content — detect field types
                type ConfigField = { label: string; placeholder: string; key: string; type: 'text' | 'select' | 'checkbox' | 'textarea'; options?: string[] }
                const configFields: ConfigField[] = []
                const fieldRegex = /^-\s+\*\*(.+?):\*\*\s+\[(.+?)\]/gm
                let match
                while ((match = fieldRegex.exec(wf.content || '')) !== null) {
                  const label = match[1]
                  const ph = match[2]
                  let fieldType: ConfigField['type'] = 'text'
                  let options: string[] | undefined

                  // Detect field type from placeholder hint
                  const phLower = ph.toLowerCase()
                  const commaItems = ph.split(',').map(s => s.trim()).filter(Boolean)
                  if (/^(yes|no|true|false|enabled|disabled)/i.test(phLower) || /\btrue\/false\b|\byes\/no\b/i.test(phLower)) {
                    fieldType = 'checkbox'
                  } else if (commaItems.length >= 3 && !phLower.startsWith('e.g.')) {
                    // 3+ comma-separated options = dropdown
                    fieldType = 'select'
                    options = commaItems
                  } else if (phLower.includes('list') || phLower.includes('multiple')) {
                    fieldType = 'textarea'
                  }

                  configFields.push({ label, placeholder: ph, key: label, type: fieldType, options })
                }

                const fieldKey = (label: string) => `${wf.id}::${label}`

                const getFieldValue = (label: string): string => {
                  // Use local input state if available, otherwise parse from markdown
                  const localVal = fieldInputs[fieldKey(label)]
                  if (localVal !== undefined) return localVal
                  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
                  const lineRegex = new RegExp(`^-\\s+\\*\\*${escaped}:\\*\\*\\s+(.+)$`, 'm')
                  const m = currentContent.match(lineRegex)
                  if (!m) return ''
                  const val = m[1].trim()
                  return val.startsWith('[') ? '' : val
                }

                const setFieldValue = (label: string, value: string) => {
                  // Update local state immediately for responsive typing
                  setFieldInputs(prev => ({ ...prev, [fieldKey(label)]: value }))
                }

                // Sync local field value back to markdown content
                const syncFieldToMarkdown = (label?: string) => {
                  setWorkflowOverrides(prev => {
                    let content = typeof (prev[wf.id] ?? wf.content) === 'string'
                      ? (prev[wf.id] ?? wf.content) : ''
                    const fieldsToSync = label ? [{ label }] : configFields
                    for (const f of fieldsToSync) {
                      const val = fieldInputs[fieldKey(f.label)]
                      if (val === undefined) continue
                      const escaped = f.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
                      const lineRegex = new RegExp(`^(-\\s+\\*\\*${escaped}:\\*\\*)\\s+.*$`, 'm')
                      if (lineRegex.test(content)) {
                        content = content.replace(lineRegex, `$1 ${val || '[...]'}`)
                      }
                    }
                    return { ...prev, [wf.id]: content }
                  })
                }

                return (
                <div className="p-4">
                  {/* Step indicator */}
                  <div className="flex items-center gap-1.5 mb-3">
                    {workflows.map((_: any, idx: number) => (
                      <button
                        key={idx}
                        onClick={() => setWorkflowStep(idx)}
                        className={`h-1.5 rounded-full transition-all ${idx === workflowStep ? 'bg-purple-500 w-6' : 'bg-gray-200 dark:bg-gray-700 w-3 hover:bg-gray-300'}`}
                        title={workflows[idx].name}
                      />
                    ))}
                    <span className="text-[10px] text-gray-400 ml-2">{workflowStep + 1} / {workflows.length}</span>
                  </div>

                  {/* Current workflow */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{wf.name}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 font-mono">{wf.schedule}</span>
                      {isEdited && (
                        <button onClick={() => { const next = { ...workflowOverrides }; delete next[wf.id]; setWorkflowOverrides(next) }} className="text-[10px] text-sky-600 hover:text-sky-700">Reset</button>
                      )}
                    </div>
                    <button
                      onClick={() => { const next = new Set(rawEditWorkflows); if (next.has(wf.id)) next.delete(wf.id); else next.add(wf.id); setRawEditWorkflows(next) }}
                      className="text-[10px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    >
                      {editingRaw ? 'Form view' : 'Edit markdown'}
                    </button>
                  </div>
                  {wf.description && <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">{wf.description}</p>}

                  {editingRaw ? (
                    <textarea
                      value={currentContent}
                      onChange={e => setWorkflowOverrides(prev => ({ ...prev, [wf.id]: e.target.value }))}
                      rows={Math.min(14, Math.max(4, currentContent.split('\n').length + 1))}
                      className="w-full text-xs font-mono px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-sky-500 resize-y"
                    />
                  ) : configFields.length > 0 ? (
                    <div className="space-y-3">
                      {configFields.map(field => (
                        <div key={field.key}>
                          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">{field.label}</label>
                          {field.type === 'checkbox' ? (
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={getFieldValue(field.label).toLowerCase() === 'true' || getFieldValue(field.label).toLowerCase() === 'yes'}
                                onChange={e => { setFieldValue(field.label, e.target.checked ? 'yes' : 'no'); setTimeout(() => syncFieldToMarkdown(field.label)) }}
                                className="rounded"
                              />
                              <span className="text-sm text-gray-600 dark:text-gray-400">{field.placeholder}</span>
                            </label>
                          ) : field.type === 'select' && field.options ? (
                            <select
                              value={getFieldValue(field.label)}
                              onChange={e => { setFieldValue(field.label, e.target.value); setTimeout(() => syncFieldToMarkdown(field.label)) }}
                              className="w-full px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                            >
                              <option value="">Select...</option>
                              {field.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                            </select>
                          ) : field.type === 'textarea' ? (
                            <textarea
                              value={getFieldValue(field.label)}
                              onChange={e => setFieldValue(field.label, e.target.value)}
                              onBlur={() => syncFieldToMarkdown(field.label)}
                              placeholder={field.placeholder}
                              rows={3}
                              className="w-full px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-sky-500 resize-y"
                            />
                          ) : (
                            <input
                              type="text"
                              value={getFieldValue(field.label)}
                              onChange={e => setFieldValue(field.label, e.target.value)}
                              onBlur={() => syncFieldToMarkdown(field.label)}
                              placeholder={field.placeholder}
                              className="w-full px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <textarea
                      value={currentContent}
                      onChange={e => setWorkflowOverrides(prev => ({ ...prev, [wf.id]: e.target.value }))}
                      rows={Math.min(8, Math.max(3, currentContent.split('\n').length + 1))}
                      className="w-full text-xs font-mono px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-sky-500 resize-y"
                    />
                  )}

                  {/* Navigation */}
                  <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100 dark:border-gray-700">
                    <button
                      onClick={() => { syncFieldToMarkdown(); setWorkflowStep(Math.max(0, workflowStep - 1)) }}
                      disabled={workflowStep === 0}
                      className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 disabled:opacity-30 disabled:cursor-not-allowed font-medium"
                    >
                      ← Previous
                    </button>
                    <span className="text-xs text-gray-400">{wf.name}</span>
                    <button
                      onClick={() => { syncFieldToMarkdown(); setWorkflowStep(Math.min(workflows.length - 1, workflowStep + 1)) }}
                      disabled={workflowStep >= workflows.length - 1}
                      className="text-sm text-purple-600 hover:text-purple-700 dark:text-purple-400 dark:hover:text-purple-300 disabled:opacity-30 disabled:cursor-not-allowed font-medium"
                    >
                      Next →
                    </button>
                  </div>
                </div>
                )
              })()}
            </div>
          )}

          {/* Agent List with Models (collapsible) */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden dark:border-gray-700">
            <button
              type="button"
              onClick={() => setShowModelSection(!showModelSection)}
              className="w-full px-4 py-3 flex items-center justify-between bg-gray-50 dark:bg-gray-900 hover:bg-gray-100 dark:bg-gray-800 transition-colors dark:bg-gray-800 dark:hover:bg-gray-700"
            >
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                Agents, Skills & Models ({agentsToCreate.length} agent{agentsToCreate.length !== 1 ? 's' : ''})
              </h3>
              <span className="text-gray-400 text-xs">{showModelSection ? '▼' : '▶'}</span>
            </button>

            {showModelSection && (
              <div className="p-4 space-y-3 border-t border-gray-200 dark:border-gray-700">
                {/* Agent table with models */}
                <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden dark:border-gray-700 dark:bg-gray-900">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-100 dark:bg-gray-800">
                        <th className="px-3 py-2 text-left text-gray-600 dark:text-gray-400">Agent</th>
                        <th className="px-3 py-2 text-left text-gray-600 dark:text-gray-400">Role</th>
                        <th className="px-3 py-2 text-left text-gray-600 dark:text-gray-400">Skills</th>
                        <th className="px-3 py-2 text-left text-gray-600 dark:text-gray-400">Model</th>
                      </tr>
                    </thead>
                    <tbody>
                      {agentsToCreate.map((agent, idx) => {
                        const newId = `${prefix}${agent.id}${suffix}`
                        const effectiveModel = modelOverride || agent.model || 'not set'
                        const isOverridden = modelOverride && agent.model && modelOverride !== agent.model
                        return (
                          <tr key={idx} className="border-t border-gray-100 dark:border-gray-800">
                            <td className="px-3 py-2 font-mono font-medium text-sky-700 dark:text-sky-400">{newId}</td>
                            <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{agent.role}</td>
                            <td className="px-3 py-2">
                              {agent.skills && agent.skills.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {agent.skills.map(s => (
                                    <span key={s} className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-700">{s}</span>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-gray-400">none</span>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              <span className={isOverridden ? 'text-amber-600 dark:text-amber-400' : 'text-gray-600 dark:text-gray-400'}>
                                {effectiveModel}
                              </span>
                              {isOverridden && <span className="ml-1 text-amber-500" title={`Template default: ${agent.model}`}>*</span>}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Model override dropdown */}
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 dark:bg-amber-900/20 dark:border-amber-700">
                  <label className="text-xs font-medium text-amber-900 dark:text-amber-200">Override model for all agents:</label>
                  <select
                    value={modelOverride}
                    onChange={e => setModelOverride(e.target.value)}
                    disabled={!modelsLoaded}
                    className="w-full mt-1 px-3 py-2 border border-amber-300 rounded-md text-sm bg-white dark:bg-gray-800 dark:border-amber-600 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="">{modelsLoaded ? 'Use template defaults' : 'Loading models...'}</option>
                    {modelsLoaded && Object.keys(modelsByProvider).length > 0 ? (
                      Object.entries(modelsByProvider).map(([providerId, provider]) => (
                        <optgroup key={providerId} label={provider.name || providerId}>
                          {provider.models.map(m => <option key={m} value={m}>{m}</option>)}
                        </optgroup>
                      ))
                    ) : modelsLoaded ? (
                      availableModels.map(m => <option key={m} value={m}>{m}</option>)
                    ) : null}
                    {modelsLoaded && Object.keys(modelsByProvider).length === 0 && availableModels.length === 0 && (
                      <option value="" disabled>No models available</option>
                    )}
                  </select>
                  {modelLoadError && (
                    <p className="text-xs text-amber-700 dark:text-amber-300 mt-2 dark:text-amber-500">
                      {modelLoadError}. You can still apply with template defaults.
                    </p>
                  )}
                  {!modelLoadError && modelsLoaded && Object.keys(modelsByProvider).length === 0 && availableModels.length === 0 && (
                    <p className="text-xs text-amber-700 dark:text-amber-300 mt-2 dark:text-amber-500">
                      No discovered models are available right now. You can still apply with template defaults.
                    </p>
                  )}
                  {modelOverride && (
                    <p className="text-xs text-amber-600 mt-2 dark:text-amber-400">
                      ⚠ Changing the model may affect agent behavior. Templates are tested with their default models.
                    </p>
                  )}
                  <p className="text-xs text-amber-700 dark:text-amber-300 mt-2 dark:text-amber-500">
                    You can also change individual agent models after import via the agent's Edit Config menu.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-md hover:bg-gray-50 dark:bg-gray-900 transition-colors dark:bg-gray-900 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700"
            disabled={applying}
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            disabled={applying}
            className="px-4 py-2 text-sm bg-sky-600 text-white rounded-md hover:bg-sky-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium"
          >
            {applying && applyProgress ? applyProgress : applying ? 'Applying...' : '⚡ Apply Template'}
          </button>
        </div>
      </div>
    </div>
  )
}
