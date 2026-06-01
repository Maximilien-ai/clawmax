import assert from 'assert'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { __test as gatewayTest } from './gateway-rpc'
import { writeDashboardManagedOpenClawConfig } from './openclaw-config'
import { resolveOpenClawCliPath } from './openclaw-cli'
import { WorkspaceManager, resetWorkspaceManagerForTests } from './workspace-manager'
import { ensureManagedAgentWorkspaceFiles } from './workspace'
import { deriveWorkspaceRootFromAgentWorkspace, resolveAgentExecutionConfig } from './agent-execution'

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

function withEnv<T>(overrides: Record<string, string | undefined>, fn: () => T): T {
  const originals = new Map<string, string | undefined>()
  for (const [key, value] of Object.entries(overrides)) {
    originals.set(key, process.env[key])
    if (typeof value === 'undefined') delete process.env[key]
    else process.env[key] = value
  }
  try {
    return fn()
  } finally {
    for (const [key, value] of originals.entries()) {
      if (typeof value === 'undefined') delete process.env[key]
      else process.env[key] = value
    }
    resetWorkspaceManagerForTests()
  }
}

function withTempDir<T>(prefix: string, fn: (dir: string) => T): T {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  try {
    return fn(dir)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

const originalPath = process.env.PATH
const originalOpenClawBin = process.env.OPENCLAW_BIN

console.log(`\n${YELLOW}=== OpenClaw Contract Test Suite ===${RESET}\n`)

test('dashboard-managed config writes preserve protected gateway fields', () => {
  withTempDir('clawmax-openclaw-contract-config-', (dir) => {
    const configPath = path.join(dir, 'openclaw.json')
    fs.writeFileSync(configPath, JSON.stringify({
      gateway: {
        auth: { token: 'stable-auth' },
        remote: { token: 'stable-remote' },
        tailscale: { enabled: true, hostname: 'stable-host' },
      },
      agents: { list: [{ id: 'alpha', workspace: '/old/workspace/AGENTS/alpha', skills: ['github'] }] },
    }, null, 2), 'utf-8')

    writeDashboardManagedOpenClawConfig(configPath, {
      gateway: {
        auth: { token: 'stale-auth' },
        remote: { token: 'stale-remote' },
        tailscale: { enabled: false, hostname: 'stale-host' },
      },
      agents: { list: [{ id: 'alpha', workspace: '/new/workspace/AGENTS/alpha', skills: ['slack'] }] },
    }, 'openclaw-contract-test')

    const saved = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    assert.strictEqual(saved.gateway.auth.token, 'stable-auth')
    assert.strictEqual(saved.gateway.remote.token, 'stable-remote')
    assert.strictEqual(saved.gateway.tailscale.hostname, 'stable-host')
    assert.strictEqual(saved.agents.list[0].workspace, '/new/workspace/AGENTS/alpha')
    assert.deepStrictEqual(saved.agents.list[0].skills, ['slack'])
  })
})

test('OpenClaw CLI resolver prefers OPENCLAW_BIN over PATH', () => {
  withTempDir('clawmax-openclaw-contract-cli-', (dir) => {
    const overrideCli = path.join(dir, 'override-openclaw')
    const pathDir = path.join(dir, 'bin')
    const pathCli = path.join(pathDir, 'openclaw')
    fs.mkdirSync(pathDir, { recursive: true })
    fs.writeFileSync(overrideCli, '#!/bin/sh\necho override\n', 'utf-8')
    fs.writeFileSync(pathCli, '#!/bin/sh\necho path\n', 'utf-8')
    fs.chmodSync(overrideCli, 0o755)
    fs.chmodSync(pathCli, 0o755)

    process.env.OPENCLAW_BIN = overrideCli
    process.env.PATH = `${pathDir}:${originalPath || ''}`
    assert.strictEqual(resolveOpenClawCliPath(), overrideCli)
  })
})

test('gateway config accepts remote token fallback and localhost defaults', () => {
  const parsed = gatewayTest.parseGatewayConfig({
    gateway: {
      port: 18789,
      auth: { mode: 'token' },
      remote: { token: 'remote-only-token' },
    },
  })

  assert(!!parsed, 'Expected gateway config to parse')
  assert.strictEqual(parsed?.auth.token, 'remote-only-token')
  assert.strictEqual(parsed?.httpUrl, 'http://127.0.0.1:18789')
  assert.strictEqual(parsed?.wsUrl, 'ws://127.0.0.1:18789')
})

test('gateway config prefers auth token over remote token when both are present', () => {
  const parsed = gatewayTest.parseGatewayConfig({
    gateway: {
      port: 18789,
      auth: { mode: 'token', token: 'auth-token' },
      remote: { token: 'remote-token' },
    },
  })

  assert(!!parsed, 'Expected gateway config to parse')
  assert.strictEqual(parsed?.auth.token, 'auth-token')
})

test('gateway config honors OPENCLAW_GATEWAY_URL override', () => {
  withEnv({ OPENCLAW_GATEWAY_URL: 'http://host.containers.internal:19999' }, () => {
    const parsed = gatewayTest.parseGatewayConfig({
      gateway: {
        port: 18789,
        auth: { mode: 'token', token: 'gateway-token' },
      },
    })

    assert(!!parsed, 'Expected gateway config to parse with override')
    assert.strictEqual(parsed?.port, 19999)
    assert.strictEqual(parsed?.host, 'host.containers.internal')
    assert.strictEqual(parsed?.httpUrl, 'http://host.containers.internal:19999')
    assert.strictEqual(parsed?.wsUrl, 'ws://host.containers.internal:19999')
  })
})

test('workspace manager creates the expected reusable scaffold', () => {
  withTempDir('clawmax-openclaw-contract-workspace-', (dir) => {
    const registryPath = path.join(dir, '.openclaw', 'dashboard-workspaces.json')
    const workspacePath = path.join(dir, 'customer-workspace')
    const manager = new WorkspaceManager(registryPath)
    manager.createWorkspace('Customer Workspace', workspacePath)

    assert(fs.existsSync(path.join(workspacePath, 'AGENTS')), 'Expected AGENTS directory')
    assert(fs.existsSync(path.join(workspacePath, 'AGENTS', 'archive')), 'Expected AGENTS/archive directory')
    assert(fs.existsSync(path.join(workspacePath, 'ORG', 'COMMUNITIES.md')), 'Expected COMMUNITIES.md scaffold')
    assert(fs.existsSync(path.join(workspacePath, 'ORG', 'GROUPS.md')), 'Expected GROUPS.md scaffold')
    assert(fs.existsSync(path.join(workspacePath, 'SYSTEM')), 'Expected SYSTEM directory')
  })
})

test('managed agent workspace seeding creates identity, soul, and tools files', () => {
  withTempDir('clawmax-openclaw-contract-agent-workspace-', (workspacePath) => {
    const created = ensureManagedAgentWorkspaceFiles({
      agentId: 'newsletter-summarizer',
      model: 'openai/gpt-4o-mini',
      tags: ['built-in', 'content'],
      workspacePath,
    })

    const agentDir = path.join(workspacePath, 'AGENTS', 'newsletter-summarizer')
    const identity = fs.readFileSync(path.join(agentDir, 'IDENTITY.md'), 'utf-8')
    assert(created.created.includes('IDENTITY.md'), 'Expected IDENTITY.md to be seeded')
    assert(created.created.includes('SOUL.md'), 'Expected SOUL.md to be seeded')
    assert(created.created.includes('TOOLS.md'), 'Expected TOOLS.md to be seeded')
    assert(identity.includes('**Name:** Newsletter Summarizer'), 'Expected IDENTITY.md to contain a Name field')
    assert.strictEqual(deriveWorkspaceRootFromAgentWorkspace(agentDir), workspacePath)
  })
})

test('active workspace agent record wins when openclaw.json contains stale duplicate ids', () => {
  withTempDir('clawmax-openclaw-contract-execution-', (home) => {
    const defaultWorkspace = path.join(home, '.openclaw', 'workspace')
    const activeWorkspace = path.join(home, '.openclaw', 'workspaces', 'personal')
    const defaultAgentWorkspace = path.join(defaultWorkspace, 'AGENTS', 'jarvis')
    const activeAgentWorkspace = path.join(activeWorkspace, 'AGENTS', 'jarvis')
    const agentDir = path.join(home, '.openclaw', 'agents', 'jarvis', 'agent')

    fs.mkdirSync(defaultAgentWorkspace, { recursive: true })
    fs.mkdirSync(activeAgentWorkspace, { recursive: true })
    fs.mkdirSync(agentDir, { recursive: true })
    fs.mkdirSync(path.join(home, '.openclaw'), { recursive: true })
    fs.writeFileSync(path.join(defaultAgentWorkspace, 'IDENTITY.md'), '# Jarvis\n\n- **Name:** Jarvis\n- **Model:** ollama/qwen2.5:latest\n', 'utf-8')
    fs.writeFileSync(path.join(activeAgentWorkspace, 'IDENTITY.md'), '# Jarvis\n\n- **Name:** Jarvis\n- **Model:** openai/gpt-4o-mini\n', 'utf-8')
    fs.writeFileSync(path.join(home, '.openclaw', 'openclaw.json'), JSON.stringify({
      agents: {
        list: [
          { id: 'jarvis', workspace: defaultAgentWorkspace, agentDir, model: 'ollama/qwen2.5:latest' },
          { id: 'jarvis', workspace: activeAgentWorkspace, agentDir, model: 'openai/gpt-4o-mini' },
        ],
      },
    }, null, 2), 'utf-8')
    fs.writeFileSync(path.join(home, '.openclaw', 'dashboard-workspaces.json'), JSON.stringify({
      version: '1.0.0',
      activeWorkspaceId: 'personal',
      workspaces: [{ id: 'personal', name: 'Personal', path: activeWorkspace }],
    }, null, 2), 'utf-8')

    withEnv({ HOME: home, OPENCLAW_WORKSPACE: activeWorkspace }, () => {
      const resolved = resolveAgentExecutionConfig('jarvis')
      assert.strictEqual(resolved.workspace, activeAgentWorkspace)
      assert.strictEqual(resolved.model, 'openai/gpt-4o-mini')
    })
  })
})

if (typeof originalOpenClawBin === 'undefined') delete process.env.OPENCLAW_BIN
else process.env.OPENCLAW_BIN = originalOpenClawBin
if (typeof originalPath === 'undefined') delete process.env.PATH
else process.env.PATH = originalPath

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
