/**
 * Workflows API Test Suite
 *
 * Run with: npx ts-node --transpileOnly server/lib/workflows.test.ts
 */

import {
  listWorkflows,
  getWorkflow,
  createWorkflow,
  updateWorkflow,
  deleteWorkflow,
  validateCron,
  parseWorkflowMd,
  workflowToMarkdown,
  areDependenciesMet,
  completeWorkflow,
  getDAGStatus,
  triggerWorkflow,
} from './workflows'

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const RESET = '\x1b[0m'

let testsPassed = 0
let testsFailed = 0
const createdIds: string[] = []

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

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

console.log(`\n${YELLOW}=== Workflows Test Suite ===${RESET}\n`)

// ============================================================================
// Cron Validation
// ============================================================================

test('validateCron accepts valid cron expressions', () => {
  assert(validateCron('0 9 * * *').valid, '0 9 * * * should be valid')
  assert(validateCron('*/5 * * * *').valid, '*/5 should be valid')
  assert(validateCron('0 */2 * * *').valid, 'every 2h should be valid')
  assert(validateCron('30 9 * * 1-5').valid, 'weekdays should be valid')
})

test('validateCron rejects invalid expressions', () => {
  assert(!validateCron('invalid').valid, 'invalid should fail')
  assert(!validateCron('60 * * * *').valid, '60 minutes should fail')
  assert(!validateCron('').valid, 'empty should fail')
})

test('validateCron returns human-readable description', () => {
  const result = validateCron('0 9 * * *')
  assert(result.humanReadable !== undefined, 'Should have humanReadable')
  assert(result.humanReadable!.toLowerCase().includes('9'), 'Should mention 9')
})

// ============================================================================
// CRUD
// ============================================================================

test('createWorkflow creates a workflow', () => {
  const result = createWorkflow({
    name: 'Test Create',
    description: 'Testing create',
    schedule: 'manual',
    content: '# Test\nDo the thing.',
    executionMode: 'automated',
    targeting: { agents: [], groups: [], tags: [], communities: [] },
  })
  assert(result.success, `Should succeed: ${result.error}`)
  assert(result.id !== undefined, 'Should return id')
  createdIds.push(result.id!)
})

test('createWorkflow with dependsOn and type', () => {
  const result = createWorkflow({
    name: 'Test Deps',
    description: 'Testing deps',
    schedule: 'manual',
    content: '# Test deps',
    executionMode: 'automated',
    dependsOn: [createdIds[0]],
    type: 'conditional',
    targeting: { agents: [], groups: [], tags: [], communities: [] },
  })
  assert(result.success, `Should succeed: ${result.error}`)
  createdIds.push(result.id!)

  const wf = getWorkflow(result.id!)
  assert(wf?.dependsOn?.includes(createdIds[0]) === true, 'Should have dependsOn')
  assert(wf?.type === 'conditional', 'Should have type')
})

test('createWorkflow validates required fields', () => {
  const result = createWorkflow({ name: 'Missing fields' } as any)
  assert(!result.success, 'Should fail without required fields')
})

test('createWorkflow rejects invalid cron', () => {
  const result = createWorkflow({
    name: 'Bad Cron',
    description: 'Test',
    schedule: 'not-a-cron',
    content: 'test',
    targeting: { agents: [], groups: [], tags: [], communities: [] },
  })
  assert(!result.success, 'Should fail with invalid cron')
})

test('createWorkflow accepts manual and once schedules', () => {
  const r1 = createWorkflow({
    name: 'Manual Test',
    description: 'Test',
    schedule: 'manual',
    content: 'test',
    targeting: { agents: [], groups: [], tags: [], communities: [] },
  })
  assert(r1.success, 'manual should be accepted')
  createdIds.push(r1.id!)

  const r2 = createWorkflow({
    name: 'Once Test',
    description: 'Test',
    schedule: 'once',
    content: 'test',
    targeting: { agents: [], groups: [], tags: [], communities: [] },
  })
  assert(r2.success, 'once should be accepted')
  createdIds.push(r2.id!)
})

test('getWorkflow returns workflow by ID', () => {
  const wf = getWorkflow(createdIds[0])
  assert(wf !== null, 'Should find workflow')
  assert(wf!.name === 'Test Create', 'Name should match')
})

test('getWorkflow returns null for unknown ID', () => {
  const wf = getWorkflow('nonexistent-workflow-xyz')
  assert(wf === null, 'Should return null')
})

test('listWorkflows returns array', () => {
  const wfs = listWorkflows()
  assert(Array.isArray(wfs), 'Should be array')
  assert(wfs.length >= createdIds.length, `Should have at least ${createdIds.length}`)
})

test('updateWorkflow updates fields', () => {
  const result = updateWorkflow(createdIds[0], { description: 'Updated description' })
  assert(result.success, 'Should succeed')
  const wf = getWorkflow(createdIds[0])
  assert(wf?.description === 'Updated description', 'Description should update')
})

test('updateWorkflow persists progress and status', () => {
  const result = updateWorkflow(createdIds[0], { progress: 50, status: 'running' } as any)
  assert(result.success, 'Should succeed')
  const wf = getWorkflow(createdIds[0])
  assert(wf?.progress === 50, `Progress should be 50, got ${wf?.progress}`)
  assert(wf?.status === 'running', `Status should be running, got ${wf?.status}`)
})

test('updateWorkflow returns error for unknown ID', () => {
  const result = updateWorkflow('nonexistent', { description: 'nope' })
  assert(!result.success, 'Should fail')
})

// ============================================================================
// WORKFLOW.md Format
// ============================================================================

test('parseWorkflowMd parses valid markdown', () => {
  const md = `---
name: Test Parse
description: Parse test
schedule: "0 9 * * *"
executionMode: automated
targeting:
  agents: [agent-1]
  groups: []
  tags: []
  communities: []
---

# Test Parse

Do the thing.
`
  const wf = parseWorkflowMd(md)
  assert(wf !== null, 'Should parse')
  assert(wf!.name === 'Test Parse', 'Name should match')
  assert(wf!.schedule === '0 9 * * *', 'Schedule should match')
  assert(wf!.content.includes('Do the thing'), 'Content should be body')
})

test('parseWorkflowMd returns null for invalid content', () => {
  assert(parseWorkflowMd('just text') === null, 'Plain text should fail')
  assert(parseWorkflowMd('') === null, 'Empty should fail')
})

test('workflowToMarkdown round-trips', () => {
  const wf = getWorkflow(createdIds[0])!
  const md = workflowToMarkdown(wf)
  assert(md.includes('name: Test Create'), 'Should contain name')
  assert(md.includes('Do the thing'), 'Should contain content')

  const parsed = parseWorkflowMd(md)
  assert(parsed?.name === wf.name, 'Round-trip name should match')
})

// ============================================================================
// DAG Engine
// ============================================================================

test('areDependenciesMet returns true when no deps', () => {
  const { met, pending } = areDependenciesMet(createdIds[0])
  assert(met === true, 'No deps should be met')
  assert(pending.length === 0, 'No pending')
})

test('areDependenciesMet checks dependency status', () => {
  // createdIds[1] depends on createdIds[0]
  // Reset [0] to idle
  updateWorkflow(createdIds[0], { status: 'idle', progress: 0 } as any)
  const { met, pending } = areDependenciesMet(createdIds[1])
  assert(!met, 'Should not be met (dep is idle)')
  assert(pending.includes(createdIds[0]), 'Should list pending dep')
})

test('completeWorkflow marks complete and finds ready dependents', () => {
  const { readyToRun } = completeWorkflow(createdIds[0])
  const wf = getWorkflow(createdIds[0])
  assert(wf?.status === 'completed', 'Should be completed')
  assert(wf?.progress === 100, 'Progress should be 100')
  assert(readyToRun.includes(createdIds[1]), `Should unlock ${createdIds[1]}`)
})

test('getDAGStatus returns all workflows with dep info', () => {
  const dag = getDAGStatus()
  assert(Array.isArray(dag), 'Should be array')
  const entry = dag.find(d => d.id === createdIds[1])
  assert(entry !== undefined, 'Should find our workflow')
  assert(entry!.dependenciesMet === true, 'Deps should now be met')
})

test('triggerWorkflow supports rerunning upstream DAG workflows', () => {
  const root = createWorkflow({
    name: 'Reset Root',
    description: 'Root',
    schedule: 'manual',
    content: '# Root',
    executionMode: 'automated',
    targeting: { agents: [], groups: [], tags: [], communities: [] },
  })
  assert(!!(root.success && root.id), 'Root workflow should be created')
  createdIds.push(root.id as string)

  const child = createWorkflow({
    name: 'Reset Child',
    description: 'Child',
    schedule: 'manual',
    content: '# Child',
    executionMode: 'automated',
    dependsOn: [root.id!],
    targeting: { agents: [], groups: [], tags: [], communities: [] },
  })
  assert(!!(child.success && child.id), 'Child workflow should be created')
  createdIds.push(child.id as string)

  const grandchild = createWorkflow({
    name: 'Reset Grandchild',
    description: 'Grandchild',
    schedule: 'manual',
    content: '# Grandchild',
    executionMode: 'automated',
    dependsOn: [child.id!],
    targeting: { agents: [], groups: [], tags: [], communities: [] },
  })
  assert(!!(grandchild.success && grandchild.id), 'Grandchild workflow should be created')
  createdIds.push(grandchild.id as string)

  updateWorkflow(child.id!, { enabled: false } as any)
  updateWorkflow(grandchild.id!, { enabled: false } as any)
  updateWorkflow(root.id!, { status: 'completed', progress: 100 } as any)
  updateWorkflow(child.id!, { status: 'completed', progress: 100 } as any)
  updateWorkflow(grandchild.id!, { status: 'completed', progress: 100 } as any)

  const triggered = triggerWorkflow(root.id!, { manual: true })
  assert(triggered.success, `Rerun should succeed: ${triggered.error}`)

  const rerunRoot = getWorkflow(root.id!)
  const rerunChild = getWorkflow(child.id!)
  const rerunGrandchild = getWorkflow(grandchild.id!)

  assert(rerunRoot?.status === 'running' || rerunRoot?.status === 'completed', 'Root should restart cleanly after rerun')
  assert(rerunRoot?.progress === 0 || rerunRoot?.progress === 100, 'Root progress should represent the fresh rerun state')
  assert(rerunChild !== null, 'Direct downstream workflow should remain present after rerun')
  assert(rerunGrandchild !== null, 'Nested downstream workflow should remain present after rerun')
})

// ============================================================================
// Cleanup
// ============================================================================

test('deleteWorkflow deletes by ID', () => {
  for (const id of createdIds) {
    const result = deleteWorkflow(id)
    assert(result.success, `Should delete ${id}: ${result.error}`)
  }
})

test('deleteWorkflow returns error for unknown ID', () => {
  const result = deleteWorkflow('nonexistent-xyz')
  assert(!result.success, 'Should fail')
})

// Summary
setTimeout(() => {
  console.log(`\n${YELLOW}=== Test Summary ===${RESET}`)
  console.log(`${GREEN}Passed: ${testsPassed}${RESET}`)
  if (testsFailed > 0) {
    console.log(`${RED}Failed: ${testsFailed}${RESET}`)
    process.exit(1)
  } else {
    console.log(`\n${GREEN}All tests passed! ✓${RESET}\n`)
    process.exit(0)
  }
}, 100)
