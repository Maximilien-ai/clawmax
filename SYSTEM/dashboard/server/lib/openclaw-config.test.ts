import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  canonicalizeDashboardAgentRoster,
  healDashboardManagedOpenClawConfig,
  materializeDashboardAgentList,
  stripUnsupportedDashboardAgentKeys,
  writeDashboardManagedOpenClawConfig,
} from './openclaw-config'

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const RESET = '\x1b[0m'

let testsPassed = 0
let testsFailed = 0

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`${GREEN}✓${RESET} ${name}`)
    testsPassed++
  } catch (err: any) {
    console.log(`${RED}✗${RESET} ${name}`)
    console.error(`  Error: ${err.message}`)
    testsFailed++
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

console.log(`\n${YELLOW}=== OpenClaw Config Test Suite ===${RESET}\n`)

test('writeDashboardManagedOpenClawConfig strips unsupported dashboard-only agent keys before writing', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openclaw-config-test-'))
  const configPath = path.join(tmpDir, 'openclaw.json')

  writeDashboardManagedOpenClawConfig(configPath, {
    gateway: {
      auth: { token: 'stable-token' },
    },
    agents: {
      list: [
        {
          id: 'ceo',
          name: 'CEO',
          workspace: '/tmp/workspace/AGENTS/ceo',
          agentDir: '/tmp/.openclaw/agents/ceo/agent',
          model: 'openai/gpt-4.1',
          skills: ['github'],
          backupModel: 'anthropic/claude-sonnet-4-6',
        },
      ],
    },
  }, 'openclaw-config-test')

  const written = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
  const agent = written.agents.entries.ceo
  assert(!('id' in agent), 'Expected keyed entry to omit its retired id field')
  assert(agent.model === 'openai/gpt-4.1', 'Expected supported model field to persist')
  assert(Array.isArray(agent.skills) && agent.skills[0] === 'github', 'Expected supported skills field to persist')
  assert(!('backupModel' in agent), 'Expected unsupported backupModel field to be stripped')
  assert(!('list' in written.agents), 'Expected durable config to omit legacy agents.list')
  assert(!('lastTouchedAt' in written.meta), 'Expected durable config to omit retired meta.lastTouchedAt')
})

test('healDashboardManagedOpenClawConfig removes stale unsupported dashboard-only agent keys in place', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openclaw-config-test-'))
  const configPath = path.join(tmpDir, 'openclaw.json')

  fs.writeFileSync(configPath, JSON.stringify({
    agents: {
      list: [
        {
          id: 'ceo',
          model: 'openai/gpt-4o-mini',
          backupModel: 'anthropic/claude-sonnet-4-6',
        },
      ],
    },
  }, null, 2))

  const result = healDashboardManagedOpenClawConfig(configPath, 'openclaw-config-heal-test')
  assert(result.ok, result.error || 'Expected config heal to succeed')
  assert(result.changed === true, 'Expected config heal to report a change')

  const healed = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
  assert(!('backupModel' in healed.agents.entries.ceo), 'Expected stale unsupported backupModel to be removed')
  assert(!('list' in healed.agents), 'Expected heal to migrate the legacy list')
})

test('materializeDashboardAgentList projects canonical keyed entries for dashboard mutations', () => {
  const config: any = {
    agents: {
      ownership: 'explicit',
      defaults: { model: 'openai/gpt-4o-mini' },
      entries: {
        ceo: { name: 'CEO', skills: ['github'] },
        engineer: { name: 'Engineer', id: 'retired-shadow-id' },
      },
    },
  }

  const list = materializeDashboardAgentList(config)
  assert(list.length === 2, 'Expected both keyed entries in the dashboard projection')
  assert(list[0].id === 'ceo', 'Expected the entry key to be authoritative')
  assert(list[1].id === 'engineer', 'Expected retired embedded id to be ignored')
  list[0].model = 'openai/gpt-4.1'
  canonicalizeDashboardAgentRoster(config)
  assert(config.agents.entries.ceo.model === 'openai/gpt-4.1', 'Expected projected mutations to survive canonicalization')
  assert(config.agents.ownership === 'explicit', 'Expected agent ownership to survive canonicalization')
  assert(config.agents.defaults.model === 'openai/gpt-4o-mini', 'Expected agent defaults to survive canonicalization')
})

test('canonicalizeDashboardAgentRoster keeps the last legacy duplicate to match keyed roster semantics', () => {
  const config: any = { agents: { list: [
    { id: 'duplicate', workspace: '/stale' },
    { id: 'duplicate', workspace: '/active' },
  ] } }
  canonicalizeDashboardAgentRoster(config)
  assert(config.agents.entries.duplicate.workspace === '/active', 'Expected the last duplicate record to win')
  assert(!('list' in config.agents), 'Expected the legacy list to be removed')
})

test('canonicalizeDashboardAgentRoster rejects malformed legacy ids without data loss', () => {
  for (const list of [
    [{ id: ' spaced ' }],
    [null],
  ]) {
    const config: any = { agents: { list } }
    let failed = false
    try {
      canonicalizeDashboardAgentRoster(config)
    } catch {
      failed = true
    }
    assert(failed, `Expected invalid roster to fail: ${JSON.stringify(list)}`)
    assert(Array.isArray(config.agents.list), 'Expected failed migration to retain the source list')
  }
})

test('healDashboardManagedOpenClawConfig is idempotent for canonical config', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openclaw-config-test-'))
  const configPath = path.join(tmpDir, 'openclaw.json')
  fs.writeFileSync(configPath, JSON.stringify({
    meta: { lastTouchedVersion: 'dashboard-0.1.0' },
    agents: { entries: { ceo: { model: 'openai/gpt-4.1' } } },
  }, null, 2))

  const first = healDashboardManagedOpenClawConfig(configPath, 'canonical-heal-test')
  const second = healDashboardManagedOpenClawConfig(configPath, 'canonical-heal-test')
  assert(first.ok && first.changed === false, 'Expected canonical config to require no healing')
  assert(second.ok && second.changed === false, 'Expected repeated healing to remain a no-op')
})

test('roster helpers fail closed for invalid roots and safely initialize absent agents', () => {
  for (const fn of [materializeDashboardAgentList, canonicalizeDashboardAgentRoster]) {
    let failed = false
    try {
      fn(null)
    } catch {
      failed = true
    }
    assert(failed, 'Expected invalid config root to fail closed')
  }

  const empty: any = {}
  assert(materializeDashboardAgentList(empty).length === 0, 'Expected absent agents to materialize as an empty list')
  assert(canonicalizeDashboardAgentRoster({ agents: { entries: {} } }) === false, 'Expected canonical entries without a list to remain unchanged')
  assert(stripUnsupportedDashboardAgentKeys(null) === false, 'Expected unsupported-key cleanup to ignore invalid roots')

  const malformedEntries: any = { agents: { entries: { broken: null, valid: { name: 'Valid' } } } }
  const projected = materializeDashboardAgentList(malformedEntries)
  assert(projected.length === 1 && projected[0].id === 'valid', 'Expected malformed keyed entries to be excluded')

  const malformedList: any = { agents: { list: [null, [], { id: 'valid' }] } }
  assert(stripUnsupportedDashboardAgentKeys(malformedList) === false, 'Expected malformed list entries to be skipped safely')
})

test('write creates a canonical config and heal safely handles invalid JSON and duplicate rosters', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openclaw-config-test-'))
  const configPath = path.join(tmpDir, 'new', 'openclaw.json')
  writeDashboardManagedOpenClawConfig(configPath, { agents: { list: [] } }, 'new-config-test')
  const written = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
  assert(written.agents.entries && !written.agents.list, 'Expected a new config to use canonical keyed entries')

  const invalidPath = path.join(tmpDir, 'invalid.json')
  fs.writeFileSync(invalidPath, '{ invalid json', 'utf-8')
  const invalid = healDashboardManagedOpenClawConfig(invalidPath, 'invalid-heal-test')
  assert(invalid.ok && invalid.changed === false, 'Expected invalid JSON healing to remain a safe no-op')

  const duplicatePath = path.join(tmpDir, 'duplicate.json')
  fs.writeFileSync(duplicatePath, JSON.stringify({ agents: { list: [
    { id: 'same', workspace: '/stale' },
    { id: 'same', workspace: '/active' },
  ] } }), 'utf-8')
  const duplicate = healDashboardManagedOpenClawConfig(duplicatePath, 'duplicate-heal-test')
  assert(duplicate.ok && duplicate.changed === true, 'Expected duplicate legacy IDs to heal into keyed roster semantics')
  const healed = JSON.parse(fs.readFileSync(duplicatePath, 'utf-8'))
  assert(healed.agents.entries.same.workspace === '/active', 'Expected healing to retain the last duplicate record')
})

console.log(`\nTests passed: ${testsPassed}`)
console.log(`Tests failed: ${testsFailed}`)

if (testsFailed > 0) {
  console.log(`\n${RED}Some tests failed${RESET}`)
  process.exit(1)
} else {
  console.log(`\n${GREEN}All tests passed${RESET}`)
}
