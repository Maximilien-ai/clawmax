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

test('explicit registry wins over an isolated environment registry', () => {
  const previous = process.env.CLAWMAX_WORKSPACE_REGISTRY_PATH
  const isolated = path.join(tmpRoot, 'isolated', 'registry.json')
  try {
    process.env.CLAWMAX_WORKSPACE_REGISTRY_PATH = isolated
    new WorkspaceManager().loadRegistry()
    assert(fs.existsSync(isolated), 'Environment registry must be created')
    const explicit = path.join(tmpRoot, 'explicit', 'registry.json')
    new WorkspaceManager(explicit).loadRegistry()
    assert(fs.existsSync(explicit), 'Explicit registry must take precedence')
  } finally {
    if (previous === undefined) delete process.env.CLAWMAX_WORKSPACE_REGISTRY_PATH
    else process.env.CLAWMAX_WORKSPACE_REGISTRY_PATH = previous
  }
})

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

test('deleteWorkspace removes a non-active test workspace without changing the active workspace', () => {
  const manager = createManager()
  const originalPath = path.join(tmpRoot, 'original-cleanup-workspace')
  const systemTestPath = path.join(tmpRoot, 'clawmax-system-test')

  manager.createWorkspace('Original Cleanup Workspace', originalPath)
  const systemTestWorkspace = manager.createWorkspace('ClawMax System Test', systemTestPath)
  manager.setActiveWorkspace('original-cleanup-workspace')

  manager.deleteWorkspace(systemTestWorkspace.id)

  assert(manager.getActiveWorkspace().id === 'original-cleanup-workspace', 'Expected original workspace to remain active')
  assert(manager.getWorkspace(systemTestWorkspace.id) === null, 'Expected system-test workspace registry entry to be removed')
})

test('registry identity remains readable for authorization while resources are quarantined', () => {
  const manager = createManager()
  const workspace = manager.createWorkspace('Transaction Workspace', path.join(tmpRoot, 'transaction-workspace'))
  const journalDirectory = path.join(workspace.path, '.clawmax')
  fs.mkdirSync(journalDirectory, { recursive: true })
  const journal = path.join(journalDirectory, 'template-gateway-transaction.json')
  fs.writeFileSync(journal, '{pending')
  try {
    assert(manager.getWorkspaceRegistration(workspace.id)?.path === workspace.path, 'Registry identity must remain available for owner rechecks')
    let blocked = false
    try { manager.getWorkspace(workspace.id) } catch { blocked = true }
    assert(blocked, 'Workspace resources must remain quarantined')
  } finally { fs.unlinkSync(journal) }
  assert(manager.getWorkspace(workspace.id)?.path === workspace.path, 'Resources must be available after recovery')
})

test('workspace counts recognize canonical identities and update after create/archive/delete', () => {
  const manager = createManager()
  const workspace = manager.createWorkspace('Count regression', path.join(tmpRoot, 'counts'))
  const agentRoot = path.join(workspace.path, 'AGENTS')
  const add = (id: string, identity: string) => {
    const dir = path.join(agentRoot, id)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'IDENTITY.md'), identity)
  }
  const count = () => manager.listWorkspaces().find(w => w.id === workspace.id)?.agentCount
  add('first', '- **Name:** First Agent\n- **Model:** openai/gpt-5.4-mini')
  add('second', '- Name: Second Agent\n')
  add('third', 'Name: Third Agent\r\n')
  add('empty', '- **Name:**   \n- **Model:** model')
  add('_internal', '- **Name:** Internal')
  add('.hidden', '- **Name:** Hidden')
  add('archive', '- **Name:** Archive')
  assert(count() === 3, 'Three canonical agent identities must count; scaffolds and excluded dirs must not')
  fs.renameSync(path.join(agentRoot, 'third'), path.join(agentRoot, 'archive', 'third'))
  assert(count() === 2, 'Archived agent no longer counts')
  fs.rmSync(path.join(agentRoot, 'second'), { recursive: true })
  assert(count() === 1, 'Deleted agent no longer counts')
  add('fourth', '- **Name:** Fourth')
  assert(count() === 2, 'New agent counts without resetting the registry')
  const reloaded = new WorkspaceManager(registryPath)
  assert(reloaded.listWorkspaces().find(w => w.id === workspace.id)?.agentCount === 2, 'Count persists by discovery after reload')
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
