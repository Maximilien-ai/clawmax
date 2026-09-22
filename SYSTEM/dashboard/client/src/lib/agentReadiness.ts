export interface AgentAttention {
  kind: 'credentials' | 'model' | 'runtime' | 'unknown'
  message: string
  action: string
  provider?: string
}

const providers: Record<string, string> = { openai: 'OpenAI', anthropic: 'Anthropic', gemini: 'Gemini', openrouter: 'OpenRouter', xai: 'xAI' }

// Store only presentation metadata, never request credentials or raw runtime errors.
export function agentAttentionFromReadiness(data: any, browserKeyNeedsValidation = false, gatewayUnavailable = false): AgentAttention | null {
  const provider = data?.resolvedAgent?.provider
  const providerLabel = typeof provider === 'string' && Object.hasOwn(providers, provider) ? providers[provider] : undefined
  if (data?.available === true) {
    if (gatewayUnavailable && (!data.resolvedAgent?.runtime || data.resolvedAgent.runtime === 'openclaw')) return { kind: 'runtime', message: 'The gateway runtime is not ready. Check System status before chatting.', action: 'View runtime status' }
    if (browserKeyNeedsValidation && providerLabel && (!data.resolvedAgent.runtime || data.resolvedAgent.runtime === 'openclaw')) return { kind: 'credentials', provider, message: `${providerLabel} credentials in this browser need validation.`, action: 'Verify credentials' }
    return null
  }
  if (data?.available !== false) return { kind: 'unknown', message: 'Readiness could not be checked. Try again.', action: 'Check again' }
  const error = typeof data.error === 'string' ? data.error : ''
  if (/no model configured/i.test(error)) return { kind: 'model', message: 'No usable model is configured for this agent.', action: 'Choose model' }
  if (providerLabel && /no .*credential|no execution path configured/i.test(error)) {
    return { kind: 'credentials', provider, message: `${providerLabel} credentials are missing for this browser and execution path. A different browser profile or address has a separate key store.`, action: 'Configure credentials' }
  }
  return { kind: 'runtime', message: data?.code === 'template_runtime_unavailable'
    ? 'Template execution is unavailable pending runtime and authority checks.'
    : 'The configured execution path is unavailable. Check runtime and integration settings.', action: 'View runtime status' }
}

export function agentAttentionKey(id: string, generation?: string): string {
  return JSON.stringify([id, generation || ''])
}
