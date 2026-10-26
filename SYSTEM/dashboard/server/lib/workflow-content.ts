/** Pure browser/server boundary: JSON instructions must never become [object Object]. */
export function normalizeWorkflowContent(value: unknown, depth = 0): string {
  if (depth > 8) throw new Error('Workflow instructions are nested too deeply. Generate a simpler Markdown workflow.')
  if (value == null) return ''
  if (typeof value === 'string') return value.trim() === '[object Object]' ? '' : value
  if (depth > 0 && (typeof value === 'number' || typeof value === 'boolean')) return String(value)
  if (Array.isArray(value)) {
    return value.map(item => normalizeWorkflowContent(item, depth + 1)).filter(item => item.trim())
      .map((item, index) => `${index + 1}. ${item.trim().replace(/\n/g, '\n   ')}`).join('\n\n')
  }
  if (typeof value !== 'object') return ''
  const entries = Object.entries(value)
  if (entries.length === 1 && ['markdown', 'content', 'text', 'instructions'].includes(entries[0][0])) {
    return normalizeWorkflowContent(entries[0][1], depth + 1)
  }
  return entries.map(([key, content]) => {
    const body = normalizeWorkflowContent(content, depth + 1)
    if (!body.trim()) return ''
    const heading = key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_\r\n]+/g, ' ').trim()
    return `${'#'.repeat(Math.min(depth + 2, 6))} ${heading}\n\n${body}`
  }).filter(Boolean).join('\n\n')
}

export function normalizeGeneratedWorkflowDraft<T extends Record<string, unknown>>(draft: T): T & { content: string } {
  if (!draft || typeof draft !== 'object' || Array.isArray(draft)) {
    throw new Error('AI did not return a workflow definition. Your prompt is preserved; generate again.')
  }
  const content = normalizeWorkflowContent(draft.content)
  if (!content.trim()) {
    throw new Error('AI did not return workflow instructions. Your prompt is preserved; generate again or add Markdown instructions.')
  }
  return { ...draft, content }
}
