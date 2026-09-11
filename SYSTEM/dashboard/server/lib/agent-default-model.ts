import { allowSystemKeysForUserExecution, getBestAvailableModel, getDashboardEnvRaw, getDefaultOllamaBaseUrl, getSystemProviderKeys, getUserDefaultProviderKeys, isOllamaUiEnabled } from './dashboard-env'
import { getAvailableModelsCached, getCachedOpenAiCompatibleDefaultModel, openAiCompatibleCandidateFromKeys, resolveOpenAiCompatibleDefaultModel, resolveOpenAiCompatibleEndpoint, type OpenAiCompatibleEndpoint } from './model-discovery'
import { readWorkspaceIntegrationConfig } from './workspace-integrations'

type ResolveDefaultAgentModelOptions = {
  explicitModel?: string
  templateModel?: string
  preferredModel?: string
  builtIn?: boolean
  systemPreferredModel?: string
  availableModels?: string[]
  rawEnv?: Record<string, string>
  /**
   * Which protected credentials may pair with the workspace endpoint. 'system' (provisioning,
   * template imports) may use SYSTEM keys; 'user' (chat on behalf of a user) may use them only
   * when ALLOW_SYSTEM_KEYS_FOR_USER_EXECUTION permits — the same rule user execution follows.
   */
  executionPolicy?: 'system' | 'user'
}

export type DefaultModelExecutionPolicy = 'system' | 'user'

function normalizeCandidate(value?: string): string | undefined {
  const trimmed = value?.trim()
  return trimmed || undefined
}

function matchesAvailable(model: string | undefined, availableModels: string[]): boolean {
  if (!model) return false
  if (availableModels.length === 0) return false
  return availableModels.includes(model)
}

function isLocalRuntimeModel(model: string | undefined): boolean {
  return !!model && (model.startsWith('ollama/') || model.startsWith('openai-compatible/'))
}

/**
 * The workspace's OpenAI-compatible endpoint as default-agent selection sees it: the non-secret
 * workspace URL and model, paired with the protected USER/SYSTEM credential for that same server.
 */
const SYSTEM_OPENAI_COMPATIBLE_ENV_KEYS = [
  'SYSTEM_OPENAI_COMPATIBLE_BASE_URL', 'SYSTEM_OPENAI_COMPATIBLE_API_KEY', 'SYSTEM_OPENAI_COMPATIBLE_DEFAULT_MODEL',
  'OPENAI_COMPATIBLE_BASE_URL', 'OPENAI_COMPATIBLE_API_KEY', 'OPENAI_COMPATIBLE_DEFAULT_MODEL',
]

/**
 * The environment a default-model decision may read under an execution policy. User execution
 * that may not use SYSTEM keys sees no SYSTEM OpenAI-compatible configuration at all, so neither
 * the paired endpoint nor the available-model list can surface a model only that credential
 * can reach.
 */
export function policyScopedEnv(rawEnv: Record<string, string>, executionPolicy: DefaultModelExecutionPolicy = 'system'): Record<string, string> {
  if (executionPolicy === 'system' || allowSystemKeysForUserExecution(rawEnv)) return rawEnv
  const scoped = { ...rawEnv }
  for (const key of SYSTEM_OPENAI_COMPATIBLE_ENV_KEYS) delete scoped[key]
  return scoped
}

function resolveWorkspaceCompatibleEndpoint(rawEnv: Record<string, string>, executionPolicy: DefaultModelExecutionPolicy = 'system'): OpenAiCompatibleEndpoint | undefined {
  const integrations = readWorkspaceIntegrationConfig()
  const workspaceCompatibleBaseUrl = normalizeCandidate(integrations.openaiCompatibleBaseUrl)
  if (!workspaceCompatibleBaseUrl) return undefined
  const scopedEnv = policyScopedEnv(rawEnv, executionPolicy)
  return resolveOpenAiCompatibleEndpoint([
    { baseUrl: workspaceCompatibleBaseUrl, defaultModel: integrations.openaiCompatibleDefaultModel },
    openAiCompatibleCandidateFromKeys(getUserDefaultProviderKeys(scopedEnv)),
    openAiCompatibleCandidateFromKeys(getSystemProviderKeys(scopedEnv)),
  ])
}

/**
 * Fill the discovery cache resolveDefaultAgentModel reads, through the credential it will read with.
 *
 * resolveDefaultAgentModel is synchronous and sits inside provisioning; callers that can await do
 * so here, at their request boundary, so an endpoint with no typed model is not reported modelless
 * on a cold cache. Warm calls cost nothing; a failed lookup leaves the previous behaviour intact.
 */
export async function warmDefaultAgentModelEndpoint(rawEnv: Record<string, string> = getDashboardEnvRaw(), executionPolicy: DefaultModelExecutionPolicy = 'system'): Promise<void> {
  const endpoint = resolveWorkspaceCompatibleEndpoint(rawEnv, executionPolicy)
  if (!endpoint || endpoint.defaultModel) return
  try {
    await resolveOpenAiCompatibleDefaultModel({ baseUrl: endpoint.baseUrl, apiKey: endpoint.apiKey })
  } catch {
    // Provisioning reports an unusable endpoint in its own words; this lookup must not throw here.
  }
}

export function resolveDefaultAgentModel(options: ResolveDefaultAgentModelOptions = {}): string | undefined {
  const rawEnv = options.rawEnv || getDashboardEnvRaw()
  const integrations = readWorkspaceIntegrationConfig()
  const explicitAvailableModels = Array.isArray(options.availableModels)
  const availableModels = Array.isArray(options.availableModels)
    ? options.availableModels.filter(Boolean)
    : getAvailableModelsCached(policyScopedEnv(rawEnv, options.executionPolicy))

  const explicitModel = normalizeCandidate(options.explicitModel)
  if (explicitModel) return explicitModel

  const systemPreferredModel = normalizeCandidate(
    options.systemPreferredModel || (options.builtIn ? integrations.systemPreferredModel : undefined),
  )
  if (matchesAvailable(systemPreferredModel, availableModels) || (!explicitAvailableModels && isLocalRuntimeModel(systemPreferredModel))) return systemPreferredModel

  const preferredModel = normalizeCandidate(options.preferredModel || integrations.preferredModel)
  if (matchesAvailable(preferredModel, availableModels) || (!explicitAvailableModels && isLocalRuntimeModel(preferredModel))) return preferredModel

  const templateModel = normalizeCandidate(options.templateModel)
  if (matchesAvailable(templateModel, availableModels) || (!explicitAvailableModels && isLocalRuntimeModel(templateModel))) return templateModel

  const ollamaEnabled = isOllamaUiEnabled(rawEnv)
  const workspaceOllamaModel = normalizeCandidate(integrations.ollamaDefaultModel)
  const defaultOllamaBaseUrl = normalizeCandidate(integrations.ollamaBaseUrl || getDefaultOllamaBaseUrl(rawEnv))
  if (ollamaEnabled && defaultOllamaBaseUrl) {
    const qualifiedOllama = workspaceOllamaModel ? `ollama/${workspaceOllamaModel}` : undefined
    if (matchesAvailable(qualifiedOllama, availableModels)) return qualifiedOllama
    if (!explicitAvailableModels && qualifiedOllama) return qualifiedOllama
    const firstOllama = availableModels.find((model) => model.startsWith('ollama/'))
    if (firstOllama) return firstOllama
  }

  // The workspace holds the non-secret URL; its credential may sit in protected USER/SYSTEM
  // configuration for the same server, and the discovery cache is keyed by that pairing.
  const workspaceCompatible = resolveWorkspaceCompatibleEndpoint(rawEnv, options.executionPolicy)
  const workspaceCompatibleBaseUrl = workspaceCompatible?.baseUrl
  // Naming a default model in BYOK is optional, so fall back to whichever chat model the endpoint
  // itself advertises rather than leaving the agent with no model at all.
  const workspaceCompatibleModel = workspaceCompatible?.defaultModel
    || getCachedOpenAiCompatibleDefaultModel(workspaceCompatible?.baseUrl, workspaceCompatible?.apiKey)
  if (workspaceCompatibleBaseUrl && workspaceCompatibleModel) {
    const qualifiedCompatible = `openai-compatible/${workspaceCompatibleModel}`
    if (matchesAvailable(qualifiedCompatible, availableModels)) return qualifiedCompatible
    if (!explicitAvailableModels) return qualifiedCompatible
    const firstCompatible = availableModels.find((model) => model.startsWith('openai-compatible/'))
    if (firstCompatible) return firstCompatible
  }

  const recommendedHostedModel = getBestAvailableModel(rawEnv)
  const systemKeys = getSystemProviderKeys(rawEnv)
  const userKeys = getUserDefaultProviderKeys(rawEnv)
  const hasHostedProviderPath = !!(systemKeys.openai || systemKeys.anthropic || systemKeys.gemini || userKeys.openai || userKeys.anthropic || userKeys.gemini)
  if (hasHostedProviderPath) {
    if (matchesAvailable(recommendedHostedModel, availableModels)) return recommendedHostedModel
    const firstHosted = availableModels.find((model) => !model.startsWith('ollama/'))
    if (firstHosted) return firstHosted
    return recommendedHostedModel
  }

  return undefined
}
