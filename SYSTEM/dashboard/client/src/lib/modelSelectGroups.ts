import { formatOpenAiModelLabel, getModelLifecycleEntry } from './openAiModelLifecycle'

type ModelCatalog = Record<string, { models: string[] }>

export function groupActiveModelOptions(catalog: ModelCatalog) {
  const groups = new Map<string, Array<{ value: string; label: string }>>()
  const seen = new Set<string>()
  const labels: Record<string, string> = {
    openai: 'OpenAI', anthropic: 'Anthropic', gemini: 'Gemini', google: 'Gemini',
    ollama: 'Local models', 'openai-compatible': 'Local models',
    openrouter: 'OpenRouter', xai: 'xAI',
  }
  for (const [provider, entry] of Object.entries(catalog)) {
    for (const model of entry.models) {
      // Default pickers offer active choices. Existing agent selections are
      // retained separately in their editor, with lifecycle warnings.
      if (seen.has(model) || getModelLifecycleEntry(model)) continue
      seen.add(model)
      const group = labels[provider] || provider
      const options = groups.get(group) || []
      const label = formatOpenAiModelLabel(model).replace(/^[^/]+\//, '')
      options.push({ value: model, label: group === 'Local models' ? `${provider === 'ollama' ? 'Ollama' : 'OpenAI-compatible'}: ${label}` : label })
      groups.set(group, options)
    }
  }
  return Array.from(groups, ([label, options]) => ({ label, options }))
}
