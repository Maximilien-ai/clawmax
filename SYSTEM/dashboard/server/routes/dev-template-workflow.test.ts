import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { admitDevWorkflowReadRequest, captureDevWorkflowAdmission, devRunAsExecution, formatDevWorkflowHandoff, getDevTemplateWorkflowRun, listDevTemplateWorkflowRuns, settleInterruptedDevRun, startDevTemplateWorkflow } from './dev-template-workflow'

const unauthorized = { get: () => undefined, socket: { remoteAddress: '192.0.2.1' } } as any
assert.throws(() => startDevTemplateWorkflow(unauthorized, 'tr-1234567890abcdef-workflow-123456789abc'), /unavailable/)
assert.throws(() => getDevTemplateWorkflowRun(unauthorized, 'tr-1234567890abcdef-workflow-123456789abc', '12345678-1234-1234-1234-123456789abc'), /unavailable/)
assert.throws(() => listDevTemplateWorkflowRuns(unauthorized, 'tr-1234567890abcdef-workflow-123456789abc', 10), /unavailable/)
assert.equal(getDevTemplateWorkflowRun(unauthorized, 'tr-1234567890abcdef-workflow-123456789abc', '../bad'), null)
assert.equal(formatDevWorkflowHandoff('Hello Group'), 'Hello Group')
assert.equal(formatDevWorkflowHandoff('{"kind":"Report","count":2}'), 'Collector structured report:\n> {"kind":"Report","count":2}')
assert.throws(() => formatDevWorkflowHandoff('  '), /unavailable/)
const running = { runId: 'run', workflowId: 'workflow', groupId: 'group', status: 'running' as const, createdAt: 'earlier' }
assert.equal(settleInterruptedDevRun(running, true, 'now'), running)
assert.deepEqual(settleInterruptedDevRun(running, false, 'now'), { ...running, status: 'failed', completedAt: 'now', error: 'Dev Workflow was interrupted before completion. Review its Group transcript before retrying.' })
let socketAddress: string | undefined = '127.0.0.1'
const captured = captureDevWorkflowAdmission({ get: () => 'http://localhost:5174', socket: { get remoteAddress() { return socketAddress } } } as any)
socketAddress = undefined
assert.equal(captured.get('Origin'), 'http://localhost:5174')
assert.equal(captured.socket.remoteAddress, '127.0.0.1', 'Background admission must survive response socket closure')
const browserGet = { method: 'GET', get: (header: string) => ({ 'Sec-Fetch-Site': 'same-origin', Referer: 'http://localhost:5174/workflows' })[header], socket: { remoteAddress: '127.0.0.1' } } as any
assert.equal(admitDevWorkflowReadRequest(browserGet).get('Origin'), 'http://localhost:5174')
const crossSiteGet = { ...browserGet, get: (header: string) => ({ 'Sec-Fetch-Site': 'cross-site', Referer: 'http://evil.invalid/' })[header] }
assert.equal(admitDevWorkflowReadRequest(crossSiteGet as any).get('Origin'), undefined)
assert.equal(admitDevWorkflowReadRequest({ ...browserGet, method: 'POST' } as any).get('Origin'), undefined)
assert.equal(admitDevWorkflowReadRequest({ ...browserGet, get: (header: string) => ({ 'Sec-Fetch-Site': 'same-origin', Referer: 'http://localhost:5174.evil.invalid/' })[header] } as any).get('Origin'), undefined)
const execution = devRunAsExecution({ ...running, status: 'completed', stage: 'completed', collectorId: 'collector', specialistId: 'specialist' })
assert.equal(execution.participants.length, 2)
assert.deepEqual(execution.participants.map(item => item.status), ['completed', 'completed'])
assert.equal(execution.triggerType, 'manual')

const source = fs.readFileSync(path.join(__dirname, 'dev-template-workflow.ts'), 'utf8')
assert(source.includes("workflow.enabled !== false"), 'Manual rehearsal must not enable imported schedules')
assert(source.includes("group.state !== 'stopped'"), 'Group runner must remain stopped')
assert(source.includes("addMessage('group', context.groupId, { from: context.collectorId"), 'Collector must hand off in the linked Group')
assert(source.includes("addMessage('group', context.groupId, { from: context.specialistId"), 'Specialist must reply in the linked Group')
assert(source.includes('service.store.verifyExecutionResources(actorId, revision.id, workflowId)'), 'Workflow resource integrity must be rechecked')
const routes = fs.readFileSync(path.join(__dirname, 'workflows.ts'), 'utf8')
assert(routes.includes("router.post('/:id/dev-run'"))
assert(routes.includes("router.get('/:id/dev-runs/:runId'"))
assert(routes.includes('listDevTemplateWorkflowRuns(req, id, limit).map(devRunAsExecution)'),
  'Manual dev runs must appear in normal Workflow execution history')
assert(routes.includes('devRunAsExecution(devRun)'), 'Manual dev run details must remain inspectable')
const vite = fs.readFileSync(path.join(__dirname, '../../vite.config.ts'), 'utf8')
assert(vite.includes('target: `http://127.0.0.1:${backendPort}`'), 'Dev proxy must target the IPv4 address bound by the API')
const client = fs.readFileSync(path.join(__dirname, '../../client/src/pages/Workflows.tsx'), 'utf8')
assert(client.includes('▶ Run once (dev)'))
const trigger = client.slice(client.indexOf('async function startWorkflowTrigger('), client.indexOf('const hasSecrets = (workflow.secretRequirements'))
assert(trigger.indexOf("if (/^tr-[a-f0-9]{16}-workflow-[a-f0-9]{12}$/.test(workflow.id))") < trigger.indexOf('if (pipelineState.paused)'),
  'Paused schedule must not block an explicitly requested manual dev Workflow run')
assert(client.includes('manualRunStatuses={new Map(') && client.includes('runningWorkflowIds={runningWorkflows}'),
  'Workflow graph must receive live manual-run status')
assert(client.includes('Execution history is unavailable. Choose Refresh to retry.')
  && client.includes('onClick={() => fetchWorkflowDetails(selectedWorkflow.id)}'),
  'Transient history failures must be visible and retryable instead of showing a false empty state')
assert(client.includes('{!selectedIsDevManual && <div className="rounded-lg border border-amber-200')
  && client.includes('Manual run participants (2)'),
  'Dev manual workflows must not offer the unsupported edited-values path or claim zero target Agents')
assert(client.includes("workflow.status === 'running' || runningWorkflows.has(workflow.id)"),
  'Header running count must include active manual runs')
const graph = fs.readFileSync(path.join(__dirname, '../../client/src/components/WorkflowDAG.tsx'), 'utf8')
assert(graph.includes('disabled={isManualRunning}') && graph.includes("Schedule off · manual {isManualRunning ? 'running' : manualStatus || 'ready'}"),
  'Manual-run cards must block duplicate clicks and distinguish schedule state from run state')
console.log('dev-template-workflow.test.ts: passed')
