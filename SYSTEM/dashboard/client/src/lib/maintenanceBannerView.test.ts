import {
  formatMaintenanceWindow,
  getMaintenanceBannerTitle,
  getVisibleMaintenanceBanner,
} from './maintenanceBannerView'

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

console.log(`\n${YELLOW}=== Maintenance Banner View Test Suite ===${RESET}\n`)

test('warning level title is Planned Maintenance', () => {
  assert(getMaintenanceBannerTitle('warning') === 'Planned Maintenance', 'Expected warning title')
})

test('formats full window label', () => {
  const value = formatMaintenanceWindow(
    { startAt: '2026-04-22T00:00:00.000Z', endAt: '2026-04-23T00:00:00.000Z' },
    (input) => input,
  )
  assert(
    value === '2026-04-22T00:00:00.000Z to 2026-04-23T00:00:00.000Z',
    'Expected full window label',
  )
})

test('formats start-only window label', () => {
  const value = formatMaintenanceWindow(
    { startAt: '2026-04-22T00:00:00.000Z' },
    (input) => input,
  )
  assert(value === 'Starts 2026-04-22T00:00:00.000Z', 'Expected start-only label')
})

test('visible banner helper returns the banner object when not dismissed', () => {
  const banner = {
    enabled: true,
    text: 'Planned maintenance test banner',
    level: 'warning' as const,
    dismissible: true,
  }
  const visible = getVisibleMaintenanceBanner(banner, null, 'banner-key')
  assert(visible === banner, 'Expected visible banner helper to return the banner object')
})

test('visible banner helper hides dismissed dismissible banner', () => {
  const banner = {
    enabled: true,
    text: 'Planned maintenance test banner',
    level: 'warning' as const,
    dismissible: true,
  }
  const visible = getVisibleMaintenanceBanner(banner, 'banner-key', 'banner-key')
  assert(visible === null, 'Expected dismissed banner to be hidden')
})

test('visible banner helper keeps started maintenance hidden after dismissal in the current session', () => {
  const banner = {
    enabled: true,
    text: 'Planned maintenance test banner',
    level: 'warning' as const,
    startAt: '2026-04-22T00:00:00.000Z',
    dismissible: true,
  }
  const visible = getVisibleMaintenanceBanner(
    banner,
    'banner-key',
    'banner-key',
  )
  assert(visible === null, 'Expected dismissed banner to stay hidden until refresh')
})

test('visible banner helper shows same banner again after refresh when dismissal state resets', () => {
  const banner = {
    enabled: true,
    text: 'Planned maintenance test banner',
    level: 'warning' as const,
    startAt: '2026-04-22T00:00:00.000Z',
    dismissible: true,
  }
  const visible = getVisibleMaintenanceBanner(banner, null, 'banner-key')
  assert(visible === banner, 'Expected banner to show again when dismissal state is reset')
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
