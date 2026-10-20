import assert from 'assert'
import fs from 'fs'
import os from 'os'
import path from 'path'

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-cli-admission-'))
  // Isolate all filesystem/model/budget dependencies; never select or alter an
  // installed workspace, change HOME, spawn a model, or contact a gateway.
  const workspace = require('./workspace')
  const budget = require('./budget')
  const integrations = require('./workspace-integrations')
  const opik = require('./opik')
  const originals = [workspace.getWorkspacePath, workspace.listAgents, budget.checkBudgetBlock, integrations.readWorkspaceIntegrationConfig, opik.traceWorkflowExecution]
  workspace.getWorkspacePath = () => root
  workspace.listAgents = () => []
  budget.checkBudgetBlock = () => null
  integrations.readWorkspaceIntegrationConfig = () => ({})
  opik.traceWorkflowExecution = () => {}
  const workflows = require('./workflows')
  try {
    const parent = workflows.createWorkflow({
      name: 'CLI isolated parent', description: 'Synthetic scope check', owner: 'synthetic-owner',
      enabled: false, schedule: 'manual', content: 'Synthetic',
      targeting: { agents: ['synthetic-owner'], groups: [], tags: [], communities: [] },
    })
    assert(parent.success, JSON.stringify(parent))
    const child = workflows.createWorkflow({
      name: 'CLI unrelated dependent', description: 'Must remain unchanged', owner: 'synthetic-owner',
      enabled: true, schedule: 'manual', content: 'Synthetic', dependsOn: [parent.id],
      targeting: { agents: ['synthetic-owner'], groups: [], tags: [], communities: [] },
    })
    assert(child.success, JSON.stringify(child))
    workflows.updateWorkflow(child.id, { status: 'completed', progress: 100 })
    const before = JSON.stringify(workflows.getWorkflow(child.id))
    const run = workflows.triggerWorkflow(parent.id, { manual: true, mock: true, executionScope: 'single-workflow' })
    assert(run.success)
    assert.strictEqual(workflows.isWorkflowExecutionActive(parent.id, run.executionId), true)
    assert.strictEqual(workflows.isWorkflowExecutionActive(child.id, run.executionId), false)
    // The mock completes synchronously, but only the runner's finally settles it.
    assert.strictEqual(workflows.getExecution(parent.id, run.executionId).status, 'completed')
    await new Promise(resolve => setImmediate(resolve))
    assert.strictEqual(workflows.isWorkflowExecutionActive(parent.id, run.executionId), false)
    assert.strictEqual(JSON.stringify(workflows.getWorkflow(child.id)), before)
    assert.deepStrictEqual(workflows.listExecutions(child.id), [])
    assert.strictEqual(workflows.getWorkflow(parent.id).enabled, false)
    console.log('✓ single-workflow runs preserve dependent definitions, schedules, and history')
    console.log('✓ terminal execution files are distinct from settled runtime ownership')

    const parentBefore = JSON.stringify(workflows.getWorkflow(parent.id))
    const historyBefore = workflows.listExecutions(parent.id).length
    const rejected = workflows.triggerWorkflow(parent.id, {
      manual: true, mock: true, executionScope: 'single-workflow',
      assertAuthorized() { throw new Error('Synthetic revoked authorization') },
    })
    assert.strictEqual(rejected.success, false)
    assert.strictEqual(JSON.stringify(workflows.getWorkflow(parent.id)), parentBefore)
    assert.strictEqual(workflows.listExecutions(parent.id).length, historyBefore)
    console.log('✓ denied admission leaves definition and run history unchanged')
    assert.strictEqual(workflows.triggerWorkflow(parent.id, { manual: true, executionScope: 'single-workflow' }).success, false)
    assert.strictEqual(JSON.stringify(workflows.getWorkflow(parent.id)), parentBefore)
    assert.strictEqual(workflows.listExecutions(parent.id).length, historyBefore)
    console.log('✓ empty participant selection cannot create a successful empty run')
    const agentExecution = require('./agent-execution')
    workspace.listAgents = () => [{ id: 'synthetic-owner', name: 'Synthetic owner' }]
    for (const cancel of [false, true]) {
      let release!: () => void
      const held = new Promise<void>(resolve => { release = resolve })
      const lock = agentExecution.runExclusiveAgentExecution('synthetic-owner', () => held)
      let authorized = true
      let checks = 0
      try {
        const queued = workflows.triggerWorkflow(parent.id, {
          manual: true, executionScope: 'single-workflow',
          assertAuthorized() { checks++; if (!authorized) throw new Error('Revoked while queued') },
        })
        assert(queued.success)
        assert.strictEqual(checks, 1)
        if (cancel) {
          assert(workflows.cancelExecution(parent.id, queued.executionId).success)
          assert.strictEqual(workflows.getExecution(parent.id, queued.executionId).status, 'cancelled')
          assert.strictEqual(workflows.isWorkflowExecutionActive(parent.id, queued.executionId), true)
        } else authorized = false
        release()
        await lock
        for (let i = 0; i < 100 && workflows.isWorkflowExecutionActive(parent.id, queued.executionId); i++) {
          await new Promise(resolve => setImmediate(resolve))
        }
        assert.strictEqual(workflows.isWorkflowExecutionActive(parent.id, queued.executionId), false)
        assert.strictEqual(workflows.getExecution(parent.id, queued.executionId).status, cancel ? 'cancelled' : 'failed')
        assert.strictEqual(checks, cancel ? 1 : 2)
      } finally { release(); await lock }
    }
    console.log('✓ queued authorization is revalidated before runtime preparation')
    console.log('✓ queued cancellation settles without starting an agent')
    console.log('6 workflow CLI admission tests passed')
  } finally {
    ;[workspace.getWorkspacePath, workspace.listAgents, budget.checkBudgetBlock, integrations.readWorkspaceIntegrationConfig, opik.traceWorkflowExecution] = originals
    fs.rmSync(root, { recursive: true, force: true })
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
