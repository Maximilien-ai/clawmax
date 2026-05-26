const DEFAULT_AI_BUILDER_REMOTE_URL = 'https://www.clawmax.ai/api/ai-builder'
const FALLBACK_AI_BUILDER_REMOTE_URL = 'https://clawmax.ai/api/ai-builder'

export interface AiBuilderSessionSharePayload {
  workspaceName?: string
  workspaceId?: string
  sessionId: string
  source: 'dashboard_builder'
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
  recommendation?: {
    intent?: string
    scope?: string
    operation?: string
    confidence?: string
  } | null
  matchedAssets?: string[]
  feedback?: 'up' | 'down'
}

export interface AiBuilderFeedbackSharePayload {
  workspaceName?: string
  workspaceId?: string
  sessionId: string
  recommendationKey: string
  feedback: 'up' | 'down'
}

export function getAiBuilderRemoteUrl(): string {
  return (process.env.AI_BUILDER_REMOTE_URL || process.env.AI_BUILDER_URL || DEFAULT_AI_BUILDER_REMOTE_URL).trim()
}

export function getAiBuilderCandidateUrls(): string[] {
  const configured = (process.env.AI_BUILDER_REMOTE_URL || process.env.AI_BUILDER_URL || '').trim()
  if (configured) return [configured]
  return [DEFAULT_AI_BUILDER_REMOTE_URL, FALLBACK_AI_BUILDER_REMOTE_URL]
}

export function getAiBuilderWriteToken(): string {
  return (process.env.AI_BUILDER_WRITE_TOKEN || process.env.AI_BUILDER_TOKEN || '').trim()
}

export function isAiBuilderShareEnabled(): boolean {
  return !!getAiBuilderWriteToken()
}

async function postAiBuilderJson(pathname: '/sessions' | '/feedback', payload: Record<string, any>) {
  const token = getAiBuilderWriteToken()
  if (!token) {
    return { ok: true, shared: false, reason: 'disabled' as const }
  }

  let lastError: Error | null = null
  for (const baseUrl of getAiBuilderCandidateUrls()) {
    try {
      const url = `${baseUrl.replace(/\/+$/, '')}/${pathname.replace(/^\/+/, '')}`
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      })
      const data: any = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof data?.error === 'string' ? data.error : `AI Builder share failed (${response.status})`)
      }
      return {
        ok: true,
        shared: true,
        remoteId: typeof data?.share?.id === 'string' ? data.share.id : undefined,
      }
    } catch (error: any) {
      lastError = error instanceof Error ? error : new Error(String(error))
    }
  }

  throw lastError || new Error('AI Builder share failed')
}

export async function shareAiBuilderSession(payload: AiBuilderSessionSharePayload) {
  return postAiBuilderJson('/sessions', payload)
}

export async function shareAiBuilderFeedback(payload: AiBuilderFeedbackSharePayload) {
  return postAiBuilderJson('/feedback', payload)
}
