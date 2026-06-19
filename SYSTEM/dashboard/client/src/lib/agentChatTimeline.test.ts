import assert from 'node:assert/strict'
import { buildAgentChatTimelineRows, shouldShowCalendarDate } from './agentChatTimeline'

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`✓ ${name}`)
  } catch (error) {
    console.error(`✗ ${name}`)
    console.error(error)
    process.exitCode = 1
  }
}

const NOW = new Date('2026-06-19T14:00:00-04:00').getTime()

test('shouldShowCalendarDate hides the date for today messages', () => {
  const timestamp = new Date('2026-06-19T08:00:00-04:00').getTime()
  assert.equal(shouldShowCalendarDate(timestamp, NOW), false)
})

test('shouldShowCalendarDate shows the date for older messages', () => {
  const timestamp = new Date('2026-06-18T20:00:00-04:00').getTime()
  assert.equal(shouldShowCalendarDate(timestamp, NOW), true)
})

test('buildAgentChatTimelineRows inserts Today and Yesterday separators', () => {
  const rows = buildAgentChatTimelineRows([
    { id: 'old', timestamp: new Date('2026-06-18T20:00:00-04:00').getTime() },
    { id: 'new', timestamp: new Date('2026-06-19T08:00:00-04:00').getTime() },
  ], NOW)

  assert.deepEqual(
    rows.filter((row) => row.type === 'separator').map((row) => row.label),
    ['Yesterday', 'Today']
  )
})

test('buildAgentChatTimelineRows reuses one separator per day', () => {
  const rows = buildAgentChatTimelineRows([
    { id: 'a', timestamp: new Date('2026-06-17T09:00:00-04:00').getTime() },
    { id: 'b', timestamp: new Date('2026-06-17T10:00:00-04:00').getTime() },
  ], NOW)

  assert.equal(rows.filter((row) => row.type === 'separator').length, 1)
})
