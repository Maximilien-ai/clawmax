import React, { useEffect, useRef, useState } from 'react'

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

export default function AddAgentWizard({ onClose, onDone, defaultCloneFrom }: WizardProps) {
  const [step, setStep] = useState<Step>(1)
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

  // Fetch available models, suggested ID + port and existing agents list on mount
  useEffect(() => {
    // Fetch available models based on API keys
    fetch('/api/agents/models')
      .then(r => r.json())
      .then(d => {
        // Sort models to put openai/* first for better compatibility
        const models = (d.models || []).sort((a: string, b: string) => {
          const aIsOpenAI = a.startsWith('openai/')
          const bIsOpenAI = b.startsWith('openai/')
          if (aIsOpenAI && !bIsOpenAI) return -1
          if (!aIsOpenAI && bIsOpenAI) return 1
          return a.localeCompare(b)
        })
        setAvailableModels(models)

        // Set default model to gpt-4o/gpt-5 if available, otherwise first openai model, otherwise first available
        if (models.length > 0) {
          const defaultModel = models.find((m: string) => m === 'openai/gpt-5' || m === 'openai/gpt-4o')
            || models.find((m: string) => m.startsWith('openai/'))
            || models[0]
          setForm(f => ({ ...f, model: defaultModel }))
        }
      })
      .catch(() => {})

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

    // Pre-fill tags from template
    if (template.tags && template.tags.length > 0) {
      setForm(f => ({ ...f, tags: template.tags }))
    }

    // Pre-fill AI description from template metadata
    if (template.metadata?.aiPrompt) {
      setForm(f => ({ ...f, aiDescription: template.metadata.aiPrompt, useAI: true }))
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
      setPreFilled(false)
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
  }, [form.cloneFrom])

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
      const resp = await fetch('/api/agents/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: form.aiDescription,
          name: form.name,
          tags: form.tags,
        }),
      })

      if (!resp.ok) {
        const err = await resp.text()
        setGenError(err || 'Generation failed')
        setGenerating(false)
        return
      }

      const files = await resp.json() as GeneratedFiles
      setGeneratedFiles(files)
      set('useAI', true)
      setGenerating(false)
    } catch (e) {
      setGenError(String(e))
      setGenerating(false)
    }
  }

  async function provision() {
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
    if (form.tags.length > 0) body.tags = form.tags
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
      <div className="bg-white rounded-xl shadow-2xl w-[560px] max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <h2 className="text-base font-semibold text-gray-800">Add Agent</h2>
          <button
            onClick={onClose}
            disabled={provisioning}
            className="text-gray-400 hover:text-gray-600 transition-colors text-lg leading-none"
          >×</button>
        </div>

        {/* Step indicators */}
        <div className="px-6 pt-4 pb-2 flex items-center gap-2 shrink-0">
          {([1, 2, 3, 4, 5] as Step[]).map(s => (
            <React.Fragment key={s}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                s < step ? 'bg-sky-600 text-white' :
                s === step ? 'bg-sky-100 text-sky-700 ring-2 ring-sky-400' :
                'bg-gray-100 text-gray-400'
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
                <label className="block text-xs font-medium text-gray-600 mb-1">Agent name <span className="text-red-400">*</span></label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => set('name', e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                  placeholder={suggested?.id ?? 'max1'}
                  className={`w-full px-3 py-2 text-sm border rounded-md outline-none transition-colors font-mono ${
                    form.name && !nameOk ? 'border-red-300 bg-red-50' : 'border-gray-200 focus:border-sky-400'
                  }`}
                />
                <p className="mt-1 text-xs text-gray-400">Lowercase letters, numbers, hyphens. Suggested: <strong>{suggested?.id ?? '…'}</strong></p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Model <span className="text-red-400">*</span>
                  {preFilled && <span className="ml-2 text-xs text-sky-600">⚡ Pre-filled from {form.cloneFrom}</span>}
                </label>
                <select
                  value={form.model}
                  onChange={e => set('model', e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md outline-none focus:border-sky-400 bg-white"
                  disabled={availableModels.length === 0}
                >
                  {availableModels.length === 0 && <option value="">Loading models...</option>}
                  {availableModels.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              {agentTemplates.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
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
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md outline-none focus:border-sky-400 bg-white"
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
                  <label className="block text-xs font-medium text-gray-600 mb-1">Or clone from agent <span className="text-gray-400">(optional)</span></label>
                  <select
                    value={form.cloneFrom}
                    onChange={e => {
                      set('cloneFrom', e.target.value)
                      if (e.target.value) set('templateSlug', '')  // Clear template if clone selected
                    }}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md outline-none focus:border-sky-400 bg-white"
                    disabled={!!form.templateSlug}
                  >
                    <option value="">— Fresh setup —</option>
                    {existingAgents.map(id => <option key={id} value={id}>{id}</option>)}
                  </select>
                  <p className="mt-1 text-xs text-gray-400">Copies all files from an existing agent.</p>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Tags <span className="text-gray-400">(optional)</span></label>
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
                          : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-gray-300'
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
                    className="flex-1 px-3 py-1.5 text-xs border border-gray-200 rounded-md outline-none focus:border-sky-400"
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
                    className="px-3 py-1.5 text-xs bg-gray-100 text-gray-600 rounded border border-gray-200 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Add
                  </button>
                </div>
                {form.tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {form.tags.map(tag => (
                      <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-sky-50 border border-sky-200 rounded">
                        {tag}
                        <button
                          type="button"
                          onClick={() => set('tags', form.tags.filter(t => t !== tag))}
                          className="text-sky-600 hover:text-sky-800"
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
              <p className="text-sm text-gray-600">
                Optionally use AI to generate your agent's personality files (IDENTITY, SOUL, TOOLS). Skip this step to clone or create from scratch.
              </p>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Describe your agent <span className="text-gray-400">(optional)</span></label>
                <textarea
                  value={form.aiDescription}
                  onChange={e => set('aiDescription', e.target.value)}
                  placeholder="e.g., A friendly project manager who helps track tasks and deadlines..."
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md outline-none focus:border-sky-400 h-24 resize-none"
                  disabled={generating || !!generatedFiles}
                />
              </div>

              <button
                onClick={generateWithAI}
                disabled={!form.aiDescription.trim() || generating || !!generatedFiles}
                className={`w-full px-4 py-2 text-sm rounded font-medium transition-colors ${
                  generating || !!generatedFiles
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : !form.aiDescription.trim()
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-sky-600 text-white hover:bg-sky-700'
                }`}
              >
                {generating ? 'Generating...' : generatedFiles ? '✓ Generated' : 'Generate with AI'}
              </button>

              {genError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{genError}</div>
              )}

              {generatedFiles && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm text-green-700 font-medium">
                    <span>✓</span>
                    <span>Files generated successfully</span>
                  </div>

                  <div className="space-y-2">
                    <details className="bg-gray-50 border border-gray-200 rounded-lg">
                      <summary className="px-3 py-2 text-xs font-medium text-gray-700 cursor-pointer hover:bg-gray-100">
                        IDENTITY.md Preview
                      </summary>
                      <pre className="px-3 py-2 text-xs text-gray-600 whitespace-pre-wrap border-t border-gray-200">
                        {generatedFiles.identity}
                      </pre>
                    </details>

                    <details className="bg-gray-50 border border-gray-200 rounded-lg">
                      <summary className="px-3 py-2 text-xs font-medium text-gray-700 cursor-pointer hover:bg-gray-100">
                        SOUL.md Preview
                      </summary>
                      <pre className="px-3 py-2 text-xs text-gray-600 whitespace-pre-wrap border-t border-gray-200">
                        {generatedFiles.soul}
                      </pre>
                    </details>

                    <details className="bg-gray-50 border border-gray-200 rounded-lg">
                      <summary className="px-3 py-2 text-xs font-medium text-gray-700 cursor-pointer hover:bg-gray-100">
                        TOOLS.md Preview
                      </summary>
                      <pre className="px-3 py-2 text-xs text-gray-600 whitespace-pre-wrap border-t border-gray-200">
                        {generatedFiles.tools}
                      </pre>
                    </details>
                  </div>

                  <button
                    onClick={() => {
                      setGeneratedFiles(null)
                      set('useAI', false)
                    }}
                    className="text-sm text-gray-500 hover:text-gray-700 underline"
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
                <label className="block text-xs font-medium text-gray-600 mb-1">WhatsApp number <span className="text-gray-400">(optional)</span></label>
                <input
                  type="text"
                  value={form.whatsapp}
                  onChange={e => set('whatsapp', e.target.value.replace(/[^0-9+]/g, ''))}
                  placeholder="12345…"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md outline-none focus:border-sky-400 font-mono"
                />
                <p className="mt-1 text-xs text-gray-400">International format, no spaces — <span className="text-amber-600 font-medium">replace with your actual number</span></p>
              </div>
            </div>
          )}

          {/* Step 4: Deployment */}
          {step === 4 && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Gateway port <span className="text-gray-400">(optional)</span></label>
                <input
                  type="number"
                  value={form.port || ''}
                  onChange={e => set('port', e.target.value ? parseInt(e.target.value, 10) : 0)}
                  placeholder={String(suggested?.port ?? 18789)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md outline-none focus:border-sky-400 font-mono"
                />
                <p className="mt-1 text-xs text-gray-400">Suggested: <strong>{suggested?.port ?? '…'}</strong></p>
              </div>
              <div className="p-3 bg-sky-50 border border-sky-200 rounded-lg text-xs text-sky-700">
                State will be isolated under <code className="font-mono">~/.openclaw-{form.name || suggested?.id || 'name'}/</code> with its own gateway and credentials.
              </div>
            </div>
          )}

          {/* Step 5: Review + Provision */}
          {step === 5 && (
            <div className="space-y-4">
              {!provisioning && !done && !provError && (
                <>
                  <p className="text-sm text-gray-600">Review the configuration and click <strong>Provision</strong> to run <code>setup.sh</code>.</p>
                  <pre className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-xs font-mono text-gray-700 overflow-x-auto">
                    {JSON.stringify(preview, null, 2)}
                  </pre>
                </>
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
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{provError}</div>
              )}

              {done && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700 font-medium">
                  Agent <code>{form.name}</code> provisioned successfully!
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between shrink-0">
          <button
            onClick={() => step > 1 && !provisioning && setStep(s => (s - 1) as Step)}
            disabled={step === 1 || provisioning}
            className="text-sm px-4 py-1.5 rounded border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
                disabled={provisioning}
                className={`text-sm px-4 py-1.5 rounded font-medium transition-colors ${
                  provisioning ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-emerald-600 text-white hover:bg-emerald-700'
                }`}
              >
                {provisioning ? 'Provisioning…' : 'Provision'}
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
