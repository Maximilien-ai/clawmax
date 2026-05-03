import assert from 'assert'
import {
  DEFAULT_WORKFLOW_TIMEZONE,
  getWorkflowScheduleOptions,
  normalizeWorkflowTimezone,
} from './scheduler'

function testNormalizeWorkflowTimezone() {
  assert.strictEqual(normalizeWorkflowTimezone(), DEFAULT_WORKFLOW_TIMEZONE)
  assert.strictEqual(normalizeWorkflowTimezone('  America/Los_Angeles  '), 'America/Los_Angeles')
  assert.strictEqual(normalizeWorkflowTimezone(''), DEFAULT_WORKFLOW_TIMEZONE)
}

function testGetWorkflowScheduleOptions() {
  assert.deepStrictEqual(getWorkflowScheduleOptions(), { timezone: 'UTC' })
  assert.deepStrictEqual(getWorkflowScheduleOptions('America/New_York'), { timezone: 'America/New_York' })
}

function run() {
  testNormalizeWorkflowTimezone()
  testGetWorkflowScheduleOptions()
  console.log('All tests passed')
}

run()
