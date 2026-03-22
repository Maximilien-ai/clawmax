import React, { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from './Toast'

const STORAGE_KEY = 'clawmax-byok-preview'
const DISMISS_KEY = 'clawmax-byok-preview-dismissed'

interface StoredByokKeys {
  openai?: string
  anthropic?: string
}

function readStoredKeys(): StoredByokKeys {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
  } catch {
    return {}
  }
}

function maskKey(value: string) {
  if (value.length <= 8) return 'configured'
  return `${value.slice(0, 4)}••••${value.slice(-4)}`
}

export function ByokWizard() {
  const { user, config } = useAuth()
  const { showSuccess, showInfo } = useToast()
  const [open, setOpen] = useState(false)
  const [openaiKey, setOpenaiKey] = useState('')
  const [anthropicKey, setAnthropicKey] = useState('')
  const [dismissed, setDismissed] = useState(false)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    const stored = readStoredKeys()
    setOpenaiKey(stored.openai || '')
    setAnthropicKey(stored.anthropic || '')
    setDismissed(localStorage.getItem(DISMISS_KEY) === 'true')
    setHydrated(true)
  }, [])

  const hasStoredKeys = !!(openaiKey || anthropicKey)
  const hasDefaultUserKeys = !!(config?.userKeyDefaults?.openai || config?.userKeyDefaults?.anthropic)

  useEffect(() => {
    if (!hydrated || !user || config?.authDisabled) return
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

  if (!user || config?.authDisabled || !hydrated) return null

  const handleSave = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      openai: openaiKey.trim(),
      anthropic: anthropicKey.trim(),
    }))
    localStorage.removeItem(DISMISS_KEY)
    setDismissed(false)
    setOpen(false)
    showSuccess('BYOK preview keys saved locally for this browser')
  }

  const handleSkip = () => {
    localStorage.setItem(DISMISS_KEY, 'true')
    setDismissed(true)
    setOpen(false)
    showInfo('BYOK preview skipped for now')
  }

  const handleReopen = () => {
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
          <div className="w-full max-w-lg rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-2xl p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">Bring Your Own Keys</div>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Dev preview. User keys stay local to this browser for now and are meant for flow testing, not final secure storage.
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="mt-5 rounded-xl border border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-900/20 p-4 text-sm text-sky-900 dark:text-sky-100">
              <div className="font-medium">System vs user keys</div>
              <div className="mt-1">
                System keys in `SYSTEM/dashboard/.env` power dashboard-owned actions. User keys are the default direction for the logged-in user&apos;s agents.
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-4 text-sm text-gray-600 dark:text-gray-300">
              <div className="font-medium text-gray-900 dark:text-gray-100">Current status</div>
              <div className="mt-1">{statusText}</div>
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
                  onClick={() => setOpen(false)}
                  className="px-4 py-2 text-sm rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  Close
                </button>
                <button
                  onClick={handleSave}
                  className="px-4 py-2 text-sm rounded-md bg-sky-600 text-white hover:bg-sky-700 transition-colors"
                >
                  Save Preview Keys
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
