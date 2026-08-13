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
const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-mail-grants-'))
const workspace = path.join(tempHome, 'workspace')
const agentWorkspace = path.join(workspace, 'AGENTS', 'mail-agent')
fs.mkdirSync(path.join(workspace, 'SYSTEM'), { recursive: true })
fs.mkdirSync(agentWorkspace, { recursive: true })
fs.mkdirSync(path.join(tempHome, '.openclaw'), { recursive: true })
fs.writeFileSync(path.join(tempHome, '.openclaw', 'openclaw.json'), JSON.stringify({
  agents: { list: [{ id: 'mail-agent', name: 'Mail Agent', workspace: agentWorkspace, skills: ['clawmax-mail'] }] },
}, null, 2))
process.env.HOME = tempHome
process.env.OPENCLAW_WORKSPACE = workspace
process.env.CLAWMAX_TEST_WORKSPACE = workspace
process.env.CLAWMAX_SECRET_MASTER_KEY = 'mail-grant-test-master-key-with-at-least-thirty-two-characters'
resetWorkspaceManagerForTests()

const oauth = require('./mail-oauth') as typeof import('./mail-oauth')
const grants = require('./mail-grants') as typeof import('./mail-grants')
const gmail = oauth.createFakeMailOAuthProvider('gmail', { accountId: 'mail-account', accountEmail: 'owner@example.test' })
const microsoft365 = oauth.createFakeMailOAuthProvider('microsoft365')
const providers = { gmail, microsoft365 }

let passed = 0
let failed = 0

async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn()
    console.log(`✓ ${name}`)
    passed++
  } catch (error: any) {
    console.error(`✗ ${name}: ${error.message}`)
    failed++
  }
}

function state(url: string): string {
  return new URL(url).searchParams.get('state') || ''
}

async function run() {
  const started = oauth.beginMailOAuth({
    provider: 'gmail',
    actorId: 'owner@example.test',
    scopes: ['mail.list', 'mail.search', 'mail.read.metadata', 'mail.read.body', 'mail.draft.create'],
    adapter: gmail,
    workspacePath: workspace,
  })
  await oauth.completeMailOAuth({
    provider: 'gmail',
    actorId: 'owner@example.test',
    state: state(started.authorizationUrl),
    code: 'grant-code-secret',
    adapter: gmail,
    workspacePath: workspace,
  })

  let grant: import('./mail-capabilities').MailCapabilityGrant
  await test('persists a workspace-agent-skill-account scoped grant', () => {
    grant = grants.createMailCapabilityGrant({
      agentId: 'mail-agent',
      provider: 'gmail',
      accountId: 'mail-account',
      capabilities: ['mail.list', 'mail.search', 'mail.read.metadata'],
    }, workspace)
    assert.strictEqual(grant.workspaceId, path.basename(workspace))
    assert.strictEqual(grant.pluginId, 'clawmax-mail')
    assert.strictEqual(grant.pluginFingerprint.length, 64)
    assert.deepStrictEqual(grant.capabilities, ['mail.list', 'mail.read.metadata', 'mail.search'])
    assert(!fs.readFileSync(grants.__test.grantsPath(workspace), 'utf8').includes('grant-code-secret'))
  })

  await test('rejects unassigned agents, unknown accounts, and unsupported capabilities', () => {
    assert.throws(() => grants.createMailCapabilityGrant({
      agentId: 'other-agent', provider: 'gmail', accountId: 'mail-account', capabilities: ['mail.list'],
    }, workspace), /not assigned/i)
    assert.throws(() => grants.createMailCapabilityGrant({
      agentId: 'mail-agent', provider: 'gmail', accountId: 'missing', capabilities: ['mail.list'],
    }, workspace), /connection not found/i)
    assert.throws(() => grants.createMailCapabilityGrant({
      agentId: 'mail-agent', provider: 'gmail', accountId: 'mail-account', capabilities: ['mail.send'],
    }, workspace), /Unsupported mail capability/i)
  })

  await test('lists only accounts granted to the runtime agent', () => {
    const accounts = grants.listGrantedMailAccounts('mail-agent', workspace)
    assert.strictEqual(accounts.length, 1)
    assert.strictEqual(accounts[0].accountEmail, 'owner@example.test')
    assert(!JSON.stringify(accounts).includes('access-token'))
  })

  await test('executes a granted list through the encrypted OAuth connection', async () => {
    let authorization = ''
    const fakeFetch = async (_input: any, init: RequestInit = {}) => {
      authorization = `${(init.headers as any)?.Authorization || ''}`
      return new Response(JSON.stringify({ messages: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    const result = await grants.executeGrantedMailCapability({
      agentId: 'mail-agent',
      provider: 'gmail',
      accountId: 'mail-account',
      capability: 'mail.list',
      args: { limit: 5 },
      providers,
      fetchFn: fakeFetch as typeof fetch,
    }, workspace)
    assert.deepStrictEqual(result, [])
    assert.match(authorization, /^Bearer gmail-access-token-/)
  })

  await test('denies body reads that were not granted', async () => {
    await assert.rejects(grants.executeGrantedMailCapability({
      agentId: 'mail-agent', provider: 'gmail', accountId: 'mail-account', capability: 'mail.read.body',
      args: { messageId: 'message-1' }, providers,
    }, workspace), /not granted/i)
  })

  await test('invalidates a grant when the packaged skill fingerprint changes', async () => {
    const stored = JSON.parse(fs.readFileSync(grants.__test.grantsPath(workspace), 'utf8'))
    stored.grants[0].pluginFingerprint = '0'.repeat(64)
    fs.writeFileSync(grants.__test.grantsPath(workspace), JSON.stringify(stored, null, 2))
    await assert.rejects(grants.executeGrantedMailCapability({
      agentId: 'mail-agent', provider: 'gmail', accountId: 'mail-account', capability: 'mail.list', providers,
    }, workspace), /requires reauthorization/i)
    stored.grants[0].pluginFingerprint = grants.createMailCapabilityGrant({
      agentId: 'mail-agent', provider: 'gmail', accountId: 'mail-account', capabilities: ['mail.list'],
    }, workspace).pluginFingerprint
  })

  await test('revokes active grants when the connected account is removed', () => {
    assert.strictEqual(grants.revokeMailGrantsForConnection('gmail', 'mail-account', workspace), 1)
    assert.strictEqual(grants.listGrantedMailAccounts('mail-agent', workspace).length, 0)
  })

  await test('writes metadata-only capability audit records', () => {
    const audit = fs.readFileSync(grants.__test.auditPath(workspace), 'utf8')
    assert(audit.includes('mail.capability.executed'))
    assert(!audit.includes('grant-code-secret'))
    assert(!audit.includes('gmail-access-token'))
  })

  console.log(`\nTests passed: ${passed}`)
  console.log(`Tests failed: ${failed}`)
  if (failed > 0) process.exitCode = 1
}

run().finally(() => {
  if (original.home === undefined) delete process.env.HOME
  else process.env.HOME = original.home
  if (original.workspace === undefined) delete process.env.OPENCLAW_WORKSPACE
  else process.env.OPENCLAW_WORKSPACE = original.workspace
  if (original.testWorkspace === undefined) delete process.env.CLAWMAX_TEST_WORKSPACE
  else process.env.CLAWMAX_TEST_WORKSPACE = original.testWorkspace
  if (original.masterKey === undefined) delete process.env.CLAWMAX_SECRET_MASTER_KEY
  else process.env.CLAWMAX_SECRET_MASTER_KEY = original.masterKey
  resetWorkspaceManagerForTests()
  fs.rmSync(tempHome, { recursive: true, force: true })
})
