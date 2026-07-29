export type OptimizeGraphItem = {
  name: string
  description?: string
  tags: string[]
  fields: Record<string, unknown>
}

export function getOptimizationDimensions(item: OptimizeGraphItem): string[] {
  const dimensions = new Set<string>()
  const goal = typeof item.fields.optimizationGoal === 'string' ? item.fields.optimizationGoal : ''
  const intent = `${item.name} ${item.description || ''} ${item.tags.join(' ')}`.toLowerCase()
  if (goal) dimensions.add(goal === 'tokens' ? 'Tokens' : goal.charAt(0).toUpperCase() + goal.slice(1))
  if (/\btoken(s)?\b/.test(intent)) dimensions.add('Tokens')
  if (/\b(cost|budget|economy|economic|efficiency)\b/.test(intent)) dimensions.add('Cost')
  if (/\b(speed|latency|duration|fast|faster)\b/.test(intent)) dimensions.add('Speed')
  if (/\b(quality|correctness|accuracy)\b/.test(intent)) dimensions.add('Quality')
  if (/\bmodel(s)?\b/.test(intent)) dimensions.add('Models')
  if (/\b(schedule|frequency|recurring)\b/.test(intent)) dimensions.add('Schedule')
  return Array.from(dimensions)
}
