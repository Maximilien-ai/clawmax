/**
 * Validator Test Suite
 *
 * Run with: npx ts-node --transpileOnly server/lib/validator.test.ts
 */

import { validateWorkflow } from './validator'

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const RESET = '\x1b[0m'

let testsPassed = 0
let testsFailed = 0

function test(name: string, fn: () => void) {
  try { fn(); console.log(`${GREEN}✓${RESET} ${name}`); testsPassed++ }
  catch (err: any) { console.log(`${RED}✗${RESET} ${name}\n  Error: ${err.message}`); testsFailed++ }
}

function assert(condition: boolean, message: string) { if (!condition) throw new Error(message) }

console.log(`\n${YELLOW}=== Validator Test Suite ===${RESET}\n`)

test('validateWorkflow accepts valid workflow', () => {
  const result = validateWorkflow({
    name: 'Test', description: 'Test', schedule: 'manual', content: 'Do it',
    targeting: { agents: [], groups: [], tags: [], communities: [] },
  })
  assert(result.valid, `Should be valid: ${result.errors.map(e => e.message).join(', ')}`)
})

test('validateWorkflow rejects missing name', () => {
  const result = validateWorkflow({ description: 'Test', schedule: 'manual', content: 'Do it' })
  assert(!result.valid, 'Should be invalid')
  assert(result.errors.some(e => e.field.includes('name') || e.message.includes('name')), 'Should mention name')
})

test('validateWorkflow rejects missing content', () => {
  const result = validateWorkflow({ name: 'Test', description: 'Test', schedule: 'manual' })
  assert(!result.valid, 'Should be invalid')
})

test('validateWorkflow rejects missing description', () => {
  const result = validateWorkflow({ name: 'Test', schedule: 'manual', content: 'Do it' })
  assert(!result.valid, 'Should be invalid')
})

test('validateWorkflow requires owner for managed mode', () => {
  const result = validateWorkflow({
    name: 'Test', description: 'Test', schedule: 'manual', content: 'Do it',
    executionMode: 'managed',
    targeting: { agents: [], groups: [], tags: [], communities: [] },
  })
  assert(!result.valid, 'Should require owner')
})

test('validateWorkflow accepts managed with owner', () => {
  const result = validateWorkflow({
    name: 'Test', description: 'Test', schedule: 'manual', content: 'Do it',
    executionMode: 'managed', owner: 'agent-1',
    targeting: { agents: [], groups: [], tags: [], communities: [] },
  })
  assert(result.valid, `Should be valid: ${result.errors.map(e => e.message).join(', ')}`)
})

test('validateWorkflow accepts dependsOn field', () => {
  const result = validateWorkflow({
    name: 'Test', description: 'Test', schedule: 'manual', content: 'Do it',
    dependsOn: ['other-workflow'],
    targeting: { agents: [], groups: [], tags: [], communities: [] },
  })
  assert(result.valid, `Should accept dependsOn: ${result.errors.map(e => e.message).join(', ')}`)
})

test('validateWorkflow accepts type field', () => {
  const result = validateWorkflow({
    name: 'Test', description: 'Test', schedule: 'manual', content: 'Do it',
    type: 'once',
    targeting: { agents: [], groups: [], tags: [], communities: [] },
  })
  assert(result.valid, `Should accept type: ${result.errors.map(e => e.message).join(', ')}`)
})

test('validateWorkflow rejects invalid type', () => {
  const result = validateWorkflow({
    name: 'Test', description: 'Test', schedule: 'manual', content: 'Do it',
    type: 'invalid',
    targeting: { agents: [], groups: [], tags: [], communities: [] },
  })
  assert(!result.valid, 'Should reject invalid type')
})

setTimeout(() => {
  console.log(`\n${YELLOW}=== Test Summary ===${RESET}`)
  console.log(`${GREEN}Passed: ${testsPassed}${RESET}`)
  if (testsFailed > 0) { console.log(`${RED}Failed: ${testsFailed}${RESET}`); process.exit(1) }
  else { console.log(`\n${GREEN}All tests passed! ✓${RESET}\n`); process.exit(0) }
}, 100)
