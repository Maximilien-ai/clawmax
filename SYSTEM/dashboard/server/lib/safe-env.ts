/**
 * Security helpers for child process spawning and input validation.
 */
import {
  type ProviderKeys,
  getDefaultOllamaBaseUrl,
  getDefaultOpenAICompatibleBaseUrl,
  isManagedRuntime,
  resolveSystemExecutionProviderKeys,
  resolveUserExecutionProviderKeys,
  resolveWorkflowExecutionProviderKeys,
  resolveRuntimeBaseUrl,
} from './dashboard-env'
import { getResolvedWorkspaceIntegrationConfig, getWorkspaceGitHubToken, readWorkspaceIntegrationSecrets } from './workspace-integrations'
import { REPO_ROOT } from './paths'

export interface ExecutionEnvOverrides extends ProviderKeys {
  ollamaBaseUrl?: string
}

export type ExecutionModelProvider = 'openai' | 'anthropic' | 'gemini' | 'openrouter' | 'xai' | 'ollama' | 'openai-compatible'

const STANDARD_RUNTIME_PATHS = [
  '/opt/homebrew/bin',
  '/opt/homebrew/sbin',
  '/usr/local/bin',
  '/usr/local/sbin',
  '/usr/bin',
  '/bin',
  '/usr/sbin',
  '/sbin',
]

function buildSafePath(basePath?: string): string {
  const seen = new Set<string>()
  const clawmaxHelperDir = `${REPO_ROOT}/SYSTEM/dashboard`
  const segments = [
    clawmaxHelperDir,
    ...(String(basePath || '').split(':').map((entry) => entry.trim()).filter(Boolean)),
    ...STANDARD_RUNTIME_PATHS,
  ]

  return segments.filter((entry) => {
    if (!entry || seen.has(entry)) return false
    seen.add(entry)
    return true
  }).join(':')
}

function getPartnerSecretEnvKey(slug: string, fieldKey: string): string {
  if (/^[A-Z0-9_]+$/.test(fieldKey) && fieldKey.includes('_')) return fieldKey
  const upperSlug = slug.replace(/[^a-z0-9]+/gi, '_').toUpperCase()
  const normalizedField = fieldKey
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-z0-9]+/gi, '_')
    .toUpperCase()
  if (fieldKey === 'apiKey') return `${upperSlug}_API_KEY`
  if (fieldKey === 'defaultRepo') return `${upperSlug}_DEFAULT_REPO`
  if (fieldKey === 'defaultSandbox') return `${upperSlug}_DEFAULT_SANDBOX`
  if (fieldKey === 'projectId') return `${upperSlug}_PROJECT_ID`
  if (fieldKey === 'contextLabel') return `${upperSlug}_CONTEXT_LABEL`
  return `${upperSlug}_${normalizedField}`
}

/**
 * Returns a whitelisted subset of process.env for child processes.
 * Prevents leaking secrets to subprocesses that don't need them.
 */
export function safeEnv(extras?: Record<string, string | undefined>): NodeJS.ProcessEnv {
  const workspaceGitHubToken = getWorkspaceGitHubToken()
  const partnerSecretEnv = Object.fromEntries(
    Object.entries(readWorkspaceIntegrationSecrets().partners || {})
      .flatMap(([slug, partnerSecrets]) => (
        Object.entries(partnerSecrets || {}).map(([key, value]) => [
          getPartnerSecretEnvKey(slug, key),
          String(value || '').trim(),
        ])
      ))
      .filter(([, value]) => !!value)
  )
  const partnerValueEnv = Object.fromEntries(
    Object.entries(getResolvedWorkspaceIntegrationConfig().partners || {})
      .flatMap(([slug, partnerValues]) => (
        Object.entries(partnerValues || {}).map(([key, value]) => [
          getPartnerSecretEnvKey(slug, key),
          typeof value === 'string' ? value.trim() : '',
        ])
      ))
      .filter(([, value]) => !!value)
  )
  const base: Record<string, string | undefined> = {
    PATH: buildSafePath(process.env.PATH),
    HOME: process.env.HOME,
    USER: process.env.USER,
    SHELL: process.env.SHELL,
    TERM: process.env.TERM,
    LANG: process.env.LANG,
    // OpenClaw needs these
    OPENCLAW_WORKSPACE: process.env.OPENCLAW_WORKSPACE,
    NODE_ENV: process.env.NODE_ENV,
    // GitHub CLI auth (needed for agents with github/gh-issues skills)
    GITHUB_TOKEN: process.env.GITHUB_TOKEN || workspaceGitHubToken,
    GH_TOKEN: process.env.GH_TOKEN || workspaceGitHubToken,
    // gh CLI config directory
    XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
    // Runtime-managed partner integrations that agent tools may call directly.
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    // Factory Droid CLI auth (agent-runtime: droid)
    FACTORY_API_KEY: process.env.FACTORY_API_KEY,
    // Cognee OpenClaw plugin / MCP integration
    COGNEE_API_KEY: process.env.COGNEE_API_KEY,
    COGNEE_BASE_URL: process.env.COGNEE_BASE_URL,
    COGNEE_DATASET_NAME: process.env.COGNEE_DATASET_NAME,
    COGNEE_SEARCH_TYPE: process.env.COGNEE_SEARCH_TYPE,
  }

  return { ...base, ...partnerValueEnv, ...partnerSecretEnv, ...extras }
}

function providerKeysToEnv(providerKeys: ExecutionEnvOverrides): Record<string, string> | undefined {
  const useOpenAiCompatible = !!providerKeys.openaiCompatibleBaseUrl
  const runtimeDefaultOllamaBaseUrl = getDefaultOllamaBaseUrl()
  const runtimeDefaultOpenAiCompatibleBaseUrl = getDefaultOpenAICompatibleBaseUrl()
  const managedRuntime = isManagedRuntime()
  return {
    OPENAI_API_KEY: useOpenAiCompatible
      ? (providerKeys.openaiCompatibleApiKey || providerKeys.openai || 'openai-compatible')
      : (providerKeys.openai || ''),
    OPENAI_BASE_URL: useOpenAiCompatible
      ? resolveRuntimeBaseUrl({
          configuredBaseUrl: providerKeys.openaiCompatibleBaseUrl || '',
          managedRuntime,
          runtimeDefaultBaseUrl: runtimeDefaultOpenAiCompatibleBaseUrl,
        })
      : '',
    ANTHROPIC_API_KEY: providerKeys.anthropic || '',
    GEMINI_API_KEY: providerKeys.gemini || '',
    OPENROUTER_API_KEY: providerKeys.openrouter || '',
    XAI_API_KEY: providerKeys.xai || '',
    OLLAMA_BASE_URL: resolveRuntimeBaseUrl({
      configuredBaseUrl: providerKeys.ollamaBaseUrl || '',
      managedRuntime,
      runtimeDefaultBaseUrl: runtimeDefaultOllamaBaseUrl,
    }),
    SENSO_API_KEY: process.env.SENSO_API_KEY || '',
  }
}

export function userExecutionEnv(byokOverrides?: ExecutionEnvOverrides): NodeJS.ProcessEnv {
  const resolvedProviderKeys = resolveUserExecutionProviderKeys(undefined, byokOverrides)
  return safeEnv(providerKeysToEnv({
    ...resolvedProviderKeys,
    ollamaBaseUrl: byokOverrides?.ollamaBaseUrl?.trim() || undefined,
    openaiCompatibleApiKey: byokOverrides?.openaiCompatibleApiKey?.trim() || undefined,
    openaiCompatibleBaseUrl: byokOverrides?.openaiCompatibleBaseUrl?.trim() || undefined,
    openaiCompatibleDefaultModel: byokOverrides?.openaiCompatibleDefaultModel?.trim() || undefined,
    openrouter: byokOverrides?.openrouter?.trim() || undefined,
    xai: byokOverrides?.xai?.trim() || undefined,
  }))
}

export function workflowExecutionEnv(
  byokOverrides?: ExecutionEnvOverrides,
  selectedProvider?: ExecutionModelProvider,
): NodeJS.ProcessEnv {
  const resolvedProviderKeys = resolveWorkflowExecutionProviderKeys(undefined, byokOverrides)
  const executionProviderKeys: ExecutionEnvOverrides = {
    ...resolvedProviderKeys,
    ollamaBaseUrl: byokOverrides?.ollamaBaseUrl?.trim() || undefined,
    openaiCompatibleApiKey: byokOverrides?.openaiCompatibleApiKey?.trim() || resolvedProviderKeys.openaiCompatibleApiKey,
    openaiCompatibleBaseUrl: byokOverrides?.openaiCompatibleBaseUrl?.trim() || resolvedProviderKeys.openaiCompatibleBaseUrl,
    openaiCompatibleDefaultModel: byokOverrides?.openaiCompatibleDefaultModel?.trim() || resolvedProviderKeys.openaiCompatibleDefaultModel,
    openrouter: byokOverrides?.openrouter?.trim() || resolvedProviderKeys.openrouter,
    xai: byokOverrides?.xai?.trim() || resolvedProviderKeys.xai,
  }

  if (selectedProvider) {
    executionProviderKeys.openai = selectedProvider === 'openai' ? resolvedProviderKeys.openai : undefined
    executionProviderKeys.anthropic = selectedProvider === 'anthropic' ? resolvedProviderKeys.anthropic : undefined
    executionProviderKeys.gemini = selectedProvider === 'gemini' ? resolvedProviderKeys.gemini : undefined
    executionProviderKeys.openrouter = selectedProvider === 'openrouter' ? resolvedProviderKeys.openrouter : undefined
    executionProviderKeys.xai = selectedProvider === 'xai' ? resolvedProviderKeys.xai : undefined
    executionProviderKeys.ollamaBaseUrl = selectedProvider === 'ollama' ? executionProviderKeys.ollamaBaseUrl : undefined
    executionProviderKeys.openaiCompatibleApiKey = selectedProvider === 'openai-compatible' ? executionProviderKeys.openaiCompatibleApiKey : undefined
    executionProviderKeys.openaiCompatibleBaseUrl = selectedProvider === 'openai-compatible' ? executionProviderKeys.openaiCompatibleBaseUrl : undefined
    executionProviderKeys.openaiCompatibleDefaultModel = selectedProvider === 'openai-compatible' ? executionProviderKeys.openaiCompatibleDefaultModel : undefined
  }

  return safeEnv(providerKeysToEnv(executionProviderKeys))
}

export function systemExecutionEnv(): NodeJS.ProcessEnv {
  return safeEnv(providerKeysToEnv(resolveSystemExecutionProviderKeys()))
}

/**
 * Validates that a value is a valid port number (1-65535).
 * Returns the port as a number, or throws.
 */
export function validatePort(port: unknown): number {
  const num = typeof port === 'string' ? parseInt(port, 10) : Number(port)
  if (!Number.isInteger(num) || num < 1 || num > 65535) {
    throw new Error(`Invalid port number: ${port}`)
  }
  return num
}

/**
 * Validates a GitHub URL for safe use in shell commands.
 */
export function validateGitUrl(url: string): string {
  // Only allow https:// GitHub URLs
  if (!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+(\.git)?$/.test(url)) {
    throw new Error('Only HTTPS GitHub URLs are allowed')
  }
  return url
}
