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

  const agentId = 'runtime-stop-agent'
  const agentDir = path.join(workspace, 'AGENTS', agentId)
  fs.mkdirSync(agentDir, { recursive: true })
  fs.writeFileSync(path.join(agentDir, 'IDENTITY.md'), '# IDENTITY.md\n\n- **Name:** Runtime Stop\n- **Model:** anthropic/claude-sonnet-4-5\n- **Runtime:** claude\n')

  // The agent's runtime and its CLI turn are the boundary: stubbed, so nothing is spawned or billed.
  const agentExecution = require('./agent-execution')
  agentExecution.resolveAgentExecutionConfig = () => ({ runtime: 'claude', provider: 'anthropic', model: 'anthropic/claude-sonnet-4-5', workspace: agentDir })
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
    name: 'Runtime Stop',
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

  console.log('Workflow runtime stop tests passed')
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
