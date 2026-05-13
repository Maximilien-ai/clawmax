/**
 * Security helpers for child process spawning and input validation.
 */
import { type ProviderKeys, resolveSystemExecutionProviderKeys, resolveUserExecutionProviderKeys } from './dashboard-env'
import { getWorkspaceGitHubToken } from './workspace-integrations'

export interface ExecutionEnvOverrides extends ProviderKeys {
  ollamaBaseUrl?: string
}

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
  const segments = [
    ...(String(basePath || '').split(':').map((entry) => entry.trim()).filter(Boolean)),
    ...STANDARD_RUNTIME_PATHS,
  ]

  return segments.filter((entry) => {
    if (!entry || seen.has(entry)) return false
    seen.add(entry)
    return true
  }).join(':')
}

/**
 * Returns a whitelisted subset of process.env for child processes.
 * Prevents leaking secrets to subprocesses that don't need them.
 */
export function safeEnv(extras?: Record<string, string | undefined>): NodeJS.ProcessEnv {
  const workspaceGitHubToken = getWorkspaceGitHubToken()
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
  }

  return { ...base, ...extras }
}

function providerKeysToEnv(providerKeys: ExecutionEnvOverrides): Record<string, string> | undefined {
  return {
    OPENAI_API_KEY: providerKeys.openai || '',
    ANTHROPIC_API_KEY: providerKeys.anthropic || '',
    GEMINI_API_KEY: providerKeys.gemini || '',
    OLLAMA_BASE_URL: providerKeys.ollamaBaseUrl || '',
    SENSO_API_KEY: process.env.SENSO_API_KEY || '',
  }
}

export function userExecutionEnv(byokOverrides?: ExecutionEnvOverrides): NodeJS.ProcessEnv {
  const resolvedProviderKeys = resolveUserExecutionProviderKeys(undefined, byokOverrides)
  return safeEnv(providerKeysToEnv({
    ...resolvedProviderKeys,
    ollamaBaseUrl: byokOverrides?.ollamaBaseUrl?.trim() || undefined,
  }))
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
