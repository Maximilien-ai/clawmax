import assert from 'assert'
import { detectLogRuntimeSignal } from './logRuntimeSignals'

const tests: Array<{ name: string; run: () => void }> = []

function test(name: string, run: () => void) {
  tests.push({ name, run })
}

test('detects gateway restart loop signals from raw logs', () => {
  const result = detectLogRuntimeSignal([
    'ws unauthorized ... reason=token_mismatch',
    'config change requires gateway restart (gateway.auth.token, gateway.tailscale)',
    'gateway already running',
    'Port 18789 is already in use',
  ])
  assert.strictEqual(result?.title, 'Gateway Restart Loop Detected')
  assert.strictEqual(result?.severity, 'critical')
})

test('detects missing OpenClaw runtime build artifacts', () => {
  const result = detectLogRuntimeSignal([
    'Error: missing dist/entry.(m)js while launching openclaw runtime',
  ])
  assert.strictEqual(result?.title, 'OpenClaw Runtime Build Missing')
  assert.strictEqual(result?.severity, 'critical')
})

test('detects fixture runtime usage', () => {
  const result = detectLogRuntimeSignal([
    'booted with openclaw fixture runtime for local smoke tests',
  ])
  assert.strictEqual(result?.title, 'Fixture OpenClaw Runtime Detected')
  assert.strictEqual(result?.severity, 'warning')
})

test('returns null for ordinary healthy logs', () => {
  assert.strictEqual(
    detectLogRuntimeSignal(['gateway started', 'status ok', 'logs tail connected']),
    null
  )
})

let passed = 0
for (const entry of tests) {
  entry.run()
  passed += 1
  console.log(`✓ ${entry.name}`)
}

console.log(`logRuntimeSignals.test.ts: ${passed} tests passed`)
