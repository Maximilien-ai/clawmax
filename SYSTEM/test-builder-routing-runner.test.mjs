import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const source = fs.readFileSync(new URL('./test.sh', import.meta.url), 'utf8')
const start = source.indexOf('if npx ts-node --transpileOnly server/lib/ai-builder.test.ts')
assert(start >= 0, 'Builder routing must gate success on the test process exit status')
const end = source.indexOf('\nfi', start)
assert(end > start, 'Builder routing result block must be complete')
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-builder-runner-'))
try {
  const block = source.slice(start, end + 3).replaceAll('/tmp/clawmax-ai-builder-routing.out', path.join(directory, 'result.out'))
  for (const exitCode of [0, 1, 137]) {
    const result = spawnSync('bash', ['-c', `
      npx() { echo '✓ an earlier assertion passed'; return ${exitCode}; }
      pass() { echo 'RESULT_PASS'; }
      fail() { echo 'RESULT_FAIL'; }
      ${block}
    `], { encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, exitCode === 0 ? /RESULT_PASS/ : /RESULT_FAIL/)
    assert.doesNotMatch(result.stdout, exitCode === 0 ? /RESULT_FAIL/ : /RESULT_PASS/)
  }
  console.log('Builder routing runner: 3 exit-status cases passed')
  const schemaStart = source.indexOf('if npx ts-node --transpileOnly server/lib/plugin-system-schema-edges.test.ts')
  assert(schemaStart >= 0, 'Plugin schema results must require a successful exit status')
  const schemaEnd = source.indexOf('\nfi', schemaStart)
  assert(schemaEnd > schemaStart)
  const schemaBlock = source.slice(schemaStart, schemaEnd + 3).replaceAll('/tmp/clawmax-plugin-schema-edges.out', path.join(directory, 'schema.out'))
  for (const [exitCode, output, succeeds] of [
    [0, 'plugin-system-schema-edges.test.ts: ok (84 checks)', true],
    [0, 'plugin-system-schema-edges.test.ts: ok (100 checks)', true],
    [0, 'incomplete output', false],
    [1, 'plugin-system-schema-edges.test.ts: ok (84 checks)', false],
    [137, 'plugin-system-schema-edges.test.ts: ok (84 checks)', false],
  ]) {
    const result = spawnSync('bash', ['-c', `
      npx() { echo '${output}'; return ${exitCode}; }
      pass() { echo 'RESULT_PASS'; }
      fail() { echo 'RESULT_FAIL'; }
      ${schemaBlock}
    `], { encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, succeeds ? /RESULT_PASS/ : /RESULT_FAIL/)
    assert.doesNotMatch(result.stdout, succeeds ? /RESULT_FAIL/ : /RESULT_PASS/)
  }
  console.log('Plugin schema runner: 5 count/exit-status cases passed')
  const readinessStart = source.indexOf('if npx ts-node --transpileOnly server/lib/startup-readiness.test.ts')
  assert(readinessStart >= 0, 'Readiness must use exit status, not a fixed assertion count')
  const readinessEnd = source.indexOf('\nfi', readinessStart)
  assert(readinessEnd > readinessStart)
  const readinessBlock = source.slice(readinessStart, readinessEnd + 3).replaceAll('/tmp/clawmax-startup-readiness.out', path.join(directory, 'readiness.out'))
  for (const [exitCode, count] of [[0, 20], [0, 25], [1, 20], [137, 20]]) {
    const result = spawnSync('bash', ['-c', `
      npx() { echo 'startup-readiness.test.ts: ${count} tests passed'; return ${exitCode}; }
      pass() { echo 'RESULT_PASS'; }
      fail() { echo 'RESULT_FAIL'; }
      ${readinessBlock}
    `], { encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, exitCode === 0 ? /RESULT_PASS/ : /RESULT_FAIL/)
    assert.doesNotMatch(result.stdout, exitCode === 0 ? /RESULT_FAIL/ : /RESULT_PASS/)
  }
  console.log('Readiness runner: 4 count/exit-status cases passed')
  const securityStart = source.indexOf('npx ts-node --transpileOnly server/lib/security-boundaries-dynamic.test.ts')
  const securityEnd = source.indexOf('\nfi', securityStart)
  assert(securityStart >= 0 && securityEnd > securityStart)
  const securityBlock = source.slice(securityStart, securityEnd + 3).replaceAll('/tmp/clawmax-security-boundaries-dynamic.out', path.join(directory, 'security.out'))
  for (const [exitCode, output, succeeds] of [
    [0, 'security-boundaries-dynamic.test.ts: 22 tests passed', true],
    [0, 'security-boundaries-dynamic.test.ts: 30 tests passed', true],
    [0, 'incomplete output', false],
    [1, 'security-boundaries-dynamic.test.ts: 22 tests passed', false],
    [137, 'security-boundaries-dynamic.test.ts: 22 tests passed', false],
  ]) {
    const result = spawnSync('bash', ['-c', `
      npx() { echo '${output}'; return ${exitCode}; }
      pass() { echo 'RESULT_PASS'; }
      fail() { echo 'RESULT_FAIL'; }
      ${securityBlock}
    `], { encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, succeeds ? /RESULT_PASS/ : /RESULT_FAIL/)
    assert.doesNotMatch(result.stdout, succeeds ? /RESULT_FAIL/ : /RESULT_PASS/)
  }
  console.log('Dynamic security runner: 5 count/exit-status cases passed')
} finally {
  fs.rmSync(directory, { recursive: true, force: true })
}
