import React, { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from './Toast'
import { getByokDismissKey, readStoredByokKeys, writeStoredByokKeys } from '../lib/byok'

function maskKey(value: string) {
  if (value.length <= 8) return 'configured'
  return `${value.slice(0, 4)}••••${value.slice(-4)}`
}

type Step = 'keys' | 'monitoring'

export function ByokWizard() {
  const { user, config } = useAuth()
  const { showSuccess, showInfo, showWarning } = useToast()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>('keys')
  const [openaiKey, setOpenaiKey] = useState('')
  const [anthropicKey, setAnthropicKey] = useState('')
  const [opikApiKey, setOpikApiKey] = useState('')
  const [opikWorkspace, setOpikWorkspace] = useState('')
  const [opikProject, setOpikProject] = useState('')
  const [preferredModel, setPreferredModel] = useState('')
  const [dismissed, setDismissed] = useState(false)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    const stored = readStoredByokKeys()
    setOpenaiKey(stored.openai || '')
    setAnthropicKey(stored.anthropic || '')
    setOpikApiKey(stored.opikApiKey || '')
    setOpikWorkspace(stored.opikWorkspace || '')
    setOpikProject(stored.opikProject || '')
    setPreferredModel(stored.preferredModel || '')
    setDismissed(localStorage.getItem(getByokDismissKey()) === 'true')
    setHydrated(true)
  }, [])

  const hasStoredKeys = !!(openaiKey || anthropicKey)
  const hasDefaultUserKeys = !!(config?.userKeyDefaults?.openai || config?.userKeyDefaults?.anthropic)
  const hasOpenAiAvailable = !!(openaiKey || config?.userKeyDefaults?.openai || config?.systemKeyDefaults?.openai)
  const hasAnthropicAvailable = !!(anthropicKey || config?.userKeyDefaults?.anthropic || config?.systemKeyDefaults?.anthropic)

  const providerChecks = useMemo(() => {
    const resolveSource = (provider: 'openai' | 'anthropic') => {
      if (provider === 'openai') {
        if (openaiKey) return 'browser BYOK'
        if (config?.userKeyDefaults?.openai) return 'user default'
        if (config?.systemKeyDefaults?.openai) return 'system default'
        return 'not configured'
      }
      if (anthropicKey) return 'browser BYOK'
      if (config?.userKeyDefaults?.anthropic) return 'user default'
      if (config?.systemKeyDefaults?.anthropic) return 'system default'
      return 'not configured'
    }

    return [
      {
        id: 'openai',
        label: 'OpenAI',
        available: hasOpenAiAvailable,
        source: resolveSource('openai'),
      },
      {
        id: 'anthropic',
        label: 'Anthropic',
        available: hasAnthropicAvailable,
        source: resolveSource('anthropic'),
      },
    ]
  }, [
    anthropicKey,
    config?.systemKeyDefaults?.anthropic,
    config?.systemKeyDefaults?.openai,
    config?.userKeyDefaults?.anthropic,
    config?.userKeyDefaults?.openai,
    hasAnthropicAvailable,
    hasOpenAiAvailable,
    openaiKey,
  ])

  useEffect(() => {
    if (!hydrated) return
    if (!user && !config?.authDisabled) return
    if (hasDefaultUserKeys || hasStoredKeys || dismissed) return
    setOpen(true)
  }, [config?.authDisabled, dismissed, hasDefaultUserKeys, hasStoredKeys, hydrated, user])

  const statusText = useMemo(() => {
    if (hasDefaultUserKeys) return 'Default user keys available from env'
    if (hasStoredKeys) {
      const labels = [
        openaiKey ? `OpenAI ${maskKey(openaiKey)}` : null,
        anthropicKey ? `Anthropic ${maskKey(anthropicKey)}` : null,
      ].filter(Boolean)
      return labels.join(' · ')
    }
    return 'No user keys configured yet'
  }, [anthropicKey, hasDefaultUserKeys, hasStoredKeys, openaiKey])

  const monitoringStatusText = useMemo(() => {
    if (opikApiKey) {
      const parts = [`Opik ${maskKey(opikApiKey)}`]
      if (opikWorkspace) parts.push(`workspace: ${opikWorkspace}`)
      if (opikProject) parts.push(`project: ${opikProject}`)
      return parts.join(' · ')
    }
    return 'No monitoring keys configured — using system defaults if available'
  }, [opikApiKey, opikWorkspace, opikProject])

  // Show BYOK even when auth is disabled (solo/container mode still needs API keys)
  if (!hydrated) return null
  if (!user && !config?.authDisabled) return null

  const handleSave = () => {
    if (!openaiKey.trim() && !anthropicKey.trim() && !config?.userKeyDefaults?.openai && !config?.userKeyDefaults?.anthropic && !config?.systemKeyDefaults?.openai && !config?.systemKeyDefaults?.anthropic) {
      showWarning('No LLM keys detected yet. Add OpenAI or Anthropic, or rely on configured defaults before running agents.')
    }
    writeStoredByokKeys({
      openai: openaiKey.trim(),
      anthropic: anthropicKey.trim(),
      opikApiKey: opikApiKey.trim(),
      opikWorkspace: opikWorkspace.trim(),
      opikProject: opikProject.trim(),
      preferredModel: preferredModel || undefined,
    })
    localStorage.removeItem(getByokDismissKey())
    setDismissed(false)
    setOpen(false)
    setStep('keys')
    showSuccess('BYOK preview keys saved locally for this browser')
  }

  const handleSkip = () => {
    localStorage.setItem(getByokDismissKey(), 'true')
    setDismissed(true)
    setOpen(false)
    setStep('keys')
    showInfo('BYOK preview skipped for now')
  }

  const handleReopen = () => {
    setStep('keys')
    setOpen(true)
  }

  return (
    <>
      <button
        onClick={handleReopen}
        className="text-xs rounded-full border border-amber-300/60 bg-amber-50 px-2.5 py-1 text-amber-700 hover:bg-amber-100 transition-colors dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-300"
        title="Configure preview BYOK keys"
      >
        BYOK Preview
      </button>

      {!open ? null : (
        <div className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-xl rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-2xl p-5 max-h-[93vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">Bring Your Own Keys</div>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Dev preview. User keys stay local to this browser for now and are meant for flow testing, not final secure storage.
                </p>
              </div>
              <button
                onClick={() => { setOpen(false); setStep('keys') }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {/* Step indicator */}
            <div className="mt-4 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <span className={`px-2 py-1 rounded-full ${step === 'keys' ? 'bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 font-medium' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}>
                1. LLM Keys
              </span>
              <span className="text-gray-300 dark:text-gray-600">&rarr;</span>
              <span className={`px-2 py-1 rounded-full ${step === 'monitoring' ? 'bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 font-medium' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}>
                2. Monitoring
              </span>
            </div>

            {step === 'keys' ? (
              <>
                <div className="mt-4 rounded-xl border border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-900/20 p-4 text-sm text-sky-900 dark:text-sky-100">
                  <div className="font-medium">Why bring your own keys?</div>
                  <div className="mt-1">
                    System keys may be limited or unavailable. Add your own to ensure your agents can run with the models and providers you choose, billed to your own account.
                  </div>
                </div>

                <div className="mt-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-4 text-sm text-gray-600 dark:text-gray-300">
                  <div className="font-medium text-gray-900 dark:text-gray-100">Current status</div>
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
                          <span className="text-xs uppercase tracking-wide opacity-80">
                            {provider.available ? 'available' : 'missing'}
                          </span>
                        </div>
                        <div className="mt-1 text-xs opacity-80">Source: {provider.source}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-5 space-y-4">
                  <div>
                    <label htmlFor="byok-openai" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      OpenAI key
                    </label>
                    <input
                      id="byok-openai"
                      type="password"
                      value={openaiKey}
                      onChange={(e) => setOpenaiKey(e.target.value)}
                      placeholder="sk-..."
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />
                  </div>

                  <div>
                    <label htmlFor="byok-anthropic" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Anthropic key
                    </label>
                    <input
                      id="byok-anthropic"
                      type="password"
                      value={anthropicKey}
                      onChange={(e) => setAnthropicKey(e.target.value)}
                      placeholder="sk-ant-..."
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />
                  </div>

                  {/* Preferred model */}
                  {(hasOpenAiAvailable || hasAnthropicAvailable) && (
                    <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Preferred model for new agents
                      </label>
                      <select
                        value={preferredModel}
                        onChange={(e) => setPreferredModel(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm"
                      >
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
                      </select>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Used when creating agents and applying templates</p>
                    </div>
                  )}
                </div>

                <div className="mt-6 flex items-center justify-between gap-3">
                  <button
                    onClick={handleSkip}
                    className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
                  >
                    Skip for now
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleSave}
                      className="px-4 py-2 text-sm rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                      Save &amp; Close
                    </button>
                    <button
                      onClick={() => setStep('monitoring')}
                      className="px-4 py-2 text-sm rounded-md bg-sky-600 text-white hover:bg-sky-700 transition-colors"
                    >
                      Next &rarr;
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="mt-4 rounded-xl border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-900/20 p-4 text-sm text-purple-900 dark:text-purple-100">
                  <div className="font-medium">Opik Monitoring (optional)</div>
                  <div className="mt-1">
                    Connect your own <a href="https://www.comet.com/site/products/opik/" target="_blank" rel="noopener noreferrer" className="underline hover:text-purple-700 dark:hover:text-purple-300">Opik</a> account to track agent calls, tokens, and costs under your workspace. Without these, metering may be limited or unavailable.
                  </div>
                </div>

                <div className="mt-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-4 text-sm text-gray-600 dark:text-gray-300">
                  <div className="font-medium text-gray-900 dark:text-gray-100">Monitoring status</div>
                  <div className="mt-1">{monitoringStatusText}</div>
                </div>

                <div className="mt-5 space-y-4">
                  <div>
                    <label htmlFor="byok-opik-key" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Opik API key
                    </label>
                    <input
                      id="byok-opik-key"
                      type="password"
                      value={opikApiKey}
                      onChange={(e) => setOpikApiKey(e.target.value)}
                      placeholder="Your Opik API key"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>

                  <div>
                    <label htmlFor="byok-opik-workspace" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Opik workspace
                    </label>
                    <input
                      id="byok-opik-workspace"
                      type="text"
                      value={opikWorkspace}
                      onChange={(e) => setOpikWorkspace(e.target.value)}
                      placeholder="e.g. my-team"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                    <p className="mt-1 text-xs text-gray-400">Found in your Opik dashboard settings</p>
                  </div>

                  <div>
                    <label htmlFor="byok-opik-project" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Opik project name
                    </label>
                    <input
                      id="byok-opik-project"
                      type="text"
                      value={opikProject}
                      onChange={(e) => setOpikProject(e.target.value)}
                      placeholder="e.g. clawmax-agents"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                    <p className="mt-1 text-xs text-gray-400">All agent traces will be logged under this project</p>
                  </div>
                </div>

                <div className="mt-6 flex items-center justify-between gap-3">
                  <button
                    onClick={() => setStep('keys')}
                    className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
                  >
                    &larr; Back
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => { setOpen(false); setStep('keys') }}
                      className="px-4 py-2 text-sm rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                      Close
                    </button>
                    <button
                      onClick={handleSave}
                      className="px-4 py-2 text-sm rounded-md bg-sky-600 text-white hover:bg-sky-700 transition-colors"
                    >
                      Save All Keys
                    </button>
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
