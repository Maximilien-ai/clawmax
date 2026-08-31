import assert from 'assert'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  getAgentOpenClawConfigPath,
  getAgentChannelSecretsPath,
  getAgentOpenClawProfileArgs,
  getOpenClawExternalChannelPluginPath,
  normalizeAgentChannelProvider,
  parseOpenClawChannelProbeOutput,
  readAgentChannelState,
  readAgentOpenClawPluginPaths,
  redactChannelError,
  restoreAgentOpenClawConfig,
  removeAgentChannelSecret,
  snapshotAgentChannelSecrets,
  snapshotAgentOpenClawConfig,
  validateDiscordConnectionInput,
  validateSlackConnectionInput,
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
    assert.strictEqual(
      getOpenClawExternalChannelPluginPath('/tmp/home', 'discord'),
      path.join('/tmp/home', '.openclaw', 'npm', 'node_modules', '@openclaw', 'discord'),
    )
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
      applicationId: null,
      mode: null,
      channelIds: [],
      guilds: [],
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

  await test('reads non-secret Discord account, guild, channel, and plugin-path state', () => {
    const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-agent-channel-discord-state-'))
    const configPath = getAgentOpenClawConfigPath(homeDir, 'moderator', true)
    const pluginPath = getOpenClawExternalChannelPluginPath(homeDir, 'discord')
    fs.mkdirSync(path.dirname(configPath), { recursive: true })
    fs.writeFileSync(configPath, JSON.stringify({
      plugins: { load: { paths: [pluginPath, pluginPath] } },
      channels: { discord: { enabled: true, accounts: { moderator: {
        name: 'Moderator Discord',
        enabled: true,
        token: { source: 'file', provider: 'clawmax-channels', id: '/discord-moderator' },
        applicationId: '123456789012345678',
        dmPolicy: 'allowlist',
        allowFrom: ['234567890123456789'],
        guilds: {
          '345678901234567890': {
            requireMention: false,
            users: ['234567890123456789'],
            channels: { '456789012345678901': { requireMention: false } },
          },
        },
      } } } },
      bindings: [{ agentId: 'moderator', match: { channel: 'discord', accountId: 'moderator' } }],
    }))

    const state = readAgentChannelState({ homeDir, agentId: 'moderator', isProfile: true, provider: 'discord' })
    assert.strictEqual(state.status, 'bound')
    assert.strictEqual(state.applicationId, '123456789012345678')
    assert.deepStrictEqual(state.guilds, [{
      id: '345678901234567890',
      requireMention: false,
      users: ['234567890123456789'],
      channels: ['456789012345678901'],
    }])
    assert.deepStrictEqual(readAgentOpenClawPluginPaths({ homeDir, agentId: 'moderator', isProfile: true }), [pluginPath, pluginPath])
    assert(!JSON.stringify(state).includes('clawmax-channels'))
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

  await test('validates Discord credentials and scoped IDs', () => {
    const result = validateDiscordConnectionInput({
      token: 'MTIzNDU2Nzg5MDEyMzQ1Njc4.signature_part_1234567890.tail_part_1234567890',
      applicationId: '123456789012345678',
      userIds: ['234567890123456789', '234567890123456789'],
      guildId: '345678901234567890',
      channelIds: ['456789012345678901'],
      requireMention: false,
    })
    assert.strictEqual(result.ok, true)
    if (result.ok) {
      assert.deepStrictEqual(result.value.userIds, ['234567890123456789'])
      assert.strictEqual(result.value.requireMention, false)
    }
  })

  await test('rejects unsafe Discord token and scope combinations', () => {
    assert.strictEqual(validateDiscordConnectionInput({ token: 'too-short' }).ok, false)
    assert.strictEqual(validateDiscordConnectionInput({
      token: 'abcdefghijklmnopqrstuvwxyz_1234567890',
      userIds: ['@owner'],
    }).ok, false)
    assert.strictEqual(validateDiscordConnectionInput({
      token: 'abcdefghijklmnopqrstuvwxyz_1234567890',
      channelIds: ['456789012345678901'],
    }).ok, false)
  })

  await test('reads non-secret Slack Socket Mode account and selected channels', () => {
    const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-agent-channel-slack-state-'))
    const configPath = getAgentOpenClawConfigPath(homeDir, 'helper', true)
    fs.mkdirSync(path.dirname(configPath), { recursive: true })
    fs.writeFileSync(configPath, JSON.stringify({
      channels: { slack: { enabled: true, accounts: { helper: {
        name: 'Helper Slack', enabled: true, mode: 'socket',
        botToken: { source: 'file', provider: 'clawmax-channels', id: '/slack-bot-helper' },
        appToken: { source: 'file', provider: 'clawmax-channels', id: '/slack-app-helper' },
        dmPolicy: 'allowlist', allowFrom: ['U012ABCDEF'],
        channels: { C012ABCDEF: { enabled: true, requireMention: true, users: ['U012ABCDEF'] } },
      } } } },
      bindings: [{ agentId: 'helper', match: { channel: 'slack', accountId: 'helper' } }],
    }))
    const state = readAgentChannelState({ homeDir, agentId: 'helper', isProfile: true, provider: 'slack' })
    assert.strictEqual(state.status, 'bound')
    assert.strictEqual(state.mode, 'socket')
    assert.deepStrictEqual(state.channelIds, ['C012ABCDEF'])
    assert(!JSON.stringify(state).includes('slack-bot-helper'))
  })

  await test('stores and removes separate Slack bot and app secrets', () => {
    const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-agent-channel-slack-secrets-'))
    writeAgentChannelSecret({ homeDir, agentId: 'helper', isProfile: true, provider: 'slack', credential: 'bot', secret: 'xoxb-secret' })
    writeAgentChannelSecret({ homeDir, agentId: 'helper', isProfile: true, provider: 'slack', credential: 'app', secret: 'xapp-secret' })
    writeAgentChannelSecret({ homeDir, agentId: 'helper', isProfile: true, provider: 'discord', secret: 'preserve' })
    const secretPath = getAgentChannelSecretsPath(homeDir, 'helper', true)
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(secretPath, 'utf-8')), {
      'slack-bot-helper': 'xoxb-secret', 'slack-app-helper': 'xapp-secret', 'discord-helper': 'preserve',
    })
    removeAgentChannelSecret({ homeDir, agentId: 'helper', isProfile: true, provider: 'slack' })
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(secretPath, 'utf-8')), { 'discord-helper': 'preserve' })
  })

  await test('validates Slack Socket Mode tokens and stable scoped IDs', () => {
    const valid = validateSlackConnectionInput({
      botToken: 'xoxb-1234567890-abcdefghij', appToken: 'xapp-1234567890-abcdefghij',
      userIds: ['U012ABCDEF', 'U012ABCDEF'], channelIds: ['C012ABCDEF', 'G012ABCDEF'], requireMention: false,
    })
    assert.strictEqual(valid.ok, true)
    if (valid.ok) {
      assert.deepStrictEqual(valid.value.userIds, ['U012ABCDEF'])
      assert.strictEqual(valid.value.requireMention, false)
    }
    assert.strictEqual(validateSlackConnectionInput({ botToken: 'xoxp-wrong', appToken: 'xapp-1234567890-abcdefghij' }).ok, false)
    assert.strictEqual(validateSlackConnectionInput({ botToken: 'xoxb-1234567890-abcdefghij', appToken: 'xoxb-wrong' }).ok, false)
    assert.strictEqual(validateSlackConnectionInput({ botToken: 'xoxb-1234567890-abcdefghij', appToken: 'xapp-1234567890-abcdefghij', channelIds: ['D012ABCDEF'] }).ok, false)
  })

  await test('parses a healthy bounded OpenClaw channel probe', () => {
    assert.deepStrictEqual(parseOpenClawChannelProbeOutput('discord', 'moderator', JSON.stringify({
      channels: [{ channel: 'discord', accountId: 'moderator', probe: { ok: true, status: 200 } }],
    })), {
      ok: true,
      status: 200,
      category: 'healthy',
      message: 'Credential and channel capability probe passed.',
    })
  })

  await test('classifies failed, missing, and unreadable channel probes without returning raw payloads', () => {
    const intent = parseOpenClawChannelProbeOutput('discord', 'moderator', JSON.stringify({
      channels: [{ channel: 'discord', accountId: 'moderator', probe: { ok: false, status: 403, error: 'Missing Message Content intent' } }],
    }))
    assert.strictEqual(intent.category, 'intent')
    assert.strictEqual(parseOpenClawChannelProbeOutput('discord', 'missing', JSON.stringify({ channels: [] })).category, 'connection')
    assert.strictEqual(parseOpenClawChannelProbeOutput('discord', 'missing', 'not json').category, 'unknown')
    assert.strictEqual(parseOpenClawChannelProbeOutput('slack', 'helper', JSON.stringify({ channels: [{ channel: 'slack', accountId: 'helper', probe: { ok: false, error: 'missing_scope: channels:history' } }] })).category, 'scope')
    assert.strictEqual(parseOpenClawChannelProbeOutput('slack', 'helper', JSON.stringify({ channels: [{ channel: 'slack', accountId: 'helper', probe: { ok: false, error: 'Bot token and app token workspace mismatch' } }] })).category, 'token-mismatch')
  })

  await test('redacts explicit and token-shaped secrets from bounded errors', () => {
    const token = '123456789:abcdefghijklmnopqrstuvwxyz_123456'
    const redacted = redactChannelError(new Error(`command failed for ${token}`), [token])
    assert(!redacted.includes(token))
    assert(redacted.includes('[redacted]'))
    const discordToken = 'MTIzNDU2Nzg5MDEyMzQ1Njc4.signature_part_1234567890.tail_part_1234567890'
    assert(!redactChannelError(new Error(`failed ${discordToken}`)).includes(discordToken))
    assert(!redactChannelError(new Error('failed xoxb-1234567890-secret-value')).includes('xoxb-1234567890-secret-value'))
  })

  await test('covers malformed secret stores and absent-secret cleanup without mutation', () => {
    const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-agent-channel-secret-edges-'))
    removeAgentChannelSecret({ homeDir, agentId: 'missing', isProfile: false, provider: 'slack' })
    const secretPath = getAgentChannelSecretsPath(homeDir, 'writer', false)
    fs.mkdirSync(path.dirname(secretPath), { recursive: true })
    fs.writeFileSync(secretPath, '[]')
    assert.throws(() => writeAgentChannelSecret({ homeDir, agentId: 'writer', isProfile: false, provider: 'telegram', secret: 'new' }), /JSON object/)
    fs.writeFileSync(secretPath, JSON.stringify({ invalid: 123 }))
    assert.throws(() => writeAgentChannelSecret({ homeDir, agentId: 'writer', isProfile: false, provider: 'telegram', secret: 'new' }), /values must be strings/)
  })

  await test('covers legacy credentials, malformed config shapes, and normalization edges', () => {
    assert.strictEqual(normalizeAgentChannelProvider(undefined), null)
    const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-agent-channel-config-edges-'))
    const configPath = getAgentOpenClawConfigPath(homeDir, 'edge', false)
    fs.mkdirSync(path.dirname(configPath), { recursive: true })
    fs.writeFileSync(configPath, JSON.stringify({
      channels: {
        telegram: { accounts: { edge: { token: 'legacy', allowFrom: [null, '123'] } } },
        discord: { accounts: { edge: { botToken: 'legacy', guilds: { malformed: null, arrayChannels: { channels: [] } } } } },
      },
      plugins: { load: { paths: [null, '/valid'] } },
    }))
    const telegram = readAgentChannelState({ homeDir, agentId: 'edge', isProfile: false, provider: 'telegram' })
    const discord = readAgentChannelState({ homeDir, agentId: 'edge', isProfile: false, provider: 'discord' })
    assert.strictEqual(telegram.configured, true)
    assert.deepStrictEqual(telegram.allowFrom, ['123'])
    assert.strictEqual(discord.configured, true)
    assert.deepStrictEqual(discord.guilds.map(guild => guild.channels), [[], []])
    assert.deepStrictEqual(readAgentOpenClawPluginPaths({ homeDir, agentId: 'edge', isProfile: false }), ['/valid'])
    fs.writeFileSync(configPath, '[]')
    assert.strictEqual(readAgentChannelState({ homeDir, agentId: 'edge', isProfile: false, provider: 'slack' }).configured, false)
  })

  await test('covers all bounded probe fallback classifications', () => {
    const result = (error?: string, status?: number) => parseOpenClawChannelProbeOutput('slack', 'edge', JSON.stringify({
      channels: [{ channel: 'slack', accountId: 'edge', probe: error === undefined && status === undefined ? null : { ok: false, error, status } }],
    }))
    assert.strictEqual(parseOpenClawChannelProbeOutput('slack', 'edge', JSON.stringify({ channels: [{ channel: 'slack', accountId: 'edge', probe: { ok: true } }] })).status, 200)
    assert.strictEqual(parseOpenClawChannelProbeOutput('slack', 'edge', JSON.stringify({ channels: null })).category, 'connection')
    assert.strictEqual(result().category, 'unknown')
    assert.strictEqual(result('invalid_auth', 401).category, 'authentication')
    assert.strictEqual(result('missing access', 403).category, 'permission')
    assert.strictEqual(result('network timeout').category, 'connection')
    assert.strictEqual(result('unexpected provider response').category, 'unknown')
  })

  await test('covers provider validation shape and optional-field failures', () => {
    assert.strictEqual(validateTelegramConnectionInput(undefined).ok, false)
    assert.strictEqual(validateTelegramConnectionInput({ token: '123456789:abcdefghijklmnopqrstuvwxyz_123456', allowFrom: '123' }).ok, false)
    assert.strictEqual(validateDiscordConnectionInput(undefined).ok, false)
    assert.strictEqual(validateDiscordConnectionInput({ token: 'abcdefghijklmnopqrstuvwxyz_1234567890', userIds: 'bad' }).ok, false)
    assert.strictEqual(validateDiscordConnectionInput({ token: 'abcdefghijklmnopqrstuvwxyz_1234567890', applicationId: 'bad' }).ok, false)
    assert.strictEqual(validateDiscordConnectionInput({ token: 'abcdefghijklmnopqrstuvwxyz_1234567890', guildId: 'bad' }).ok, false)
    assert.strictEqual(validateDiscordConnectionInput({ token: 'abcdefghijklmnopqrstuvwxyz_1234567890', channelIds: ['bad'] }).ok, false)
    assert.strictEqual(validateDiscordConnectionInput({ token: 'abcdefghijklmnopqrstuvwxyz_1234567890', requireMention: 'yes' }).ok, false)
    assert.strictEqual(validateSlackConnectionInput(undefined).ok, false)
    assert.strictEqual(validateSlackConnectionInput({ botToken: 'xoxb-1234567890-abcdefghij', appToken: 'xapp-1234567890-abcdefghij', userIds: 'bad' }).ok, false)
    assert.strictEqual(validateSlackConnectionInput({ botToken: 'xoxb-1234567890-abcdefghij', appToken: 'xapp-1234567890-abcdefghij', userIds: ['C012ABCDEF'] }).ok, false)
    assert.strictEqual(validateSlackConnectionInput({ botToken: 'xoxb-1234567890-abcdefghij', appToken: 'xapp-1234567890-abcdefghij', channelIds: 'bad' }).ok, false)
    assert.strictEqual(validateSlackConnectionInput({ botToken: 'xoxb-1234567890-abcdefghij', appToken: 'xapp-1234567890-abcdefghij', requireMention: 'yes' }).ok, false)
  })

  console.log(`\nAgent channel tests: ${passed} passed, ${failed} failed`)
  process.exit(failed > 0 ? 1 : 0)
}

run()
