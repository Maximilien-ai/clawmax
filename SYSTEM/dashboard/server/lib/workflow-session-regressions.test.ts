import {
  runExclusiveAgentExecution,
  isOpenClawSessionLockError,
  getAgentExecutionRetryDelay,
} from './agent-execution'
import {
  detectParticipantReportedFailure,
  parseWorkflowAgentResultPayload,
  repairWorkflowSessionEntryForRun,
  throwIfWorkflowAgentResultNeedsRetry,
} from './workflows'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { openClawConfigPath, openClawStatePath } from './openclaw-profile-paths'
import { resetAgentSessionsForModelChange } from './agent-model'
import { resolveAgentExecutionConfig } from './agent-execution'
import { syncAssignedSkillGuidanceForAgent } from './skills'

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const RESET = '\x1b[0m'

let testsPassed = 0
let testsFailed = 0

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn()
    console.log(`${GREEN}✓${RESET} ${name}`)
    testsPassed++
  } catch (err: any) {
    console.log(`${RED}✗${RESET} ${name}`)
    console.log(`  Error: ${err.message}`)
    testsFailed++
  }
}

async function run() {
  await test('selected OpenClaw profiles isolate workflow session repair, reset, and agent config', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-profile-'))
    const previous = { state: process.env.OPENCLAW_STATE_DIR, config: process.env.OPENCLAW_CONFIG_PATH, workspace: process.env.CLAWMAX_TEST_WORKSPACE }
    const state = path.join(root, 'state')
    const otherHome = path.join(root, 'other-home')
    const agentId = `profile-${path.basename(root)}`
    const sessionDir = path.join(state, 'agents', agentId, 'sessions')
    const otherDir = path.join(otherHome, '.openclaw', 'agents', agentId, 'sessions')
    const entry = JSON.stringify({ [`agent:${agentId}:main`]: { sessionId: 'workflow-old', sessionFile: 'workflow-old.jsonl' } })
    try {
      process.env.CLAWMAX_TEST_WORKSPACE = root
      for (const dir of [sessionDir, otherDir]) {
        fs.mkdirSync(dir, { recursive: true })
        fs.writeFileSync(path.join(dir, 'sessions.json'), entry)
        fs.writeFileSync(path.join(dir, 'workflow-old.jsonl'), JSON.stringify({ id: 'workflow-old' }))
      }
      process.env.OPENCLAW_STATE_DIR = state
      delete process.env.OPENCLAW_CONFIG_PATH
      assert(openClawStatePath() === state, 'Selected state root must win')
      assert(openClawStatePath(otherHome) === path.join(otherHome, '.openclaw'), 'Explicit legacy home must remain supported')
      assert(openClawConfigPath() === path.join(state, 'openclaw.json'), 'Config must default within selected state')
      const agentWorkspace = path.join(root, 'agent-workspace')
      fs.mkdirSync(agentWorkspace)
      const selectedConfig = path.join(root, 'custom.json')
      fs.writeFileSync(selectedConfig, JSON.stringify({ agents: { entries: { [agentId]: {
        model: 'ollama/qwen2.5:latest', workspace: agentWorkspace, agentDir: path.join(state, 'agents', agentId, 'agent'), skills: [],
      } } } }))
      process.env.OPENCLAW_CONFIG_PATH = selectedConfig
      assert(openClawConfigPath() === selectedConfig, 'Explicit config must win over state directory')
      const resolved = resolveAgentExecutionConfig(agentId)
      assert(resolved.workspace === agentWorkspace && resolved.model === 'ollama/qwen2.5:latest', 'Execution must read only selected configuration')
      syncAssignedSkillGuidanceForAgent(agentId, { agentWorkspaceDir: agentWorkspace })
      process.env.OPENCLAW_CONFIG_PATH = path.join(root, 'missing.json')
      let refused = false
      try { syncAssignedSkillGuidanceForAgent(agentId, { agentWorkspaceDir: agentWorkspace }) } catch { refused = true }
      assert(refused, 'Missing selected config must not discover another installed profile')
      assert(repairWorkflowSessionEntryForRun(agentId, 'workflow-new'), 'Selected session pointer should be repaired')
      assert(!JSON.parse(fs.readFileSync(path.join(sessionDir, 'sessions.json'), 'utf8'))[`agent:${agentId}:main`].sessionFile, 'Stale selected pointer removed')
      assert(fs.readFileSync(path.join(otherDir, 'sessions.json'), 'utf8') === entry, 'Unrelated profile must remain byte-identical')
      assert(resetAgentSessionsForModelChange(otherHome, agentId, state).ok, 'Selected session reset must succeed')
      assert(!fs.existsSync(path.join(sessionDir, 'sessions.json')), 'Selected session index archived')
      assert(fs.readFileSync(path.join(otherDir, 'sessions.json'), 'utf8') === entry, 'Reset must preserve unrelated profile')
    } finally {
      if (previous.state === undefined) delete process.env.OPENCLAW_STATE_DIR; else process.env.OPENCLAW_STATE_DIR = previous.state
      if (previous.config === undefined) delete process.env.OPENCLAW_CONFIG_PATH; else process.env.OPENCLAW_CONFIG_PATH = previous.config
      if (previous.workspace === undefined) delete process.env.CLAWMAX_TEST_WORKSPACE; else process.env.CLAWMAX_TEST_WORKSPACE = previous.workspace
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
  console.log(`\n${YELLOW}=== Workflow Session Regression Tests ===${RESET}\n`)

  await test('embedded session takeover errors are treated as lock conflicts', async () => {
    assert(
      isOpenClawSessionLockError(new Error('EmbeddedAttemptSessionTakeoverError: session file changed while embedded prompt lock was released')),
      'Expected embedded takeover error to be recognized as a lock conflict',
    )
  })

  await test('session takeover failures are surfaced as workflow participant failures', async () => {
    const detected = detectParticipantReportedFailure(
      'EmbeddedAttemptSessionTakeoverError: session file changed while embedded prompt lock was released: /tmp/agent.jsonl',
    )
    assert(!!detected, 'Expected takeover error to be surfaced as a workflow failure')
  })

  await test('same-agent execution retries once after embedded session takeover', async () => {
    let attempts = 0
    const result = await runExclusiveAgentExecution('workflow-regression-agent', async () => {
      attempts++
      if (attempts === 1) {
        throw new Error('EmbeddedAttemptSessionTakeoverError: session file changed while embedded prompt lock was released')
      }
      return 'ok'
    })
    assert(result === 'ok', `Expected retry to succeed, got ${result}`)
    assert(attempts === 2, `Expected exactly one retry, got ${attempts} attempts`)
  })

  await test('embedded CLI result text enters the repaired session retry path', async () => {
    let attempts = 0
    const result = await runExclusiveAgentExecution('workflow-embedded-result-agent', async () => {
      attempts++
      const text = attempts === 1
        ? 'EmbeddedAttemptSessionTakeoverError: session file changed while embedded prompt lock was released: /tmp/workflow-agent.jsonl'
        : 'completed'
      throwIfWorkflowAgentResultNeedsRetry(text)
      return text
    })

    assert(result === 'completed', `Expected embedded result retry to succeed, got ${result}`)
    assert(attempts === 2, `Expected exactly one retry for embedded result text, got ${attempts}`)
  })

  await test('non-JSON CLI diagnostics enter the repaired session retry path', async () => {
    let attempts = 0
    const result = await runExclusiveAgentExecution('workflow-diagnostic-result-agent', async () => {
      attempts++
      return parseWorkflowAgentResultPayload(attempts === 1
        ? '[provider-transport-fetch] status=200\nEmbeddedAttemptSessionTakeoverError: session file changed while embedded prompt lock was released: /tmp/workflow-agent.jsonl'
        : 'plain text completion')
    })

    assert(result.text === 'plain text completion', `Expected diagnostic retry to succeed, got ${result.text}`)
    assert(attempts === 2, `Expected exactly one retry for non-JSON diagnostic text, got ${attempts}`)
  })

  await test('workflow retry hook repairs stale session pointers before retry', async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-retry-repair-home-'))
    const sessionsDir = path.join(home, '.openclaw', 'agents', 'agent-a', 'sessions')
    fs.mkdirSync(sessionsDir, { recursive: true })
    const staleSessionFile = path.join(sessionsDir, 'legacy.jsonl')
    fs.writeFileSync(staleSessionFile, [
      JSON.stringify({ type: 'session', id: 'workflow-legacy-execution-agent-a' }),
      JSON.stringify({ type: 'message', message: { role: 'user', content: [] } }),
    ].join('\n'), 'utf-8')
    const sessionsPath = path.join(sessionsDir, 'sessions.json')
    fs.writeFileSync(sessionsPath, JSON.stringify({
      'agent:agent-a:main': {
        sessionId: 'wf-previous-agent-a',
        sessionFile: staleSessionFile,
        updatedAt: Date.now(),
      },
    }, null, 2), 'utf-8')

    let attempts = 0
    const result = await runExclusiveAgentExecution('agent-a', async () => {
      attempts++
      if (attempts === 1) {
        throw new Error('EmbeddedAttemptSessionTakeoverError: session file changed while embedded prompt lock was released')
      }
      return 'ok'
    }, {
      onSessionLockRetry: () => {
        const changed = repairWorkflowSessionEntryForRun('agent-a', 'wf-current-agent-a', home)
        assert(changed, 'Expected retry hook to repair stale workflow session pointer')
      },
    })

    const repaired = JSON.parse(fs.readFileSync(sessionsPath, 'utf-8'))
    assert(result === 'ok', `Expected retry-hook repair to succeed, got ${result}`)
    assert(!repaired['agent:agent-a:main'].sessionFile, 'Expected retry repair to remove stale sessionFile pointer')
  })

  await test('workflow retry delay remains bounded for repeated session conflicts', async () => {
    assert(getAgentExecutionRetryDelay(0) === 1500, `Expected 1500ms first retry delay, got ${getAgentExecutionRetryDelay(0)}`)
    assert(getAgentExecutionRetryDelay(4) === 5000, `Expected capped 5000ms retry delay, got ${getAgentExecutionRetryDelay(4)}`)
  })

  await test('workflow session recovery can be limited to one fresh-session retry', async () => {
    let attempts = 0
    let caught = false
    try {
      await runExclusiveAgentExecution('workflow-bounded-retry-agent', async () => {
        attempts++
        throw new Error('EmbeddedAttemptSessionTakeoverError: session file changed while embedded prompt lock was released')
      }, { maxSessionLockRetries: 1 })
    } catch {
      caught = true
    }
    assert(caught, 'Expected repeated workflow session conflict to escape after recovery')
    assert(attempts === 2, `Expected one workflow retry, got ${attempts - 1}`)
  })

  console.log(`\nTests passed: ${testsPassed}`)
  console.log(`Tests failed: ${testsFailed}`)

  if (testsFailed > 0) {
    console.log(`\n${RED}Some tests failed${RESET}`)
    process.exit(1)
  } else {
    console.log(`\n${GREEN}All tests passed${RESET}`)
  }
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
