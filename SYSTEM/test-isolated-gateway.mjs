import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import crypto from 'node:crypto'
import { spawn, execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const system = path.dirname(fileURLToPath(import.meta.url))
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
async function reservePort(port = 0) {
  const server = net.createServer()
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve) })
  const selected = server.address().port
  await new Promise(resolve => server.close(resolve))
  return selected
}
async function stop(child) {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return
  try { process.kill(-child.pid, 'SIGTERM') } catch { return }
  for (let i = 0; i < 30 && child.exitCode === null && child.signalCode === null; i++) await delay(100)
  if (child.exitCode === null && child.signalCode === null) {
    try { process.kill(-child.pid, 'SIGKILL') } catch { /* exited */ }
  }
}
async function main() {
  // Never reuse or kill an installed Dashboard on these ports.
  await reservePort(Number(process.env.DASHBOARD_PORT || 3001))
  await reservePort(Number(process.env.DASHBOARD_CLIENT_PORT || 5173))
  const binary = process.env.OPENCLAW_BIN || execFileSync('bash', [path.join(system, 'prepare-openclaw-target.sh'), '--print-bin'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim()
  // SQLite reports physical paths. Keep config, registry and workspace paths
  // identical to those identities (not /var aliases of /private/var on macOS),
  // or native canonical-session admission can repeatedly validate another key.
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-test-runtime-')))
  const state = path.join(root, 'state')
  const workspace = path.join(root, 'workspace')
  fs.mkdirSync(state, { mode: 0o700 })
  fs.mkdirSync(workspace)
  const port = await reservePort()
  const token = crypto.randomBytes(32).toString('hex')
  const config = path.join(state, 'openclaw.json')
  const env = { ...process.env, OPENCLAW_BIN: binary, OPENCLAW_STATE_DIR: state,
    OPENCLAW_CONFIG_PATH: config, OPENCLAW_WORKSPACE: workspace,
    CLAWMAX_WORKSPACE_REGISTRY_PATH: path.join(root, 'registry.json'),
    CLAWMAX_SYSTEM_TEST_WORKSPACE: path.join(root, 'system-test-workspace'),
    OPENCLAW_GATEWAY_TOKEN: token, OPENCLAW_GATEWAY_PORT: String(port),
    OPENCLAW_NO_RESPAWN: '1', OPENCLAW_SKIP_CHANNELS: '1', OPENCLAW_DISABLE_BONJOUR: '1',
    CLAWMAX_TEST_ISOLATED_GATEWAY: 'true', CLAWMAX_TEST_KEEP_SERVER: 'false',
    CLAWMAX_TEST_REUSE_SERVER: 'false', CLAWMAX_SKIP_GATEWAY_BOOTSTRAP: 'true' }
  delete env.OPENCLAW_PROFILE
  // This override bypasses workspace selection entirely; never give it to a
  // live multi-workspace server or integration runner.
  delete env.CLAWMAX_TEST_WORKSPACE
  const packageRoot = path.resolve(path.dirname(binary), '../src')
  if (fs.existsSync(path.join(packageRoot, 'package.json'))) env.OPENCLAW_PACKAGE_ROOT = packageRoot
  fs.writeFileSync(config, JSON.stringify({
    gateway: { mode: 'local', port, bind: 'loopback', auth: { mode: 'token', token }, controlUi: { enabled: false } },
    logging: { file: path.join(root, 'gateway.log') },
    plugins: { enabled: true, allow: ['openai'], entries: { openai: { enabled: true } } }, browser: { enabled: false }, cron: { enabled: false },
    // Exercise native API-key execution, not an installed Codex login/runtime
    // selected implicitly by newer OpenClaw releases for OpenAI models.
    agents: { defaults: { workspace, heartbeat: { every: '0m' },
      models: { 'openai/*': { agentRuntime: { id: 'openclaw' } } },
    }, entries: {} },
  }), { mode: 0o600 })
  let gateway, runner, interrupted = false
  const cancel = () => { interrupted = true; void stop(runner); void stop(gateway) }
  process.on('SIGINT', cancel); process.on('SIGTERM', cancel)
  const log = fs.openSync(path.join(root, 'gateway-process.log'), 'w', 0o600)
  try {
    gateway = spawn(binary, ['gateway', 'run', '--port', String(port), '--bind', 'loopback'], { env, cwd: root, detached: true, stdio: ['ignore', log, log] })
    let spawnError
    gateway.on('error', error => { spawnError = error })
    const deadline = Date.now() + 120000
    while (true) {
      if (interrupted) throw new Error('Test gateway startup cancelled')
      if (spawnError) throw spawnError
      if (gateway.exitCode !== null || gateway.signalCode !== null) throw new Error('Isolated gateway exited during startup')
      try {
        const response = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(1000) })
        if (response.ok) {
          execFileSync(binary, ['gateway', 'call', 'health', '--json', '--timeout', '5000'], { env, cwd: root, timeout: 10000, stdio: 'pipe' })
          break
        }
      } catch { /* bounded readiness retries, no host service operations */ }
      if (Date.now() >= deadline) throw new Error('Isolated gateway failed authenticated readiness within 120s')
      await delay(1000)
    }
    console.log(`Dedicated test gateway ready on 127.0.0.1:${port}; isolated workspace and registry.`)
    if (process.argv.includes('--gateway-smoke-only')) return
    runner = spawn('bash', [path.join(system, 'test-with-server.sh'), ...process.argv.slice(2)], { env, detached: true, stdio: 'inherit' })
    process.exitCode = await new Promise((resolve, reject) => { runner.once('error', reject); runner.once('exit', code => resolve(code ?? 1)) })
  } finally {
    await stop(runner); await stop(gateway)
    fs.closeSync(log)
    process.removeListener('SIGINT', cancel); process.removeListener('SIGTERM', cancel)
    // Retain private diagnostics for failed acceptance; never publish transcripts.
    console.log(`Isolated test artifacts: ${root}`)
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
