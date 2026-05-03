import assert from 'assert'
import { getNextCronRun } from './cron-next-run'

function getZonedParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(date)

  return {
    weekday: parts.find((part) => part.type === 'weekday')?.value,
    hour: Number(parts.find((part) => part.type === 'hour')?.value || 0),
    minute: Number(parts.find((part) => part.type === 'minute')?.value || 0),
  }
}

function testHourlyNextRun() {
  const from = new Date('2026-03-23T10:15:00Z')
  const next = getNextCronRun('0 * * * *', from)
  assert.ok(next, 'Should return a date')
  assert.ok(next!.getTime() > from.getTime(), 'Next run should be after from date')
  assert.strictEqual(next!.getMinutes(), 0, 'Hourly cron should fire at minute 0')
}

function testWeekdayNextRun() {
  const from = new Date('2026-03-20T18:00:00Z')
  const next = getNextCronRun('0 9 * * 1-5', from, 'UTC')
  assert.ok(next, 'Should return a date')
  assert.ok(next!.getTime() > from.getTime(), 'Next run should be after from date')
  const parts = getZonedParts(next!, 'UTC')
  assert.ok(['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].includes(parts.weekday || ''), `Should be a weekday (got ${parts.weekday})`)
  assert.strictEqual(parts.hour, 9, 'Should fire at hour 9 UTC')
  assert.strictEqual(parts.minute, 0, 'Should fire at minute 0')
}

function testManualHasNoNextRun() {
  assert.strictEqual(getNextCronRun('manual', new Date('2026-03-23T10:15:00Z')), null)
}

function testDisabledInvalidCronReturnsNull() {
  assert.strictEqual(getNextCronRun('not-a-cron', new Date('2026-03-23T10:15:00Z')), null)
}

function testStepCron() {
  const from = new Date('2026-03-23T10:16:00Z')
  const next = getNextCronRun('*/15 * * * *', from)
  assert.ok(next, 'Should return a date')
  assert.ok(next!.getTime() > from.getTime(), 'Next run should be after from date')
  assert.ok(next!.getMinutes() % 15 === 0, `Minutes should be divisible by 15 (got ${next!.getMinutes()})`)
}

function testTimezoneAwareNextRun() {
  const from = new Date('2026-03-20T16:30:00Z')
  const next = getNextCronRun('0 9 * * 1-5', from, 'America/Los_Angeles')
  assert.ok(next, 'Should return a date')
  assert.strictEqual(next!.toISOString(), '2026-03-23T16:00:00.000Z', 'Should resolve 9am Los Angeles correctly across UTC boundary')
}

function run() {
  testHourlyNextRun()
  testWeekdayNextRun()
  testManualHasNoNextRun()
  testDisabledInvalidCronReturnsNull()
  testStepCron()
  testTimezoneAwareNextRun()
  console.log('All tests passed')
}

run()
