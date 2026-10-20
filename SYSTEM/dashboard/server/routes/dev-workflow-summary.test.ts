import assert from 'assert'
import { devWorkflowSummary } from './workflows'
const runs = require('./dev-template-workflow')
const chat = require('./dev-host-skill-chat')
const originalRuns = runs.listDevTemplateWorkflowRuns
const originalAdmission = chat.devHostSkillChatEnabled
const request = { get: () => 'http://localhost:5174', socket: { remoteAddress: '127.0.0.1' } }
const id = 'tr-1234567890abcdef-workflow-123456789abc'
try {
  chat.devHostSkillChatEnabled = () => true
  for (const status of ['completed', 'running', 'failed']) {
    runs.listDevTemplateWorkflowRuns = () => [{ status, createdAt: '2026-09-26T05:00:00Z', runId: 'saved-run' }]
    assert.deepEqual(devWorkflowSummary(request, id), { status, lastRun: '2026-09-26T05:00:00Z', lastExecutionId: 'saved-run' })
  }
  runs.listDevTemplateWorkflowRuns = () => []
  assert.deepEqual(devWorkflowSummary(request, id), {})
  runs.listDevTemplateWorkflowRuns = () => { throw new Error('Revoked') }
  assert.deepEqual(devWorkflowSummary(request, id), { status: 'blocked' })
  assert.deepEqual(devWorkflowSummary({}, 'ordinary-workflow'), {})
  chat.devHostSkillChatEnabled = () => false
  assert.deepEqual(devWorkflowSummary(request, id), {})
  console.log('dev-workflow-summary.test.ts: passed')
} finally {
  runs.listDevTemplateWorkflowRuns = originalRuns
  chat.devHostSkillChatEnabled = originalAdmission
}
