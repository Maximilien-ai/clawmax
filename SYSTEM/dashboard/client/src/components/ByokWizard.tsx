import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { useToast } from './Toast'
import { buildByokVerificationFingerprint, detectProviderKeyMismatch, getByokDismissKey, hasCogneeConfiguration, isOllamaUiAvailable, readStoredByokKeys, resolveOllamaBaseUrlForRuntime, resolveOpenAiCompatibleBaseUrlForRuntime, resolveSelectedPartnersForWorkspace, shouldAutoValidateByokOnSave, writeStoredByokKeys } from '../lib/byok'
import { filterPartnersByCategory, formatPartnerCategoryLabel, getPartnerCategories, listPartnerCategoryTabs } from '../lib/partnerCatalog'
import { DEFAULT_VISIBLE_PARTNERS, getDefaultPartnerDefinitions } from '../lib/defaultPartners'
import { BROWSER_VAULT_UPDATED_EVENT, readPartnerValuesFromSharedSecrets, readSharedSecrets, writePartnerValuesToSharedSecrets, writeSharedSecrets } from '../lib/localSecrets'
import { resolveResendTestRecipientEmail } from '../lib/resendTestEmail'
import { formatOpenAiDeprecationNotice, formatOpenAiModelLabel, isSelectableLifecycleModel } from '../lib/openAiModelLifecycle'
import { PartnerLogo } from './PartnerLogo'
import {
  beginMailOAuthConnection,
  createMailGrant,
  disconnectMailOAuthConnection,
  isMailOAuthProvider,
  loadMailGrantStatus,
  loadMailOAuthStatus,
  MailCapability,
  MailGrantStatus,
  MailOAuthStatus,
  refreshMailOAuthConnection,
  revokeMailGrant,
} from '../lib/mailOAuth'

function maskKey(value: string) {
  if (value.length <= 8) return 'configured'
  return `${value.slice(0, 4)}••••${value.slice(-4)}`
}

type Step = 'models' | 'partners' | `partner:${string}`
type ModelTab = 'openai' | 'anthropic' | 'gemini' | 'openrouter' | 'xai' | 'ollama' | 'openaiCompatible'
type ProviderKey = 'openai' | 'anthropic' | 'gemini' | 'openrouter' | 'xai' | 'ollama'
type ValidationEntry = { status: 'idle' | 'valid' | 'invalid' | 'error' | 'skipped'; message: string }
type ValidationState = Record<string, ValidationEntry>
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
  matchNames?: string[]
  matchPrefixes?: string[]
  sourceUrl?: string
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
  categories?: string[]
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
  systemPreferredModel?: string
  githubDefaultRepo?: string
  sensoContextLabel?: string
  ollamaBaseUrl?: string
  ollamaDefaultModel?: string
  openaiCompatibleBaseUrl?: string
  openaiCompatibleDefaultModel?: string
  opikWorkspace?: string
  opikProject?: string
  enabledPartners?: string[]
  partners?: Record<string, Record<string, string | boolean | undefined>>
}
type PartnerValueMap = Record<string, Record<string, string>>
type PartnerSecretPresence = Record<string, Record<string, boolean>>
type ScopedValidationTarget = 'all' | 'current-partner' | 'openai' | 'openaiCompatible' | 'anthropic' | 'gemini' | 'openrouter' | 'xai' | 'ollama'
type PartnerPluginAction = 'install' | 'uninstall'
type PartnerPluginRun = {
  slug: string
  name: string
  action: PartnerPluginAction
  status: 'confirming' | 'running' | 'success' | 'error'
  logs: string[]
  error?: string
}
type PartnerPluginStatus = {
  commandId: string
  pluginId: string
  installed: boolean
  enabled: boolean
  status: string
  name?: string
  version?: string
  origin?: string
}

const localDevOllamaBaseUrl = 'http://localhost:11434'
const localDevOpenAiCompatibleBaseUrl = 'http://127.0.0.1:1234/v1'
const managedRuntimeOpenAiCompatibleBaseUrl = 'http://host.containers.internal:1234/v1'
const CLOSE_INTEGRATIONS_WIZARDS_EVENT = 'clawmax-close-integrations-wizards'
const DEFAULT_RESEND_TEST_FROM = 'agent@send.clawmax.ai'
const DEFAULT_RESEND_TEST_FROM_NAME = 'ClawMax Agent'
const DEFAULT_RESEND_TEST_SENDER = `${DEFAULT_RESEND_TEST_FROM_NAME} <${DEFAULT_RESEND_TEST_FROM}>`
const DEFAULT_MAIL_GRANT_CAPABILITIES: MailCapability[] = ['mail.list', 'mail.search', 'mail.read.metadata']
const MAIL_GRANT_CAPABILITY_OPTIONS: Array<{ id: MailCapability; label: string }> = [
  { id: 'mail.list', label: 'List inbox' },
  { id: 'mail.search', label: 'Search mail' },
  { id: 'mail.read.metadata', label: 'Read metadata' },
  { id: 'mail.read.body', label: 'Read message bodies' },
  { id: 'mail.draft.create', label: 'Create unsent drafts' },
]

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
  resend: 3,
  cognee: 4,
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
  values: { openai: string; anthropic: string; gemini: string; openrouter: string; xai: string; ollamaBaseUrl: string }
) {
  const next = { ...existing }
  if (values.openai) next.OPENAI_API_KEY = values.openai
  else delete next.OPENAI_API_KEY
  if (values.anthropic) next.ANTHROPIC_API_KEY = values.anthropic
  else delete next.ANTHROPIC_API_KEY
  if (values.gemini) next.GEMINI_API_KEY = values.gemini
  else delete next.GEMINI_API_KEY
  if (values.openrouter) next.OPENROUTER_API_KEY = values.openrouter
  else delete next.OPENROUTER_API_KEY
  if (values.xai) next.XAI_API_KEY = values.xai
  else delete next.XAI_API_KEY
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
  const { activeWorkspace } = useWorkspace()
  const { showSuccess, showInfo, showWarning } = useToast()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>('models')
  const [openaiKey, setOpenaiKey] = useState('')
  const [anthropicKey, setAnthropicKey] = useState('')
  const [geminiApiKey, setGeminiApiKey] = useState('')
  const [openrouterKey, setOpenrouterKey] = useState('')
  const [xaiKey, setXaiKey] = useState('')
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState('')
  const [ollamaDefaultModel, setOllamaDefaultModel] = useState('')
  const [openaiCompatibleApiKey, setOpenaiCompatibleApiKey] = useState('')
  const [openaiCompatibleBaseUrl, setOpenaiCompatibleBaseUrl] = useState('')
  const [openaiCompatibleDefaultModel, setOpenaiCompatibleDefaultModel] = useState('')
  const [preferredModel, setPreferredModel] = useState('')
  const [systemPreferredModel, setSystemPreferredModel] = useState('')
  const [partnerSecrets, setPartnerSecrets] = useState<PartnerValueMap>({})
  const [serverPartnerSecretPresence, setServerPartnerSecretPresence] = useState<PartnerSecretPresence>({})
  const [partnerValues, setPartnerValues] = useState<PartnerValueMap>({})
  const [selectedPartners, setSelectedPartners] = useState<string[]>([])
  const [partnerCategoryTab, setPartnerCategoryTab] = useState<string>('all')
  const [activityConsents, setActivityConsents] = useState<Array<{ destinationId: string; scopes: string[] }>>([])
  const [activityDestination, setActivityDestination] = useState<'clawmax-ai' | 'digo'>('clawmax-ai')
  const [activityScopes, setActivityScopes] = useState<string[]>(['agent-chat', 'workflow'])
  const [activityConfirmOpen, setActivityConfirmOpen] = useState(false)
  const [activityDelivery, setActivityDelivery] = useState<{
    queuedEvents: number
    worker?: { running?: boolean; lastAttemptAt?: string; lastError?: string; configured?: { clawmaxAi?: boolean; digo?: boolean } }
    retry?: { attempts?: number; lastError?: string }
  } | null>(null)
  const [validating, setValidating] = useState(false)
  const [resendTestSending, setResendTestSending] = useState(false)
  const [resendTestTo, setResendTestTo] = useState('')
  const [resendTestSubject, setResendTestSubject] = useState('ClawMax Resend test email')
  const [resendTestBody, setResendTestBody] = useState('This is a ClawMax Resend integration test email.')
  const [validation, setValidation] = useState<ValidationState>({
    openai: { status: 'idle', message: '' },
    anthropic: { status: 'idle', message: '' },
    gemini: { status: 'idle', message: '' },
    openrouter: { status: 'idle', message: '' },
    xai: { status: 'idle', message: '' },
    ollama: { status: 'idle', message: '' },
    openaiCompatible: { status: 'idle', message: '' },
    opik: { status: 'idle', message: '' },
    senso: { status: 'idle', message: '' },
    cognee: { status: 'idle', message: '' },
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
  const [availableModelsLoading, setAvailableModelsLoading] = useState(false)
  const [modelsByProvider, setModelsByProvider] = useState<ModelsByProvider>({})
  const [showAllDiscoveredModels, setShowAllDiscoveredModels] = useState(false)
  const [partnerInstallState, setPartnerInstallState] = useState<Record<string, 'idle' | 'installing' | 'uninstalling'>>({})
  const [partnerPluginStatuses, setPartnerPluginStatuses] = useState<Record<string, PartnerPluginStatus>>({})
  const [partnerPluginRun, setPartnerPluginRun] = useState<PartnerPluginRun | null>(null)
  const [mailOAuthStatus, setMailOAuthStatus] = useState<MailOAuthStatus | null>(null)
  const [mailGrantStatus, setMailGrantStatus] = useState<MailGrantStatus>({ grants: [], agents: [] })
  const [mailGrantAgents, setMailGrantAgents] = useState<Record<string, string>>({})
  const [mailGrantCapabilities, setMailGrantCapabilities] = useState<Record<string, MailCapability[]>>({})
  const [mailOAuthBusy, setMailOAuthBusy] = useState<string | null>(null)
  const [mailOAuthError, setMailOAuthError] = useState<string | null>(null)
  const mailOAuthPopupRef = useRef<Window | null>(null)
  const preferredModelRef = useRef<HTMLSelectElement | null>(null)
  const [highlightPreferredModel, setHighlightPreferredModel] = useState(false)
  const [modelTab, setModelTab] = useState<ModelTab>('openai')
  const [onboardingOpen, setOnboardingOpen] = useState(false)
  const deploymentKind = config?.deploymentKind || 'local'

  useEffect(() => {
    if (!open || step !== 'partners') return
    let cancelled = false
    const refreshActivityStatus = () => fetch('/api/activity-export/status')
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => {
        if (cancelled) return
        const destinations = Array.isArray(payload?.destinations) ? payload.destinations : (payload?.sharing ? [payload.sharing] : [])
        const normalized = destinations.map((entry: any) => ({ destinationId: String(entry.destinationId) === 'digo' ? 'digo' : 'clawmax-ai', scopes: Array.isArray(entry.scopes) ? entry.scopes : [] }))
        setActivityConsents(normalized)
        if (normalized.length > 0) setActivityDestination(normalized[0].destinationId)
        setActivityDelivery({ queuedEvents: Number(payload?.queuedEvents) || 0, worker: payload?.delivery?.worker, retry: payload?.delivery?.retry })
      })
      .catch(() => undefined)
    refreshActivityStatus()
    const refreshTimer = window.setInterval(refreshActivityStatus, 15000)
    return () => { cancelled = true; window.clearInterval(refreshTimer) }
  }, [open, step])

  async function toggleActivitySharing() {
    if (activityConsents.some((entry) => entry.destinationId === activityDestination)) {
      await fetch('/api/activity-export/consent', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ destinationId: activityDestination }) })
      setActivityConsents((current) => current.filter((entry) => entry.destinationId !== activityDestination))
      window.dispatchEvent(new CustomEvent('activity-export-updated'))
      return
    }
    if (!activityConfirmOpen) {
      setActivityConfirmOpen(true)
      return
    }
    const response = await fetch('/api/activity-export/consent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ destinationId: activityDestination, scopes: activityScopes }) })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) { showWarning(payload?.error || 'Unable to enable activity sharing'); return }
    setActivityConsents((current) => [...current.filter((entry) => entry.destinationId !== activityDestination), { destinationId: activityDestination, scopes: activityScopes }])
    setActivityConfirmOpen(false)
    window.dispatchEvent(new CustomEvent('activity-export-updated'))
    showSuccess(`Activity sharing enabled for ${activityDestination === 'digo' ? 'Digo' : 'ClawMax.ai'}`)
  }
  async function revokeActivityDestination(destinationId: string) {
    const response = await fetch('/api/activity-export/consent', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ destinationId }) })
    if (!response.ok) {
      showWarning('Unable to revoke activity sharing')
      return
    }
    setActivityConsents((current) => current.filter((entry) => entry.destinationId !== destinationId))
    window.dispatchEvent(new CustomEvent('activity-export-updated'))
    showSuccess(`Activity sharing revoked for ${destinationId === 'digo' ? 'Digo' : 'ClawMax.ai'}`)
  }
  const ollamaEnabled = isOllamaUiAvailable(config)
  const managedRuntime = config?.managedRuntime === true || deploymentKind !== 'local'
  const defaultOllamaBaseUrl = config?.defaultOllamaBaseUrl || localDevOllamaBaseUrl
  const defaultOpenAiCompatibleBaseUrl = config?.defaultOpenAiCompatibleBaseUrl
    || (deploymentKind === 'onprem' ? managedRuntimeOpenAiCompatibleBaseUrl : localDevOpenAiCompatibleBaseUrl)
  const effectiveOllamaBaseUrl = resolveOllamaBaseUrlForRuntime({
    configuredBaseUrl: ollamaBaseUrl,
    managedRuntime,
    runtimeDefaultBaseUrl: config?.defaultOllamaBaseUrl,
  })

  const refreshLocalState = React.useCallback(() => {
    const stored = readStoredByokKeys()
    const sharedWorkspace = readSharedSecrets('workspace')
    const sharedGlobal = readSharedSecrets('global')
    const shared = { ...sharedGlobal, ...sharedWorkspace }

    setOpenaiKey(shared.OPENAI_API_KEY || stored.openai || '')
    setAnthropicKey(shared.ANTHROPIC_API_KEY || stored.anthropic || '')
    setGeminiApiKey(shared.GEMINI_API_KEY || stored.geminiApiKey || '')
    setOpenrouterKey(shared.OPENROUTER_API_KEY || stored.openrouter || '')
    setXaiKey(shared.XAI_API_KEY || stored.xai || '')
    setOllamaBaseUrl(resolveOllamaBaseUrlForRuntime({
      configuredBaseUrl: shared.OLLAMA_BASE_URL || stored.ollamaBaseUrl || '',
      managedRuntime,
      runtimeDefaultBaseUrl: config?.defaultOllamaBaseUrl || defaultOllamaBaseUrl,
    }))
    setOllamaDefaultModel(stored.ollamaDefaultModel || '')
    setOpenaiCompatibleApiKey(stored.openaiCompatibleApiKey || '')
    setOpenaiCompatibleBaseUrl(resolveOpenAiCompatibleBaseUrlForRuntime({
      configuredBaseUrl: stored.openaiCompatibleBaseUrl || '',
      managedRuntime,
      runtimeDefaultBaseUrl: defaultOpenAiCompatibleBaseUrl,
    }))
    setOpenaiCompatibleDefaultModel(stored.openaiCompatibleDefaultModel || '')
    setPreferredModel(stored.preferredModel || '')
    setSystemPreferredModel(stored.systemPreferredModel || '')
    setPartnerSecrets(stored.partnerSecrets || {})
    setPartnerValues(stored.partnerValues || {})
    setDismissed(localStorage.getItem(getByokDismissKey()) === 'true')
  }, [config?.defaultOllamaBaseUrl, defaultOllamaBaseUrl, managedRuntime])

  const updateStoredVerification = React.useCallback((
    updater: (current: Partial<Record<'openai' | 'anthropic' | 'gemini' | 'openrouter' | 'xai' | 'ollama' | 'openaiCompatible', string>>) => Partial<Record<'openai' | 'anthropic' | 'gemini' | 'openrouter' | 'xai' | 'ollama' | 'openaiCompatible', string>>
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
    openrouter: buildByokVerificationFingerprint('openrouter', { openrouter: openrouterKey }),
    xai: buildByokVerificationFingerprint('xai', { xai: xaiKey }),
    ollama: buildByokVerificationFingerprint('ollama', { ollamaBaseUrl, ollamaDefaultModel }),
    openaiCompatible: buildByokVerificationFingerprint('openaiCompatible', { openaiCompatibleApiKey, openaiCompatibleBaseUrl, openaiCompatibleDefaultModel }),
  }), [anthropicKey, geminiApiKey, ollamaBaseUrl, ollamaDefaultModel, openaiCompatibleApiKey, openaiCompatibleBaseUrl, openaiCompatibleDefaultModel, openaiKey, openrouterKey, xaiKey])

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
      ;(['openai', 'anthropic', 'gemini', 'openrouter', 'ollama', 'openaiCompatible'] as const).forEach((provider) => {
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
        setSystemPreferredModel((current) => current || workspaceConfig.systemPreferredModel || '')
        setOllamaBaseUrl((current) => {
          const nextDefault = resolveOllamaBaseUrlForRuntime({
            configuredBaseUrl: workspaceConfig.ollamaBaseUrl || '',
            managedRuntime,
            runtimeDefaultBaseUrl: config?.defaultOllamaBaseUrl || defaultOllamaBaseUrl,
          })
          const normalizedCurrent = resolveOllamaBaseUrlForRuntime({
            configuredBaseUrl: current,
            managedRuntime,
            runtimeDefaultBaseUrl: config?.defaultOllamaBaseUrl || defaultOllamaBaseUrl,
          })
          const isCustomCurrent = !!normalizedCurrent && normalizedCurrent !== nextDefault
          return isCustomCurrent ? current : nextDefault
        })
        setOllamaDefaultModel((current) => current || workspaceConfig.ollamaDefaultModel || '')
        setOpenaiCompatibleBaseUrl((current) => {
          const nextDefault = resolveOpenAiCompatibleBaseUrlForRuntime({
            configuredBaseUrl: workspaceConfig.openaiCompatibleBaseUrl || '',
            managedRuntime,
            runtimeDefaultBaseUrl: defaultOpenAiCompatibleBaseUrl,
          })
          const normalizedCurrent = resolveOpenAiCompatibleBaseUrlForRuntime({
            configuredBaseUrl: current,
            managedRuntime,
            runtimeDefaultBaseUrl: defaultOpenAiCompatibleBaseUrl,
          })
          const isCustomCurrent = !!normalizedCurrent && normalizedCurrent !== nextDefault
          return isCustomCurrent ? current : nextDefault
        })
        setOpenaiCompatibleDefaultModel((current) => current || workspaceConfig.openaiCompatibleDefaultModel || '')
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
        setSelectedPartners(resolveSelectedPartnersForWorkspace({
          enabledPartners: Array.isArray(workspaceConfig.enabledPartners) ? workspaceConfig.enabledPartners : [],
          lockedPartnerSlugs: [
            ...(config?.opikRuntimeConfigured ? ['opik'] : []),
            ...(config?.resendRuntimeConfigured ? ['resend'] : []),
            ...(config?.cogneeRuntimeConfigured ? ['cognee'] : []),
          ],
        }))
      })
      .catch(() => {})
  }, [activeWorkspace?.id, config?.cogneeRuntimeConfigured, config?.defaultOllamaBaseUrl, config?.opikRuntimeConfigured, config?.resendRuntimeConfigured, defaultOllamaBaseUrl, hydrated, managedRuntime])

  const hasStoredKeys = !!(openaiKey || anthropicKey || geminiApiKey || openrouterKey || xaiKey || openaiCompatibleBaseUrl || openaiCompatibleDefaultModel)
  const hasDefaultUserKeys = !!(config?.userKeyDefaults?.openai || config?.userKeyDefaults?.anthropic || config?.userKeyDefaults?.gemini || config?.userKeyDefaults?.openrouter || config?.userKeyDefaults?.xai || config?.userKeyDefaults?.openaiCompatible)
  const hasSystemProviderKeys = !!(config?.systemKeyDefaults?.openai || config?.systemKeyDefaults?.anthropic || config?.systemKeyDefaults?.gemini || config?.systemKeyDefaults?.openrouter || config?.systemKeyDefaults?.xai || config?.systemKeyDefaults?.openaiCompatible)
  const hasOpenAiAvailable = !!(openaiKey || config?.userKeyDefaults?.openai || config?.systemKeyDefaults?.openai)
  const hasAnthropicAvailable = !!(anthropicKey || config?.userKeyDefaults?.anthropic || config?.systemKeyDefaults?.anthropic)
  const hasGeminiAvailable = !!(geminiApiKey || config?.userKeyDefaults?.gemini || config?.systemKeyDefaults?.gemini)
  const hasOpenrouterAvailable = !!(openrouterKey || config?.userKeyDefaults?.openrouter || config?.systemKeyDefaults?.openrouter)
  const hasXaiAvailable = !!(xaiKey || config?.userKeyDefaults?.xai || config?.systemKeyDefaults?.xai)
  const hasOpenAiCompatibleAvailable = !!(openaiCompatibleBaseUrl || config?.userKeyDefaults?.openaiCompatible || config?.systemKeyDefaults?.openaiCompatible)
  const normalizedOllamaBaseUrl = effectiveOllamaBaseUrl.trim()
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
  const digoConfigured = selectedPartners.includes('digo') && Boolean(getPartnerValue('digo', 'apiUrl').trim() && (getPartnerSecret('digo', 'apiKey').trim() || hasServerPartnerSecret('digo', 'apiKey')))
  const activeActivityConsent = activityConsents.find((entry) => entry.destinationId === activityDestination) || null

  const visiblePartnerDefinitions = useMemo(
    () => {
      const visibleSlugs = integrationStatus?.visiblePartners?.length ? integrationStatus.visiblePartners : DEFAULT_VISIBLE_PARTNERS
      const visibleSet = new Set(visibleSlugs)
      return sortPartnerDefinitions((integrationStatus?.partnerDefinitions || []).filter((partner) => visibleSet.has(partner.slug)))
    },
    [integrationStatus]
  )
  const partnerDefinitionBySlug = useMemo(() => (
    Object.fromEntries(visiblePartnerDefinitions.map((partner) => [partner.slug, partner]))
  ), [visiblePartnerDefinitions])
  const visiblePartnerSlugs = useMemo(
    () => (integrationStatus?.visiblePartners?.length ? integrationStatus.visiblePartners : DEFAULT_VISIBLE_PARTNERS),
    [integrationStatus]
  )

  const selectedPartnerDefinitions = useMemo(
    () => sortPartnerDefinitions(visiblePartnerDefinitions.filter((partner) => selectedPartners.includes(partner.slug))),
    [selectedPartners, visiblePartnerDefinitions]
  )
  const lockedPartnerSlugs = useMemo(
    () => [
      ...(config?.opikRuntimeConfigured ? ['opik'] : []),
      ...(config?.resendRuntimeConfigured ? ['resend'] : []),
      ...(config?.cogneeRuntimeConfigured ? ['cognee'] : []),
    ],
    [config?.cogneeRuntimeConfigured, config?.opikRuntimeConfigured, config?.resendRuntimeConfigured]
  )
  const partnerCategoryTabs = useMemo(
    () => listPartnerCategoryTabs(visiblePartnerDefinitions),
    [visiblePartnerDefinitions]
  )
  const visiblePartnersForTab = useMemo(
    () => filterPartnersByCategory(visiblePartnerDefinitions, partnerCategoryTab),
    [partnerCategoryTab, visiblePartnerDefinitions]
  )

  useEffect(() => {
    if (lockedPartnerSlugs.length === 0) return
    setSelectedPartners((current) => Array.from(new Set([...current, ...lockedPartnerSlugs])))
  }, [lockedPartnerSlugs])

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
    const resolveSource = (provider: ProviderKey | 'openaiCompatible') => {
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
      if (provider === 'openrouter') {
        if (openrouterKey) return 'browser BYOK'
        if (config?.userKeyDefaults?.openrouter) return 'user default'
        if (config?.systemKeyDefaults?.openrouter) return 'system default'
        return 'not configured'
      }
      if (provider === 'xai') {
        if (xaiKey) return 'browser BYOK'
        if (config?.userKeyDefaults?.xai) return 'user default'
        if (config?.systemKeyDefaults?.xai) return 'system default'
        return 'not configured'
      }
      if (provider === 'openaiCompatible') {
        if (openaiCompatibleBaseUrl) return 'browser/workspace BYOK'
        if (config?.userKeyDefaults?.openaiCompatible) return 'user default'
        if (config?.systemKeyDefaults?.openaiCompatible) return 'system default'
        return 'not configured'
      }
      if (provider === 'ollama') {
        if (ollamaBaseUrl.trim() || ollamaDefaultModel.trim()) return 'browser/workspace BYOK'
        if (ollamaEnabled && defaultOllamaBaseUrl) return 'runtime default'
        return 'not configured'
      }
      if (geminiApiKey) return 'browser BYOK'
      if (config?.userKeyDefaults?.gemini) return 'user default'
      if (config?.systemKeyDefaults?.gemini) return 'system default'
      return 'not configured'
    }

    const resolveState = (provider: ProviderKey | 'openaiCompatible'): 'missing' | 'configured' | 'verified' => {
      const entry = validation[provider]
      if (entry?.status === 'valid') return 'verified'
      return resolveSource(provider) === 'not configured' ? 'missing' : 'configured'
    }

    const checks = [
      { id: 'openai', label: 'OpenAI', state: resolveState('openai'), source: resolveSource('openai') },
      { id: 'anthropic', label: 'Anthropic', state: resolveState('anthropic'), source: resolveSource('anthropic') },
      { id: 'gemini', label: 'Gemini', state: resolveState('gemini'), source: resolveSource('gemini') },
      { id: 'openrouter', label: 'OpenRouter', state: resolveState('openrouter'), source: resolveSource('openrouter') },
      { id: 'xai', label: 'xAI / Grok', state: resolveState('xai'), source: resolveSource('xai') },
    ]

    if (ollamaEnabled) {
      checks.push({
        id: 'ollama',
        label: 'Ollama',
        state: validation.ollama?.status === 'valid' ? 'verified' : resolveSource('ollama') === 'not configured' ? 'missing' : 'configured',
        source: ollamaDefaultModel.trim()
          ? `local runtime · ${ollamaDefaultModel.trim()}`
          : defaultOllamaBaseUrl
            ? `local runtime · ${defaultOllamaBaseUrl}`
            : resolveSource('ollama'),
      })
    }

    checks.push({
      id: 'openaiCompatible',
      label: 'OpenAI-Compatible',
      state: resolveState('openaiCompatible'),
      source: resolveSource('openaiCompatible'),
    })

    return checks
  }, [
    anthropicKey,
    config?.systemKeyDefaults?.anthropic,
    config?.systemKeyDefaults?.openai,
    config?.systemKeyDefaults?.openrouter,
    config?.systemKeyDefaults?.xai,
    config?.userKeyDefaults?.anthropic,
    config?.userKeyDefaults?.openai,
    config?.userKeyDefaults?.openrouter,
    config?.userKeyDefaults?.xai,
    geminiApiKey,
    hasAnthropicAvailable,
    hasGeminiAvailable,
    hasOpenAiCompatibleAvailable,
    hasOpenAiAvailable,
    ollamaDefaultModel,
    ollamaEnabled,
    openaiCompatibleBaseUrl,
    openaiKey,
    openrouterKey,
    xaiKey,
    validation,
    ollamaBaseUrl,
    defaultOllamaBaseUrl,
    config?.systemKeyDefaults?.gemini,
    config?.userKeyDefaults?.gemini,
    config?.systemKeyDefaults?.openaiCompatible,
    config?.userKeyDefaults?.openaiCompatible,
  ])

  const hostedProviderChecks = useMemo(
    () => providerChecks.filter((provider) => ['openai', 'anthropic', 'gemini', 'openrouter', 'xai'].includes(provider.id)),
    [providerChecks],
  )

  const localProviderChecks = useMemo(
    () => providerChecks.filter((provider) => ['ollama', 'openaiCompatible'].includes(provider.id)),
    [providerChecks],
  )

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

  async function refreshPartnerPluginStatuses() {
    try {
      const res = await fetch('/api/skills/partner-install/status')
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to load partner plugin status')
      setPartnerPluginStatuses(typeof data?.statuses === 'object' && data.statuses ? data.statuses : {})
    } catch {
      setPartnerPluginStatuses({})
    }
  }

  useEffect(() => {
    if (!open) return
    void refreshPartnerPluginStatuses()
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

  const refreshMailStatus = React.useCallback(async () => {
    try {
      setMailOAuthError(null)
      const [oauthStatus, grantStatus] = await Promise.all([loadMailOAuthStatus(), loadMailGrantStatus()])
      setMailOAuthStatus(oauthStatus)
      setMailGrantStatus(grantStatus)
    } catch (error: any) {
      setMailOAuthStatus(null)
      setMailOAuthError(error?.message || 'Failed to load mail connection status')
    }
  }, [])

  useEffect(() => {
    if (!open) return
    void refreshMailStatus()
  }, [open, refreshMailStatus])

  useEffect(() => {
    const handleMailOAuthComplete = (event: MessageEvent) => {
      if (event.source !== mailOAuthPopupRef.current) return
      if (event.data?.type !== 'clawmax-mail-oauth-complete') return
      mailOAuthPopupRef.current = null
      void refreshMailStatus()
      showSuccess('Mail account connected')
    }
    window.addEventListener('message', handleMailOAuthComplete)
    return () => window.removeEventListener('message', handleMailOAuthComplete)
  }, [refreshMailStatus, showSuccess])

  async function connectMailProvider(provider: 'gmail' | 'microsoft365') {
    setMailOAuthBusy(`${provider}:connect`)
    setMailOAuthError(null)
    try {
      const authorizationUrl = await beginMailOAuthConnection(provider, [
        'mail.list',
        'mail.search',
        'mail.read.metadata',
        'mail.read.body',
        'mail.draft.create',
      ])
      const popup = window.open(authorizationUrl, `clawmax-${provider}-oauth`, 'popup,width=620,height=760')
      if (!popup) throw new Error('The authorization window was blocked. Allow pop-ups for this dashboard and try again.')
      mailOAuthPopupRef.current = popup
      popup.focus()
    } catch (error: any) {
      const message = error?.message || 'Failed to start mail authorization'
      setMailOAuthError(message)
      showWarning(message)
    } finally {
      setMailOAuthBusy(null)
    }
  }

  async function refreshMailConnection(provider: 'gmail' | 'microsoft365', accountId: string) {
    setMailOAuthBusy(`${provider}:${accountId}:refresh`)
    setMailOAuthError(null)
    try {
      await refreshMailOAuthConnection(provider, accountId)
      await refreshMailStatus()
      showSuccess('Mail connection refreshed')
    } catch (error: any) {
      const message = error?.message || 'Failed to refresh mail connection'
      setMailOAuthError(message)
      showWarning(message)
    } finally {
      setMailOAuthBusy(null)
    }
  }

  async function disconnectMailConnection(provider: 'gmail' | 'microsoft365', accountId: string) {
    if (!window.confirm('Disconnect this mail account from the current workspace?')) return
    setMailOAuthBusy(`${provider}:${accountId}:disconnect`)
    setMailOAuthError(null)
    try {
      await disconnectMailOAuthConnection(provider, accountId)
      await refreshMailStatus()
      showSuccess('Mail account disconnected')
    } catch (error: any) {
      const message = error?.message || 'Failed to disconnect mail account'
      setMailOAuthError(message)
      showWarning(message)
    } finally {
      setMailOAuthBusy(null)
    }
  }

  async function authorizeMailAgent(provider: 'gmail' | 'microsoft365', accountId: string) {
    const key = `${provider}:${accountId}`
    const eligibleAgents = mailGrantStatus.agents.filter((agent) => agent.skills.includes('clawmax-mail'))
    const agentId = mailGrantAgents[key] || eligibleAgents[0]?.id || ''
    const capabilities = mailGrantCapabilities[key] || DEFAULT_MAIL_GRANT_CAPABILITIES
    if (!agentId) {
      showWarning('Assign the clawmax-mail skill to an agent before authorizing mailbox access.')
      return
    }
    setMailOAuthBusy(`${key}:grant`)
    setMailOAuthError(null)
    try {
      await createMailGrant({ agentId, provider, accountId, capabilities })
      await refreshMailStatus()
      showSuccess('Agent mail access authorized')
    } catch (error: any) {
      const message = error?.message || 'Failed to authorize agent mail access'
      setMailOAuthError(message)
      showWarning(message)
    } finally {
      setMailOAuthBusy(null)
    }
  }

  async function revokeAgentMailGrant(grantId: string) {
    setMailOAuthBusy(`grant:${grantId}:revoke`)
    setMailOAuthError(null)
    try {
      await revokeMailGrant(grantId)
      await refreshMailStatus()
      showSuccess('Agent mail access revoked')
    } catch (error: any) {
      const message = error?.message || 'Failed to revoke agent mail access'
      setMailOAuthError(message)
      showWarning(message)
    } finally {
      setMailOAuthBusy(null)
    }
  }

  const loadOllamaModels = React.useCallback(async (forceRefresh: boolean = false) => {
    if (!ollamaEnabled) {
      setOllamaModels([])
      return
    }
    const baseUrl = effectiveOllamaBaseUrl.trim()
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
  }, [effectiveOllamaBaseUrl, ollamaEnabled])

  const loadAvailableModels = React.useCallback(async (forceRefresh: boolean = false) => {
    const payload = {
      openai: openaiKey.trim(),
      anthropic: anthropicKey.trim(),
      gemini: geminiApiKey.trim(),
      openrouter: openrouterKey.trim(),
      xai: xaiKey.trim(),
      ollamaBaseUrl: ollamaEnabled ? effectiveOllamaBaseUrl.trim() : '',
      openaiCompatibleApiKey: openaiCompatibleApiKey.trim(),
      openaiCompatibleBaseUrl: openaiCompatibleBaseUrl.trim(),
      openaiCompatibleDefaultModel: openaiCompatibleDefaultModel.trim(),
    }

    setAvailableModelsLoading(true)
    try {
      const hasBrowserProviderConfig = Object.values(payload).some(Boolean)
      const usePost = forceRefresh || hasBrowserProviderConfig
      const res = await fetch(
        usePost
          ? '/api/agents/models/refresh'
          : `/api/agents/models${showAllDiscoveredModels ? '?showAll=true' : ''}`,
        usePost
          ? {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ...payload, showAll: showAllDiscoveredModels }),
            }
          : undefined
      )
      const data = res.ok ? await res.json() : null
      setModelsByProvider(data?.modelsByProvider || {})
    } catch {
      setModelsByProvider({})
    } finally {
      setAvailableModelsLoading(false)
    }
  }, [effectiveOllamaBaseUrl, geminiApiKey, anthropicKey, openaiCompatibleApiKey, openaiCompatibleBaseUrl, openaiCompatibleDefaultModel, openaiKey, openrouterKey, xaiKey, ollamaEnabled, showAllDiscoveredModels])

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
        openaiCompatibleBaseUrl ? `OpenAI-Compatible ${openaiCompatibleBaseUrl}` : null,
        anthropicKey ? `Anthropic ${maskKey(anthropicKey)}` : null,
        geminiApiKey ? `Gemini ${maskKey(geminiApiKey)}` : null,
        openrouterKey ? `OpenRouter ${maskKey(openrouterKey)}` : null,
        xaiKey ? `xAI ${maskKey(xaiKey)}` : null,
      ].filter(Boolean)
      return labels.join(' · ')
    }
    return 'No user keys configured yet'
  }, [anthropicKey, geminiApiKey, hasDefaultUserKeys, hasStoredKeys, openaiCompatibleBaseUrl, openaiKey, openrouterKey, xaiKey])

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
          if (isMailOAuthProvider(partner.slug)) {
            return (mailOAuthStatus?.providers.find((provider) => provider.provider === partner.slug)?.connections.length || 0) > 0
          }
          return hasSecret || hasValue
        })
      : hasOpenAiAvailable || hasOpenAiCompatibleAvailable || hasAnthropicAvailable || hasGeminiAvailable || hasOpenrouterAvailable || hasXaiAvailable || (ollamaEnabled && ollamaConfigured)

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
    return `Base URL: ${effectiveOllamaBaseUrl}${ollamaDefaultModel ? ` · default: ${ollamaDefaultModel}` : ''}`
  }, [effectiveOllamaBaseUrl, ollamaConfigured, ollamaDefaultModel])

  const openAiCompatibleModels = useMemo(
    () => (modelsByProvider['openai-compatible']?.models || []).map((model) => model.replace(/^openai-compatible\//, '')),
    [modelsByProvider]
  )
  const resendTestRecipient = useMemo(() => resolveResendTestRecipientEmail(user), [user])
  const allowResendRecipientOverride = deploymentKind === 'local' || deploymentKind === 'onprem'
  const effectiveResendTestRecipient = allowResendRecipientOverride
    ? (resendTestTo.trim() || resendTestRecipient)
    : resendTestRecipient

  if (!hydrated) return null
  if (!user && !config?.authDisabled) return null

  const runValidation = async (scope: ScopedValidationTarget = 'all') => {
    const currentPartnerSlug = step.startsWith('partner:') ? step.replace('partner:', '') : null
    const providerScope = scope === 'openai' || scope === 'openaiCompatible' || scope === 'anthropic' || scope === 'gemini' || scope === 'openrouter' || scope === 'xai' || scope === 'ollama' ? scope : null
    const scopedPayload = {
      openai: scope === 'all' || providerScope === 'openai' ? openaiKey.trim() : '',
      openaiCompatibleApiKey: scope === 'all' || providerScope === 'openaiCompatible' ? openaiCompatibleApiKey.trim() : '',
      openaiCompatibleBaseUrl: scope === 'all' || providerScope === 'openaiCompatible' ? openaiCompatibleBaseUrl.trim() : '',
      openaiCompatibleDefaultModel: scope === 'all' || providerScope === 'openaiCompatible' ? openaiCompatibleDefaultModel.trim() : '',
      anthropic: scope === 'all' || providerScope === 'anthropic' ? anthropicKey.trim() : '',
      gemini: scope === 'all' || providerScope === 'gemini' ? geminiApiKey.trim() : '',
      openrouter: scope === 'all' || providerScope === 'openrouter' ? openrouterKey.trim() : '',
      xai: scope === 'all' || providerScope === 'xai' ? xaiKey.trim() : '',
      ollamaBaseUrl: (scope === 'all' || providerScope === 'ollama') && ollamaEnabled ? effectiveOllamaBaseUrl.trim() : '',
      ollamaDefaultModel: (scope === 'all' || providerScope === 'ollama') && ollamaEnabled ? ollamaDefaultModel.trim() : '',
      opikApiKey: scope === 'all' || currentPartnerSlug === 'opik' ? opikApiKey.trim() : '',
      opikWorkspace: scope === 'all' || currentPartnerSlug === 'opik' ? opikWorkspace.trim() : '',
      opikProject: scope === 'all' || currentPartnerSlug === 'opik' ? opikProject.trim() : '',
      sensoApiKey: scope === 'all' || currentPartnerSlug === 'senso' ? getPartnerSecret('senso', 'apiKey').trim() : '',
      cogneeApiKey: scope === 'all' || currentPartnerSlug === 'cognee' ? getPartnerSecret('cognee', 'apiKey').trim() : '',
      cogneeBaseUrl: scope === 'all' || currentPartnerSlug === 'cognee' ? getPartnerValue('cognee', 'baseUrl').trim() : '',
      cogneeDatasetName: scope === 'all' || currentPartnerSlug === 'cognee' ? getPartnerValue('cognee', 'datasetName').trim() : '',
      cogneeSearchType: scope === 'all' || currentPartnerSlug === 'cognee' ? getPartnerValue('cognee', 'searchType').trim() : '',
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
    if (providerScope === 'openaiCompatible' && !scopedPayload.openaiCompatibleBaseUrl) {
      setValidation((current) => ({ ...current, openaiCompatible: { status: 'invalid', message: 'No OpenAI-compatible Base URL provided' } }))
      showWarning('No OpenAI-compatible Base URL provided')
      return false
    }
    if (providerScope === 'gemini' && !scopedPayload.gemini) {
      setValidation((current) => ({ ...current, gemini: { status: 'invalid', message: 'No Gemini key provided' } }))
      showWarning('No Gemini key provided')
      return false
    }
    if (providerScope === 'openrouter' && !scopedPayload.openrouter) {
      setValidation((current) => ({ ...current, openrouter: { status: 'invalid', message: 'No OpenRouter key provided' } }))
      showWarning('No OpenRouter key provided')
      return false
    }
    if (providerScope === 'xai' && !scopedPayload.xai) {
      setValidation((current) => ({ ...current, xai: { status: 'invalid', message: 'No xAI key provided' } }))
      showWarning('No xAI key provided')
      return false
    }
    const localProviderMismatches = [
      scopedPayload.openai ? detectProviderKeyMismatch('openai', scopedPayload.openai) : null,
      scopedPayload.anthropic ? detectProviderKeyMismatch('anthropic', scopedPayload.anthropic) : null,
      scopedPayload.gemini ? detectProviderKeyMismatch('gemini', scopedPayload.gemini) : null,
      scopedPayload.openrouter ? detectProviderKeyMismatch('openrouter', scopedPayload.openrouter) : null,
      scopedPayload.xai ? detectProviderKeyMismatch('xai', scopedPayload.xai) : null,
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
    if (scope === 'current-partner' && currentPartnerSlug === 'cognee') {
      if (!hasCogneeConfiguration({
        apiKey: scopedPayload.cogneeApiKey,
        baseUrl: scopedPayload.cogneeBaseUrl,
        datasetName: scopedPayload.cogneeDatasetName,
        searchType: scopedPayload.cogneeSearchType,
        serverApiKeyPresent: hasServerPartnerSecret('cognee', 'apiKey'),
      })) {
        const message = 'Add a Cognee API key for Cloud, or a self-hosted Cognee Base URL, before checking Cognee.'
        setValidation((current) => ({ ...current, cognee: { status: 'invalid', message } }))
        showWarning(message)
        return false
      }
    }
    if (scope === 'current-partner' && currentPartnerSlug === 'digo') {
      const apiUrl = getPartnerValue('digo', 'apiUrl').trim()
      const hasApiKey = Boolean(getPartnerSecret('digo', 'apiKey').trim() || hasServerPartnerSecret('digo', 'apiKey'))
      const message = !/^https:\/\//i.test(apiUrl)
        ? 'Enter an HTTPS Digo ingestion API URL before checking Digo.'
        : !hasApiKey
          ? 'Enter a Digo API key before checking Digo.'
          : 'Digo endpoint and server-managed API key are configured. A user consent is still required before delivery.'
      const status = /^https:\/\//i.test(apiUrl) && hasApiKey ? 'valid' : 'invalid'
      setValidation((current) => ({ ...current, digo: { status, message } }))
      if (status === 'valid') showSuccess('Digo connection settings are ready')
      else showWarning(message)
      return status === 'valid'
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
          openaiCompatible: { status: 'skipped', message: 'Validation unavailable from the current server build' },
          anthropic: { status: 'skipped', message: 'Validation unavailable from the current server build' },
          gemini: { status: 'skipped', message: 'Validation unavailable from the current server build' },
          openrouter: { status: 'skipped', message: 'Validation unavailable from the current server build' },
          xai: { status: 'skipped', message: 'Validation unavailable from the current server build' },
          ollama: { status: 'skipped', message: 'Validation unavailable from the current server build' },
          opik: { status: 'skipped', message: 'Validation unavailable from the current server build' },
          senso: { status: 'skipped', message: 'Validation unavailable from the current server build' },
          cognee: { status: 'skipped', message: 'Validation unavailable from the current server build' },
          digo: { status: 'skipped', message: 'Validation unavailable from the current server build' },
        })
        showInfo('Integration validation is unavailable on the current server build. Saving local settings without blocking.')
        return true
      }
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to validate integrations')
      const nextState: ValidationState = {
        openai: { status: data.openai?.status || 'idle', message: data.openai?.message || '' },
        openaiCompatible: { status: data.openaiCompatible?.status || 'idle', message: data.openaiCompatible?.message || '' },
        anthropic: { status: data.anthropic?.status || 'idle', message: data.anthropic?.message || '' },
        gemini: { status: data.gemini?.status || 'idle', message: data.gemini?.message || '' },
        openrouter: { status: data.openrouter?.status || 'idle', message: data.openrouter?.message || '' },
        xai: { status: data.xai?.status || 'idle', message: data.xai?.message || '' },
        ollama: ollamaEnabled
          ? { status: data.ollama?.status || 'idle', message: data.ollama?.message || '' }
          : { status: 'skipped', message: 'Ollama is disabled in this runtime' },
        opik: { status: data.opik?.status || 'idle', message: data.opik?.message || '' },
        senso: { status: data.senso?.status || 'idle', message: data.senso?.message || '' },
        cognee: { status: data.cognee?.status || 'idle', message: data.cognee?.message || '' },
        digo: { status: data.digo?.status || 'idle', message: data.digo?.message || '' },
      }
      setValidation(nextState)
      updateStoredVerification((current) => {
        const next = { ...current }
        ;(['openai', 'openaiCompatible', 'anthropic', 'gemini', 'openrouter', 'xai', 'ollama'] as const).forEach((provider) => {
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
      openaiCompatible: 'OpenAI-Compatible',
      anthropic: 'Anthropic',
      gemini: 'Gemini',
      openrouter: 'OpenRouter',
      xai: 'xAI',
      ollama: 'Ollama',
      opik: 'Opik',
      senso: 'Senso',
      cognee: 'Cognee',
    }
    return labels[slug] || slug
  }

  const clearProviderKey = (provider: 'openai' | 'openaiCompatible' | 'anthropic' | 'gemini' | 'openrouter' | 'xai' | 'ollama') => {
    if (provider === 'openai') {
      setOpenaiKey('')
      setValidation((current) => ({ ...current, openai: { status: 'idle', message: '' } }))
      updateStoredVerification((current) => { const next = { ...current }; delete next.openai; return next })
      return
    }
    if (provider === 'openaiCompatible') {
      setOpenaiCompatibleApiKey('')
      setOpenaiCompatibleBaseUrl(defaultOpenAiCompatibleBaseUrl)
      setOpenaiCompatibleDefaultModel('')
      setValidation((current) => ({ ...current, openaiCompatible: { status: 'idle', message: '' } }))
      updateStoredVerification((current) => { const next = { ...current }; delete next.openaiCompatible; return next })
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
    if (provider === 'openrouter') {
      setOpenrouterKey('')
      setValidation((current) => ({ ...current, openrouter: { status: 'idle', message: '' } }))
      updateStoredVerification((current) => { const next = { ...current }; delete next.openrouter; return next })
      return
    }
    if (provider === 'xai') {
      setXaiKey('')
      setValidation((current) => ({ ...current, xai: { status: 'idle', message: '' } }))
      updateStoredVerification((current) => { const next = { ...current }; delete next.xai; return next })
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
      detectProviderKeyMismatch('openrouter', openrouterKey),
      detectProviderKeyMismatch('xai', xaiKey),
    ].filter(Boolean)
    if (providerMismatches.length > 0) {
      showWarning(providerMismatches[0]!.message)
      return
    }

    if (shouldAutoValidateByokOnSave()) {
      const ok = await runValidation()
      if (!ok) return
    }
    if (!openaiKey.trim() && !openaiCompatibleBaseUrl.trim() && !anthropicKey.trim() && !geminiApiKey.trim() && !openrouterKey.trim() && !xaiKey.trim() && !config?.userKeyDefaults?.openai && !config?.userKeyDefaults?.openaiCompatible && !config?.userKeyDefaults?.anthropic && !config?.userKeyDefaults?.gemini && !config?.userKeyDefaults?.openrouter && !config?.userKeyDefaults?.xai && !config?.systemKeyDefaults?.openai && !config?.systemKeyDefaults?.openaiCompatible && !config?.systemKeyDefaults?.anthropic && !config?.systemKeyDefaults?.gemini && !config?.systemKeyDefaults?.openrouter && !config?.systemKeyDefaults?.xai) {
      showWarning('No LLM providers detected yet. Add OpenAI, OpenRouter, xAI, OpenAI-Compatible, Anthropic, or Gemini, or rely on configured defaults before running agents.')
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
    const serverPartnerSecrets = Object.fromEntries(
      visiblePartnerDefinitions.map((partner) => {
        const allowedSecretKeys = new Set(
          (partner.fields || [])
            .filter((field) => field.secret && field.storage === 'server')
            .map((field) => field.key)
        )
        const values = Object.fromEntries(
          Object.entries(persistedPartnerSecrets[partner.slug] || {})
            .filter(([key]) => allowedSecretKeys.has(key))
        )
        return [partner.slug, values]
      }).filter(([, values]) => Object.keys(values as Record<string, string>).length > 0)
    )
    const providerKeyValues = {
      openai: openaiKey.trim(),
      openaiCompatibleApiKey: openaiCompatibleApiKey.trim(),
      openaiCompatibleBaseUrl: openaiCompatibleBaseUrl.trim(),
      openaiCompatibleDefaultModel: openaiCompatibleDefaultModel.trim(),
      anthropic: anthropicKey.trim(),
      gemini: geminiApiKey.trim(),
      openrouter: openrouterKey.trim(),
      xai: xaiKey.trim(),
      ollamaBaseUrl: effectiveOllamaBaseUrl.trim(),
    }
    const currentStoredKeys = readStoredByokKeys()

    writeStoredByokKeys({
      openai: providerKeyValues.openai,
      openaiCompatibleApiKey: providerKeyValues.openaiCompatibleApiKey,
      openaiCompatibleBaseUrl: providerKeyValues.openaiCompatibleBaseUrl,
      openaiCompatibleDefaultModel: providerKeyValues.openaiCompatibleDefaultModel,
      anthropic: providerKeyValues.anthropic,
      geminiApiKey: providerKeyValues.gemini,
      openrouter: providerKeyValues.openrouter,
      xai: providerKeyValues.xai,
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
      systemPreferredModel: systemPreferredModel || undefined,
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
        systemPreferredModel: systemPreferredModel || undefined,
        githubDefaultRepo: githubDefaultRepo.trim() || undefined,
        sensoContextLabel: sensoContextLabel.trim() || undefined,
        ollamaBaseUrl: ollamaEnabled ? (effectiveOllamaBaseUrl.trim() || undefined) : undefined,
        ollamaDefaultModel: ollamaEnabled ? (ollamaDefaultModel.trim() || undefined) : undefined,
        openaiCompatibleBaseUrl: openaiCompatibleBaseUrl.trim() || undefined,
        openaiCompatibleDefaultModel: openaiCompatibleDefaultModel.trim() || undefined,
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
    if (!entry || entry.status === 'idle') return null
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

  const buildPreferredOptions = (currentValue: string) => {
    const discoveredPreferredOptions = [
      ...((modelsByProvider.openai?.models || [])
        .filter((model) => isSelectableLifecycleModel(model, currentValue))
        .map((model) => ({ value: model, label: `${formatOpenAiModelLabel(model).replace(/^openai\//, '')} (OpenAI)` }))),
      ...((modelsByProvider.anthropic?.models || [])
        .filter((model) => isSelectableLifecycleModel(model, currentValue))
        .map((model) => ({ value: model, label: `${formatOpenAiModelLabel(model).replace(/^anthropic\//, '')} (Anthropic)` }))),
      ...((modelsByProvider.gemini?.models || [])
        .filter((model) => isSelectableLifecycleModel(model, currentValue))
        .map((model) => ({ value: model, label: `${formatOpenAiModelLabel(model).replace(/^google\//, '').replace(/^gemini\//, '')} (Gemini)` }))),
      ...((modelsByProvider.openrouter?.models || [])
        .map((model) => ({ value: model, label: `${model.replace(/^openrouter\//, '')} (OpenRouter)` }))),
      ...((modelsByProvider.ollama?.models || []).map((model) => ({ value: model, label: `${model.replace(/^ollama\//, '')} (Ollama)` }))),
      ...((modelsByProvider['openai-compatible']?.models || [])
        .filter((model) => isSelectableLifecycleModel(model, currentValue))
        .map((model) => ({ value: model, label: `${formatOpenAiModelLabel(model).replace(/^openai-compatible\//, '')} (OpenAI-Compatible)` }))),
    ]
    return discoveredPreferredOptions.filter((option, index, arr) =>
      arr.findIndex((candidate) => candidate.value === option.value) === index
    )
  }
  const uniquePreferredOptions = buildPreferredOptions(preferredModel)
  const uniqueSystemPreferredOptions = buildPreferredOptions(systemPreferredModel).filter((option, index, arr) =>
    arr.findIndex((candidate) => candidate.value === option.value) === index
  )

  const currentStepIndex = stepOrder.indexOf(step)
  const preferredModelDeprecation = formatOpenAiDeprecationNotice(preferredModel)
  const systemPreferredModelDeprecation = formatOpenAiDeprecationNotice(systemPreferredModel)
  const currentPartner = step.startsWith('partner:')
    ? visiblePartnerDefinitions.find((partner) => partner.slug === step.replace(/^partner:/, ''))
    : null
  const currentMailProviderStatus = currentPartner && isMailOAuthProvider(currentPartner.slug)
    ? mailOAuthStatus?.providers.find((provider) => provider.provider === currentPartner.slug)
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

  const sendResendTestEmail = async () => {
    const to = effectiveResendTestRecipient
    if (!to) {
      showWarning(
        allowResendRecipientOverride
          ? 'Add a recipient email before sending a Resend test email.'
          : 'Your authenticated session does not include an email address for the Resend test recipient.',
      )
      return
    }
    if (!hasServerPartnerSecret('resend', 'apiKey')) {
      showWarning('Save the Resend API key for this workspace before sending a test email.')
      return
    }

    setResendTestSending(true)
    try {
      const response = await fetch('/api/integrations/resend/test-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to,
          subject: resendTestSubject.trim() || undefined,
          text: resendTestBody.trim() || undefined,
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Failed to send Resend test email')
      showSuccess(data.id ? `Resend accepted test email (${data.id})` : 'Resend accepted test email')
    } catch (err: any) {
      showWarning(err?.message || 'Failed to send Resend test email')
    } finally {
      setResendTestSending(false)
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
    if (partner.skills?.mode === 'planned') {
      return partner.skills.label || 'Public partner integration preview; connection is not enabled yet.'
    }
    if (partner.slug === 'senso') {
      return sensoConfigured
        ? `Configured ${maskKey(getPartnerSecret('senso', 'apiKey'))}${sensoContextLabel ? ` · context: ${sensoContextLabel}` : ''}`
        : 'Not configured — workspace files remain the default shared context layer'
    }
    if (partner.slug === 'opik') return opikConfigured ? monitoringStatusText : 'Not configured — runtime tracing still requires server-side OPIK_API_KEY, while this UI can store Opik workspace/project defaults'
    if (partner.slug === 'github') {
      if (githubMode === 'token') {
        return githubReady
          ? 'GitHub token-based issue workflows look ready in this runtime.'
          : 'GitHub token mode is active, but a default repository is still needed for issue workflows.'
      }
      return githubReady ? 'GitHub CLI-based issue workflows look ready in this runtime.' : 'GitHub delivery workflows need auth in the current runtime.'
    }
    if (partner.slug === 'cognee') {
      const hasSecret = getPartnerSecret('cognee', 'apiKey').trim() || hasServerPartnerSecret('cognee', 'apiKey')
      const baseUrl = getPartnerValue('cognee', 'baseUrl').trim()
      const dataset = getPartnerValue('cognee', 'datasetName').trim()
      const parts = [
        hasSecret ? 'API key configured' : '',
        baseUrl ? `base URL: ${baseUrl}` : '',
        dataset ? `dataset: ${dataset}` : '',
      ].filter(Boolean)
      return parts.length > 0
        ? parts.join(' · ')
        : 'Not configured — workspace files remain the default memory/context layer'
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
    if (partner.slug === 'cognee') {
      return (
        <>
          Use Cognee for durable agent memory, semantic recall, and shared context across teams. Configure <span className="font-mono">COGNEE_API_KEY</span> for Cognee Cloud, or set a self-hosted <span className="font-mono">COGNEE_BASE_URL</span> and optional dataset defaults.
        </>
      )
    }
    return partner.description
  }

  async function runPartnerPluginAction(partner: PartnerDefinition, action: PartnerPluginAction) {
    if (!partner.skills?.commandId) return
    const endpoint = action === 'install' ? '/api/skills/partner-install' : '/api/skills/partner-uninstall'
    const actionLabel = action === 'install' ? 'Install' : 'Uninstall'
    const presentParticiple = action === 'install' ? 'Installing' : 'Uninstalling'

    setPartnerInstallState((current) => ({ ...current, [partner.slug]: action === 'install' ? 'installing' : 'uninstalling' }))
    setPartnerPluginRun({
      slug: partner.slug,
      name: partner.name,
      action,
      status: 'running',
      logs: [
        `# ${actionLabel} ${partner.name} partner plugin`,
        `${presentParticiple} via the dashboard's curated OpenClaw plugin allowlist...`,
        'Waiting for OpenClaw command output...',
      ],
    })

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commandId: partner.skills.commandId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.detail || data.error || `Failed to ${action} ${partner.name} plugin`)
      const nextLogs = [
        `# ${actionLabel} ${partner.name} partner plugin`,
        data.command ? `$ ${data.command}` : `${presentParticiple} partner plugin...`,
      ]
      if (data.stdout) nextLogs.push(data.stdout)
      if (data.stderr) nextLogs.push(data.stderr)
      nextLogs.push(`✓ ${actionLabel} completed for ${partner.name}`)
      setPartnerPluginRun({
        slug: partner.slug,
        name: partner.name,
        action,
        status: 'success',
        logs: nextLogs,
      })
      if (action === 'install') {
        showSuccess(`${partner.name} plugin installed`)
      } else {
        showSuccess(`${partner.name} plugin uninstalled`)
      }
      await refreshPartnerPluginStatuses()
    } catch (err: any) {
      const message = err.message || `Failed to ${action} ${partner.name} plugin`
      setPartnerPluginRun((current) => ({
        slug: partner.slug,
        name: partner.name,
        action,
        status: 'error',
        logs: [
          ...(current?.logs || [`# ${actionLabel} ${partner.name} partner plugin`]),
          `✗ ${message}`,
        ],
        error: message,
      }))
      showWarning(message)
    } finally {
      setPartnerInstallState((current) => ({ ...current, [partner.slug]: 'idle' }))
    }
  }

  function confirmPartnerPluginUninstall(partner: PartnerDefinition) {
    if (!partner.skills?.commandId) return
    setPartnerPluginRun({
      slug: partner.slug,
      name: partner.name,
      action: 'uninstall',
      status: 'confirming',
      logs: [
        `# Uninstall ${partner.name} partner plugin`,
        'This will remove the OpenClaw plugin install record and plugin files for this runtime.',
        'Choose Uninstall to continue, or Cancel to leave it installed.',
      ],
    })
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
      const running = partnerInstallState[partner.slug] === 'installing' || partnerInstallState[partner.slug] === 'uninstalling'
      const status = partner.skills.commandId ? partnerPluginStatuses[partner.skills.commandId] : undefined
      const installed = !!status?.installed
      return (
        <div className="mt-2 flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="min-w-[12rem] flex-1 text-xs opacity-80">
            {partner.skills.label || 'Curated skill install available'}.
            <span className="ml-1">Usually takes 1-3 minutes.</span>
            <span className="ml-1 font-medium">This installs an OpenClaw runtime plugin, not an agent skill or ClawMax dashboard plugin.</span>
          </div>
          {installed && (
            <span className="px-2.5 py-1 text-[11px] rounded-md border border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500">
              Installed
            </span>
          )}
          <button
            type="button"
            disabled={running || installed}
            title={installed ? `${partner.name} plugin is already installed` : undefined}
            onClick={() => void runPartnerPluginAction(partner, 'install')}
            className="px-2.5 py-1 text-[11px] rounded-md border border-sky-300 dark:border-sky-700 text-sky-700 dark:text-sky-300 hover:bg-sky-50 dark:hover:bg-sky-900/20 transition-colors disabled:opacity-60"
          >
            {partnerInstallState[partner.slug] === 'installing' ? 'Installing…' : 'Install OpenClaw Plugin'}
          </button>
          <button
            type="button"
            disabled={running || !installed}
            title={!installed ? `${partner.name} plugin is not installed` : undefined}
            onClick={() => confirmPartnerPluginUninstall(partner)}
            className="px-2.5 py-1 text-[11px] rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-60"
          >
            {partnerInstallState[partner.slug] === 'uninstalling' ? 'Uninstalling…' : 'Uninstall'}
          </button>
        </div>
      )
    }
    if (partner.skills.mode === 'planned') {
      return <div className="mt-2 text-xs opacity-80">{partner.skills.label || 'Partner skills are planned.'}</div>
    }
    return null
  }

  const renderResendTestEmailPanel = () => {
    const hasSavedKey = hasServerPartnerSecret('resend', 'apiKey')
    const canSendTest = hasSavedKey && Boolean(effectiveResendTestRecipient)
    return (
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="font-medium text-gray-900 dark:text-gray-100">Send test email</div>
            <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Uses the workspace-managed <span className="font-mono">RESEND_API_KEY</span> directly from the dashboard. This validates Resend delivery without entering the agent chat session.
            </div>
          </div>
          <span className={`inline-flex w-fit rounded-full px-2.5 py-1 text-[11px] font-medium ${
            hasSavedKey
              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300'
              : 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300'
          }`}>
            {hasSavedKey ? 'API key saved' : 'Save key first'}
          </span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">To</label>
            <input
              type="email"
              value={effectiveResendTestRecipient}
              readOnly={!allowResendRecipientOverride}
              aria-readonly={allowResendRecipientOverride ? undefined : 'true'}
              onChange={(e) => setResendTestTo(e.target.value)}
              placeholder={allowResendRecipientOverride ? 'recipient@example.com' : 'Authenticated user email required'}
              className={`w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:text-gray-200 ${
                allowResendRecipientOverride
                  ? 'bg-white text-gray-900 dark:bg-gray-950 dark:text-gray-100'
                  : 'cursor-not-allowed bg-gray-50 text-gray-700 dark:bg-gray-950/70'
              }`}
            />
            <div className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
              {allowResendRecipientOverride
                ? 'Local dev mode allows overriding the recipient. If left blank, the signed-in email is used.'
                : 'Cloud-hosted runtimes lock test emails to the signed-in user.'}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">From</label>
            <input
              type="email"
              value={DEFAULT_RESEND_TEST_SENDER}
              readOnly
              aria-readonly="true"
              className="w-full cursor-not-allowed rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-700 dark:border-gray-600 dark:bg-gray-950/70 dark:text-gray-200"
            />
            <div className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
              Resend test email uses the default ClawMax sender. Sender policy stays backend-managed for now.
            </div>
          </div>
        </div>
        <div className="mt-3">
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Subject</label>
          <input
            type="text"
            value={resendTestSubject}
            onChange={(e) => setResendTestSubject(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-950 dark:text-gray-100"
          />
        </div>
        <div className="mt-3">
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Body</label>
          <textarea
            value={resendTestBody}
            onChange={(e) => setResendTestBody(e.target.value)}
            rows={3}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-950 dark:text-gray-100"
          />
        </div>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={() => void sendResendTestEmail()}
            disabled={resendTestSending || !canSendTest}
            className="px-4 py-2 text-sm rounded-md bg-sky-600 text-white hover:bg-sky-700 transition-colors disabled:opacity-60"
          >
            {resendTestSending ? 'Sending…' : 'Send Test Email'}
          </button>
        </div>
      </div>
    )
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
      : partner.slug === 'cognee' && field.key === 'baseUrl' ? 'https://api.cognee.ai or http://localhost:8000'
      : partner.slug === 'cognee' && field.key === 'datasetName' ? 'e.g. clawmax-workspace'
      : partner.slug === 'cognee' && field.key === 'searchType' ? 'e.g. GRAPH_COMPLETION'
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
        <div className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-2 sm:p-4">
          <div className="w-full max-w-3xl rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-2xl p-4 sm:p-5 max-h-[96dvh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3 sm:gap-4">
              <div className="min-w-0">
                <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {initialStep === 'partners' ? 'Partner Integrations' : 'Models & Partner Integrations'}
                </div>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {initialStep === 'partners'
                    ? 'Choose and configure independent, optional integrations for this workspace.'
                    : 'Provider secrets stay local to this browser. Workspace defaults persist per workspace for template apply and runtime follow-through.'}
                </p>
              </div>
              <button
                onClick={() => { setOpen(false); setStep(initialStep) }}
                className="shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1"
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
                <div className="mt-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-4 text-sm text-gray-600 dark:text-gray-300">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="font-medium text-gray-900 dark:text-gray-100">Model providers (BYOK)</div>
                      <div className="mt-1 text-sm">
                        System keys may be limited or unavailable. Bring Your Own Keys (BYOK) to ensure your agents can run with the models and providers you choose, billed to your own account.
                      </div>
                    </div>
                    <div className="text-xs opacity-80 max-w-xl sm:text-right">
                      We support broad model choice, but results vary by provider and version. Start with recommended defaults.
                    </div>
                  </div>
                  <div className="mt-3 text-sm">
                    <span className="font-medium text-gray-900 dark:text-gray-100">Current configured LLM providers:</span>{' '}
                    {statusText}
                  </div>
                  {browserLocalKeysNotice && (
                    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-100">
                      {browserLocalKeysNotice}
                    </div>
                  )}
                  <div className="mt-3 space-y-4">
                    <div>
                      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">
                        Hosted
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {hostedProviderChecks.map((provider) => (
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

                    <div>
                      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">
                        Local / Self-Hosted
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {localProviderChecks.map((provider) => (
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
                  </div>
                </div>

                <div className="mt-4 space-y-4">
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

                  {modelTab === 'openrouter' && (
                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900">
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-medium text-gray-900 dark:text-gray-100">OpenRouter</div>
                        <button onClick={() => runValidation('openrouter')} disabled={validating} className="px-3 py-1.5 text-xs rounded-md border border-sky-300 dark:border-sky-700 text-sky-700 dark:text-sky-300 hover:bg-sky-50 dark:hover:bg-sky-900/20 transition-colors disabled:opacity-60">{validating ? 'Checking…' : 'Check Key'}</button>
                      </div>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Use one hosted gateway key with native <span className="font-mono">openrouter/provider/model</span> routing and live model discovery.</p>
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <label htmlFor="byok-openrouter" className="block text-sm font-medium text-gray-700 dark:text-gray-300">API key</label>
                        {openrouterKey && (
                          <button type="button" onClick={() => clearProviderKey('openrouter')} className="text-xs text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-300">
                            Clear
                          </button>
                        )}
                      </div>
                      <input id="byok-openrouter" type="password" value={openrouterKey} onChange={(e) => { setOpenrouterKey(e.target.value); setValidation((current) => ({ ...current, openrouter: { status: 'idle', message: '' } })); updateStoredVerification((current) => { const next = { ...current }; delete next.openrouter; return next }) }} placeholder="sk-or-..." className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100" />
                      {renderValidation('openrouter')}
                    </div>
                  )}

                  {modelTab === 'xai' && (
                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900">
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-medium text-gray-900 dark:text-gray-100">xAI / Grok</div>
                        <button onClick={() => runValidation('xai')} disabled={validating} className="px-3 py-1.5 text-xs rounded-md border border-sky-300 dark:border-sky-700 text-sky-700 dark:text-sky-300 hover:bg-sky-50 dark:hover:bg-sky-900/20 transition-colors disabled:opacity-60">{validating ? 'Checking…' : 'Check Key'}</button>
                      </div>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Use native <span className="font-mono">xai/grok-*</span> routing. Only models verified against this ClawMax OpenClaw runtime are shown.</p>
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <label htmlFor="byok-xai" className="block text-sm font-medium text-gray-700 dark:text-gray-300">API key</label>
                        {xaiKey && (
                          <button type="button" onClick={() => clearProviderKey('xai')} className="text-xs text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-300">
                            Clear
                          </button>
                        )}
                      </div>
                      <input id="byok-xai" type="password" value={xaiKey} onChange={(e) => { setXaiKey(e.target.value); setValidation((current) => ({ ...current, xai: { status: 'idle', message: '' } })); updateStoredVerification((current) => { const next = { ...current }; delete next.xai; return next }) }} placeholder="xai-..." className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100" />
                      {renderValidation('xai')}
                    </div>
                  )}

                  {modelTab === 'openaiCompatible' && (
                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900">
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-medium text-gray-900 dark:text-gray-100">OpenAI-Compatible</div>
                        <button onClick={() => runValidation('openaiCompatible')} disabled={validating} className="px-3 py-1.5 text-xs rounded-md border border-sky-300 dark:border-sky-700 text-sky-700 dark:text-sky-300 hover:bg-sky-50 dark:hover:bg-sky-900/20 transition-colors disabled:opacity-60">{validating ? 'Checking…' : 'Check Connection'}</button>
                      </div>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Use this for LM Studio and other OpenAI-style APIs that expose <span className="font-mono">/v1/models</span> and <span className="font-mono">/v1/chat/completions</span>.</p>
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <label htmlFor="byok-openai-compatible-url" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Base URL</label>
                        {(openaiCompatibleBaseUrl || openaiCompatibleApiKey || openaiCompatibleDefaultModel) && (
                          <button type="button" onClick={() => clearProviderKey('openaiCompatible')} className="text-xs text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-300">
                            Clear
                          </button>
                        )}
                      </div>
                      <input id="byok-openai-compatible-url" type="text" value={openaiCompatibleBaseUrl} onChange={(e) => { setOpenaiCompatibleBaseUrl(e.target.value); setValidation((current) => ({ ...current, openaiCompatible: { status: 'idle', message: '' } })); updateStoredVerification((current) => { const next = { ...current }; delete next.openaiCompatible; return next }) }} placeholder={defaultOpenAiCompatibleBaseUrl} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100" />
                      <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                        {deploymentKind === 'onprem'
                          ? 'If LM Studio runs on the same Mac as this containerized runtime, use host.containers.internal instead of 127.0.0.1.'
                          : 'If LM Studio runs locally on this machine, 127.0.0.1 usually works. For a separate host, use that machine’s reachable LAN address.'}
                      </div>
                      <div className="mt-3">
                        <label htmlFor="byok-openai-compatible-key" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">API key <span className="text-gray-400">(optional)</span></label>
                        <input id="byok-openai-compatible-key" type="password" value={openaiCompatibleApiKey} onChange={(e) => { setOpenaiCompatibleApiKey(e.target.value); setValidation((current) => ({ ...current, openaiCompatible: { status: 'idle', message: '' } })); updateStoredVerification((current) => { const next = { ...current }; delete next.openaiCompatible; return next }) }} placeholder="Optional or dummy key if required by your server" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100" />
                      </div>
                      <div className="mt-3">
                        <label htmlFor="byok-openai-compatible-model" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Default model <span className="text-gray-400">(optional)</span></label>
                        <input id="byok-openai-compatible-model" type="text" value={openaiCompatibleDefaultModel} onChange={(e) => { setOpenaiCompatibleDefaultModel(e.target.value); setValidation((current) => ({ ...current, openaiCompatible: { status: 'idle', message: '' } })); updateStoredVerification((current) => { const next = { ...current }; delete next.openaiCompatible; return next }) }} placeholder="e.g. llama-3.1-8b-instruct" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100" />
                      </div>
                      <div className="mt-3 rounded-md border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-800/70 px-3 py-2">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-xs font-medium text-gray-700 dark:text-gray-300">Discovered OpenAI-compatible models</div>
                          <div className="flex items-center gap-2">
                            {availableModelsLoading && <div className="text-[11px] text-gray-500 dark:text-gray-400">Loading…</div>}
                            <button type="button" onClick={() => void loadAvailableModels(true)} className="text-[11px] text-sky-600 hover:text-sky-700 dark:text-sky-400 dark:hover:text-sky-300">Refresh</button>
                          </div>
                        </div>
                        <label className="mt-2 flex items-center gap-2 text-[11px] text-gray-600 dark:text-gray-400">
                          <input
                            type="checkbox"
                            checked={showAllDiscoveredModels}
                            onChange={(e) => setShowAllDiscoveredModels(e.target.checked)}
                            className="rounded border-gray-300 text-sky-600 focus:ring-sky-500"
                          />
                          Load all discovered models, including embeddings and other advanced endpoint-specific types
                        </label>
                        {openAiCompatibleModels.length > 0 ? (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {openAiCompatibleModels.map((model) => {
                              const selected = openaiCompatibleDefaultModel.trim() === model
                              return (
                                <button
                                  key={model}
                                  type="button"
                                  onClick={() => {
                                    setOpenaiCompatibleDefaultModel(model)
                                    setValidation((current) => ({ ...current, openaiCompatible: { status: 'idle', message: '' } }))
                                    updateStoredVerification((current) => { const next = { ...current }; delete next.openaiCompatible; return next })
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
                            {availableModelsLoading
                              ? 'Checking the OpenAI-compatible endpoint for available models…'
                              : showAllDiscoveredModels
                                ? 'No models were discovered yet. Check the base URL, confirm the endpoint exposes /v1/models, then refresh.'
                                : 'No chat-capable models were discovered yet. Check the base URL, confirm the endpoint exposes /v1/models, or enable "Load all discovered models" to inspect everything returned.'}
                          </div>
                        )}
                      </div>
                      {renderValidation('openaiCompatible')}
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
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Default model for newly created agents</label>
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
                                <option value="openai/gpt-5.4">GPT-5.4</option>
                                <option value="openai/gpt-5.4-mini">GPT-5.4 Mini (cost efficient)</option>
                                <option value="openai/gpt-5.4-nano">GPT-5.4 Nano</option>
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
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">This controls the Add Agent wizard and agent template apply flows. Discovered provider models appear here automatically when available.</p>
                      {preferredModelDeprecation && (
                        <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">{preferredModelDeprecation}</p>
                      )}
                      {highlightPreferredModel && (
                        <div className="mt-2 text-xs font-medium text-purple-700 dark:text-purple-300">
                          Set this once for shared background execution in this workspace.
                        </div>
                      )}
                    </div>
                  )}
                  {(hasOpenAiAvailable || hasAnthropicAvailable || hasGeminiAvailable || ollamaConfigured) && (
                    <div className="pt-3">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Default model for built-in/system agents only</label>
                      <select value={systemPreferredModel} onChange={(e) => setSystemPreferredModel(e.target.value)} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm">
                        <option value="">Auto (follow the best available configured model)</option>
                        {uniqueSystemPreferredOptions.length > 0 ? uniqueSystemPreferredOptions.map((option) => (
                          <option key={`system-${option.value}`} value={option.value}>{option.label}</option>
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
                                <option value="openai/gpt-5.4">GPT-5.4</option>
                                <option value="openai/gpt-5.4-mini">GPT-5.4 Mini (cost efficient)</option>
                                <option value="openai/gpt-5.4-nano">GPT-5.4 Nano</option>
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
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">This does not affect Add Agent. It is only used for built-in/system agents when they do not already have an explicit model.</p>
                      {systemPreferredModelDeprecation && (
                        <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">{systemPreferredModelDeprecation}</p>
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
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-100">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="font-medium">Activity Export preview</div>
                      <div className="mt-1 text-xs opacity-80">Share selected activity through ClawMax Activity Export. This is opt-in and can be revoked immediately. Choose a configured destination below.</div>
                    </div>
                    <button type="button" onClick={() => void toggleActivitySharing()} className={`rounded-md px-3 py-2 text-xs font-medium ${activeActivityConsent ? 'border border-amber-300 bg-transparent' : 'bg-amber-600 text-white hover:bg-amber-700'}`}>
                      {activeActivityConsent ? `Revoke ${activityDestination === 'digo' ? 'Digo' : 'ClawMax.ai'}` : activityConfirmOpen ? 'Confirm sharing' : 'Review and enable'}
                    </button>
                  </div>
                  {!activeActivityConsent && <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                    <label htmlFor="activity-export-destination" className="font-medium">Destination</label>
                    <select id="activity-export-destination" value={activityDestination} onChange={(event) => setActivityDestination(event.target.value === 'digo' ? 'digo' : 'clawmax-ai')} className="rounded border border-amber-300 bg-white px-2 py-1 text-xs dark:bg-gray-900">
                      <option value="clawmax-ai">ClawMax.ai reference receiver</option>
                    </select>
                  </div>}
                  {!activeActivityConsent && <div className="mt-3 flex flex-wrap gap-3 text-xs">
                    {['agent-chat', 'workflow', 'group-chat', 'community-chat', 'builder'].map((scope) => (
                      <label key={scope} className="inline-flex items-center gap-1.5"><input type="checkbox" checked={activityScopes.includes(scope)} onChange={(event) => setActivityScopes((current) => event.target.checked ? [...new Set([...current, scope])] : current.filter((entry) => entry !== scope))} />{scope.replaceAll('-', ' ')}</label>
                    ))}
                  </div>}
                  {activityConfirmOpen && !activeActivityConsent && <div className="mt-3 rounded-lg border border-amber-300 bg-white/70 p-3 text-xs dark:border-amber-700 dark:bg-black/20">
                    <div className="font-medium">Confirm activity sharing with {activityDestination === 'digo' ? 'Digo' : 'ClawMax.ai'}</div>
                    <p className="mt-1">ClawMax removes direct PII (such as email addresses and phone numbers) and known secrets, credentials, tokens, and private keys before queueing selected activity. Delivery is asynchronous; revoke sharing at any time.</p>
                    <div className="mt-2 flex gap-2"><button type="button" onClick={() => setActivityConfirmOpen(false)} className="rounded border border-gray-300 px-2 py-1">Cancel</button><button type="button" onClick={() => void toggleActivitySharing()} className="rounded bg-amber-600 px-2 py-1 font-medium text-white">I consent</button></div>
                  </div>}
                  {activityConsents.length > 0 && <div className="mt-2 space-y-1 text-xs">{activityConsents.map((entry) => <div key={entry.destinationId} className="flex flex-wrap items-center justify-between gap-2 rounded border border-amber-200/70 px-2 py-1.5 dark:border-amber-800/50"><span>Sharing with {entry.destinationId === 'digo' ? 'Digo' : 'ClawMax.ai'} · {entry.scopes.join(', ')}</span><button type="button" onClick={() => void revokeActivityDestination(entry.destinationId)} className="font-medium text-red-700 hover:underline dark:text-red-300">Revoke</button></div>)}</div>}
                  {activityConsents.length > 0 && activityDelivery && (
                    <div className={`mt-3 rounded-md border px-3 py-2 text-xs ${activityDelivery.queuedEvents > 0 || activityDelivery.worker?.lastError || activityDelivery.retry?.lastError ? 'border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-100' : 'border-emerald-300 bg-emerald-50 text-emerald-950 dark:border-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-100'}`}>
                      <div className="font-medium">Activity delivery: {activityDelivery.queuedEvents === 0 ? 'up to date' : `${activityDelivery.queuedEvents} queued`}</div>
                      <div className="mt-1 opacity-80">
                        {activityDelivery.queuedEvents === 0
                          ? 'No pending activity is waiting in this runtime.'
                          : activityDelivery.worker?.configured?.clawmaxAi || activityDelivery.worker?.configured?.digo
                            ? 'The runtime will retry delivery automatically.'
                            : 'Delivery credentials are not configured in this dashboard runtime.'}
                      </div>
                      {(activityDelivery.worker?.lastError || activityDelivery.retry?.lastError) && <div className="mt-1 break-words">Latest delivery error: {activityDelivery.worker.lastError || activityDelivery.retry?.lastError}</div>}
                    </div>
                  )}
                </div>
                <div className="mt-4 rounded-xl border border-cyan-200 dark:border-cyan-800 bg-cyan-50 dark:bg-cyan-900/20 p-4 text-sm text-cyan-900 dark:text-cyan-100">
                  <div className="font-medium">Optional partner integrations</div>
                  <div className="mt-1">
                    Choose which partner pages to configure for this workspace. You can select all, some, or none. Selected integrations drive template defaults and future partner-aware template options.
                  </div>
                  <div className="mt-2 text-xs font-medium">
                    Each integration is independent. Opik and Resend are not prerequisites for Cognee or any other partner. Selecting a partner adds its setup page; it does not install software.
                  </div>
                </div>

                <div className="mt-5 space-y-4">
                  {visiblePartnerDefinitions.length === 0 ? (
                    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-4 text-sm text-gray-500 dark:text-gray-400">
                      No optional partner integrations are enabled for this environment.
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-wrap gap-2">
                        {partnerCategoryTabs.map((category) => (
                          <button
                            key={category}
                            type="button"
                            onClick={() => setPartnerCategoryTab(category)}
                            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                              partnerCategoryTab === category
                                ? 'border-sky-300 bg-sky-100 text-sky-800 dark:border-sky-700 dark:bg-sky-900/40 dark:text-sky-200'
                                : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800'
                            }`}
                          >
                            {formatPartnerCategoryLabel(category)}
                          </button>
                        ))}
                      </div>
                      {partnerCategoryTab === 'all' && visiblePartnerDefinitions.length > 0 && (
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <button
                            type="button"
                            onClick={() => setSelectedPartners(Array.from(new Set([
                              ...visiblePartnerDefinitions.map((partner) => partner.slug),
                              ...lockedPartnerSlugs,
                            ])))}
                            className="rounded-full border border-gray-200 bg-white px-3 py-1.5 font-medium text-gray-600 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
                          >
                            Select all
                          </button>
                          <button
                            type="button"
                            onClick={() => setSelectedPartners(Array.from(new Set(lockedPartnerSlugs)))}
                            className="rounded-full border border-gray-200 bg-white px-3 py-1.5 font-medium text-gray-600 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
                          >
                            Unselect all
                          </button>
                          {lockedPartnerSlugs.length > 0 && (
                            <span className="text-gray-500 dark:text-gray-400">
                              Locked partners stay selected.
                            </span>
                          )}
                        </div>
                      )}
                      <div className="space-y-3">
                      {visiblePartnersForTab.map((partner) => {
                        const checked = selectedPartners.includes(partner.slug)
                        const locked = lockedPartnerSlugs.includes(partner.slug)
                        return (
                          <div key={partner.slug} className={`block rounded-xl border p-4 transition-colors ${checked ? 'border-sky-300 bg-sky-50 dark:border-sky-700 dark:bg-sky-900/20' : 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900'}`}>
                            <div className="flex items-start gap-3">
                              <input
                                aria-label={`Select ${partner.name}`}
                                type="checkbox"
                                checked={checked}
                                disabled={locked}
                                onChange={(e) => {
                                  if (locked) return
                                  setSelectedPartners((current) => e.target.checked
                                    ? Array.from(new Set([...current, partner.slug]))
                                    : current.filter((slug) => slug !== partner.slug))
                                }}
                                className="mt-1"
                              />
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <PartnerLogo
                                    slug={partner.slug}
                                    name={partner.name}
                                    logoUrl={partner.logoUrl}
                                  />
                                  <div className="font-medium text-gray-900 dark:text-gray-100">{partner.name}</div>
                                  {getPartnerCategories(partner).map((category) => (
                                    <span key={`${partner.slug}-${category}`} className="rounded-full bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-[11px] text-gray-500 dark:text-gray-400">
                                      {formatPartnerCategoryLabel(category)}
                                    </span>
                                  ))}
                                </div>
                                <div className="mt-1 text-sm text-gray-600 dark:text-gray-300">{partner.description}</div>
                                <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">{describePartnerStatus(partner)}</div>
                                {locked && (
                                  <div className="mt-2 text-xs font-medium text-sky-700 dark:text-sky-300">
                                    Locked on because this dashboard runtime is already configured to use {partner.name}.
                                  </div>
                                )}
                                {(partner.website || partner.docsUrl) && (
                                  <div className="mt-2 flex flex-wrap gap-3 text-xs">
                                    {partner.website ? <a href={partner.website} target="_blank" rel="noopener noreferrer" className="text-sky-600 underline dark:text-sky-400">Website</a> : null}
                                    {partner.docsUrl ? <a href={partner.docsUrl} target="_blank" rel="noopener noreferrer" className="text-sky-600 underline dark:text-sky-400">Docs</a> : null}
                                  </div>
                                )}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedPartners((current) => Array.from(new Set([...current, partner.slug])))
                                    setStep(`partner:${partner.slug}`)
                                  }}
                                  className="mt-3 rounded-md border border-sky-300 bg-white px-3 py-1.5 text-xs font-medium text-sky-700 hover:bg-sky-100 dark:border-sky-700 dark:bg-gray-900 dark:text-sky-300 dark:hover:bg-sky-900/30"
                                >
                                  Configure {partner.name}
                                </button>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                      </div>
                    </>
                  )}
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
                    <PartnerLogo
                      slug={currentPartner.slug}
                      name={currentPartner.name}
                      logoUrl={currentPartner.logoUrl}
                      variant="hero"
                    />
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

                {isMailOAuthProvider(currentPartner.slug) && (
                  <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4 text-sm dark:border-gray-700 dark:bg-gray-900">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="font-medium text-gray-900 dark:text-gray-100">Connected accounts</div>
                        <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          Connections belong to this workspace. Agents receive only explicitly granted mail actions, never OAuth credentials.
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => void connectMailProvider(currentPartner.slug)}
                        disabled={mailOAuthBusy !== null || !mailOAuthStatus?.storageConfigured || !currentMailProviderStatus?.configured}
                        className="rounded-md bg-sky-600 px-4 py-2 text-sm text-white transition-colors hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {mailOAuthBusy === `${currentPartner.slug}:connect` ? 'Connecting…' : 'Connect account'}
                      </button>
                    </div>

                    {!mailOAuthStatus?.storageConfigured && (
                      <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-100">
                        Encrypted connection storage is unavailable. Configure <code>CLAWMAX_SECRET_MASTER_KEY</code> and restart this runtime.
                      </div>
                    )}
                    {mailOAuthStatus?.storageConfigured && currentMailProviderStatus && !currentMailProviderStatus.configured && (
                      <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-100">
                        {currentMailProviderStatus.unavailableReason}
                      </div>
                    )}
                    {mailOAuthError && (
                      <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200">
                        {mailOAuthError}
                      </div>
                    )}

                    <div className="mt-3 space-y-2">
                      {(currentMailProviderStatus?.connections || []).map((connection) => {
                        const grantKey = `${currentPartner.slug}:${connection.accountId}`
                        const eligibleAgents = mailGrantStatus.agents.filter((agent) => agent.skills.includes('clawmax-mail'))
                        const activeGrants = mailGrantStatus.grants.filter((grant) =>
                          !grant.revokedAt && grant.provider === currentPartner.slug && grant.accountId === connection.accountId)
                        const selectedCapabilities = mailGrantCapabilities[grantKey] || DEFAULT_MAIL_GRANT_CAPABILITIES
                        return (
                        <div key={connection.accountId} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-gray-200 px-3 py-3 dark:border-gray-700">
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-medium text-gray-900 dark:text-gray-100">
                              {connection.accountEmail || 'Connected mail account'}
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                              <span className={`rounded-full px-2 py-0.5 font-medium ${
                                connection.status === 'connected'
                                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200'
                                  : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200'
                              }`}>
                                {connection.status === 'connected' ? 'Connected' : 'Reconnect required'}
                              </span>
                              <span>{connection.capabilities.length} delegated capabilities</span>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => void refreshMailConnection(currentPartner.slug, connection.accountId)}
                              disabled={mailOAuthBusy !== null}
                              className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
                            >
                              {mailOAuthBusy === `${currentPartner.slug}:${connection.accountId}:refresh` ? 'Refreshing…' : 'Refresh'}
                            </button>
                            <button
                              type="button"
                              onClick={() => void disconnectMailConnection(currentPartner.slug, connection.accountId)}
                              disabled={mailOAuthBusy !== null}
                              className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-900/20"
                            >
                              {mailOAuthBusy === `${currentPartner.slug}:${connection.accountId}:disconnect` ? 'Disconnecting…' : 'Disconnect'}
                            </button>
                          </div>

                          <div className="basis-full border-t border-gray-200 pt-3 dark:border-gray-700">
                            <div className="font-medium text-gray-900 dark:text-gray-100">Agent access</div>
                            {activeGrants.length > 0 ? (
                              <div className="mt-2 space-y-2">
                                {activeGrants.map((grant) => {
                                  const agent = mailGrantStatus.agents.find((candidate) => candidate.id === grant.agentId)
                                  return (
                                    <div key={grant.id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                                      <div>
                                        <span className="font-medium text-gray-800 dark:text-gray-200">{agent?.name || grant.agentId}</span>
                                        <span className="ml-2 text-gray-500 dark:text-gray-400">{grant.capabilities.join(', ')}</span>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => void revokeAgentMailGrant(grant.id)}
                                        disabled={mailOAuthBusy !== null}
                                        className="rounded-md border border-red-300 px-3 py-1.5 font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-900/20"
                                      >
                                        {mailOAuthBusy === `grant:${grant.id}:revoke` ? 'Revoking…' : 'Revoke'}
                                      </button>
                                    </div>
                                  )
                                })}
                              </div>
                            ) : (
                              <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">No agent is authorized for this account.</div>
                            )}

                            <div className="mt-3 flex flex-wrap items-end gap-3">
                              <label className="min-w-48 flex-1 text-xs font-medium text-gray-700 dark:text-gray-300">
                                Agent
                                <select
                                  value={mailGrantAgents[grantKey] || eligibleAgents[0]?.id || ''}
                                  onChange={(event) => setMailGrantAgents((current) => ({ ...current, [grantKey]: event.target.value }))}
                                  disabled={eligibleAgents.length === 0 || mailOAuthBusy !== null}
                                  className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                                >
                                  {eligibleAgents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
                                </select>
                              </label>
                              <button
                                type="button"
                                onClick={() => void authorizeMailAgent(currentPartner.slug, connection.accountId)}
                                disabled={eligibleAgents.length === 0 || selectedCapabilities.length === 0 || mailOAuthBusy !== null}
                                className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {mailOAuthBusy === `${grantKey}:grant` ? 'Authorizing…' : 'Authorize agent'}
                              </button>
                            </div>
                            {eligibleAgents.length === 0 && (
                              <div className="mt-2 text-xs text-amber-700 dark:text-amber-300">Assign the clawmax-mail skill from the agent Skills editor first.</div>
                            )}
                            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
                              {MAIL_GRANT_CAPABILITY_OPTIONS.filter((option) => connection.capabilities.includes(option.id)).map((option) => (
                                <label key={option.id} className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
                                  <input
                                    type="checkbox"
                                    checked={selectedCapabilities.includes(option.id)}
                                    onChange={(event) => setMailGrantCapabilities((current) => {
                                      const prior = current[grantKey] || DEFAULT_MAIL_GRANT_CAPABILITIES
                                      const next = event.target.checked
                                        ? Array.from(new Set([...prior, option.id]))
                                        : prior.filter((capability) => capability !== option.id)
                                      return { ...current, [grantKey]: next }
                                    })}
                                  />
                                  {option.label}
                                </label>
                              ))}
                            </div>
                          </div>
                        </div>
                        )
                      })}
                      {currentMailProviderStatus?.configured && (currentMailProviderStatus.connections || []).length === 0 && (
                        <div className="rounded-md border border-dashed border-gray-300 px-3 py-4 text-center text-gray-500 dark:border-gray-700 dark:text-gray-400">
                          No account connected to this workspace.
                        </div>
                      )}
                    </div>
                  </div>
                )}

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
                  {currentPartner.slug === 'digo' && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-100">
                      <div className="font-medium">Activity sharing with Digo</div>
                      <div className="mt-1">Enable ClawMax.ai Activity Export first, then explicitly authorize Digo here. Direct PII and known secrets are removed before delivery.</div>
                      <button
                        type="button"
                        onClick={() => {
                          if (!digoConfigured) {
                            showWarning('Save the Digo API key and HTTPS ingestion URL before reviewing Digo sharing.')
                            return
                          }
                          if (!activityConsents.some((entry) => entry.destinationId === 'clawmax-ai')) {
                            showWarning('Enable ClawMax.ai Activity Export sharing before adding Digo as a destination.')
                            return
                          }
                          setActivityDestination('digo')
                          setActivityConfirmOpen(true)
                        }}
                        className="mt-2 rounded-md border border-amber-400 px-3 py-1.5 font-medium hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-amber-700 dark:hover:bg-amber-900/30"
                      >
                        {activeActivityConsent?.destinationId === 'digo' ? 'Digo sharing enabled' : 'Review Digo sharing'}
                      </button>
                    </div>
                  )}
                  {currentPartner.slug === 'resend' && renderResendTestEmailPanel()}
                  {currentPartner.validation && currentPartner.slug !== 'github' && !isMailOAuthProvider(currentPartner.slug) && renderPartnerValidation(currentPartner)}
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
                    {currentPartner.validation && currentPartner.slug !== 'github' && !isMailOAuthProvider(currentPartner.slug) && (
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
      {partnerPluginRun && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-3xl rounded-xl bg-white shadow-xl dark:bg-gray-800">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                  {partnerPluginRun.action === 'install' ? 'Install OpenClaw Partner Plugin' : 'Uninstall OpenClaw Partner Plugin'}
                </h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {partnerPluginRun.status === 'confirming'
                    ? <>Confirm removal of <span className="font-medium text-gray-900 dark:text-gray-100">{partnerPluginRun.name}</span> from this dashboard runtime.</>
                    : <>{partnerPluginRun.action === 'install' ? 'Installing' : 'Uninstalling'} <span className="font-medium text-gray-900 dark:text-gray-100">{partnerPluginRun.name}</span> through the curated OpenClaw plugin allowlist.</>}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (partnerPluginRun.status === 'running') return
                  setPartnerPluginRun(null)
                }}
                className="text-2xl leading-none text-gray-400 hover:text-gray-600 disabled:cursor-not-allowed dark:hover:text-gray-300"
                disabled={partnerPluginRun.status === 'running'}
              >
                ×
              </button>
            </div>

            <div className="space-y-4 px-6 py-4">
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
                Installing or uninstalling partner plugins can modify this dashboard runtime. Review the command output below.
              </div>
              <div className="bg-gray-900 text-green-400 font-mono text-xs rounded-lg p-3 h-64 overflow-y-auto whitespace-pre-wrap">
                {partnerPluginRun.logs.join('\n')}
                {partnerPluginRun.status === 'running' && <span className="animate-pulse">▌</span>}
              </div>
              {partnerPluginRun.error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
                  {partnerPluginRun.error}
                </div>
              )}
              {partnerPluginRun.status === 'success' && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300">
                  {partnerPluginRun.action === 'install' ? 'Install completed.' : 'Uninstall completed.'} Plugin status was refreshed automatically. The status shown on the partner page is authoritative; no restart is needed when it shows the expected state.
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-6 py-4 dark:border-gray-700">
              <button
                type="button"
                onClick={() => setPartnerPluginRun(null)}
                disabled={partnerPluginRun.status === 'running'}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                {partnerPluginRun.status === 'confirming' ? 'Cancel' : 'Close'}
              </button>
              {partnerPluginRun.status === 'confirming' && (
                <button
                  type="button"
                  onClick={() => {
                    const partner = partnerDefinitionBySlug[partnerPluginRun.slug]
                    if (partner) void runPartnerPluginAction(partner, 'uninstall')
                  }}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
                >
                  Uninstall
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
