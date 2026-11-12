import assert from 'node:assert/strict'
import { workflowScheduleError } from './workflowSchedule'

const rows: Array<[string, string | null]> = [
  // A manual workflow (from a template, an AI draft or an import) must stay editable and savable.
  ['manual', null],
  [' manual ', null],
  ['0 9 * * 1-5', null],
  ['*/15 * * * * *', null],
  ['0 9 * *', 'Cron expression must have 5 or 6 fields'],
  ['Manual', 'Cron expression must have 5 or 6 fields'],
  ['0 9 ? * 1', 'Invalid characters in cron expression'],
  ['', null],
]
for (const [schedule, expected] of rows) {
  assert.equal(workflowScheduleError(schedule), expected, `schedule ${JSON.stringify(schedule)}`)
}

console.log('Workflow schedule tests passed')
