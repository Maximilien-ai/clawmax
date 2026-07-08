/**
 * Workflow display helper tests
 *
 * Run with: npx ts-node --transpileOnly client/src/lib/workflowDisplay.test.ts
 */

import { buildWorkflowHandoffDisplay, getWorkflowDisplayName } from './workflowDisplay'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

const tests: Array<{ name: string; run: () => void }> = []

function test(name: string, run: () => void) {
  tests.push({ name, run })
}

test('trims pipeline prefixes and slash hierarchy from workflow names', () => {
  assert(
    getWorkflowDisplayName('Mango Grove Demo · Sales / Lead Intake', 'Mango Grove Demo') === 'Lead Intake',
    'Expected display name to keep only the leaf workflow name',
  )
})

test('builds readable handoff edges from workflow ids and names', () => {
  const edges = buildWorkflowHandoffDisplay(
    [{
      workflowId: 'downstream-wf',
      workflowName: 'Mango Grove Demo · Sales / Proposal Draft',
      upstreamWorkflowId: 'upstream-wf',
      label: 'Qualified lead brief',
      outputKey: 'lead-brief',
    }],
    [
      { id: 'upstream-wf', name: 'Mango Grove Demo · Sales / Lead Intake' },
      { id: 'downstream-wf', name: 'Mango Grove Demo · Sales / Proposal Draft' },
    ],
    'Mango Grove Demo',
  )

  assert(edges.length === 1, 'Expected one handoff edge')
  assert(edges[0].upstreamDisplayName === 'Lead Intake', 'Expected upstream display name to be simplified')
  assert(edges[0].downstreamDisplayName === 'Proposal Draft', 'Expected downstream display name to be simplified')
  assert(edges[0].label === 'Qualified lead brief', 'Expected label to preserve human handoff name')
})

test('falls back to workflow ids when names are missing', () => {
  const edges = buildWorkflowHandoffDisplay(
    [{
      workflowId: 'proposal-draft',
      upstreamWorkflowId: 'lead-intake',
      outputKey: 'handoff',
    }],
    [],
  )

  assert(edges[0].upstreamDisplayName === 'lead-intake', 'Expected upstream id fallback')
  assert(edges[0].downstreamDisplayName === 'proposal-draft', 'Expected downstream id fallback')
  assert(edges[0].label === 'handoff', 'Expected output key fallback label')
})

let passed = 0
for (const entry of tests) {
  entry.run()
  passed += 1
  console.log(`✓ ${entry.name}`)
}

console.log(`workflowDisplay.test.ts: ${passed} tests passed`)
