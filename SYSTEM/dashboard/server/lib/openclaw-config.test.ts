import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  healDashboardManagedOpenClawConfig,
  writeDashboardManagedOpenClawConfig,
} from './openclaw-config'

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const RESET = '\x1b[0m'

let testsPassed = 0
let testsFailed = 0

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`${GREEN}✓${RESET} ${name}`)
    testsPassed++
  } catch (err: any) {
    console.log(`${RED}✗${RESET} ${name}`)
    console.error(`  Error: ${err.message}`)
    testsFailed++
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

console.log(`\n${YELLOW}=== OpenClaw Config Test Suite ===${RESET}\n`)

test('writeDashboardManagedOpenClawConfig strips unsupported dashboard-only agent keys before writing', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openclaw-config-test-'))
  const configPath = path.join(tmpDir, 'openclaw.json')

  writeDashboardManagedOpenClawConfig(configPath, {
    gateway: {
      auth: { token: 'stable-token' },
    },
    agents: {
      list: [
        {
          id: 'ceo',
          name: 'CEO',
          workspace: '/tmp/workspace/AGENTS/ceo',
          agentDir: '/tmp/.openclaw/agents/ceo/agent',
          model: 'openai/gpt-4.1',
          skills: ['github'],
          backupModel: 'anthropic/claude-sonnet-4-6',
        },
      ],
    },
  }, 'openclaw-config-test')

  const written = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
  const agent = written.agents.list[0]
  assert(agent.id === 'ceo', 'Expected supported id field to persist')
  assert(agent.model === 'openai/gpt-4.1', 'Expected supported model field to persist')
  assert(Array.isArray(agent.skills) && agent.skills[0] === 'github', 'Expected supported skills field to persist')
  assert(!('backupModel' in agent), 'Expected unsupported backupModel field to be stripped')
})

test('healDashboardManagedOpenClawConfig removes stale unsupported dashboard-only agent keys in place', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openclaw-config-test-'))
  const configPath = path.join(tmpDir, 'openclaw.json')

  fs.writeFileSync(configPath, JSON.stringify({
    agents: {
      list: [
        {
          id: 'ceo',
          model: 'openai/gpt-4o-mini',
          backupModel: 'anthropic/claude-sonnet-4-6',
        },
      ],
    },
  }, null, 2))

  const result = healDashboardManagedOpenClawConfig(configPath, 'openclaw-config-heal-test')
  assert(result.ok, result.error || 'Expected config heal to succeed')
  assert(result.changed === true, 'Expected config heal to report a change')

  const healed = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
  assert(!('backupModel' in healed.agents.list[0]), 'Expected stale unsupported backupModel to be removed')
})

console.log(`\nTests passed: ${testsPassed}`)
console.log(`Tests failed: ${testsFailed}`)

if (testsFailed > 0) {
  console.log(`\n${RED}Some tests failed${RESET}`)
  process.exit(1)
} else {
  console.log(`\n${GREEN}All tests passed${RESET}`)
}
