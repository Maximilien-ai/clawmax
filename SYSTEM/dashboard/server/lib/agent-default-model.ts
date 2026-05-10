import { getBestAvailableModel, getDashboardEnvRaw, getDefaultOllamaBaseUrl, getSystemProviderKeys, getUserDefaultProviderKeys, isOllamaUiEnabled } from './dashboard-env'
import { readWorkspaceIntegrationConfig } from './workspace-integrations'

type ResolveDefaultAgentModelOptions = {
  explicitModel?: string
  templateModel?: string
  preferredModel?: string
  availableModels?: string[]
  rawEnv?: Record<string, string>
}

function normalizeCandidate(value?: string): string | undefined {
  const trimmed = value?.trim()
  return trimmed || undefined
}

function matchesAvailable(model: string | undefined, availableModels: string[]): boolean {
  if (!model) return false
  if (availableModels.length === 0) return true
  return availableModels.includes(model)
}

export function resolveDefaultAgentModel(options: ResolveDefaultAgentModelOptions = {}): string | undefined {
  const rawEnv = options.rawEnv || getDashboardEnvRaw()
  const integrations = readWorkspaceIntegrationConfig()
  const availableModels = Array.isArray(options.availableModels) ? options.availableModels.filter(Boolean) : []

  const explicitModel = normalizeCandidate(options.explicitModel)
  if (explicitModel) return explicitModel

  const preferredModel = normalizeCandidate(options.preferredModel || integrations.preferredModel)
  if (matchesAvailable(preferredModel, availableModels)) return preferredModel

  const templateModel = normalizeCandidate(options.templateModel)
  if (matchesAvailable(templateModel, availableModels)) return templateModel

  const ollamaEnabled = isOllamaUiEnabled(rawEnv)
  const workspaceOllamaModel = normalizeCandidate(integrations.ollamaDefaultModel)
  const defaultOllamaBaseUrl = normalizeCandidate(integrations.ollamaBaseUrl || getDefaultOllamaBaseUrl(rawEnv))
  if (ollamaEnabled && defaultOllamaBaseUrl) {
    const qualifiedOllama = workspaceOllamaModel ? `ollama/${workspaceOllamaModel}` : undefined
    if (matchesAvailable(qualifiedOllama, availableModels)) return qualifiedOllama
    const firstOllama = availableModels.find((model) => model.startsWith('ollama/'))
    if (firstOllama) return firstOllama
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
