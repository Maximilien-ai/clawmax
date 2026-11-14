// Cold-start configuration fixture: never reads or changes the operator's .env.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export function checkDashboardEnvStartup(input: {
  file?: string
  runtime: Record<string, string>
  systemKey?: string
  userKey?: string
}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dashboard-env-startup-'))
  try {
    const lib = path.join(directory, 'server', 'lib')
    fs.mkdirSync(lib, { recursive: true })
    for (const name of ['dashboard-env.ts', 'cloud-execution-policy.ts']) {
      fs.copyFileSync(path.join(__dirname, name), path.join(lib, name))
    }
    fs.symlinkSync(path.resolve(__dirname, '..', '..', 'node_modules'), path.join(directory, 'node_modules'), 'dir')
    if (input.file !== undefined) fs.writeFileSync(path.join(directory, '.env'), input.file, { mode: 0o600 })
    const bootstrap = `
      const assert = require('node:assert/strict')
      const config = require('./server/lib/dashboard-env')
      const expected = JSON.parse(process.env.DASHBOARD_ENV_EXPECTED)
      assert.equal(config.getSystemProviderKeys().openai, expected.systemKey, 'system credential precedence')
      assert.equal(config.resolveSystemExecutionProviderKeys().openai, expected.systemKey, 'generation credential')
      assert.equal(config.getUserDefaultProviderKeys().openai, expected.userKey, 'user default credential')
      assert.equal(config.resolveUserExecutionProviderKeys().openai, expected.userKey, 'user execution credential')
      assert.equal(config.allowSystemKeysForUserExecution(), false, 'system fallback stays disabled')
      assert.equal(config.resolveUserExecutionProviderKeys(undefined, { openai: 'synthetic-browser-override' }).openai, 'synthetic-browser-override', 'explicit BYOK wins')
      assert.equal(config.getBestAvailableModel(), 'openai/gpt-5.4-mini', 'supported text model')
    `
    execFileSync(process.execPath, ['-r', require.resolve('ts-node/register/transpile-only'), '-e', bootstrap], {
      cwd: directory,
      env: {
        PATH: process.env.PATH,
        TS_NODE_PROJECT: path.resolve(__dirname, '..', '..', 'tsconfig.json'),
        DASHBOARD_ENV_EXPECTED: JSON.stringify({ systemKey: input.systemKey, userKey: input.userKey }),
        ALLOW_SYSTEM_KEYS_FOR_USER_EXECUTION: 'false',
        ...input.runtime,
      },
      stdio: 'pipe',
      timeout: 15000,
    })
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
}
