import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from './Toast'
import { buildByokVerificationFingerprint, detectProviderKeyMismatch, getByokDismissKey, readStoredByokKeys, writeStoredByokKeys } from '../lib/byok'
import { DEFAULT_VISIBLE_PARTNERS, getDefaultPartnerDefinitions } from '../lib/defaultPartners'
import { BROWSER_VAULT_UPDATED_EVENT, readPartnerValuesFromSharedSecrets, readSharedSecrets, writePartnerValuesToSharedSecrets, writeSharedSecrets } from '../lib/localSecrets'

function maskKey(value: string) {
  if (value.length <= 8) return 'configured'
  return `${value.slice(0, 4)}••••${value.slice(-4)}`
}

type Step = 'models' | 'partners' | `partner:${string}`
type ModelTab = 'openai' | 'anthropic' | 'gemini' | 'ollama'
type ProviderKey = 'openai' | 'anthropic' | 'gemini'
type ValidationEntry = { status: 'idle' | 'valid' | 'invalid' | 'error' | 'skipped'; message: string }
type ValidationState = Record<'openai' | 'anthropic' | 'gemini' | 'ollama' | 'opik' | 'senso', ValidationEntry>
type ModelsByProvider = Record<string, { name: string; models: string[] }>
type PartnerFieldDefinition = {
  key: string
  label: string
  type: 'text' | 'password' | 'select'
  required?: boolean
  secret?: boolean
  storage?: 'browser' | 'server'
}
type PartnerSkillsDefinition = {
  mode: 'shipables' | 'curated-installer' | 'planned' | 'catalog'
  items?: string[]
  commandId?: string
  label?: string
}
type PartnerValidationDefinition = {
  mode: 'live' | 'config' | 'status'
  resultKey?: string
  label?: string
  helperText?: string
}
type PartnerDefinition = {
  slug: string
  name: string
  logoUrl?: string
  website?: string
  docsUrl?: string
  description: string
  category?: string
  enabledByDefault?: boolean
  fields?: PartnerFieldDefinition[]
  skills?: PartnerSkillsDefinition
  validation?: PartnerValidationDefinition
  content?: string
}
type IntegrationStatus = {
  validationAvailable: boolean
  validationMode: 'live' | 'fallback'
  providers: string[]
  notes?: string[]
  visiblePartners: string[]
  partnerDefinitions: PartnerDefinition[]
}
type WorkspaceIntegrationConfig = {
  preferredModel?: string
  githubDefaultRepo?: string
  sensoContextLabel?: string
  ollamaBaseUrl?: string
  ollamaDefaultModel?: string
  opikWorkspace?: string
  opikProject?: string
  enabledPartners?: string[]
  partners?: Record<string, Record<string, string | boolean | undefined>>
}
type PartnerValueMap = Record<string, Record<string, string>>
type PartnerSecretPresence = Record<string, Record<string, boolean>>
type ScopedValidationTarget = 'all' | 'current-partner' | 'openai' | 'anthropic' | 'gemini' | 'ollama'

const localDevOllamaBaseUrl = 'http://localhost:11434'
const CLOSE_INTEGRATIONS_WIZARDS_EVENT = 'clawmax-close-integrations-wizards'

function mergePartnerMaps(base: PartnerValueMap, extra: PartnerValueMap): PartnerValueMap {
  const next: PartnerValueMap = { ...base }
  for (const [slug, values] of Object.entries(extra)) {
    next[slug] = { ...(next[slug] || {}), ...values }
  }
  return next
}

function normalizePartnerValues(values: Record<string, string | boolean | undefined> | undefined): Record<string, string> {
  return Object.fromEntries(
    Object.entries(values || {})
      .filter(([, value]) => typeof value === 'string' && value.trim())
      .map(([key, value]) => [key, value.trim()])
  )
}

function buildPartnerConfig(values: PartnerValueMap): Record<string, Record<string, string>> {
  return Object.fromEntries(
    Object.entries(values)
      .map(([slug, partnerValues]) => [
        slug,
        Object.fromEntries(
          Object.entries(partnerValues || {})
            .map(([key, value]) => [key, value.trim()])
            .filter(([, value]) => !!value)
        ),
      ])
      .filter(([, partnerValues]) => Object.keys(partnerValues).length > 0)
  )
}

const PARTNER_PRIORITY: Record<string, number> = {
  opik: 0,
  github: 1,
  senso: 2,
}

function sortPartnerDefinitions(partners: PartnerDefinition[]): PartnerDefinition[] {
  return [...partners].sort((a, b) => {
    const aPriority = PARTNER_PRIORITY[a.slug] ?? 100
    const bPriority = PARTNER_PRIORITY[b.slug] ?? 100
    if (aPriority !== bPriority) return aPriority - bPriority
    return a.name.localeCompare(b.name)
  })
}

function mergeProviderKeysIntoSharedSecrets(
  existing: Record<string, string>,
  values: { openai: string; anthropic: string; gemini: string; ollamaBaseUrl: string }
) {
  const next = { ...existing }
  if (values.openai) next.OPENAI_API_KEY = values.openai
  else delete next.OPENAI_API_KEY
  if (values.anthropic) next.ANTHROPIC_API_KEY = values.anthropic
  else delete next.ANTHROPIC_API_KEY
  if (values.gemini) next.GEMINI_API_KEY = values.gemini
  else delete next.GEMINI_API_KEY
  if (values.ollamaBaseUrl) next.OLLAMA_BASE_URL = values.ollamaBaseUrl
  else delete next.OLLAMA_BASE_URL
  return next
}

export function ByokWizard({
  triggerLabel = 'Workspaces Integrations',
  triggerTitle = 'Configure workspaces integrations',
  initialStep = 'models',
  openEventName = 'open-workspaces-integrations',
  suppressAutoOpen = false,
}: {
  triggerLabel?: string
  triggerTitle?: string
  initialStep?: Step
  openEventName?: string
  suppressAutoOpen?: boolean
} = {}) {
  const { user, config } = useAuth()
  const { showSuccess, showInfo, showWarning } = useToast()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>('models')
  const [openaiKey, setOpenaiKey] = useState('')
  const [anthropicKey, setAnthropicKey] = useState('')
  const [geminiApiKey, setGeminiApiKey] = useState('')
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState('')
  const [ollamaDefaultModel, setOllamaDefaultModel] = useState('')
  const [preferredModel, setPreferredModel] = useState('')
  const [partnerSecrets, setPartnerSecrets] = useState<PartnerValueMap>({})
  const [serverPartnerSecretPresence, setServerPartnerSecretPresence] = useState<PartnerSecretPresence>({})
  const [partnerValues, setPartnerValues] = useState<PartnerValueMap>({})
  const [selectedPartners, setSelectedPartners] = useState<string[]>([])
  const [validating, setValidating] = useState(false)
  const [validation, setValidation] = useState<ValidationState>({
    openai: { status: 'idle', message: '' },
    anthropic: { status: 'idle', message: '' },
    gemini: { status: 'idle', message: '' },
    ollama: { status: 'idle', message: '' },
    opik: { status: 'idle', message: '' },
    senso: { status: 'idle', message: '' },
  })
  const [dismissed, setDismissed] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const [githubChecks, setGithubChecks] = useState<Array<{ id: string; label: string; status: string; message: string; fixHint?: string }>>([])
  const [githubMode, setGithubMode] = useState<'token' | 'gh' | 'none'>('none')
  const [githubStatusChecking, setGithubStatusChecking] = useState(false)
  const [githubAuthLogs, setGithubAuthLogs] = useState<string[]>([])
  const [githubAuthRunning, setGithubAuthRunning] = useState(false)
  const [githubAuthError, setGithubAuthError] = useState<string | null>(null)
  const [githubAuthDone, setGithubAuthDone] = useState(false)
  const [integrationStatus, setIntegrationStatus] = useState<IntegrationStatus | null>(null)
  const [ollamaModels, setOllamaModels] = useState<string[]>([])
  const [ollamaModelsLoading, setOllamaModelsLoading] = useState(false)
  const [modelsByProvider, setModelsByProvider] = useState<ModelsByProvider>({})
  const [partnerInstallState, setPartnerInstallState] = useState<Record<string, 'idle' | 'installing'>>({})
  const [installedPartnerSkillSlugs, setInstalledPartnerSkillSlugs] = useState<Set<string>>(new Set())
  const preferredModelRef = useRef<HTMLSelectElement | null>(null)
  const [highlightPreferredModel, setHighlightPreferredModel] = useState(false)
  const [modelTab, setModelTab] = useState<ModelTab>('openai')
  const [onboardingOpen, setOnboardingOpen] = useState(false)
  const ollamaEnabled = config?.ollamaEnabled !== false
  const defaultOllamaBaseUrl = config?.defaultOllamaBaseUrl || localDevOllamaBaseUrl

  const refreshLocalState = React.useCallback(() => {
    const stored = readStoredByokKeys()
    const sharedWorkspace = readSharedSecrets('workspace')
    const sharedGlobal = readSharedSecrets('global')
    const shared = { ...sharedGlobal, ...sharedWorkspace }

    setOpenaiKey(shared.OPENAI_API_KEY || stored.openai || '')
    setAnthropicKey(shared.ANTHROPIC_API_KEY || stored.anthropic || '')
    setGeminiApiKey(shared.GEMINI_API_KEY || stored.geminiApiKey || '')
    setOllamaBaseUrl(shared.OLLAMA_BASE_URL || stored.ollamaBaseUrl || defaultOllamaBaseUrl)
    setOllamaDefaultModel(stored.ollamaDefaultModel || '')
    setPreferredModel(stored.preferredModel || '')
    setPartnerSecrets(stored.partnerSecrets || {})
    setPartnerValues(stored.partnerValues || {})
    setDismissed(localStorage.getItem(getByokDismissKey()) === 'true')
  }, [defaultOllamaBaseUrl])

  const updateStoredVerification = React.useCallback((
    updater: (current: Partial<Record<'openai' | 'anthropic' | 'gemini' | 'ollama', string>>) => Partial<Record<'openai' | 'anthropic' | 'gemini' | 'ollama', string>>
  ) => {
    const stored = readStoredByokKeys()
    writeStoredByokKeys({
      ...stored,
      verifiedProviders: updater(stored.verifiedProviders || {}),
    }, { silent: true })
  }, [])

  const currentVerificationFingerprints = React.useMemo(() => ({
    openai: buildByokVerificationFingerprint('openai', { openai: openaiKey }),
    anthropic: buildByokVerificationFingerprint('anthropic', { anthropic: anthropicKey }),
    gemini: buildByokVerificationFingerprint('gemini', { geminiApiKey }),
    ollama: buildByokVerificationFingerprint('ollama', { ollamaBaseUrl, ollamaDefaultModel }),
  }), [anthropicKey, geminiApiKey, ollamaBaseUrl, ollamaDefaultModel, openaiKey])

  const refreshGithubChecks = React.useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent === true
    setGithubStatusChecking(true)
    try {
      const response = await fetch('/api/integrations/github-status')
      const data = response.ok ? await response.json() : null
      setGithubChecks(Array.isArray(data?.checks) ? data.checks : [])
      setGithubMode(data?.mode === 'token' || data?.mode === 'gh' ? data.mode : 'none')
      if (!silent) {
        if (data?.ready) {
          showSuccess('GitHub readiness looks good')
        } else {
          showInfo('GitHub readiness checked')
        }
      }
    } catch {
      setGithubChecks([])
      setGithubMode('none')
      if (!silent) {
        showWarning('Could not refresh GitHub readiness')
      }
    } finally {
      setGithubStatusChecking(false)
    }
  }, [showInfo, showSuccess, showWarning])

  useEffect(() => {
    refreshLocalState()
    setHydrated(true)
  }, [refreshLocalState])

  useEffect(() => {
    if (!hydrated) return
    const stored = readStoredByokKeys()
    const verifiedProviders = stored.verifiedProviders || {}
    setValidation((current) => {
      const next = { ...current }
      ;(['openai', 'anthropic', 'gemini', 'ollama'] as const).forEach((provider) => {
        const fingerprint = currentVerificationFingerprints[provider]
        const matches = !!fingerprint && verifiedProviders[provider] === fingerprint
        if (matches && next[provider].status === 'idle') {
          next[provider] = { status: 'valid', message: 'Previously verified' }
        } else if (!matches && next[provider].status === 'valid' && next[provider].message === 'Previously verified') {
          next[provider] = { status: 'idle', message: '' }
        }
      })
      return next
    })
  }, [currentVerificationFingerprints, hydrated])

  useEffect(() => {
    const handleVaultUpdated = () => refreshLocalState()
    window.addEventListener(BROWSER_VAULT_UPDATED_EVENT, handleVaultUpdated)
    window.addEventListener('integrations-saved', handleVaultUpdated)
    return () => {
      window.removeEventListener(BROWSER_VAULT_UPDATED_EVENT, handleVaultUpdated)
      window.removeEventListener('integrations-saved', handleVaultUpdated)
    }
  }, [refreshLocalState])

  useEffect(() => {
    const handleOpen = (event: Event) => {
      const detail = (event as CustomEvent<{ step?: Step; focus?: string }>).detail || {}
      setOpen(true)
      setStep(detail.step || initialStep)
      if (detail.focus === 'preferred-model') {
        setHighlightPreferredModel(true)
        window.setTimeout(() => preferredModelRef.current?.focus(), 50)
        window.setTimeout(() => setHighlightPreferredModel(false), 2500)
      }
    }
    window.addEventListener(openEventName, handleOpen as EventListener)
    if (initialStep === 'models' && openEventName !== 'open-workspaces-integrations') {
      window.addEventListener('open-workspaces-integrations', handleOpen as EventListener)
    }
    return () => {
      window.removeEventListener(openEventName, handleOpen as EventListener)
      if (initialStep === 'models' && openEventName !== 'open-workspaces-integrations') {
        window.removeEventListener('open-workspaces-integrations', handleOpen as EventListener)
      }
    }
  }, [initialStep, openEventName])

  useEffect(() => {
    const handleClose = () => {
      setOpen(false)
      setStep(initialStep)
    }
    window.addEventListener(CLOSE_INTEGRATIONS_WIZARDS_EVENT, handleClose)
    return () => window.removeEventListener(CLOSE_INTEGRATIONS_WIZARDS_EVENT, handleClose)
  }, [initialStep])

  useEffect(() => {
    if (!hydrated) return
    fetch('/api/integrations/config')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const workspaceConfig = (data?.config || {}) as WorkspaceIntegrationConfig
        setServerPartnerSecretPresence(typeof data?.secretPresence === 'object' && data.secretPresence ? data.secretPresence : {})
        setPreferredModel((current) => current || workspaceConfig.preferredModel || '')
        setOllamaBaseUrl((current) => {
          const nextDefault = workspaceConfig.ollamaBaseUrl || defaultOllamaBaseUrl
          const isCustomCurrent = !!current && current !== defaultOllamaBaseUrl
          return isCustomCurrent ? current : nextDefault
        })
        setOllamaDefaultModel((current) => current || workspaceConfig.ollamaDefaultModel || '')
        setPartnerValues((current) => mergePartnerMaps(current, {
          ...Object.fromEntries(
            Object.entries(workspaceConfig.partners || {}).map(([slug, values]) => [slug, normalizePartnerValues(values)])
          ),
          senso: {
            ...(current.senso || {}),
            ...(workspaceConfig.sensoContextLabel ? { contextLabel: workspaceConfig.sensoContextLabel } : {}),
          },
          opik: {
            ...(current.opik || {}),
            ...(workspaceConfig.opikWorkspace ? { workspace: workspaceConfig.opikWorkspace } : {}),
            ...(workspaceConfig.opikProject ? { project: workspaceConfig.opikProject } : {}),
          },
          github: {
            ...(current.github || {}),
            ...(workspaceConfig.githubDefaultRepo ? { defaultRepo: workspaceConfig.githubDefaultRepo } : {}),
          },
        }))
        if (Array.isArray(workspaceConfig.enabledPartners) && workspaceConfig.enabledPartners.length > 0) {
          setSelectedPartners((current) => current.length > 0 ? current : workspaceConfig.enabledPartners!)
        }
      })
      .catch(() => {})
  }, [hydrated])

  const hasStoredKeys = !!(openaiKey || anthropicKey || geminiApiKey)
  const hasDefaultUserKeys = !!(config?.userKeyDefaults?.openai || config?.userKeyDefaults?.anthropic || (config as any)?.userKeyDefaults?.gemini)
  const hasSystemProviderKeys = !!(config?.systemKeyDefaults?.openai || config?.systemKeyDefaults?.anthropic || (config as any)?.systemKeyDefaults?.gemini)
  const hasOpenAiAvailable = !!(openaiKey || config?.userKeyDefaults?.openai || config?.systemKeyDefaults?.openai)
  const hasAnthropicAvailable = !!(anthropicKey || config?.userKeyDefaults?.anthropic || config?.systemKeyDefaults?.anthropic)
  const hasGeminiAvailable = !!(geminiApiKey || (config as any)?.userKeyDefaults?.gemini || (config as any)?.systemKeyDefaults?.gemini)
  const normalizedOllamaBaseUrl = ollamaBaseUrl.trim()
  const ollamaConfigured = ollamaEnabled && (!!ollamaDefaultModel.trim() || (normalizedOllamaBaseUrl !== '' && normalizedOllamaBaseUrl !== defaultOllamaBaseUrl))
  const hasSharedExecutionPath = hasDefaultUserKeys || hasSystemProviderKeys || !!preferredModel.trim()

  const getPartnerSecret = React.useCallback((slug: string, key: string) => partnerSecrets[slug]?.[key] || '', [partnerSecrets])
  const getPartnerValue = React.useCallback((slug: string, key: string) => partnerValues[slug]?.[key] || '', [partnerValues])

  const setPartnerField = React.useCallback((slug: string, key: string, value: string, secret?: boolean) => {
    if (secret) {
      setPartnerSecrets((current) => ({
        ...current,
        [slug]: {
          ...(current[slug] || {}),
          [key]: value,
        },
      }))
      return
    }
    setPartnerValues((current) => ({
      ...current,
      [slug]: {
        ...(current[slug] || {}),
        [key]: value,
      },
    }))
  }, [])

  const isServerStoredField = React.useCallback(
    (field: PartnerFieldDefinition) => field.secret && field.storage === 'server',
    []
  )

  const hasServerPartnerSecret = React.useCallback(
    (slug: string, key: string) => !!serverPartnerSecretPresence[slug]?.[key],
    [serverPartnerSecretPresence]
  )

  const visiblePartnerDefinitions = useMemo(
    () => {
      const visibleSlugs = integrationStatus?.visiblePartners?.length ? integrationStatus.visiblePartners : DEFAULT_VISIBLE_PARTNERS
      const visibleSet = new Set(visibleSlugs)
      return sortPartnerDefinitions((integrationStatus?.partnerDefinitions || []).filter((partner) => visibleSet.has(partner.slug)))
    },
    [integrationStatus]
  )
  const visiblePartnerSlugs = useMemo(
    () => (integrationStatus?.visiblePartners?.length ? integrationStatus.visiblePartners : DEFAULT_VISIBLE_PARTNERS),
    [integrationStatus]
  )

  useEffect(() => {
    if (!visiblePartnerSlugs.length) return
    setSelectedPartners((current) => {
      if (current.length > 0) return current
      return visiblePartnerSlugs
    })
  }, [visiblePartnerSlugs])

  const selectedPartnerDefinitions = useMemo(
    () => sortPartnerDefinitions(visiblePartnerDefinitions.filter((partner) => selectedPartners.includes(partner.slug))),
    [selectedPartners, visiblePartnerDefinitions]
  )

  const stepOrder = useMemo<Step[]>(
    () => ['models', 'partners', ...selectedPartnerDefinitions.map((partner) => `partner:${partner.slug}` as const)],
    [selectedPartnerDefinitions]
  )

  useEffect(() => {
    if (!stepOrder.includes(step)) {
      setStep('models')
    }
  }, [step, stepOrder])

  useEffect(() => {
    if (!ollamaEnabled && modelTab === 'ollama') {
      setModelTab('openai')
    }
  }, [modelTab, ollamaEnabled])

  const githubReady = githubChecks.length > 0 && githubChecks.every((check) => check.status === 'pass')
  const sensoConfigured = !!getPartnerSecret('senso', 'apiKey').trim()
  const opikApiKey = getPartnerSecret('opik', 'apiKey')
  const opikWorkspace = getPartnerValue('opik', 'workspace')
  const opikProject = getPartnerValue('opik', 'project')
  const githubDefaultRepo = getPartnerValue('github', 'defaultRepo')
  const sensoContextLabel = getPartnerValue('senso', 'contextLabel')
  const opikConfigured = !!opikApiKey.trim()
  const githubAuthTranscript = githubAuthLogs.join('')
  const githubDeviceCode = useMemo(() => {
    const match = githubAuthTranscript.match(/one-time code:\s*([A-Z0-9-]+)/i)
    return match?.[1] || ''
  }, [githubAuthTranscript])
  const githubDeviceUrl = useMemo(() => {
    const match = githubAuthTranscript.match(/https:\/\/github\.com\/login\/device[^\s]*/i)
    return match?.[0] || ''
  }, [githubAuthTranscript])

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

    const resolveState = (provider: ProviderKey): 'missing' | 'configured' | 'verified' => {
      const entry = validation[provider]
      if (entry?.status === 'valid') return 'verified'
      return resolveSource(provider) === 'not configured' ? 'missing' : 'configured'
    }

    const checks = [
      { id: 'openai', label: 'OpenAI', state: resolveState('openai'), source: resolveSource('openai') },
      { id: 'gemini', label: 'Gemini', state: resolveState('gemini'), source: resolveSource('gemini') },
      { id: 'anthropic', label: 'Anthropic', state: resolveState('anthropic'), source: resolveSource('anthropic') },
    ]

    if (ollamaEnabled && ollamaDefaultModel.trim()) {
      checks.push({
        id: 'ollama',
        label: 'Ollama',
        state: validation.ollama?.status === 'valid' ? 'verified' : 'configured',
        source: `local runtime · ${ollamaDefaultModel.trim()}`,
      })
    }

    return checks
  }, [
    anthropicKey,
    config?.systemKeyDefaults?.anthropic,
    config?.systemKeyDefaults?.openai,
    config?.userKeyDefaults?.anthropic,
    config?.userKeyDefaults?.openai,
    geminiApiKey,
    hasAnthropicAvailable,
    hasGeminiAvailable,
    hasOpenAiAvailable,
    ollamaDefaultModel,
    ollamaEnabled,
    openaiKey,
    validation,
  ])

  useEffect(() => {
    if (!hydrated) return
    if (!user && !config?.authDisabled) return
    if (suppressAutoOpen) return
    if (onboardingOpen) return
    if (hasDefaultUserKeys || hasStoredKeys || dismissed) return
    setOpen(true)
  }, [config?.authDisabled, dismissed, hasDefaultUserKeys, hasStoredKeys, hydrated, onboardingOpen, suppressAutoOpen, user])

  useEffect(() => {
    const openWizard = () => {
      setDismissed(false)
      setOpen(true)
    }
    window.addEventListener('open-byok-wizard', openWizard)
    return () => window.removeEventListener('open-byok-wizard', openWizard)
  }, [])

  useEffect(() => {
    const handleOnboardingVisibility = (event: Event) => {
      const detail = (event as CustomEvent<{ open?: boolean }>).detail || {}
      setOnboardingOpen(!!detail.open)
    }
    window.addEventListener('clawmax-onboarding-visibility', handleOnboardingVisibility as EventListener)
    return () => window.removeEventListener('clawmax-onboarding-visibility', handleOnboardingVisibility as EventListener)
  }, [])

  useEffect(() => {
    if (!open) return
    fetch('/api/integrations/status')
      .then(async (r) => {
        const contentType = r.headers.get('content-type') || ''
        if (!contentType.includes('application/json')) {
          setIntegrationStatus({
            validationAvailable: false,
            validationMode: 'fallback',
            providers: [],
            notes: ['Live validation is unavailable on the current server build.'],
            visiblePartners: [...DEFAULT_VISIBLE_PARTNERS],
            partnerDefinitions: getDefaultPartnerDefinitions(),
          })
          return null
        }
        return r.json()
      })
      .then((data) => {
        if (!data) return
        const nextStatus = {
          validationAvailable: !!data.validationAvailable,
          validationMode: data.validationMode === 'live' ? 'live' : 'fallback',
          providers: Array.isArray(data.providers) ? data.providers : [],
          notes: Array.isArray(data.notes) ? data.notes : [],
          visiblePartners: Array.isArray(data.visiblePartners) ? data.visiblePartners : [],
          partnerDefinitions: Array.isArray(data.partnerDefinitions) ? data.partnerDefinitions : [],
        }
        setIntegrationStatus(nextStatus)
        const shared = { ...readSharedSecrets('global'), ...readSharedSecrets('workspace') }
        const partnerDefs = Array.isArray(nextStatus.partnerDefinitions) ? nextStatus.partnerDefinitions : []
        setPartnerSecrets((current) => {
          const next = { ...current }
          for (const partner of partnerDefs) {
            const mapped = readPartnerValuesFromSharedSecrets(
              partner.slug,
              partner.fields?.filter((field) => field.secret && field.storage !== 'server'),
              shared
            )
            if (Object.keys(mapped).length > 0) {
              next[partner.slug] = { ...(next[partner.slug] || {}), ...mapped }
            }
          }
          return next
        })
        setPartnerValues((current) => {
          const next = { ...current }
          for (const partner of partnerDefs) {
            const mapped = readPartnerValuesFromSharedSecrets(partner.slug, partner.fields?.filter((field) => !field.secret), shared)
            if (Object.keys(mapped).length > 0) {
              next[partner.slug] = { ...(next[partner.slug] || {}), ...mapped }
            }
          }
          return next
        })
      })
      .catch(() => setIntegrationStatus({
        validationAvailable: false,
        validationMode: 'fallback',
        providers: [],
        notes: ['Live validation is unavailable on the current server build.'],
        visiblePartners: [...DEFAULT_VISIBLE_PARTNERS],
        partnerDefinitions: getDefaultPartnerDefinitions(),
      }))

    void refreshGithubChecks({ silent: true })
  }, [open, refreshGithubChecks])

  const loadOllamaModels = React.useCallback(async (forceRefresh: boolean = false) => {
    if (!ollamaEnabled) {
      setOllamaModels([])
      return
    }
    const baseUrl = ollamaBaseUrl.trim()
    if (!baseUrl) {
      setOllamaModels([])
      return
    }

    setOllamaModelsLoading(true)
    try {
      const res = await fetch(
        forceRefresh
          ? '/api/agents/models/refresh'
          : `/api/agents/models?${new URLSearchParams({ ollamaBaseUrl: baseUrl }).toString()}`,
        forceRefresh
          ? {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ollamaBaseUrl: baseUrl }),
            }
          : undefined
      )
      const data = res.ok ? await res.json() : null
      const providerModels = data?.modelsByProvider?.ollama?.models
      const models = Array.isArray(providerModels)
        ? providerModels.map((name: string) => name.replace(/^ollama\//, ''))
        : []
      setOllamaModels(models)
    } catch {
      setOllamaModels([])
    } finally {
      setOllamaModelsLoading(false)
    }
  }, [ollamaBaseUrl, ollamaEnabled])

  const loadAvailableModels = React.useCallback(async (forceRefresh: boolean = false) => {
    const payload = {
      openai: openaiKey.trim(),
      anthropic: anthropicKey.trim(),
      gemini: geminiApiKey.trim(),
      ollamaBaseUrl: ollamaEnabled ? ollamaBaseUrl.trim() : '',
    }

    try {
      const res = await fetch(
        forceRefresh ? '/api/agents/models/refresh' : '/api/agents/models',
        forceRefresh
          ? {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            }
          : undefined
      )
      const data = res.ok ? await res.json() : null
      setModelsByProvider(data?.modelsByProvider || {})
    } catch {
      setModelsByProvider({})
    }
  }, [openaiKey, anthropicKey, geminiApiKey, ollamaBaseUrl])

  useEffect(() => {
    if (!open || step !== 'models') return
    void loadOllamaModels(false)
    void loadAvailableModels(false)
  }, [open, step, loadAvailableModels, loadOllamaModels])

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

  const browserLocalKeysNotice = useMemo(() => {
    if (hasStoredKeys) return null
    if (hasSharedExecutionPath) {
      return 'This browser does not have saved local keys yet. Shared/runtime execution may still work, but if you previously configured keys in another browser or on another machine, add them again here to use this browser for BYOK-powered flows.'
    }
    return 'This browser does not have saved local keys yet. If you previously configured keys in another browser or on another machine, add them again here before running agents, templates, or AI-assisted flows from this browser.'
  }, [hasSharedExecutionPath, hasStoredKeys])

  const triggerReady =
    initialStep === 'partners'
      ? selectedPartnerDefinitions.some((partner) => {
          const hasSecret = (partner.fields || []).some((field) =>
            field.secret && (!!getPartnerSecret(partner.slug, field.key).trim() || hasServerPartnerSecret(partner.slug, field.key))
          )
          const hasValue = (partner.fields || []).some((field) => !field.secret && !!getPartnerValue(partner.slug, field.key).trim())
          if (partner.slug === 'github') return githubReady || !!githubDefaultRepo.trim()
          if (partner.slug === 'senso') return sensoConfigured || !!sensoContextLabel.trim()
          if (partner.slug === 'opik') return opikConfigured || !!opikWorkspace.trim() || !!opikProject.trim()
          return hasSecret || hasValue
        })
      : hasOpenAiAvailable || hasAnthropicAvailable || hasGeminiAvailable || (ollamaEnabled && ollamaConfigured)

  const monitoringStatusText = useMemo(() => {
    if (opikApiKey) {
      const parts = [`Opik ${maskKey(opikApiKey)}`]
      if (opikWorkspace) parts.push(`workspace: ${opikWorkspace}`)
      if (opikProject) parts.push(`project: ${opikProject}`)
      parts.push('browser defaults only')
      parts.push('runtime OPIK_* env still required for tracing and budget data')
      return parts.join(' · ')
    }
    return 'Not configured — browser defaults are empty, and runtime tracing/budget data stay off until OPIK_* env is configured on the dashboard runtime'
  }, [opikApiKey, opikProject, opikWorkspace])

  const ollamaStatusText = useMemo(() => {
    if (!ollamaConfigured) return 'Not configured — local open-source models are optional and unavailable until Ollama is running'
    return `Base URL: ${ollamaBaseUrl}${ollamaDefaultModel ? ` · default: ${ollamaDefaultModel}` : ''}`
  }, [ollamaBaseUrl, ollamaConfigured, ollamaDefaultModel])

  if (!hydrated) return null
  if (!user && !config?.authDisabled) return null

  const runValidation = async (scope: ScopedValidationTarget = 'all') => {
    const currentPartnerSlug = step.startsWith('partner:') ? step.replace('partner:', '') : null
    const providerScope = scope === 'openai' || scope === 'anthropic' || scope === 'gemini' || scope === 'ollama' ? scope : null
    const scopedPayload = {
      openai: scope === 'all' || providerScope === 'openai' ? openaiKey.trim() : '',
      anthropic: scope === 'all' || providerScope === 'anthropic' ? anthropicKey.trim() : '',
      gemini: scope === 'all' || providerScope === 'gemini' ? geminiApiKey.trim() : '',
      ollamaBaseUrl: (scope === 'all' || providerScope === 'ollama') && ollamaEnabled ? ollamaBaseUrl.trim() : '',
      ollamaDefaultModel: (scope === 'all' || providerScope === 'ollama') && ollamaEnabled ? ollamaDefaultModel.trim() : '',
      opikApiKey: scope === 'all' || currentPartnerSlug === 'opik' ? opikApiKey.trim() : '',
      opikWorkspace: scope === 'all' || currentPartnerSlug === 'opik' ? opikWorkspace.trim() : '',
      opikProject: scope === 'all' || currentPartnerSlug === 'opik' ? opikProject.trim() : '',
      sensoApiKey: scope === 'all' || currentPartnerSlug === 'senso' ? getPartnerSecret('senso', 'apiKey').trim() : '',
    }
    if (providerScope === 'openai' && !scopedPayload.openai) {
      setValidation((current) => ({ ...current, openai: { status: 'invalid', message: 'No OpenAI key provided' } }))
      showWarning('No OpenAI key provided')
      return false
    }
    if (providerScope === 'anthropic' && !scopedPayload.anthropic) {
      setValidation((current) => ({ ...current, anthropic: { status: 'invalid', message: 'No Anthropic key provided' } }))
      showWarning('No Anthropic key provided')
      return false
    }
    if (providerScope === 'gemini' && !scopedPayload.gemini) {
      setValidation((current) => ({ ...current, gemini: { status: 'invalid', message: 'No Gemini key provided' } }))
      showWarning('No Gemini key provided')
      return false
    }
    const localProviderMismatches = [
      scopedPayload.openai ? detectProviderKeyMismatch('openai', scopedPayload.openai) : null,
      scopedPayload.anthropic ? detectProviderKeyMismatch('anthropic', scopedPayload.anthropic) : null,
      scopedPayload.gemini ? detectProviderKeyMismatch('gemini', scopedPayload.gemini) : null,
    ].filter(Boolean)
    if (localProviderMismatches.length > 0) {
      const mismatchEntries = localProviderMismatches.map((mismatch) => [
        mismatch!.provider,
        { status: 'invalid', message: mismatch!.message } as ValidationEntry,
      ])
      setValidation((current) => ({
        ...current,
        ...Object.fromEntries(mismatchEntries),
      }))
      showWarning(localProviderMismatches[0]!.message)
      return false
    }

    setValidating(true)
    try {
      const res = await fetch('/api/integrations/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(scopedPayload),
      })
      const contentType = res.headers.get('content-type') || ''
      if (!contentType.includes('application/json')) {
        setValidation({
          openai: { status: 'skipped', message: 'Validation unavailable from the current server build' },
          anthropic: { status: 'skipped', message: 'Validation unavailable from the current server build' },
          gemini: { status: 'skipped', message: 'Validation unavailable from the current server build' },
          ollama: { status: 'skipped', message: 'Validation unavailable from the current server build' },
          opik: { status: 'skipped', message: 'Validation unavailable from the current server build' },
          senso: { status: 'skipped', message: 'Validation unavailable from the current server build' },
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
        ollama: ollamaEnabled
          ? { status: data.ollama?.status || 'idle', message: data.ollama?.message || '' }
          : { status: 'skipped', message: 'Ollama is disabled in this runtime' },
        opik: { status: data.opik?.status || 'idle', message: data.opik?.message || '' },
        senso: { status: data.senso?.status || 'idle', message: data.senso?.message || '' },
      }
      setValidation(nextState)
      updateStoredVerification((current) => {
        const next = { ...current }
        ;(['openai', 'anthropic', 'gemini', 'ollama'] as const).forEach((provider) => {
          if (nextState[provider].status === 'valid') next[provider] = currentVerificationFingerprints[provider]
          else if (providerScope === provider || (!providerScope && scope !== 'current-partner')) delete next[provider]
        })
        return next
      })
      if (nextState.ollama.status === 'valid') void loadOllamaModels(true)
      void loadAvailableModels(true)
      const scopedFailureKeys = providerScope
        ? new Set([providerScope])
        : scope === 'current-partner' && currentPartnerSlug
        ? new Set([currentPartnerSlug])
        : null
      const failures = Object.entries(nextState).filter(([key, entry]) => {
        if (scopedFailureKeys && !scopedFailureKeys.has(key)) return false
        return entry.status === 'invalid' || entry.status === 'error'
      })
      if (failures.length > 0) {
        const [firstFailedKey, firstFailedEntry] = failures[0]
        const failedLabels = failures.map(([key]) => labelsForSlug(key)).join(', ')
        showWarning(
          failures.length === 1
            ? `${labelsForSlug(firstFailedKey)} check failed: ${firstFailedEntry.message}`
            : `Some integration checks failed: ${failedLabels}. Review the messages below before saving.`
        )
        return false
      }
      showSuccess(
        providerScope
          ? `${labelsForSlug(providerScope)} check completed`
          : scope === 'current-partner' && currentPartnerSlug
            ? `${labelsForSlug(currentPartnerSlug)} check completed`
            : 'Integration checks completed'
      )
      return true
    } catch (err: any) {
      showWarning(err.message || 'Failed to validate integrations')
      return false
    } finally {
      setValidating(false)
    }
  }

  const labelsForSlug = (slug: string) => {
    const labels: Record<string, string> = {
      openai: 'OpenAI',
      anthropic: 'Anthropic',
      gemini: 'Gemini',
      ollama: 'Ollama',
      opik: 'Opik',
      senso: 'Senso',
    }
    return labels[slug] || slug
  }

  const clearProviderKey = (provider: 'openai' | 'anthropic' | 'gemini' | 'ollama') => {
    if (provider === 'openai') {
      setOpenaiKey('')
      setValidation((current) => ({ ...current, openai: { status: 'idle', message: '' } }))
      updateStoredVerification((current) => { const next = { ...current }; delete next.openai; return next })
      return
    }
    if (provider === 'anthropic') {
      setAnthropicKey('')
      setValidation((current) => ({ ...current, anthropic: { status: 'idle', message: '' } }))
      updateStoredVerification((current) => { const next = { ...current }; delete next.anthropic; return next })
      return
    }
    if (provider === 'gemini') {
      setGeminiApiKey('')
      setValidation((current) => ({ ...current, gemini: { status: 'idle', message: '' } }))
      updateStoredVerification((current) => { const next = { ...current }; delete next.gemini; return next })
      return
    }
    setOllamaBaseUrl(defaultOllamaBaseUrl)
    setOllamaDefaultModel('')
    setValidation((current) => ({ ...current, ollama: { status: 'idle', message: '' } }))
    updateStoredVerification((current) => { const next = { ...current }; delete next.ollama; return next })
  }

  const handleSave = async () => {
    const providerMismatches = [
      detectProviderKeyMismatch('openai', openaiKey),
      detectProviderKeyMismatch('anthropic', anthropicKey),
      detectProviderKeyMismatch('gemini', geminiApiKey),
    ].filter(Boolean)
    if (providerMismatches.length > 0) {
      showWarning(providerMismatches[0]!.message)
      return
    }

    const shouldValidate = !!(
      openaiKey.trim()
      || anthropicKey.trim()
      || geminiApiKey.trim()
      || opikApiKey.trim()
      || (ollamaEnabled && ollamaConfigured)
      || getPartnerSecret('senso', 'apiKey').trim()
    )
    if (shouldValidate) {
      const ok = await runValidation()
      if (!ok) return
    }
    if (!openaiKey.trim() && !anthropicKey.trim() && !geminiApiKey.trim() && !config?.userKeyDefaults?.openai && !config?.userKeyDefaults?.anthropic && !(config as any)?.userKeyDefaults?.gemini && !config?.systemKeyDefaults?.openai && !config?.systemKeyDefaults?.anthropic && !(config as any)?.systemKeyDefaults?.gemini) {
      showWarning('No LLM keys detected yet. Add OpenAI, Anthropic, or Gemini, or rely on configured defaults before running agents.')
    }

    const persistedPartnerValues = buildPartnerConfig(partnerValues)
    const persistedPartnerSecrets = buildPartnerConfig(partnerSecrets)
    const browserPartnerSecrets = Object.fromEntries(
      Object.entries(persistedPartnerSecrets).map(([slug, values]) => {
        const partner = visiblePartnerDefinitions.find((item) => item.slug === slug)
        const browserSecretKeys = new Set(
          (partner?.fields || [])
            .filter((field) => field.secret && field.storage !== 'server')
            .map((field) => field.key)
        )
        return [slug, Object.fromEntries(Object.entries(values).filter(([key]) => browserSecretKeys.has(key)))]
      }).filter(([, values]) => Object.keys(values).length > 0)
    )
    const serverPartnerSecrets = {
      github: {
        token: persistedPartnerSecrets.github?.token || '',
      },
    }
    const providerKeyValues = {
      openai: openaiKey.trim(),
      anthropic: anthropicKey.trim(),
      gemini: geminiApiKey.trim(),
      ollamaBaseUrl: ollamaBaseUrl.trim(),
    }
    const currentStoredKeys = readStoredByokKeys()

    writeStoredByokKeys({
      openai: providerKeyValues.openai,
      anthropic: providerKeyValues.anthropic,
      geminiApiKey: providerKeyValues.gemini,
      ollamaBaseUrl: providerKeyValues.ollamaBaseUrl,
      ollamaDefaultModel: ollamaEnabled ? ollamaDefaultModel.trim() : '',
      verifiedProviders: currentStoredKeys.verifiedProviders || {},
      sensoApiKey: getPartnerSecret('senso', 'apiKey').trim(),
      sensoContextLabel: sensoContextLabel.trim(),
      opikApiKey: opikApiKey.trim(),
      opikWorkspace: opikWorkspace.trim(),
      opikProject: opikProject.trim(),
      githubDefaultRepo: githubDefaultRepo.trim(),
      preferredModel: preferredModel || undefined,
      partnerSecrets: browserPartnerSecrets,
      partnerValues: persistedPartnerValues,
    })

    writeSharedSecrets(
      mergeProviderKeysIntoSharedSecrets(readSharedSecrets('global'), providerKeyValues),
      { scope: 'global' }
    )

    const currentSharedSecrets = readSharedSecrets('global')
    const nextSharedSecrets = visiblePartnerDefinitions.reduce((acc, partner) => {
      const combinedValues = {
        ...(partnerValues[partner.slug] || {}),
        ...(partnerSecrets[partner.slug] || {}),
      }
      return writePartnerValuesToSharedSecrets(
        partner.slug,
        (partner.fields || []).filter((field) => field.storage !== 'server'),
        acc,
        combinedValues
      )
    }, currentSharedSecrets)
    writeSharedSecrets(nextSharedSecrets, { scope: 'global' })

    await fetch('/api/integrations/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        preferredModel: preferredModel || undefined,
        githubDefaultRepo: githubDefaultRepo.trim() || undefined,
        sensoContextLabel: sensoContextLabel.trim() || undefined,
        ollamaBaseUrl: ollamaEnabled ? (ollamaBaseUrl.trim() || undefined) : undefined,
        ollamaDefaultModel: ollamaEnabled ? (ollamaDefaultModel.trim() || undefined) : undefined,
        opikWorkspace: opikWorkspace.trim() || undefined,
        opikProject: opikProject.trim() || undefined,
        enabledPartners: selectedPartners,
        partners: persistedPartnerValues,
        partnerSecrets: serverPartnerSecrets,
      }),
    })
      .then(async (response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (typeof data?.secretPresence === 'object' && data.secretPresence) {
          setServerPartnerSecretPresence(data.secretPresence)
        }
      })
      .catch(() => {})

    localStorage.removeItem(getByokDismissKey())
    setDismissed(false)
    setOpen(false)
    setStep(initialStep)
    window.dispatchEvent(new CustomEvent(CLOSE_INTEGRATIONS_WIZARDS_EVENT))
    window.dispatchEvent(new CustomEvent('integrations-saved'))
    showSuccess('Workspace integrations saved. Provider secrets stay local; workspace defaults now persist for this workspace.')
  }

  const handleSkip = () => {
    localStorage.setItem(getByokDismissKey(), 'true')
    setDismissed(true)
    setOpen(false)
    setStep(initialStep)
    window.dispatchEvent(new CustomEvent(CLOSE_INTEGRATIONS_WIZARDS_EVENT))
    showInfo('Workspace integrations skipped for now')
  }

  const handleReopen = () => {
    setStep(initialStep)
    setOpen(true)
  }

  const handleCopyOpikEnv = async () => {
    const snippet = [
      `OPIK_API_KEY=${opikApiKey.trim() || '<your-opik-api-key>'}`,
      `OPIK_WORKSPACE=${opikWorkspace.trim() || '<your-opik-workspace>'}`,
      `OPIK_PROJECT_NAME=${opikProject.trim() || '<your-opik-project>'}`,
    ].join('\n')

    try {
      await navigator.clipboard.writeText(snippet)
      showSuccess('Copied OPIK_* env snippet. Add it to the dashboard runtime env and restart to enable Opik tracing and budget data.')
    } catch {
      showWarning('Could not copy automatically. Copy the generated OPIK_* values into the dashboard runtime env; browser-only values are not enough.')
    }
  }

  const runGitHubAuth = async (mode: 'login' | 'refresh-repo-scope') => {
    setGithubAuthLogs([])
    setGithubAuthError(null)
    setGithubAuthDone(false)
    setGithubAuthRunning(true)

    try {
      const resp = await fetch('/api/integrations/github-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      })

      if (!resp.ok || !resp.body) {
        setGithubAuthError('Failed to start GitHub auth flow')
        setGithubAuthRunning(false)
        return
      }

      const reader = resp.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const msg = JSON.parse(line.slice(6)) as { type: string; data: string }
            if (msg.type === 'log' || msg.type === 'start') {
              setGithubAuthLogs((current) => [...current, msg.data])
            } else if (msg.type === 'status') {
              const parsed = JSON.parse(msg.data)
              setGithubChecks(Array.isArray(parsed?.checks) ? parsed.checks : [])
              setGithubMode(parsed?.mode === 'token' || parsed?.mode === 'gh' ? parsed.mode : 'none')
            } else if (msg.type === 'done') {
              setGithubAuthLogs((current) => [...current, msg.data])
              setGithubAuthDone(true)
              setGithubAuthRunning(false)
            } else if (msg.type === 'error') {
              setGithubAuthError(msg.data)
              setGithubAuthRunning(false)
            }
          } catch {}
        }
      }
    } catch (err: any) {
      setGithubAuthError(err?.message || 'GitHub auth failed')
    } finally {
      setGithubAuthRunning(false)
      void refreshGithubChecks()
    }
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

  const renderPartnerValidation = (partner: PartnerDefinition) => {
    const resultKey = (partner.validation?.resultKey || partner.slug) as keyof ValidationState
    return renderValidation(resultKey)
  }

  const discoveredPreferredOptions = [
    ...((modelsByProvider.openai?.models || []).map((model) => ({ value: model, label: `${model.replace(/^openai\//, '')} (OpenAI)` }))),
    ...((modelsByProvider.gemini?.models || []).map((model) => ({ value: model, label: `${model.replace(/^gemini\//, '')} (Gemini)` }))),
    ...((modelsByProvider.anthropic?.models || []).map((model) => ({ value: model, label: `${model.replace(/^anthropic\//, '')} (Anthropic)` }))),
    ...((modelsByProvider.ollama?.models || []).map((model) => ({ value: model, label: `${model.replace(/^ollama\//, '')} (Ollama)` }))),
  ]
  const uniquePreferredOptions = discoveredPreferredOptions.filter((option, index, arr) =>
    arr.findIndex((candidate) => candidate.value === option.value) === index
  )

  const currentStepIndex = stepOrder.indexOf(step)
  const currentPartner = step.startsWith('partner:')
    ? visiblePartnerDefinitions.find((partner) => partner.slug === step.replace(/^partner:/, ''))
    : null

  const templateDefaultsSummary = [
    sensoContextLabel.trim() ? `Senso context → ${sensoContextLabel.trim()}` : null,
    githubDefaultRepo.trim() ? `GitHub repo → ${githubDefaultRepo.trim()}` : null,
  ].filter(Boolean)

  const copyText = async (value: string, successMessage: string, failureMessage: string) => {
    try {
      await navigator.clipboard.writeText(value)
      showSuccess(successMessage)
    } catch {
      showWarning(failureMessage)
    }
  }

  const goToNextStep = () => {
    if (step === 'partners' && selectedPartnerDefinitions.length === 0) {
      void handleSave()
      return
    }
    const nextStep = stepOrder[currentStepIndex + 1]
    if (nextStep) setStep(nextStep)
  }

  const goToPreviousStep = () => {
    const previousStep = stepOrder[currentStepIndex - 1]
    if (previousStep) setStep(previousStep)
  }

  const describePartnerStatus = (partner: PartnerDefinition) => {
    if (partner.slug === 'senso') {
      return sensoConfigured
        ? `Configured ${maskKey(getPartnerSecret('senso', 'apiKey'))}${sensoContextLabel ? ` · context: ${sensoContextLabel}` : ''}`
        : 'Not configured — workspace files remain the default shared context layer'
    }
    if (partner.slug === 'opik') return opikConfigured ? monitoringStatusText : 'Not configured — this UI can store Opik defaults, but runtime tracing and budget data still require dashboard OPIK_* env'
    if (partner.slug === 'github') {
      if (githubMode === 'token') {
        return githubReady
          ? 'GitHub token-based issue workflows look ready in this runtime.'
          : 'GitHub token mode is active, but a default repository is still needed for issue workflows.'
      }
      return githubReady ? 'GitHub CLI-based issue workflows look ready in this runtime.' : 'GitHub delivery workflows need auth in the current runtime.'
    }

    const secretFields = (partner.fields || []).filter((field) =>
      field.secret && (getPartnerSecret(partner.slug, field.key).trim() || hasServerPartnerSecret(partner.slug, field.key))
    )
    const plainFields = (partner.fields || []).filter((field) => !field.secret && getPartnerValue(partner.slug, field.key).trim())
    if (secretFields.length === 0 && plainFields.length === 0) return 'Not configured yet'
    const labels = [
      ...secretFields.map((field) => `${field.label}: ${getPartnerSecret(partner.slug, field.key).trim() ? maskKey(getPartnerSecret(partner.slug, field.key)) : 'configured on server'}`),
      ...plainFields.map((field) => `${field.label}: ${getPartnerValue(partner.slug, field.key)}`),
    ]
    return labels.join(' · ')
  }

  const renderPartnerHelp = (partner: PartnerDefinition) => {
    if (partner.slug === 'senso') {
      return (
        <>
          Use Senso to store evidence, recall prior work, and share context across agents. ClawMax still works without it using workspace files and native workflow handoffs.
        </>
      )
    }
    if (partner.slug === 'opik') {
      return (
        <>
          Store Opik workspace defaults here if you want them available during setup. This browser form does <span className="font-semibold">not</span> enable runtime monitoring, token/cost tracking, or budget visibility by itself. Those require server-side <span className="font-mono">OPIK_*</span> env vars on the dashboard runtime and a restart.
        </>
      )
    }
    if (partner.slug === 'github') {
      return (
        <>
          Use GitHub for issues, PRs, code review, and shared delivery workflows. Local and on-prem runtimes can use GitHub CLI auth. Hosted/cloud runtimes should prefer a runtime <span className="font-mono">GITHUB_TOKEN</span> or <span className="font-mono">GH_TOKEN</span> plus a default repository.
        </>
      )
    }
    return partner.description
  }

  const renderPartnerSkillsNote = (partner: PartnerDefinition) => {
    const openSkillFromPartner = (skillName: string) => {
      window.dispatchEvent(new CustomEvent('clawmax-open-skill-search', { detail: { skill: skillName } }))
      window.dispatchEvent(new CustomEvent('navigate-to-page', { detail: { page: 'skills' } }))
      setOpen(false)
    }
    if (!partner.skills) return null
    if (partner.skills.mode === 'shipables' && partner.skills.items?.length) {
      return (
        <div className="mt-2">
          <div className="text-xs opacity-80">Included skills:</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {partner.skills.items.map((item) => (
              <button
                key={`${partner.slug}-shipable-${item}`}
                type="button"
                onClick={() => openSkillFromPartner(item)}
                className="inline-flex items-center rounded-full border border-gray-200 dark:border-gray-700 px-2.5 py-1 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50"
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      )
    }
    if (partner.skills.mode === 'catalog' && partner.skills.items?.length) {
      return (
        <div className="mt-2">
          <div className="text-xs opacity-80">{partner.skills.label || 'Known skills'}:</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {partner.skills.items.map((item) => (
              <button
                key={`${partner.slug}-catalog-${item}`}
                type="button"
                onClick={() => openSkillFromPartner(item)}
                className="inline-flex items-center rounded-full border border-gray-200 dark:border-gray-700 px-2.5 py-1 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50"
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      )
    }
    if (partner.skills.mode === 'curated-installer') {
      const installing = partnerInstallState[partner.slug] === 'installing'
      return (
        <div className="mt-2 flex items-center gap-3">
          <div className="text-xs opacity-80">
            {partner.skills.label || 'Curated skill install available'}.
            <span className="ml-1">Usually takes 1-3 minutes.</span>
          </div>
          {installedPartnerSkillSlugs.has(partner.slug) ? (
            <span className="px-2.5 py-1 text-[11px] rounded-md border border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500">
              Installed
            </span>
          ) : (
            <button
              type="button"
              disabled={installing}
              onClick={async () => {
                if (!partner.skills?.commandId) return
                setPartnerInstallState((current) => ({ ...current, [partner.slug]: 'installing' }))
                try {
                  const res = await fetch('/api/skills/partner-install', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ commandId: partner.skills.commandId }),
                  })
                  const data = await res.json().catch(() => ({}))
                  if (!res.ok) throw new Error(data.detail || data.error || 'Failed to install partner skills')
                  showSuccess(`${partner.name} skills installed`)
                  setInstalledPartnerSkillSlugs((current) => new Set([...current, partner.slug]))
                } catch (err: any) {
                  showWarning(err.message || `Failed to install ${partner.name} skills`)
                } finally {
                  setPartnerInstallState((current) => ({ ...current, [partner.slug]: 'idle' }))
                }
              }}
              className="px-2.5 py-1 text-[11px] rounded-md border border-sky-300 dark:border-sky-700 text-sky-700 dark:text-sky-300 hover:bg-sky-50 dark:hover:bg-sky-900/20 transition-colors disabled:opacity-60"
            >
              {installing ? 'Installing…' : 'Install Skills'}
            </button>
          )}
        </div>
      )
    }
    if (partner.skills.mode === 'planned') {
      return <div className="mt-2 text-xs opacity-80">{partner.skills.label || 'Partner skills are planned.'}</div>
    }
    return null
  }

  const renderPartnerField = (partner: PartnerDefinition, field: PartnerFieldDefinition) => {
    const value = field.secret ? getPartnerSecret(partner.slug, field.key) : getPartnerValue(partner.slug, field.key)
    const serverStored = isServerStoredField(field)
    const configuredOnServer = serverStored && hasServerPartnerSecret(partner.slug, field.key)
    const placeholder =
      partner.slug === 'github' && field.key === 'defaultRepo' ? 'owner/repo'
      : partner.slug === 'github' && field.key === 'token' ? 'ghp_...'
      : partner.slug === 'senso' && field.key === 'contextLabel' ? 'e.g. Workspace / Team / Project'
      : partner.slug === 'opik' && field.key === 'workspace' ? 'e.g. my-team'
      : partner.slug === 'opik' && field.key === 'project' ? 'e.g. clawmax-agents'
      : field.label

    return (
      <div key={`${partner.slug}-${field.key}`}>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{field.label}</label>
        <input
          type={field.type === 'password' ? 'password' : 'text'}
          value={value}
          onChange={(e) => setPartnerField(partner.slug, field.key, e.target.value, field.secret)}
          placeholder={serverStored && configuredOnServer && !value ? `${placeholder} (leave blank to keep current token)` : placeholder}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
        />
        {serverStored && (
          <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {configuredOnServer
              ? 'A token is already configured on the server for this workspace. Leave this blank to keep it, or paste a new token to replace it.'
              : 'This secret is stored on the server for hosted execution, not in browser vault.'}
          </div>
        )}
      </div>
    )
  }

  return (
    <>
      <button
        onClick={handleReopen}
        className={`text-xs rounded-full border px-2.5 py-1 transition-colors ${
          triggerReady
            ? 'border-emerald-300/60 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300'
            : 'border-amber-300/60 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-300'
        }`}
        title={triggerTitle}
      >
        {triggerLabel}
      </button>

      {!open ? null : (
        <div className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-3xl rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-2xl p-5 max-h-[93vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">BYOK & Partner Integrations</div>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Provider secrets stay local to this browser. Workspace defaults persist per workspace for template apply and runtime follow-through.
                </p>
              </div>
              <button
                onClick={() => { setOpen(false); setStep(initialStep) }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {initialStep !== 'models' && (
              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                {initialStep !== 'partners' && (
                  <>
                    <button
                      type="button"
                      onClick={() => setStep('models')}
                      className={`px-2 py-1 rounded-full transition-colors ${step === 'models' ? 'bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 font-medium' : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600'}`}
                    >
                      1. Models
                    </button>
                    <span>→</span>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => setStep('partners')}
                  className={`px-2 py-1 rounded-full transition-colors ${step === 'partners' ? 'bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 font-medium' : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600'}`}
                >
                  {initialStep === 'partners' ? 'Partners' : '2. Partners'}
                </button>
                {selectedPartnerDefinitions.map((partner, index) => (
                  <React.Fragment key={partner.slug}>
                    <span>→</span>
                    <button
                      type="button"
                      onClick={() => setStep(`partner:${partner.slug}`)}
                      className={`px-2 py-1 rounded-full transition-colors ${step === `partner:${partner.slug}` ? 'bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 font-medium' : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600'}`}
                    >
                      {initialStep === 'partners' ? partner.name : `${index + 3}. ${partner.name}`}
                    </button>
                  </React.Fragment>
                ))}
              </div>
            )}

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
                  ? (ollamaEnabled ? 'This server can validate provider keys and local Ollama reachability right now.' : 'This server can validate hosted provider keys right now.')
                  : 'This server cannot validate integrations live right now. Local browser save still works, and template defaults still prefill.'}
              </div>
              {templateDefaultsSummary.length > 0 && (
                <div className="mt-2 text-xs opacity-90">
                  Template apply defaults: {templateDefaultsSummary.join(' · ')}
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
                    We support broad model choice, but results vary by provider and version. Start with recommended defaults. If a model performs especially well or poorly in ClawMax, please share feedback on GitHub.
                  </div>
                </div>

                <div className="mt-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-4 text-sm text-gray-600 dark:text-gray-300">
                  <div className="font-medium text-gray-900 dark:text-gray-100">Current configured LLM providers</div>
                  <div className="mt-1">{statusText}</div>
                  {browserLocalKeysNotice && (
                    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-100">
                      {browserLocalKeysNotice}
                    </div>
                  )}
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {providerChecks.map((provider) => (
                      <button
                        key={provider.id}
                        type="button"
                        onClick={() => setModelTab(provider.id as ModelTab)}
                        className={`rounded-lg border px-3 py-2 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500 ${
                          modelTab === provider.id
                            ? 'ring-2 ring-sky-400 dark:ring-sky-600 '
                            : ''
                        }${
                          provider.state === 'verified'
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-100'
                            : provider.state === 'configured'
                              ? 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-100'
                              : 'border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300'
                        }`}
                        aria-pressed={modelTab === provider.id}
                        title={`Switch to ${provider.label} settings`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-medium">{provider.label}</span>
                          <span className="text-xs uppercase tracking-wide opacity-80">
                            {provider.state === 'verified' ? 'verified' : provider.state === 'configured' ? 'configured' : 'missing'}
                          </span>
                        </div>
                        <div className="mt-1 text-xs opacity-80">Source: {provider.source}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-5 space-y-4">
                  <div className="flex flex-wrap gap-2">
                    {([
                      { id: 'openai', label: 'OpenAI', tone: 'Paid' },
                      { id: 'anthropic', label: 'Anthropic', tone: 'Paid' },
                      { id: 'gemini', label: 'Gemini', tone: 'Paid' },
                      { id: 'ollama', label: 'Ollama', tone: 'OSS' },
                    ] as Array<{ id: ModelTab; label: string; tone: string }>).filter((tab) => ollamaEnabled || tab.id !== 'ollama').map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setModelTab(tab.id)}
                        className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                          modelTab === tab.id
                            ? 'border-sky-500 bg-sky-100 text-sky-700 dark:border-sky-600 dark:bg-sky-900/30 dark:text-sky-300'
                            : 'border-gray-200 bg-white text-gray-600 hover:border-sky-300 hover:text-sky-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:border-sky-700 dark:hover:text-sky-300'
                        }`}
                      >
                        {tab.label} <span className="opacity-70">{tab.tone}</span>
                      </button>
                    ))}
                  </div>

                  {modelTab === 'openai' && (
                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900">
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-medium text-gray-900 dark:text-gray-100">OpenAI</div>
                        <button onClick={() => runValidation('openai')} disabled={validating} className="px-3 py-1.5 text-xs rounded-md border border-sky-300 dark:border-sky-700 text-sky-700 dark:text-sky-300 hover:bg-sky-50 dark:hover:bg-sky-900/20 transition-colors disabled:opacity-60">{validating ? 'Checking…' : 'Check Key'}</button>
                      </div>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Recommended for strong general-purpose results and broad model support.</p>
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <label htmlFor="byok-openai" className="block text-sm font-medium text-gray-700 dark:text-gray-300">API key</label>
                        {openaiKey && (
                          <button type="button" onClick={() => clearProviderKey('openai')} className="text-xs text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-300">
                            Clear
                          </button>
                        )}
                      </div>
                      <input id="byok-openai" type="password" value={openaiKey} onChange={(e) => { setOpenaiKey(e.target.value); setValidation((current) => ({ ...current, openai: { status: 'idle', message: '' } })); updateStoredVerification((current) => { const next = { ...current }; delete next.openai; return next }) }} placeholder="sk-..." className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-sky-500" />
                      {renderValidation('openai')}
                    </div>
                  )}

                  {modelTab === 'anthropic' && (
                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900">
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-medium text-gray-900 dark:text-gray-100">Anthropic</div>
                        <button onClick={() => runValidation('anthropic')} disabled={validating} className="px-3 py-1.5 text-xs rounded-md border border-sky-300 dark:border-sky-700 text-sky-700 dark:text-sky-300 hover:bg-sky-50 dark:hover:bg-sky-900/20 transition-colors disabled:opacity-60">{validating ? 'Checking…' : 'Check Key'}</button>
                      </div>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Strong reasoning models, especially useful for longer-form planning and analysis.</p>
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <label htmlFor="byok-anthropic" className="block text-sm font-medium text-gray-700 dark:text-gray-300">API key</label>
                        {anthropicKey && (
                          <button type="button" onClick={() => clearProviderKey('anthropic')} className="text-xs text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-300">
                            Clear
                          </button>
                        )}
                      </div>
                      <input id="byok-anthropic" type="password" value={anthropicKey} onChange={(e) => { setAnthropicKey(e.target.value); setValidation((current) => ({ ...current, anthropic: { status: 'idle', message: '' } })); updateStoredVerification((current) => { const next = { ...current }; delete next.anthropic; return next }) }} placeholder="sk-ant-..." className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-sky-500" />
                      {renderValidation('anthropic')}
                    </div>
                  )}

                  {modelTab === 'gemini' && (
                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900">
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-medium text-gray-900 dark:text-gray-100">Gemini</div>
                        <button onClick={() => runValidation('gemini')} disabled={validating} className="px-3 py-1.5 text-xs rounded-md border border-sky-300 dark:border-sky-700 text-sky-700 dark:text-sky-300 hover:bg-sky-50 dark:hover:bg-sky-900/20 transition-colors disabled:opacity-60">{validating ? 'Checking…' : 'Check Key'}</button>
                      </div>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Hosted Google Gemini models are supported alongside OpenAI and Anthropic.</p>
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <label htmlFor="byok-gemini" className="block text-sm font-medium text-gray-700 dark:text-gray-300">API key</label>
                        {geminiApiKey && (
                          <button type="button" onClick={() => clearProviderKey('gemini')} className="text-xs text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-300">
                            Clear
                          </button>
                        )}
                      </div>
                      <input id="byok-gemini" type="password" value={geminiApiKey} onChange={(e) => { setGeminiApiKey(e.target.value); setValidation((current) => ({ ...current, gemini: { status: 'idle', message: '' } })); updateStoredVerification((current) => { const next = { ...current }; delete next.gemini; return next }) }} placeholder="Gemini API key" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100" />
                      {renderValidation('gemini')}
                    </div>
                  )}

                  {ollamaEnabled && modelTab === 'ollama' && (
                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900">
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-medium text-gray-900 dark:text-gray-100">Ollama</div>
                        <button onClick={() => runValidation('ollama')} disabled={validating} className="px-3 py-1.5 text-xs rounded-md border border-sky-300 dark:border-sky-700 text-sky-700 dark:text-sky-300 hover:bg-sky-50 dark:hover:bg-sky-900/20 transition-colors disabled:opacity-60">{validating ? 'Checking…' : 'Check Runtime'}</button>
                      </div>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Local open-source models. You manage the Ollama runtime and installed models on your own machine or host.</p>
                      <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                        Works best when Ollama is already running and the models you want have been pulled.
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <label htmlFor="byok-ollama-url" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Base URL</label>
                        {(ollamaBaseUrl !== defaultOllamaBaseUrl || ollamaDefaultModel.trim()) && (
                          <button type="button" onClick={() => clearProviderKey('ollama')} className="text-xs text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-300">
                            Clear
                          </button>
                        )}
                      </div>
                      <input id="byok-ollama-url" type="text" value={ollamaBaseUrl} onChange={(e) => { setOllamaBaseUrl(e.target.value); setValidation((current) => ({ ...current, ollama: { status: 'idle', message: '' } })); updateStoredVerification((current) => { const next = { ...current }; delete next.ollama; return next }) }} placeholder={defaultOllamaBaseUrl || localDevOllamaBaseUrl} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100" />
                      <label htmlFor="byok-ollama-model" className="mt-3 block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Default model</label>
                      <input id="byok-ollama-model" type="text" value={ollamaDefaultModel} onChange={(e) => { setOllamaDefaultModel(e.target.value); setValidation((current) => ({ ...current, ollama: { status: 'idle', message: '' } })); updateStoredVerification((current) => { const next = { ...current }; delete next.ollama; return next }) }} placeholder="Default Ollama model" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100" />
                      <div className="mt-3 rounded-md border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-800/70 px-3 py-2">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-xs font-medium text-gray-700 dark:text-gray-300">Installed Ollama models</div>
                          <div className="flex items-center gap-2">
                            {ollamaModelsLoading && <div className="text-[11px] text-gray-500 dark:text-gray-400">Loading…</div>}
                            <button type="button" onClick={() => void loadOllamaModels(true)} className="text-[11px] text-sky-600 hover:text-sky-700 dark:text-sky-400 dark:hover:text-sky-300">Refresh</button>
                          </div>
                        </div>
                        {ollamaModels.length > 0 ? (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {ollamaModels.map((model) => {
                              const selected = ollamaDefaultModel.trim() === model
                              return (
                                <button
                                  key={model}
                                  type="button"
                                  onClick={() => {
                                    setOllamaDefaultModel(model)
                                    setValidation((current) => ({ ...current, ollama: { status: 'idle', message: '' } }))
                                    updateStoredVerification((current) => { const next = { ...current }; delete next.ollama; return next })
                                  }}
                                  className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                                    selected
                                      ? 'border-sky-500 bg-sky-100 text-sky-700 dark:border-sky-600 dark:bg-sky-900/30 dark:text-sky-300'
                                      : 'border-gray-300 bg-white text-gray-700 hover:border-sky-300 hover:text-sky-700 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-300 dark:hover:border-sky-700 dark:hover:text-sky-300'
                                  }`}
                                >
                                  {model}
                                </button>
                              )
                            })}
                          </div>
                        ) : (
                          <div className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">
                            {ollamaModelsLoading ? 'Checking Ollama for installed models…' : 'No installed models found yet. Pull a model with Ollama, then reopen or update the base URL.'}
                          </div>
                        )}
                      </div>
                      {renderValidation('ollama')}
                      <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">{ollamaStatusText}</div>
                    </div>
                  )}

                  {(hasOpenAiAvailable || hasAnthropicAvailable || hasGeminiAvailable || ollamaConfigured) && (
                    <div className={`pt-4 border-t border-gray-200 dark:border-gray-700 ${highlightPreferredModel ? 'rounded-lg border border-purple-300 bg-purple-50/70 px-3 pb-3 dark:border-purple-700 dark:bg-purple-900/20' : ''}`}>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Preferred default model for new agents</label>
                      <select ref={preferredModelRef} value={preferredModel} onChange={(e) => setPreferredModel(e.target.value)} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm">
                        <option value="">Auto (best for configured keys)</option>
                        {uniquePreferredOptions.length > 0 ? uniquePreferredOptions.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        )) : (
                          <>
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
                                <option value="google/gemini-3.1-pro-preview">Gemini 3.1 Pro Preview (best reasoning)</option>
                                <option value="google/gemini-2.5-flash">Gemini 2.5 Flash (balanced)</option>
                                <option value="google/gemini-2.5-flash-lite">Gemini 2.5 Flash Lite (cost efficient)</option>
                              </>
                            )}
                            {ollamaEnabled && ollamaConfigured && ollamaDefaultModel && <option value={`ollama/${ollamaDefaultModel}`}>Ollama {ollamaDefaultModel} (local default)</option>}
                          </>
                        )}
                      </select>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Used when creating agents and applying templates. Discovered provider models appear here automatically when available.</p>
                      {highlightPreferredModel && (
                        <div className="mt-2 text-xs font-medium text-purple-700 dark:text-purple-300">
                          Set this once for shared background execution in this workspace.
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="mt-6 flex items-center justify-between gap-3">
                  <button onClick={handleSkip} className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors">Skip for now</button>
                  <div className="flex items-center gap-2">
                    <button onClick={handleSave} disabled={validating} className="px-4 py-2 text-sm rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-60">Save &amp; Close</button>
                    {initialStep !== 'models' && (
                      <button onClick={() => setStep('partners')} className="px-4 py-2 text-sm rounded-md bg-sky-600 text-white hover:bg-sky-700 transition-colors">Next &rarr;</button>
                    )}
                  </div>
                </div>
              </>
            )}

            {step === 'partners' && (
              <>
                <div className="mt-4 rounded-xl border border-cyan-200 dark:border-cyan-800 bg-cyan-50 dark:bg-cyan-900/20 p-4 text-sm text-cyan-900 dark:text-cyan-100">
                  <div className="font-medium">Optional partner integrations</div>
                  <div className="mt-1">
                    Choose which partner pages to configure for this workspace. You can select all, some, or none. Selected integrations drive template defaults and future partner-aware template options.
                  </div>
                </div>

                <div className="mt-5 space-y-3">
                  {visiblePartnerDefinitions.length === 0 ? (
                    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-4 text-sm text-gray-500 dark:text-gray-400">
                      No optional partner integrations are enabled for this environment.
                    </div>
                  ) : visiblePartnerDefinitions.map((partner) => {
                    const checked = selectedPartners.includes(partner.slug)
                    return (
                      <label key={partner.slug} className={`block rounded-xl border p-4 cursor-pointer transition-colors ${checked ? 'border-sky-300 bg-sky-50 dark:border-sky-700 dark:bg-sky-900/20' : 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900'}`}>
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              setSelectedPartners((current) => e.target.checked
                                ? Array.from(new Set([...current, partner.slug]))
                                : current.filter((slug) => slug !== partner.slug))
                            }}
                            className="mt-1"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              {partner.logoUrl ? (
                                <img
                                  src={partner.logoUrl}
                                  alt={`${partner.name} logo`}
                                  className="h-6 w-auto max-w-[96px] object-contain rounded-sm bg-white/80 px-1 py-0.5 dark:bg-gray-800/80"
                                  loading="lazy"
                                />
                              ) : null}
                              <div className="font-medium text-gray-900 dark:text-gray-100">{partner.name}</div>
                              {partner.category ? <span className="rounded-full bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-[11px] text-gray-500 dark:text-gray-400">{partner.category}</span> : null}
                            </div>
                            <div className="mt-1 text-sm text-gray-600 dark:text-gray-300">{partner.description}</div>
                            <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">{describePartnerStatus(partner)}</div>
                            {(partner.website || partner.docsUrl) && (
                              <div className="mt-2 flex flex-wrap gap-3 text-xs">
                                {partner.website ? <a href={partner.website} target="_blank" rel="noopener noreferrer" className="text-sky-600 underline dark:text-sky-400">Website</a> : null}
                                {partner.docsUrl ? <a href={partner.docsUrl} target="_blank" rel="noopener noreferrer" className="text-sky-600 underline dark:text-sky-400">Docs</a> : null}
                              </div>
                            )}
                          </div>
                        </div>
                      </label>
                    )
                  })}
                </div>

                <div className="mt-6 flex items-center justify-between gap-3">
                  <div>
                    {initialStep !== 'partners' && (
                      <button onClick={() => setStep('models')} className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors">&larr; Back</button>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={handleSave} className="px-4 py-2 text-sm rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">Save &amp; Close</button>
                    <button onClick={goToNextStep} className="px-4 py-2 text-sm rounded-md bg-sky-600 text-white hover:bg-sky-700 transition-colors">
                      {selectedPartnerDefinitions.length > 0 ? 'Next →' : 'Save Integrations'}
                    </button>
                  </div>
                </div>
              </>
            )}

            {currentPartner && (
              <>
                <div className="mt-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 p-4 text-sm text-slate-700 dark:text-slate-200">
                  <div className="flex items-center gap-3">
                    {currentPartner.logoUrl ? (
                      <img
                        src={currentPartner.logoUrl}
                        alt={`${currentPartner.name} logo`}
                        className="h-8 w-auto max-w-[120px] object-contain rounded-sm bg-white/80 px-1.5 py-1 dark:bg-gray-800/80"
                        loading="lazy"
                      />
                    ) : null}
                    <div className="font-medium">{currentPartner.name}</div>
                  </div>
                  <div className="mt-1">{renderPartnerHelp(currentPartner)}</div>
                  <div className="mt-2 text-xs opacity-80">
                    Optional partner integration.
                    {currentPartner.docsUrl ? <> Docs: <a href={currentPartner.docsUrl} target="_blank" rel="noopener noreferrer" className="underline">{currentPartner.docsUrl}</a></> : null}
                    {currentPartner.website ? <> · Website: <a href={currentPartner.website} target="_blank" rel="noopener noreferrer" className="underline">{currentPartner.website}</a></> : null}
                  </div>
                  {currentPartner.validation?.helperText ? (
                    <div className="mt-2 text-xs opacity-80">{currentPartner.validation.helperText}</div>
                  ) : null}
                  {renderPartnerSkillsNote(currentPartner)}
                </div>

                <div className="mt-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-4 text-sm text-gray-600 dark:text-gray-300">
                  <div className="font-medium text-gray-900 dark:text-gray-100">{currentPartner.name} status</div>
                  <div className="mt-1">{describePartnerStatus(currentPartner)}</div>
                </div>

                {currentPartner.slug === 'github' && (
                  <div className="mt-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-4 text-sm text-gray-600 dark:text-gray-300">
                    <div className="font-medium text-gray-900 dark:text-gray-100">GitHub readiness</div>
                    <div className="mt-2 space-y-2">
                      {githubChecks.length === 0 ? (
                        <div className="text-sm text-gray-500 dark:text-gray-400">Checking GitHub readiness for this runtime…</div>
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
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {githubMode !== 'token' && (
                        <>
                          <button
                            type="button"
                            onClick={() => void runGitHubAuth('login')}
                            disabled={githubAuthRunning}
                            className="px-4 py-2 text-sm rounded-md border border-sky-300 dark:border-sky-700 text-sky-700 dark:text-sky-300 hover:bg-sky-50 dark:hover:bg-sky-900/20 transition-colors disabled:opacity-60"
                          >
                            {githubAuthRunning ? 'Connecting…' : 'Connect GitHub CLI'}
                          </button>
                          <button
                            type="button"
                            onClick={() => void runGitHubAuth('refresh-repo-scope')}
                            disabled={githubAuthRunning}
                            className="px-4 py-2 text-sm rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-60"
                          >
                            Refresh Repo Scope
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => void refreshGithubChecks()}
                        disabled={githubAuthRunning || githubStatusChecking}
                        className="px-4 py-2 text-sm rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-60"
                      >
                        {githubStatusChecking ? 'Checking…' : 'Recheck Status'}
                      </button>
                    </div>
                    <div className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                      {githubMode === 'token'
                        ? 'This runtime is using GitHub token mode. Keep the token in server/runtime env and set a default repository for issue and PR workflows.'
                        : 'This runtime is using the GitHub CLI auth flow. It is reliable in local/dev and on-prem setups. Hosted/cloud deployments should prefer a runtime token or app-based GitHub connection.'}
                    </div>
                    {(githubDeviceCode || githubDeviceUrl) && (
                      <div className="mt-3 rounded-lg border border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-900/20 px-3 py-3 text-sm text-sky-900 dark:text-sky-100">
                        <div className="font-medium">GitHub device login helper</div>
                        {githubDeviceCode && (
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <span className="text-xs uppercase tracking-wide opacity-80">Code</span>
                            <code className="rounded bg-white/80 dark:bg-gray-900/70 px-2 py-1 font-mono text-sm">{githubDeviceCode}</code>
                            <button
                              type="button"
                              onClick={() => void copyText(githubDeviceCode, 'Copied GitHub device code', 'Could not copy GitHub device code')}
                              className="px-2.5 py-1 text-[11px] rounded-md border border-sky-300 dark:border-sky-700 text-sky-700 dark:text-sky-300 hover:bg-sky-100 dark:hover:bg-sky-900/30 transition-colors"
                            >
                              Copy Code
                            </button>
                          </div>
                        )}
                        {githubDeviceUrl && (
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <a
                              href={githubDeviceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-3 py-1.5 text-xs rounded-md bg-sky-600 text-white hover:bg-sky-700 transition-colors"
                            >
                              Open GitHub Device Login
                            </a>
                            <button
                              type="button"
                              onClick={() => void copyText(githubDeviceUrl, 'Copied GitHub device URL', 'Could not copy GitHub device URL')}
                              className="px-2.5 py-1 text-[11px] rounded-md border border-sky-300 dark:border-sky-700 text-sky-700 dark:text-sky-300 hover:bg-sky-100 dark:hover:bg-sky-900/30 transition-colors"
                            >
                              Copy URL
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                    {(githubAuthRunning || githubAuthLogs.length > 0) && (
                      <div className="mt-3 bg-gray-900 text-green-400 font-mono text-xs rounded-lg p-3 h-48 overflow-y-auto whitespace-pre-wrap">
                        {githubAuthLogs.join('')}
                        {githubAuthRunning && <span className="animate-pulse">▌</span>}
                      </div>
                    )}
                    {githubAuthError && (
                      <div className="mt-3 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-700 dark:text-red-300">
                        {githubAuthError}
                      </div>
                    )}
                    {githubAuthDone && !githubAuthError && (
                      <div className="mt-3 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
                        GitHub auth flow completed. Review the readiness state above to confirm issue and PR workflows are ready.
                      </div>
                    )}
                  </div>
                )}

                <div className="mt-5 space-y-4">
                  {(currentPartner.fields || []).map((field) => renderPartnerField(currentPartner, field))}
                  {currentPartner.validation && currentPartner.slug !== 'github' && renderPartnerValidation(currentPartner)}
                  {currentPartner.slug === 'opik' && (
                    <div className="flex justify-end">
                      <button
                        onClick={handleCopyOpikEnv}
                        className="px-4 py-2 text-sm rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                      >
                        Copy .env Snippet
                      </button>
                    </div>
                  )}
                </div>

                <div className="mt-6 flex items-center justify-between gap-3">
                  <button onClick={goToPreviousStep} className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors">&larr; Back</button>
                  <div className="flex items-center gap-2">
                    {currentPartner.validation && currentPartner.slug !== 'github' && (
                      <button onClick={() => runValidation('current-partner')} disabled={validating} className="px-4 py-2 text-sm rounded-md border border-purple-300 dark:border-purple-700 text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors disabled:opacity-60">
                        {validating ? 'Checking…' : currentPartner.validation.label || 'Check Keys'}
                      </button>
                    )}
                    <button onClick={handleSave} className="px-4 py-2 text-sm rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">Save &amp; Close</button>
                    {currentStepIndex < stepOrder.length - 1 ? (
                      <button onClick={goToNextStep} className="px-4 py-2 text-sm rounded-md bg-sky-600 text-white hover:bg-sky-700 transition-colors">Next &rarr;</button>
                    ) : (
                      <button onClick={handleSave} className="px-4 py-2 text-sm rounded-md bg-sky-600 text-white hover:bg-sky-700 transition-colors">Save Integrations</button>
                    )}
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
