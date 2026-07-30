export function parseBuilderQuestionCommand(value: string): string | null {
  const match = value.trim().match(/^\/question(?:\s+)([\s\S]+)$/i)
  const question = match?.[1]?.trim() || ''
  return question || null
}
