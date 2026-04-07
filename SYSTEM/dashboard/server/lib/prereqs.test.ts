/**
 * Prereqs test suite
 *
 * Run with: npx ts-node --transpile-only server/lib/prereqs.test.ts
 */

import { buildGitHubAuthChecks } from './prereqs'

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

console.log(`\n${YELLOW}=== Prereqs Test Suite ===${RESET}\n`)

test('buildGitHubAuthChecks fails when gh CLI is missing', () => {
  const checks = buildGitHubAuthChecks(false, '')
  assert(checks.every((check) => check.status === 'fail'), 'Expected all GitHub checks to fail when gh is missing')
  assert(checks.some((check) => check.fixHint?.includes('gh auth login')), 'Expected auth login hint')
})

test('buildGitHubAuthChecks fails when gh is unauthenticated', () => {
  const checks = buildGitHubAuthChecks(true, 'You are not logged into any GitHub hosts.')
  const authCheck = checks.find((check) => check.id === 'github-auth')
  const issueCheck = checks.find((check) => check.id === 'gh-issues')
  assert(authCheck?.status === 'fail', `Expected github-auth fail, got ${authCheck?.status}`)
  assert(issueCheck?.status === 'fail', `Expected gh-issues fail, got ${issueCheck?.status}`)
})

test('buildGitHubAuthChecks requires repo scope for gh-issues', () => {
  const checks = buildGitHubAuthChecks(true, 'Logged in to github.com as test-user')
  const authCheck = checks.find((check) => check.id === 'github-auth')
  const issueCheck = checks.find((check) => check.id === 'gh-issues')
  assert(authCheck?.status === 'pass', `Expected github-auth pass, got ${authCheck?.status}`)
  assert(issueCheck?.status === 'fail', `Expected gh-issues fail without repo scope, got ${issueCheck?.status}`)
  assert(issueCheck?.fixHint === 'Run: gh auth refresh -s repo', 'Expected repo scope fix hint')
})

test('buildGitHubAuthChecks passes when gh auth includes repo scope', () => {
  const checks = buildGitHubAuthChecks(true, 'Logged in to github.com account test-user\nToken scopes: repo, read:org')
  assert(checks.every((check) => check.status === 'pass'), 'Expected all GitHub checks to pass with repo scope')
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
