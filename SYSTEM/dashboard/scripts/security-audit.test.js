const assert = require('node:assert/strict')
const { test } = require('node:test')
const { blockingAdvisories, DEFERRED_DEV_ADVISORY, DEFERRAL_EXPIRES_AT, RC100_EVENT_ADVISORY, RC100_EVENT_EXPIRES_AT } = require('./security-audit')

const advisory = (name, id = DEFERRED_DEV_ADVISORY) => ({ name, severity: 'high', url: `https://github.com/advisories/${id}` })
const full = {
  vulnerabilities: {
    braces: { severity: 'high', via: [advisory('braces')] },
    chokidar: { severity: 'high', via: ['braces'] },
    micromatch: { severity: 'high', via: ['braces'] },
    tailwindcss: { severity: 'high', via: ['chokidar', 'micromatch'] },
  },
}
const production = { metadata: { vulnerabilities: { high: 0, critical: 0 } } }

test('temporary exception applies only to the verified development dependency chain', () => {
  assert.deepEqual(blockingAdvisories(full, production, DEFERRAL_EXPIRES_AT - 1), [])
  assert(blockingAdvisories(full, production, DEFERRAL_EXPIRES_AT).some(x => x.includes(DEFERRED_DEV_ADVISORY)))
  assert(blockingAdvisories(full, { metadata: { vulnerabilities: { high: 1, critical: 0 } } }, 0).length)
  full.vulnerabilities.braces.via.push(advisory('braces', 'GHSA-other'))
  assert(blockingAdvisories(full, production, 0).some(x => x.includes('GHSA-other')))
  full.vulnerabilities.braces.via.pop()
  full.vulnerabilities.other = { severity: 'critical', via: [{ ...advisory('other'), severity: 'critical' }] }
  assert(blockingAdvisories(full, production, 0).some(x => x.includes('other: critical')))
})

test('RC100 exception requires explicit event context, dev-only lock entries, and an unexpired window', () => {
  const node = 'node_modules/picomatch'
  const picomatch = {
    severity: 'high',
    nodes: [node],
    via: [advisory('picomatch', RC100_EVENT_ADVISORY)],
  }
  const report = { vulnerabilities: { picomatch, vite: { severity: 'high', via: ['picomatch'] } } }
  const lock = { packages: { [node]: { dev: true } } }
  const enabled = { eventException: true, lock }
  const lastEligible = RC100_EVENT_EXPIRES_AT - 1
  assert.deepEqual(blockingAdvisories(report, production, lastEligible, enabled), [])
  assert.equal(blockingAdvisories(report, production, lastEligible, { lock }).length, 1)
  assert.equal(blockingAdvisories(report, production, RC100_EVENT_EXPIRES_AT, enabled).length, 1)
  assert.equal(blockingAdvisories(report, production, lastEligible, { ...enabled, lock: { packages: {} } }).length, 1)
  assert.equal(blockingAdvisories(report, production, lastEligible, { ...enabled, lock: { packages: { [node]: {} } } }).length, 1)
  assert.deepEqual(
    blockingAdvisories(report, { metadata: { vulnerabilities: { high: 0, critical: 1 } } }, lastEligible, enabled),
    ['Production dependency graph has high or critical advisories'],
  )
  picomatch.via.push(advisory('picomatch', 'GHSA-other'))
  assert.deepEqual(blockingAdvisories(report, production, lastEligible, enabled), ['picomatch: high (GHSA-other)'])
})
