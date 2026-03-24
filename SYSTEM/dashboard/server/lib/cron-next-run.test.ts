import assert from 'assert'
import { getNextCronRun } from './cron-next-run'

// Tests use relative assertions (not absolute ISO strings) so they pass in any timezone.

function testHourlyNextRun() {
  const from = new Date('2026-03-23T10:15:00Z')
  const next = getNextCronRun('0 * * * *', from)
  assert.ok(next, 'Should return a date')
  assert.ok(next!.getTime() > from.getTime(), 'Next run should be after from date')
  assert.strictEqual(next!.getMinutes(), 0, 'Hourly cron should fire at minute 0')
}

function testWeekdayNextRun() {
  const from = new Date('2026-03-20T18:00:00Z')
  const next = getNextCronRun('0 9 * * 1-5', from)
  assert.ok(next, 'Should return a date')
  assert.ok(next!.getTime() > from.getTime(), 'Next run should be after from date')
  const day = next!.getDay()
  assert.ok(day >= 1 && day <= 5, `Should be a weekday (got ${day})`)
  assert.strictEqual(next!.getHours(), 9, 'Should fire at hour 9 local')
  assert.strictEqual(next!.getMinutes(), 0, 'Should fire at minute 0')
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

function run() {
  testHourlyNextRun()
  testWeekdayNextRun()
  testManualHasNoNextRun()
  testDisabledInvalidCronReturnsNull()
  testStepCron()
  console.log('All tests passed')
}

run()
