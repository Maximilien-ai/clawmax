/**
 * Dashboard env test suite
 *
 * Run with: npx ts-node --transpileOnly server/lib/dashboard-env.test.ts
 */

import { getDefaultOllamaBaseUrl, isManagedRuntime, isOllamaUiEnabled } from './dashboard-env'

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

console.log(`\n${YELLOW}=== Dashboard Env Test Suite ===${RESET}\n`)

test('managed runtime is detected when dashboard env is empty', () => {
  assert(isManagedRuntime({}) === true, 'Expected empty env to be treated as managed runtime')
})

test('local/native runtime falls back to localhost Ollama base URL', () => {
  const url = getDefaultOllamaBaseUrl({ DASHBOARD_PORT: '3001' })
  assert(url === 'http://localhost:11434', `Expected localhost fallback, got ${url}`)
})

test('explicit Ollama base URL wins over localhost fallback', () => {
  const url = getDefaultOllamaBaseUrl({ OLLAMA_BASE_URL: ' http://host.containers.internal:11434/ ' })
  assert(url === 'http://host.containers.internal:11434', `Expected trimmed explicit base URL, got ${url}`)
})

test('managed runtime without injected Ollama base URL defaults to empty string', () => {
  const previous = process.env.OLLAMA_BASE_URL
  delete process.env.OLLAMA_BASE_URL
  const url = getDefaultOllamaBaseUrl({})
  if (previous) {
    process.env.OLLAMA_BASE_URL = previous
  }
  assert(url === '', `Expected empty managed-runtime default, got ${url}`)
})

test('explicit DASHBOARD_ENABLE_OLLAMA=true enables Ollama UI even in managed runtime', () => {
  assert(isOllamaUiEnabled({ DASHBOARD_ENABLE_OLLAMA: 'true' }) === true, 'Expected explicit true to enable Ollama UI')
})

test('explicit DASHBOARD_ENABLE_OLLAMA=false disables Ollama UI in local runtime', () => {
  assert(isOllamaUiEnabled({ DASHBOARD_PORT: '3001', DASHBOARD_ENABLE_OLLAMA: 'false' }) === false, 'Expected explicit false to disable Ollama UI')
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
