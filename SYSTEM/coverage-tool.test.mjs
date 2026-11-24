import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const dashboard = fileURLToPath(new URL('./dashboard/', import.meta.url))
const packageRoot = path.join(dashboard, 'node_modules/c8')
const metadata = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'))
const cli = path.join(packageRoot, typeof metadata.bin === 'string' ? metadata.bin : metadata.bin.c8)

function fixture(run, parentCoverage = process.env.NODE_V8_COVERAGE) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-coverage-tool-')))
  const write = (name, text) => fs.writeFileSync(path.join(root, name), text)
  write('.c8rc.json', '{}')
  write('math.cjs', "exports.choose = function choose(value) {\n  if (value) return 'yes';\n  return 'no';\n};\n")
  write('unused.cjs', 'exports.unused = function unused() { return 42; };\n')
  const coverage = (command, options = []) => spawnSync(process.execPath, [cli,
    '--reporter=text-summary', '--reporter=json-summary', '--reporter=html',
    '--report-dir', path.join(root, 'coverage'), '--temp-directory', path.join(root, 'samples'), '--config', path.join(root, '.c8rc.json'),
    ...options, ...command,
  ], { cwd: root, encoding: 'utf8', timeout: 30000, maxBuffer: 2 * 1024 * 1024,
    env: { ...process.env, NODE_V8_COVERAGE: parentCoverage, COVERAGE_FIXTURE_ROOT: root, COVERAGE_FIXTURE_NODE: process.execPath } })
  const report = result => {
    assert.equal(result.error, undefined, result.error?.message)
    assert.match(result.stdout, /Coverage summary/)
    const summary = JSON.parse(fs.readFileSync(path.join(root, 'coverage/coverage-summary.json'), 'utf8'))
    for (const name of ['statements', 'branches', 'functions', 'lines']) {
      assert(summary.total[name].total > 0, name)
      assert(Number.isFinite(summary.total[name].pct) && summary.total[name].pct >= 0 && summary.total[name].pct <= 100, name)
    }
    assert(fs.existsSync(path.join(root, 'coverage/index.html')), 'HTML report must remain available')
    return summary
  }
  const entry = (summary, name) => {
    const key = Object.keys(summary).find(key => key !== 'total' && path.resolve(key) === path.join(root, name))
    assert(key, `missing source coverage for ${name}`)
    return summary[key]
  }
  try { return run({ root, write, coverage, report, entry }) }
  finally { fs.rmSync(root, { recursive: true, force: true }) }
}

test('wrapper reporters retain coverage across Bash and nested Node children', { skip: process.platform === 'win32' }, () => {
  fixture(({ root, write, coverage, report, entry }) => {
    write('child.cjs', "require('node:assert/strict').equal(require('./math.cjs').choose(false), 'no');\n")
    write('main.cjs', "require('node:assert/strict').equal(require('./math.cjs').choose(true), 'yes');\nconst r = require('node:child_process').spawnSync(process.execPath, [require('node:path').join(__dirname, 'child.cjs')], { env: process.env });\nprocess.exit(r.status ?? 1);\n")
    write('runner.sh', '#!/usr/bin/env bash\nset -euo pipefail\n"$COVERAGE_FIXTURE_NODE" "$COVERAGE_FIXTURE_ROOT/main.cjs"\n')
    const result = coverage(['bash', path.join(root, 'runner.sh')])
    assert.equal(result.status, 0, result.stderr)
    assert.equal(entry(report(result), 'math.cjs').branches.pct, 100, 'both child contexts must be merged')
  })
})

test('all-source mode includes files that were never executed', () => {
  fixture(({ root, write, coverage, report, entry }) => {
    write('main.cjs', "require('./math.cjs').choose(true);\n")
    const result = coverage([process.execPath, path.join(root, 'main.cjs')], ['--all', '--include=**/*.cjs'])
    assert.equal(result.status, 0, result.stderr)
    const unused = entry(report(result), 'unused.cjs')
    assert(unused.lines.total > 0)
    assert.equal(unused.lines.covered, 0)
  })
})

test('a failed test retains its exit code and still writes valid coverage reports', () => {
  fixture(({ root, write, coverage, report }) => {
    write('failed.cjs', "require('./math.cjs').choose(true);\nconsole.error('synthetic child failure');\nprocess.exit(7);\n")
    const result = coverage([process.execPath, path.join(root, 'failed.cjs')])
    assert.equal(result.status, 7, result.stderr)
    assert.match(result.stderr, /synthetic child failure/)
    report(result)
  })
})

test('an unmet branch threshold cannot report success', () => {
  fixture(({ root, write, coverage, report, entry }) => {
    write('main.cjs', "require('./math.cjs').choose(true);\n")
    const result = coverage([process.execPath, path.join(root, 'main.cjs')], ['--check-coverage', '--branches=100', '--include=**/math.cjs'])
    assert.notEqual(result.status, 0)
    assert(entry(report(result), 'math.cjs').branches.pct < 100)
    assert.match(result.stderr, /does not meet.*threshold/i)
  })
})

test('Dashboard coverage gate requires each of the four metrics to reach 80 percent', () => {
  const wrapper = fs.readFileSync(new URL('./test-with-server.sh', import.meta.url), 'utf8')
  const gate = wrapper.match(/^  COVERAGE_MINIMUM=\(([^)]+)\)$/m)?.[1].split(/\s+/)
  assert.deepEqual(gate, ['--check-coverage', '--statements=80', '--branches=80', '--functions=80', '--lines=80'])
  fixture(({ root, write, coverage, report }) => {
    write('main.cjs', "require('./math.cjs').choose(true);\n")
    const options = [...gate, '--include=**/math.cjs']
    const partial = coverage([process.execPath, path.join(root, 'main.cjs')], options)
    assert.notEqual(partial.status, 0)
    assert(report(partial).total.branches.pct < 80)
    write('main.cjs', "const { choose } = require('./math.cjs');choose(false);choose(true);\n")
    const complete = coverage([process.execPath, path.join(root, 'main.cjs')], options)
    assert.equal(complete.status, 0, complete.stderr)
  })
})

test('ts-node coverage is remapped to the original TypeScript file', () => {
  fixture(({ root, write, coverage, report, entry }) => {
    write('source.ts', "function choose(value: boolean): string {\n  if (value) return 'yes';\n  return 'no';\n}\nif (choose(true) !== 'yes' || choose(false) !== 'no') throw new Error('fixture mismatch');\n")
    const result = coverage([process.execPath, path.join(dashboard, 'node_modules/ts-node/dist/bin.js'), '--transpileOnly',
      '--skipProject', '--compiler-options', JSON.stringify({ module: 'CommonJS', moduleResolution: 'node', target: 'ES2022' }), path.join(root, 'source.ts')])
    assert.equal(result.status, 0, result.stderr)
    const source = entry(report(result), 'source.ts')
    assert(source.lines.covered > 0)
    assert(source.functions.covered > 0)
  })
})

test('nested c8 runs preserve samples already collected by the outer suite', () => {
  const outer = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-outer-coverage-'))
  const sample = path.join(outer, 'previous-sample.json')
  try {
    fs.writeFileSync(sample, '{"result":[]}')
    fixture(({ coverage, report }) => {
      const result = coverage([process.execPath, '-e', "require('./math.cjs').choose(true)"])
      assert.equal(result.status, 0, result.stderr)
      report(result)
      assert.equal(fs.readFileSync(sample, 'utf8'), '{"result":[]}')
    }, outer)
  } finally {
    fs.rmSync(outer, { recursive: true, force: true })
  }
})
