import assert from 'assert'
import { detectDoctorRuntimeSignal } from './doctorRuntimeSignals'

const tests: Array<{ name: string; run: () => void }> = []

function test(name: string, run: () => void) {
  tests.push({ name, run })
}

test('detects gateway restart loop from doctor recovery and check messages', () => {
  const signal = detectDoctorRuntimeSignal({
    message: 'Doctor warning summary',
    platform: {
      gatewayRecovery: {
        message: 'gateway already running on port 18789',
      },
    },
    results: [
      {
        checks: [
          { message: 'ws unauthorized ... reason=token_mismatch' },
          { message: 'config change requires gateway restart (gateway.auth.token)' },
        ],
      },
    ],
  })
  assert.strictEqual(signal?.title, 'Gateway Restart Loop Detected')
  assert.strictEqual(signal?.severity, 'critical')
})

test('detects missing OpenClaw runtime build artifacts from doctor messages', () => {
  const signal = detectDoctorRuntimeSignal({
    results: [
      {
        checks: [
          { message: 'launch failed: missing dist/entry.(m)js in runtime image' },
        ],
      },
    ],
  })
  assert.strictEqual(signal?.title, 'OpenClaw Runtime Build Missing')
})

test('returns null when doctor results do not indicate runtime problems', () => {
  const signal = detectDoctorRuntimeSignal({
    message: 'All agents healthy',
    results: [
      {
        checks: [
          { message: 'status ok' },
        ],
      },
    ],
  })
  assert.strictEqual(signal, null)
})

let passed = 0
for (const entry of tests) {
  entry.run()
  passed += 1
  console.log(`✓ ${entry.name}`)
}

console.log(`doctorRuntimeSignals.test.ts: ${passed} tests passed`)
