/**
 * Dashboard navigation helper test suite
 *
 * Run with: npx ts-node --transpileOnly client/src/lib/navigation.test.ts
 */

import { pageToPath, pathToPage } from './navigation'

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

console.log(`\n${YELLOW}=== Navigation Helper Test Suite ===${RESET}\n`)

test('pathToPage resolves known paths', () => {
  assert(pathToPage('/workflows') === 'workflows', 'Expected /workflows to resolve to workflows')
  assert(pathToPage('/organizations') === 'organizations', 'Expected /organizations to resolve to organizations')
  assert(pathToPage('/docs/') === 'docs', 'Expected trailing slash to be ignored')
})

test('pathToPage falls back to agents for unknown paths', () => {
  assert(pathToPage('/') === 'agents', 'Expected root path to default to agents')
  assert(pathToPage('/unknown') === 'agents', 'Expected unknown path to default to agents')
})

test('pageToPath returns canonical route paths', () => {
  assert(pageToPath('agents') === '/agents', 'Expected agents page path')
  assert(pageToPath('keys') === '/keys', 'Expected keys page path')
})

console.log('\n========================================')
console.log(`Tests passed: ${testsPassed}`)
console.log(`Tests failed: ${testsFailed}`)
console.log('========================================\n')

if (testsFailed > 0) {
  process.exit(1)
}

console.log(`${GREEN}All tests passed${RESET}`)

