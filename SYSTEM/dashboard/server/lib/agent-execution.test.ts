/**
 * Agent execution runtime test suite
 *
 * Run with: npx ts-node --transpileOnly server/lib/agent-execution.test.ts
 */

import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  clearModelCache,
} from './model-discovery'
import {
  deriveWorkspaceRootFromAgentWorkspace,
  getAgentExecutionRetryDelay,
  isOpenClawSessionLockError,
  providerFromModel,
  readLatestAssistantTextFromPersistedSession,
  readLatestAssistantUsageFromPersistedSession,
  resolvePersistedAgentSessionId,
  resolveAgentExecutionConfig,
  runExclusiveAgentExecution,
  scopeSessionIdToModel,
  shouldUseExplicitBackupModelRetry,
  shouldRetryWithBackupModel,
  toExecutionModelOverride,
  withTemporaryAgentAuthProfiles,
} from './agent-execution'
import { REPO_ROOT } from './paths'
import { resetWorkspaceManagerForTests } from './workspace-manager'

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const RESET = '\x1b[0m'

let testsPassed = 0
let testsFailed = 0
let testQueue: Promise<void> = Promise.resolve()

function test(name: string, fn: () => void | Promise<void>) {
  testQueue = testQueue.then(async () => {
    try {
      await fn()
      console.log(`${GREEN}✓${RESET} ${name}`)
      testsPassed++
    } catch (err: any) {
      console.log(`${RED}✗${RESET} ${name}`)
      console.error(`  Error: ${err.message}`)
      testsFailed++
    }
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
  clearModelCache()
  resetWorkspaceManagerForTests()

  const resolved = resolveAgentExecutionConfig('test1')
  assert(resolved.model === 'openai/gpt-4o-mini', 'Expected IDENTITY model fallback')
  assert(resolved.provider === 'openai', 'Expected provider derived from model')
})

test('resolveAgentExecutionConfig includes a distinct backup model when configured', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-exec-home-'))
  const workspace = path.join(home, 'workspace')
  const agentWorkspace = path.join(workspace, 'AGENTS', 'backup-agent')
  const agentDir = path.join(home, '.openclaw', 'agents', 'backup-agent', 'agent')
  fs.mkdirSync(agentWorkspace, { recursive: true })
  fs.mkdirSync(path.join(home, '.openclaw'), { recursive: true })
  fs.writeFileSync(path.join(agentWorkspace, 'IDENTITY.md'), '# Identity\n\n- **Model:** openai/gpt-4o-mini\n- **Backup Model:** anthropic/claude-sonnet-4-20250514\n', 'utf-8')
  fs.writeFileSync(path.join(home, '.openclaw', 'openclaw.json'), JSON.stringify({
    agents: {
      list: [
        { id: 'backup-agent', workspace: agentWorkspace, agentDir, model: 'openai/gpt-4o-mini', backupModel: 'anthropic/claude-sonnet-4-20250514' }
      ]
    }
  }, null, 2))

  process.env.HOME = home
  process.env.OPENCLAW_WORKSPACE = workspace
  clearModelCache()
  resetWorkspaceManagerForTests()

  const resolved = resolveAgentExecutionConfig('backup-agent')
  assert(resolved.model === 'openai/gpt-4o-mini', 'Expected primary model to resolve')
  assert(resolved.backupModel === 'anthropic/claude-sonnet-4-6', 'Expected backup model to resolve')
  assert(resolved.backupProvider === 'anthropic', 'Expected backup provider derived from backup model')
})

test('resolveAgentExecutionConfig does not invent an implicit fallback model from runtime defaults', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-exec-home-'))
  const workspace = path.join(home, 'workspace')
  const agentWorkspace = path.join(workspace, 'AGENTS', 'legacy-openai-agent')
  const agentDir = path.join(home, '.openclaw', 'agents', 'legacy-openai-agent', 'agent')
  fs.mkdirSync(agentWorkspace, { recursive: true })
  fs.mkdirSync(path.join(home, '.openclaw'), { recursive: true })
  fs.writeFileSync(path.join(agentWorkspace, 'IDENTITY.md'), '# Identity\n\n- **Model:** openai/gpt-4o-mini\n', 'utf-8')
  fs.writeFileSync(path.join(home, '.openclaw', 'openclaw.json'), JSON.stringify({
    agents: {
      list: [
        { id: 'legacy-openai-agent', workspace: agentWorkspace, agentDir, model: 'openai/gpt-4o-mini' }
      ]
    }
  }, null, 2))

  process.env.HOME = home
  process.env.OPENCLAW_WORKSPACE = workspace
  clearModelCache()
  resetWorkspaceManagerForTests()

  const originalEnvOpenAi = process.env.SYSTEM_OPENAI_API_KEY
  ;(process.env as any).SYSTEM_OPENAI_API_KEY = 'sk-test'
  const originalGlobalFetch = globalThis.fetch
  globalThis.fetch = (async (input: any) => {
    if (String(input).includes('/api/models')) {
      return {
        ok: true,
        json: async () => ({
          data: [
            { id: 'openai/gpt-5' },
            { id: 'openai/gpt-4.1' },
          ],
        }),
      } as any
    }
    throw new Error(`Unexpected fetch call: ${String(input)}`)
  }) as any

  try {
    const resolved = resolveAgentExecutionConfig('legacy-openai-agent')
    assert(resolved.model === 'openai/gpt-4o-mini', `Expected configured model to remain primary, got ${resolved.model || 'missing'}`)
    assert(!('implicitFallbackModel' in resolved), 'Expected no implicit fallback model to be exposed')
  } finally {
    clearModelCache()
    globalThis.fetch = originalGlobalFetch
    if (typeof originalEnvOpenAi === 'undefined') delete (process.env as any).SYSTEM_OPENAI_API_KEY
    else (process.env as any).SYSTEM_OPENAI_API_KEY = originalEnvOpenAi
  }
})

test('resolveAgentExecutionConfig remaps retired openai/gpt-4o identities to openai/gpt-4.1', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-exec-home-'))
  const workspace = path.join(home, 'workspace')
  const agentWorkspace = path.join(workspace, 'AGENTS', 'double-agent')
  const agentDir = path.join(home, '.openclaw', 'agents', 'double-agent', 'agent')
  fs.mkdirSync(agentWorkspace, { recursive: true })
  fs.mkdirSync(path.join(home, '.openclaw'), { recursive: true })
  fs.writeFileSync(path.join(agentWorkspace, 'IDENTITY.md'), '# Identity\n\n- **Model:** openai/gpt-4o\n', 'utf-8')
  fs.writeFileSync(path.join(home, '.openclaw', 'openclaw.json'), JSON.stringify({
    agents: {
      list: [
        { id: 'double-agent', workspace: agentWorkspace, agentDir, model: 'openai/gpt-4o' }
      ]
    }
  }, null, 2))

  process.env.HOME = home
  process.env.OPENCLAW_WORKSPACE = workspace
  resetWorkspaceManagerForTests()

  const resolved = resolveAgentExecutionConfig('double-agent')
  assert(resolved.model === 'openai/gpt-4.1', `Expected retired gpt-4o identity to resolve to gpt-4.1, got ${resolved.model || 'missing'}`)
  assert(resolved.provider === 'openai', 'Expected provider to remain openai')
})

test('resolveAgentExecutionConfig defaults runtime to openclaw when no workspace default or per-agent pin is set', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-exec-home-'))
  const workspace = path.join(home, 'workspace')
  const agentWorkspace = path.join(workspace, 'AGENTS', 'runtime-default-agent')
  fs.mkdirSync(agentWorkspace, { recursive: true })
  fs.writeFileSync(path.join(agentWorkspace, 'IDENTITY.md'), '# Identity\n\n- **Model:** openai/gpt-4o-mini\n', 'utf-8')

  process.env.HOME = home
  process.env.OPENCLAW_WORKSPACE = workspace
  resetWorkspaceManagerForTests()

  const resolved = resolveAgentExecutionConfig('runtime-default-agent')
  assert(resolved.runtime === 'openclaw', `Expected default runtime openclaw, got ${resolved.runtime}`)
})

test('resolveAgentExecutionConfig runs an unpinned agent on openclaw even when CLIs are enabled', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-exec-home-'))
  const workspace = path.join(home, 'workspace')
  const agentWorkspace = path.join(workspace, 'AGENTS', 'runtime-workspace-agent')
  fs.mkdirSync(agentWorkspace, { recursive: true })
  fs.mkdirSync(path.join(workspace, 'SYSTEM'), { recursive: true })
  fs.writeFileSync(path.join(agentWorkspace, 'IDENTITY.md'), '# Identity\n\n- **Model:** anthropic/claude-sonnet-4-20250514\n', 'utf-8')
  fs.writeFileSync(path.join(workspace, 'SYSTEM', 'integrations.json'), JSON.stringify({ enabledRuntimes: ['claude', 'droid'] }, null, 2))

  process.env.HOME = home
  process.env.OPENCLAW_WORKSPACE = workspace
  resetWorkspaceManagerForTests()

  const resolved = resolveAgentExecutionConfig('runtime-workspace-agent')
  assert(resolved.runtime === 'openclaw', `Expected unpinned agent to run on openclaw, got ${resolved.runtime}`)
})

test('resolveAgentExecutionConfig honors a per-agent IDENTITY runtime pin when that CLI is enabled, else falls back to openclaw', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-exec-home-'))
  const workspace = path.join(home, 'workspace')
  const enabledAgent = path.join(workspace, 'AGENTS', 'runtime-pinned-enabled')
  const disabledAgent = path.join(workspace, 'AGENTS', 'runtime-pinned-disabled')
  fs.mkdirSync(enabledAgent, { recursive: true })
  fs.mkdirSync(disabledAgent, { recursive: true })
  fs.mkdirSync(path.join(workspace, 'SYSTEM'), { recursive: true })
  const identity = (rt: string) => `# Identity\n\n- **Model:** anthropic/claude-sonnet-4-20250514\n- **Runtime:** ${rt}\n`
  fs.writeFileSync(path.join(enabledAgent, 'IDENTITY.md'), identity('claude'), 'utf-8')
  fs.writeFileSync(path.join(disabledAgent, 'IDENTITY.md'), identity('droid'), 'utf-8')
  // only claude is enabled for the workspace
  fs.writeFileSync(path.join(workspace, 'SYSTEM', 'integrations.json'), JSON.stringify({ enabledRuntimes: ['claude'] }, null, 2))

  process.env.HOME = home
  process.env.OPENCLAW_WORKSPACE = workspace
  resetWorkspaceManagerForTests()

  assert(resolveAgentExecutionConfig('runtime-pinned-enabled').runtime === 'claude', 'Expected claude pin (enabled) to be honored')
  assert(resolveAgentExecutionConfig('runtime-pinned-disabled').runtime === 'openclaw', 'Expected droid pin (disabled) to fall back to openclaw')
})

test('deriveWorkspaceRootFromAgentWorkspace resolves AGENTS/<id> paths back to their workspace root', () => {
  const derived = deriveWorkspaceRootFromAgentWorkspace('/tmp/demo-workspace/AGENTS/jarvis')
  assert(derived === '/tmp/demo-workspace', 'Expected AGENTS/<id> path to resolve to workspace root')

  const passthrough = deriveWorkspaceRootFromAgentWorkspace('/tmp/already-root')
  assert(passthrough === '/tmp/already-root', 'Expected non-agent workspace paths to pass through')
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

test('resolveAgentExecutionConfig detects google-prefixed Gemini provider from model', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-exec-home-'))
  const workspace = path.join(home, 'workspace')
  const agentWorkspace = path.join(workspace, 'AGENTS', 'test-gemini')
  const agentDir = path.join(home, '.openclaw', 'agents', 'test-gemini', 'agent')
  fs.mkdirSync(agentWorkspace, { recursive: true })
  fs.mkdirSync(path.join(home, '.openclaw'), { recursive: true })
  fs.writeFileSync(path.join(agentWorkspace, 'IDENTITY.md'), '# Identity\n\n- **Model:** google/gemini-2.5-flash\n', 'utf-8')
  fs.writeFileSync(path.join(home, '.openclaw', 'openclaw.json'), JSON.stringify({
    agents: {
      list: [
        { id: 'test-gemini', workspace: agentWorkspace, agentDir, model: 'google/gemini-2.5-flash' }
      ]
    }
  }, null, 2))

  process.env.HOME = home
  process.env.OPENCLAW_WORKSPACE = workspace
  resetWorkspaceManagerForTests()

  const resolved = resolveAgentExecutionConfig('test-gemini')
  assert(resolved.model === 'google/gemini-2.5-flash', 'Expected Google Gemini model to resolve')
  assert(resolved.provider === 'gemini', 'Expected provider derived from Google Gemini model')
})

test('resolveAgentExecutionConfig preserves configured hosted model even when server discovery does not advertise it', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-exec-home-'))
  const workspace = path.join(home, 'workspace')
  const agentWorkspace = path.join(workspace, 'AGENTS', 'test-stale-openai')
  const agentDir = path.join(home, '.openclaw', 'agents', 'test-stale-openai', 'agent')
  fs.mkdirSync(agentWorkspace, { recursive: true })
  fs.mkdirSync(path.join(home, '.openclaw'), { recursive: true })
  fs.writeFileSync(path.join(agentWorkspace, 'IDENTITY.md'), '# Identity\n\n- **Model:** openai/gpt-5.5\n', 'utf-8')
  fs.writeFileSync(path.join(home, '.openclaw', 'openclaw.json'), JSON.stringify({
    agents: {
      list: [
        { id: 'test-stale-openai', workspace: agentWorkspace, agentDir, model: 'openai/gpt-5.5' }
      ]
    }
  }, null, 2))

  process.env.HOME = home
  process.env.OPENCLAW_WORKSPACE = workspace
  process.env.SYSTEM_OPENAI_API_KEY = 'test-openai-key'
  resetWorkspaceManagerForTests()

  const resolved = resolveAgentExecutionConfig('test-stale-openai')
  assert(resolved.model === 'openai/gpt-5.5', `Expected configured hosted model to be preserved for BYOK execution, got ${resolved.model || 'missing'}`)
  assert(resolved.provider === 'openai', 'Expected provider to remain openai')
})

test('resolveAgentExecutionConfig prefers active workspace OpenAI identity model over stale Ollama config', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-exec-home-'))
  const workspace = path.join(home, 'workspace')
  const agentWorkspace = path.join(workspace, 'AGENTS', 'simple-agent')
  const agentDir = path.join(home, '.openclaw', 'agents', 'simple-agent', 'agent')
  fs.mkdirSync(path.join(workspace, 'SYSTEM'), { recursive: true })
  fs.mkdirSync(agentWorkspace, { recursive: true })
  fs.mkdirSync(path.join(home, '.openclaw'), { recursive: true })
  fs.writeFileSync(path.join(workspace, 'SYSTEM', 'integrations.json'), JSON.stringify({
    ollamaBaseUrl: 'http://127.0.0.1:11434',
    ollamaDefaultModel: 'qwen2.5:latest',
  }, null, 2), 'utf-8')
  fs.writeFileSync(path.join(agentWorkspace, 'IDENTITY.md'), `# IDENTITY.md - Who Am I?

- **Name:** simple-agent
- **Model:** openai/gpt-4o-mini
- **Tags:** basic

## Creation Metadata

- **Model:** ollama/qwen2.5:latest
`, 'utf-8')
  fs.writeFileSync(path.join(home, '.openclaw', 'openclaw.json'), JSON.stringify({
    agents: {
      list: [
        { id: 'simple-agent', workspace: agentWorkspace, agentDir, model: 'ollama/qwen2.5:latest' }
      ]
    }
  }, null, 2))

  process.env.HOME = home
  process.env.OPENCLAW_WORKSPACE = workspace
  delete process.env.SYSTEM_OPENAI_API_KEY
  resetWorkspaceManagerForTests()

  const resolved = resolveAgentExecutionConfig('simple-agent')
  assert(resolved.model === 'openai/gpt-4o-mini', `Expected active identity OpenAI model to win over stale Ollama config, got ${resolved.model || 'missing'}`)
  assert(resolved.provider === 'openai', 'Expected provider to be OpenAI for active identity model')
})

test('resolveAgentExecutionConfig falls back from stale openai-compatible model to workspace default', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-exec-home-'))
  const workspace = path.join(home, 'workspace')
  const agentWorkspace = path.join(workspace, 'AGENTS', 'test-stale-compatible')
  const agentDir = path.join(home, '.openclaw', 'agents', 'test-stale-compatible', 'agent')
  fs.mkdirSync(path.join(workspace, 'SYSTEM'), { recursive: true })
  fs.mkdirSync(agentWorkspace, { recursive: true })
  fs.mkdirSync(path.join(home, '.openclaw'), { recursive: true })
  fs.writeFileSync(path.join(workspace, 'SYSTEM', 'integrations.json'), JSON.stringify({
    openaiCompatibleBaseUrl: 'http://host.containers.internal:1234/v1',
    openaiCompatibleDefaultModel: 'lmstudio-default',
  }, null, 2), 'utf-8')
  fs.writeFileSync(path.join(agentWorkspace, 'IDENTITY.md'), '# Identity\n\n- **Model:** openai-compatible/old-stale-model\n', 'utf-8')
  fs.writeFileSync(path.join(home, '.openclaw', 'openclaw.json'), JSON.stringify({
    agents: {
      list: [
        { id: 'test-stale-compatible', workspace: agentWorkspace, agentDir, model: 'openai-compatible/old-stale-model' }
      ]
    }
  }, null, 2))

  process.env.HOME = home
  process.env.OPENCLAW_WORKSPACE = workspace
  resetWorkspaceManagerForTests()

  const resolved = resolveAgentExecutionConfig('test-stale-compatible')
  assert(resolved.model === 'openai-compatible/lmstudio-default', `Expected stale OpenAI-compatible model to fall back to workspace default, got ${resolved.model || 'missing'}`)
  assert(resolved.provider === 'openai-compatible', 'Expected provider to remain openai-compatible after fallback')
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

test('toExecutionModelOverride maps OpenClaw-retired OpenAI models to the supported mini model', () => {
  assert(toExecutionModelOverride('openai/gpt-4o-mini', 'openai') === 'openai/gpt-5.4-mini', 'Expected gpt-4o-mini execution remap')
  assert(toExecutionModelOverride('openai/gpt-4o', 'openai') === 'openai/gpt-5.4-mini', 'Expected gpt-4o execution remap')
  assert(toExecutionModelOverride('openai/gpt-4.1', 'openai') === 'openai/gpt-5.4-mini', 'Expected gpt-4.1 execution remap')
  assert(toExecutionModelOverride('openai/gpt-4.1-mini', 'openai') === 'openai/gpt-5.4-mini', 'Expected gpt-4.1-mini execution remap')
  assert(toExecutionModelOverride('openai/gpt-5', 'openai') === 'openai/gpt-5.4-mini', 'Expected unsupported gpt-5 alias execution remap')
  assert(toExecutionModelOverride('openai/gpt-5.4', 'openai') === 'openai/gpt-5.4', 'Expected supported OpenAI model unchanged')
})

test('providerFromModel and shouldRetryWithBackupModel classify backup-retry conditions', () => {
  assert(providerFromModel('anthropic/claude-sonnet-4-20250514') === 'anthropic', 'Expected providerFromModel to detect Anthropic provider')
  assert(providerFromModel('google/gemma-4-31b-it') === 'gemini', 'Expected hosted Gemma to use the Gemini provider')
  assert(toExecutionModelOverride('google/gemma-4-31b-it', 'gemini') === 'google/gemma-4-31b-it', 'Expected hosted Gemma model to reach OpenClaw unchanged')
  assert(providerFromModel('openrouter/anthropic/claude-sonnet-4') === 'openrouter', 'Expected providerFromModel to preserve native OpenRouter provider')
  assert(providerFromModel('xai/grok-4.3') === 'xai', 'Expected providerFromModel to preserve native xAI provider')
  assert(shouldRetryWithBackupModel('Agent timeout (3 minutes)'), 'Expected timeout to trigger backup retry')
  assert(shouldRetryWithBackupModel('Unknown model: gpt-super-pro'), 'Expected unsupported model to trigger backup retry')
  assert(!shouldRetryWithBackupModel('The agent replied with a blocked business rule.'), 'Expected semantic failures not to trigger backup retry')
})

test('shouldUseExplicitBackupModelRetry only retries when an explicit backup model exists', () => {
  assert(
    shouldUseExplicitBackupModelRetry({
      backupModel: 'anthropic/claude-sonnet-4-6',
      backupProvider: 'anthropic',
      rawError: 'Unknown model: openai/gpt-4o-mini',
    }),
    'Expected retry when explicit backup model is configured for a retryable failure'
  )
  assert(
    !shouldUseExplicitBackupModelRetry({
      backupProvider: 'anthropic',
      rawError: 'Unknown model: openai/gpt-4o-mini',
    }),
    'Expected no retry when no explicit backup model is configured'
  )
  assert(
    !shouldUseExplicitBackupModelRetry({
      backupModel: 'anthropic/claude-sonnet-4-6',
      backupProvider: 'anthropic',
      rawError: 'Unknown model: openai/gpt-4o-mini',
      hadVisibleOutput: true,
    }),
    'Expected no retry after visible partial output'
  )
  assert(
    !shouldUseExplicitBackupModelRetry({
      backupModel: 'anthropic/claude-sonnet-4-6',
      backupProvider: 'anthropic',
      rawError: 'Unknown model: openai/gpt-4o-mini',
      completionText: 'Hello from the primary model',
    }),
    'Expected no retry after a successful primary completion'
  )
})

test('resolvePersistedAgentSessionId uses mapped session file when preferred alias has no file', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-session-home-'))
  const sessionsDir = path.join(home, '.openclaw', 'agents', 'ceo', 'sessions')
  fs.mkdirSync(sessionsDir, { recursive: true })
  fs.writeFileSync(path.join(sessionsDir, 'real-session.jsonl'), '{"type":"message"}\n', 'utf-8')
  fs.writeFileSync(path.join(sessionsDir, 'sessions.json'), JSON.stringify({
    'agent:ceo:dashboard-chat': {
      sessionId: 'real-session'
    }
  }, null, 2))

  const resolved = resolvePersistedAgentSessionId(
    'ceo',
    'agent:ceo:dashboard-chat',
    'missing-dashboard-alias',
    home
  )

  assert(resolved === 'real-session', `Expected mapped session id, got ${resolved}`)
})

test('resolvePersistedAgentSessionId falls back to newest session file when no mapping resolves', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-session-home-'))
  const sessionsDir = path.join(home, '.openclaw', 'agents', 'ceo', 'sessions')
  fs.mkdirSync(sessionsDir, { recursive: true })
  const olderPath = path.join(sessionsDir, 'older-session.jsonl')
  const newerPath = path.join(sessionsDir, 'newer-session.jsonl')
  fs.writeFileSync(olderPath, '{"type":"message"}\n', 'utf-8')
  fs.writeFileSync(newerPath, '{"type":"message"}\n', 'utf-8')
  const olderTime = Date.now() - 10_000
  const newerTime = Date.now()
  fs.utimesSync(olderPath, olderTime / 1000, olderTime / 1000)
  fs.utimesSync(newerPath, newerTime / 1000, newerTime / 1000)

  const resolved = resolvePersistedAgentSessionId(
    'ceo',
    'agent:ceo:dashboard-chat',
    'missing-dashboard-alias',
    home
  )

  assert(resolved === 'newer-session', `Expected newest session fallback, got ${resolved}`)
})

test('readLatestAssistantUsageFromPersistedSession extracts latest assistant usage from resolved session file', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-session-home-'))
  const sessionsDir = path.join(home, '.openclaw', 'agents', 'ceo', 'sessions')
  fs.mkdirSync(sessionsDir, { recursive: true })
  fs.writeFileSync(path.join(sessionsDir, 'sessions.json'), JSON.stringify({
    'agent:ceo:dashboard-chat': {
      sessionId: 'real-session',
      updatedAt: Date.now(),
    }
  }, null, 2), 'utf-8')
  fs.writeFileSync(path.join(sessionsDir, 'real-session.jsonl'), [
    JSON.stringify({ type: 'message', message: { role: 'user', content: [{ type: 'text', text: 'status' }] } }),
    JSON.stringify({
      type: 'message',
      message: {
        role: 'assistant',
        provider: 'openai',
        model: 'gpt-4o-mini',
        usage: {
          input: 145,
          output: 60,
          cacheRead: 13056,
          cost: { total: 0.00110223 },
        },
      },
    }),
  ].join('\n'), 'utf-8')

  const usage = readLatestAssistantUsageFromPersistedSession('ceo', 'agent:ceo:dashboard-chat', 'dashboard-chat', home)
  assert(usage?.sessionId === 'real-session', `Expected resolved session id, got ${usage?.sessionId}`)
  assert(usage?.inputTokens === 145, `Expected input tokens, got ${usage?.inputTokens}`)
  assert(usage?.outputTokens === 60, `Expected output tokens, got ${usage?.outputTokens}`)
  assert(usage?.cacheReadTokens === 13056, `Expected cache read tokens, got ${usage?.cacheReadTokens}`)
  assert(usage?.model === 'gpt-4o-mini', `Expected model, got ${usage?.model}`)
  assert(usage?.provider === 'openai', `Expected provider, got ${usage?.provider}`)
  assert(Math.abs((usage?.estimatedCostUsd || 0) - 0.00110223) < 0.0000001, `Expected estimated cost, got ${usage?.estimatedCostUsd}`)
})

test('readLatestAssistantUsageFromPersistedSession returns session id even when usage is missing', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-session-home-'))
  const sessionsDir = path.join(home, '.openclaw', 'agents', 'ceo', 'sessions')
  fs.mkdirSync(sessionsDir, { recursive: true })
  fs.writeFileSync(path.join(sessionsDir, 'latest-session.jsonl'), [
    JSON.stringify({ type: 'message', message: { role: 'assistant', content: [{ type: 'text', text: 'hello' }] } }),
  ].join('\n'), 'utf-8')

  const usage = readLatestAssistantUsageFromPersistedSession('ceo', 'agent:ceo:dashboard-chat', undefined, home)
  assert(usage?.sessionId === 'latest-session', `Expected newest session fallback, got ${usage?.sessionId}`)
  assert((usage?.inputTokens || 0) === 0, `Expected zero input tokens when usage missing, got ${usage?.inputTokens}`)
  assert((usage?.outputTokens || 0) === 0, `Expected zero output tokens when usage missing, got ${usage?.outputTokens}`)
})

test('readLatestAssistantTextFromPersistedSession extracts assistant text from resolved session file', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-session-home-'))
  const sessionsDir = path.join(home, '.openclaw', 'agents', 'ceo', 'sessions')
  fs.mkdirSync(sessionsDir, { recursive: true })
  fs.writeFileSync(path.join(sessionsDir, 'sessions.json'), JSON.stringify({
    'agent:ceo:dashboard-chat': {
      sessionId: 'current-session',
      updatedAt: Date.now(),
    }
  }, null, 2), 'utf-8')
  fs.writeFileSync(path.join(sessionsDir, 'current-session.jsonl'), [
    JSON.stringify({ type: 'message', message: { role: 'user', content: [{ type: 'text', text: 'who are you?' }] } }),
    JSON.stringify({ type: 'message', message: { role: 'assistant', content: [{ type: 'text', text: "I'm the CEO agent." }] } }),
  ].join('\n'), 'utf-8')

  const latest = readLatestAssistantTextFromPersistedSession('ceo', 'agent:ceo:dashboard-chat', undefined, home)
  assert(latest?.sessionId === 'current-session', `Expected resolved session id, got ${latest?.sessionId}`)
  assert(latest?.content === "I'm the CEO agent.", `Expected assistant text from persisted session, got ${latest?.content}`)
})

test('isOpenClawSessionLockError matches lock timeout errors', () => {
  assert(
    isOpenClawSessionLockError(new Error('session file locked (timeout 10000ms)')),
    'Expected lock timeout error to be recognized'
  )
  assert(
    isOpenClawSessionLockError(new Error('EmbeddedAttemptSessionTakeoverError: session file changed while embedded prompt lock was released')),
    'Expected embedded session takeover errors to be recognized'
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

test('runExclusiveAgentExecution retries embedded session takeover errors for the same agent', async () => {
  let attempts = 0

  const result = await runExclusiveAgentExecution('retry-agent', async () => {
    attempts++
    if (attempts === 1) {
      throw new Error('EmbeddedAttemptSessionTakeoverError: session file changed while embedded prompt lock was released')
    }
    return 'ok'
  })

  assert(result === 'ok', `Expected retry to eventually succeed, got ${result}`)
  assert(attempts === 2, `Expected one retry after takeover error, got ${attempts} attempts`)
})

test('runExclusiveAgentExecution invokes retry hook for embedded session takeover errors', async () => {
  let attempts = 0
  let retryHookCalls = 0

  const result = await runExclusiveAgentExecution('retry-hook-agent', async () => {
    attempts++
    if (attempts === 1) {
      throw new Error('EmbeddedAttemptSessionTakeoverError: session file changed while embedded prompt lock was released')
    }
    return 'ok'
  }, {
    onSessionLockRetry: async (attempt, error) => {
      retryHookCalls++
      assert(attempt === 0, `Expected first retry attempt index 0, got ${attempt}`)
      assert(isOpenClawSessionLockError(error), 'Expected retry hook to receive session lock error')
    },
  })

  assert(result === 'ok', `Expected retry-hook execution to succeed, got ${result}`)
  assert(retryHookCalls === 1, `Expected retry hook to run once, got ${retryHookCalls}`)
})

test('runExclusiveAgentExecution supports a single bounded session recovery attempt', async () => {
  let attempts = 0
  let caught = false

  try {
    await runExclusiveAgentExecution('bounded-retry-agent', async () => {
      attempts++
      throw new Error('EmbeddedAttemptSessionTakeoverError: session file changed while embedded prompt lock was released')
    }, { maxSessionLockRetries: 1 })
  } catch {
    caught = true
  }

  assert(caught, 'Expected repeated session conflict to escape after bounded recovery')
  assert(attempts === 2, `Expected one recovery retry, got ${attempts - 1}`)
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
    const matchingAgent = currentConfig.agents.list.find((agent: any) => agent.id === 'test1' && agent.model === 'openai/gpt-4o-mini')
    assert(current.profiles['openai-key']?.key === 'fresh-openai', 'Expected temporary OpenAI profile')
    assert(!current.profiles['anthropic-key'], 'Expected stale Anthropic profile to be absent during execution')
    assert(current.lastGood?.openai === 'openai-key', 'Expected OpenAI marked lastGood during execution')
    assert(!!matchingAgent, 'Expected resolved execution model to be represented in openclaw.json')
  })

  const restored = JSON.parse(fs.readFileSync(authProfilePath, 'utf-8'))
  const restoredConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
  const restoredMatchingAgent = restoredConfig.agents.list.find((agent: any) => agent.id === 'test1' && agent.model === 'openai/gpt-4o-mini')
  assert(restored.profiles['anthropic-key']?.key === 'stale-anthropic', 'Expected previous auth profile restored')
  assert(restored.lastGood?.anthropic === 'anthropic-key', 'Expected previous lastGood restored')
  assert(!!restoredMatchingAgent, 'Expected workspace record to keep the resolved execution model')
})

test('withTemporaryAgentAuthProfiles writes both gemini and google auth profiles for Gemini execution', async () => {
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

  process.env.HOME = home
  resetWorkspaceManagerForTests()

  await withTemporaryAgentAuthProfiles('test1', { openai: 'openai-key', gemini: 'gemini-key' }, 'google/gemini-2.5-flash', 'gemini', async () => {
    const current = JSON.parse(fs.readFileSync(authProfilePath, 'utf-8'))
    assert(current.profiles['gemini-key']?.provider === 'gemini', 'Expected gemini auth profile during execution')
    assert(current.profiles['google-key']?.provider === 'google', 'Expected google auth profile during execution')
    assert(current.lastGood?.google === 'google-key', 'Expected google provider selected as lastGood')
    assert(!current.lastGood?.openai, 'Did not expect openai lastGood to override Gemini preference')
  })
})

test('withTemporaryAgentAuthProfiles writes a native OpenRouter auth profile', async () => {
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

  process.env.HOME = home
  resetWorkspaceManagerForTests()

  await withTemporaryAgentAuthProfiles('test1', { openai: 'openai-key', openrouter: 'sk-or-test' }, 'openrouter/auto', 'openrouter', async () => {
    const current = JSON.parse(fs.readFileSync(authProfilePath, 'utf-8'))
    assert(current.profiles['openrouter-key']?.provider === 'openrouter', 'Expected native OpenRouter auth profile during execution')
    assert(current.profiles['openrouter-key']?.key === 'sk-or-test', 'Expected OpenRouter BYOK value in temporary profile')
    assert(current.lastGood?.openrouter === 'openrouter-key', 'Expected OpenRouter selected as lastGood')
    assert(!current.lastGood?.openai, 'Did not expect OpenAI lastGood to override OpenRouter preference')
  })
})

test('withTemporaryAgentAuthProfiles writes and selects a native xAI auth profile', async () => {
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

  process.env.HOME = home
  resetWorkspaceManagerForTests()

  await withTemporaryAgentAuthProfiles('test1', { openai: 'openai-key', openrouter: 'sk-or-test', xai: 'xai-test' }, 'xai/grok-3', 'xai', async () => {
    const current = JSON.parse(fs.readFileSync(authProfilePath, 'utf-8'))
    assert(current.profiles['xai-key']?.provider === 'xai', 'Expected native xAI auth profile during execution')
    assert(current.profiles['xai-key']?.key === 'xai-test', 'Expected xAI BYOK value in temporary profile')
    assert(current.lastGood?.xai === 'xai-key', 'Expected xAI selected as lastGood')
    assert(!current.lastGood?.openai, 'Did not expect OpenAI lastGood to override xAI preference')
    assert(!current.lastGood?.openrouter, 'Did not expect OpenRouter lastGood to override xAI preference')
  })
})

test('withTemporaryAgentAuthProfiles can persist generated auth profiles for async subagents', async () => {
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

  process.env.HOME = home
  resetWorkspaceManagerForTests()

  await withTemporaryAgentAuthProfiles('test1', { openai: 'fresh-openai' }, 'openai/gpt-4o-mini', 'openai', async () => {
    const current = JSON.parse(fs.readFileSync(authProfilePath, 'utf-8'))
    assert(current.profiles['openai-key']?.key === 'fresh-openai', 'Expected OpenAI profile during execution')
  }, { persistAuthProfiles: true })

  const persisted = JSON.parse(fs.readFileSync(authProfilePath, 'utf-8'))
  assert(persisted.profiles['openai-key']?.key === 'fresh-openai', 'Expected generated auth profile to remain for async subagents')
})

test('withTemporaryAgentAuthProfiles preserves existing auth profiles when no replacement key is supplied', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-exec-home-'))
  const agentDir = path.join(home, '.openclaw', 'agents', 'preserve-auth', 'agent')
  const authProfilePath = path.join(agentDir, 'auth-profiles.json')
  fs.mkdirSync(agentDir, { recursive: true })
  const existing = JSON.stringify({
    version: 1,
    profiles: {
      'openai:existing': { type: 'api_key', provider: 'openai', key: 'existing-key' },
    },
    usageStats: {},
  }, null, 2)
  fs.writeFileSync(authProfilePath, existing, 'utf8')

  process.env.HOME = home
  await withTemporaryAgentAuthProfiles('preserve-auth', {}, 'openai/gpt-4o-mini', 'openai', async () => {}, {
    persistAuthProfiles: true,
    skipModelConfigMutation: true,
  })

  assert(fs.readFileSync(authProfilePath, 'utf8') === existing, 'Expected no-key execution to preserve the existing auth profile store')
})

test('withTemporaryAgentAuthProfiles registers workspace custom skill root with OpenClaw', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-exec-home-'))
  const workspace = path.join(home, '.openclaw', 'workspaces', 'robotics')
  const agentWorkspace = path.join(workspace, 'AGENTS', 'mechdog')
  const agentDir = path.join(home, '.openclaw', 'agents', 'mechdog', 'agent')
  const customSkillRoot = path.join(workspace, 'SKILLS', 'custom')
  const configPath = path.join(home, '.openclaw', 'openclaw.json')
  fs.mkdirSync(agentWorkspace, { recursive: true })
  fs.mkdirSync(agentDir, { recursive: true })
  fs.mkdirSync(customSkillRoot, { recursive: true })
  fs.mkdirSync(path.join(home, '.openclaw'), { recursive: true })
  fs.writeFileSync(path.join(agentWorkspace, 'IDENTITY.md'), '# Identity\n\n- **Model:** openai/gpt-4o-mini\n', 'utf-8')
  fs.writeFileSync(configPath, JSON.stringify({
    agents: {
      list: [
        { id: 'mechdog', workspace: agentWorkspace, agentDir, model: 'openai/gpt-4o-mini', skills: ['mechdog'] }
      ]
    }
  }, null, 2))
  fs.writeFileSync(path.join(home, '.openclaw', 'dashboard-workspaces.json'), JSON.stringify({
    version: '1.0.0',
    activeWorkspaceId: 'robotics',
    workspaces: [
      { id: 'robotics', name: 'Robotics', path: workspace, createdAt: new Date().toISOString(), lastAccessedAt: new Date().toISOString() },
    ]
  }, null, 2))

  process.env.HOME = home
  process.env.OPENCLAW_WORKSPACE = workspace
  resetWorkspaceManagerForTests()

  await withTemporaryAgentAuthProfiles('mechdog', { openai: 'fresh-openai' }, 'openai/gpt-4o-mini', 'openai', async () => {})

  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
  const extraDirs = config.skills?.load?.extraDirs || []
  assert(extraDirs.includes(customSkillRoot), 'Expected workspace SKILLS/custom to be registered as OpenClaw extra skill dir')
})

test('withTemporaryAgentAuthProfiles registers bundled repo custom skill root with OpenClaw', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-exec-home-'))
  const workspace = path.join(home, '.openclaw', 'workspaces', 'robotics')
  const agentWorkspace = path.join(workspace, 'AGENTS', 'resend-agent')
  const agentDir = path.join(home, '.openclaw', 'agents', 'resend-agent', 'agent')
  const repoCustomSkillRoot = path.join(REPO_ROOT, 'SKILLS', 'custom')
  const configPath = path.join(home, '.openclaw', 'openclaw.json')
  fs.mkdirSync(agentWorkspace, { recursive: true })
  fs.mkdirSync(agentDir, { recursive: true })
  fs.mkdirSync(path.join(home, '.openclaw'), { recursive: true })
  fs.writeFileSync(path.join(agentWorkspace, 'IDENTITY.md'), '# Identity\n\n- **Model:** openai/gpt-4o-mini\n', 'utf-8')
  fs.writeFileSync(configPath, JSON.stringify({
    agents: {
      list: [
        { id: 'resend-agent', workspace: agentWorkspace, agentDir, model: 'openai/gpt-4o-mini', skills: ['clawmax-resend'] }
      ]
    }
  }, null, 2))
  fs.writeFileSync(path.join(home, '.openclaw', 'dashboard-workspaces.json'), JSON.stringify({
    version: '1.0.0',
    activeWorkspaceId: 'robotics',
    workspaces: [
      { id: 'robotics', name: 'Robotics', path: workspace, createdAt: new Date().toISOString(), lastAccessedAt: new Date().toISOString() },
    ]
  }, null, 2))

  process.env.HOME = home
  process.env.OPENCLAW_WORKSPACE = workspace
  resetWorkspaceManagerForTests()

  await withTemporaryAgentAuthProfiles('resend-agent', { openai: 'fresh-openai' }, 'openai/gpt-4o-mini', 'openai', async () => {})

  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
  const extraDirs = config.skills?.load?.extraDirs || []
  assert(extraDirs.includes(repoCustomSkillRoot), 'Expected bundled repo SKILLS/custom to be registered as an OpenClaw extra skill dir')
})

test('withTemporaryAgentAuthProfiles resets persisted sessions when workspace custom skill files changed', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-exec-home-'))
  const workspace = path.join(home, '.openclaw', 'workspaces', 'robotics')
  const agentWorkspace = path.join(workspace, 'AGENTS', 'mechdog')
  const agentDir = path.join(home, '.openclaw', 'agents', 'mechdog', 'agent')
  const sessionsDir = path.join(home, '.openclaw', 'agents', 'mechdog', 'sessions')
  const customSkillDir = path.join(workspace, 'SKILLS', 'custom', 'mechdog')
  const customSkillFile = path.join(customSkillDir, 'index.ts')
  const sessionFile = path.join(sessionsDir, 'chat-openai-gpt-4o-mini.jsonl')
  const configPath = path.join(home, '.openclaw', 'openclaw.json')
  fs.mkdirSync(agentWorkspace, { recursive: true })
  fs.mkdirSync(agentDir, { recursive: true })
  fs.mkdirSync(sessionsDir, { recursive: true })
  fs.mkdirSync(customSkillDir, { recursive: true })
  fs.mkdirSync(path.join(home, '.openclaw'), { recursive: true })
  fs.writeFileSync(path.join(agentWorkspace, 'IDENTITY.md'), '# Identity\n\n- **Model:** openai/gpt-4o-mini\n', 'utf-8')
  fs.writeFileSync(customSkillFile, 'export const updated = true\n', 'utf-8')
  fs.writeFileSync(sessionFile, '{"type":"message","message":{"role":"assistant"}}\n', 'utf-8')
  fs.utimesSync(sessionFile, new Date(Date.now() - 60_000), new Date(Date.now() - 60_000))
  fs.utimesSync(customSkillFile, new Date(), new Date())
  fs.writeFileSync(configPath, JSON.stringify({
    agents: {
      list: [
        { id: 'mechdog', workspace: agentWorkspace, agentDir, model: 'openai/gpt-4o-mini', skills: ['mechdog'] }
      ]
    }
  }, null, 2))
  fs.writeFileSync(path.join(home, '.openclaw', 'dashboard-workspaces.json'), JSON.stringify({
    version: '1.0.0',
    activeWorkspaceId: 'robotics',
    workspaces: [
      { id: 'robotics', name: 'Robotics', path: workspace, createdAt: new Date().toISOString(), lastAccessedAt: new Date().toISOString() },
    ]
  }, null, 2))

  process.env.HOME = home
  process.env.OPENCLAW_WORKSPACE = workspace
  resetWorkspaceManagerForTests()

  await withTemporaryAgentAuthProfiles('mechdog', { openai: 'fresh-openai' }, 'openai/gpt-4o-mini', 'openai', async () => {})

  assert(!fs.existsSync(sessionFile), 'Expected persisted session snapshot to be reset after workspace custom skill update')
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
    const matchingAgent = currentConfig.agents.list.find((agent: any) => agent.id === 'test1' && agent.model === 'openai/gpt-4.1')
    assert(currentConfig.gateway.auth.token === 'stable-token', 'Expected gateway auth token preserved during override')
    assert(currentConfig.gateway.remote.token === 'stable-token', 'Expected gateway remote token preserved during override')
    assert(currentConfig.gateway.tailscale.hostname === 'stable-host', 'Expected gateway tailscale config preserved during override')
    assert(!!matchingAgent, 'Expected resolved execution model to be represented in openclaw.json')
  })

  const restoredConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
  const restoredMatchingAgent = restoredConfig.agents.list.find((agent: any) => agent.id === 'test1' && agent.model === 'openai/gpt-4.1')
  assert(restoredConfig.gateway.auth.token === 'stable-token', 'Expected gateway auth token preserved after restore')
  assert(restoredConfig.gateway.remote.token === 'stable-token', 'Expected gateway remote token preserved after restore')
  assert(restoredConfig.gateway.tailscale.hostname === 'stable-host', 'Expected gateway tailscale config preserved after restore')
  assert(!!restoredMatchingAgent, 'Expected workspace record to keep the resolved execution model after override')
})

test('withTemporaryAgentAuthProfiles can skip model config mutation for hosted execution paths', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-exec-home-'))
  const agentDir = path.join(home, '.openclaw', 'agents', 'test1', 'agent')
  const authProfilePath = path.join(agentDir, 'auth-profiles.json')
  const configPath = path.join(home, '.openclaw', 'openclaw.json')
  fs.mkdirSync(agentDir, { recursive: true })
  fs.mkdirSync(path.join(home, '.openclaw'), { recursive: true })
  fs.writeFileSync(configPath, JSON.stringify({
    gateway: {
      auth: { token: 'stable-token' },
    },
    agents: {
      list: [
        { id: 'test1', workspace: path.join(home, 'workspace', 'AGENTS', 'test1'), agentDir, model: 'openai/gpt-5.5' }
      ]
    }
  }, null, 2))
  fs.writeFileSync(authProfilePath, JSON.stringify({ version: 1, profiles: {}, usageStats: {} }, null, 2))

  process.env.HOME = home
  resetWorkspaceManagerForTests()

  await withTemporaryAgentAuthProfiles('test1', { openai: 'fresh-openai' }, 'openai/gpt-4.1', 'openai', async () => {
    const currentConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    const matchingAgent = currentConfig.agents.list.find((agent: any) => agent.id === 'test1')
    const currentProfiles = JSON.parse(fs.readFileSync(authProfilePath, 'utf-8'))
    assert(matchingAgent.model === 'openai/gpt-5.5', 'Expected hosted execution path to avoid mutating the saved model')
    assert(currentProfiles.profiles['openai-key']?.key === 'fresh-openai', 'Expected temporary auth profiles to still be written')
  }, { skipModelConfigMutation: true })

  const restoredConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
  const restoredMatchingAgent = restoredConfig.agents.list.find((agent: any) => agent.id === 'test1')
  assert(restoredMatchingAgent.model === 'openai/gpt-5.5', 'Expected saved model to remain unchanged after execution')
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
  assert(activeEntryAfter.model === 'openai/gpt-4.1', 'Expected active workspace record to keep the resolved execution model')
})

test('withTemporaryAgentAuthProfiles creates an active workspace record instead of mutating a same-id record from another workspace', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-exec-home-'))
  const defaultWorkspace = path.join(home, '.openclaw', 'workspace')
  const activeWorkspace = path.join(home, '.openclaw', 'workspaces', 'personal')
  const defaultAgentWorkspace = path.join(defaultWorkspace, 'AGENTS', 'jarvis')
  const activeAgentWorkspace = path.join(activeWorkspace, 'AGENTS', 'jarvis')
  const agentDir = path.join(home, '.openclaw', 'agents', 'jarvis', 'agent')
  const configPath = path.join(home, '.openclaw', 'openclaw.json')

  fs.mkdirSync(defaultAgentWorkspace, { recursive: true })
  fs.mkdirSync(activeAgentWorkspace, { recursive: true })
  fs.mkdirSync(agentDir, { recursive: true })
  fs.mkdirSync(path.join(home, '.openclaw'), { recursive: true })
  fs.writeFileSync(path.join(activeAgentWorkspace, 'IDENTITY.md'), '# Identity\n\n- **Model:** openai/gpt-4o-mini\n', 'utf-8')
  fs.writeFileSync(configPath, JSON.stringify({
    agents: {
      list: [
        { id: 'jarvis', workspace: defaultAgentWorkspace, agentDir, model: 'ollama/qwen2.5:latest' },
      ]
    }
  }, null, 2))
  fs.writeFileSync(path.join(home, '.openclaw', 'dashboard-workspaces.json'), JSON.stringify({
    version: '1.0.0',
    activeWorkspaceId: 'personal',
    workspaces: [
      { id: 'default', name: 'Default', path: defaultWorkspace, createdAt: new Date().toISOString(), lastAccessedAt: new Date().toISOString() },
      { id: 'personal', name: 'Personal', path: activeWorkspace, createdAt: new Date().toISOString(), lastAccessedAt: new Date().toISOString() },
    ]
  }, null, 2))

  process.env.HOME = home
  process.env.OPENCLAW_WORKSPACE = activeWorkspace
  resetWorkspaceManagerForTests()

  await withTemporaryAgentAuthProfiles('jarvis', { openai: 'fresh-openai' }, 'openai/gpt-4o-mini', 'openai', async () => {
    const currentConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    const defaultEntry = currentConfig.agents.list.find((agent: any) => agent.workspace === defaultAgentWorkspace)
    const activeEntry = currentConfig.agents.list.find((agent: any) => agent.workspace === activeAgentWorkspace)
    assert(defaultEntry.model === 'ollama/qwen2.5:latest', 'Expected same-id record from another workspace to remain untouched')
    assert(activeEntry?.model === 'openai/gpt-4o-mini', 'Expected active workspace record to be created with the resolved model')
  })
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
  const beforeConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'))

  await withTemporaryAgentAuthProfiles('test-ollama', {}, 'ollama/qwen2.5:latest', 'ollama', async () => {
    const current = fs.readFileSync(authProfilePath, 'utf-8')
    const currentConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    const originalEntry = currentConfig.agents.list.find((agent: any) => agent.workspace === beforeConfig.agents.list[0].workspace)
    assert(current === before, 'Expected auth profiles unchanged for Ollama')
    assert(originalEntry.model === 'ollama/qwen2.5:latest', 'Expected matching Ollama record model to remain intact')
  })

  const restoredConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
  const restoredOriginalEntry = restoredConfig.agents.list.find((agent: any) => agent.workspace === beforeConfig.agents.list[0].workspace)
  assert(restoredOriginalEntry.model === 'ollama/qwen2.5:latest', 'Expected matching Ollama record model to remain intact after execution')
})

test('withTemporaryAgentAuthProfiles persists Ollama provider config instead of restoring during execution', async () => {
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
    assert(Array.isArray(currentConfig.models.providers.ollama.models), 'Expected temporary Ollama provider models array injected')
    assert(currentConfig.agents.list[0].model === 'ollama/qwen2.5:latest', 'Expected model to remain intact during Ollama execution')
  })

  const persistedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
  assert(persistedConfig.models.providers.ollama.baseUrl === 'http://127.0.0.1:11434', 'Expected Ollama base URL to remain stable after execution')
  assert(persistedConfig.models.providers.ollama.api === 'ollama', 'Expected Ollama api marker to remain stable after execution')
})

test('withTemporaryAgentAuthProfiles authorizes the exact LM Studio execution model without mutating the saved dashboard model', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-exec-home-'))
  const workspace = path.join(home, 'workspace')
  const agentWorkspace = path.join(workspace, 'AGENTS', 'test-compatible')
  const agentDir = path.join(home, '.openclaw', 'agents', 'test-compatible', 'agent')
  const configPath = path.join(home, '.openclaw', 'openclaw.json')
  fs.mkdirSync(agentDir, { recursive: true })
  fs.mkdirSync(agentWorkspace, { recursive: true })
  fs.mkdirSync(path.join(home, '.openclaw'), { recursive: true })
  fs.writeFileSync(path.join(agentWorkspace, 'IDENTITY.md'), '# Identity\n\n- **Model:** openai-compatible/google/gemma-4-31b-qat\n', 'utf-8')
  fs.writeFileSync(configPath, JSON.stringify({
    agents: {
      list: [
        { id: 'test-compatible', workspace: agentWorkspace, agentDir, model: 'openai-compatible/google/gemma-4-31b-qat' }
      ]
    }
  }, null, 2))

  process.env.HOME = home
  process.env.OPENCLAW_WORKSPACE = workspace
  resetWorkspaceManagerForTests()
  const originalFetch = global.fetch
  const fetchCalls: Array<{ url: string; method: string; body?: string }> = []
  global.fetch = (async (input: any, init?: any) => {
    const url = String(input)
    const method = String(init?.method || 'GET').toUpperCase()
    const body = typeof init?.body === 'string' ? init.body : undefined
    fetchCalls.push({ url, method, body })
    if (url.endsWith('/api/v1/models') && method === 'GET') {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          models: [{
            key: 'google/gemma-4-31b-qat',
            loaded_instances: [
              { id: 'google/gemma-4-31b-qat', config: { context_length: 4096 } },
              { id: 'google/gemma-4-31b-qat:2', config: { context_length: 200000 } },
            ],
          }],
        }),
      } as any
    }
    if (url.endsWith('/api/v1/models/unload') && method === 'POST') {
      return {
        ok: true,
        status: 200,
        json: async () => ({ status: 'unloaded' }),
      } as any
    }
    if (url.endsWith('/api/v1/models/load') && method === 'POST') {
      return {
        ok: true,
        status: 200,
        json: async () => ({ status: 'loaded' }),
      } as any
    }
    throw new Error(`Unexpected fetch call: ${method} ${url}`)
  }) as any

  try {
    await withTemporaryAgentAuthProfiles(
      'test-compatible',
      { openaiCompatibleBaseUrl: 'http://127.0.0.1:1234/v1', openaiCompatibleApiKey: 'lmstudio-secret' },
      'openai-compatible/google/gemma-4-31b-qat',
      'openai-compatible',
      async () => {
        const currentConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
        assert(currentConfig.agents.list[0].model === 'openai-compatible/google/gemma-4-31b-qat', `Expected saved dashboard model to stay openai-compatible/<model>, got ${currentConfig.agents.list[0].model}`)
        assert(currentConfig.agents.defaults.models['lmstudio/google/gemma-4-31b-qat'], 'Expected exact LM Studio execution ref to be authorized for OpenClaw overrides')
        assert(currentConfig.models.providers.lmstudio.baseUrl === 'http://127.0.0.1:1234/v1', 'Expected stable LM Studio base URL persisted')
        assert(currentConfig.models.providers.lmstudio.api === 'openai-completions', 'Expected stable LM Studio api marker persisted')
        assert(currentConfig.models.providers.lmstudio.apiKey === 'lmstudio-secret', 'Expected stable LM Studio api key persisted')
        assert(Array.isArray(currentConfig.models.providers.lmstudio.models), 'Expected stable LM Studio provider models array persisted')
        const activeEntry = currentConfig.models.providers.lmstudio.models.find((entry: any) => entry?.id === 'google/gemma-4-31b-qat')
        assert(activeEntry, 'Expected stable LM Studio catalog entry for the active model')
        assert(activeEntry.contextWindow === 64000, 'Expected stable LM Studio model entry to carry a larger context window')
        assert(activeEntry.contextTokens === 64000, 'Expected stable LM Studio model entry to carry a larger context token limit')
        assert(activeEntry.maxTokens === 8192, 'Expected stable LM Studio model entry to carry a bounded max token output limit')
      }
    )
  } finally {
    global.fetch = originalFetch
  }

  const persistedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
  assert(persistedConfig.agents.list[0].model === 'openai-compatible/google/gemma-4-31b-qat', 'Expected saved dashboard model to stay unchanged after execution')
  assert(persistedConfig.agents.defaults.models['lmstudio/google/gemma-4-31b-qat'], 'Expected LM Studio execution allowlist entry to remain stable after execution')
  assert(persistedConfig.models.providers.lmstudio.baseUrl === 'http://127.0.0.1:1234/v1', 'Expected LM Studio provider config to remain stable after execution')
  const unloadCall = fetchCalls.find((call) => call.url.endsWith('/api/v1/models/unload'))
  assert(!!(unloadCall && unloadCall.body?.includes('"instance_id":"google/gemma-4-31b-qat"')), 'Expected undersized LM Studio instance to be unloaded before execution')
  const loadCall = fetchCalls.find((call) => call.url.endsWith('/api/v1/models/load'))
  assert(!!(loadCall && loadCall.body?.includes('"context_length":64000')), 'Expected LM Studio load request to target the larger execution context window')
})

test('withTemporaryAgentAuthProfiles preserves existing Ollama provider config fields while applying a stable base URL', async () => {
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
    assert(Array.isArray(currentConfig.models.providers.ollama.models), 'Expected existing Ollama provider models array normalized during override')
  })

  const persistedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
  assert(persistedConfig.models.providers.ollama.baseUrl === 'http://127.0.0.1:11434', 'Expected Ollama base URL to remain stable after execution')
  assert(persistedConfig.models.providers.ollama.headers['X-Test'] === 'keep-me', 'Expected existing Ollama provider fields preserved')
})

test('withTemporaryAgentAuthProfiles preserves config validity when an existing Ollama provider lacks models array', async () => {
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
    assert(Array.isArray(currentConfig.models.providers.ollama.models), 'Expected missing Ollama provider models array synthesized during temporary override')
  })
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

test('withTemporaryAgentAuthProfiles resets stale dashboard-chat sessions when the configured model changes', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-exec-home-'))
  const sessionsDir = path.join(home, '.openclaw', 'agents', 'test-openai', 'sessions')
  const agentDir = path.join(home, '.openclaw', 'agents', 'test-openai', 'agent')
  const configPath = path.join(home, '.openclaw', 'openclaw.json')
  fs.mkdirSync(sessionsDir, { recursive: true })
  fs.mkdirSync(agentDir, { recursive: true })
  fs.writeFileSync(path.join(sessionsDir, 'sessions.json'), JSON.stringify({
    'agent:test-openai:dashboard-chat': {
      sessionId: 'agent-test-openai-dashboard-chat-5b97d90c',
      model: 'qwen2.5:latest',
      modelProvider: 'ollama',
      sessionFile: path.join(sessionsDir, 'prior.jsonl'),
      systemPromptReport: {
        provider: 'ollama',
        model: 'qwen2.5:latest',
      }
    }
  }, null, 2), 'utf-8')
  fs.writeFileSync(path.join(sessionsDir, 'prior.jsonl'), '{"type":"message"}\n', 'utf-8')
  fs.writeFileSync(configPath, JSON.stringify({
    agents: {
      list: [
        { id: 'test-openai', workspace: path.join(home, 'workspace', 'AGENTS', 'test-openai'), agentDir, model: 'openai/gpt-4o-mini' }
      ]
    }
  }, null, 2))

  process.env.HOME = home
  resetWorkspaceManagerForTests()

  await withTemporaryAgentAuthProfiles('test-openai', { openai: 'fresh-openai' }, 'openai/gpt-4o-mini', 'openai', async () => {
    assert(!fs.existsSync(path.join(sessionsDir, 'sessions.json')), 'Expected stale dashboard-chat sessions index archived before execution')
    assert(!fs.existsSync(path.join(sessionsDir, 'prior.jsonl')), 'Expected stale dashboard-chat transcript archived before execution')
  })
})

test('withTemporaryAgentAuthProfiles resets stale sessions when auth profiles change even if the model stays the same', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-exec-home-'))
  const sessionsDir = path.join(home, '.openclaw', 'agents', 'test-openai', 'sessions')
  const agentDir = path.join(home, '.openclaw', 'agents', 'test-openai', 'agent')
  const authProfilePath = path.join(agentDir, 'auth-profiles.json')
  const configPath = path.join(home, '.openclaw', 'openclaw.json')
  fs.mkdirSync(sessionsDir, { recursive: true })
  fs.mkdirSync(agentDir, { recursive: true })
  fs.writeFileSync(path.join(sessionsDir, 'sessions.json'), JSON.stringify({
    'agent:test-openai:dashboard-chat': {
      sessionId: 'agent-test-openai-dashboard-chat-same-model',
      model: 'openai/gpt-4o-mini',
      modelProvider: 'openai',
      sessionFile: path.join(sessionsDir, 'prior.jsonl'),
      systemPromptReport: {
        provider: 'openai',
        model: 'openai/gpt-4o-mini',
      }
    }
  }, null, 2), 'utf-8')
  fs.writeFileSync(path.join(sessionsDir, 'prior.jsonl'), '{"type":"message"}\n', 'utf-8')
  fs.writeFileSync(authProfilePath, JSON.stringify({
    version: 1,
    profiles: {
      'openai-key': { type: 'api_key', provider: 'openai', key: 'stale-openai' }
    },
    lastGood: { openai: 'openai-key' },
    usageStats: {},
  }, null, 2), 'utf-8')
  fs.writeFileSync(configPath, JSON.stringify({
    agents: {
      list: [
        { id: 'test-openai', workspace: path.join(home, 'workspace', 'AGENTS', 'test-openai'), agentDir, model: 'openai/gpt-4o-mini' }
      ]
    }
  }, null, 2))

  process.env.HOME = home
  resetWorkspaceManagerForTests()

  await withTemporaryAgentAuthProfiles('test-openai', { openai: 'fresh-openai' }, 'openai/gpt-4o-mini', 'openai', async () => {
    assert(!fs.existsSync(path.join(sessionsDir, 'sessions.json')), 'Expected sessions index archived when auth profiles change')
    assert(!fs.existsSync(path.join(sessionsDir, 'prior.jsonl')), 'Expected stale transcript archived when auth profiles change')
    const currentProfiles = JSON.parse(fs.readFileSync(authProfilePath, 'utf-8'))
    assert(currentProfiles.profiles['openai-key']?.key === 'fresh-openai', 'Expected fresh OpenAI key during execution')
  })
})

test('withTemporaryAgentAuthProfiles short-circuits for non-openclaw runtimes without touching openclaw auth/config state', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-exec-home-'))
  const agentDir = path.join(home, '.openclaw', 'agents', 'claude-agent', 'agent')
  const authProfilePath = path.join(agentDir, 'auth-profiles.json')
  const configPath = path.join(home, '.openclaw', 'openclaw.json')
  fs.mkdirSync(path.join(home, '.openclaw'), { recursive: true })
  fs.writeFileSync(configPath, JSON.stringify({
    agents: {
      list: [
        { id: 'claude-agent', workspace: path.join(home, 'workspace', 'AGENTS', 'claude-agent'), agentDir }
      ]
    }
  }, null, 2))
  const configBefore = fs.readFileSync(configPath, 'utf-8')

  process.env.HOME = home
  resetWorkspaceManagerForTests()

  let ran = false
  const result = await withTemporaryAgentAuthProfiles(
    'claude-agent',
    { anthropic: 'test-anthropic' },
    'anthropic/claude-sonnet-4-20250514',
    'anthropic',
    async () => {
      ran = true
      return 'fn-result'
    },
    { runtime: 'claude' }
  )

  assert(result === 'fn-result', 'Expected fn() return value to pass through the short-circuit unchanged')
  assert(ran, 'Expected fn() to still run for non-openclaw runtimes')
  assert(!fs.existsSync(authProfilePath), 'Expected auth-profiles.json NOT to be written for a non-openclaw runtime')
  assert(!fs.existsSync(agentDir), 'Expected the openclaw runtime agent dir NOT to be created for a non-openclaw runtime')
  assert(fs.readFileSync(configPath, 'utf-8') === configBefore, 'Expected openclaw.json to be left untouched for a non-openclaw runtime')
})

test('withTemporaryAgentAuthProfiles runs the normal openclaw auth-profile flow when options.runtime is openclaw', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-exec-home-'))
  const agentDir = path.join(home, '.openclaw', 'agents', 'openclaw-agent', 'agent')
  const authProfilePath = path.join(agentDir, 'auth-profiles.json')
  const configPath = path.join(home, '.openclaw', 'openclaw.json')
  fs.mkdirSync(path.join(home, '.openclaw'), { recursive: true })
  fs.writeFileSync(configPath, JSON.stringify({
    agents: {
      list: [
        { id: 'openclaw-agent', workspace: path.join(home, 'workspace', 'AGENTS', 'openclaw-agent'), agentDir }
      ]
    }
  }, null, 2))

  process.env.HOME = home
  resetWorkspaceManagerForTests()

  let sawAuthProfile = false
  await withTemporaryAgentAuthProfiles(
    'openclaw-agent',
    { anthropic: 'test-anthropic' },
    'anthropic/claude-sonnet-4-20250514',
    'anthropic',
    async () => {
      sawAuthProfile = fs.existsSync(authProfilePath)
    },
    { runtime: 'openclaw' }
  )

  assert(sawAuthProfile, 'Expected auth-profiles.json to be written for the openclaw runtime')
})

setTimeout(async () => {
  await testQueue
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
