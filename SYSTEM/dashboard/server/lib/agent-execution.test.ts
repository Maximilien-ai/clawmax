/**
 * Agent execution runtime test suite
 *
 * Run with: npx ts-node --transpileOnly server/lib/agent-execution.test.ts
 */

import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  getAgentExecutionRetryDelay,
  isOpenClawSessionLockError,
  resolveAgentExecutionConfig,
  runExclusiveAgentExecution,
  scopeSessionIdToModel,
  withTemporaryAgentAuthProfiles,
} from './agent-execution'
import { resetWorkspaceManagerForTests } from './workspace-manager'

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
  resetWorkspaceManagerForTests()

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
  resetWorkspaceManagerForTests()

  const resolved = resolveAgentExecutionConfig('test-ollama')
  assert(resolved.model === 'ollama/qwen2.5:latest', 'Expected Ollama model to resolve')
  assert(resolved.provider === 'ollama', 'Expected provider derived from Ollama model')
})

test('resolveAgentExecutionConfig prefers the active workspace agent when ids collide across workspaces', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-exec-home-'))
  const defaultWorkspace = path.join(home, '.openclaw', 'workspace')
  const activeWorkspace = path.join(home, '.openclaw', 'workspaces', 'clawmax-system-test')
  const defaultAgentWorkspace = path.join(defaultWorkspace, 'AGENTS', 'test1')
  const activeAgentWorkspace = path.join(activeWorkspace, 'AGENTS', 'test1')
  const agentDir = path.join(home, '.openclaw', 'agents', 'test1', 'agent')

  fs.mkdirSync(defaultAgentWorkspace, { recursive: true })
  fs.mkdirSync(activeAgentWorkspace, { recursive: true })
  fs.mkdirSync(path.join(home, '.openclaw'), { recursive: true })
  fs.writeFileSync(path.join(defaultAgentWorkspace, 'IDENTITY.md'), '# Identity\n\n- **Model:** anthropic/claude-opus-4-6\n', 'utf-8')
  fs.writeFileSync(path.join(activeAgentWorkspace, 'IDENTITY.md'), '# Identity\n\n- **Model:** ollama/qwen2.5:latest\n', 'utf-8')
  fs.writeFileSync(path.join(home, '.openclaw', 'openclaw.json'), JSON.stringify({
    agents: {
      list: [
        { id: 'test1', workspace: defaultAgentWorkspace, agentDir }
      ]
    }
  }, null, 2))
  fs.writeFileSync(path.join(home, '.openclaw', 'dashboard-workspaces.json'), JSON.stringify({
    version: '1.0.0',
    activeWorkspaceId: 'system-test',
    workspaces: [
      {
        id: 'default',
        name: 'Default',
        path: defaultWorkspace,
        createdAt: new Date().toISOString(),
        lastAccessedAt: new Date().toISOString(),
      },
      {
        id: 'system-test',
        name: 'ClawMax System Test',
        path: activeWorkspace,
        createdAt: new Date().toISOString(),
        lastAccessedAt: new Date().toISOString(),
      }
    ]
  }, null, 2))

  process.env.HOME = home
  process.env.OPENCLAW_WORKSPACE = activeWorkspace
  resetWorkspaceManagerForTests()

  const resolved = resolveAgentExecutionConfig('test1')
  assert(resolved.workspace === activeAgentWorkspace, 'Expected active workspace agent to win over stale global record')
  assert(resolved.model === 'ollama/qwen2.5:latest', 'Expected active workspace model to be used')
  assert(resolved.provider === 'ollama', 'Expected provider derived from active workspace model')
})

test('resolveAgentExecutionConfig prefers active workspace identity model over stale global model', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-exec-home-'))
  const defaultWorkspace = path.join(home, '.openclaw', 'workspace')
  const activeWorkspace = path.join(home, '.openclaw', 'workspaces', 'clawmax-system-test')
  const defaultAgentWorkspace = path.join(defaultWorkspace, 'AGENTS', 'test1')
  const activeAgentWorkspace = path.join(activeWorkspace, 'AGENTS', 'test1')
  const agentDir = path.join(home, '.openclaw', 'agents', 'test1', 'agent')

  fs.mkdirSync(defaultAgentWorkspace, { recursive: true })
  fs.mkdirSync(activeAgentWorkspace, { recursive: true })
  fs.mkdirSync(path.join(home, '.openclaw'), { recursive: true })
  fs.writeFileSync(path.join(defaultAgentWorkspace, 'IDENTITY.md'), '# Identity\n\n- **Model:** anthropic/claude-opus-4-6\n', 'utf-8')
  fs.writeFileSync(path.join(activeAgentWorkspace, 'IDENTITY.md'), '# Identity\n\n- **Model:** ollama/qwen2.5:latest\n', 'utf-8')
  fs.writeFileSync(path.join(home, '.openclaw', 'openclaw.json'), JSON.stringify({
    agents: {
      list: [
        { id: 'test1', workspace: defaultAgentWorkspace, agentDir, model: 'anthropic/claude-opus-4-6' }
      ]
    }
  }, null, 2))
  fs.writeFileSync(path.join(home, '.openclaw', 'dashboard-workspaces.json'), JSON.stringify({
    version: '1.0.0',
    activeWorkspaceId: 'system-test',
    workspaces: [
      { id: 'default', name: 'Default', path: defaultWorkspace, createdAt: new Date().toISOString(), lastAccessedAt: new Date().toISOString() },
      { id: 'system-test', name: 'ClawMax System Test', path: activeWorkspace, createdAt: new Date().toISOString(), lastAccessedAt: new Date().toISOString() },
    ]
  }, null, 2))

  process.env.HOME = home
  process.env.OPENCLAW_WORKSPACE = activeWorkspace
  resetWorkspaceManagerForTests()

  const resolved = resolveAgentExecutionConfig('test1')
  assert(resolved.model === 'ollama/qwen2.5:latest', 'Expected active workspace identity model to override stale global model')
  assert(resolved.provider === 'ollama', 'Expected provider derived from active workspace identity model')
})

test('scopeSessionIdToModel isolates chats across model changes', () => {
  const scoped = scopeSessionIdToModel('group:temp:test-agent1', 'ollama/qwen2.5:latest')
  assert(!scoped.includes(':'), 'Expected scoped session id to be sanitized for OpenClaw')
  assert(scoped.includes('group-temp-test-agent1'), 'Expected original session prefix preserved in safe form')
  assert(scoped.includes('ollama-qwen2-5-latest'), 'Expected sanitized model suffix')
})

test('isOpenClawSessionLockError matches lock timeout errors', () => {
  assert(
    isOpenClawSessionLockError(new Error('session file locked (timeout 10000ms)')),
    'Expected lock timeout error to be recognized'
  )
  assert(
    !isOpenClawSessionLockError(new Error('Agent timeout')),
    'Expected non-lock error to be ignored'
  )
})

test('getAgentExecutionRetryDelay uses bounded exponential backoff', () => {
  assert(getAgentExecutionRetryDelay(0) === 1500, 'Expected first retry delay to be 1500ms')
  assert(getAgentExecutionRetryDelay(1) === 3000, 'Expected second retry delay to be 3000ms')
  assert(getAgentExecutionRetryDelay(4) === 5000, 'Expected retry delay to cap at 5000ms')
})

test('runExclusiveAgentExecution serializes same-agent executions', async () => {
  const order: string[] = []
  let active = 0
  let maxActive = 0

  await Promise.all([
    runExclusiveAgentExecution('same-agent', async () => {
      active++
      maxActive = Math.max(maxActive, active)
      order.push('start-1')
      await new Promise(resolve => setTimeout(resolve, 20))
      order.push('end-1')
      active--
    }),
    runExclusiveAgentExecution('same-agent', async () => {
      active++
      maxActive = Math.max(maxActive, active)
      order.push('start-2')
      await new Promise(resolve => setTimeout(resolve, 5))
      order.push('end-2')
      active--
    }),
  ])

  assert(maxActive === 1, `Expected same-agent executions to serialize, saw concurrency ${maxActive}`)
  assert(order.join(',') === 'start-1,end-1,start-2,end-2', `Expected serialized order, got ${order.join(',')}`)
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
  resetWorkspaceManagerForTests()

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

test('withTemporaryAgentAuthProfiles preserves gateway config fields during temporary model override', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-exec-home-'))
  const agentDir = path.join(home, '.openclaw', 'agents', 'test1', 'agent')
  const authProfilePath = path.join(agentDir, 'auth-profiles.json')
  const configPath = path.join(home, '.openclaw', 'openclaw.json')
  fs.mkdirSync(agentDir, { recursive: true })
  fs.mkdirSync(path.join(home, '.openclaw'), { recursive: true })
  fs.writeFileSync(configPath, JSON.stringify({
    gateway: {
      auth: { token: 'stable-token' },
      remote: { token: 'stable-token' },
      tailscale: { enabled: true, hostname: 'stable-host' },
    },
    agents: {
      list: [
        { id: 'test1', workspace: path.join(home, 'workspace', 'AGENTS', 'test1'), agentDir, model: 'openai/gpt-4o-mini' }
      ]
    }
  }, null, 2))
  fs.writeFileSync(authProfilePath, JSON.stringify({ version: 1, profiles: {}, usageStats: {} }, null, 2))

  process.env.HOME = home
  resetWorkspaceManagerForTests()

  await withTemporaryAgentAuthProfiles('test1', { openai: 'fresh-openai' }, 'openai/gpt-4.1', 'openai', async () => {
    const currentConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    assert(currentConfig.gateway.auth.token === 'stable-token', 'Expected gateway auth token preserved during override')
    assert(currentConfig.gateway.remote.token === 'stable-token', 'Expected gateway remote token preserved during override')
    assert(currentConfig.gateway.tailscale.hostname === 'stable-host', 'Expected gateway tailscale config preserved during override')
    assert(currentConfig.agents.list[0].model === 'openai/gpt-4.1', 'Expected temporary model override applied')
  })

  const restoredConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
  assert(restoredConfig.gateway.auth.token === 'stable-token', 'Expected gateway auth token preserved after restore')
  assert(restoredConfig.gateway.remote.token === 'stable-token', 'Expected gateway remote token preserved after restore')
  assert(restoredConfig.gateway.tailscale.hostname === 'stable-host', 'Expected gateway tailscale config preserved after restore')
  assert(restoredConfig.agents.list[0].model === 'openai/gpt-4o-mini', 'Expected prior model restored after override')
})

test('withTemporaryAgentAuthProfiles updates the matching workspace record when ids collide', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-exec-home-'))
  const defaultWorkspace = path.join(home, '.openclaw', 'workspace')
  const activeWorkspace = path.join(home, '.openclaw', 'workspaces', 'clawmax-system-test')
  const defaultAgentWorkspace = path.join(defaultWorkspace, 'AGENTS', 'test1')
  const activeAgentWorkspace = path.join(activeWorkspace, 'AGENTS', 'test1')
  const agentDir = path.join(home, '.openclaw', 'agents', 'test1', 'agent')
  const authProfilePath = path.join(agentDir, 'auth-profiles.json')
  const configPath = path.join(home, '.openclaw', 'openclaw.json')

  fs.mkdirSync(defaultAgentWorkspace, { recursive: true })
  fs.mkdirSync(activeAgentWorkspace, { recursive: true })
  fs.mkdirSync(agentDir, { recursive: true })
  fs.mkdirSync(path.join(home, '.openclaw'), { recursive: true })
  fs.writeFileSync(path.join(defaultAgentWorkspace, 'IDENTITY.md'), '# Identity\n\n- **Model:** anthropic/claude-opus-4-6\n', 'utf-8')
  fs.writeFileSync(path.join(activeAgentWorkspace, 'IDENTITY.md'), '# Identity\n\n- **Model:** openai/gpt-4o-mini\n', 'utf-8')
  fs.writeFileSync(configPath, JSON.stringify({
    agents: {
      list: [
        { id: 'test1', workspace: defaultAgentWorkspace, agentDir, model: 'anthropic/claude-opus-4-6' },
        { id: 'test1', workspace: activeAgentWorkspace, agentDir, model: 'openai/gpt-4o-mini' },
      ]
    }
  }, null, 2))
  fs.writeFileSync(authProfilePath, JSON.stringify({ version: 1, profiles: {}, usageStats: {} }, null, 2))
  fs.writeFileSync(path.join(home, '.openclaw', 'dashboard-workspaces.json'), JSON.stringify({
    version: '1.0.0',
    activeWorkspaceId: 'system-test',
    workspaces: [
      { id: 'default', name: 'Default', path: defaultWorkspace, createdAt: new Date().toISOString(), lastAccessedAt: new Date().toISOString() },
      { id: 'system-test', name: 'ClawMax System Test', path: activeWorkspace, createdAt: new Date().toISOString(), lastAccessedAt: new Date().toISOString() },
    ]
  }, null, 2))

  process.env.HOME = home
  process.env.OPENCLAW_WORKSPACE = activeWorkspace
  resetWorkspaceManagerForTests()

  const before = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
  await withTemporaryAgentAuthProfiles('test1', { openai: 'fresh-openai' }, 'openai/gpt-4.1', 'openai', async () => {
    const currentConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    const defaultEntry = currentConfig.agents.list.find((agent: any) => agent.workspace === defaultAgentWorkspace)
    const activeEntry = currentConfig.agents.list.find((agent: any) => agent.workspace === activeAgentWorkspace)
    assert(defaultEntry.model === 'anthropic/claude-opus-4-6', 'Expected stale default workspace model to remain untouched')
    assert(activeEntry.model === 'openai/gpt-4.1', 'Expected active workspace record to receive temporary override')
  })

  const restored = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
  const defaultEntryBefore = before.agents.list.find((agent: any) => agent.workspace === defaultAgentWorkspace)
  const activeEntryBefore = before.agents.list.find((agent: any) => agent.workspace === activeAgentWorkspace)
  const defaultEntryAfter = restored.agents.list.find((agent: any) => agent.workspace === defaultAgentWorkspace)
  const activeEntryAfter = restored.agents.list.find((agent: any) => agent.workspace === activeAgentWorkspace)
  assert(defaultEntryAfter.model === defaultEntryBefore.model, 'Expected stale default workspace model restored untouched')
  assert(activeEntryAfter.model === activeEntryBefore.model, 'Expected active workspace model restored after temporary override')
})

test('withTemporaryAgentAuthProfiles bypasses auth-profile rewriting for ollama and skips config rewrite when model already matches', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-exec-home-'))
  const agentDir = path.join(home, '.openclaw', 'agents', 'test-ollama', 'agent')
  const authProfilePath = path.join(agentDir, 'auth-profiles.json')
  const configPath = path.join(home, '.openclaw', 'openclaw.json')
  fs.mkdirSync(agentDir, { recursive: true })
  fs.mkdirSync(path.join(home, '.openclaw'), { recursive: true })
  fs.writeFileSync(configPath, JSON.stringify({
    agents: {
      list: [
        { id: 'test-ollama', workspace: path.join(home, 'workspace', 'AGENTS', 'test-ollama'), agentDir, model: 'ollama/qwen2.5:latest' }
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
  resetWorkspaceManagerForTests()
  const before = fs.readFileSync(authProfilePath, 'utf-8')
  const beforeConfig = fs.readFileSync(configPath, 'utf-8')

  await withTemporaryAgentAuthProfiles('test-ollama', {}, 'ollama/qwen2.5:latest', 'ollama', async () => {
    const current = fs.readFileSync(authProfilePath, 'utf-8')
    const currentConfig = fs.readFileSync(configPath, 'utf-8')
    assert(current === before, 'Expected auth profiles unchanged for Ollama')
    assert(currentConfig === beforeConfig, 'Expected openclaw.json untouched when Ollama model already matches')
  })

  const restoredConfig = fs.readFileSync(configPath, 'utf-8')
  assert(restoredConfig === beforeConfig, 'Expected openclaw.json restored after temporary Ollama override')
})

test('withTemporaryAgentAuthProfiles injects and restores temporary Ollama provider config', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-exec-home-'))
  const agentDir = path.join(home, '.openclaw', 'agents', 'test-ollama', 'agent')
  const configPath = path.join(home, '.openclaw', 'openclaw.json')
  fs.mkdirSync(agentDir, { recursive: true })
  fs.mkdirSync(path.join(home, '.openclaw'), { recursive: true })
  fs.writeFileSync(configPath, JSON.stringify({
    agents: {
      list: [
        { id: 'test-ollama', workspace: path.join(home, 'workspace', 'AGENTS', 'test-ollama'), agentDir, model: 'ollama/qwen2.5:latest' }
      ]
    }
  }, null, 2))

  process.env.HOME = home
  resetWorkspaceManagerForTests()

  await withTemporaryAgentAuthProfiles('test-ollama', { ollamaBaseUrl: 'http://127.0.0.1:11434/' }, 'ollama/qwen2.5:latest', 'ollama', async () => {
    const currentConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    assert(currentConfig.models.providers.ollama.baseUrl === 'http://127.0.0.1:11434', 'Expected temporary Ollama base URL injected')
    assert(currentConfig.models.providers.ollama.api === 'ollama', 'Expected temporary Ollama api marker injected')
    assert(currentConfig.agents.list[0].model === 'ollama/qwen2.5:latest', 'Expected model to remain intact during Ollama execution')
  })

  const restoredConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
  assert(typeof restoredConfig.models === 'undefined', 'Expected temporary Ollama provider config removed after execution')
})

test('withTemporaryAgentAuthProfiles preserves existing Ollama provider config fields while applying a temporary base URL', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-exec-home-'))
  const agentDir = path.join(home, '.openclaw', 'agents', 'test-ollama', 'agent')
  const configPath = path.join(home, '.openclaw', 'openclaw.json')
  fs.mkdirSync(agentDir, { recursive: true })
  fs.mkdirSync(path.join(home, '.openclaw'), { recursive: true })
  fs.writeFileSync(configPath, JSON.stringify({
    models: {
      providers: {
        ollama: {
          api: 'ollama',
          baseUrl: 'http://old-host:11434',
          headers: {
            'X-Test': 'keep-me'
          }
        }
      }
    },
    agents: {
      list: [
        { id: 'test-ollama', workspace: path.join(home, 'workspace', 'AGENTS', 'test-ollama'), agentDir, model: 'ollama/qwen2.5:latest' }
      ]
    }
  }, null, 2))

  process.env.HOME = home
  resetWorkspaceManagerForTests()

  await withTemporaryAgentAuthProfiles('test-ollama', { ollamaBaseUrl: 'http://127.0.0.1:11434' }, 'ollama/qwen2.5:latest', 'ollama', async () => {
    const currentConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    assert(currentConfig.models.providers.ollama.baseUrl === 'http://127.0.0.1:11434', 'Expected temporary Ollama base URL override')
    assert(currentConfig.models.providers.ollama.headers['X-Test'] === 'keep-me', 'Expected existing Ollama provider fields preserved during override')
  })

  const restoredConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
  assert(restoredConfig.models.providers.ollama.baseUrl === 'http://old-host:11434', 'Expected prior Ollama base URL restored')
  assert(restoredConfig.models.providers.ollama.headers['X-Test'] === 'keep-me', 'Expected prior Ollama provider fields restored')
})

test('withTemporaryAgentAuthProfiles resets stale main sessions when the configured model changes', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-exec-home-'))
  const sessionsDir = path.join(home, '.openclaw', 'agents', 'test-ollama', 'sessions')
  const agentDir = path.join(home, '.openclaw', 'agents', 'test-ollama', 'agent')
  const configPath = path.join(home, '.openclaw', 'openclaw.json')
  fs.mkdirSync(sessionsDir, { recursive: true })
  fs.mkdirSync(agentDir, { recursive: true })
  fs.writeFileSync(path.join(sessionsDir, 'sessions.json'), JSON.stringify({
    'agent:test-ollama:main': {
      sessionId: 'group-test-ollama-ollama-qwen2-5-latest',
      modelProvider: 'anthropic',
      model: 'claude-opus-4-6',
      sessionFile: path.join(sessionsDir, 'prior.jsonl'),
      systemPromptReport: {
        provider: 'anthropic',
        model: 'claude-opus-4-6',
      }
    }
  }, null, 2), 'utf-8')
  fs.writeFileSync(path.join(sessionsDir, 'prior.jsonl'), '{"type":"message"}\n', 'utf-8')
  fs.writeFileSync(configPath, JSON.stringify({
    agents: {
      list: [
        { id: 'test-ollama', workspace: path.join(home, 'workspace', 'AGENTS', 'test-ollama'), agentDir, model: 'ollama/qwen2.5:latest' }
      ]
    }
  }, null, 2))

  process.env.HOME = home
  resetWorkspaceManagerForTests()

  await withTemporaryAgentAuthProfiles('test-ollama', {}, 'ollama/qwen2.5:latest', 'ollama', async () => {
    assert(!fs.existsSync(path.join(sessionsDir, 'sessions.json')), 'Expected stale sessions index archived before execution')
    assert(!fs.existsSync(path.join(sessionsDir, 'prior.jsonl')), 'Expected stale session transcript archived before execution')
  })

  const archiveDir = path.join(sessionsDir, 'archive')
  const archived = fs.readdirSync(archiveDir)
  assert(archived.some(name => name.endsWith('sessions.json')), 'Expected archived sessions index after reset')
  assert(archived.some(name => name.endsWith('prior.jsonl')), 'Expected archived session transcript after reset')
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
