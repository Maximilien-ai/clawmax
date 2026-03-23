import assert from 'assert'
import { getNextCronRun } from './cron-next-run'

function isoLocal(date: Date | null): string | null {
  return date ? date.toISOString() : null
}

function testHourlyNextRun() {
  const next = getNextCronRun('0 * * * *', new Date('2026-03-23T10:15:00Z'))
  assert.strictEqual(isoLocal(next), '2026-03-23T11:00:00.000Z')
}

function testWeekdayNextRun() {
  const next = getNextCronRun('0 9 * * 1-5', new Date('2026-03-20T18:00:00Z'))
  assert.strictEqual(isoLocal(next), '2026-03-23T16:00:00.000Z')
}

function testManualHasNoNextRun() {
  assert.strictEqual(getNextCronRun('manual', new Date('2026-03-23T10:15:00Z')), null)
}

function testDisabledInvalidCronReturnsNull() {
  assert.strictEqual(getNextCronRun('not-a-cron', new Date('2026-03-23T10:15:00Z')), null)
}

function testStepCron() {
  const next = getNextCronRun('*/15 * * * *', new Date('2026-03-23T10:16:00Z'))
  assert.strictEqual(isoLocal(next), '2026-03-23T10:30:00.000Z')
}

function run() {
  testHourlyNextRun()
  testWeekdayNextRun()
  testManualHasNoNextRun()
  testDisabledInvalidCronReturnsNull()
  testStepCron()
  console.log('All tests passed')
}

run()
