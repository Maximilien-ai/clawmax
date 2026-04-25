/**
 * Teams test suite
 *
 * Run with: npx ts-node --transpileOnly server/lib/teams.test.ts
 */

import fs from 'fs'
import os from 'os'
import path from 'path'
import { createTeam, deleteTeam, getTeam, listTeams, updateTeam } from './teams'
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
      createdAt: '2026-04-24T00:00:00.000Z',
      lastAccessedAt: '2026-04-24T00:00:00.000Z',
      color: '#3B82F6',
      tags: [],
    }],
  }, null, 2))
}

function writeAgentIdentity(workspacePath: string, agentId: string) {
  const agentDir = path.join(workspacePath, 'AGENTS', agentId)
  fs.mkdirSync(agentDir, { recursive: true })
  fs.writeFileSync(path.join(agentDir, 'IDENTITY.md'), `# Identity\n\n- **Name:** ${agentId}\n`, 'utf-8')
}

console.log(`\n${YELLOW}=== Teams Test Suite ===${RESET}\n`)

const originalHome = process.env.HOME
const originalWorkspace = process.env.OPENCLAW_WORKSPACE

const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-teams-test-'))
const workspacePath = path.join(tmpHome, 'workspace')
fs.mkdirSync(path.join(workspacePath, 'SYSTEM'), { recursive: true })
writeAgentIdentity(workspacePath, 'ceo')
writeAgentIdentity(workspacePath, 'pm')
writeAgentIdentity(workspacePath, 'eng1')
writeAgentIdentity(workspacePath, 'eng2')
writeWorkspaceRegistry(tmpHome, workspacePath)

process.env.HOME = tmpHome
process.env.OPENCLAW_WORKSPACE = workspacePath
resetWorkspaceManagerForTests()

test('createTeam persists normalized teams', () => {
  const team = createTeam({
    name: 'Engineering',
    purpose: ' Build the product ',
    leaderAgentId: 'ceo',
    memberAgentIds: ['eng1', 'eng2', 'eng1', 'ceo'],
    tags: ['build', 'core', 'build'],
  })

  assert(team.id === 'engineering', `Expected slug id, got ${team.id}`)
  assert(team.purpose === 'Build the product', 'Expected trimmed purpose')
  assert(team.memberAgentIds.length === 2, 'Expected duplicate and leader member ids removed')
  assert(team.tags.length === 2, 'Expected duplicate tags removed')
  assert(listTeams().length === 1, 'Expected persisted team')
})

test('createTeam supports parent team references', () => {
  const parent = createTeam({
    name: 'Leadership',
    leaderAgentId: 'ceo',
    memberAgentIds: ['pm'],
  })
  const child = createTeam({
    name: 'Product',
    leaderAgentId: 'pm',
    parentTeamId: parent.id,
  })

  assert(child.parentTeamId === parent.id, 'Expected parent team id to persist')
})

test('createTeam rejects unknown agent references', () => {
  let threw = false
  try {
    createTeam({
      name: 'Ghost Team',
      leaderAgentId: 'ghost',
    })
  } catch (error: any) {
    threw = /Unknown leader agent/.test(error.message)
  }
  assert(threw, 'Expected unknown leader validation')
})

test('updateTeam preserves id and updates hierarchy fields', () => {
  const leadership = getTeam('leadership')
  assert(leadership !== null, 'Expected leadership team')
  const updated = updateTeam('engineering', {
    name: 'Engineering Platform',
    parentTeamId: leadership!.id,
    tags: ['platform'],
  })
  assert(updated?.id === 'engineering', 'Expected stable team id on update')
  assert(updated?.name === 'Engineering Platform', 'Expected updated name')
  assert(updated?.parentTeamId === leadership!.id, 'Expected updated parent team')
  assert(updated?.tags[0] === 'platform', 'Expected updated tags')
})

test('deleteTeam clears parentTeamId from children', () => {
  const deleted = deleteTeam('leadership')
  const product = getTeam('product')
  assert(deleted === true, 'Expected delete to succeed')
  assert(product?.parentTeamId === undefined, 'Expected child parentTeamId to be cleared')
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
