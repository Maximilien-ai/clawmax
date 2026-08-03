import assert from 'assert'
import { buildCompressedTimelineLayout } from './lifecycleGraph'

const day = 24 * 60 * 60 * 1000
const base = Date.UTC(2026, 0, 1)

const empty = buildCompressedTimelineLayout([], 100, 900)
assert.deepStrictEqual(empty, { positions: [], breaks: [] })

const single = buildCompressedTimelineLayout([base], 100, 900)
assert.deepStrictEqual(single.positions, [100])

const regular = buildCompressedTimelineLayout([base, base + day, base + 3 * day, base + 6 * day], 100, 900)
assert.strictEqual(regular.positions[0], 100)
assert.strictEqual(regular.positions.at(-1), 900)
assert(regular.positions[2] - regular.positions[1] > regular.positions[1] - regular.positions[0], 'Two days must occupy more space than one day')
assert(regular.positions[3] - regular.positions[2] > regular.positions[2] - regular.positions[1], 'Three days must occupy more space than two days')
assert.strictEqual(regular.breaks.length, 0)

const compressed = buildCompressedTimelineLayout([base, base + 90 * day, base + 91 * day, base + 93 * day], 100, 900)
assert.strictEqual(compressed.breaks.length, 1)
assert.strictEqual(compressed.breaks[0].afterIndex, 0)
const longGapWidth = compressed.positions[1] - compressed.positions[0]
const shortGapWidth = compressed.positions[2] - compressed.positions[1]
assert(longGapWidth > shortGapWidth, 'A long gap must remain visibly longer')
assert(longGapWidth < shortGapWidth * 4, 'A long gap must be compressed enough not to dominate the timeline')

const sparse = buildCompressedTimelineLayout([base, base + 90 * day], 100, 900)
assert.strictEqual(sparse.breaks.length, 1, 'A two-event history must still label a long quiet period')

console.log('lifecycleGraph.test.ts: 11 tests passed')
