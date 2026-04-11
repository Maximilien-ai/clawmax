/**
 * Workspace manager test suite
 *
 * Run with: npx ts-node --transpile-only server/lib/workspace-manager.test.ts
 */

import fs from 'fs'
import os from 'os'
import path from 'path'
import { WorkspaceManager } from './workspace-manager'

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
    console.error(`  Error: ${err.message}`)
    testsFailed++
  }
}

console.log(`\n${YELLOW}=== Workspace Manager Test Suite ===${RESET}\n`)

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-workspace-manager-test-'))
const registryPath = path.join(tmpRoot, '.openclaw', 'dashboard-workspaces.json')

function createManager() {
  return new WorkspaceManager(registryPath)
}

test('createWorkspace allows a missing target directory', () => {
  const manager = createManager()
  const workspacePath = path.join(tmpRoot, 'fresh-workspace')
  const workspace = manager.createWorkspace('Fresh Workspace', workspacePath)

  assert(workspace.path === workspacePath, 'Expected workspace path to be preserved')
  assert(fs.existsSync(path.join(workspacePath, 'AGENTS')), 'Expected AGENTS dir to be created')
  assert(fs.existsSync(path.join(workspacePath, 'ORG', 'GROUPS.md')), 'Expected GROUPS.md to be created')
})

test('createWorkspace rejects an existing non-empty directory', () => {
  const manager = createManager()
  const workspacePath = path.join(tmpRoot, 'populated-workspace')
  fs.mkdirSync(workspacePath, { recursive: true })
  fs.writeFileSync(path.join(workspacePath, 'ghost.txt'), 'boo', 'utf-8')

  let threw = false
  try {
    manager.createWorkspace('Populated Workspace', workspacePath)
  } catch (err: any) {
    threw = /not empty/.test(err.message)
  }

  assert(threw, 'Expected createWorkspace to reject a non-empty existing directory')
})

test('createWorkspace reuses an existing empty workspace scaffold directory', () => {
  const manager = createManager()
  const workspacePath = path.join(tmpRoot, 'stale-empty-workspace')
  fs.mkdirSync(path.join(workspacePath, 'AGENTS', 'archive'), { recursive: true })
  fs.mkdirSync(path.join(workspacePath, 'ORG'), { recursive: true })
  fs.mkdirSync(path.join(workspacePath, 'SYSTEM'), { recursive: true })
  fs.writeFileSync(path.join(workspacePath, 'ORG', 'COMMUNITIES.md'), '# Communities\n\n## Communities\n\n', 'utf-8')
  fs.writeFileSync(path.join(workspacePath, 'ORG', 'GROUPS.md'), '# Groups\n\n## Groups\n\n', 'utf-8')

  const workspace = manager.createWorkspace('Reused Workspace', workspacePath)

  assert(workspace.path === workspacePath, 'Expected scaffold workspace path to be reused')
  assert(fs.existsSync(path.join(workspacePath, 'AGENTS', 'archive')), 'Expected AGENTS/archive to remain available')
})

test('inspectWorkspacePathConflict reports adoptable existing workspaces', () => {
  const manager = createManager()
  const workspacePath = path.join(tmpRoot, 'adoptable-workspace')
  fs.mkdirSync(path.join(workspacePath, 'AGENTS', 'agent-a'), { recursive: true })
  fs.writeFileSync(path.join(workspacePath, 'AGENTS', 'agent-a', 'IDENTITY.md'), '# Identity', 'utf-8')

  const conflict = manager.inspectWorkspacePathConflict(workspacePath)

  assert(conflict.canAdopt === true, 'Expected existing unregistered workspace to be adoptable')
  assert(conflict.canOverwrite === true, 'Expected existing unregistered workspace to be overwritable')
  assert(conflict.registeredWorkspace === null, 'Expected no registered workspace for adoptable path')
})

test('createWorkspace can adopt an existing workspace directory', () => {
  const manager = createManager()
  const workspacePath = path.join(tmpRoot, 'existing-workspace')
  fs.mkdirSync(path.join(workspacePath, 'AGENTS', 'agent-a'), { recursive: true })
  fs.writeFileSync(path.join(workspacePath, 'AGENTS', 'agent-a', 'IDENTITY.md'), '# Identity', 'utf-8')

  const workspace = manager.createWorkspace('Existing Workspace', workspacePath, { mode: 'adopt' })

  assert(workspace.path === workspacePath, 'Expected existing workspace path to be adopted')
  assert(fs.existsSync(path.join(workspacePath, 'AGENTS', 'agent-a', 'IDENTITY.md')), 'Expected existing workspace files to remain in place')
})

test('withWorkspace uses request-local workspace context without changing active workspace', async () => {
  const manager = createManager()
  const alphaPath = path.join(tmpRoot, 'alpha-workspace')
  const betaPath = path.join(tmpRoot, 'beta-workspace')

  manager.createWorkspace('Alpha Workspace', alphaPath)
  manager.createWorkspace('Beta Workspace', betaPath)
  manager.setActiveWorkspace('alpha-workspace')

  assert(manager.getActiveWorkspace().id === 'alpha-workspace', 'Expected alpha to be the real active workspace')

  await manager.withWorkspace('beta-workspace', async () => {
    assert(manager.getActiveWorkspace().id === 'beta-workspace', 'Expected contextual workspace inside withWorkspace')
  })

  assert(manager.getActiveWorkspace().id === 'alpha-workspace', 'Expected active workspace to remain alpha after withWorkspace')
})

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
