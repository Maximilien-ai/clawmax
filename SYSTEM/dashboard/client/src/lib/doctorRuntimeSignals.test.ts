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

test('detects missing shared provider execution path from doctor platform status', () => {
  const signal = detectDoctorRuntimeSignal({
    platform: {
      providerExecution: {
        status: 'missing',
        message: 'No shared model execution path is configured for this runtime. Add hosted provider credentials or configure a local runtime path in BYOK / workspace integrations.',
      },
    },
  })
  assert.strictEqual(signal?.title, 'Shared Model Execution Path Missing')
  assert.strictEqual(signal?.severity, 'critical')
})

test('detects partial local runtime execution path from doctor platform status', () => {
  const signal = detectDoctorRuntimeSignal({
    platform: {
      providerExecution: {
        status: 'partial',
        message: 'No shared hosted provider credentials are configured; this runtime is expected to use the local Ollama path at http://host.containers.internal:11434.',
      },
    },
  })
  assert.strictEqual(signal?.title, 'Shared Model Execution Path Needs Attention')
  assert.strictEqual(signal?.severity, 'warning')
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
