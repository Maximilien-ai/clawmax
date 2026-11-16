/**
 * Prereqs test suite
 *
 * Run with: npx ts-node --transpile-only server/lib/prereqs.test.ts
 */

import fs from 'fs'
import os from 'os'
import path from 'path'
import { buildGitHubAuthChecks, buildGitHubTokenChecks, checkTemplatePrereqs, getGitHubTokenFromEnv, hasRepoScope, isGhAuthenticated } from './prereqs'

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const RESET = '\x1b[0m'

let testsPassed = 0
let testsFailed = 0

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`${GREEN}✓${RESET} ${name}`)
    testsPassed++
  } catch (err: any) {
    console.log(`${RED}✗${RESET} ${name}`)
    console.log(`  Error: ${err.message}`)
    testsFailed++
  }
}

function withTempDir<T>(prefix: string, fn: (dir: string) => T): T {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  try {
    return fn(dir)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

function withEnv<T>(overrides: Record<string, string | undefined>, fn: () => T): T {
  const originals = new Map<string, string | undefined>()
  for (const [key, value] of Object.entries(overrides)) {
    originals.set(key, process.env[key])
    if (typeof value === 'undefined') delete process.env[key]
    else process.env[key] = value
  }
  try {
    return fn()
  } finally {
    for (const [key, value] of originals.entries()) {
      if (typeof value === 'undefined') delete process.env[key]
      else process.env[key] = value
    }
  }
}

function writeFakeCli(filePath: string, versionOutput: string) {
  fs.writeFileSync(filePath, `#!/bin/sh\necho "${versionOutput}"\n`, 'utf-8')
  fs.chmodSync(filePath, 0o755)
}

console.log(`\n${YELLOW}=== Prereqs Test Suite ===${RESET}\n`)

test('buildGitHubAuthChecks fails when gh CLI is missing', () => {
  const checks = buildGitHubAuthChecks(false, '')
  assert(checks.every((check) => check.status === 'fail'), 'Expected all GitHub checks to fail when gh is missing')
  assert(checks.some((check) => check.fixHint?.includes('gh auth login')), 'Expected auth login hint')
})

test('buildGitHubAuthChecks fails when gh is unauthenticated', () => {
  const checks = buildGitHubAuthChecks(true, 'You are not logged into any GitHub hosts.')
  const authCheck = checks.find((check) => check.id === 'github-auth')
  const issueCheck = checks.find((check) => check.id === 'gh-issues')
  assert(authCheck?.status === 'fail', `Expected github-auth fail, got ${authCheck?.status}`)
  assert(issueCheck?.status === 'fail', `Expected gh-issues fail, got ${issueCheck?.status}`)
})

test('buildGitHubAuthChecks requires repo scope for gh-issues', () => {
  const checks = buildGitHubAuthChecks(true, 'Logged in to github.com as test-user')
  const authCheck = checks.find((check) => check.id === 'github-auth')
  const issueCheck = checks.find((check) => check.id === 'gh-issues')
  assert(authCheck?.status === 'pass', `Expected github-auth pass, got ${authCheck?.status}`)
  assert(issueCheck?.status === 'fail', `Expected gh-issues fail without repo scope, got ${issueCheck?.status}`)
  assert(issueCheck?.fixHint === 'Run: gh auth refresh -s repo', 'Expected repo scope fix hint')
})

test('buildGitHubAuthChecks passes when gh auth includes repo scope', () => {
  const checks = buildGitHubAuthChecks(true, 'Logged in to github.com account test-user\nToken scopes: repo, read:org')
  assert(checks.every((check) => check.status === 'pass'), 'Expected all GitHub checks to pass with repo scope')
})

test('buildGitHubTokenChecks passes when runtime token and repo are configured', () => {
  const checks = buildGitHubTokenChecks('owner/repo-name')
  assert(checks.every((check) => check.status === 'pass'), 'Expected runtime token checks to pass with repo')
})

test('buildGitHubTokenChecks warns when repo is missing', () => {
  const checks = buildGitHubTokenChecks()
  const authCheck = checks.find((check) => check.id === 'github-auth')
  const issueCheck = checks.find((check) => check.id === 'gh-issues')
  assert(authCheck?.status === 'pass', `Expected github-auth pass, got ${authCheck?.status}`)
  assert(issueCheck?.status === 'warn', `Expected gh-issues warn without repo, got ${issueCheck?.status}`)
})

test('checkTemplatePrereqs reports installed claude/droid runtimes without touching the openclaw check', () => {
  withTempDir('clawmax-prereqs-runtimes-', (dir) => {
    const claudeCli = path.join(dir, 'claude')
    const droidCli = path.join(dir, 'droid')
    writeFakeCli(claudeCli, 'claude 1.0.0')
    writeFakeCli(droidCli, 'droid 1.0.0')
    withEnv({ CLAUDE_BIN: claudeCli, DROID_BIN: droidCli, CLAWMAX_TEST_WORKSPACE: dir }, () => {
      const result = checkTemplatePrereqs({})
      const claudeCheck = result.checks.find((check) => check.id === 'claude-cli')
      const droidCheck = result.checks.find((check) => check.id === 'droid-cli')
      assert(claudeCheck?.status === 'pass', `Expected claude-cli pass, got ${claudeCheck?.status}`)
      assert(!!claudeCheck?.message.includes('1.0.0'), `Expected claude-cli message to include version, got ${claudeCheck?.message}`)
      assert(droidCheck?.status === 'pass', `Expected droid-cli pass, got ${droidCheck?.status}`)
      assert(result.checks.some((check) => check.id === 'openclaw-cli'), 'Expected the existing openclaw-cli check to remain present')
    })
  })
})

test('checkTemplatePrereqs warns (not fails) when claude/droid CLIs are absent', () => {
  withTempDir('clawmax-prereqs-runtimes-missing-', (dir) => {
    withEnv({ CLAUDE_BIN: undefined, DROID_BIN: undefined, PATH: path.join(dir, 'empty-bin'), HOME: dir, CLAWMAX_TEST_WORKSPACE: dir }, () => {
      const result = checkTemplatePrereqs({})
      const claudeCheck = result.checks.find((check) => check.id === 'claude-cli')
      const droidCheck = result.checks.find((check) => check.id === 'droid-cli')
      assert(claudeCheck?.status === 'warn', `Expected claude-cli warn (not fail) when absent, got ${claudeCheck?.status}`)
      assert(droidCheck?.status === 'warn', `Expected droid-cli warn (not fail) when absent, got ${droidCheck?.status}`)
      assert(!!claudeCheck?.fixHint, 'Expected a fixHint for the missing claude CLI')
    })
  })
})

test('GitHub auth parsing distinguishes authentication from repository scope', () => {
  assert(isGhAuthenticated('Logged in to github.com as tester'), 'Logged-in status should authenticate')
  assert(isGhAuthenticated('Active account: tester'), 'Active-account status should authenticate')
  assert(isGhAuthenticated('Token scopes: read:org'), 'Token-scope status should authenticate')
  assert(!isGhAuthenticated('You are not logged in'), 'Negated login must not authenticate')
  assert(!hasRepoScope('Token scopes: read:org'), 'Read-only org scope is not repo scope')
  assert(hasRepoScope("Token scopes: 'repo', read:org"), 'Quoted repo scope should count')
  assert(hasRepoScope('Token scopes: repo, read:org'), 'Unquoted repo scope should count')
  withEnv({ GITHUB_TOKEN: '  primary-token  ', GH_TOKEN: 'fallback-token' }, () => {
    assert(getGitHubTokenFromEnv() === 'primary-token', 'Explicit GITHUB_TOKEN should win and trim')
  })
  withEnv({ GITHUB_TOKEN: ' ', GH_TOKEN: ' fallback-token ' }, () => {
    assert(getGitHubTokenFromEnv() === 'fallback-token', 'GH_TOKEN should provide a fallback')
  })
})

test('optional template prerequisites report GitHub, Senso, workspace files, and unknown skills', () => {
  withTempDir('clawmax-prereqs-options-', dir => {
    const fakeBin = path.join(dir, 'bin')
    fs.mkdirSync(fakeBin)
    writeFakeCli(path.join(fakeBin, 'openclaw'), 'openclaw 2026.9.5')
    withEnv({
      CLAWMAX_TEST_WORKSPACE: dir,
      GITHUB_TOKEN: 'synthetic-token',
      GH_TOKEN: undefined,
      PATH: `${fakeBin}:${process.env.PATH || ''}`,
      CLAUDE_BIN: path.join(dir, 'missing-claude'),
      DROID_BIN: path.join(dir, 'missing-droid'),
    }, () => {
      const limited = checkTemplatePrereqs({ agents: [{ id: 'writer', skills: ['unknown-skill', 'github', 'gh-issues'] }] }, {
        useGithub: true, useSenso: true, useWorkspaceFs: true,
      })
      assert(limited.checks.find(check => check.id === 'github-repo')?.status === 'warn', 'Missing repo should warn')
      assert(limited.checks.find(check => check.id === 'senso-context')?.status === 'warn', 'Missing Senso context should warn')
      assert(limited.checks.find(check => check.id === 'senso-auth-preview')?.status === 'warn', 'Browser-local Senso auth should remain advisory')
      assert(limited.checks.find(check => check.id === 'workspace-files')?.status === 'pass', 'Installed OpenClaw should enable shared files')
      assert(limited.checks.find(check => check.id === 'skill-available:unknown-skill')?.status === 'warn', 'Unknown skill should warn')
      assert(limited.expectations.find(expectation => expectation.id === 'github-coordination')?.status === 'limited', 'Missing repo should limit coordination')
      assert(limited.expectations.find(expectation => expectation.id === 'senso-memory')?.status === 'limited', 'Missing context should limit memory')
      assert(limited.expectations.some(expectation => expectation.id === 'tool-using-agents'), 'Skills should add tool readiness')
      assert(limited.summary.pass + limited.summary.warn + limited.summary.fail === limited.checks.length, 'Summary must account for all checks')

      const configured = checkTemplatePrereqs({ agents: [{ id: 'writer', skills: [] }] }, {
        useGithub: true, githubRepo: ' owner/repo ', useSenso: true, sensoContextLabel: ' Research ', useWorkspaceFs: true,
      })
      assert(configured.checks.find(check => check.id === 'github-repo')?.status === 'pass', 'Explicit repo should pass')
      assert(configured.checks.find(check => check.id === 'senso-context')?.status === 'pass', 'Explicit Senso context should pass')
      assert(configured.expectations.find(expectation => expectation.id === 'github-coordination')?.status === 'ready', 'Token and repo should enable coordination')
      assert(configured.expectations.find(expectation => expectation.id === 'senso-memory')?.status === 'ready', 'Context should enable memory')
      assert(configured.expectations.find(expectation => expectation.id === 'workspace-files-summary')?.status === 'ready', 'Installed OpenClaw should enable file coordination')
    })
  })
})

console.log('\n========================================')
console.log(`Tests passed: ${testsPassed}`)
console.log(`Tests failed: ${testsFailed}`)
console.log('========================================\n')

if (testsFailed > 0) {
  console.log(`${RED}Some tests failed${RESET}`)
  process.exit(1)
} else {
  console.log(`${GREEN}All tests passed${RESET}`)
}
