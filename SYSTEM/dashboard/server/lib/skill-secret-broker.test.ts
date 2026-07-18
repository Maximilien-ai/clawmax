import assert from 'assert'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { resetWorkspaceManagerForTests } from './workspace-manager'

const original = {
  home: process.env.HOME,
  workspace: process.env.OPENCLAW_WORKSPACE,
  testWorkspace: process.env.CLAWMAX_TEST_WORKSPACE,
  masterKey: process.env.CLAWMAX_SECRET_MASTER_KEY,
}

const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-secret-broker-'))
const workspace = path.join(tempHome, 'workspace')
const openclawDir = path.join(tempHome, '.openclaw')
fs.mkdirSync(path.join(workspace, 'SYSTEM'), { recursive: true })
fs.mkdirSync(path.join(workspace, 'AGENTS', 'broker-agent'), { recursive: true })
fs.mkdirSync(openclawDir, { recursive: true })
fs.writeFileSync(path.join(openclawDir, 'openclaw.json'), JSON.stringify({
  agents: {
    list: [{
      id: 'broker-agent',
      name: 'Broker Agent',
      workspace: path.join(workspace, 'AGENTS', 'broker-agent'),
      skills: ['clawmax-secret-test'],
    }],
  },
}, null, 2))
process.env.HOME = tempHome
process.env.OPENCLAW_WORKSPACE = workspace
process.env.CLAWMAX_TEST_WORKSPACE = workspace
process.env.CLAWMAX_SECRET_MASTER_KEY = 'test-master-key-that-is-longer-than-thirty-two-characters'
resetWorkspaceManagerForTests()

const broker = require('./skill-secret-broker') as typeof import('./skill-secret-broker')
const sentinel = 'rc3-secret-sentinel-value-984312'
let passed = 0
let failed = 0

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn()
    console.log(`✓ ${name}`)
    passed++
  } catch (error: any) {
    console.error(`✗ ${name}: ${error.message}`)
    failed++
  }
}

async function run() {
  await test('validates uppercase key names and rejects wildcards', () => {
    assert.strictEqual(broker.validateBrokerSecretKey('CLAWMAX_TEST_SECRET'), 'CLAWMAX_TEST_SECRET')
    assert.throws(() => broker.validateBrokerSecretKey('google.password'))
    assert.throws(() => broker.validateBrokerSecretKey('SECRET_*'))
  })

  await test('fails closed without an operator master key', () => {
    const saved = process.env.CLAWMAX_SECRET_MASTER_KEY
    delete process.env.CLAWMAX_SECRET_MASTER_KEY
    assert.strictEqual(broker.isSkillSecretBrokerConfigured(), false)
    assert.throws(() => broker.putBrokerSecret('CLAWMAX_TEST_SECRET', sentinel, workspace), /MASTER_KEY/i)
    process.env.CLAWMAX_SECRET_MASTER_KEY = saved
  })

  await test('stores only encrypted ciphertext and returns masked inventory', () => {
    broker.putBrokerSecret('CLAWMAX_TEST_SECRET', sentinel, workspace)
    const rawStore = fs.readFileSync(broker.__test.secretsPath(workspace), 'utf8')
    assert(!rawStore.includes(sentinel), 'encrypted store must not contain plaintext')
    const summaries = broker.listBrokerSecretSummaries(workspace)
    assert.deepStrictEqual(summaries.map((entry) => entry.key), ['CLAWMAX_TEST_SECRET'])
    assert.strictEqual(summaries[0].preview, '••••••••')
    assert(!summaries[0].preview.includes(sentinel.slice(0, 3)), 'inventory must not expose a secret prefix')
    assert(!summaries[0].preview.includes(sentinel.slice(-3)), 'inventory must not expose a secret suffix')
    assert(!JSON.stringify(summaries).includes(sentinel), 'inventory must not expose plaintext')
  })

  await test('rejects undeclared keys and unassigned skills', () => {
    assert.throws(() => broker.createSkillSecretGrant({
      agentId: 'broker-agent', skillId: 'clawmax-secret-test', keys: ['UNDECLARED_KEY'],
    }, workspace), /did not declare/i)
    assert.throws(() => broker.createSkillSecretGrant({
      agentId: 'other-agent', skillId: 'clawmax-secret-test', keys: ['CLAWMAX_TEST_SECRET'],
    }, workspace), /not assigned/i)
  })

  let grant: import('./skill-secret-broker').SkillSecretGrant
  await test('creates a workspace-agent-skill-fingerprint-key scoped grant', () => {
    grant = broker.createSkillSecretGrant({
      agentId: 'broker-agent',
      skillId: 'clawmax-secret-test',
      keys: ['CLAWMAX_TEST_SECRET'],
    }, workspace)
    assert.strictEqual(grant.workspaceId, path.basename(workspace))
    assert.strictEqual(grant.agentId, 'broker-agent')
    assert.strictEqual(grant.skillId, 'clawmax-secret-test')
    assert.strictEqual(grant.skillFingerprint.length, 64)
    assert.deepStrictEqual(grant.keys, ['CLAWMAX_TEST_SECRET'])
  })

  await test('executes a fixed child action without returning the raw secret', async () => {
    const result = await broker.executeBrokeredSkill({ agentId: 'broker-agent', skillId: 'clawmax-secret-test', action: 'check' }, workspace)
    assert.strictEqual(result.ok, true)
    const parsed = JSON.parse(result.stdout)
    assert.strictEqual(parsed.secretAvailable, true)
    assert.strictEqual(typeof parsed.fingerprint, 'string')
    assert(!JSON.stringify(result).includes(sentinel))
    assert.strictEqual(process.env.CLAWMAX_TEST_SECRET, undefined, 'parent environment must not receive brokered secret')
  })

  await test('redacts deliberate stdout and stderr disclosure', async () => {
    const echoed = await broker.executeBrokeredSkill({ agentId: 'broker-agent', skillId: 'clawmax-secret-test', action: 'echo-for-redaction-test' }, workspace)
    assert.strictEqual(echoed.stdout, '[REDACTED]')
    const failedResult = await broker.executeBrokeredSkill({ agentId: 'broker-agent', skillId: 'clawmax-secret-test', action: 'fail-for-redaction-test' }, workspace)
    assert.strictEqual(failedResult.ok, false)
    assert.strictEqual(failedResult.stderr, 'failure:[REDACTED]')
  })

  await test('signs short-lived capabilities and rejects tampering or workspace mismatch', () => {
    const token = broker.createBrokerCapabilityToken('broker-agent', workspace, 60_000)
    assert(token)
    assert.strictEqual(broker.verifyBrokerCapabilityToken(token!, workspace).agentId, 'broker-agent')
    assert.throws(() => broker.verifyBrokerCapabilityToken(`${token}x`, workspace), /invalid/i)
    const otherWorkspace = path.join(tempHome, 'other-workspace')
    fs.mkdirSync(otherWorkspace, { recursive: true })
    assert.throws(() => broker.verifyBrokerCapabilityToken(token!, otherWorkspace), /invalid/i)
    const expired = broker.createBrokerCapabilityToken('broker-agent', workspace, -1)
    assert.throws(() => broker.verifyBrokerCapabilityToken(expired!, workspace), /expired/i)
  })

  await test('invalidates grants when the recorded fingerprint changes', async () => {
    const grantsFile = broker.__test.grantsPath(workspace)
    const stored = JSON.parse(fs.readFileSync(grantsFile, 'utf8'))
    stored.grants[0].skillFingerprint = '0'.repeat(64)
    fs.writeFileSync(grantsFile, JSON.stringify(stored, null, 2))
    await assert.rejects(
      broker.executeBrokeredSkill({ agentId: 'broker-agent', skillId: 'clawmax-secret-test', action: 'check' }, workspace),
      /requires reauthorization/i,
    )
    stored.grants[0].skillFingerprint = broker.getSkillFingerprint('clawmax-secret-test')
    fs.writeFileSync(grantsFile, JSON.stringify(stored, null, 2))
  })

  await test('enforces revocation', async () => {
    broker.revokeSkillSecretGrant(grant!.id, workspace)
    await assert.rejects(
      broker.executeBrokeredSkill({ agentId: 'broker-agent', skillId: 'clawmax-secret-test', action: 'check' }, workspace),
      /No active secret grant/i,
    )
  })

  await test('audit records contain key names and status but never values', () => {
    const audit = fs.readFileSync(broker.__test.auditPath(workspace), 'utf8')
    assert(audit.includes('CLAWMAX_TEST_SECRET'))
    assert(audit.includes('broker.executed'))
    assert(audit.includes('broker.denied'))
    assert(!audit.includes(sentinel))
  })

  await test('deleting a secret preserves masked-only behavior', () => {
    broker.deleteBrokerSecret('CLAWMAX_TEST_SECRET', workspace)
    assert.deepStrictEqual(broker.listBrokerSecretSummaries(workspace), [])
  })

  console.log(`\nTests passed: ${passed}`)
  console.log(`Tests failed: ${failed}`)
  if (failed > 0) process.exitCode = 1
}

run().finally(() => {
  process.env.HOME = original.home
  process.env.OPENCLAW_WORKSPACE = original.workspace
  process.env.CLAWMAX_TEST_WORKSPACE = original.testWorkspace
  process.env.CLAWMAX_SECRET_MASTER_KEY = original.masterKey
  resetWorkspaceManagerForTests()
  fs.rmSync(tempHome, { recursive: true, force: true })
})
