/**
 * Workspace integrations config test suite
 *
 * Run with: npx ts-node --transpileOnly server/lib/workspace-integrations.test.ts
 */

import fs from 'fs'
import os from 'os'
import path from 'path'
import { readWorkspaceIntegrationConfig, writeWorkspaceIntegrationConfig } from './workspace-integrations'
import { resetWorkspaceManagerForTests } from './workspace-manager'

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const RESET = '\x1b[0m'

let testsPassed = 0
let testsFailed = 0

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`${GREEN}✓${RESET} ${name}`)
    testsPassed++
  } catch (err: any) {
    console.log(`${RED}✗${RESET} ${name}`)
    console.log(`  Error: ${err.message}`)
    testsFailed++
  }
}

function writeWorkspaceRegistry(tmpHome: string, workspacePath: string) {
  const registryPath = path.join(tmpHome, '.openclaw', 'dashboard-workspaces.json')
  fs.mkdirSync(path.dirname(registryPath), { recursive: true })
  fs.writeFileSync(registryPath, JSON.stringify({
    version: '1.0.0',
    activeWorkspaceId: 'test-workspace',
    workspaces: [{
      id: 'test-workspace',
      name: 'Test Workspace',
      path: workspacePath,
      createdAt: '2026-04-02T00:00:00.000Z',
      lastAccessedAt: '2026-04-02T00:00:00.000Z',
      color: '#3B82F6',
      tags: [],
    }],
  }, null, 2))
}

console.log(`\n${YELLOW}=== Workspace Integrations Config Test Suite ===${RESET}\n`)

const originalHome = process.env.HOME
const originalWorkspace = process.env.OPENCLAW_WORKSPACE

const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-workspace-integrations-test-'))
const workspacePath = path.join(tmpHome, 'workspace')
fs.mkdirSync(path.join(workspacePath, 'SYSTEM'), { recursive: true })
writeWorkspaceRegistry(tmpHome, workspacePath)

process.env.HOME = tmpHome
process.env.OPENCLAW_WORKSPACE = workspacePath
resetWorkspaceManagerForTests()

test('readWorkspaceIntegrationConfig returns empty object when no config exists', () => {
  const config = readWorkspaceIntegrationConfig()
  assert(Object.keys(config).length === 0, 'Expected empty config')
})

test('writeWorkspaceIntegrationConfig persists trimmed workspace defaults', () => {
  const config = writeWorkspaceIntegrationConfig({
    preferredModel: ' openai/gpt-4.1 ',
    githubDefaultRepo: ' Maximilien-ai/clawmax ',
    sensoContextLabel: ' Launch / Demo ',
    ollamaBaseUrl: ' http://localhost:11434 ',
    ollamaDefaultModel: ' llama3.2 ',
    opikWorkspace: ' team-space ',
    opikProject: ' clawmax ',
  })

  assert(config.preferredModel === 'openai/gpt-4.1', 'Expected trimmed preferredModel')
  assert(config.githubDefaultRepo === 'Maximilien-ai/clawmax', 'Expected trimmed github repo')
  assert(config.sensoContextLabel === 'Launch / Demo', 'Expected trimmed senso context')
  assert(typeof config.updatedAt === 'string' && config.updatedAt.length > 0, 'Expected updatedAt')

  const persisted = readWorkspaceIntegrationConfig()
  assert(persisted.githubDefaultRepo === 'Maximilien-ai/clawmax', 'Expected persisted github repo')
  assert(persisted.ollamaDefaultModel === 'llama3.2', 'Expected persisted ollama model')
  assert(persisted.opikProject === 'clawmax', 'Expected persisted opik project')
})

test('writeWorkspaceIntegrationConfig normalizes enabled partner selections', () => {
  const config = writeWorkspaceIntegrationConfig({
    enabledPartners: [' senso ', 'github', 'github'],
  })

  assert(JSON.stringify(config.enabledPartners) === JSON.stringify(['senso', 'github']), 'Expected enabled partners normalized and deduplicated')

  const persisted = readWorkspaceIntegrationConfig()
  assert(JSON.stringify(persisted.enabledPartners) === JSON.stringify(['senso', 'github']), 'Expected persisted enabled partners')
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
