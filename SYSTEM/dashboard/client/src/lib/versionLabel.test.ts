import assert from 'node:assert/strict'
import { compactDashboardVersion } from './versionLabel'

assert.equal(compactDashboardVersion('2.0.0-test-rc93'), '2.0')
assert.equal(compactDashboardVersion('2.0.0'), '2.0')
assert.equal(compactDashboardVersion('v2.1.4'), '2.1')
assert.equal(compactDashboardVersion('dev'), 'dev')
assert.equal(compactDashboardVersion(null), '…')

console.log('Version label tests passed')
