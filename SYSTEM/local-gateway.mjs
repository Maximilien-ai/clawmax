// Local OpenClaw Gateway for the dashboard: start.sh runs `ensure`, stop.sh runs `stop`.
//
// Chat replies stream only through a Gateway; `openclaw agent --local` prints a reply once it has
// finished. `ensure` reuses a Gateway already answering on the configured port, starts an installed
// OpenClaw Gateway service, or else starts a loopback-only Gateway that ClawMax owns and records.
// It writes openclaw.json only to add a missing gateway section (what setup.sh writes: mode local and
// a random token), after a backup, atomically and owner-only. It never changes an existing gateway
// section and never installs an OS service. Whenever it cannot provide a Gateway, chat keeps its
// non-streaming local path. `stop` ends only the Gateway this script started.
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawn, execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const DEFAULT_PORT = 18789
const READY_TIMEOUT_MS = 60_000
const BUSY_PORT_WAIT_MS = 15_000
// A concurrent start records its pid within a second of claiming; an older claim without one was abandoned.
const ABANDONED_CLAIM_MS = 30_000
// A Gateway started here runs chat turns the way `openclaw agent --local` did before it: no schedules,
// heartbeats or dreaming, no channel connections, no LAN (mDNS) announcement, and a stable pid so
// `stop` can find it. An installed Gateway service keeps its own settings.
export const MANAGED_GATEWAY_ENV = { OPENCLAW_SKIP_CRON: '1', OPENCLAW_SKIP_CHANNELS: '1', OPENCLAW_DISABLE_BONJOUR: '1', OPENCLAW_NO_RESPAWN: '1' }
// It also runs agent turns and their tools, so like the dashboard's own agent processes (safe-env.ts)
// it gets an allowlisted environment, never the whole shell's, and never a Gateway credential.
const GATEWAY_ENV_KEYS = new Set(['PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL', 'TERM', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TMPDIR', 'TZ',
  'XDG_CONFIG_HOME', 'NODE_ENV', 'NODE_EXTRA_CA_CERTS', 'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'http_proxy', 'https_proxy', 'no_proxy',
  'GITHUB_TOKEN', 'GH_TOKEN', 'RESEND_API_KEY', 'COGNEE_API_KEY', 'COGNEE_BASE_URL', 'COGNEE_DATASET_NAME', 'COGNEE_SEARCH_TYPE'])
export function managedGatewayEnv(env, port) {
  const kept = Object.entries(env).filter(([key, value]) => value !== undefined
    && (GATEWAY_ENV_KEYS.has(key) || (key.startsWith('OPENCLAW_') && !/^OPENCLAW_GATEWAY_(TOKEN|PASSWORD)$/.test(key))))
  return { ...Object.fromEntries(kept), OPENCLAW_GATEWAY_PORT: String(port), ...MANAGED_GATEWAY_ENV }
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const say = (mark, message) => console.log(`${mark} ${message}`)
const fallback = 'chat replies will appear when they finish'
const firstLine = error => String(error?.message || error).split('\n')[0]

export function resolvePaths(env = process.env) {
  const stateDir = env.OPENCLAW_STATE_DIR?.trim()
  const config = env.OPENCLAW_CONFIG_PATH?.trim()
    || (stateDir ? path.join(stateDir, 'openclaw.json') : path.join(env.HOME || os.homedir(), '.openclaw', 'openclaw.json'))
  const dir = path.dirname(config)
  return { config, owner: path.join(dir, 'clawmax-gateway.json'), log: path.join(dir, 'logs', 'clawmax-gateway.log') }
}

function readConfig(configPath) {
  let raw = null
  try { raw = fs.readFileSync(configPath, 'utf8') } catch (error) { if (error.code !== 'ENOENT') throw error }
  const config = raw === null ? {} : JSON.parse(raw)
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('not a JSON object')
  return { raw, config }
}

/** Adds the gateway section setup.sh writes, unless one exists. Throws, changing nothing, when it cannot. */
export function ensureGatewaySection(configPath, now = new Date()) {
  const { raw, config } = readConfig(configPath)
  if (config.gateway !== undefined) return { config, added: false }
  // OpenClaw merges root keys over `$include`d files, so a root section would override a gateway
  // configured in one of them.
  if (config.$include !== undefined) throw new Error('it uses $include, which may already configure the Gateway')
  config.gateway = { mode: 'local', auth: { token: crypto.randomBytes(32).toString('hex') } }
  // Write through a symlinked config (a dotfiles checkout) instead of replacing the link; keep the
  // backup beside the link, out of that checkout.
  const target = raw === null ? configPath : fs.realpathSync(configPath)
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 })
  const backup = raw === null ? undefined : `${configPath}.clawmax-backup-${now.toISOString().replace(/[:.]/g, '-')}`
  if (backup) fs.writeFileSync(backup, raw, { mode: 0o600, flag: 'wx' })
  const temp = `${target}.clawmax-${process.pid}-${crypto.randomBytes(4).toString('hex')}.tmp`
  const fd = fs.openSync(temp, 'wx', 0o600)
  try { fs.writeFileSync(fd, `${JSON.stringify(config, null, 2)}\n`); fs.fsyncSync(fd) } finally { fs.closeSync(fd) }
  let current = null
  try { current = fs.readFileSync(target, 'utf8') } catch (error) { if (error.code !== 'ENOENT') current = undefined }
  if (current !== raw) {
    fs.rmSync(temp, { force: true })
    throw new Error('it changed while the gateway section was being added')
  }
  fs.renameSync(temp, target)
  return { config, added: true, backup }
}

function gatewayPort(config) {
  const port = Number(config.gateway?.port)
  return Number.isInteger(port) && port > 0 ? port : DEFAULT_PORT
}

function resolveCli(env) {
  const executable = file => { try { fs.accessSync(file, fs.constants.X_OK); return fs.statSync(file).isFile() } catch { return false } }
  if (env.OPENCLAW_BIN && executable(env.OPENCLAW_BIN)) return env.OPENCLAW_BIN
  return (env.PATH || '').split(path.delimiter).filter(Boolean).map(dir => path.join(dir, 'openclaw')).find(executable) || null
}

function portOpen(port) {
  return new Promise(resolve => {
    const socket = net.connect({ port, host: '127.0.0.1' })
    const done = open => { socket.destroy(); resolve(open) }
    socket.setTimeout(1000, () => done(false))
    socket.once('connect', () => done(true))
    socket.once('error', () => done(false))
  })
}

/** An authenticated round trip with this config's token: the check the dashboard itself depends on. */
async function answers(cli, env, port) {
  try {
    const health = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(2000) })
    if (!health.ok) return false
    execFileSync(cli, ['gateway', 'call', 'health', '--json', '--timeout', '5000'], { env, timeout: 15_000, stdio: 'pipe' })
    return true
  } catch { return false }
}

async function waitReady({ cli, env, port, alive, timeoutMs }) {
  for (const deadline = Date.now() + timeoutMs; ; await delay(500)) {
    if (alive && !alive()) return 'exited'
    if (await portOpen(port) && await answers(cli, env, port)) return 'ready'
    if (Date.now() >= deadline) return 'timeout'
  }
}

/** Whether an OpenClaw Gateway service (LaunchAgent, systemd unit) is installed. Throws when unknown. */
function serviceInstalled(cli, env) {
  const status = JSON.parse(execFileSync(cli, ['gateway', 'status', '--json', '--no-probe'], { env, timeout: 20_000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }))
  return Boolean(status?.service?.command)
}

function processLine(pid) {
  try { return execFileSync('ps', ['-o', 'lstart=,command=', '-p', String(pid)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() } catch { return '' }
}

function readOwner(ownerPath) {
  try { return JSON.parse(fs.readFileSync(ownerPath, 'utf8')) } catch { return null }
}

/** The recorded Gateway is still that process: same pid, same start time, still an OpenClaw Gateway. */
function ownedAlive(record) {
  const line = Number.isInteger(record?.pid) && record.pid > 1 ? processLine(record.pid) : ''
  return Boolean(record?.started) && line.startsWith(record.started) && /openclaw-gateway|openclaw.*\bgateway run\b/.test(line)
}

export async function stopOwned(paths) {
  const record = readOwner(paths.owner)
  if (!record) {
    // A claim abandoned before its pid was recorded.
    try { if (Date.now() - fs.statSync(paths.owner).mtimeMs > ABANDONED_CLAIM_MS) fs.rmSync(paths.owner, { force: true }) } catch { /* none */ }
    return false
  }
  if (ownedAlive(record)) {
    const signal = name => { try { process.kill(-record.pid, name) } catch { try { process.kill(record.pid, name) } catch { /* gone */ } } }
    signal('SIGTERM')
    for (let i = 0; i < 100 && ownedAlive(record); i++) await delay(100)
    if (ownedAlive(record)) signal('SIGKILL')
    say('✓', `Stopped the OpenClaw Gateway ClawMax started (pid ${record.pid})`)
  }
  fs.rmSync(paths.owner, { force: true })
  return true
}

export async function ensure(env = process.env, { readyTimeoutMs = READY_TIMEOUT_MS, busyPortWaitMs = BUSY_PORT_WAIT_MS } = {}) {
  const paths = resolvePaths(env)
  if (env.CLAWMAX_AUTO_START_GATEWAY === 'false') {
    await stopOwned(paths)
    return say('ℹ', `Gateway auto-start is off (CLAWMAX_AUTO_START_GATEWAY=false); ${fallback}`)
  }
  // Brokered skills receive their per-turn broker credentials in the environment of a `--local` run;
  // tools running inside a Gateway never see them. Keep CLI-only chat where the broker is configured.
  if (env.CLAWMAX_SECRET_BROKER_CONFIGURED === 'true') {
    await stopOwned(paths)
    return say('ℹ', `The workspace secret broker is configured and brokered skills need CLI-only chat, so ClawMax does not start a Gateway; ${fallback}`)
  }
  // A profile or OPENCLAW_HOME moves OpenClaw's default state directory away from the config the
  // dashboard and this script read; configuring either one would then change the wrong file.
  const profile = env.OPENCLAW_PROFILE?.trim()
  if (!env.OPENCLAW_CONFIG_PATH?.trim() && !env.OPENCLAW_STATE_DIR?.trim() && ((profile && profile !== 'default') || env.OPENCLAW_HOME?.trim())) {
    return say('⚠', `OPENCLAW_PROFILE or OPENCLAW_HOME selects another OpenClaw state directory than ${paths.config}; not configuring a Gateway, ${fallback}`)
  }
  const cli = resolveCli(env)
  if (!cli) return say('⚠', `OpenClaw CLI not found; ${fallback}`)
  let config
  try { ({ config } = readConfig(paths.config)) } catch (error) {
    return say('⚠', `Could not read ${paths.config} (${firstLine(error)}); leaving it unchanged, ${fallback}`)
  }

  const port = gatewayPort(config)
  const cliEnv = { ...env, OPENCLAW_GATEWAY_PORT: String(port) }
  let owned = readOwner(paths.owner)
  if (owned && (!ownedAlive(owned) || owned.cli !== cli || owned.port !== port)) {
    // Gone, or started from another OpenClaw binary or port: replace it with a current Gateway.
    await stopOwned(paths)
    owned = null
  }
  // A Gateway service installed since (setup.sh, `openclaw gateway install`) takes the port back: it
  // runs the schedules and channels the Gateway ClawMax started leaves off.
  if (owned && (() => { try { return serviceInstalled(cli, cliEnv) } catch { return false } })()) {
    await stopOwned(paths)
    owned = null
  }
  const report = (outcome, pid) => {
    const log = pid ? ` Log: ${paths.log}` : ''
    if (outcome === 'ready') return say('✓', `OpenClaw Gateway ready on 127.0.0.1:${port}${pid ? ` (pid ${pid}, started by ClawMax)` : ''}; chat replies stream live.${log}`)
    if (outcome === 'exited') return say('⚠', `The OpenClaw Gateway exited during startup; ${fallback}.${log}`)
    return say('⚠', `The OpenClaw Gateway is not answering yet; chat replies will stream once it does.${log}`)
  }

  if (await portOpen(port)) {
    if (config.gateway === undefined) return say('⚠', `Port ${port} is in use and ${paths.config} has no gateway section; leaving both alone, ${fallback}`)
    // Possibly still booting (an installed service, or one started by a previous run).
    const outcome = await waitReady({ cli, env: cliEnv, port, alive: owned ? () => ownedAlive(owned) : undefined, timeoutMs: owned ? readyTimeoutMs : busyPortWaitMs })
    if (outcome === 'ready') return say('✓', `Using the OpenClaw Gateway ${owned ? `ClawMax started (pid ${owned.pid})` : 'already running'} on 127.0.0.1:${port}; chat replies stream live`)
    if (owned) return report(outcome, owned.pid)
    return say('⚠', `Port ${port} is in use by a process that does not accept ${paths.config}'s Gateway token; ${fallback}`)
  }

  if (config.gateway === undefined) {
    try {
      const added = ensureGatewaySection(paths.config)
      config = added.config
      say('✓', `Added a local Gateway section to ${paths.config}${added.backup ? ` (previous file kept as ${added.backup})` : ''}`)
    } catch (error) {
      return say('⚠', `Could not add a Gateway section to ${paths.config} (${firstLine(error)}); ${fallback}`)
    }
  }
  const gateway = config.gateway
  if (gateway?.mode === 'remote') return say('ℹ', `${paths.config} uses a remote Gateway; not starting a local one`)
  if (gateway?.mode !== 'local') return say('⚠', `${paths.config} has a gateway section without mode "local", so OpenClaw will not start it; ${fallback}`)
  if (!gateway.auth?.token) return say('⚠', `${paths.config} has no gateway.auth.token for the dashboard to authenticate with; ${fallback}`)

  let installed
  try { installed = serviceInstalled(cli, cliEnv) } catch (error) {
    return say('⚠', `Could not check for an installed OpenClaw Gateway service (${firstLine(error)}); not starting a second Gateway, ${fallback}`)
  }
  if (installed) {
    say('↻', 'Starting the installed OpenClaw Gateway service...')
    try { execFileSync(cli, ['gateway', 'start'], { env: cliEnv, timeout: 60_000, stdio: 'pipe' }) } catch (error) {
      return say('⚠', `openclaw gateway start failed (${firstLine(error)}); ${fallback}`)
    }
    return report(await waitReady({ cli, env: cliEnv, port, timeoutMs: readyTimeoutMs }))
  }

  // Claim ownership before starting, so concurrent starts cannot both launch a Gateway. A claim that
  // never got its record (a start interrupted before it recorded the pid) is cleared, not waited on.
  let claim
  for (let attempt = 0; claim === undefined; attempt++) {
    try { claim = fs.openSync(paths.owner, 'wx', 0o600) } catch (error) {
      if (error.code !== 'EEXIST') return say('⚠', `Could not record the Gateway ClawMax starts (${firstLine(error)}); ${fallback}`)
      const other = readOwner(paths.owner)
      let age = 0
      try { age = Date.now() - fs.statSync(paths.owner).mtimeMs } catch { /* removed meanwhile */ }
      if (attempt === 0 && !other?.pid && age > ABANDONED_CLAIM_MS) {
        fs.rmSync(paths.owner, { force: true })
        continue
      }
      return report(await waitReady({ cli, env: cliEnv, port, alive: other?.pid ? () => ownedAlive(other) : undefined, timeoutMs: readyTimeoutMs }))
    }
  }
  say('↻', `Starting a local OpenClaw Gateway on 127.0.0.1:${port}...`)
  let child
  try {
    fs.mkdirSync(path.dirname(paths.log), { recursive: true, mode: 0o700 })
    const log = fs.openSync(paths.log, 'a', 0o600)
    // Loopback only, whatever the config says about Tailscale serve/funnel (a runtime override).
    child = spawn(cli, ['gateway', 'run', '--bind', 'loopback', '--tailscale', 'off', '--port', String(port)], {
      env: managedGatewayEnv(env, port), cwd: path.dirname(paths.config), detached: true, stdio: ['ignore', log, log],
    })
    fs.closeSync(log)
  } catch (error) {
    fs.closeSync(claim)
    fs.rmSync(paths.owner, { force: true })
    return say('⚠', `Could not start a local OpenClaw Gateway (${firstLine(error)}); ${fallback}`)
  }
  let exited = !child.pid
  child.once('exit', () => { exited = true })
  child.once('error', () => { exited = true })
  child.unref()
  let started = ''
  for (let i = 0; i < 20 && child.pid && !started && !exited; i++) {
    started = processLine(child.pid).slice(0, 24)
    if (!started) await delay(50)
  }
  fs.writeFileSync(claim, `${JSON.stringify({ pid: child.pid, started, port, cli })}\n`)
  fs.closeSync(claim)
  const outcome = await waitReady({ cli, env: cliEnv, port, alive: () => !exited, timeoutMs: readyTimeoutMs })
  if (outcome === 'exited') fs.rmSync(paths.owner, { force: true })
  report(outcome, child.pid)
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const command = process.argv[2]
  const run = command === 'ensure' ? ensure() : command === 'stop' ? stopOwned(resolvePaths()) : null
  if (!run) {
    console.error('usage: local-gateway.mjs ensure|stop')
    process.exitCode = 2
  } else {
    // Never block or fail the dashboard over its optional Gateway.
    run.catch(error => say('⚠', `Local Gateway ${command} failed: ${firstLine(error)}; ${fallback}`))
  }
}
