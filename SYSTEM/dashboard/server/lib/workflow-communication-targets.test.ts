/**
 * Workflow communication target regression tests
 *
 * Run with: npx ts-node --transpileOnly server/lib/workflow-communication-targets.test.ts
 */

import fs from 'fs'
import os from 'os'
import path from 'path'
import assert from 'node:assert/strict'
import {
  formatWorkflowCommunicationTargetError,
  resolveWorkflowCommunicationTargets,
} from './workflows'

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
    console.log(`  Error: ${err.message}`)
    testsFailed++
  }
}

const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-workflow-communication-targets-'))
fs.mkdirSync(path.join(workspace, 'ORG'), { recursive: true })
fs.mkdirSync(path.join(workspace, 'SYSTEM'), { recursive: true })
fs.mkdirSync(path.join(workspace, 'AGENTS', 'lead'), { recursive: true })
fs.mkdirSync(path.join(workspace, 'AGENTS', 'researcher'), { recursive: true })
fs.writeFileSync(path.join(workspace, 'ORG', 'GROUPS.md'), [
  '# Groups',
  '',
  '### Engineering',
  '- **Description:** Engineering group',
  '- **Community:** Product',
  '- **Members:** lead',
  '',
  '### Research Team',
  '- **Description:** Research group',
  '- **Community:** Ops Hub',
  '- **Members:** lead, researcher',
  '',
  '### QA Review',
  '- **Description:** QA group',
  '- **Members:** lead',
].join('\n'), 'utf-8')
fs.writeFileSync(path.join(workspace, 'SYSTEM', 'teams.json'), JSON.stringify({
  version: '1.0.0',
  teams: [
    {
      id: 'research-team',
      name: 'Research Team',
      memberAgentIds: ['researcher'],
      leaderAgentId: 'lead',
      tags: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ],
}, null, 2), 'utf-8')
fs.mkdirSync(path.join(workspace, '.home', '.openclaw'), { recursive: true })
fs.writeFileSync(path.join(workspace, '.home', '.openclaw', 'openclaw.json'), JSON.stringify({
  agents: {
    list: [
      { id: 'lead', workspace: path.join(workspace, 'AGENTS', 'lead') },
      { id: 'researcher', workspace: path.join(workspace, 'AGENTS', 'researcher') },
    ],
  },
}, null, 2), 'utf-8')
fs.writeFileSync(path.join(workspace, 'AGENTS', 'lead', 'IDENTITY.md'), [
  '# Identity',
  '',
  '- **Name:** Lead',
  '- **Role:** Lead',
  '- **Communities:** Ops Hub',
  '- **Groups:** Research Team, QA Review',
].join('\n'), 'utf-8')
fs.writeFileSync(path.join(workspace, 'AGENTS', 'researcher', 'IDENTITY.md'), [
  '# Identity',
  '',
  '- **Name:** Researcher',
  '- **Role:** Researcher',
  '- **Communities:** Ops Hub',
  '- **Groups:** Research Team',
].join('\n'), 'utf-8')
fs.writeFileSync(path.join(workspace, 'ORG', 'COMMUNITIES.md'), [
  '# Communities',
  '',
  '### Product',
  '- **Description:** Product community',
  '- **Members:** lead',
  '',
  '### Ops Hub',
  '- **Description:** Operations community',
  '- **Members:** lead, researcher',
].join('\n'), 'utf-8')

console.log(`\n${YELLOW}=== Workflow Communication Target Tests ===${RESET}\n`)

test('resolves workflow group and community targets canonically', () => {
  const resolved = resolveWorkflowCommunicationTargets({
    groups: ['engineering', 'Engineering', 'QA Review'],
    communities: ['product'],
  }, workspace)

  assert.deepEqual(resolved.groups, ['Engineering', 'QA Review'])
  assert.deepEqual(resolved.communities, ['Product'])
  assert.deepEqual(resolved.missingGroups, [])
  assert.deepEqual(resolved.missingCommunities, [])
})

test('reports missing workflow communication targets without creating fallback names', () => {
  const resolved = resolveWorkflowCommunicationTargets({
    groups: ['Missing Group'],
    communities: ['Missing Community'],
  }, workspace)

  assert.deepEqual(resolved.groups, [])
  assert.deepEqual(resolved.communities, [])
  assert.deepEqual(resolved.missingGroups, ['Missing Group'])
  assert.deepEqual(resolved.missingCommunities, ['Missing Community'])
})

test('infers workflow communication targets from team ids when explicit channels are omitted', () => {
  const previousHome = process.env.HOME
  const previousWorkspace = process.env.OPENCLAW_WORKSPACE
  process.env.HOME = path.join(workspace, '.home')
  process.env.OPENCLAW_WORKSPACE = workspace
  try {
    const resolved = resolveWorkflowCommunicationTargets({
      groups: [],
      communities: [],
      teamIds: ['research-team'],
    }, workspace)

    assert.deepEqual(resolved.groups, ['Research Team'])
    assert.deepEqual(resolved.communities, ['Ops Hub'])
    assert.deepEqual(resolved.missingGroups, [])
    assert.deepEqual(resolved.missingCommunities, [])
  } finally {
    if (typeof previousHome === 'undefined') delete process.env.HOME
    else process.env.HOME = previousHome
    if (typeof previousWorkspace === 'undefined') delete process.env.OPENCLAW_WORKSPACE
    else process.env.OPENCLAW_WORKSPACE = previousWorkspace
  }
})

test('infers shared workflow communication targets from targeted agent memberships', () => {
  const previousHome = process.env.HOME
  const previousWorkspace = process.env.OPENCLAW_WORKSPACE
  process.env.HOME = path.join(workspace, '.home')
  process.env.OPENCLAW_WORKSPACE = workspace
  try {
    const resolved = resolveWorkflowCommunicationTargets({
      groups: [],
      communities: [],
      agents: ['lead', 'researcher'],
    }, workspace)

    assert.deepEqual(resolved.groups, ['Research Team'])
    assert.deepEqual(resolved.communities, ['Ops Hub'])
    assert.deepEqual(resolved.missingGroups, [])
    assert.deepEqual(resolved.missingCommunities, [])
  } finally {
    if (typeof previousHome === 'undefined') delete process.env.HOME
    else process.env.HOME = previousHome
    if (typeof previousWorkspace === 'undefined') delete process.env.OPENCLAW_WORKSPACE
    else process.env.OPENCLAW_WORKSPACE = previousWorkspace
  }
})

test('formats actionable missing target errors', () => {
  const error = formatWorkflowCommunicationTargetError({
    missingGroups: ['Missing Group'],
    missingCommunities: ['Missing Community'],
  })

  assert(error?.startsWith('COMMS FAIL:'), `Expected COMMS FAIL prefix, got ${error}`)
  assert(error?.includes('missing group: "Missing Group"'), `Expected missing group detail, got ${error}`)
  assert(error?.includes('missing community: "Missing Community"'), `Expected missing community detail, got ${error}`)
  assert(error?.includes('Add the target in Communications or update the workflow targeting'), `Expected remediation guidance, got ${error}`)
})

test('returns null when all communication targets resolve', () => {
  const error = formatWorkflowCommunicationTargetError({
    missingGroups: [],
    missingCommunities: [],
  })

  assert.equal(error, null)
})

try {
  fs.rmSync(workspace, { recursive: true, force: true })
} catch {}

console.log(`\nTests passed: ${testsPassed}`)
console.log(`Tests failed: ${testsFailed}`)

if (testsFailed > 0) {
  console.log(`\n${RED}Some tests failed${RESET}`)
  process.exit(1)
} else {
  console.log(`\n${GREEN}All tests passed${RESET}`)
}
