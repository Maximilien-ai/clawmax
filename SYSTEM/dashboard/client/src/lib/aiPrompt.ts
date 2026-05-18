import { readStoredByokKeys } from './byok'
import { readSharedSecrets } from './localSecrets'

export type AIPromptExpansionTarget = 'agent' | 'workflow' | 'skill' | 'template'
export type AIPromptExpansionFormat = 'markdown' | 'text'

export async function expandPromptWithAI(
  prompt: string,
  target: AIPromptExpansionTarget,
  format: AIPromptExpansionFormat = 'markdown',
): Promise<string> {
  const byok = readStoredByokKeys()
  const shared = {
    ...readSharedSecrets('global'),
    ...readSharedSecrets('workspace'),
  }
  const openai = (shared.OPENAI_API_KEY || byok.openai || '').trim()
  const anthropic = (shared.ANTHROPIC_API_KEY || byok.anthropic || '').trim()
  const gemini = (shared.GEMINI_API_KEY || byok.geminiApiKey || '').trim()
  const response = await fetch('/api/ai/expand-prompt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      target,
      format,
      byokKeys: {
        openai: openai || undefined,
        anthropic: anthropic || undefined,
        gemini: gemini || undefined,
      },
    }),
  })
  const data = await response.json().catch(() => ({}))
  if (response.status === 404) {
    throw new Error('Prompt expansion is not available until the dashboard server is restarted.')
  }
  if (!response.ok || !data.expandedPrompt) {
    throw new Error(data.error || 'Failed to expand prompt')
  }
  return data.expandedPrompt
}
