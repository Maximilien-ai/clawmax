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
fs.writeFileSync(path.join(workspace, 'ORG', 'GROUPS.md'), [
  '# Groups',
  '',
  '### Engineering',
  '- **Description:** Engineering group',
  '- **Community:** Product',
  '',
  '### QA Review',
  '- **Description:** QA group',
].join('\n'), 'utf-8')
fs.writeFileSync(path.join(workspace, 'ORG', 'COMMUNITIES.md'), [
  '# Communities',
  '',
  '### Product',
  '- **Description:** Product community',
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
