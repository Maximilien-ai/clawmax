import { isEvalRecord, type PluginRecord } from './plugins'

export function getEvalAttributes(item: PluginRecord): string[] {
  if (!isEvalRecord(item)) return []
  const attributeLabels: Array<[RegExp, string]> = [
    [/correct|accuracy|regression/, 'Correctness'],
    [/quality|response|answer/, 'Quality'],
    [/speed|latency|duration|timeout/, 'Speed'],
    [/cost|token|budget/, 'Cost'],
    [/safe|security|refusal|secret/, 'Safety'],
    [/privacy|personal|sensitive/, 'Privacy'],
    [/ground|source|evidence/, 'Grounding'],
    [/tone|empat|support/, 'Tone'],
    [/handoff|completion/, 'Handoff'],
    [/instruction|format|structured/, 'Instruction fit'],
  ]
  const searchable = [
    ...item.tags,
    item.name,
    item.description,
    item.experiment.expectedOutput,
  ].join(' ').toLowerCase()
  const matches = attributeLabels
    .filter(([pattern]) => pattern.test(searchable))
    .map(([, label]) => label)
  return matches.length > 0 ? matches.slice(0, 4) : ['Expected outcome']
}

export function getEvalTrialCount(item: PluginRecord): number {
  if (!isEvalRecord(item)) return 1
  const experiment = item.experiment as typeof item.experiment & {
    iterations?: number
    sampleCount?: number
  }
  const configured = experiment.iterations ?? experiment.sampleCount
  return Number.isFinite(configured) && Number(configured) > 0
    ? Math.round(Number(configured))
    : Math.max(1, item.runs.length)
}

export function getEvalJudge(item: PluginRecord): { id: string; label: string } {
  if (!isEvalRecord(item)) return { id: 'fixed', label: 'Fixed evaluator' }
  const judge = String(item.experiment.judge)
  if (judge === 'ai') return { id: 'ai', label: 'AI evaluator' }
  if (judge === 'human') return { id: 'human', label: 'Human evaluator' }
  return { id: 'fixed', label: 'Fixed evaluator' }
}
