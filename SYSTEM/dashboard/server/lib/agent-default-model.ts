import { getBestAvailableModel, getDashboardEnvRaw, getDefaultOllamaBaseUrl, getSystemProviderKeys, getUserDefaultProviderKeys, isOllamaUiEnabled } from './dashboard-env'
import { getAvailableModelsCached } from './model-discovery'
import { readWorkspaceIntegrationConfig } from './workspace-integrations'

type ResolveDefaultAgentModelOptions = {
  explicitModel?: string
  templateModel?: string
  preferredModel?: string
  builtIn?: boolean
  systemPreferredModel?: string
  availableModels?: string[]
  rawEnv?: Record<string, string>
}

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

export function resolveDefaultAgentModel(options: ResolveDefaultAgentModelOptions = {}): string | undefined {
  const rawEnv = options.rawEnv || getDashboardEnvRaw()
  const integrations = readWorkspaceIntegrationConfig()
  const explicitAvailableModels = Array.isArray(options.availableModels)
  const availableModels = Array.isArray(options.availableModels)
    ? options.availableModels.filter(Boolean)
    : getAvailableModelsCached(rawEnv)

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

  const workspaceCompatibleBaseUrl = normalizeCandidate(integrations.openaiCompatibleBaseUrl)
  const workspaceCompatibleModel = normalizeCandidate(integrations.openaiCompatibleDefaultModel)
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
