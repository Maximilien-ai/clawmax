import { parseLogLine } from './logEntry'
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

test('preserves historical offset and legacy timestamps without assigning subsystems to agents', () => {
  for (const timestamp of ['2026-10-30T00:01:17.659+00:00', '2026-10-29T17:01:17.659-07:00', '2024-01-15 10:30:45']) {
    const line = timestamp + ' info cron cron: job added'
    assert.deepStrictEqual(parseLogLine(line), { timestamp, level: 'INFO', agent: undefined, message: line, raw: line })
  }
})

test('attributes explicit agent fields and leaves continuation lines unattributed', () => {
  assert.strictEqual(parseLogLine('[WARN] [agent:research] retry').agent, 'research')
  for (const line of ['[System] Reading logs', 'Saved result', 'Return: OK']) {
    assert.strictEqual(parseLogLine(line).agent, undefined)
    assert.strictEqual(parseLogLine(line).timestamp, '—')
  }
})

let passed = 0
for (const entry of tests) {
  entry.run()
  passed += 1
  console.log(`✓ ${entry.name}`)
}

console.log(`logRuntimeSignals.test.ts: ${passed} tests passed`)
