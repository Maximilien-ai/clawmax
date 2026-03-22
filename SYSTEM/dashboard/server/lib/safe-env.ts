/**
 * Security helpers for child process spawning and input validation.
 */

/**
 * Returns a whitelisted subset of process.env for child processes.
 * Prevents leaking secrets to subprocesses that don't need them.
 */
export function safeEnv(extras?: Record<string, string | undefined>): NodeJS.ProcessEnv {
  const base: Record<string, string | undefined> = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    USER: process.env.USER,
    SHELL: process.env.SHELL,
    TERM: process.env.TERM,
    LANG: process.env.LANG,
    // OpenClaw needs these
    OPENCLAW_WORKSPACE: process.env.OPENCLAW_WORKSPACE,
    OPENAI_API_KEY: process.env.USER_OPENAI_API_KEY || process.env.OPENAI_API_KEY,
    ANTHROPIC_API_KEY: process.env.USER_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY,
    NEBIUS_API_KEY: process.env.USER_NEBIUS_API_KEY || process.env.NEBIUS_API_KEY,
    NODE_ENV: process.env.NODE_ENV,
  }

  return { ...base, ...extras }
}

export function providerKeyOverrides(overrides?: {
  openai?: string
  anthropic?: string
  nebius?: string
}): Record<string, string> | undefined {
  if (!overrides) return undefined

  const hasAnyOverride = [overrides.openai, overrides.anthropic, overrides.nebius]
    .some(value => typeof value === 'string' && value.trim().length > 0)

  if (!hasAnyOverride) return undefined

  return {
    OPENAI_API_KEY: overrides.openai?.trim() || '',
    ANTHROPIC_API_KEY: overrides.anthropic?.trim() || '',
    NEBIUS_API_KEY: overrides.nebius?.trim() || '',
  }
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
