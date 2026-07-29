import type { GenericPluginRecord, PluginRecord, PluginWorkspaceContext } from './plugins'
import { isGenericPluginRecord } from './plugins'

export type OptimizeAssistantResult = {
  draft: Partial<PluginRecord>
  changes: string[]
}

function parseScaledNumber(value: string): number {
  const normalized = value.replace(/,/g, '').trim().toLowerCase()
  const multiplier = normalized.endsWith('m') ? 1_000_000 : normalized.endsWith('k') ? 1_000 : 1
  return Number.parseFloat(normalized.replace(/[km]$/, '')) * multiplier
}

function firstNumber(text: string, patterns: RegExp[]): number | null {
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (!match?.[1]) continue
    const parsed = parseScaledNumber(match[1])
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function firstText(text: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match?.[1]?.trim()) return match[1].trim()
  }
  return null
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

export function applyOptimizeAssistantText(
  draft: Partial<PluginRecord>,
  assistantText: string,
  context: PluginWorkspaceContext,
): OptimizeAssistantResult {
  if (!isGenericPluginRecord(draft) || draft.kind !== 'optimization-plan') {
    return { draft, changes: [] }
  }

  const text = assistantText.trim()
  const normalized = text.toLowerCase()
  const fields = { ...draft.fields }
  const changes: string[] = []
  const setField = (key: string, value: string | number | boolean | string[], label: string) => {
    if (JSON.stringify(fields[key]) === JSON.stringify(value)) return
    fields[key] = value
    changes.push(label)
  }

  const scope = /\bworkspace\b/.test(normalized)
    ? 'workspace'
    : /\bworkflow\b/.test(normalized)
      ? 'workflow'
      : /\bagent\b/.test(normalized)
        ? 'agent'
        : null
  if (scope) setField('scope', scope, `Scope: ${scope}`)

  const explicitPriority = firstText(text, [/priority\s*[:=]\s*(quality|balanced|speed|tokens|cost)/i])
  const priority = explicitPriority?.toLowerCase()
    || (/\bquality-first\b/.test(normalized)
      ? 'quality'
      : /\bspeed-first|reduce latency|finish faster\b/.test(normalized)
        ? 'speed'
        : /\btoken-first|reduce tokens\b/.test(normalized)
          ? 'tokens'
          : /\bcost-first|reduce cost|cheaper|economical\b/.test(normalized)
            ? 'cost'
            : null)
  if (priority) setField('optimizationGoal', priority, `Priority: ${priority}`)

  const monthlyTokens = firstNumber(normalized, [
    /monthly\s+token(?:s|\s+budget)?\s*[:=]?\s*([\d,.]+\s*[km]?)/i,
    /([\d,.]+\s*[km]?)\s+tokens?\s+(?:per|a)\s+month/i,
  ])
  if (monthlyTokens !== null) {
    const value = clamp(Math.round(monthlyTokens), 0, 10_000_000)
    setField('monthlyTokenBudget', value, `Monthly tokens: ${value.toLocaleString()}`)
  }

  const monthlyCost = firstNumber(normalized, [
    /monthly\s+cost(?:\s+budget)?\s*[:=]?\s*\$?\s*([\d,.]+)/i,
    /\$\s*([\d,.]+)\s+(?:per|a)\s+month/i,
  ])
  if (monthlyCost !== null) {
    const value = clamp(monthlyCost, 0, 1_000)
    setField('monthlyCostBudget', value, `Monthly cost: $${value}`)
  }

  const perRunTokens = firstNumber(normalized, [
    /(?:per[-\s]?run|run)\s+token(?:s|\s+budget)?\s*[:=]?\s*([\d,.]+\s*[km]?)/i,
    /([\d,.]+\s*[km]?)\s+tokens?\s+(?:per|each)\s+run/i,
  ])
  if (perRunTokens !== null) {
    const value = clamp(Math.round(perRunTokens), 0, 1_000_000)
    setField('perRunTokenBudget', value, `Per-run tokens: ${value.toLocaleString()}`)
  }

  const perRunCost = firstNumber(normalized, [
    /(?:per[-\s]?run|run)\s+cost(?:\s+budget)?\s*[:=]?\s*\$?\s*([\d,.]+)/i,
    /\$\s*([\d,.]+)\s+(?:per|each)\s+run/i,
  ])
  if (perRunCost !== null) {
    const value = clamp(perRunCost, 0, 100)
    setField('perRunCostBudget', value, `Per-run cost: $${value}`)
  }

  const durationMatch = normalized.match(/(?:maximum|max|under|within)\s+(?:run\s+)?(?:duration|time|latency)?\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(seconds?|secs?|minutes?|mins?)/i)
  if (durationMatch) {
    const amount = Number(durationMatch[1])
    const seconds = clamp(/min/i.test(durationMatch[2]) ? Math.round(amount * 60) : Math.round(amount), 1, 86_400)
    setField('maximumRunDurationSeconds', seconds, `Maximum duration: ${seconds}s`)
  }

  const quality = firstNumber(normalized, [
    /(?:minimum|min)\s+quality(?:\s+score)?\s*[:=]?\s*([\d,.]+)/i,
    /quality(?:\s+score)?\s+(?:of|at|above|over)\s*([\d,.]+)/i,
  ])
  if (quality !== null) {
    const value = clamp(quality, 0, 100)
    setField('minimumQualityScore', value, `Minimum quality: ${value}`)
  }

  if (/\b(?:disable|turn off|manual)\b.{0,24}\bautomatic model/i.test(normalized)) {
    setField('automaticModelSelection', false, 'Automatic model selection: off')
  } else if (/\bautomatic model|auto[-\s]?select/i.test(normalized)) {
    setField('automaticModelSelection', true, 'Automatic model selection: on')
  }

  const modelPriority = firstText(text, [/model\s+priority\s*[:=]\s*(quality|balanced|cost)/i])
  if (modelPriority) setField('modelPriority', modelPriority.toLowerCase(), `Model priority: ${modelPriority.toLowerCase()}`)

  const recommendedModel = firstText(text, [/recommended\s+model\s*[:=]\s*([^\n;]+)/i])
  if (recommendedModel) setField('recommendedModel', recommendedModel, `Recommended model: ${recommendedModel}`)

  const recommendedSchedule = firstText(text, [/recommended\s+schedule\s*[:=]\s*([^\n;]+)/i])
  if (recommendedSchedule) setField('recommendedSchedule', recommendedSchedule, `Recommended schedule: ${recommendedSchedule}`)

  const resolvedScope = String(fields.scope || scope || '')
  const candidates = resolvedScope === 'agent' ? context.agents : resolvedScope === 'workflow' ? context.workflows : []
  const matchedTargets = candidates
    .filter((candidate) => normalized.includes(candidate.id.toLowerCase()) || normalized.includes(candidate.name.toLowerCase()))
    .map((candidate) => candidate.id)
  if (resolvedScope === 'workspace') {
    setField('targetIds', [], 'Target: current workspace')
  } else if (matchedTargets.length > 0) {
    setField('targetIds', matchedTargets, `Targets: ${matchedTargets.join(', ')}`)
  }

  const rationale = firstText(text, [/rationale\s*[:=]\s*([^\n]+)/i, /recommendation\s*[:=]\s*([^\n]+)/i])
  if (rationale) setField('rationale', rationale, 'Recommendation rationale updated')

  return {
    draft: { ...draft, fields } as Partial<GenericPluginRecord>,
    changes,
  }
}
