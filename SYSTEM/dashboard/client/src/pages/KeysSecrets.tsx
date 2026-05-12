import React, { useEffect, useMemo, useState } from 'react'
import { useToast } from '../components/Toast'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { useAuth } from '../contexts/AuthContext'
import { detectProviderKeyMismatch, isOllamaUiAvailable, readStoredByokKeys } from '../lib/byok'
import { DEFAULT_VISIBLE_PARTNERS, getDefaultPartnerDefinitions } from '../lib/defaultPartners'
import { BROWSER_VAULT_UPDATED_EVENT, findManagedSecretConflicts, getPartnerVaultKey, parseEnvLikeSecrets, readSharedSecrets, writeSharedSecrets } from '../lib/localSecrets'

type SecretDraft = { key: string; value: string }
type PartnerDefinition = {
  slug: string
  name: string
  description?: string
  website?: string
  docsUrl?: string
  logoUrl?: string
  fields?: Array<{ key: string; label: string; sensitive?: boolean }>
}
type SecretConsumerMatch = {
  type: 'template' | 'workflow' | 'skill' | 'partner'
  name: string
}

type KeyGroup = 'all' | 'llm' | 'partners' | 'infra' | 'other'

function toDrafts(values: Record<string, string>): SecretDraft[] {
  return Object.entries(values)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => ({ key, value }))
}

function toRecord(drafts: SecretDraft[]): Record<string, string> {
  return Object.fromEntries(
    drafts
      .map((entry) => [entry.key.trim(), entry.value] as const)
      .filter(([key, value]) => key.length > 0 && value.trim().length > 0)
  )
}

function maskValue(value: string) {
  if (!value) return ''
  if (/^https?:\/\//i.test(value) || /^redis:\/\//i.test(value)) {
    try {
      const parsed = new URL(value)
      return `${parsed.protocol}//...`
    } catch {}
  }
  if (value.length <= 8) return '••••'
  return `${value.slice(0, 4)}••••${value.slice(-4)}`
}

function mergeDraftsWithImported(currentDrafts: SecretDraft[], imported: Record<string, string>): SecretDraft[] {
  const merged = {
    ...toRecord(currentDrafts),
    ...imported,
  }
  return toDrafts(merged)
}

function getKeyGroup(key: string, partnerDefinitions: PartnerDefinition[]): KeyGroup {
  const normalized = key.trim().toUpperCase()
  if (!normalized) return 'other'

  if (
    normalized.startsWith('OPENAI_') ||
    normalized.startsWith('ANTHROPIC_') ||
    normalized.startsWith('GEMINI_') ||
    normalized.startsWith('OLLAMA_')
  ) {
    return 'llm'
  }

  const partnerKeys = new Set(
    partnerDefinitions.flatMap((partner) =>
      (partner.fields || []).map((field) => getPartnerVaultKey(partner.slug, field.key).toUpperCase())
    )
  )
  if (partnerKeys.has(normalized)) return 'partners'

  if (
    normalized.includes('URL') ||
    normalized.includes('HOST') ||
    normalized.includes('DATABASE') ||
    normalized.includes('POSTGRES') ||
    normalized.includes('MYSQL') ||
    normalized.includes('MONGO') ||
    normalized.includes('SUPABASE') ||
    normalized.includes('S3') ||
    normalized.includes('AWS') ||
    normalized.includes('GCP') ||
    normalized.includes('AZURE') ||
    normalized.includes('BUCKET') ||
    normalized.includes('STORAGE')
  ) {
    return 'infra'
  }

  return 'other'
}

function SecretSection({
  title,
  description,
  drafts,
  setDrafts,
  onSave,
  defaultOpen,
}: {
  title: string
  description: string
  drafts: SecretDraft[]
  setDrafts: React.Dispatch<React.SetStateAction<SecretDraft[]>>
  onSave: () => void
  defaultOpen: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)

  useEffect(() => {
    setOpen(defaultOpen)
  }, [defaultOpen])

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{description}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setOpen((current) => !current)}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            {open ? 'Hide Editor' : `Edit Keys (${drafts.length})`}
          </button>
          {open && (
            <button
              type="button"
              onClick={() => setDrafts((current) => [...current, { key: '', value: '' }])}
              className="rounded-md border border-sky-300 px-3 py-1.5 text-xs font-medium text-sky-700 hover:bg-sky-50 dark:border-sky-700 dark:text-sky-300 dark:hover:bg-sky-900/20"
            >
              + Add Key
            </button>
          )}
        </div>
      </div>

      {open && (
        <>
          <div className="mt-4 space-y-3">
            {drafts.length === 0 && (
              <div className="rounded-lg border border-dashed border-gray-300 px-4 py-6 text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400">
                No keys saved yet.
              </div>
            )}
            {drafts.map((entry, index) => (
              <div key={`${title}-${index}`} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                <input
                  type="text"
                  value={entry.key}
                  onChange={(e) => setDrafts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, key: e.target.value } : item))}
                  placeholder="key name"
                  className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                />
                <input
                  type="password"
                  value={entry.value}
                  onChange={(e) => setDrafts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, value: e.target.value } : item))}
                  placeholder="value"
                  className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                />
                <button
                  type="button"
                  onClick={() => setDrafts((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                  className="rounded-md border border-rose-300 px-3 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50 dark:border-rose-700 dark:text-rose-300 dark:hover:bg-rose-900/20"
                  title="Remove key"
                  aria-label="Remove key"
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          {drafts.length > 0 && (
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={onSave}
                className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700"
              >
                Save
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default function KeysSecrets() {
  const { showSuccess, showWarning } = useToast()
  const { activeWorkspace } = useWorkspace()
  const { config } = useAuth()
  const ollamaEnabled = isOllamaUiAvailable(config)
  const [globalDrafts, setGlobalDrafts] = useState<SecretDraft[]>([])
  const [workspaceDrafts, setWorkspaceDrafts] = useState<SecretDraft[]>([])
  const [importScope, setImportScope] = useState<'workspace' | 'global'>('workspace')
  const [importText, setImportText] = useState('')
  const [partnerDefinitions, setPartnerDefinitions] = useState<PartnerDefinition[]>([])
  const [managedSecrets, setManagedSecrets] = useState<Record<string, string>>({})
  const [knownMatches, setKnownMatches] = useState<Record<string, SecretConsumerMatch[]>>({})
  const [keySearch, setKeySearch] = useState('')
  const [keyGroupFilter, setKeyGroupFilter] = useState<KeyGroup>('all')

  const refreshVaultState = React.useCallback(() => {
    setGlobalDrafts(toDrafts(readSharedSecrets('global')))
    setWorkspaceDrafts(toDrafts(readSharedSecrets('workspace', activeWorkspace?.id)))
    const stored = readStoredByokKeys()
    setManagedSecrets({
      ...(stored.openai?.trim() ? { OPENAI_API_KEY: stored.openai.trim() } : {}),
      ...(stored.anthropic?.trim() ? { ANTHROPIC_API_KEY: stored.anthropic.trim() } : {}),
      ...(stored.geminiApiKey?.trim() ? { GEMINI_API_KEY: stored.geminiApiKey.trim() } : {}),
      ...(ollamaEnabled && stored.ollamaBaseUrl?.trim() ? { OLLAMA_BASE_URL: stored.ollamaBaseUrl.trim() } : {}),
    })
  }, [activeWorkspace?.id, ollamaEnabled])

  useEffect(() => {
    refreshVaultState()
  }, [refreshVaultState])

  useEffect(() => {
    refreshVaultState()
  }, [activeWorkspace?.id, refreshVaultState])

  useEffect(() => {
    fetch('/api/integrations/status')
      .then((res) => res.json())
      .then((data) => {
        const visiblePartners = Array.isArray(data?.visiblePartners) && data.visiblePartners.length > 0
          ? data.visiblePartners.filter((item: unknown): item is string => typeof item === 'string')
          : [...DEFAULT_VISIBLE_PARTNERS]
        const visibleSet = new Set(visiblePartners)
        const definitions = Array.isArray(data?.partnerDefinitions) && data.partnerDefinitions.length > 0
          ? data.partnerDefinitions
          : getDefaultPartnerDefinitions()
        setPartnerDefinitions(definitions.filter((partner: PartnerDefinition) => visibleSet.has(partner.slug)))
      })
      .catch(() => setPartnerDefinitions(getDefaultPartnerDefinitions()))
  }, [])

  useEffect(() => {
    const handleVaultUpdated = () => refreshVaultState()
    window.addEventListener(BROWSER_VAULT_UPDATED_EVENT, handleVaultUpdated)
    return () => window.removeEventListener(BROWSER_VAULT_UPDATED_EVENT, handleVaultUpdated)
  }, [refreshVaultState])

  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetch('/api/templates').then((res) => (res.ok ? res.json() : { agents: [], organizations: [], workflows: [] })).catch(() => ({ agents: [], organizations: [], workflows: [] })),
      fetch('/api/workflows').then((res) => (res.ok ? res.json() : { workflows: [] })).catch(() => ({ workflows: [] })),
      fetch('/api/skills').then((res) => (res.ok ? res.json() : { skills: [] })).catch(() => ({ skills: [] })),
      fetch('/api/integrations/status').then((res) => (res.ok ? res.json() : { partnerDefinitions: [] })).catch(() => ({ partnerDefinitions: [] })),
    ]).then(([templateData, workflowData, skillData, integrationData]) => {
      if (cancelled) return
      const nextMatches: Record<string, SecretConsumerMatch[]> = {}
      const addMatch = (key: string, type: SecretConsumerMatch['type'], name: string) => {
        if (!key?.trim()) return
        nextMatches[key] = [...(nextMatches[key] || []), { type, name }]
      }

      const allTemplates = [
        ...(Array.isArray(templateData?.agents) ? templateData.agents : []),
        ...(Array.isArray(templateData?.organizations) ? templateData.organizations : []),
        ...(Array.isArray(templateData?.workflows) ? templateData.workflows : []),
      ]
      for (const template of allTemplates) {
        for (const requirement of Array.isArray(template?.secretRequirements) ? template.secretRequirements : []) {
          addMatch(requirement.key, 'template', template.name || template.id || 'Template')
        }
      }
      for (const workflow of Array.isArray(workflowData?.workflows) ? workflowData.workflows : []) {
        for (const requirement of Array.isArray(workflow?.secretRequirements) ? workflow.secretRequirements : []) {
          addMatch(requirement.key, 'workflow', workflow.name || workflow.id || 'Workflow')
        }
      }
      for (const skill of Array.isArray(skillData?.skills) ? skillData.skills : []) {
        for (const requirement of Array.isArray(skill?.secretRequirements) ? skill.secretRequirements : []) {
          addMatch(requirement.key, 'skill', skill.name || 'Skill')
        }
      }
      const visiblePartners = Array.isArray(integrationData?.visiblePartners) && integrationData.visiblePartners.length > 0
        ? integrationData.visiblePartners.filter((item: unknown): item is string => typeof item === 'string')
        : [...DEFAULT_VISIBLE_PARTNERS]
      const visibleSet = new Set(visiblePartners)
      const integrationPartners = Array.isArray(integrationData?.partnerDefinitions) && integrationData.partnerDefinitions.length > 0
        ? integrationData.partnerDefinitions
        : getDefaultPartnerDefinitions()
      for (const partner of integrationPartners) {
        if (!visibleSet.has(partner?.slug)) continue
        for (const field of Array.isArray(partner?.fields) ? partner.fields : []) {
          addMatch(getPartnerVaultKey(partner.slug, field.key), 'partner', partner.name || partner.slug)
        }
      }

      for (const [key, matches] of Object.entries(nextMatches)) {
        nextMatches[key] = matches.sort((a, b) => {
          const order = { partner: 0, template: 1, workflow: 2, skill: 3 }
          return order[a.type] - order[b.type] || a.name.localeCompare(b.name)
        })
      }

      setKnownMatches(nextMatches)
    })

    return () => {
      cancelled = true
    }
  }, [])

  const globalPreview = useMemo(() => toRecord(globalDrafts), [globalDrafts])
  const workspacePreview = useMemo(() => toRecord(workspaceDrafts), [workspaceDrafts])
  const visibleGlobalPreview = useMemo(
    () => (ollamaEnabled ? globalPreview : Object.fromEntries(Object.entries(globalPreview).filter(([key]) => key !== 'OLLAMA_BASE_URL'))),
    [globalPreview, ollamaEnabled]
  )
  const visibleWorkspacePreview = useMemo(
    () => (ollamaEnabled ? workspacePreview : Object.fromEntries(Object.entries(workspacePreview).filter(([key]) => key !== 'OLLAMA_BASE_URL'))),
    [workspacePreview, ollamaEnabled]
  )
  const globalManagedConflicts = useMemo(
    () => findManagedSecretConflicts(visibleGlobalPreview, managedSecrets),
    [visibleGlobalPreview, managedSecrets]
  )
  const workspaceManagedConflicts = useMemo(
    () => findManagedSecretConflicts(visibleWorkspacePreview, managedSecrets),
    [visibleWorkspacePreview, managedSecrets]
  )
  const matchesKeyInventoryFilters = React.useCallback((key: string, value: string) => {
    const search = keySearch.trim().toLowerCase()
    const group = getKeyGroup(key, partnerDefinitions)
    if (keyGroupFilter !== 'all' && group !== keyGroupFilter) return false
    if (!search) return true
    const matchText = [
      key,
      value,
      ...(knownMatches[key] || []).map((match) => `${match.type} ${match.name}`),
      group,
    ].join(' ').toLowerCase()
    return matchText.includes(search)
  }, [keySearch, keyGroupFilter, partnerDefinitions, knownMatches])
  const filteredWorkspaceEntries = useMemo(
    () => Object.entries(visibleWorkspacePreview).filter(([key, value]) => matchesKeyInventoryFilters(key, value)),
    [visibleWorkspacePreview, matchesKeyInventoryFilters]
  )
  const filteredGlobalEntries = useMemo(
    () => Object.entries(visibleGlobalPreview).filter(([key, value]) => matchesKeyInventoryFilters(key, value)),
    [visibleGlobalPreview, matchesKeyInventoryFilters]
  )
  const totalVisibleKeyEntries = filteredWorkspaceEntries.length + filteredGlobalEntries.length
  const keyGroupTabs: Array<{ key: KeyGroup; label: string }> = [
    { key: 'all', label: 'All' },
    { key: 'llm', label: 'LLM' },
    { key: 'partners', label: 'Partners' },
    { key: 'infra', label: 'Infra' },
    { key: 'other', label: 'Other' },
  ]

  const validateProviderKeysInVault = React.useCallback((values: Record<string, string>) => {
    const checks: Array<[keyof Pick<typeof values, never> | string, 'openai' | 'anthropic' | 'gemini']> = [
      ['OPENAI_API_KEY', 'openai'],
      ['ANTHROPIC_API_KEY', 'anthropic'],
      ['GEMINI_API_KEY', 'gemini'],
    ]
    for (const [keyName, provider] of checks) {
      const mismatch = detectProviderKeyMismatch(provider, values[keyName] || '')
      if (mismatch) return mismatch.message
    }
    return null
  }, [])

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Keys & Secrets</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Manage reusable browser-local keys once, then let template, workflow, skill, and integration inputs prefill automatically.
        </p>
      </div>

      <div className="rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-900 dark:border-violet-800 dark:bg-violet-900/20 dark:text-violet-100">
        <div className="font-medium">How this works</div>
        <ul className="mt-2 list-disc pl-5 space-y-1 text-xs opacity-90">
          <li>Values are stored only in this browser.</li>
          <li>Workspace keys apply only to the active workspace.</li>
          <li>Global keys are available across all workspaces.</li>
          <li>Template/workflow/skill-specific values still override shared keys when present.</li>
        </ul>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-100">
        <div className="font-medium">Safety & Security</div>
        <ul className="mt-2 list-disc pl-5 space-y-1 text-xs opacity-90">
          <li>This vault is a browser-local convenience layer for capture and reuse, not a hardened remote secrets manager.</li>
          <li>Use platform or infrastructure secret stores for production cloud and on-prem deployments.</li>
          <li>If you share this browser profile or machine, treat vault values as accessible to that local profile.</li>
        </ul>
      </div>

      {(workspaceManagedConflicts.length > 0 || globalManagedConflicts.length > 0) && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900 dark:border-rose-800 dark:bg-rose-900/20 dark:text-rose-100">
          <div className="font-medium">Integration override notice</div>
          <div className="mt-1 text-sm opacity-90">
            Some shared keys differ from current Workspaces Integrations / BYOK values. Model-provider flows still use the integration values until you update them there too.
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {workspaceManagedConflicts.length > 0 && (
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide opacity-80">Workspace key conflicts</div>
                <div className="mt-2 space-y-1 text-xs">
                  {workspaceManagedConflicts.map((conflict) => (
                    <div key={`workspace-conflict-${conflict.key}`}>
                      <span className="font-medium">{conflict.key}</span>
                      <span className="opacity-80"> differs from current integration value</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {globalManagedConflicts.length > 0 && (
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide opacity-80">Global key conflicts</div>
                <div className="mt-2 space-y-1 text-xs">
                  {globalManagedConflicts.map((conflict) => (
                    <div key={`global-conflict-${conflict.key}`}>
                      <span className="font-medium">{conflict.key}</span>
                      <span className="opacity-80"> differs from current integration value</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <SecretSection
          title={`Workspace Keys${activeWorkspace ? ` · ${activeWorkspace.name}` : ''}`}
          description="Use these for secrets that should stay scoped to the current workspace."
          drafts={ollamaEnabled ? workspaceDrafts : workspaceDrafts.filter((entry) => entry.key !== 'OLLAMA_BASE_URL')}
          setDrafts={setWorkspaceDrafts}
          defaultOpen={(ollamaEnabled ? workspaceDrafts : workspaceDrafts.filter((entry) => entry.key !== 'OLLAMA_BASE_URL')).length === 0}
          onSave={() => {
            const mismatchMessage = validateProviderKeysInVault(visibleWorkspacePreview)
            if (mismatchMessage) {
              showWarning(mismatchMessage)
              return
            }
            writeSharedSecrets(visibleWorkspacePreview, { scope: 'workspace', workspaceId: activeWorkspace?.id })
            showSuccess('Saved workspace keys')
          }}
        />

        <SecretSection
          title="Global Keys"
          description="Use these for secrets you want available across all workspaces in this browser."
          drafts={ollamaEnabled ? globalDrafts : globalDrafts.filter((entry) => entry.key !== 'OLLAMA_BASE_URL')}
          setDrafts={setGlobalDrafts}
          defaultOpen={(ollamaEnabled ? globalDrafts : globalDrafts.filter((entry) => entry.key !== 'OLLAMA_BASE_URL')).length === 0}
          onSave={() => {
            const mismatchMessage = validateProviderKeysInVault(visibleGlobalPreview)
            if (mismatchMessage) {
              showWarning(mismatchMessage)
              return
            }
            writeSharedSecrets(visibleGlobalPreview, { scope: 'global' })
            showSuccess('Saved global keys')
          }}
        />
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">Current Key Names</div>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Search across workspace and global keys, then narrow by group.
            </p>
          </div>
          <div className="w-full max-w-sm">
            <input
              type="text"
              value={keySearch}
              onChange={(e) => setKeySearch(e.target.value)}
              placeholder="Search key names, values, or usage..."
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {keyGroupTabs.map((tab) => (
            <button
              key={`key-group-${tab.key}`}
              type="button"
              onClick={() => setKeyGroupFilter(tab.key)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                keyGroupFilter === tab.key
                  ? 'bg-sky-100 text-sky-700 border border-sky-300 dark:bg-sky-900/30 dark:text-sky-300 dark:border-sky-700'
                  : 'bg-white text-gray-600 border border-gray-200 hover:border-gray-300 dark:bg-gray-900 dark:text-gray-300 dark:border-gray-700 dark:hover:border-gray-600'
              }`}
            >
              {tab.label}
            </button>
          ))}
          {(keySearch.trim() || keyGroupFilter !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setKeySearch('')
                setKeyGroupFilter('all')
              }}
              className="rounded-full px-3 py-1.5 text-xs font-medium border border-gray-300 text-gray-600 hover:border-gray-400 dark:border-gray-600 dark:text-gray-300 dark:hover:border-gray-500"
            >
              Clear
            </button>
          )}
        </div>
        <div className="mt-3 text-xs text-gray-500 dark:text-gray-400">
          Showing {totalVisibleKeyEntries} key{totalVisibleKeyEntries !== 1 ? 's' : ''}
        </div>
        <div className="mt-3 grid max-h-[28rem] gap-4 md:grid-cols-2">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Global ({Object.keys(visibleGlobalPreview).length})
            </div>
            <div className="mt-2 max-h-[24rem] space-y-2 overflow-y-auto pr-1">
              {Object.entries(visibleGlobalPreview).length === 0 && <span className="text-sm text-gray-400">None yet</span>}
              {Object.entries(visibleGlobalPreview).length > 0 && filteredGlobalEntries.length === 0 && (
                <span className="text-sm text-gray-400">No global keys match your search or group filter.</span>
              )}
              {filteredGlobalEntries.map(([key, value]) => (
                <div key={`global-${key}`} className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-700 dark:border-violet-800 dark:bg-violet-900/20 dark:text-violet-300">
                  <div className="flex flex-wrap items-center gap-2">
                    <span>{key}</span>
                    <span className="inline-flex rounded-full bg-white/80 px-2 py-0.5 text-[11px] uppercase tracking-wide dark:bg-violet-950/60">
                      {getKeyGroup(key, partnerDefinitions)}
                    </span>
                    <span className="opacity-70">{maskValue(value)}</span>
                  </div>
                  {(knownMatches[key] || []).length > 0 && (
                    <div className="mt-2">
                      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide opacity-70">Used By</div>
                      <div className="flex flex-wrap gap-1.5">
                      {knownMatches[key].slice(0, 6).map((match, index) => (
                        <span key={`global-${key}-${match.type}-${match.name}-${index}`} className="inline-flex rounded-full bg-white/80 px-2 py-0.5 text-[11px] text-violet-700 dark:bg-violet-950/60 dark:text-violet-200">
                          {match.type}: {match.name}
                        </span>
                      ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Workspace ({Object.keys(visibleWorkspacePreview).length})
            </div>
            <div className="mt-2 max-h-[24rem] space-y-2 overflow-y-auto pr-1">
              {Object.entries(visibleWorkspacePreview).length === 0 && <span className="text-sm text-gray-400">None yet</span>}
              {Object.entries(visibleWorkspacePreview).length > 0 && filteredWorkspaceEntries.length === 0 && (
                <span className="text-sm text-gray-400">No workspace keys match your search or group filter.</span>
              )}
              {filteredWorkspaceEntries.map(([key, value]) => (
                <div key={`workspace-${key}`} className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-700 dark:border-sky-800 dark:bg-sky-900/20 dark:text-sky-300">
                  <div className="flex flex-wrap items-center gap-2">
                    <span>{key}</span>
                    <span className="inline-flex rounded-full bg-white/80 px-2 py-0.5 text-[11px] uppercase tracking-wide dark:bg-sky-950/60">
                      {getKeyGroup(key, partnerDefinitions)}
                    </span>
                    <span className="opacity-70">{maskValue(value)}</span>
                  </div>
                  {(knownMatches[key] || []).length > 0 && (
                    <div className="mt-2">
                      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide opacity-70">Used By</div>
                      <div className="flex flex-wrap gap-1.5">
                      {knownMatches[key].slice(0, 6).map((match, index) => (
                        <span key={`workspace-${key}-${match.type}-${match.name}-${index}`} className="inline-flex rounded-full bg-white/80 px-2 py-0.5 text-[11px] text-sky-700 dark:bg-sky-950/60 dark:text-sky-200">
                          {match.type}: {match.name}
                        </span>
                      ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">Partner Integrations</div>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Shared keys here back partner integration setup too. Use Workspaces Integrations for partner-specific defaults and readiness checks.
            </p>
          </div>
        </div>
        {Object.keys(managedSecrets).length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {Object.keys(managedSecrets).sort().map((key) => (
              <span key={`managed-${key}`} className="inline-flex rounded-full bg-amber-50 px-3 py-1 text-xs text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
                Managed in Integrations: {key}
              </span>
            ))}
          </div>
        )}
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {partnerDefinitions.length === 0 && (
            <div className="text-sm text-gray-400">No visible partner integrations configured.</div>
          )}
          {partnerDefinitions.map((partner) => (
            <div key={partner.slug} className="rounded-xl border border-gray-200 p-4 dark:border-gray-700">
              <div className="flex items-start gap-3">
                {partner.logoUrl ? (
                  <img src={partner.logoUrl} alt={`${partner.name} logo`} className="h-10 w-10 rounded-lg object-contain bg-white p-1" />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 text-xs font-semibold text-gray-500 dark:bg-gray-700 dark:text-gray-300">
                    {partner.name.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="font-medium text-gray-900 dark:text-gray-100">{partner.name}</div>
                  <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{partner.description || 'Partner integration'}</div>
                </div>
              </div>
              {Array.isArray(partner.fields) && partner.fields.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {partner.fields.map((field) => (
                    <span key={`${partner.slug}-${field.key}`} className="inline-flex rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                      {getPartnerVaultKey(partner.slug, field.key)}
                    </span>
                  ))}
                </div>
              )}
              <div className="mt-3 flex flex-wrap gap-3 text-xs">
                {partner.website && (
                  <a href={partner.website} target="_blank" rel="noreferrer" className="text-sky-600 hover:underline dark:text-sky-400">
                    Website
                  </a>
                )}
                {partner.docsUrl && (
                  <a href={partner.docsUrl} target="_blank" rel="noreferrer" className="text-sky-600 hover:underline dark:text-sky-400">
                    Docs
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 shadow-sm dark:border-amber-800 dark:bg-amber-900/20">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Import From .env / Key List</h2>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
              Paste `KEY=value` lines and import them into workspace or global browser-local keys in one step.
            </p>
          </div>
          <div className="inline-flex rounded-lg border border-amber-300 bg-white p-1 text-xs dark:border-amber-700 dark:bg-gray-900">
            <button
              type="button"
              onClick={() => setImportScope('workspace')}
              className={`rounded-md px-3 py-1.5 ${importScope === 'workspace' ? 'bg-amber-500 text-white' : 'text-gray-600 dark:text-gray-300'}`}
            >
              Workspace
            </button>
            <button
              type="button"
              onClick={() => setImportScope('global')}
              className={`rounded-md px-3 py-1.5 ${importScope === 'global' ? 'bg-amber-500 text-white' : 'text-gray-600 dark:text-gray-300'}`}
            >
              Global
            </button>
          </div>
        </div>
        <textarea
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
          rows={7}
          placeholder={`OPENAI_API_KEY=...\nANTHROPIC_API_KEY=...\nGITHUB_TOKEN=...`}
          className="mt-4 w-full rounded-lg border border-amber-300 bg-white px-3 py-3 font-mono text-sm text-gray-900 dark:border-amber-700 dark:bg-gray-900 dark:text-gray-100"
        />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-gray-500 dark:text-gray-400">
            Comments and blank lines are ignored. Existing keys with the same name will be updated.
          </div>
          <button
            type="button"
            onClick={() => {
              const imported = parseEnvLikeSecrets(importText)
              const count = Object.keys(imported).length
              if (count === 0) return
              if (importScope === 'workspace') {
                setWorkspaceDrafts((current) => mergeDraftsWithImported(current, imported))
              } else {
                setGlobalDrafts((current) => mergeDraftsWithImported(current, imported))
              }
              setImportText('')
              showSuccess(`Imported ${count} key${count === 1 ? '' : 's'} into ${importScope === 'workspace' ? 'workspace' : 'global'} keys`)
            }}
            className="rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600"
          >
            Import Keys
          </button>
        </div>
      </div>
    </div>
  )
}
