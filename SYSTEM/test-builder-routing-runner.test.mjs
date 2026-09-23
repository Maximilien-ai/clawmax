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
} finally {
  fs.rmSync(directory, { recursive: true, force: true })
}
