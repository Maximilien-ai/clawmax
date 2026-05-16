import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { resolveOpikRuntimeConfig } from './opik'
import { resetWorkspaceManagerForTests } from './workspace-manager'

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
  } catch (error: any) {
    console.log(`${RED}✗${RESET} ${name}`)
    console.error(`  Error: ${error.message}`)
    testsFailed++
  }
}

function withTempWorkspace<T>(fn: (workspaceRoot: string) => T): T {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'opik-home-'))
  const workspaceRoot = path.join(home, 'workspace')
  fs.mkdirSync(path.join(workspaceRoot, 'SYSTEM'), { recursive: true })
  fs.mkdirSync(path.join(home, '.openclaw'), { recursive: true })
  fs.writeFileSync(path.join(home, '.openclaw', 'dashboard-workspaces.json'), JSON.stringify({
    version: '1.0.0',
    activeWorkspaceId: 'default',
    workspaces: [
      {
        id: 'default',
        name: 'Default',
        path: workspaceRoot,
        createdAt: new Date().toISOString(),
        lastAccessedAt: new Date().toISOString(),
      },
    ],
  }, null, 2))

  const originalHome = process.env.HOME
  const originalWorkspace = process.env.OPENCLAW_WORKSPACE
  process.env.HOME = home
  process.env.OPENCLAW_WORKSPACE = workspaceRoot
  resetWorkspaceManagerForTests()
  try {
    return fn(workspaceRoot)
  } finally {
    if (originalHome === undefined) delete process.env.HOME
    else process.env.HOME = originalHome
    if (originalWorkspace === undefined) delete process.env.OPENCLAW_WORKSPACE
    else process.env.OPENCLAW_WORKSPACE = originalWorkspace
    resetWorkspaceManagerForTests()
  }
}

function withOriginalOpikEnv<T>(fn: () => T): T {
  const originalApiKey = process.env.OPIK_API_KEY
  const originalWorkspace = process.env.OPIK_WORKSPACE
  const originalProject = process.env.OPIK_PROJECT_NAME
  try {
    return fn()
  } finally {
    if (originalApiKey === undefined) delete process.env.OPIK_API_KEY
    else process.env.OPIK_API_KEY = originalApiKey
    if (originalWorkspace === undefined) delete process.env.OPIK_WORKSPACE
    else process.env.OPIK_WORKSPACE = originalWorkspace
    if (originalProject === undefined) delete process.env.OPIK_PROJECT_NAME
    else process.env.OPIK_PROJECT_NAME = originalProject
  }
}

console.log(`\n${YELLOW}=== Opik Runtime Config Test Suite ===${RESET}\n`)

test('resolveOpikRuntimeConfig falls back to workspace integration Opik project/workspace', () => {
  withTempWorkspace((workspaceRoot) => {
    withOriginalOpikEnv(() => {
      process.env.OPIK_API_KEY = 'test-opik-key'
      delete process.env.OPIK_WORKSPACE
      delete process.env.OPIK_PROJECT_NAME

      fs.writeFileSync(path.join(workspaceRoot, 'SYSTEM', 'integrations.json'), JSON.stringify({
        opikWorkspace: 'clawmax-ai',
        opikProject: 'clawmax-cloud',
      }, null, 2))

      const resolved = resolveOpikRuntimeConfig()
      assert.equal(resolved.apiKey, 'test-opik-key')
      assert.equal(resolved.workspace, 'clawmax-ai')
      assert.equal(resolved.projectName, 'clawmax-cloud')
    })
  })
})

test('resolveOpikRuntimeConfig keeps explicit env project/workspace over workspace defaults', () => {
  withTempWorkspace((workspaceRoot) => {
    withOriginalOpikEnv(() => {
      process.env.OPIK_API_KEY = 'test-opik-key'
      process.env.OPIK_WORKSPACE = 'env-workspace'
      process.env.OPIK_PROJECT_NAME = 'clawmax-enterprise'

      fs.writeFileSync(path.join(workspaceRoot, 'SYSTEM', 'integrations.json'), JSON.stringify({
        opikWorkspace: 'workspace-default',
        opikProject: 'clawmax-cloud',
      }, null, 2))

      const resolved = resolveOpikRuntimeConfig()
      assert.equal(resolved.workspace, 'env-workspace')
      assert.equal(resolved.projectName, 'clawmax-enterprise')
    })
  })
})

test('resolveOpikRuntimeConfig falls back to default workspace and project when none are configured', () => {
  withTempWorkspace(() => {
    withOriginalOpikEnv(() => {
      process.env.OPIK_API_KEY = 'test-opik-key'
      delete process.env.OPIK_WORKSPACE
      delete process.env.OPIK_PROJECT_NAME

      const resolved = resolveOpikRuntimeConfig()
      assert.equal(resolved.workspace, 'default')
      assert.equal(resolved.projectName, 'clawmax')
    })
  })
})

console.log('\n========================================')
console.log(`Tests passed: ${testsPassed}`)
console.log(`Tests failed: ${testsFailed}`)
console.log('========================================\n')

if (testsFailed > 0) {
  process.exit(1)
}

console.log(`${GREEN}All tests passed${RESET}`)
