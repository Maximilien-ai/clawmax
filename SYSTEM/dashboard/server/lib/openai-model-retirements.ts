// Pure browser/server policy, reviewed against
// https://developers.openai.com/api/docs/deprecations on 2026-10-26.
// Apply known shutdowns locally on every read, including warm catalogs. New
// announcements require a policy update; provider discovery is not inference proof.
const SOURCE_URL = 'https://developers.openai.com/api/docs/deprecations'

const RETIREMENTS: Array<{ matches: RegExp; shutdownDate: string; replacementModel: string }> = [
  { matches: /^gpt-4-(?:1106-)?vision-preview$/, shutdownDate: '2024-12-06', replacementModel: 'gpt-5.5' },
  { matches: /^gpt-4-32k(?:-|$)/, shutdownDate: '2025-06-06', replacementModel: 'gpt-5.5' },
  { matches: /^gpt-4\.5-preview(?:-|$)/, shutdownDate: '2025-07-14', replacementModel: 'gpt-5.5' },
  { matches: /^chatgpt-4o-latest$/, shutdownDate: '2026-02-17', replacementModel: 'gpt-5.5' },
  { matches: /^gpt-4-(?:0314|0125-preview|turbo-preview)(?:-|$)/, shutdownDate: '2026-03-26', replacementModel: 'gpt-5.5' },
  { matches: /^(?:gpt-5-chat-latest|gpt-5-codex|gpt-5\.1-chat-latest|gpt-5\.1-codex(?:-max|-mini)?|gpt-5\.2-codex)$/, shutdownDate: '2026-07-23', replacementModel: 'gpt-5.5' },
  { matches: /^gpt-5\.[23]-chat-latest$/, shutdownDate: '2026-08-10', replacementModel: 'gpt-5.5' },
  { matches: /^gpt-5\.4-cyber$/, shutdownDate: '2026-10-01', replacementModel: 'gpt-5.5' },
  // The last remaining GPT-3.5 and original GPT-4 aliases shut down October 23.
  { matches: /^gpt-3\.5(?:-|$)/, shutdownDate: '2026-10-23', replacementModel: 'gpt-5.4-mini' },
  { matches: /^gpt-4(?:-|$)/, shutdownDate: '2026-10-23', replacementModel: 'gpt-5.5' },
  { matches: /^gpt-4\.1-nano(?:-|$)/, shutdownDate: '2026-10-23', replacementModel: 'gpt-5.4-mini' },
  { matches: /^gpt-4o-2024-05-13$/, shutdownDate: '2026-10-23', replacementModel: 'gpt-5.5' },
  { matches: /^(?:o1(?:-2024-12-17)?|o1-pro(?:-2025-03-19)?|o3-mini(?:-2025-01-31)?|o4-mini(?:-2025-04-16)?)$/, shutdownDate: '2026-10-23', replacementModel: 'gpt-5.5' },
  { matches: /^gpt-4o-mini(?:-2024-07-18)?$/, shutdownDate: '2027-01-14', replacementModel: 'gpt-5.4-mini' },
  { matches: /^(?:gpt-4o(?:-2024-08-06|-2024-11-20)?|gpt-4\.1(?:-mini)?(?:-2025-04-14)?)$/, shutdownDate: '2027-01-14', replacementModel: 'gpt-5.5' },
  { matches: /^(?:gpt-5\.3-codex|gpt-5\.4-nano(?:-2026-03-17)?|gpt-5\.1(?:-2025-11-13)?)$/, shutdownDate: '2027-04-01', replacementModel: 'gpt-5.5' },
]

export function getOpenAIModelRetirement(model: string, now = Date.now()) {
  const normalized = model.trim().toLowerCase()
  if (!normalized.startsWith('openai/')) return null
  const baseModel = normalized.slice('openai/'.length)
  const retirement = RETIREMENTS.find(entry => entry.matches.test(baseModel))
  if (!retirement) return null
  return {
    providerLabel: 'OpenAI',
    status: now >= Date.parse(`${retirement.shutdownDate}T00:00:00Z`) ? 'retired' as const : 'deprecated' as const,
    replacementModel: retirement.replacementModel,
    shutdownDate: retirement.shutdownDate,
    sourceUrl: SOURCE_URL,
  }
}

export function isRetiredOpenAIModel(model: string): boolean {
  return getOpenAIModelRetirement(model)?.status === 'retired'
}

export function resolveActiveOpenAIModel(model: string): string {
  const entry = getOpenAIModelRetirement(model)
  return entry?.status === 'retired' ? `openai/${entry.replacementModel}` : model
}
