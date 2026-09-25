import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { formatDevWorkflowHandoff, getDevTemplateWorkflowRun, settleInterruptedDevRun, startDevTemplateWorkflow } from './dev-template-workflow'

const unauthorized = { get: () => undefined, socket: { remoteAddress: '192.0.2.1' } } as any
assert.throws(() => startDevTemplateWorkflow(unauthorized, 'tr-1234567890abcdef-workflow-123456789abc'), /unavailable/)
assert.throws(() => getDevTemplateWorkflowRun(unauthorized, 'tr-1234567890abcdef-workflow-123456789abc', '12345678-1234-1234-1234-123456789abc'), /unavailable/)
assert.equal(getDevTemplateWorkflowRun(unauthorized, 'tr-1234567890abcdef-workflow-123456789abc', '../bad'), null)
assert.equal(formatDevWorkflowHandoff('Hello Group'), 'Hello Group')
assert.equal(formatDevWorkflowHandoff('{"kind":"Report","count":2}'), 'Collector structured report:\n> {"kind":"Report","count":2}')
assert.throws(() => formatDevWorkflowHandoff('  '), /unavailable/)
const running = { runId: 'run', workflowId: 'workflow', groupId: 'group', status: 'running' as const, createdAt: 'earlier' }
assert.equal(settleInterruptedDevRun(running, true, 'now'), running)
assert.deepEqual(settleInterruptedDevRun(running, false, 'now'), { ...running, status: 'failed', completedAt: 'now', error: 'Dev Workflow was interrupted before completion. Review its Group transcript before retrying.' })

const source = fs.readFileSync(path.join(__dirname, 'dev-template-workflow.ts'), 'utf8')
assert(source.includes("workflow.enabled !== false"), 'Manual rehearsal must not enable imported schedules')
assert(source.includes("group.state !== 'stopped'"), 'Group runner must remain stopped')
assert(source.includes("addMessage('group', context.groupId, { from: context.collectorId"), 'Collector must hand off in the linked Group')
assert(source.includes("addMessage('group', context.groupId, { from: context.specialistId"), 'Specialist must reply in the linked Group')
assert(source.includes('service.store.verifyExecutionResources(actorId, revision.id, workflowId)'), 'Workflow resource integrity must be rechecked')
const routes = fs.readFileSync(path.join(__dirname, 'workflows.ts'), 'utf8')
assert(routes.includes("router.post('/:id/dev-run'"))
assert(routes.includes("router.get('/:id/dev-runs/:runId'"))
const client = fs.readFileSync(path.join(__dirname, '../../client/src/pages/Workflows.tsx'), 'utf8')
assert(client.includes('▶ Run once (dev)'))
console.log('dev-template-workflow.test.ts: passed')
