const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { test } = require('node:test')
const { classifyPaths, scopeForEvent } = require('./dashboard-test-scope.cjs')

test('only reviewed automation and documentation paths select focused checks', () => {
  for (const file of ['README.md', 'CHANGELOG.md', 'SYSTEM/docs/STATUS.md', 'SYSTEM/docs/planning/ACCEPTANCE.md',
    '.github/workflows/ci.yml', '.github/workflows/image-action-contracts.yml', '.github/workflows/container-image.yml',
    '.github/workflows/test-container-image.yml', '.github/workflows/mirror-gcp-image.yml',
    '.github/scripts/dashboard-test-scope.cjs', '.github/scripts/dashboard-test-scope.test.cjs']) {
    assert.equal(classifyPaths([file]).dashboard, false, file)
  }
})

test('application, dependencies, runtime, shared helpers and unknown paths require the full suite', () => {
  for (const file of ['SYSTEM/dashboard/client/src/App.tsx', 'SYSTEM/dashboard/server/index.ts',
    'SYSTEM/dashboard/package.json', 'SYSTEM/dashboard/package-lock.json', 'SYSTEM/dashboard/tsconfig.json',
    'Dockerfile', 'setup.sh', 'build.sh', 'lint.sh', 'test.sh', 'SYSTEM/test.sh', 'SYSTEM/start.sh',
    'SYSTEM/cognee-bundle/package-lock.json', 'SYSTEM/openclaw-target.env', 'PLUGINS/test/example/manifest.json',
    'SKILLS/example/SKILL.md', 'AGENTS.md', '.github/workflows/new.yml', 'SYSTEM/docs/tool.cjs']) {
    assert.equal(classifyPaths(['README.md', file]).dashboard, true, file)
  }
})

test('empty, malformed and unusual inventories never skip application validation', () => {
  for (const paths of [[], null, [''], [42], ['SYSTEM/docs/../dashboard/server/index.ts'],
    ['/SYSTEM/docs/STATUS.md'], ['SYSTEM/docs/file\nname.md'], ['SYSTEM\\docs\\file.md'], ['SYSTEM/docs//file.md']]) {
    assert.equal(classifyPaths(paths).dashboard, true, JSON.stringify(paths))
  }
})

test('invalid commits and release/tag events cannot execute a diff or select focused checks', () => {
  const sha = 'a'.repeat(40)
  let calls = 0
  const git = () => { calls++; throw new Error('must not invoke git') }
  for (const bad of [undefined, '0'.repeat(40), '--help', 'a;echo unsafe', sha + '\n']) {
    assert.equal(scopeForEvent('pull_request', { pull_request: { base: { sha: bad }, head: { sha } } }, '.', git).dashboard, true)
  }
  for (const ref of ['refs/tags/v2.0.0', 'refs/heads/release-2.0.0', undefined]) {
    assert.equal(scopeForEvent('push', { before: sha, after: 'b'.repeat(40), ref }, '.', git).dashboard, true)
  }
  assert.equal(scopeForEvent('workflow_dispatch', {}, '.', git).dashboard, true)
  assert.equal(calls, 0, 'invalid metadata must be rejected before invoking git')
})

test('comparison errors and incomplete output require full validation', () => {
  const event = { pull_request: { base: { sha: 'a'.repeat(40) }, head: { sha: 'b'.repeat(40) } } }
  for (const git of [() => { throw new Error('missing commit') }, () => '', () => 'README.md', () => Buffer.from('README.md\0')]) {
    assert.equal(scopeForEvent('pull_request', event, '.', git).dashboard, true)
  }
})

test('real git history detects application edits, deletions and renames into docs', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-ci-scope-'))
  const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' } }).trim()
  const commit = message => {
    git(['add', '.'])
    git(['-c', 'user.name=CI fixture', '-c', 'user.email=ci@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', 'commit', '-qm', message])
    return git(['rev-parse', 'HEAD'])
  }
  const event = (base, head) => ({ pull_request: { base: { sha: base }, head: { sha: head } } })
  try {
    git(['init', '-q'])
    fs.mkdirSync(path.join(root, 'SYSTEM/dashboard'), { recursive: true })
    fs.writeFileSync(path.join(root, 'SYSTEM/dashboard/runtime.md'), 'runtime instructions')
    const base = commit('fixture base')
    fs.writeFileSync(path.join(root, 'README.md'), 'documentation')
    const docs = commit('fixture docs')
    assert.equal(scopeForEvent('pull_request', event(base, docs), root).dashboard, false)
    assert.equal(scopeForEvent('push', { before: base, after: docs, ref: 'refs/heads/main' }, root).dashboard, false)
    fs.writeFileSync(path.join(root, 'SYSTEM/dashboard/runtime.md'), 'changed runtime instructions')
    const application = commit('fixture application')
    assert.equal(scopeForEvent('pull_request', event(docs, application), root).dashboard, true)
    fs.mkdirSync(path.join(root, 'SYSTEM/docs'), { recursive: true })
    git(['mv', 'SYSTEM/dashboard/runtime.md', 'SYSTEM/docs/moved.md'])
    const renamed = commit('fixture rename')
    assert.equal(scopeForEvent('pull_request', event(application, renamed), root).dashboard, true)
    assert.equal(scopeForEvent('pull_request', event(renamed, renamed), root).dashboard, true)
    const eventFile = path.join(root, 'event.json'), outputFile = path.join(root, 'output')
    fs.writeFileSync(eventFile, JSON.stringify(event(base, docs)))
    execFileSync(process.execPath, [path.join(__dirname, 'dashboard-test-scope.cjs')], { cwd: root, env: { ...process.env, GITHUB_EVENT_NAME: 'pull_request', GITHUB_EVENT_PATH: eventFile, GITHUB_OUTPUT: outputFile } })
    assert.equal(fs.readFileSync(outputFile, 'utf8'), 'dashboard=false\n')
    fs.writeFileSync(eventFile, 'malformed event')
    fs.writeFileSync(outputFile, '')
    execFileSync(process.execPath, [path.join(__dirname, 'dashboard-test-scope.cjs')], { cwd: root, env: { ...process.env, GITHUB_EVENT_NAME: 'pull_request', GITHUB_EVENT_PATH: eventFile, GITHUB_OUTPUT: outputFile } })
    assert.equal(fs.readFileSync(outputFile, 'utf8'), 'dashboard=true\n')
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})

test('CI retains its required job, unconditional security audit and default-full gates', () => {
  const workflow = fs.readFileSync(path.join(__dirname, '../workflows/ci.yml'), 'utf8')
  const block = name => {
    const start = workflow.indexOf(`      - name: ${name}\n`)
    assert.notEqual(start, -1, name)
    const end = workflow.indexOf('\n      - ', start + 1)
    return workflow.slice(start, end < 0 ? undefined : end)
  }
  assert.match(workflow, /jobs:\n  test:/)
  assert.match(workflow, /fetch-depth: 0/)
  for (const name of ['Install OpenClaw CLI', 'Install Claude Code and Factory Droid CLIs', 'Install jq', 'Run setup',
    'Lint and validate developer commands', 'Build dashboard', 'Prepare dashboard env', 'Start dashboard server', 'Run tests']) {
    assert.match(block(name), /if: steps\.scope\.outputs\.dashboard != 'false'/, name)
  }
  assert.doesNotMatch(block('Reject high and critical dependency advisories'), /\n\s+if:/)
  assert.match(block('Reject high and critical dependency advisories'), /npm run security:audit/)
  const memoryAudit = block('Reject high and critical optional-memory advisories')
  assert.doesNotMatch(memoryAudit, /\n\s+if:|continue-on-error/)
  assert.match(memoryAudit, /working-directory: SYSTEM\/cognee-bundle/)
  assert.match(memoryAudit, /npm ci --omit=dev --ignore-scripts --legacy-peer-deps/)
  assert.match(memoryAudit, /npm audit --omit=dev --audit-level=high/)
  assert.match(memoryAudit, /node harden\.cjs/)
  assert.match(memoryAudit, /node --test transport\.test\.cjs/)
  assert.doesNotMatch(block('Validate test selection'), /\n\s+if:/)
  assert.match(block('Validate automation and image contracts'), /if: steps\.scope\.outputs\.dashboard == 'false'/)
  for (const match of block('Validate automation and image contracts').matchAll(/^\s+(sh|bash) (SYSTEM\/[^\s]+\.sh)$/gm)) {
    const source = fs.readFileSync(path.join(__dirname, '../..', match[2]), 'utf8')
    if (/^#![^\n]*\bbash\b/.test(source)) {
      assert.equal(match[1], 'bash', `${match[2]} requires Bash, including on Linux where sh is dash`)
    }
  }
})
