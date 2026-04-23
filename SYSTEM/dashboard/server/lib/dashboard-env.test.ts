/**
 * Dashboard env test suite
 *
 * Run with: npx ts-node --transpileOnly server/lib/dashboard-env.test.ts
 */

import { getDefaultOllamaBaseUrl, getMaintenanceBanner, isManagedRuntime, isOllamaUiEnabled } from './dashboard-env'

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

test('maintenance banner stays disabled by default when env is unset', () => {
  const previous = {
    enabled: process.env.MAINTENANCE_BANNER_ENABLED,
    text: process.env.MAINTENANCE_BANNER_TEXT,
    level: process.env.MAINTENANCE_BANNER_LEVEL,
    startAt: process.env.MAINTENANCE_BANNER_START_AT,
    endAt: process.env.MAINTENANCE_BANNER_END_AT,
    link: process.env.MAINTENANCE_BANNER_LINK,
    dismissible: process.env.MAINTENANCE_BANNER_DISMISSIBLE,
  }
  delete process.env.MAINTENANCE_BANNER_ENABLED
  delete process.env.MAINTENANCE_BANNER_TEXT
  delete process.env.MAINTENANCE_BANNER_LEVEL
  delete process.env.MAINTENANCE_BANNER_START_AT
  delete process.env.MAINTENANCE_BANNER_END_AT
  delete process.env.MAINTENANCE_BANNER_LINK
  delete process.env.MAINTENANCE_BANNER_DISMISSIBLE
  try {
    assert(getMaintenanceBanner({}) === null, 'Expected no maintenance banner by default')
  } finally {
    if (previous.enabled === undefined) delete process.env.MAINTENANCE_BANNER_ENABLED
    else process.env.MAINTENANCE_BANNER_ENABLED = previous.enabled
    if (previous.text === undefined) delete process.env.MAINTENANCE_BANNER_TEXT
    else process.env.MAINTENANCE_BANNER_TEXT = previous.text
    if (previous.level === undefined) delete process.env.MAINTENANCE_BANNER_LEVEL
    else process.env.MAINTENANCE_BANNER_LEVEL = previous.level
    if (previous.startAt === undefined) delete process.env.MAINTENANCE_BANNER_START_AT
    else process.env.MAINTENANCE_BANNER_START_AT = previous.startAt
    if (previous.endAt === undefined) delete process.env.MAINTENANCE_BANNER_END_AT
    else process.env.MAINTENANCE_BANNER_END_AT = previous.endAt
    if (previous.link === undefined) delete process.env.MAINTENANCE_BANNER_LINK
    else process.env.MAINTENANCE_BANNER_LINK = previous.link
    if (previous.dismissible === undefined) delete process.env.MAINTENANCE_BANNER_DISMISSIBLE
    else process.env.MAINTENANCE_BANNER_DISMISSIBLE = previous.dismissible
  }
})

test('maintenance banner returns normalized config when enabled and in window', () => {
  const banner = getMaintenanceBanner({
    MAINTENANCE_BANNER_ENABLED: 'true',
    MAINTENANCE_BANNER_TEXT: 'Planned maintenance at 9pm UTC',
    MAINTENANCE_BANNER_LEVEL: 'warning',
    MAINTENANCE_BANNER_DISMISSIBLE: 'true',
    MAINTENANCE_BANNER_START_AT: '2026-04-20T00:00:00Z',
    MAINTENANCE_BANNER_END_AT: '2099-04-20T00:00:00Z',
    MAINTENANCE_BANNER_LINK: 'https://status.example.com',
  })
  assert(!!banner, 'Expected maintenance banner config')
  assert(banner?.level === 'warning', 'Expected warning level')
  assert(banner?.dismissible === true, 'Expected dismissible=true')
  assert(banner?.link === 'https://status.example.com', 'Expected status link')
})

test('maintenance banner shows scheduled fallback state before start window', () => {
  const banner = getMaintenanceBanner({
    MAINTENANCE_STATE: 'scheduled',
    MAINTENANCE_MESSAGE: 'Future maintenance',
    MAINTENANCE_STARTS_AT: '2099-04-20T00:00:00Z',
  })
  assert(!!banner, 'Expected scheduled maintenance fallback banner to show before start')
  assert(banner?.startAt === '2099-04-20T00:00:00.000Z', 'Expected scheduled start time to be normalized')
})

test('maintenance banner fallback maps in_progress to critical severity', () => {
  const banner = getMaintenanceBanner({
    MAINTENANCE_STATE: 'in_progress',
    MAINTENANCE_MESSAGE: 'Maintenance is underway',
  })
  assert(banner?.level === 'critical', 'Expected in_progress fallback to map to critical severity')
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
