import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-gateway-runner-test-'))
const script = fileURLToPath(new URL('./test-isolated-gateway.mjs', import.meta.url))
fs.mkdirSync(path.join(root, 'bin'))
fs.mkdirSync(path.join(root, 'src'))
fs.writeFileSync(path.join(root, 'src/package.json'), '{}')
const binary = path.join(root, 'bin/openclaw')
fs.writeFileSync(binary, `#!/usr/bin/env node
const fs = require('node:fs');
if (process.argv[3] === 'call') process.exit(0);
if (process.argv[3] !== 'run') process.exit(7);
const config = JSON.parse(fs.readFileSync(process.env.OPENCLAW_CONFIG_PATH));
if (fs.realpathSync(process.env.OPENCLAW_STATE_DIR) !== process.env.OPENCLAW_STATE_DIR) process.exit(13);
if (!process.env.CLAWMAX_WORKSPACE_REGISTRY_PATH || config.cron.enabled !== false || process.env.CLAWMAX_TEST_WORKSPACE) process.exit(8);
if (config.agents.defaults.models['openai/*'].agentRuntime.id !== 'openclaw') process.exit(12);
if (process.env.CLAWMAX_SYSTEM_TEST_WORKSPACE !== require('node:path').join(require('node:path').dirname(process.env.CLAWMAX_WORKSPACE_REGISTRY_PATH), 'system-test-workspace')) process.exit(11);
if (process.env.OPENCLAW_PACKAGE_ROOT !== require('node:path').resolve(require('node:path').dirname(process.argv[1]), '../src')) process.exit(10);
require('node:http').createServer((req,res) => res.end('{}')).listen(config.gateway.port, '127.0.0.1');
`, { mode: 0o700 })
async function run(extra = {}) {
  const child = spawn(process.execPath, [script, '--gateway-smoke-only'], { env: { ...process.env, OPENCLAW_BIN: binary, DASHBOARD_PORT: '0', DASHBOARD_CLIENT_PORT: '0', ...extra } })
  let output = ''
  child.stdout.on('data', data => { output += data }); child.stderr.on('data', data => { output += data })
  const code = await new Promise(resolve => child.once('exit', resolve))
  const artifact = output.match(/Isolated test artifacts: (.*)/)?.[1]
  if (artifact) {
    assert(path.basename(artifact).startsWith('clawmax-test-runtime-'))
    assert.equal(artifact, fs.realpathSync(artifact), 'Runtime paths must use the physical directory identity')
    fs.rmSync(artifact, { recursive: true, force: true })
  }
  return { code, output }
}
try {
  assert.equal((await run({ CLAWMAX_TEST_WORKSPACE: '/must-not-leak', CLAWMAX_SYSTEM_TEST_WORKSPACE: '/must-not-delete' })).code, 0)
  fs.mkdirSync(path.join(root, 'physical-tmp'))
  fs.symlinkSync(path.join(root, 'physical-tmp'), path.join(root, 'aliased-tmp'), 'dir')
  const aliased = await run({ TMPDIR: path.join(root, 'aliased-tmp') })
  assert.equal(aliased.code, 0, aliased.output)
  assert.match(fs.readFileSync(new URL('./test.sh', import.meta.url), 'utf8'), /SYSTEM_TEST_WS_PATH="\$\{CLAWMAX_SYSTEM_TEST_WORKSPACE:-/)
  const occupied = net.createServer()
  await new Promise(resolve => occupied.listen(0, '127.0.0.1', resolve))
  try { assert.notEqual((await run({ DASHBOARD_PORT: String(occupied.address().port) })).code, 0) }
  finally { await new Promise(resolve => occupied.close(resolve)) }
  fs.writeFileSync(binary, '#!/bin/sh\nexit 9\n')
  const failed = await run()
  assert.notEqual(failed.code, 0)
  assert.match(failed.output, /exited during startup/)
  console.log('Isolated gateway startup, occupied-port and failure cleanup checks passed')
} finally { fs.rmSync(root, { recursive: true, force: true }) }
