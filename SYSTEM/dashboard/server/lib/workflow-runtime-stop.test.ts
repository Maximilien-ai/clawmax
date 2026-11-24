/**
 * Stop on a workflow run must reach a Claude Code / Factory Droid step. Those steps run no OpenClaw
 * process, so the run used to be marked cancelled while the step kept working.
 *
 * Run with: npx ts-node --transpileOnly server/lib/workflow-runtime-stop.test.ts
 */

import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'

function withTimeout<T>(promise: Promise<T>, ms: number, message: () => string): Promise<T> {
  return Promise.race([promise, new Promise<T>((_, reject) => setTimeout(() => reject(new Error(message())), ms))])
}

async function main() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-workflow-runtime-stop-'))
  const workspace = path.join(home, 'workspace')
  for (const dir of ['AGENTS', 'ORG', 'SYSTEM', path.join('WORKFLOWS', 'executions')]) {
    fs.mkdirSync(path.join(workspace, dir), { recursive: true })
  }
  fs.writeFileSync(path.join(workspace, 'ORG', 'COMMUNITIES.md'), '# Communities\n\n## Communities\n\n')
  fs.writeFileSync(path.join(workspace, 'ORG', 'GROUPS.md'), '# Groups\n\n## Groups\n\n')
  process.env.HOME = home
  process.env.OPENCLAW_WORKSPACE = workspace
  // Checked before anything else: SYSTEM/dashboard/.env (loaded with override) may name the developer's
  // real workspace in OPENCLAW_WORKSPACE, and nothing here may be written there.
  process.env.CLAWMAX_TEST_WORKSPACE = workspace
  require('./workspace-manager').resetWorkspaceManagerForTests()

  for (const runtime of ['claude', 'droid']) {
    const agentId = 'runtime-stop-' + runtime
    const agentDir = path.join(workspace, 'AGENTS', agentId)
    fs.mkdirSync(agentDir, { recursive: true })
    fs.writeFileSync(path.join(agentDir, 'IDENTITY.md'), '# IDENTITY.md\n\n- **Name:** Runtime Stop\n- **Model:** anthropic/claude-sonnet-4-5\n- **Runtime:** claude\n')

    // The agent's runtime and its CLI turn are the boundary: stubbed, so nothing is spawned or billed.
    const agentExecution = require('./agent-execution')
    agentExecution.resolveAgentExecutionConfig = () => ({ runtime, provider: 'anthropic', model: 'anthropic/claude-sonnet-4-5', workspace: agentDir })
    let stepStarted: () => void = () => {}
    const started = new Promise<void>((resolve) => { stepStarted = resolve })
    let sawAbort = false
    require('./agent-runtime').executeAgentRuntimeTurn = (options: { signal: AbortSignal }) => new Promise((resolve) => {
      stepStarted()
      options.signal.addEventListener('abort', () => {
        sawAbort = true
        resolve({ text: '', errorText: 'Turn cancelled' })
      })
    })

    const { createWorkflow, triggerWorkflow, cancelExecution, getExecution } = require('./workflows')
    const created = createWorkflow({
      name: 'Runtime Stop ' + runtime,
      description: 'Stop a Claude Code step',
      schedule: 'manual',
      content: '# A long step',
      executionMode: 'automated',
      targeting: { agents: [agentId], groups: [], tags: [], communities: [] },
    })
    assert.ok(created.success && created.id, `Workflow should be created: ${created.error}`)

    const run = triggerWorkflow(created.id, { manual: true })
    assert.ok(run.success && run.executionId, `Run should start: ${run.error}`)
    await withTimeout(started, 10_000, () => `The Claude Code step never started: ${JSON.stringify(getExecution(created.id, run.executionId)?.logs?.slice(-4))}`)

    assert.ok(cancelExecution(created.id, run.executionId).success, 'Stop should be accepted')
    assert.ok(sawAbort, 'Stop must abort the running Claude Code step, not only mark the run cancelled')

    const { isWorkflowExecutionActive } = require('./workflows')
    const waitForSettlement = async (executionId: string) => {
      const deadline = Date.now() + 5000
      while (isWorkflowExecutionActive(created.id, executionId)) {
        assert.ok(Date.now() < deadline, 'Stopped workflow must release the runner')
        await new Promise(resolve => setTimeout(resolve, 10))
      }
      assert.equal(getExecution(created.id, executionId)?.status, 'cancelled')
    }
    await waitForSettlement(run.executionId)

    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const lock = agentExecution.runExclusiveAgentExecution(agentId, () => gate)
    let queuedDispatches = 0
    require('./agent-runtime').executeAgentRuntimeTurn = async () => {
      queuedDispatches++
      return { text: 'unexpected dispatch' }
    }
    try {
      const queued = triggerWorkflow(created.id, { manual: true })
      assert.ok(queued.success, queued.error)
      assert.ok(cancelExecution(created.id, queued.executionId).success)
      release()
      await waitForSettlement(queued.executionId)
      assert.equal(queuedDispatches, 0, 'Stop while queued must prevent runtime dispatch')
    } finally {
      release()
      await lock
    }
  }
  const { dispatchWorkflowParticipants, triggerWorkflow, getExecution, isWorkflowExecutionActive } = require('./workflows')
  for (const disabledPinnedRuntime of [undefined, 'droid']) {
    require('./agent-execution').resolveAgentExecutionConfig = () => ({
      runtime: 'openclaw', provider: 'openai', model: 'openai/gpt-image-1', disabledPinnedRuntime,
    })
    const rejected = triggerWorkflow('runtime-stop-claude', { manual: true })
    assert.ok(rejected.success, rejected.error)
    const deadline = Date.now() + 5000
    while (isWorkflowExecutionActive('runtime-stop-claude', rejected.executionId)) {
      assert.ok(Date.now() < deadline, 'Unsupported model must settle promptly')
      await new Promise(resolve => setTimeout(resolve, 10))
    }
    const rejectedRun = getExecution('runtime-stop-claude', rejected.executionId)
    assert.equal(rejectedRun.status, 'failed')
    assert.match(rejectedRun.participants[0].error, disabledPinnedRuntime ? /droid runtime is disabled/ : /generates images/)
  }
  for (const failOwner of [false, true]) {
    const participants = ['writer', 'research'].map(agentId => ({ agentId, status: 'pending', response: '' }))
    const calls: string[] = []
    await dispatchWorkflowParticipants({
      executionMode: 'managed', owner: 'research', targeting: { agents: ['writer'] },
    }, participants, async (p: typeof participants[number], handoff?: string) => {
      calls.push(p.agentId)
      if (p.agentId === 'writer') assert.match(handoff || '', /research:.*findings/s)
      p.status = failOwner ? 'failed' : 'completed'
      p.response = 'findings'
    })
    assert.deepEqual(calls, failOwner ? ['research'] : ['research', 'writer'])
    assert.equal(participants[0].status, failOwner ? 'cancelled' : 'completed')
  }
  console.log('Workflow runtime stop tests passed')
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
