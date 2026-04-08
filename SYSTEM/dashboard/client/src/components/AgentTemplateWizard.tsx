import React, { useEffect, useMemo, useRef, useState } from 'react'

type FocusableField = HTMLInputElement | HTMLTextAreaElement

type AgentTemplateShape = {
  name: string
  type: 'agent'
  version: string
  description?: string
  author?: string
  tags?: string[]
  source?: 'system' | 'workspace' | 'enterprise'
  slug?: string
  agents: Array<{
    id: string
    name?: string
    role: string
    tags?: string[]
    skills?: string[]
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
      .filter(Boolean)
      .filter((suggestion) => !normalizedValues.has(suggestion.trim().toLowerCase()))
      .filter((suggestion) => !q || suggestion.toLowerCase().includes(q))
      .slice(0, 8)
  }, [draft, normalizedValues, suggestions])

  const commitValue = (raw: string) => {
    const value = raw.trim()
    if (!value || normalizedValues.has(value.toLowerCase())) {
      setDraft('')
      return
    }
    onChange([...values, value])
    setDraft('')
    setShowSuggestions(true)
  }

  return (
    <div className="relative">
      <div className="min-h-[2.5rem] rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-2 text-sm focus-within:ring-2 focus-within:ring-purple-500">
        <div className="flex flex-wrap gap-1.5">
          {values.map((value) => (
            <span key={value} className="inline-flex items-center gap-1 rounded-full bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-700 px-2 py-0.5 text-xs text-purple-700 dark:text-purple-300">
              {value}
              <button type="button" onClick={() => onChange(values.filter((entry) => entry !== value))} className="text-purple-500 hover:text-purple-700 dark:hover:text-purple-200">×</button>
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
                onChange(values.slice(0, -1))
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

export default function AgentTemplateWizard({
  initialTemplate,
  onClose,
  onSave,
  showError,
}: {
  initialTemplate: AgentTemplateShape
  onClose: () => void
  onSave: (template: AgentTemplateShape) => Promise<void>
  showError: (msg: string) => void
}) {
  const sourceAgent = initialTemplate.agents[0]
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [availableSkillNames, setAvailableSkillNames] = useState<string[]>([])
  const [focusedField, setFocusedField] = useState<string | null>(null)
  const [filesLoading, setFilesLoading] = useState(false)
  const [generatingFiles, setGeneratingFiles] = useState(false)
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const [validationWarnings, setValidationWarnings] = useState<string[]>([])
  const fieldRefs = useRef<Record<string, FocusableField | null>>({})
  const [form, setForm] = useState({
    templateName: initialTemplate.source === 'workspace' ? initialTemplate.name : `${initialTemplate.name} Copy`,
    description: initialTemplate.description || '',
    author: initialTemplate.author || '',
    templateTags: initialTemplate.tags || [],
    agentId: sourceAgent?.id || '',
    agentName: sourceAgent?.name || sourceAgent?.id || '',
    role: sourceAgent?.role || '',
    agentTags: sourceAgent?.tags || [],
    agentSkills: sourceAgent?.skills || [],
    aiPrompt: initialTemplate.metadata?.aiPrompt || '',
    model: initialTemplate.metadata?.model || '',
    identity: '',
    soul: '',
    tools: '',
  })

  useEffect(() => {
    fetch('/api/skills')
      .then((resp) => (resp.ok ? resp.json() : null))
      .then((data) => {
        const skills = Array.isArray(data?.skills) ? data.skills : []
        setAvailableSkillNames(skills.map((skill: any) => skill.name).filter(Boolean))
      })
      .catch(() => setAvailableSkillNames([]))
  }, [])

  useEffect(() => {
    if (!initialTemplate.slug) return
    setFilesLoading(true)
    fetch(`/api/templates/agents/${initialTemplate.slug}/files`)
      .then((resp) => (resp.ok ? resp.json() : null))
      .then((data) => {
        setForm((prev) => ({
          ...prev,
          identity: data?.identity || '',
          soul: data?.soul || '',
          tools: data?.tools || '',
        }))
        if (!data?.identity && !data?.soul && !data?.tools) {
          setValidationWarnings([
            'No template files were found for this variant. This can happen with older copied templates. You can generate a fresh draft below.'
          ])
        }
      })
      .finally(() => setFilesLoading(false))
  }, [initialTemplate.slug])

  const generateFilesFromDescription = async () => {
    const description = form.aiPrompt.trim() || form.description.trim() || form.role.trim()
    if (!description) {
      showError('Add a description, AI prompt, or role before generating files')
      return
    }
    setGeneratingFiles(true)
    setValidationErrors([])
    setValidationWarnings([])
    try {
      const resp = await fetch('/api/agents/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description,
          name: form.agentName.trim() || form.agentId.trim() || initialTemplate.name,
          tags: form.agentTags,
        }),
      })
      const data = await resp.json().catch(() => null)
      if (!resp.ok || !data) {
        throw new Error(data?.error || 'Failed to generate template files')
      }
      setForm((prev) => ({
        ...prev,
        identity: data.identity || prev.identity,
        soul: data.soul || prev.soul,
        tools: data.tools || prev.tools,
      }))
    } catch (err: any) {
      showError(err.message || 'Failed to generate template files')
    } finally {
      setGeneratingFiles(false)
    }
  }

  const tagSuggestions = useMemo(
    () => Array.from(new Set([...form.templateTags, ...form.agentTags].map((tag) => tag.trim()).filter(Boolean))),
    [form.templateTags, form.agentTags]
  )

  const setField = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

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

  const pill = (fieldKey: string, label: string) => (
    <button
      type="button"
      onClick={() => focusField(fieldKey)}
      className={`rounded-full px-2 py-0.5 border text-[10px] font-semibold uppercase tracking-wide transition-colors ${
        focusedField === fieldKey
          ? 'border-purple-300 bg-purple-100 text-purple-700 dark:border-purple-700 dark:bg-purple-900/50 dark:text-purple-300'
          : 'border-gray-200 bg-white text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400 hover:border-purple-200 hover:text-purple-600'
      }`}
    >
      {label}
    </button>
  )

  const buildTemplate = (): AgentTemplateShape => ({
    name: form.templateName.trim(),
    type: 'agent',
    version: initialTemplate.version || '1.0.0',
    description: form.description.trim() || undefined,
    author: form.author.trim() || undefined,
    tags: form.templateTags,
    agents: [{
      id: form.agentId.trim(),
      name: form.agentName.trim() || undefined,
      role: form.role.trim(),
      tags: form.agentTags,
      skills: form.agentSkills,
    }],
            metadata: {
              ...(initialTemplate.metadata || {}),
              aiPrompt: form.aiPrompt.trim() || undefined,
              model: form.model.trim() || undefined,
              createdAt: initialTemplate.metadata?.createdAt,
              basedOnSlug: initialTemplate.slug,
              basedOnSource: initialTemplate.source,
            },
          })

  const save = async () => {
    const next = buildTemplate()
    if (!next.name.trim()) return showError('Template name is required')
    if (!next.agents[0].id.trim()) return showError('Agent ID is required')
    if (!/^[a-z][a-z0-9_-]*$/.test(next.agents[0].id)) return showError('Agent ID must use lowercase letters, numbers, dashes, or underscores')
    if (!next.agents[0].role.trim()) return showError('Agent role is required')
    const validationResp = await fetch('/api/agents/validate-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identity: form.identity,
        soul: form.soul,
        tools: form.tools,
        expectedId: next.agents[0].id,
      }),
    })
    const validation = await validationResp.json().catch(() => ({ valid: false, errors: ['Failed to validate template files'], warnings: [] }))
    setValidationErrors(Array.isArray(validation.errors) ? validation.errors : [])
    setValidationWarnings(Array.isArray(validation.warnings) ? validation.warnings : [])
    if (!validationResp.ok || !validation.valid) {
      setStep(2)
      return showError((validation.errors || ['Template files failed validation']).join('\n'))
    }
    setSaving(true)
    try {
      await onSave({
        ...next,
        templateFiles: {
          identity: form.identity,
          soul: form.soul,
          tools: form.tools,
        },
      } as any)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 z-10">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Edit Agent Template</h2>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                Starting from {initialTemplate.name}. Save to create or update a workspace agent-template variant.
              </p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
          </div>
          <div className="flex items-center gap-2">
            {['Template', 'Agent', 'Files', 'Preview'].map((label, idx) => (
              <button
                key={label}
                onClick={() => setStep(idx)}
                className={`rounded-full px-3 py-1 text-xs font-medium ${step === idx ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300' : 'text-gray-400 dark:text-gray-500'}`}
              >
                {idx + 1}. {label}
              </button>
            ))}
          </div>
        </div>
        <div className="p-6">
          {step === 0 && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Template Name</label>
                <input ref={registerFieldRef('template-name')} value={form.templateName} onChange={(e) => setField('templateName', e.target.value)} className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
                <textarea ref={registerFieldRef('template-description')} value={form.description} onChange={(e) => setField('description', e.target.value)} rows={3} className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm resize-y" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Author</label>
                  <input ref={registerFieldRef('template-author')} value={form.author} onChange={(e) => setField('author', e.target.value)} className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Model</label>
                  <input ref={registerFieldRef('template-model')} value={form.model} onChange={(e) => setField('model', e.target.value)} className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Template Tags</label>
                <MultiValueInput values={form.templateTags} suggestions={tagSuggestions} placeholder="Add template tags..." onChange={(values) => setField('templateTags', values)} inputRef={registerFieldRef('template-tags')} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">AI Prompt</label>
                <textarea ref={registerFieldRef('template-ai-prompt')} value={form.aiPrompt} onChange={(e) => setField('aiPrompt', e.target.value)} rows={3} className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm resize-y" />
              </div>
            </div>
          )}
          {step === 1 && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {pill('agent-id', 'Agent ID')}
                {pill('agent-name', 'Agent Name')}
                {pill('agent-role', 'Role')}
                {pill('agent-tags', 'Tags')}
                {pill('agent-skills', 'Skills')}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Agent ID</label>
                  <input ref={registerFieldRef('agent-id')} value={form.agentId} onChange={(e) => setField('agentId', e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))} onFocus={() => setFocusedField('agent-id')} onBlur={() => setFocusedField((c) => c === 'agent-id' ? null : c)} className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm font-mono" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Agent Name</label>
                  <input ref={registerFieldRef('agent-name')} value={form.agentName} onChange={(e) => setField('agentName', e.target.value)} onFocus={() => setFocusedField('agent-name')} onBlur={() => setFocusedField((c) => c === 'agent-name' ? null : c)} className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Role</label>
                <textarea ref={registerFieldRef('agent-role')} value={form.role} onChange={(e) => setField('role', e.target.value)} onFocus={() => setFocusedField('agent-role')} onBlur={() => setFocusedField((c) => c === 'agent-role' ? null : c)} rows={3} className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm resize-y" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Agent Tags</label>
                <MultiValueInput values={form.agentTags} suggestions={tagSuggestions} placeholder="Add agent tags..." onChange={(values) => setField('agentTags', values)} onFocus={() => setFocusedField('agent-tags')} onBlur={() => setFocusedField((c) => c === 'agent-tags' ? null : c)} inputRef={registerFieldRef('agent-tags')} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Agent Skills</label>
                <MultiValueInput values={form.agentSkills} suggestions={Array.from(new Set([...availableSkillNames, ...form.agentSkills]))} placeholder="Add skills..." onChange={(values) => setField('agentSkills', values)} onFocus={() => setFocusedField('agent-skills')} onBlur={() => setFocusedField((c) => c === 'agent-skills' ? null : c)} inputRef={registerFieldRef('agent-skills')} />
              </div>
            </div>
          )}
          {step === 2 && (
            <div className="space-y-4">
              {filesLoading ? (
                <div className="text-sm text-gray-500 dark:text-gray-400">Loading template files…</div>
              ) : (
                <>
                  {!form.identity.trim() && !form.soul.trim() && !form.tools.trim() && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
                      This template variant does not currently have editable agent files loaded. You can generate a first draft from the template description and refine it here.
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 px-3 py-2">
                    <div className="text-xs text-gray-600 dark:text-gray-300">
                      Use the template description, AI prompt, and agent role to generate `IDENTITY.md`, `SOUL.md`, and `TOOLS.md`.
                    </div>
                    <button
                      type="button"
                      onClick={generateFilesFromDescription}
                      disabled={generatingFiles}
                      className="shrink-0 rounded-md bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-700 disabled:opacity-60"
                    >
                      {generatingFiles ? 'Generating…' : 'Generate Files from Description'}
                    </button>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">IDENTITY.md</label>
                    <textarea value={form.identity} onChange={(e) => setField('identity', e.target.value)} rows={10} className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-xs font-mono resize-y" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">SOUL.md</label>
                    <textarea value={form.soul} onChange={(e) => setField('soul', e.target.value)} rows={10} className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-xs font-mono resize-y" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">TOOLS.md</label>
                    <textarea value={form.tools} onChange={(e) => setField('tools', e.target.value)} rows={10} className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-xs font-mono resize-y" />
                  </div>
                  {validationErrors.length > 0 && (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200 whitespace-pre-line">
                      {validationErrors.join('\n')}
                    </div>
                  )}
                  {validationWarnings.length > 0 && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200 whitespace-pre-line">
                      {validationWarnings.join('\n')}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
          {step === 3 && (
            <div className="space-y-4">
              <div className="rounded-lg border border-purple-200 dark:border-purple-700 bg-purple-50 dark:bg-purple-900/20 p-4">
                <div className="text-sm font-semibold text-purple-900 dark:text-purple-200">{form.templateName || 'Untitled Template'}</div>
                <div className="mt-1 text-xs text-purple-700 dark:text-purple-300">{form.description || 'No description yet.'}</div>
                <div className="mt-3 text-xs text-purple-600 dark:text-purple-300">
                  Agent: <span className="font-mono">{form.agentId || 'agent-id'}</span> · {form.role || 'No role yet'}
                </div>
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                This first slice edits the template definition and preserves the source template files in the workspace variant.
              </div>
            </div>
          )}
        </div>
        <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between">
          <button onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || saving} className="px-4 py-2 text-sm rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300">Back</button>
          <div className="flex gap-2">
            {step < 3 ? (
              <button onClick={() => setStep((s) => Math.min(3, s + 1))} className="px-4 py-2 text-sm rounded-md bg-purple-600 text-white hover:bg-purple-700">Next</button>
            ) : (
              <button onClick={save} disabled={saving} className="px-4 py-2 text-sm rounded-md bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-60">
                {saving ? 'Saving…' : 'Save Template Variant'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
