export interface CompressedTimelineBreak {
  afterIndex: number
  x: number
  gapMs: number
}

export interface CompressedTimelineLayout {
  positions: number[]
  breaks: CompressedTimelineBreak[]
}

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

function median(values: number[]): number {
  if (values.length === 0) return DAY_MS
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle]
}

/** Preserve relative time while compressing long quiet periods enough to keep events readable. */
export function buildCompressedTimelineLayout(times: number[], startX: number, endX: number): CompressedTimelineLayout {
  if (times.length === 0) return { positions: [], breaks: [] }
  if (times.length === 1) return { positions: [startX], breaks: [] }

  const gaps = times.slice(1).map((time, index) => Math.max(HOUR_MS, time - times[index]))
  const positiveGaps = gaps.filter((gap) => gap > HOUR_MS).sort((a, b) => a - b)
  const typicalSamples = positiveGaps.length > 1 ? positiveGaps.slice(0, Math.ceil(positiveGaps.length / 2)) : positiveGaps
  const typicalGap = gaps.length === 1 ? DAY_MS : median(typicalSamples)
  const breakThreshold = Math.max(7 * DAY_MS, typicalGap * 6)
  const typicalWeight = Math.sqrt(Math.max(HOUR_MS, typicalGap))
  const weights = gaps.map((gap) => {
    const relative = Math.sqrt(gap)
    const minimum = typicalWeight * 0.55
    const maximum = gap >= breakThreshold ? typicalWeight * 2.75 : typicalWeight * 5
    return Math.max(minimum, Math.min(relative, maximum))
  })
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0) || 1
  const width = Math.max(0, endX - startX)
  const positions = [startX]
  let consumed = 0
  weights.forEach((weight) => {
    consumed += weight
    positions.push(startX + (consumed / totalWeight) * width)
  })
  const breaks = gaps.flatMap((gap, index) => gap >= breakThreshold
    ? [{ afterIndex: index, x: (positions[index] + positions[index + 1]) / 2, gapMs: gap }]
    : [])
  return { positions, breaks }
}
