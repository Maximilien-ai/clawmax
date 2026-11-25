import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { healDashboardManagedOpenClawConfig } from '../server/lib/openclaw-config'

const file = process.env.OPENCLAW_CONFIG_PATH!
assert.equal(process.env.CLAWMAX_TEST_ISOLATED_GATEWAY, 'true')
assert.equal(path.basename(path.dirname(path.dirname(file))).startsWith('clawmax-test-runtime-'), true)
const cli = (...args: string[]) => spawnSync(process.env.OPENCLAW_BIN!, args, { encoding: 'utf8', timeout: 20000 })
const config = JSON.parse(fs.readFileSync(file, 'utf8'))
config.meta ??= {}
config.meta.migrations ??= {}
config.meta.migrations.modelPolicyAllowlist = true
config.agents.defaults.modelPolicy = { allow: ['openai/gpt-5', 'haiku', 'sonnet', 'claude-haiku-5-5'] }
fs.writeFileSync(file, JSON.stringify(config))
const invalid = cli('config', 'validate')
assert.notEqual(invalid.status, 0)
assert.match(invalid.stdout + invalid.stderr, /invalid model policy ref/i)
const repaired = healDashboardManagedOpenClawConfig(file, 'isolated-policy-repair')
assert(repaired.ok && repaired.changed, repaired.error)
assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')).agents.defaults.modelPolicy.allow, ['openai/gpt-5'])
assert.equal(cli('config', 'validate').status, 0)
assert.equal(cli('gateway', 'call', 'health', '--json', '--timeout', '5000').status, 0)
console.log('Invalid refs reproduced, repaired and validated with authenticated Gateway health.')
