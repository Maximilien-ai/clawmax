import assert from 'assert'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  getAgentOpenClawConfigPath,
  getAgentChannelSecretsPath,
  getAgentOpenClawProfileArgs,
  normalizeAgentChannelProvider,
  readAgentChannelState,
  redactChannelError,
  restoreAgentOpenClawConfig,
  removeAgentChannelSecret,
  snapshotAgentChannelSecrets,
  snapshotAgentOpenClawConfig,
  validateTelegramConnectionInput,
  writeAgentChannelSecret,
} from './agent-channels'

let passed = 0
let failed = 0

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn()
    passed++
    console.log(`✓ ${name}`)
  } catch (error: any) {
    failed++
    console.error(`✗ ${name}: ${error.message}`)
  }
}

async function run() {
  await test('normalizes only supported providers', () => {
    assert.strictEqual(normalizeAgentChannelProvider(' Telegram '), 'telegram')
    assert.strictEqual(normalizeAgentChannelProvider('email'), null)
  })

  await test('uses isolated profile config and CLI arguments', () => {
    assert.strictEqual(
      getAgentOpenClawConfigPath('/tmp/home', 'researcher', true),
      path.join('/tmp/home', '.openclaw-researcher', 'openclaw.json'),
    )
    assert.deepStrictEqual(getAgentOpenClawProfileArgs('researcher', true), ['--profile', 'researcher'])
    assert.deepStrictEqual(getAgentOpenClawProfileArgs('researcher', false), [])
  })

  await test('reads configured and bound Telegram state without returning credentials', () => {
    const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-agent-channel-state-'))
    const configPath = getAgentOpenClawConfigPath(homeDir, 'researcher', false)
    fs.mkdirSync(path.dirname(configPath), { recursive: true })
    fs.writeFileSync(configPath, JSON.stringify({
      channels: {
        telegram: {
          enabled: true,
          accounts: {
            researcher: {
              name: 'Research alerts',
              enabled: true,
              botToken: '123456789:SECRET_SHOULD_NOT_ESCAPE',
              dmPolicy: 'allowlist',
              allowFrom: ['123', '456'],
            },
          },
        },
      },
      bindings: [{
        type: 'route',
        agentId: 'researcher',
        match: { channel: 'telegram', accountId: 'researcher' },
      }],
    }))

    const state = readAgentChannelState({ homeDir, agentId: 'researcher', isProfile: false, provider: 'telegram' })
    assert.deepStrictEqual(state, {
      provider: 'telegram',
      accountId: 'researcher',
      displayName: 'Research alerts',
      configured: true,
      enabled: true,
      bound: true,
      status: 'bound',
      dmPolicy: 'allowlist',
      allowFrom: ['123', '456'],
    })
    assert(!JSON.stringify(state).includes('SECRET_SHOULD_NOT_ESCAPE'))
  })

  await test('distinguishes connected but unbound and disabled state', () => {
    const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-agent-channel-unbound-'))
    const configPath = getAgentOpenClawConfigPath(homeDir, 'writer', false)
    fs.mkdirSync(path.dirname(configPath), { recursive: true })
    fs.writeFileSync(configPath, JSON.stringify({
      channels: { telegram: { enabled: false, accounts: { writer: { botToken: 'secret', enabled: true } } } },
    }))
    const state = readAgentChannelState({ homeDir, agentId: 'writer', isProfile: false, provider: 'telegram' })
    assert.strictEqual(state.status, 'connected')
    assert.strictEqual(state.configured, true)
    assert.strictEqual(state.enabled, false)
    assert.strictEqual(state.bound, false)
  })

  await test('returns not-configured for missing or malformed config', () => {
    const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-agent-channel-missing-'))
    const configPath = getAgentOpenClawConfigPath(homeDir, 'writer', false)
    fs.mkdirSync(path.dirname(configPath), { recursive: true })
    fs.writeFileSync(configPath, '{bad json')
    const state = readAgentChannelState({ homeDir, agentId: 'writer', isProfile: false, provider: 'telegram' })
    assert.strictEqual(state.status, 'not-configured')
    assert.strictEqual(state.configured, false)
  })

  await test('restores existing config exactly after a failed transaction', () => {
    const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-agent-channel-rollback-'))
    const configPath = getAgentOpenClawConfigPath(homeDir, 'writer', false)
    fs.mkdirSync(path.dirname(configPath), { recursive: true })
    const original = JSON.stringify({ unknown: { preserved: true } }, null, 2)
    fs.writeFileSync(configPath, original, { mode: 0o600 })
    const snapshot = snapshotAgentOpenClawConfig({ homeDir, agentId: 'writer', isProfile: false })
    fs.writeFileSync(configPath, JSON.stringify({ channels: { telegram: {} } }))
    restoreAgentOpenClawConfig(snapshot)
    assert.strictEqual(fs.readFileSync(configPath, 'utf-8'), original)
    assert.strictEqual(fs.statSync(configPath).mode & 0o777, 0o600)
  })

  await test('removes a newly created config when rolling back', () => {
    const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-agent-channel-new-rollback-'))
    const configPath = getAgentOpenClawConfigPath(homeDir, 'writer', true)
    const snapshot = snapshotAgentOpenClawConfig({ homeDir, agentId: 'writer', isProfile: true })
    fs.mkdirSync(path.dirname(configPath), { recursive: true })
    fs.writeFileSync(configPath, '{}')
    restoreAgentOpenClawConfig(snapshot)
    assert.strictEqual(fs.existsSync(configPath), false)
  })

  await test('stores channel credentials in a mode-0600 file and preserves sibling secrets', () => {
    const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-agent-channel-secrets-'))
    const first = writeAgentChannelSecret({
      homeDir,
      agentId: 'writer',
      isProfile: false,
      provider: 'telegram',
      secret: 'telegram-secret',
    })
    writeAgentChannelSecret({
      homeDir,
      agentId: 'reviewer',
      isProfile: false,
      provider: 'telegram',
      secret: 'reviewer-secret',
    })
    assert.strictEqual(first.jsonPointer, '/telegram-writer')
    assert.strictEqual(fs.statSync(first.filePath).mode & 0o777, 0o600)
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(first.filePath, 'utf-8')), {
      'telegram-writer': 'telegram-secret',
      'telegram-reviewer': 'reviewer-secret',
    })
  })

  await test('removes only one channel secret and supports exact rollback', () => {
    const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-agent-channel-secret-rollback-'))
    writeAgentChannelSecret({ homeDir, agentId: 'writer', isProfile: false, provider: 'telegram', secret: 'writer-secret' })
    writeAgentChannelSecret({ homeDir, agentId: 'reviewer', isProfile: false, provider: 'telegram', secret: 'reviewer-secret' })
    const secretPath = getAgentChannelSecretsPath(homeDir, 'writer', false)
    const snapshot = snapshotAgentChannelSecrets({ homeDir, agentId: 'writer', isProfile: false })
    removeAgentChannelSecret({ homeDir, agentId: 'writer', isProfile: false, provider: 'telegram' })
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(secretPath, 'utf-8')), { 'telegram-reviewer': 'reviewer-secret' })
    restoreAgentOpenClawConfig(snapshot)
    assert.strictEqual(fs.readFileSync(secretPath, 'utf-8'), snapshot.content)
  })

  await test('fails closed without overwriting a malformed credential store', () => {
    const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-agent-channel-malformed-secrets-'))
    const secretPath = getAgentChannelSecretsPath(homeDir, 'writer', false)
    fs.mkdirSync(path.dirname(secretPath), { recursive: true })
    fs.writeFileSync(secretPath, '{malformed', { mode: 0o600 })
    assert.throws(() => writeAgentChannelSecret({
      homeDir,
      agentId: 'writer',
      isProfile: false,
      provider: 'telegram',
      secret: 'new-secret',
    }), /Could not read the existing channel credential store/)
    assert.strictEqual(fs.readFileSync(secretPath, 'utf-8'), '{malformed')
  })

  await test('validates Telegram tokens and deduplicates numeric owners', () => {
    const result = validateTelegramConnectionInput({
      token: '123456789:abcdefghijklmnopqrstuvwxyz_123456',
      allowFrom: ['123', '123', 456],
    })
    assert.strictEqual(result.ok, true)
    if (result.ok) assert.deepStrictEqual(result.value.allowFrom, ['123', '456'])
  })

  await test('rejects malformed Telegram credentials and allowlists', () => {
    assert.strictEqual(validateTelegramConnectionInput({ token: 'not-a-token' }).ok, false)
    assert.strictEqual(validateTelegramConnectionInput({
      token: '123456789:abcdefghijklmnopqrstuvwxyz_123456',
      allowFrom: ['@owner'],
    }).ok, false)
  })

  await test('redacts explicit and token-shaped secrets from bounded errors', () => {
    const token = '123456789:abcdefghijklmnopqrstuvwxyz_123456'
    const redacted = redactChannelError(new Error(`command failed for ${token}`), [token])
    assert(!redacted.includes(token))
    assert(redacted.includes('[redacted]'))
  })

  console.log(`\nAgent channel tests: ${passed} passed, ${failed} failed`)
  process.exit(failed > 0 ? 1 : 0)
}

run()
