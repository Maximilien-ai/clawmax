/**
 * Workspace deleteAgent test suite
 *
 * Run with: npx ts-node --transpileOnly server/lib/workspace-delete-agent.test.ts
 */

import fs from 'fs'
import os from 'os'
import path from 'path'
import { deleteAgent } from './workspace'
import { resetWorkspaceManagerForTests } from './workspace-manager'

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const RESET = '\x1b[0m'

let testsPassed = 0
let testsFailed = 0

const originalHome = process.env.HOME
const originalWorkspace = process.env.OPENCLAW_WORKSPACE

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
    console.error(`  Error: ${err.message}`)
    testsFailed++
  }
}

function writeWorkspaceRegistry(tmpHome: string, workspacePath: string) {
  const registryPath = path.join(tmpHome, '.openclaw', 'dashboard-workspaces.json')
  fs.mkdirSync(path.dirname(registryPath), { recursive: true })
  fs.writeFileSync(registryPath, JSON.stringify({
    version: '1.0.0',
    activeWorkspaceId: 'workspace-under-test',
    workspaces: [{
      id: 'workspace-under-test',
      name: 'Workspace Under Test',
      path: workspacePath,
      createdAt: '2026-04-02T00:00:00.000Z',
      lastAccessedAt: '2026-04-02T00:00:00.000Z',
      color: '#3B82F6',
      tags: [],
    }],
  }, null, 2))
}

console.log(`\n${YELLOW}=== Workspace Delete Agent Test Suite ===${RESET}\n`)

const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-workspace-delete-agent-test-'))
const workspacePath = path.join(tmpHome, 'workspace-under-test')
const agentId = 'test-agent1'
const workspaceAgentDir = path.join(workspacePath, 'AGENTS', agentId)
const sharedAgentDir = path.join(tmpHome, '.openclaw', 'agents', agentId, 'agent')
const openclawConfigPath = path.join(tmpHome, '.openclaw', 'openclaw.json')

fs.mkdirSync(workspaceAgentDir, { recursive: true })
fs.writeFileSync(path.join(workspaceAgentDir, 'IDENTITY.md'), '# Test Agent\n', 'utf-8')
fs.mkdirSync(sharedAgentDir, { recursive: true })
fs.writeFileSync(path.join(sharedAgentDir, 'session.json'), '{}', 'utf-8')
fs.mkdirSync(path.dirname(openclawConfigPath), { recursive: true })
fs.writeFileSync(openclawConfigPath, JSON.stringify({
  gateway: { port: 18889, auth: { token: 'test-token' } },
  agents: {
    list: [{
      id: agentId,
      name: agentId,
      workspace: workspaceAgentDir,
      agentDir: sharedAgentDir,
    }],
  },
}, null, 2))

writeWorkspaceRegistry(tmpHome, workspacePath)
process.env.HOME = tmpHome
process.env.OPENCLAW_WORKSPACE = workspacePath
resetWorkspaceManagerForTests()

async function run() {
  await test('deleteAgent removes workspace dir, shared home dir, and config entry', () => {
    const result = deleteAgent(agentId, false)
    assert(result.errors.length === 0, `Expected no errors, got: ${result.errors.join('; ')}`)
    assert(!fs.existsSync(workspaceAgentDir), 'Expected workspace agent dir to be removed')
    assert(!fs.existsSync(path.join(tmpHome, '.openclaw', 'agents', agentId)), 'Expected shared ~/.openclaw agent dir to be removed')

    const config = JSON.parse(fs.readFileSync(openclawConfigPath, 'utf-8'))
    const stillPresent = (config.agents?.list || []).some((agent: any) => agent.id === agentId)
    assert(!stillPresent, 'Expected agent entry to be removed from openclaw.json')
  })

  await test('deleteAgent preserves shared state when another workspace still references the same agent id', () => {
    const multiHome = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-workspace-delete-agent-multi-'))
    const activeWorkspace = path.join(multiHome, 'workspace-a')
    const otherWorkspace = path.join(multiHome, 'workspace-b')
    const duplicateId = 'shared-agent'
    const activeAgentDir = path.join(activeWorkspace, 'AGENTS', duplicateId)
    const otherAgentDir = path.join(otherWorkspace, 'AGENTS', duplicateId)
    const sharedRootDir = path.join(multiHome, '.openclaw', 'agents', duplicateId)
    const sharedAgentRuntimeDir = path.join(sharedRootDir, 'agent')
    const multiConfigPath = path.join(multiHome, '.openclaw', 'openclaw.json')

    fs.mkdirSync(activeAgentDir, { recursive: true })
    fs.mkdirSync(otherAgentDir, { recursive: true })
    fs.writeFileSync(path.join(activeAgentDir, 'IDENTITY.md'), '# Active Copy\n', 'utf-8')
    fs.writeFileSync(path.join(otherAgentDir, 'IDENTITY.md'), '# Other Copy\n', 'utf-8')
    fs.mkdirSync(sharedAgentRuntimeDir, { recursive: true })
    fs.writeFileSync(path.join(sharedAgentRuntimeDir, 'session.json'), '{}', 'utf-8')
    fs.mkdirSync(path.dirname(multiConfigPath), { recursive: true })
    fs.writeFileSync(multiConfigPath, JSON.stringify({
      agents: {
        list: [
          { id: duplicateId, workspace: activeAgentDir, agentDir: sharedAgentRuntimeDir },
          { id: duplicateId, workspace: otherAgentDir, agentDir: sharedAgentRuntimeDir },
        ],
      },
    }, null, 2))

    writeWorkspaceRegistry(multiHome, activeWorkspace)
    process.env.HOME = multiHome
    process.env.OPENCLAW_WORKSPACE = activeWorkspace
    resetWorkspaceManagerForTests()

    const result = deleteAgent(duplicateId, true)
    assert(result.errors.length === 0, `Expected no errors, got: ${result.errors.join('; ')}`)
    assert(!fs.existsSync(activeAgentDir), 'Expected active workspace copy removed')
    assert(fs.existsSync(otherAgentDir), 'Expected other workspace copy preserved')
    assert(fs.existsSync(sharedRootDir), 'Expected shared runtime preserved for remaining workspace copy')

    const config = JSON.parse(fs.readFileSync(multiConfigPath, 'utf-8'))
    const remaining = (config.agents?.list || []).filter((agent: any) => agent.id === duplicateId)
    assert(remaining.length === 1, `Expected one duplicate entry to remain, got ${remaining.length}`)
    assert(remaining[0].workspace === otherAgentDir, 'Expected other workspace entry to remain registered')
  })

  if (typeof originalHome === 'undefined') delete process.env.HOME
  else process.env.HOME = originalHome

  if (typeof originalWorkspace === 'undefined') delete process.env.OPENCLAW_WORKSPACE
  else process.env.OPENCLAW_WORKSPACE = originalWorkspace

  resetWorkspaceManagerForTests()

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
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
