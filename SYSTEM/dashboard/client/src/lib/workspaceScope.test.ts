/**
 * Workspace scope helper unit tests
 *
 * Run with: npx ts-node --transpileOnly client/src/lib/workspaceScope.test.ts
 */

import { buildWorkspaceScopedPath } from './workspaceScope'

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
    console.error(`  Error: ${err.message}`)
    testsFailed++
  }
}

function assertEqual<T>(actual: T, expected: T, message?: string) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, got ${actual}`)
  }
}

console.log(`\n${YELLOW}=== Workspace Scope Helper Test Suite ===${RESET}\n`)

test('buildWorkspaceScopedPath() returns original path when workspace id is missing', () => {
  assertEqual(buildWorkspaceScopedPath('/api/metering'), '/api/metering')
})

test('buildWorkspaceScopedPath() appends workspace id to paths without a query string', () => {
  assertEqual(
    buildWorkspaceScopedPath('/api/metering', 'personal'),
    '/api/metering?workspaceId=personal'
  )
})

test('buildWorkspaceScopedPath() preserves existing query params when appending workspace id', () => {
  assertEqual(
    buildWorkspaceScopedPath('/api/agents?limit=20', 'client-a'),
    '/api/agents?limit=20&workspaceId=client-a'
  )
})

test('buildWorkspaceScopedPath() scopes budget endpoints consistently', () => {
  assertEqual(
    buildWorkspaceScopedPath('/api/budget', 'finance'),
    '/api/budget?workspaceId=finance'
  )
})

console.log('')
if (testsFailed === 0) {
  console.log(`${GREEN}All tests passed${RESET} (${testsPassed} tests)\n`)
  process.exit(0)
} else {
  console.log(`${RED}${testsFailed} tests failed${RESET}, ${testsPassed} passed\n`)
  process.exit(1)
}
