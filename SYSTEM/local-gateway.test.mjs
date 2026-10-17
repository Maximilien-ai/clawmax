import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import net from 'node:net'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { ensure, ensureGatewaySection, resolvePaths, stopOwned } from './local-gateway.mjs'

const script = fileURLToPath(new URL('./local-gateway.mjs', import.meta.url))
const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-local-gateway-test-')))
const fake = path.join(root, 'bin', 'openclaw')
fs.mkdirSync(path.dirname(fake))
// A stand-in for the OpenClaw CLI: `gateway run` serves /health plus a token-checked call, the way
// the real Gateway authenticates `gateway call health`; `gateway start` plays an installed service.
fs.writeFileSync(fake, `#!/usr/bin/env node
const fs = require('node:fs'), http = require('node:http'), { spawn } = require('node:child_process')
const [command, sub] = process.argv.slice(2)
// The Gateway gets an allowlisted environment, so its controls live in HOME rather than in FAKE_* variables.
const record = entry => fs.appendFileSync(require('node:path').join(process.env.HOME, 'fake.log'), JSON.stringify(entry) + '\\n')
const configPath = process.env.OPENCLAW_CONFIG_PATH || require('node:path').join(process.env.HOME, '.openclaw', 'openclaw.json')
const config = () => { try { return JSON.parse(fs.readFileSync(configPath, 'utf8')) } catch { return {} } }
const port = () => Number(process.env.OPENCLAW_GATEWAY_PORT || config().gateway?.port || 18789)
if (command !== 'gateway') process.exit(64)
if (sub === 'status') {
  if (process.env.FAKE_STATUS_FAIL) process.exit(1)
  console.log(JSON.stringify({ service: { command: process.env.FAKE_SERVICE ? { programArguments: ['openclaw', 'gateway'] } : null } }))
} else if (sub === 'start') {
  record({ sub })
  const child = spawn(process.execPath, [__filename, 'gateway', 'run', '--port', String(port())], { detached: true, stdio: 'ignore' })
  fs.writeFileSync(process.env.FAKE_SERVICE_PID, String(child.pid))
  child.unref()
} else if (sub === 'run') {
  const args = process.argv.slice(4)
  const flags = ['OPENCLAW_SKIP_CRON', 'OPENCLAW_SKIP_CHANNELS', 'OPENCLAW_DISABLE_BONJOUR', 'OPENCLAW_NO_RESPAWN']
  const leaked = ['SHELL_ONLY_SECRET', 'OPENCLAW_GATEWAY_TOKEN', 'BYPASS_OAUTH'].filter(key => process.env[key] !== undefined)
  record({ sub, args, env: Object.fromEntries(flags.map(key => [key, process.env[key]])), leaked })
  if (fs.existsSync(require('node:path').join(process.env.HOME, 'fake-run-exit'))) process.exit(3)
  process.title = 'openclaw-gateway'
  const token = config().gateway?.auth?.token
  http.createServer((req, res) => {
    if (req.url === '/health') return res.end('{"ok":true}')
    res.statusCode = token && req.headers['x-token'] === token ? 200 : 401
    res.end()
  }).listen(Number(args[args.indexOf('--port') + 1]), '127.0.0.1')
} else if (sub === 'call') {
  http.get({ host: '127.0.0.1', port: port(), path: '/call', headers: { 'x-token': config().gateway?.auth?.token || '' } },
    res => process.exit(res.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))
} else process.exit(64)
`, { mode: 0o755 })

const sandboxes = []
const foreign = []
after(async () => {
  for (const box of sandboxes) {
    await stopOwned(box.paths)
    try { process.kill(-Number(fs.readFileSync(box.env.FAKE_SERVICE_PID, 'utf8')), 'SIGKILL') } catch { /* no service started */ }
  }
  for (const child of foreign) child.kill('SIGKILL')
  if (path.basename(root).startsWith('clawmax-local-gateway-test-')) fs.rmSync(root, { recursive: true, force: true })
})

function sandbox(config, extra = {}) {
  const dir = path.join(root, `home-${sandboxes.length}`)
  fs.mkdirSync(path.join(dir, '.openclaw'), { recursive: true, mode: 0o700 })
  const env = { PATH: process.env.PATH, HOME: dir, OPENCLAW_BIN: fake, FAKE_SERVICE_PID: path.join(dir, 'service.pid'), ...extra }
  const box = { dir, env, paths: resolvePaths(env) }
  if (config !== undefined) fs.writeFileSync(box.paths.config, typeof config === 'string' ? config : JSON.stringify(config, null, 2), { mode: 0o600 })
  sandboxes.push(box)
  return box
}
const freePort = () => new Promise(resolve => { const server = net.createServer().listen(0, '127.0.0.1', () => { const { port } = server.address(); server.close(() => resolve(port)) }) })
const fakeCalls = (box, sub) => { try { return fs.readFileSync(path.join(box.dir, 'fake.log'), 'utf8').trim().split('\n').map(line => JSON.parse(line)).filter(entry => entry.sub === sub) } catch { return [] } }
// Gateways started in-process stay this process's children; a killed one is a zombie until reaped.
const alive = pid => { const ps = spawnSync('ps', ['-o', 'stat=', '-p', String(pid)], { encoding: 'utf8' }); return ps.status === 0 && !ps.stdout.trim().startsWith('Z') }
const mode = file => fs.statSync(file).mode & 0o777
const backups = box => fs.readdirSync(path.dirname(box.paths.config)).filter(name => name.includes('.clawmax-backup-'))
async function run(box, options = { readyTimeoutMs: 10_000, busyPortWaitMs: 300 }) {
  const lines = []
  const original = console.log
  console.log = line => lines.push(String(line))
  try { await ensure(box.env, options) } finally { console.log = original }
  return lines.join('\n')
}
const configured = port => ({ agents: { list: [{ id: 'main' }] }, gateway: { mode: 'local', port, auth: { token: 'a'.repeat(64) } } })

test('a fresh install gets the gateway section setup.sh writes, owner-only and without a backup', () => {
  const box = sandbox(undefined)
  fs.rmSync(path.dirname(box.paths.config), { recursive: true })
  const { added, backup } = ensureGatewaySection(box.paths.config)
  assert.equal(added, true)
  assert.equal(backup, undefined)
  const written = JSON.parse(fs.readFileSync(box.paths.config, 'utf8'))
  assert.deepEqual(Object.keys(written), ['gateway'])
  assert.equal(written.gateway.mode, 'local')
  assert.match(written.gateway.auth.token, /^[0-9a-f]{64}$/)
  assert.equal(mode(box.paths.config), 0o600)
  assert.equal(mode(path.dirname(box.paths.config)), 0o700)
})

test('an upgrade keeps every existing setting, backs the file up first, and repeats as a no-op', () => {
  const original = { agents: { defaults: { heartbeat: { every: '30m' } }, list: [{ id: 'main' }] }, cron: { enabled: true }, channels: { telegram: { enabled: true } } }
  const box = sandbox(original)
  const before = fs.readFileSync(box.paths.config, 'utf8')
  const first = ensureGatewaySection(box.paths.config, new Date('2026-10-15T00:00:00Z'))
  assert.equal(first.added, true)
  assert.equal(fs.readFileSync(first.backup, 'utf8'), before, 'Expected a byte-for-byte backup of the previous file')
  assert.equal(mode(first.backup), 0o600)
  const written = JSON.parse(fs.readFileSync(box.paths.config, 'utf8'))
  const { gateway, ...rest } = written
  assert.deepEqual(rest, original, 'Expected no existing setting to change')
  assert.deepEqual(Object.keys(gateway).sort(), ['auth', 'mode'])
  const afterFirst = fs.readFileSync(box.paths.config, 'utf8')
  assert.equal(ensureGatewaySection(box.paths.config).added, false)
  assert.equal(fs.readFileSync(box.paths.config, 'utf8'), afterFirst, 'Expected a repeated start to leave the config untouched')
  assert.equal(backups(box).length, 1, 'Expected no second backup')
  assert.equal(fs.readdirSync(path.dirname(box.paths.config)).filter(name => name.endsWith('.tmp')).length, 0)
})

test('an existing gateway section, an unreadable config and a symlinked config are handled without damage', () => {
  for (const gateway of [{ mode: 'remote', remote: { url: 'wss://example.invalid' } }, { port: 19001 }, { mode: 'local', auth: { mode: 'password' } }]) {
    const box = sandbox({ gateway })
    const before = fs.readFileSync(box.paths.config, 'utf8')
    assert.equal(ensureGatewaySection(box.paths.config).added, false)
    assert.equal(fs.readFileSync(box.paths.config, 'utf8'), before, 'Expected an existing gateway section to stay byte-identical')
    assert.equal(backups(box).length, 0)
  }
  const included = sandbox({ $include: './gateway.json5', agents: {} })
  const includedBefore = fs.readFileSync(included.paths.config, 'utf8')
  assert.throws(() => ensureGatewaySection(included.paths.config), /\$include/)
  assert.equal(fs.readFileSync(included.paths.config, 'utf8'), includedBefore, 'Expected a root $include config to stay untouched')

  const invalid = sandbox('{ "agents": { /* JSON5 */ } }')
  assert.throws(() => ensureGatewaySection(invalid.paths.config))
  assert.equal(fs.readFileSync(invalid.paths.config, 'utf8'), '{ "agents": { /* JSON5 */ } }')
  assert.equal(backups(invalid).length, 0)

  const linked = sandbox(undefined)
  const real = path.join(linked.dir, 'dotfiles-openclaw.json')
  fs.writeFileSync(real, '{"agents":{}}', { mode: 0o600 })
  fs.symlinkSync(real, linked.paths.config)
  assert.equal(ensureGatewaySection(linked.paths.config).added, true)
  assert(fs.lstatSync(linked.paths.config).isSymbolicLink(), 'Expected the symlink to survive')
  assert.equal(backups(linked).length, 1, 'Expected the backup beside the link, not in the linked checkout')
  assert.equal(fs.readdirSync(linked.dir).filter(name => name.includes('.clawmax-backup-')).length, 0)
  assert.equal(JSON.parse(fs.readFileSync(real, 'utf8')).gateway.mode, 'local')
})

test('ensure starts one loopback Gateway without background jobs, reuses it, and stop ends only it', async () => {
  const port = await freePort()
  // Agent tools run inside the Gateway: shell secrets and Gateway credentials must not reach it.
  const box = sandbox(configured(port), { SHELL_ONLY_SECRET: 'x', OPENCLAW_GATEWAY_TOKEN: 'y', BYPASS_OAUTH: 'true' })
  const before = fs.readFileSync(box.paths.config, 'utf8')
  assert.match(await run(box), /ready on 127\.0\.0\.1:\d+ \(pid \d+, started by ClawMax\); chat replies stream live/)
  const [started] = fakeCalls(box, 'run')
  assert.deepEqual(started.args, ['--bind', 'loopback', '--tailscale', 'off', '--port', String(port)])
  assert.deepEqual(started.env, { OPENCLAW_SKIP_CRON: '1', OPENCLAW_SKIP_CHANNELS: '1', OPENCLAW_DISABLE_BONJOUR: '1', OPENCLAW_NO_RESPAWN: '1' })
  assert.deepEqual(started.leaked, [], 'Expected an allowlisted Gateway environment')
  assert.equal(fs.readFileSync(box.paths.config, 'utf8'), before, 'Expected a configured install to keep its config untouched')
  const owner = JSON.parse(fs.readFileSync(box.paths.owner, 'utf8'))
  assert.equal(mode(box.paths.owner), 0o600)
  assert(alive(owner.pid))

  assert.match(await run(box), /Using the OpenClaw Gateway ClawMax started/)
  assert.equal(fakeCalls(box, 'run').length, 1, 'Expected a repeated start to reuse the running Gateway')

  assert.equal(await stopOwned(box.paths), true)
  assert(!alive(owner.pid), 'Expected stop to end the Gateway ClawMax started')
  assert(!fs.existsSync(box.paths.owner))
  assert.equal(await stopOwned(box.paths), false, 'Expected a second stop to do nothing')
})

const defaultPortBusy = await new Promise(resolve => {
  const socket = net.connect({ port: 18789, host: '127.0.0.1' })
  socket.once('connect', () => { socket.destroy(); resolve(true) })
  socket.once('error', () => resolve(false))
})
test('a fresh install without any OpenClaw config streams on the default port and is reused on the next start', { skip: defaultPortBusy && 'port 18789 is in use on this machine' }, async () => {
  const box = sandbox(undefined)
  fs.rmSync(path.dirname(box.paths.config), { recursive: true })
  const output = await run(box)
  assert.match(output, /Added a local Gateway section/)
  // Ready means the Gateway accepted the token ensure had just written.
  assert.match(output, /ready on 127\.0\.0\.1:18789 \(pid \d+, started by ClawMax\)/)
  assert.deepEqual(fakeCalls(box, 'run')[0].args, ['--bind', 'loopback', '--tailscale', 'off', '--port', '18789'])
  assert.equal(mode(box.paths.config), 0o600)
  assert.match(await run(box), /Using the OpenClaw Gateway ClawMax started/)
  assert.equal(fakeCalls(box, 'run').length, 1)
  assert.equal(await stopOwned(box.paths), true)
})

test('a dead, replaced or abandoned ownership record never blocks the next start', async () => {
  const gone = spawn(process.execPath, ['-e', '0'])
  await new Promise(resolve => gone.once('exit', resolve))
  const dead = sandbox(configured(await freePort()))
  fs.writeFileSync(dead.paths.owner, JSON.stringify({ pid: gone.pid, started: 'Thu Jan  1 00:00:00 1970', port: 1, cli: fake }))
  assert.match(await run(dead), /started by ClawMax/)
  assert.notEqual(JSON.parse(fs.readFileSync(dead.paths.owner, 'utf8')).pid, gone.pid)

  // Started from another OpenClaw binary (a pin upgrade): replaced, not reused.
  const upgraded = sandbox(configured(await freePort()))
  await run(upgraded)
  const first = JSON.parse(fs.readFileSync(upgraded.paths.owner, 'utf8'))
  fs.writeFileSync(upgraded.paths.owner, JSON.stringify({ ...first, cli: '/previous/openclaw' }))
  assert.match(await run(upgraded), /Stopped the OpenClaw Gateway ClawMax started[\s\S]*started by ClawMax/)
  assert(!alive(first.pid))
  assert.equal(fakeCalls(upgraded, 'run').length, 2)

  // A claim a start never completed (interrupted before recording its pid) is cleared once stale...
  const abandoned = sandbox(configured(await freePort()))
  fs.writeFileSync(abandoned.paths.owner, '')
  const longAgo = new Date(Date.now() - 120_000)
  fs.utimesSync(abandoned.paths.owner, longAgo, longAgo)
  assert.match(await run(abandoned), /started by ClawMax/)
  const stopped = sandbox(configured(await freePort()))
  fs.writeFileSync(stopped.paths.owner, '')
  fs.utimesSync(stopped.paths.owner, longAgo, longAgo)
  assert.equal(await stopOwned(stopped.paths), false)
  assert(!fs.existsSync(stopped.paths.owner), 'Expected stop to clear an abandoned claim')

  // ...while a fresh one belongs to a concurrent start, whose Gateway is awaited instead of duplicated.
  const concurrent = sandbox(configured(await freePort()))
  fs.writeFileSync(concurrent.paths.owner, '')
  assert.match(await run(concurrent, { readyTimeoutMs: 500, busyPortWaitMs: 300 }), /not answering yet/)
  assert.equal(fakeCalls(concurrent, 'run').length, 0)
})

const realCli = process.env.CLAWMAX_TEST_OPENCLAW_BIN || process.env.OPENCLAW_BIN
test('the real OpenClaw CLI reports installed services in the shape ensure reads', { skip: !realCli && 'set OPENCLAW_BIN to check the real CLI' }, () => {
  const home = path.join(root, 'real-cli-home')
  fs.mkdirSync(home)
  const status = spawnSync(realCli, ['gateway', 'status', '--json', '--no-probe'], {
    env: { PATH: process.env.PATH, HOME: home, OPENCLAW_STATE_DIR: path.join(home, '.openclaw'), OPENCLAW_CONFIG_PATH: path.join(home, '.openclaw', 'openclaw.json') },
    encoding: 'utf8', timeout: 60_000,
  })
  assert.equal(status.status, 0, status.stderr)
  const service = JSON.parse(status.stdout).service
  assert(service && 'command' in service, 'Expected service.command in `openclaw gateway status --json`')
  assert.equal(service.command, null, 'Expected no installed service for an empty HOME')
})

test('an installed Gateway service is started through OpenClaw, never duplicated, and never stopped by ClawMax', async () => {
  const port = await freePort()
  const box = sandbox(configured(port), { FAKE_SERVICE: '1' })
  assert.match(await run(box), /ready on 127\.0\.0\.1/)
  assert.equal(fakeCalls(box, 'start').length, 1)
  assert.equal(fakeCalls(box, 'run').length, 1, 'Expected only the service-started Gateway')
  assert(!fs.existsSync(box.paths.owner), 'Expected no ClawMax ownership of a service Gateway')
  const servicePid = Number(fs.readFileSync(box.env.FAKE_SERVICE_PID, 'utf8'))
  assert.match(await run(box), /Using the OpenClaw Gateway already running/)
  assert.equal(await stopOwned(box.paths), false)
  assert(alive(servicePid), 'Expected stop to leave the service Gateway running')

  // A service installed after ClawMax started its own Gateway takes the port back on the next start.
  const later = sandbox(configured(await freePort()))
  await run(later)
  const ours = JSON.parse(fs.readFileSync(later.paths.owner, 'utf8')).pid
  later.env.FAKE_SERVICE = '1'
  assert.match(await run(later), /Stopped the OpenClaw Gateway ClawMax started[\s\S]*Starting the installed OpenClaw Gateway service[\s\S]*ready on/)
  assert(!alive(ours))
  assert(!fs.existsSync(later.paths.owner))
  assert.equal(fakeCalls(later, 'start').length, 1)
})

test('busy ports, foreign records, failed starts and unusable configs leave chat on its local path', async () => {
  // A foreign listener on the configured port: no start, no change.
  const port = await freePort()
  const listener = net.createServer().listen(port, '127.0.0.1')
  await new Promise(resolve => listener.once('listening', resolve))
  const busy = sandbox(configured(port))
  assert.match(await run(busy), /in use by a process that does not accept/)
  assert.equal(fakeCalls(busy, 'run').length, 0)
  listener.close()

  // An owner record whose pid now belongs to another process is never signalled: not a non-Gateway
  // process with the recorded start time, not a Gateway that started at another time.
  const stale = sandbox(configured(await freePort()))
  const sleeper = spawn('sleep', ['30'], { detached: true, stdio: 'ignore' })
  const otherGateway = spawn(fake, ['gateway', 'run', '--port', String(await freePort())], { env: stale.env, detached: true, stdio: 'ignore' })
  foreign.push(sleeper, otherGateway)
  const startTime = pid => spawnSync('ps', ['-o', 'lstart=', '-p', String(pid)], { encoding: 'utf8' }).stdout.trim()
  for (const record of [{ pid: sleeper.pid, started: startTime(sleeper.pid) }, { pid: otherGateway.pid, started: 'Thu Jan  1 00:00:00 1970' }]) {
    fs.writeFileSync(stale.paths.owner, JSON.stringify({ ...record, port: 1, cli: fake }))
    await stopOwned(stale.paths)
    assert(alive(record.pid), `Expected pid ${record.pid} to survive stop`)
    assert(!fs.existsSync(stale.paths.owner))
  }

  const exiting = sandbox(configured(await freePort()))
  fs.writeFileSync(path.join(exiting.dir, 'fake-run-exit'), '')
  assert.match(await run(exiting), /exited during startup/)
  assert(!fs.existsSync(exiting.paths.owner))

  // A start that fails after claiming ownership releases the claim instead of blocking later starts.
  const unwritable = sandbox(configured(await freePort()))
  fs.writeFileSync(path.join(path.dirname(unwritable.paths.config), 'logs'), '')
  assert.match(await run(unwritable), /Could not start a local OpenClaw Gateway/)
  assert(!fs.existsSync(unwritable.paths.owner))

  const unknownService = sandbox(configured(await freePort()), { FAKE_STATUS_FAIL: '1' })
  assert.match(await run(unknownService), /not starting a second Gateway/)
  assert.equal(fakeCalls(unknownService, 'run').length, 0)

  for (const gateway of [{ mode: 'remote', port: await freePort(), remote: { url: 'wss://example.invalid' } }, { port: await freePort(), auth: { token: 't' } }, { mode: 'local', port: await freePort() }]) {
    const box = sandbox({ gateway })
    const before = fs.readFileSync(box.paths.config, 'utf8')
    await run(box)
    assert.equal(fakeCalls(box, 'run').length, 0, `Expected no Gateway for ${JSON.stringify(gateway)}`)
    assert.equal(fs.readFileSync(box.paths.config, 'utf8'), before)
  }

  for (const extra of [{ OPENCLAW_PROFILE: 'work' }, { OPENCLAW_HOME: '/elsewhere' }]) {
    const elsewhere = sandbox({ agents: {} }, extra)
    const before = fs.readFileSync(elsewhere.paths.config, 'utf8')
    assert.match(await run(elsewhere), /another OpenClaw state directory/)
    assert.equal(fs.readFileSync(elsewhere.paths.config, 'utf8'), before)
    assert.equal(fakeCalls(elsewhere, 'run').length, 0)
  }

  const unreadable = sandbox('{ not json')
  assert.match(await run(unreadable), /leaving it unchanged/)
  assert.equal(fs.readFileSync(unreadable.paths.config, 'utf8'), '{ not json')
})

test('CLAWMAX_AUTO_START_GATEWAY=false keeps CLI-only mode and stops a Gateway ClawMax started earlier', async () => {
  const box = sandbox(configured(await freePort()))
  await run(box)
  const { pid } = JSON.parse(fs.readFileSync(box.paths.owner, 'utf8'))
  const before = fs.readFileSync(box.paths.config, 'utf8')
  box.env.CLAWMAX_AUTO_START_GATEWAY = 'false'
  assert.match(await run(box), /auto-start is off/)
  assert(!alive(pid))
  // A configured secret broker keeps CLI-only chat too: brokered skills only work in --local runs.
  const brokered = sandbox(configured(await freePort()))
  await run(brokered)
  const brokeredPid = JSON.parse(fs.readFileSync(brokered.paths.owner, 'utf8')).pid
  brokered.env.CLAWMAX_SECRET_BROKER_CONFIGURED = 'true'
  assert.match(await run(brokered), /secret broker is configured/)
  assert(!alive(brokeredPid))
  assert.equal(fakeCalls(brokered, 'run').length, 1)

  const fresh = sandbox({ agents: {} }, { CLAWMAX_AUTO_START_GATEWAY: 'false' })
  const freshBefore = fs.readFileSync(fresh.paths.config, 'utf8')
  await run(fresh)
  assert.equal(fs.readFileSync(fresh.paths.config, 'utf8'), freshBefore, 'Expected opt-out to leave the config untouched')
  assert.equal(fs.readFileSync(box.paths.config, 'utf8'), before)
})

test('the command line wires ensure and stop and rejects anything else', async () => {
  const box = sandbox(configured(await freePort()))
  const cli = args => spawnSync(process.execPath, [script, ...args], { env: box.env, encoding: 'utf8', timeout: 60_000 })
  const started = cli(['ensure'])
  assert.equal(started.status, 0, started.stderr)
  assert.match(started.stdout, /chat replies stream live/)
  const stopped = cli(['stop'])
  assert.equal(stopped.status, 0, stopped.stderr)
  assert.match(stopped.stdout, /Stopped the OpenClaw Gateway ClawMax started/)
  assert.equal(cli(['restart']).status, 2)
})
