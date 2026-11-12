/** Known OpenAI image-generation families cannot serve a text agent. Custom namespaces stay untouched. */
export function isKnownImageOnlyModel(model: string): boolean {
  const value = model.trim().toLowerCase()
  if (value.includes('/') && !value.startsWith('openai/')) return false
  return /^(chatgpt-image|gpt-image|dall-e)(?:-|$)/.test(value.replace(/^openai\//, ''))
}
