import React, { useEffect, useRef, useState } from 'react'
import { readStoredByokKeys, fetchModelsWithByok } from '../lib/byok'
import { useAuth } from '../contexts/AuthContext'

const PREDEFINED_TAGS = [
  'assistant',
  'engineer',
  'project-manager',
  'analyst',
  'designer',
  'researcher',
]

interface WizardProps {
  onClose: () => void
  onDone: () => void
  defaultCloneFrom?: string
  startWithAI?: boolean
}

type Step = 1 | 2 | 3 | 4 | 5

interface FormState {
  name: string
  model: string
  cloneFrom: string
  templateSlug: string
  whatsapp: string
  port: number
  tags: string[]
  customTag: string
  aiDescription: string
  useAI: boolean
}

interface GeneratedFiles {
  identity: string
  soul: string
  tools: string
}

interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

export default function AddAgentWizard({ onClose, onDone, defaultCloneFrom, startWithAI }: WizardProps) {
  const [step, setStep] = useState<Step>(startWithAI ? 2 : 1)
  const [form, setForm] = useState<FormState>({
    name: '',
    model: '',
    cloneFrom: defaultCloneFrom || '',
    templateSlug: '',
    whatsapp: '',
    port: 0,
    tags: [],
    customTag: '',
    aiDescription: '',
    useAI: false,
  })
  const [suggested, setSuggested] = useState<{ id: string; port: number } | null>(null)
  const [existingAgents, setExistingAgents] = useState<string[]>([])
  const [availableModels, setAvailableModels] = useState<string[]>([])
  const [modelsLoaded, setModelsLoaded] = useState(false)
  const [modelsByProvider, setModelsByProvider] = useState<Record<string, { name: string; models: string[] }>>({})
  const [agentTemplates, setAgentTemplates] = useState<Array<{
    name: string
    slug: string
    description?: string
    tags?: string[]
    metadata?: any
    agents?: any[]
  }>>([])
  const [logs, setLogs] = useState<string[]>([])
  const [provisioning, setProvisioning] = useState(false)
  const [done, setDone] = useState(false)
  const [provError, setProvError] = useState<string | null>(null)
  const logRef = useRef<HTMLDivElement>(null)
  const [generatedFiles, setGeneratedFiles] = useState<GeneratedFiles | null>(null)
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)
  const [preFilled, setPreFilled] = useState(false)
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const [validationWarnings, setValidationWarnings] = useState<string[]>([])
  const [validatingProvision, setValidatingProvision] = useState(false)

  // Fetch available models, suggested ID + port and existing agents list on mount
  useEffect(() => {
    // Fetch available models based on API keys (includes BYOK)
    fetchModelsWithByok()
      .then(d => {
        const models = d.models || []
        setAvailableModels(models)
        setModelsLoaded(true)
        setModelsByProvider(d.modelsByProvider || {})

        // Pick best model based on configured keys
        if (models.length > 0) {
          // Check BYOK preference first, then server recommendation
          const byokPreferred = readStoredByokKeys().preferredModel
          fetch('/api/auth/config').then(r => r.json()).then(cfg => {
            const recommended = byokPreferred || cfg.recommendedModel
            if (recommended && models.includes(recommended)) {
              setForm(f => ({ ...f, model: recommended }))
            } else {
              // Fallback: check BYOK keys
              const byok = readStoredByokKeys()
              const hasAnthropicKey = !!(byok.anthropic || cfg.systemKeyDefaults?.anthropic)
              const hasOpenAiKey = !!(byok.openai || cfg.systemKeyDefaults?.openai)
              const hasGeminiKey = !!(byok.geminiApiKey || cfg.systemKeyDefaults?.gemini)
              const hasOllama = !!(byok.ollamaBaseUrl || byok.ollamaDefaultModel)

              let defaultModel: string
              if (hasOllama) {
                const preferredOllama = byok.ollamaDefaultModel ? `ollama/${byok.ollamaDefaultModel}` : ''
                defaultModel = (preferredOllama && models.find((m: string) => m === preferredOllama))
                  || models.find((m: string) => m.startsWith('ollama/'))
                  || models[0]
              } else if (hasOpenAiKey) {
                defaultModel = models.find((m: string) => m === 'openai/gpt-5' || m === 'openai/gpt-4o')
                  || models.find((m: string) => m.startsWith('openai/'))
                  || models[0]
              } else if (hasGeminiKey) {
                defaultModel = models.find((m: string) => m === 'gemini/gemini-2.5-pro' || m === 'gemini/gemini-2.5-flash')
                  || models.find((m: string) => m.startsWith('gemini/'))
                  || models[0]
              } else if (hasAnthropicKey) {
                defaultModel = models.find((m: string) => m.includes('claude-opus') || m.includes('claude-sonnet'))
                  || models.find((m: string) => m.startsWith('anthropic/'))
                  || models[0]
              } else {
                defaultModel = models[0]
              }
              setForm(f => ({ ...f, model: defaultModel }))
            }
          }).catch(() => {
            setForm(f => ({ ...f, model: models[0] }))
          })
        }
      })
      .catch(() => { setModelsLoaded(true) })

    // If cloning, skip initial fetch - the cloneFrom effect will handle it
    if (!defaultCloneFrom) {
      fetch('/api/agents/next')
        .then(r => r.json())
        .then(d => {
          setSuggested(d)
          setForm(f => ({ ...f, name: d.id, port: d.port }))
        })
        .catch(() => {})
    }
    fetch('/api/agents')
      .then(r => r.json())
      .then(d => setExistingAgents((d.agents as { id: string }[]).map(a => a.id)))
      .catch(() => {})

    // Fetch agent templates
    fetch('/api/templates/agents')
      .then(r => r.json())
      .then(d => {
        const templates = (d.templates || []).map((t: any) => ({
          name: t.name,
          slug: t.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
          description: t.description,
          tags: t.tags || [],
          metadata: t.metadata || {},
          agents: t.agents || []
        }))
        setAgentTemplates(templates)
      })
      .catch(() => {})
  }, [])

  // Pre-fill form when template is selected
  useEffect(() => {
    if (!form.templateSlug) return

    const template = agentTemplates.find(t => t.slug === form.templateSlug)
    if (!template) return

    // Build updates to apply
    const updates: Partial<FormState> = {}

    // Pre-fill tags from template
    if (template.tags && template.tags.length > 0) {
      updates.tags = template.tags
    }

    // Pre-fill AI description from template metadata
    if (template.metadata?.aiPrompt) {
      updates.aiDescription = template.metadata.aiPrompt
      updates.useAI = true
    }

    // Apply all updates in one setState call
    if (Object.keys(updates).length > 0) {
      setForm(f => ({ ...f, ...updates }))
    }

    setPreFilled(true)
  }, [form.templateSlug, agentTemplates])

  // Auto-scroll logs
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [logs])

  // Fetch and pre-populate from cloneFrom agent's metadata
  useEffect(() => {
    if (!form.cloneFrom) {
      // Only reset preFilled if there's also no template selected
      if (!form.templateSlug) {
        setPreFilled(false)
      }
      // Reset to default agent name suggestion
      fetch('/api/agents/next')
        .then(r => r.json())
        .then(d => setForm(f => ({ ...f, name: d.id, port: d.port })))
        .catch(() => {})
      return
    }

    // Fetch suggested name for cloned agent
    fetch(`/api/agents/next?cloneFrom=${form.cloneFrom}`)
      .then(r => r.json())
      .then(d => setForm(f => ({ ...f, name: d.id, port: d.port })))
      .catch(() => {})

    // Fetch metadata to pre-populate fields
    fetch(`/api/agents/${form.cloneFrom}/identity`)
      .then(r => r.json())
      .then(data => {
        if (data.metadata) {
          let hasPreFilled = false

          // Pre-populate model if it exists in metadata
          if (data.metadata.model && data.metadata.model !== 'default') {
            set('model', data.metadata.model)
            hasPreFilled = true
          }

          // Pre-populate tags if they exist in metadata
          if (data.metadata.tags && Array.isArray(data.metadata.tags) && data.metadata.tags.length > 0) {
            set('tags', data.metadata.tags)
            hasPreFilled = true
          }

          // Pre-populate AI description if it exists in metadata
          if (data.metadata.aiDescription) {
            set('aiDescription', data.metadata.aiDescription)
            hasPreFilled = true
          }

          setPreFilled(hasPreFilled)
        }
      })
      .catch(err => console.error('Failed to fetch clone source metadata:', err))
  }, [form.cloneFrom, form.templateSlug])

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm(f => ({ ...f, [k]: v }))
  }

  const nameOk = /^[a-z][a-z0-9_-]*$/.test(form.name)
  const canNext: Record<Step, boolean> = {
    1: nameOk && form.model.length > 0,
    2: true, // AI generation is optional
    3: true, // whatsapp is optional
    4: true, // port/profile optional
    5: false, // provision button handles this
  }

  async function generateWithAI() {
    if (!form.aiDescription.trim()) return
    setGenerating(true)
    setGenError(null)

    try {
      // When using AI Generate, let the AI suggest the name (don't send auto-generated "agent0" etc.)
      const isAutoName = /^agent\d+$/.test(form.name) || !form.name
      const byok = readStoredByokKeys()
      const resp = await fetch('/api/agents/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: form.aiDescription,
          name: isAutoName ? undefined : form.name,
          tags: form.tags.length > 0 ? form.tags : undefined,
          suggestMeta: true,
          byokKeys: (byok.openai || byok.anthropic) ? { openai: byok.openai, anthropic: byok.anthropic } : undefined,
        }),
      })

      if (!resp.ok) {
        const err = await resp.text()
        setGenError(err || 'Generation failed')
        setGenerating(false)
        return
      }

      const data = await resp.json()
      let files: GeneratedFiles = { identity: data.identity, soul: data.soul, tools: data.tools }

      // Apply AI-suggested name, tags, model — sanitize name to valid agent ID format
      const sanitizeName = (n: string) => n.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/--+/g, '-').replace(/^-|-$/g, '')
      const aiName = data.suggestedName ? sanitizeName(data.suggestedName) : form.name
      if (data.suggestedName) set('name', aiName)
      if (data.suggestedTags?.length > 0) set('tags', [...new Set(data.suggestedTags)])
      if (data.suggestedModel) set('model', data.suggestedModel)

      // Update IDENTITY.md with the AI-suggested name (replace placeholder)
      if (data.suggestedName && files.identity) {
        files = {
          ...files,
          identity: files.identity
            .replace(/\*\*Name:\*\*\s*.*/m, `**Name:** ${aiName}`)
            .replace(/\*\*Tags:\*\*.*/m, `**Tags:** ${[...new Set(data.suggestedTags || [])].join(', ')}`)
        }
      }

      setGeneratedFiles(files)
      set('useAI', true)

      setGenerating(false)
    } catch (e) {
      setGenError(String(e))
      setGenerating(false)
    }
  }

  async function provision() {
    setValidatingProvision(true)
    setProvError(null)

    try {
      const validationResp = await fetch('/api/agents/validate-provision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          model: form.model,
          cloneFrom: form.cloneFrom || undefined,
          templateSlug: form.templateSlug || undefined,
          whatsapp: form.whatsapp || undefined,
          port: form.port || undefined,
          tags: [...new Set(form.tags)],
          generatedFiles: generatedFiles || undefined,
        }),
      })
      const validation = await validationResp.json() as ValidationResult
      setValidationErrors(Array.isArray(validation.errors) ? validation.errors : [])
      setValidationWarnings(Array.isArray(validation.warnings) ? validation.warnings : [])

      if (!validationResp.ok || !validation.valid) {
        setProvError((validation.errors || []).join('\n') || 'Validation failed')
        setValidatingProvision(false)
        return
      }
    } catch (e) {
      setProvError(`Failed to validate agent config: ${String(e)}`)
      setValidatingProvision(false)
      return
    }

    setValidatingProvision(false)
    setProvisioning(true)
    setProvError(null)
    setLogs([])

    const body: Record<string, unknown> = {
      name: form.name,
      model: form.model,
    }
    if (form.cloneFrom) body.cloneFrom = form.cloneFrom
    if (form.templateSlug) body.templateSlug = form.templateSlug
    if (form.whatsapp) body.whatsapp = form.whatsapp
    if (form.port > 0) body.port = form.port
    if (form.tags.length > 0) body.tags = [...new Set(form.tags)]
    if (form.aiDescription) body.aiDescription = form.aiDescription
    if (generatedFiles) body.generatedFiles = generatedFiles
    body.profile = true  // always use profile mode (isolated ~/.openclaw-<name>/ state dir)

    try {
      const resp = await fetch('/api/agents/provision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!resp.ok || !resp.body) {
        setProvError('Server error')
        setProvisioning(false)
        return
      }

      const reader = resp.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''

      while (true) {
        const { done: streamDone, value } = await reader.read()
        if (streamDone) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const msg = JSON.parse(line.slice(6)) as { type: string; data: string }
            if (msg.type === 'log' || msg.type === 'start') {
              setLogs(l => [...l, msg.data])
            } else if (msg.type === 'done') {
              if (msg.data === 'ok') {
                setDone(true)
              } else {
                setProvError(`Setup failed: ${msg.data}`)
              }
              setProvisioning(false)
            } else if (msg.type === 'error') {
              setProvError(msg.data)
              setProvisioning(false)
            }
          } catch {}
        }
      }
    } catch (e) {
      setProvError(String(e))
      setProvisioning(false)
    }
  }

  // Config preview JSON
  const preview = {
    name: form.name || suggested?.id || '…',
    model: form.model,
    ...(form.cloneFrom ? { clone_from: form.cloneFrom } : {}),
    ...(form.whatsapp ? { whatsapp: form.whatsapp } : {}),
    port: form.port !== '' ? form.port : suggested?.port ?? '…',
    state_dir: `~/.openclaw-${form.name || suggested?.id || '…'}`,
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full sm:w-[560px] mx-2 sm:mx-0 max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between shrink-0">
          <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200">Add Agent</h2>
          <button
            onClick={onClose}
            disabled={provisioning}
            className="text-gray-400 hover:text-gray-600 dark:text-gray-400 transition-colors text-lg leading-none"
          >×</button>
        </div>

        {/* Step indicators */}
        <div className="px-6 pt-4 pb-2 flex items-center gap-2 shrink-0">
          {([1, 2, 3, 4, 5] as Step[]).map(s => (
            <React.Fragment key={s}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                s < step ? 'bg-sky-600 text-white' :
                s === step ? 'bg-sky-100 text-sky-700 ring-2 ring-sky-400' :
                'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500'
              }`}>
                {s < step ? '✓' : s}
              </div>
              {s < 5 && <div className={`flex-1 h-0.5 rounded ${s < step ? 'bg-sky-400' : 'bg-gray-200'}`} />}
            </React.Fragment>
          ))}
        </div>

        {/* Step labels */}
        <div className="px-6 pb-3 flex justify-between shrink-0">
          {['Identity', 'AI Agent', 'Channel', 'Deploy', 'Provision'].map((label, i) => (
            <span key={label} className={`text-xs ${step === i + 1 ? 'text-sky-600 font-medium' : 'text-gray-400'}`}>
              {label}
            </span>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 pb-4">

          {/* Step 1: Identity + Model */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Agent name <span className="text-red-400">*</span></label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => set('name', e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                  placeholder={suggested?.id ?? 'max1'}
                  className={`w-full px-3 py-2 text-sm border rounded-md outline-none transition-colors font-mono bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 ${
                    form.name && !nameOk ? 'border-red-300 dark:border-red-700 bg-red-50 dark:border-red-700 dark:bg-red-900/30' : 'border-gray-200 dark:border-gray-700 focus:border-sky-400 dark:focus:border-sky-600'
                  }`}
                />
                <p className="mt-1 text-xs text-gray-400">Lowercase letters, numbers, hyphens. Suggested: <strong>{suggested?.id ?? '…'}</strong></p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Model <span className="text-red-400">*</span>
                  {preFilled && <span className="ml-2 text-xs text-sky-600">⚡ Pre-filled from {form.cloneFrom}</span>}
                </label>
                <select
                  value={form.model}
                  onChange={e => set('model', e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-md outline-none focus:border-sky-400 bg-white dark:bg-gray-800 dark:border-gray-700"
                  disabled={availableModels.length === 0}
                >
                  {availableModels.length === 0 && (
                    <option value="">{modelsLoaded ? 'No models available — add API keys to .env' : 'Loading models...'}</option>
                  )}
                  {Object.keys(modelsByProvider).length > 0 ? (
                    Object.entries(modelsByProvider).map(([providerId, provider]) => (
                      <optgroup key={providerId} label={provider.name || providerId}>
                        {provider.models.map(m => <option key={m} value={m}>{m}</option>)}
                      </optgroup>
                    ))
                  ) : (
                    availableModels.map(m => <option key={m} value={m}>{m}</option>)
                  )}
                </select>
                {modelsLoaded && availableModels.length === 0 && (
                  <p className="mt-1 text-xs text-amber-600">
                    No models are available yet. Configure OpenAI, Anthropic, Gemini, or a local Ollama runtime in Workspaces Integrations.
                  </p>
                )}
              </div>
              {agentTemplates.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    Create from template <span className="text-gray-400">(optional)</span>
                    {preFilled && form.templateSlug && <span className="ml-2 text-xs text-sky-600">⚡ Pre-filled from template</span>}
                  </label>
                  <select
                    value={form.templateSlug}
                    onChange={e => {
                      set('templateSlug', e.target.value)
                      if (e.target.value) {
                        set('cloneFrom', '')  // Clear cloneFrom if template selected
                      } else {
                        // Clear pre-filled data when deselecting template
                        set('tags', [])
                        set('aiDescription', '')
                        set('useAI', false)
                        setPreFilled(false)
                      }
                    }}
                    className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-md outline-none focus:border-sky-400 bg-white dark:bg-gray-800 dark:border-gray-700"
                    disabled={!!form.cloneFrom}
                  >
                    <option value="">— Choose a template —</option>
                    {agentTemplates.map(t => (
                      <option key={t.slug} value={t.slug}>
                        {t.name} {t.description ? `- ${t.description}` : ''}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-gray-400">
                    {form.templateSlug
                      ? 'Tags and description will be pre-filled from template'
                      : 'Use a saved template as starting point (SOUL, IDENTITY, TOOLS)'}
                  </p>
                </div>
              )}
              {existingAgents.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Or clone from agent <span className="text-gray-400">(optional)</span></label>
                  <select
                    value={form.cloneFrom}
                    onChange={e => {
                      set('cloneFrom', e.target.value)
                      if (e.target.value) set('templateSlug', '')  // Clear template if clone selected
                    }}
                    className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-md outline-none focus:border-sky-400 bg-white dark:bg-gray-800 dark:border-gray-700"
                    disabled={!!form.templateSlug}
                  >
                    <option value="">— Fresh setup —</option>
                    {existingAgents.map(id => <option key={id} value={id}>{id}</option>)}
                  </select>
                  <p className="mt-1 text-xs text-gray-400">Copies all files from an existing agent.</p>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Tags <span className="text-gray-400">(optional)</span></label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {PREDEFINED_TAGS.map(tag => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => {
                        if (form.tags.includes(tag)) {
                          set('tags', form.tags.filter(t => t !== tag))
                        } else {
                          set('tags', [...form.tags, tag])
                        }
                      }}
                      className={`px-2 py-1 text-xs rounded border transition-colors ${
                        form.tags.includes(tag)
                          ? 'bg-sky-100 border-sky-400 text-sky-700'
                          : 'bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:border-gray-600'
                      }`}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={form.customTag}
                    onChange={e => set('customTag', e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && form.customTag.trim()) {
                        e.preventDefault()
                        const tag = form.customTag.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-')
                        if (tag && !form.tags.includes(tag)) {
                          set('tags', [...form.tags, tag])
                          set('customTag', '')
                        }
                      }
                    }}
                    placeholder="Add custom tag (press Enter)"
                    className="flex-1 px-3 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-md outline-none focus:border-sky-400 dark:focus:border-sky-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const tag = form.customTag.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-')
                      if (tag && !form.tags.includes(tag)) {
                        set('tags', [...form.tags, tag])
                        set('customTag', '')
                      }
                    }}
                    disabled={!form.customTag.trim()}
                    className="px-3 py-1.5 text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded border border-gray-200 dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors dark:border-gray-700 dark:bg-gray-800"
                  >
                    Add
                  </button>
                </div>
                {form.tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {form.tags.map(tag => (
                      <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-sky-50 dark:bg-sky-900/30 border border-sky-200 dark:border-sky-700 text-sky-700 dark:text-sky-400 rounded">
                        {tag}
                        <button
                          type="button"
                          onClick={() => set('tags', form.tags.filter(t => t !== tag))}
                          className="text-sky-600 dark:text-sky-400 hover:text-sky-800 dark:hover:text-sky-300"
                        >×</button>
                      </span>
                    ))}
                  </div>
                )}
                <p className="mt-1 text-xs text-gray-400">Tags help organize agents (e.g., assistant, engineer, project-manager)</p>
              </div>
            </div>
          )}

          {/* Step 2: AI Generation (Optional) */}
          {step === 2 && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Optionally use AI to generate your agent's personality files (IDENTITY, SOUL, TOOLS). Skip this step to clone or create from scratch.
              </p>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Describe your agent <span className="text-gray-400">(optional)</span></label>
                <textarea
                  value={form.aiDescription}
                  onChange={e => set('aiDescription', e.target.value)}
                  placeholder="e.g., A friendly project manager who helps track tasks and deadlines..."
                  className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-md outline-none focus:border-sky-400 dark:focus:border-sky-600 h-24 resize-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                  disabled={generating || !!generatedFiles}
                />
              </div>

              <button
                onClick={generateWithAI}
                disabled={!form.aiDescription.trim() || generating || !!generatedFiles}
                className={`w-full px-4 py-2 text-sm rounded font-medium transition-colors ${
                  generating || !!generatedFiles
                    ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed'
                    : !form.aiDescription.trim()
                    ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed'
                    : 'bg-sky-600 text-white hover:bg-sky-700'
                }`}
              >
                {generating ? 'Generating...' : generatedFiles ? '✓ Generated' : 'Generate with AI'}
              </button>

              {genError && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-400">{genError}</div>
              )}

              {generatedFiles && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400 font-medium">
                    <span>✓</span>
                    <span>Files generated successfully</span>
                  </div>

                  <div className="space-y-2">
                    <details className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg dark:border-gray-700 dark:bg-gray-900">
                      <summary className="px-3 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 cursor-pointer hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700">
                        IDENTITY.md Preview
                      </summary>
                      <pre className="px-3 py-2 text-xs text-gray-600 dark:text-gray-400 whitespace-pre-wrap border-t border-gray-200 dark:border-gray-700">
                        {generatedFiles.identity}
                      </pre>
                    </details>

                    <details className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg dark:border-gray-700 dark:bg-gray-900">
                      <summary className="px-3 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 cursor-pointer hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700">
                        SOUL.md Preview
                      </summary>
                      <pre className="px-3 py-2 text-xs text-gray-600 dark:text-gray-400 whitespace-pre-wrap border-t border-gray-200 dark:border-gray-700">
                        {generatedFiles.soul}
                      </pre>
                    </details>

                    <details className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg dark:border-gray-700 dark:bg-gray-900">
                      <summary className="px-3 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 cursor-pointer hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700">
                        TOOLS.md Preview
                      </summary>
                      <pre className="px-3 py-2 text-xs text-gray-600 dark:text-gray-400 whitespace-pre-wrap border-t border-gray-200 dark:border-gray-700">
                        {generatedFiles.tools}
                      </pre>
                    </details>
                  </div>

                  <button
                    onClick={() => {
                      setGeneratedFiles(null)
                      set('useAI', false)
                    }}
                    className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-300 underline dark:text-gray-300"
                  >
                    Start over
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Channel (WhatsApp) */}
          {step === 3 && (
            <div className="space-y-4">
              <p className="text-sm text-gray-500">Optionally link a WhatsApp number to this agent. Leave blank to skip.</p>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">WhatsApp number <span className="text-gray-400">(optional)</span></label>
                <input
                  type="text"
                  value={form.whatsapp}
                  onChange={e => set('whatsapp', e.target.value.replace(/[^0-9+]/g, ''))}
                  placeholder="12345…"
                  className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-md outline-none focus:border-sky-400 dark:focus:border-sky-600 font-mono bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                />
                <p className="mt-1 text-xs text-gray-400">International format, no spaces — <span className="text-amber-600 font-medium">replace with your actual number</span></p>
              </div>
            </div>
          )}

          {/* Step 4: Deployment */}
          {step === 4 && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Gateway port <span className="text-gray-400">(optional)</span></label>
                <input
                  type="number"
                  value={form.port || ''}
                  onChange={e => set('port', e.target.value ? parseInt(e.target.value, 10) : 0)}
                  placeholder={String(suggested?.port ?? 18789)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-md outline-none focus:border-sky-400 dark:focus:border-sky-600 font-mono bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                />
                <p className="mt-1 text-xs text-gray-400">Suggested: <strong>{suggested?.port ?? '…'}</strong></p>
              </div>
              <div className="p-3 bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 rounded-lg text-xs text-sky-700 dark:text-sky-300">
                State will be isolated under <code className="font-mono">~/.openclaw-{form.name || suggested?.id || 'name'}/</code> with its own gateway and credentials.
              </div>
            </div>
          )}

          {/* Step 5: Review + Provision */}
          {step === 5 && (
            <div className="space-y-4">
              {!provisioning && !done && !provError && (
                <>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Review the configuration and click <strong>Provision</strong> to run <code>setup.sh</code>.</p>
                  <pre className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4 text-xs font-mono text-gray-700 dark:text-gray-300 overflow-x-auto dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
                    {JSON.stringify(preview, null, 2)}
                  </pre>
                </>
              )}

              {validationErrors.length > 0 && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-400 whitespace-pre-line">
                  <div className="font-medium mb-1">Validation errors</div>
                  {validationErrors.join('\n')}
                </div>
              )}

              {validationWarnings.length > 0 && (
                <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 rounded-lg text-sm text-amber-800 dark:text-amber-200 whitespace-pre-line">
                  <div className="font-medium mb-1">Warnings</div>
                  {validationWarnings.join('\n')}
                </div>
              )}

              {/* Log stream */}
              {(provisioning || logs.length > 0) && (
                <div
                  ref={logRef}
                  className="bg-gray-900 text-green-400 font-mono text-xs rounded-lg p-3 h-48 overflow-y-auto whitespace-pre-wrap"
                >
                  {logs.join('')}
                  {provisioning && <span className="animate-pulse">▌</span>}
                </div>
              )}

              {provError && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-400">{provError}</div>
              )}

              {done && (
                <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg text-sm text-green-700 dark:text-green-400 font-medium">
                  Agent <code>{form.name}</code> provisioned successfully!
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between shrink-0">
          <button
            onClick={() => step > 1 && !provisioning && setStep(s => (s - 1) as Step)}
            disabled={step === 1 || provisioning}
            className="text-sm px-4 py-1.5 rounded border border-gray-200 dark:border-gray-700 text-gray-500 hover:bg-gray-50 dark:bg-gray-900 disabled:opacity-40 disabled:cursor-not-allowed transition-colors dark:border-gray-700 dark:bg-gray-900 dark:hover:bg-gray-700"
          >
            Back
          </button>

          <div className="flex items-center gap-2">
            {step < 5 && (
              <button
                onClick={() => setStep(s => (s + 1) as Step)}
                disabled={!canNext[step]}
                className="text-sm px-4 py-1.5 rounded bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-medium"
              >
                Next
              </button>
            )}
            {step === 5 && !done && (
              <button
                onClick={provision}
                disabled={provisioning || validatingProvision}
                className={`text-sm px-4 py-1.5 rounded font-medium transition-colors ${
                  provisioning || validatingProvision ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed' : 'bg-emerald-600 text-white hover:bg-emerald-700'
                }`}
              >
                {provisioning ? 'Provisioning…' : validatingProvision ? 'Validating…' : 'Provision'}
              </button>
            )}
            {done && (
              <button
                onClick={() => { onDone(); onClose() }}
                className="text-sm px-4 py-1.5 rounded bg-sky-600 text-white hover:bg-sky-700 font-medium transition-colors"
              >
                Done
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
