import React, { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from './Toast'
import { getByokDismissKey, readStoredByokKeys, writeStoredByokKeys } from '../lib/byok'

function maskKey(value: string) {
  if (value.length <= 8) return 'configured'
  return `${value.slice(0, 4)}••••${value.slice(-4)}`
}

type Step = 'models' | 'senso' | 'monitoring' | 'github'
type ProviderKey = 'openai' | 'anthropic' | 'gemini'
type ValidationState = Record<'openai' | 'anthropic' | 'gemini' | 'ollama' | 'opik', { status: 'idle' | 'valid' | 'invalid' | 'error' | 'skipped'; message: string }>
type IntegrationStatus = {
  validationAvailable: boolean
  validationMode: 'live' | 'fallback'
  providers: string[]
  notes?: string[]
}

export function ByokWizard() {
  const { user, config } = useAuth()
  const { showSuccess, showInfo, showWarning } = useToast()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>('models')
  const [openaiKey, setOpenaiKey] = useState('')
  const [anthropicKey, setAnthropicKey] = useState('')
  const [geminiApiKey, setGeminiApiKey] = useState('')
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState('http://localhost:11434')
  const [ollamaDefaultModel, setOllamaDefaultModel] = useState('')
  const [sensoApiKey, setSensoApiKey] = useState('')
  const [sensoContextLabel, setSensoContextLabel] = useState('')
  const [opikApiKey, setOpikApiKey] = useState('')
  const [opikWorkspace, setOpikWorkspace] = useState('')
  const [opikProject, setOpikProject] = useState('')
  const [githubDefaultRepo, setGithubDefaultRepo] = useState('')
  const [preferredModel, setPreferredModel] = useState('')
  const [validating, setValidating] = useState(false)
  const [validation, setValidation] = useState<ValidationState>({
    openai: { status: 'idle', message: '' },
    anthropic: { status: 'idle', message: '' },
    gemini: { status: 'idle', message: '' },
    ollama: { status: 'idle', message: '' },
    opik: { status: 'idle', message: '' },
  })
  const [dismissed, setDismissed] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const [githubChecks, setGithubChecks] = useState<Array<{ id: string; label: string; status: string; message: string; fixHint?: string }>>([])
  const [integrationStatus, setIntegrationStatus] = useState<IntegrationStatus | null>(null)

  useEffect(() => {
    const stored = readStoredByokKeys()
    setOpenaiKey(stored.openai || '')
    setAnthropicKey(stored.anthropic || '')
    setGeminiApiKey(stored.geminiApiKey || '')
    setOllamaBaseUrl(stored.ollamaBaseUrl || 'http://localhost:11434')
    setOllamaDefaultModel(stored.ollamaDefaultModel || '')
    setSensoApiKey(stored.sensoApiKey || '')
    setSensoContextLabel(stored.sensoContextLabel || '')
    setOpikApiKey(stored.opikApiKey || '')
    setOpikWorkspace(stored.opikWorkspace || '')
    setOpikProject(stored.opikProject || '')
    setGithubDefaultRepo(stored.githubDefaultRepo || '')
    setPreferredModel(stored.preferredModel || '')
    setDismissed(localStorage.getItem(getByokDismissKey()) === 'true')
    setHydrated(true)
  }, [])

  const hasStoredKeys = !!(openaiKey || anthropicKey || geminiApiKey)
  const hasDefaultUserKeys = !!(config?.userKeyDefaults?.openai || config?.userKeyDefaults?.anthropic || (config as any)?.userKeyDefaults?.gemini)
  const hasOpenAiAvailable = !!(openaiKey || config?.userKeyDefaults?.openai || config?.systemKeyDefaults?.openai)
  const hasAnthropicAvailable = !!(anthropicKey || config?.userKeyDefaults?.anthropic || config?.systemKeyDefaults?.anthropic)
  const hasGeminiAvailable = !!(geminiApiKey || (config as any)?.userKeyDefaults?.gemini || (config as any)?.systemKeyDefaults?.gemini)
  const githubReady = githubChecks.length > 0 && githubChecks.every((check) => check.status === 'pass')
  const sensoConfigured = !!sensoApiKey.trim()
  const opikConfigured = !!opikApiKey.trim()
  const ollamaConfigured = !!ollamaBaseUrl.trim()

  const providerChecks = useMemo(() => {
    const resolveSource = (provider: ProviderKey) => {
      if (provider === 'openai') {
        if (openaiKey) return 'browser BYOK'
        if (config?.userKeyDefaults?.openai) return 'user default'
        if (config?.systemKeyDefaults?.openai) return 'system default'
        return 'not configured'
      }
      if (provider === 'anthropic') {
        if (anthropicKey) return 'browser BYOK'
        if (config?.userKeyDefaults?.anthropic) return 'user default'
        if (config?.systemKeyDefaults?.anthropic) return 'system default'
        return 'not configured'
      }
      if (geminiApiKey) return 'browser BYOK'
      if ((config as any)?.userKeyDefaults?.gemini) return 'user default'
      if ((config as any)?.systemKeyDefaults?.gemini) return 'system default'
      return 'not configured'
    }

    return [
      { id: 'openai', label: 'OpenAI', available: hasOpenAiAvailable, source: resolveSource('openai') },
      { id: 'anthropic', label: 'Anthropic', available: hasAnthropicAvailable, source: resolveSource('anthropic') },
      { id: 'gemini', label: 'Gemini', available: hasGeminiAvailable, source: resolveSource('gemini') },
    ]
  }, [
    anthropicKey,
    config?.systemKeyDefaults?.anthropic,
    config?.systemKeyDefaults?.openai,
    config?.userKeyDefaults?.anthropic,
    config?.userKeyDefaults?.openai,
    hasAnthropicAvailable,
    hasGeminiAvailable,
    hasOpenAiAvailable,
    geminiApiKey,
    openaiKey,
  ])

  useEffect(() => {
    if (!hydrated) return
    if (!user && !config?.authDisabled) return
    if (hasDefaultUserKeys || hasStoredKeys || dismissed) return
    setOpen(true)
  }, [config?.authDisabled, dismissed, hasDefaultUserKeys, hasStoredKeys, hydrated, user])

  useEffect(() => {
    if (!open) return
    fetch('/api/integrations/status')
      .then(async (r) => {
        const contentType = r.headers.get('content-type') || ''
        if (!contentType.includes('application/json')) {
          setIntegrationStatus({ validationAvailable: false, validationMode: 'fallback', providers: [], notes: ['Live validation is unavailable on the current server build.'] })
          return null
        }
        return r.json()
      })
      .then((data) => {
        if (!data) return
        setIntegrationStatus({
          validationAvailable: !!data.validationAvailable,
          validationMode: data.validationMode === 'live' ? 'live' : 'fallback',
          providers: Array.isArray(data.providers) ? data.providers : [],
          notes: Array.isArray(data.notes) ? data.notes : [],
        })
      })
      .catch(() => setIntegrationStatus({ validationAvailable: false, validationMode: 'fallback', providers: [], notes: ['Live validation is unavailable on the current server build.'] }))

    fetch('/api/templates/organizations/prereqs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agents: [{ id: 'github-check', skills: ['github', 'gh-issues'] }],
        workflows: [],
      }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const checks = (data?.checks || []).filter((check: any) => check.id === 'github-auth' || check.id === 'gh-issues')
        setGithubChecks(checks)
      })
      .catch(() => setGithubChecks([]))
  }, [open])

  const statusText = useMemo(() => {
    if (hasDefaultUserKeys) return 'Default user keys available from env'
    if (hasStoredKeys) {
      const labels = [
        openaiKey ? `OpenAI ${maskKey(openaiKey)}` : null,
        anthropicKey ? `Anthropic ${maskKey(anthropicKey)}` : null,
        geminiApiKey ? `Gemini ${maskKey(geminiApiKey)}` : null,
      ].filter(Boolean)
      return labels.join(' · ')
    }
    return 'No user keys configured yet'
  }, [anthropicKey, geminiApiKey, hasDefaultUserKeys, hasStoredKeys, openaiKey])

  const monitoringStatusText = useMemo(() => {
    if (opikApiKey) {
      const parts = [`Opik ${maskKey(opikApiKey)}`]
      if (opikWorkspace) parts.push(`workspace: ${opikWorkspace}`)
      if (opikProject) parts.push(`project: ${opikProject}`)
      return parts.join(' · ')
    }
    return 'Not configured — ClawMax still works, but monitoring visibility may be reduced'
  }, [opikApiKey, opikWorkspace, opikProject])

  const ollamaStatusText = useMemo(() => {
    if (!ollamaConfigured) return 'Not configured — local open-source models are unavailable until Ollama is running'
    return `Base URL: ${ollamaBaseUrl}${ollamaDefaultModel ? ` · default: ${ollamaDefaultModel}` : ''}`
  }, [ollamaBaseUrl, ollamaConfigured, ollamaDefaultModel])

  if (!hydrated) return null
  if (!user && !config?.authDisabled) return null

  const runValidation = async () => {
    setValidating(true)
    try {
      const res = await fetch('/api/integrations/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          openai: openaiKey.trim(),
          anthropic: anthropicKey.trim(),
          gemini: geminiApiKey.trim(),
          ollamaBaseUrl: ollamaBaseUrl.trim(),
          ollamaDefaultModel: ollamaDefaultModel.trim(),
          opikApiKey: opikApiKey.trim(),
          opikWorkspace: opikWorkspace.trim(),
          opikProject: opikProject.trim(),
        }),
      })
      const contentType = res.headers.get('content-type') || ''
      if (!contentType.includes('application/json')) {
        setValidation({
          openai: { status: 'skipped', message: 'Validation unavailable from the current server build' },
          anthropic: { status: 'skipped', message: 'Validation unavailable from the current server build' },
          gemini: { status: 'skipped', message: 'Validation unavailable from the current server build' },
          ollama: { status: 'skipped', message: 'Validation unavailable from the current server build' },
          opik: { status: 'skipped', message: 'Validation unavailable from the current server build' },
        })
        showInfo('Integration validation is unavailable on the current server build. Saving local settings without blocking.')
        return true
      }
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to validate integrations')
      const nextState: ValidationState = {
        openai: { status: data.openai?.status || 'idle', message: data.openai?.message || '' },
        anthropic: { status: data.anthropic?.status || 'idle', message: data.anthropic?.message || '' },
        gemini: { status: data.gemini?.status || 'idle', message: data.gemini?.message || '' },
        ollama: { status: data.ollama?.status || 'idle', message: data.ollama?.message || '' },
        opik: { status: data.opik?.status || 'idle', message: data.opik?.message || '' },
      }
      setValidation(nextState)
      const failures = Object.values(nextState).filter((entry) => entry.status === 'invalid' || entry.status === 'error')
      if (failures.length > 0) {
        showWarning('Some integration checks failed. Review the messages before saving.')
        return false
      }
      showSuccess('Integration checks completed')
      return true
    } catch (err: any) {
      showWarning(err.message || 'Failed to validate integrations')
      return false
    } finally {
      setValidating(false)
    }
  }

  const handleSave = async () => {
    const shouldValidate = !!(openaiKey.trim() || anthropicKey.trim() || geminiApiKey.trim() || ollamaBaseUrl.trim() || opikApiKey.trim())
    if (shouldValidate) {
      const ok = await runValidation()
      if (!ok) return
    }
    if (!openaiKey.trim() && !anthropicKey.trim() && !geminiApiKey.trim() && !config?.userKeyDefaults?.openai && !config?.userKeyDefaults?.anthropic && !(config as any)?.userKeyDefaults?.gemini && !config?.systemKeyDefaults?.openai && !config?.systemKeyDefaults?.anthropic && !(config as any)?.systemKeyDefaults?.gemini) {
      showWarning('No LLM keys detected yet. Add OpenAI, Anthropic, or Gemini, or rely on configured defaults before running agents.')
    }
    writeStoredByokKeys({
      openai: openaiKey.trim(),
      anthropic: anthropicKey.trim(),
      geminiApiKey: geminiApiKey.trim(),
      ollamaBaseUrl: ollamaBaseUrl.trim(),
      ollamaDefaultModel: ollamaDefaultModel.trim(),
      sensoApiKey: sensoApiKey.trim(),
      sensoContextLabel: sensoContextLabel.trim(),
      opikApiKey: opikApiKey.trim(),
      opikWorkspace: opikWorkspace.trim(),
      opikProject: opikProject.trim(),
      githubDefaultRepo: githubDefaultRepo.trim(),
      preferredModel: preferredModel || undefined,
    })
    localStorage.removeItem(getByokDismissKey())
    setDismissed(false)
    setOpen(false)
    setStep('models')
    showSuccess('Workspace integrations saved locally for this browser')
  }

  const handleSkip = () => {
    localStorage.setItem(getByokDismissKey(), 'true')
    setDismissed(true)
    setOpen(false)
    setStep('models')
    showInfo('Workspace integrations skipped for now')
  }

  const handleReopen = () => {
    setStep('models')
    setOpen(true)
  }

  const renderValidation = (key: keyof ValidationState) => {
    const entry = validation[key]
    if (entry.status === 'idle') return null
    const className =
      entry.status === 'valid'
        ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-100'
        : entry.status === 'skipped'
          ? 'border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300'
          : 'border-red-200 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-900/20 dark:text-red-100'
    return (
      <div className={`mt-2 rounded-lg border px-3 py-2 text-xs ${className}`}>
        {entry.message}
      </div>
    )
  }

  return (
    <>
      <button
        onClick={handleReopen}
        className="text-xs rounded-full border border-amber-300/60 bg-amber-50 px-2.5 py-1 text-amber-700 hover:bg-amber-100 transition-colors dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-300"
        title="Configure workspaces integrations"
      >
        Workspaces Integrations
      </button>

      {!open ? null : (
        <div className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-3xl rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-2xl p-5 max-h-[93vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">Workspaces Integrations</div>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Dev preview. These settings stay local to this browser for now and are meant for flow testing, not final secure storage.
                </p>
              </div>
              <button
                onClick={() => { setOpen(false); setStep('models') }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <span className={`px-2 py-1 rounded-full ${step === 'models' ? 'bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 font-medium' : 'bg-gray-100 dark:bg-gray-700'}`}>1. Models</span>
              <span>→</span>
              <span className={`px-2 py-1 rounded-full ${step === 'senso' ? 'bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 font-medium' : 'bg-gray-100 dark:bg-gray-700'}`}>2. Senso</span>
              <span>→</span>
              <span className={`px-2 py-1 rounded-full ${step === 'monitoring' ? 'bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 font-medium' : 'bg-gray-100 dark:bg-gray-700'}`}>3. Opik</span>
              <span>→</span>
              <span className={`px-2 py-1 rounded-full ${step === 'github' ? 'bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 font-medium' : 'bg-gray-100 dark:bg-gray-700'}`}>4. GitHub</span>
            </div>

            <div className={`mt-4 rounded-xl border px-4 py-3 text-sm ${
              integrationStatus?.validationAvailable
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-100'
                : 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-100'
            }`}>
              <div className="font-medium">
                Validation mode: {integrationStatus?.validationAvailable ? 'Live' : 'Fallback'}
              </div>
              <div className="mt-1 text-xs opacity-90">
                {integrationStatus?.validationAvailable
                  ? 'This server can validate provider keys and local Ollama reachability right now.'
                  : 'This server cannot validate integrations live right now. Local browser save still works, and template defaults will still prefill.'}
              </div>
              {(sensoContextLabel.trim() || githubDefaultRepo.trim()) && (
                <div className="mt-2 text-xs opacity-90">
                  Template apply defaults:
                  {sensoContextLabel.trim() ? ` Senso context → ${sensoContextLabel.trim()}.` : ''}
                  {githubDefaultRepo.trim() ? ` GitHub repo → ${githubDefaultRepo.trim()}.` : ''}
                </div>
              )}
            </div>

            {step === 'models' && (
              <>
                <div className="mt-4 rounded-xl border border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-900/20 p-4 text-sm text-sky-900 dark:text-sky-100">
                  <div className="font-medium">Model providers (BYOK)</div>
                  <div className="mt-1">
                    System keys may be limited or unavailable. Bring Your Own Keys (BYOK) to ensure your agents can run with the models and providers you choose, billed to your own account.
                  </div>
                  <div className="mt-2 text-xs opacity-80">
                    We support broad model choice, but results vary by provider and version. We recommend the suggested defaults first. If a model performs especially well or poorly in ClawMax, please share feedback on GitHub.
                  </div>
                </div>

                <div className="mt-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-4 text-sm text-gray-600 dark:text-gray-300">
                  <div className="font-medium text-gray-900 dark:text-gray-100">Current hosted-provider status</div>
                  <div className="mt-1">{statusText}</div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {providerChecks.map((provider) => (
                      <div
                        key={provider.id}
                        className={`rounded-lg border px-3 py-2 ${
                          provider.available
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-100'
                            : 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-100'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-medium">{provider.label}</span>
                          <span className="text-xs uppercase tracking-wide opacity-80">{provider.available ? 'available' : 'missing'}</span>
                        </div>
                        <div className="mt-1 text-xs opacity-80">Source: {provider.source}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-5 space-y-4">
                  <div>
                    <label htmlFor="byok-openai" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">OpenAI key</label>
                    <input id="byok-openai" type="password" value={openaiKey} onChange={(e) => setOpenaiKey(e.target.value)} placeholder="sk-..." className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-sky-500" />
                    {renderValidation('openai')}
                  </div>

                  <div>
                    <label htmlFor="byok-anthropic" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Anthropic key</label>
                    <input id="byok-anthropic" type="password" value={anthropicKey} onChange={(e) => setAnthropicKey(e.target.value)} placeholder="sk-ant-..." className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-sky-500" />
                    {renderValidation('anthropic')}
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900">
                      <div className="font-medium text-gray-900 dark:text-gray-100">Gemini</div>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Hosted Google Gemini models are supported alongside OpenAI and Anthropic.</p>
                      <input type="password" value={geminiApiKey} onChange={(e) => setGeminiApiKey(e.target.value)} placeholder="Gemini API key" className="mt-3 w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100" />
                      {renderValidation('gemini')}
                    </div>
                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900">
                      <div className="font-medium text-gray-900 dark:text-gray-100">Ollama</div>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Local open-source models. You manage the Ollama runtime and installed models on your own machine or host.</p>
                      <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                        Works best when Ollama is already running and the models you want have been pulled.
                      </div>
                      <input type="text" value={ollamaBaseUrl} onChange={(e) => setOllamaBaseUrl(e.target.value)} placeholder="http://localhost:11434" className="mt-3 w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100" />
                      <input type="text" value={ollamaDefaultModel} onChange={(e) => setOllamaDefaultModel(e.target.value)} placeholder="Default Ollama model" className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100" />
                      {renderValidation('ollama')}
                      <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">{ollamaStatusText}</div>
                    </div>
                  </div>

                  {(hasOpenAiAvailable || hasAnthropicAvailable || hasGeminiAvailable || ollamaConfigured) && (
                    <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Preferred model for new agents</label>
                      <select value={preferredModel} onChange={(e) => setPreferredModel(e.target.value)} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm">
                        <option value="">Auto (best for configured keys)</option>
                        {hasAnthropicAvailable && (
                          <>
                            <option value="anthropic/claude-opus-4-6">Claude Opus 4.6 (best reasoning)</option>
                            <option value="anthropic/claude-sonnet-4-20250514">Claude Sonnet 4 (fast)</option>
                          </>
                        )}
                        {hasOpenAiAvailable && (
                          <>
                            <option value="openai/gpt-5">GPT-5 (latest)</option>
                            <option value="openai/gpt-4o">GPT-4o (balanced)</option>
                            <option value="openai/gpt-4o-mini">GPT-4o Mini (cost efficient)</option>
                          </>
                        )}
                        {hasGeminiAvailable && (
                          <>
                            <option value="gemini/gemini-2.5-pro">Gemini 2.5 Pro (best reasoning)</option>
                            <option value="gemini/gemini-2.5-flash">Gemini 2.5 Flash (balanced)</option>
                            <option value="gemini/gemini-2.5-flash-lite">Gemini 2.5 Flash Lite (cost efficient)</option>
                          </>
                        )}
                        {ollamaConfigured && ollamaDefaultModel && (
                          <option value={`ollama/${ollamaDefaultModel}`}>Ollama {ollamaDefaultModel} (local default)</option>
                        )}
                      </select>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Used when creating agents and applying templates</p>
                    </div>
                  )}
                </div>

                <div className="mt-6 flex items-center justify-between gap-3">
                  <button onClick={handleSkip} className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors">Skip for now</button>
                  <div className="flex items-center gap-2">
                    <button onClick={runValidation} disabled={validating} className="px-4 py-2 text-sm rounded-md border border-sky-300 dark:border-sky-700 text-sky-700 dark:text-sky-300 hover:bg-sky-50 dark:hover:bg-sky-900/20 transition-colors disabled:opacity-60">{validating ? 'Checking…' : 'Check Keys'}</button>
                    <button onClick={handleSave} disabled={validating} className="px-4 py-2 text-sm rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-60">Save &amp; Close</button>
                    <button onClick={() => setStep('senso')} className="px-4 py-2 text-sm rounded-md bg-sky-600 text-white hover:bg-sky-700 transition-colors">Next &rarr;</button>
                  </div>
                </div>
              </>
            )}

            {step === 'senso' && (
              <>
                <div className="mt-4 rounded-xl border border-cyan-200 dark:border-cyan-800 bg-cyan-50 dark:bg-cyan-900/20 p-4 text-sm text-cyan-900 dark:text-cyan-100">
                  <div className="font-medium">Senso shared context (optional)</div>
                  <div className="mt-1">
                    Use Senso to store evidence, recall prior work, and share context across agents. ClawMax still works without it using workspace files and native workflow handoffs.
                  </div>
                  <div className="mt-2 text-xs opacity-80">
                    Optional partner integration. Senso offers OSS and free-tier options. Docs: <a href="https://docs.senso.ai/" target="_blank" rel="noopener noreferrer" className="underline">docs.senso.ai</a> · Login: <a href="https://platform.senso.ai/" target="_blank" rel="noopener noreferrer" className="underline">platform.senso.ai</a>
                  </div>
                </div>

                <div className="mt-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-4 text-sm text-gray-600 dark:text-gray-300">
                  <div className="font-medium text-gray-900 dark:text-gray-100">Senso status</div>
                  <div className="mt-1">{sensoConfigured ? `Configured ${maskKey(sensoApiKey)}${sensoContextLabel ? ` · context: ${sensoContextLabel}` : ''}` : 'Not configured — workspace files remain the default shared context layer'}</div>
                </div>

                <div className="mt-5 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Senso API key</label>
                    <input type="password" value={sensoApiKey} onChange={(e) => setSensoApiKey(e.target.value)} placeholder="Senso API key" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Default Senso context label</label>
                    <input type="text" value={sensoContextLabel} onChange={(e) => setSensoContextLabel(e.target.value)} placeholder="e.g. Workspace / Team / Project" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100" />
                  </div>
                </div>

                <div className="mt-6 flex items-center justify-between gap-3">
                  <button onClick={() => setStep('models')} className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors">&larr; Back</button>
                  <button onClick={() => setStep('monitoring')} className="px-4 py-2 text-sm rounded-md bg-sky-600 text-white hover:bg-sky-700 transition-colors">Next &rarr;</button>
                </div>
              </>
            )}

            {step === 'monitoring' && (
              <>
                <div className="mt-4 rounded-xl border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-900/20 p-4 text-sm text-purple-900 dark:text-purple-100">
                  <div className="font-medium">Opik monitoring (optional)</div>
                  <div className="mt-1">
                    Connect your own <a href="https://www.comet.com/site/products/opik/" target="_blank" rel="noopener noreferrer" className="underline hover:text-purple-700 dark:hover:text-purple-300">Opik</a> account to track agent calls, tokens, and costs under your workspace. Without this, monitoring is reduced or skipped, but ClawMax still runs normally.
                  </div>
                  <div className="mt-2 text-xs opacity-80">
                    Optional partner integration. Opik offers OSS and free-tier options. Login: <a href="https://www.comet.com/site/products/opik/" target="_blank" rel="noopener noreferrer" className="underline hover:text-purple-700 dark:hover:text-purple-300">comet.com/site/products/opik</a>
                  </div>
                </div>

                <div className="mt-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-4 text-sm text-gray-600 dark:text-gray-300">
                  <div className="font-medium text-gray-900 dark:text-gray-100">Monitoring status</div>
                  <div className="mt-1">{opikConfigured ? monitoringStatusText : 'Not configured — monitoring will be limited or ignored'}</div>
                </div>

                <div className="mt-5 space-y-4">
                  <div>
                    <label htmlFor="byok-opik-key" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Opik API key</label>
                    <input id="byok-opik-key" type="password" value={opikApiKey} onChange={(e) => setOpikApiKey(e.target.value)} placeholder="Your Opik API key" className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500" />
                    {renderValidation('opik')}
                  </div>
                  <div>
                    <label htmlFor="byok-opik-workspace" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Opik workspace</label>
                    <input id="byok-opik-workspace" type="text" value={opikWorkspace} onChange={(e) => setOpikWorkspace(e.target.value)} placeholder="e.g. my-team" className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500" />
                    <p className="mt-1 text-xs text-gray-400">Found in your Opik dashboard settings</p>
                  </div>
                  <div>
                    <label htmlFor="byok-opik-project" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Opik project name</label>
                    <input id="byok-opik-project" type="text" value={opikProject} onChange={(e) => setOpikProject(e.target.value)} placeholder="e.g. clawmax-agents" className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500" />
                    <p className="mt-1 text-xs text-gray-400">All agent traces will be logged under this project</p>
                  </div>
                </div>

                <div className="mt-6 flex items-center justify-between gap-3">
                  <button onClick={() => setStep('senso')} className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors">&larr; Back</button>
                  <div className="flex items-center gap-2">
                    <button onClick={runValidation} disabled={validating} className="px-4 py-2 text-sm rounded-md border border-purple-300 dark:border-purple-700 text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors disabled:opacity-60">{validating ? 'Checking…' : 'Check Keys'}</button>
                    <button onClick={() => setStep('github')} className="px-4 py-2 text-sm rounded-md bg-sky-600 text-white hover:bg-sky-700 transition-colors">Next &rarr;</button>
                  </div>
                </div>
              </>
            )}

            {step === 'github' && (
              <>
                <div className="mt-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 p-4 text-sm text-slate-700 dark:text-slate-200">
                  <div className="font-medium">GitHub integration</div>
                  <div className="mt-1">
                    Use GitHub for issues, PRs, code review, and shared delivery workflows. ClawMax still works without it, but GitHub is recommended for software and operational teams.
                  </div>
                  <div className="mt-2 text-xs opacity-80">
                    If GitHub is not ready yet, install the CLI with <span className="font-mono">brew install gh</span> and authenticate with <span className="font-mono">gh auth login</span>.
                  </div>
                </div>

                <div className="mt-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-4 text-sm text-gray-600 dark:text-gray-300">
                  <div className="font-medium text-gray-900 dark:text-gray-100">GitHub status</div>
                  <div className="mt-2 space-y-2">
                    {githubChecks.length === 0 ? (
                      <div className="text-sm text-gray-500 dark:text-gray-400">Checking GitHub CLI and issue workflow support…</div>
                    ) : githubChecks.map((check) => (
                      <div
                        key={check.id}
                        className={`rounded-lg border px-3 py-2 ${
                          check.status === 'pass'
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-100'
                            : check.status === 'warn'
                              ? 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-100'
                              : 'border-red-200 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-900/20 dark:text-red-100'
                        }`}
                      >
                        <div className="font-medium">{check.label}</div>
                        <div className="mt-1 text-xs opacity-80">{check.message}{check.fixHint ? ` · ${check.fixHint}` : ''}</div>
                      </div>
                    ))}
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {githubReady ? 'GitHub looks ready for workspace issue and PR workflows.' : 'GitHub is optional, but software and delivery templates work better when gh and gh-issues are ready.'}
                    </div>
                    {!githubReady && (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-100">
                        Quick setup: install <span className="font-mono">gh</span>, run <span className="font-mono">gh auth login</span>, and refresh repo scope with <span className="font-mono">gh auth refresh -s repo</span> if needed.
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-5 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Default GitHub repo</label>
                    <input type="text" value={githubDefaultRepo} onChange={(e) => setGithubDefaultRepo(e.target.value)} placeholder="owner/repo" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100" />
                  </div>
                </div>

                <div className="mt-6 flex items-center justify-between gap-3">
                  <button onClick={() => setStep('monitoring')} className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors">&larr; Back</button>
                  <div className="flex items-center gap-2">
                    <button onClick={() => { setOpen(false); setStep('models') }} className="px-4 py-2 text-sm rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">Close</button>
                    <button onClick={handleSave} className="px-4 py-2 text-sm rounded-md bg-sky-600 text-white hover:bg-sky-700 transition-colors">Save Integrations</button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
