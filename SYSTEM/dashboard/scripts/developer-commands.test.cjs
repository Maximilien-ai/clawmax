const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { test } = require('node:test')
const { ESLint } = require('eslint')

const repo = path.resolve(__dirname, '../../..')

test('workspace cleanup suite trusts exit status rather than summary wording', () => {
  const suite = fs.readFileSync(path.join(repo, 'SYSTEM/test.sh'), 'utf8')
  const marker = '→ Running OpenClaw workspace-state cleanup tests...'
  const start = suite.indexOf('\n', suite.indexOf(marker)) + 1
  const end = suite.indexOf('\nfi', start)
  assert(suite.includes(marker) && end > start)
  const block = suite.slice(start, end + '\nfi'.length)
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-cleanup-runner-'))
  try {
    const isolated = block.replaceAll('/tmp/clawmax-openclaw-workspace-state.out', path.join(temp, 'output'))
    const run = (code, summary) => spawnSync('/bin/bash', ['-c', `
      bash() { printf '%s\\n' "$CLEANUP_SUMMARY"; return "$CLEANUP_EXIT"; }
      pass() { echo accepted; }
      fail() { echo rejected; exit 17; }
      ${isolated}
    `], { encoding: 'utf8', env: { ...process.env, CLEANUP_EXIT: String(code), CLEANUP_SUMMARY: summary } })
    const success = run(0, 'asynchronous cleanup and failure checks passed')
    assert.equal(success.status, 0, success.stderr)
    assert.match(success.stdout, /accepted/)
    for (const summary of ['openclaw-workspace-state.test.sh: 6 tests passed', '', 'cleanup failed']) {
      const failure = run(23, summary)
      assert.equal(failure.status, 17, 'nonzero exit must fail even with a success-looking summary')
      assert.match(failure.stdout, /rejected/)
    }
  } finally {
    fs.rmSync(temp, { recursive: true, force: true })
  }
})

test('release API requests use bounded configurable timeouts and never retry writes', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-http-contract-'))
  try {
    const trace = path.join(temp, 'trace')
    fs.writeFileSync(path.join(temp, 'curl'), '#!/bin/bash\nprintf "%s\\n" "$@" >> "$HTTP_TRACE"\nexit "${HTTP_EXIT:-0}"\n', { mode: 0o755 })
    const run = (extra = {}) => spawnSync('/bin/bash', ['-c', 'source "$1"; apicurl -X POST http://localhost/fixture', 'test', path.join(repo, 'SYSTEM/test-http.sh')], {
      encoding: 'utf8', env: { ...process.env, PATH: `${temp}:${process.env.PATH}`, HTTP_TRACE: trace, CLAWMAX_TEST_API_TIMEOUT_SECONDS: '', DASHBOARD_AUTH: '', ...extra },
    })
    assert.equal(run().status, 0)
    assert.match(fs.readFileSync(trace, 'utf8'), /--show-error\n--connect-timeout\n5\n--max-time\n60\n-X\nPOST/)
    fs.writeFileSync(trace, '')
    assert.equal(run({ CLAWMAX_TEST_API_TIMEOUT_SECONDS: '90', DASHBOARD_AUTH: 'synthetic-token', HTTP_EXIT: '28' }).status, 28)
    const args = fs.readFileSync(trace, 'utf8')
    assert.match(args, /--max-time\n90\n-H\nAuthorization: Bearer synthetic-token/)
    assert.equal(args.match(/POST/g).length, 1, 'a timeout must not retry a potentially committed write')
    for (const value of ['0', '-1', '1.5', 'abc', '601', '99999999999999999999']) {
      assert.equal(run({ CLAWMAX_TEST_API_TIMEOUT_SECONDS: value }).status, 2)
      assert.equal(fs.readFileSync(trace, 'utf8'), args, 'invalid timeout must not send requests')
    }
    const suite = fs.readFileSync(path.join(repo, 'SYSTEM/test.sh'), 'utf8')
    assert.match(suite, /\. "\$SYSTEM_DIR\/test-http.sh"/)
    const payload = suite.match(/^test_workflow_payload='(.*)'$/m)
    assert(payload)
    assert.equal(JSON.parse(payload[1]).enabled, false)
    assert.equal(JSON.parse(payload[1]).schedule, 'manual')
  } finally {
    fs.rmSync(temp, { recursive: true, force: true })
  }
})

test('root commands forward arguments, environment, working directory, and failures', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-command-contract-'))
  try {
    const root = path.join(temp, 'repo with spaces')
    const dashboard = path.join(root, 'SYSTEM/dashboard')
    const bin = path.join(temp, 'bin')
    fs.mkdirSync(path.join(dashboard, 'node_modules/.bin'), { recursive: true })
    fs.mkdirSync(bin)
    const trace = path.join(temp, 'trace')
    const stub = '#!/bin/bash\nprintf "%s\\n" "$0" "$PWD" "$DASHBOARD_PORT" "$@" >> "$COMMAND_TRACE"\nexit "${COMMAND_EXIT:-0}"\n'
    for (const name of ['lint.sh', 'build.sh', 'test.sh']) {
      fs.copyFileSync(path.join(repo, name), path.join(root, name))
      assert(fs.statSync(path.join(repo, name)).mode & 0o111, `${name} must be executable`)
    }
    for (const file of [path.join(bin, 'npm'), path.join(bin, 'node'), path.join(root, 'SYSTEM/test-with-server.sh'), ...['eslint', 'tsc', 'vite'].map(name => path.join(dashboard, 'node_modules/.bin', name))]) {
      fs.writeFileSync(file, stub, { mode: 0o755 })
    }
    const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, COMMAND_TRACE: trace, DASHBOARD_PORT: '3999' }
    const run = (name, args = [], code = 0) => spawnSync('/bin/bash', [path.join(root, name), ...args], { cwd: temp, env: { ...env, COMMAND_EXIT: String(code) }, encoding: 'utf8' })
    assert.equal(run('build.sh').status, 0)
    assert(fs.readFileSync(trace, 'utf8').includes(`${dashboard}\n3999\nrun\nbuild\n`))
    assert.equal(run('build.sh', [], 23).status, 23, 'build failures must propagate')
    assert.equal(run('lint.sh').status, 0)
    assert.equal(run('lint.sh', [], 24).status, 24, 'lint failures must propagate')
    fs.writeFileSync(trace, '')
    assert.equal(run('test.sh', ['--coverage']).status, 0)
    let output = fs.readFileSync(trace, 'utf8')
    assert(output.endsWith('--coverage\n'))
    assert(!output.includes('integration') && !output.includes('--with-validation'), 'coverage must not silently enable mutation/LLM lanes')
    assert.equal(run('test.sh', ['integration', '--with-validation', '--coverage'], 25).status, 25)
    output = fs.readFileSync(trace, 'utf8')
    assert(output.endsWith('integration\n--with-validation\n--coverage\n'))
    for (const name of ['lint.sh', 'build.sh', 'test.sh']) {
      const before = fs.readFileSync(trace, 'utf8')
      assert.equal(run(name, ['--help']).status, 0)
      assert.equal(run(name, ['--typo']).status, 2)
      assert.equal(fs.readFileSync(trace, 'utf8'), before, 'help/invalid flags must not launch work')
    }
    fs.unlinkSync(path.join(dashboard, 'node_modules/.bin/eslint'))
    assert.match(run('lint.sh').stderr, /npm --prefix SYSTEM\/dashboard ci/)
    fs.unlinkSync(path.join(dashboard, 'node_modules/.bin/vite'))
    assert.equal(run('build.sh').status, 1)
  } finally {
    fs.rmSync(temp, { recursive: true, force: true })
  }
})

test('lint rejects correctness errors in TypeScript and TSX, without enforcing a formatting rewrite', async () => {
  const eslint = new ESLint({ cwd: path.resolve(__dirname, '..') })
  for (const filePath of ['server/lint-fixture.ts', 'client/src/lint-fixture.tsx']) {
    const [bad] = await eslint.lintText('debugger; const sample = { duplicate: 1, duplicate: 2 };', { filePath })
    assert(bad.messages.some(message => message.ruleId === 'no-debugger'))
    assert(bad.messages.some(message => message.ruleId === 'no-dupe-keys'))
    const [parseError] = await eslint.lintText('const sample = ;', { filePath })
    assert(parseError.fatalErrorCount > 0)
  }
  const [clean] = await eslint.lintText('const count: number = 1\nexport const Component = () => <div>{count}</div>\n', { filePath: 'client/src/lint-fixture.tsx' })
  assert.equal(clean.errorCount + clean.warningCount, 0)
})
