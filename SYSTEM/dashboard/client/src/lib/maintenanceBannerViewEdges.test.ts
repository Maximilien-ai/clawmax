import assert from 'assert'
import {
  formatMaintenanceWindow,
  getMaintenanceBannerTitle,
  getVisibleMaintenanceBanner,
} from './maintenanceBannerView'

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`✓ ${name}`)
  } catch (error) {
    console.error(`✗ ${name}`)
    throw error
  }
}

test('formatMaintenanceWindow returns end-only label', () => {
  const value = formatMaintenanceWindow(
    { endAt: '2026-04-23T00:00:00.000Z' },
    (input) => input,
  )
  assert.strictEqual(value, 'Until 2026-04-23T00:00:00.000Z')
})

test('formatMaintenanceWindow returns null without start or end', () => {
  assert.strictEqual(formatMaintenanceWindow({}, (input) => input), null)
})

test('info level title is Maintenance Notice', () => {
  assert.strictEqual(getMaintenanceBannerTitle('info'), 'Maintenance Notice')
})

test('non-dismissible banner remains visible even if keys match', () => {
  const banner = { enabled: true, text: 'Heads up', level: 'warning' as const, dismissible: false }
  assert.strictEqual(getVisibleMaintenanceBanner(banner, 'banner-key', 'banner-key'), banner)
})

test('missing banner key keeps banner hidden', () => {
  const banner = { enabled: true, text: 'Heads up', level: 'warning' as const, dismissible: true }
  assert.strictEqual(getVisibleMaintenanceBanner(banner, null, null), null)
})

console.log('maintenanceBannerViewEdges.test.ts: ok')
