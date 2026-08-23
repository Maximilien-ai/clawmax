export function getTemplateApplyStagePercent(label: string): number {
  const normalized = label.trim().toLowerCase()
  if (!normalized) return 8
  if (normalized.startsWith('done')) return 100
  if (normalized.includes('refreshing')) return 92
  if (normalized.includes('adding ') || normalized.includes('finalizing ')) return 80
  if (normalized.includes('writing ') || normalized.includes('creating agent')) return 60
  if (normalized.includes('installing skill')) return 52
  if (normalized.includes('checking required senso')) return 45
  if (normalized.includes('validating')) return 35
  if (normalized.includes('preparing')) return 24
  if (normalized.includes('checking')) return 16
  if (normalized.includes('creating ')) return 8
  return 8
}

export function advanceTemplateApplyProgress(current: number, stagePercent: number): number {
  if (stagePercent >= 100) return 100
  return Math.min(95, Math.max(current + 1, stagePercent))
}
