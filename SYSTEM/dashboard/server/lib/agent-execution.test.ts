/**
 * Agent execution runtime test suite
 *
 * Run with: npx ts-node --transpileOnly server/lib/agent-execution.test.ts
 */

import fs from 'fs'
import os from 'os'
import path from 'path'
import { resolveAgentExecutionConfig, scopeSessionIdToModel, withTemporaryAgentAuthProfiles } from './agent-execution'

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const RESET = '\x1b[0m'

let testsPassed = 0
let testsFailed = 0

function test(name: string, fn: () => void | Promise<void>) {
  Promise.resolve()
    .then(fn)
    .then(() => {
      console.log(`${GREEN}✓${RESET} ${name}`)
      testsPassed++
    })
    .catch((err: any) => {
      console.log(`${RED}✗${RESET} ${name}`)
      console.error(`  Error: ${err.message}`)
      testsFailed++
    })
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

console.log(`\n${YELLOW}=== Agent Execution Test Suite ===${RESET}\n`)

const originalHome = process.env.HOME
const originalWorkspace = process.env.OPENCLAW_WORKSPACE

test('resolveAgentExecutionConfig falls back to IDENTITY model when openclaw.json omits model', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-exec-home-'))
  const workspace = path.join(home, 'workspace')
  const agentWorkspace = path.join(workspace, 'AGENTS', 'test1')
  const agentDir = path.join(home, '.openclaw', 'agents', 'test1', 'agent')
  fs.mkdirSync(agentWorkspace, { recursive: true })
  fs.mkdirSync(path.join(home, '.openclaw'), { recursive: true })
  fs.writeFileSync(path.join(agentWorkspace, 'IDENTITY.md'), '# Identity\n\n- **Model:** openai/gpt-4o-mini\n', 'utf-8')
  fs.writeFileSync(path.join(home, '.openclaw', 'openclaw.json'), JSON.stringify({
    agents: {
      list: [
        { id: 'test1', workspace: agentWorkspace, agentDir }
      ]
    }
  }, null, 2))

  process.env.HOME = home
  process.env.OPENCLAW_WORKSPACE = workspace

  const resolved = resolveAgentExecutionConfig('test1')
  assert(resolved.model === 'openai/gpt-4o-mini', 'Expected IDENTITY model fallback')
  assert(resolved.provider === 'openai', 'Expected provider derived from model')
})

test('resolveAgentExecutionConfig detects ollama provider from model', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-exec-home-'))
  const workspace = path.join(home, 'workspace')
  const agentWorkspace = path.join(workspace, 'AGENTS', 'test-ollama')
  const agentDir = path.join(home, '.openclaw', 'agents', 'test-ollama', 'agent')
  fs.mkdirSync(agentWorkspace, { recursive: true })
  fs.mkdirSync(path.join(home, '.openclaw'), { recursive: true })
  fs.writeFileSync(path.join(agentWorkspace, 'IDENTITY.md'), '# Identity\n\n- **Model:** ollama/qwen2.5:latest\n', 'utf-8')
  fs.writeFileSync(path.join(home, '.openclaw', 'openclaw.json'), JSON.stringify({
    agents: {
      list: [
        { id: 'test-ollama', workspace: agentWorkspace, agentDir, model: 'ollama/qwen2.5:latest' }
      ]
    }
  }, null, 2))

  process.env.HOME = home
  process.env.OPENCLAW_WORKSPACE = workspace

  const resolved = resolveAgentExecutionConfig('test-ollama')
  assert(resolved.model === 'ollama/qwen2.5:latest', 'Expected Ollama model to resolve')
  assert(resolved.provider === 'ollama', 'Expected provider derived from Ollama model')
})

test('scopeSessionIdToModel isolates chats across model changes', () => {
  const scoped = scopeSessionIdToModel('group:temp:test-agent1', 'ollama/qwen2.5:latest')
  assert(scoped.includes('group:temp:test-agent1:'), 'Expected original session prefix preserved')
  assert(scoped.includes('ollama-qwen2-5-latest'), 'Expected sanitized model suffix')
})

test('withTemporaryAgentAuthProfiles overrides stale auth profiles for the duration of execution', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-exec-home-'))
  const agentDir = path.join(home, '.openclaw', 'agents', 'test1', 'agent')
  const authProfilePath = path.join(agentDir, 'auth-profiles.json')
  const configPath = path.join(home, '.openclaw', 'openclaw.json')
  fs.mkdirSync(agentDir, { recursive: true })
  fs.mkdirSync(path.join(home, '.openclaw'), { recursive: true })
  fs.writeFileSync(configPath, JSON.stringify({
    agents: {
      list: [
        { id: 'test1', workspace: path.join(home, 'workspace', 'AGENTS', 'test1'), agentDir }
      ]
    }
  }, null, 2))
  fs.writeFileSync(authProfilePath, JSON.stringify({
    version: 1,
    profiles: {
      'anthropic-key': { type: 'api_key', provider: 'anthropic', key: 'stale-anthropic' }
    },
    lastGood: { anthropic: 'anthropic-key' }
  }, null, 2))

  process.env.HOME = home

  await withTemporaryAgentAuthProfiles('test1', { openai: 'fresh-openai' }, 'openai/gpt-4o-mini', 'openai', async () => {
    const current = JSON.parse(fs.readFileSync(authProfilePath, 'utf-8'))
    const currentConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    assert(current.profiles['openai-key']?.key === 'fresh-openai', 'Expected temporary OpenAI profile')
    assert(!current.profiles['anthropic-key'], 'Expected stale Anthropic profile to be absent during execution')
    assert(current.lastGood?.openai === 'openai-key', 'Expected OpenAI marked lastGood during execution')
    assert(currentConfig.agents.list[0].model === 'openai/gpt-4o-mini', 'Expected temporary model override in openclaw.json')
  })

  const restored = JSON.parse(fs.readFileSync(authProfilePath, 'utf-8'))
  const restoredConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
  assert(restored.profiles['anthropic-key']?.key === 'stale-anthropic', 'Expected previous auth profile restored')
  assert(restored.lastGood?.anthropic === 'anthropic-key', 'Expected previous lastGood restored')
  assert(typeof restoredConfig.agents.list[0].model === 'undefined', 'Expected previous openclaw.json model restored')
})

setTimeout(() => {
  if (typeof originalHome === 'undefined') delete process.env.HOME
  else process.env.HOME = originalHome
  if (typeof originalWorkspace === 'undefined') delete process.env.OPENCLAW_WORKSPACE
  else process.env.OPENCLAW_WORKSPACE = originalWorkspace

  console.log('\n========================================')
  console.log(`Tests passed: ${testsPassed}`)
  console.log(`Tests failed: ${testsFailed}`)
  console.log('========================================\n')

  if (testsFailed > 0) {
    console.log(`${RED}Some tests failed${RESET}`)
    process.exit(1)
  } else {
    console.log(`${GREEN}All tests passed${RESET}`)
  }
}, 50)
