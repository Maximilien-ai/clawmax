import assert from 'node:assert/strict'
import { createWorkflowStartGate } from './workflowStartGate'

const gate = createWorkflowStartGate()
assert.equal(gate.begin('one'), true)
assert.equal(gate.has('one'), true)
assert.equal(gate.begin('one'), false, 'A second click must not dispatch a duplicate start')
assert.equal(gate.begin('two'), true, 'A different workflow may start independently')
gate.end('one')
assert.equal(gate.begin('one'), true, 'A failed request may be retried')
gate.end('one')
gate.end('two')
assert.equal(gate.has('one'), false)

console.log('Workflow start gate tests passed')
