import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import crypto from 'node:crypto'
import { spawn, execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const system = path.dirname(fileURLToPath(import.meta.url))
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
export function isolatedEnv(root, binary, settings) {
  const env = {}
  for (const name of ['PATH', 'TMPDIR', 'LANG', 'LC_ALL', 'TERM']) {
    if (process.env[name]) env[name] = process.env[name]
  }
  return { ...env, HOME: path.join(root, 'home'), OPENCLAW_BIN: binary,
    OPENCLAW_STATE_DIR: path.join(root, 'home', '.openclaw'),
    OPENCLAW_CONFIG_PATH: path.join(root, 'home', '.openclaw', 'openclaw.json'),
    OPENCLAW_WORKSPACE: path.join(root, 'source', 'WORKSPACES', 'default'),
    CLAWMAX_WORKSPACE_REGISTRY_PATH: path.join(root, 'registry.json'),
    OPENCLAW_GATEWAY_TOKEN: settings.token, OPENCLAW_GATEWAY_PORT: String(settings.gatewayPort),
    OPENCLAW_NO_RESPAWN: '1', OPENCLAW_DISABLE_BONJOUR: '1',
    CLAWMAX_SKIP_GATEWAY_BOOTSTRAP: 'true',
    DASHBOARD_HOST: '127.0.0.1', DASHBOARD_PORT: String(settings.apiPort),
    DASHBOARD_CLIENT_PORT: String(settings.clientPort),
    DASHBOARD_APP_URL: `http://localhost:${settings.clientPort}`,
    CLAWMAX_VERSION: `2.0.0-test-rc94-review.${settings.sha?.slice(0, 8) || 'local'}`,
    DASHBOARD_AUTH_MODE: 'bypass', BYPASS_OAUTH: 'true' }
}
async function freePort(port = 0) {
  const server = net.createServer()
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve) })
  const selected = server.address().port
  await new Promise(resolve => server.close(resolve))
  return selected
}
export async function stop(child) {
  if (!child?.pid) return
  // Descendants can remain even after their shell exits. Always stop the group.
  try { process.kill(-child.pid, 'SIGTERM') } catch { return }
  await delay(1000)
  try { process.kill(-child.pid, 'SIGKILL') } catch { /* group exited */ }
}
async function main() {
  const args = process.argv.slice(2)
  if (args.includes('--help')) {
    console.log('Usage: ./SYSTEM/local-dev.sh [--root /absolute/existing-dev-root]\nCreates an isolated committed-source snapshot. Ctrl-C stops Dashboard and Gateway.\nReuse the printed --root command to retain local agents and settings. Defaults: API 3005, UI 5178.')
    return
  }
  if (args.length && (args.length !== 2 || args[0] !== '--root' || !path.isAbsolute(args[1]))) throw new Error('Use --help for supported arguments')
  const reuse = args.length === 2
  const root = reuse ? fs.realpathSync(args[1]) : fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-local-dev-')))
  fs.chmodSync(root, 0o700)
  const manifest = path.join(root, 'local-dev.json')
  const settings = reuse ? JSON.parse(fs.readFileSync(manifest, 'utf8')) : {
    apiPort: Number(process.env.DASHBOARD_PORT || 3005), clientPort: Number(process.env.DASHBOARD_CLIENT_PORT || 5178),
    gatewayPort: await freePort(), token: crypto.randomBytes(32).toString('hex'),
    sha: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: system, encoding: 'utf8' }).trim(),
  }
  for (const port of [settings.apiPort, settings.clientPort, settings.gatewayPort]) await freePort(port)
  if (new Set([settings.apiPort, settings.clientPort, settings.gatewayPort]).size !== 3) throw new Error('All three ports must differ')
  const source = path.join(root, 'source')
  if (!reuse) {
    fs.mkdirSync(source)
    // Only committed public files; never copy .env, credentials or workspaces.
    const archive = path.join(root, 'source.tar')
    execFileSync('git', ['archive', '--format=tar', `--output=${archive}`, settings.sha], { cwd: path.dirname(system) })
    execFileSync('tar', ['-xf', archive, '-C', source])
    fs.unlinkSync(archive)
    fs.mkdirSync(path.join(root, 'home', '.openclaw'), { recursive: true, mode: 0o700 })
    fs.writeFileSync(manifest, JSON.stringify(settings), { mode: 0o600 })
  }
  console.log(`Local dev root: ${root}\nSource: ${settings.sha}\nRestart: ./SYSTEM/local-dev.sh --root ${root}\nStop: Ctrl-C (stops this Dashboard and Gateway).`)
  const binary = process.env.OPENCLAW_BIN || execFileSync('bash', [path.join(system, 'prepare-openclaw-target.sh'), '--print-bin'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim()
  const env = isolatedEnv(root, binary, settings)
  const packageRoot = path.resolve(path.dirname(binary), '../src')
  if (fs.existsSync(path.join(packageRoot, 'package.json'))) env.OPENCLAW_PACKAGE_ROOT = packageRoot
  if (!reuse) fs.writeFileSync(env.OPENCLAW_CONFIG_PATH, JSON.stringify({
    gateway: { mode: 'local', port: settings.gatewayPort, bind: 'loopback', auth: { mode: 'token', token: settings.token }, controlUi: { enabled: false } },
    logging: { file: path.join(root, 'gateway.log') },
    agents: { defaults: { workspace: env.OPENCLAW_WORKSPACE, models: { 'openai/*': { agentRuntime: { id: 'openclaw' } } } }, entries: {} },
  }), { mode: 0o600 })
  let runner, gateway, interrupted = false, gatewayFailed = false
  const cancel = () => { interrupted = true; void stop(runner); void stop(gateway) }
  process.on('SIGINT', cancel); process.on('SIGTERM', cancel)
  const run = async (command, argv) => {
    runner = spawn(command, argv, { env, cwd: source, detached: true, stdio: 'inherit' })
    const code = await new Promise((resolve, reject) => { runner.once('error', reject); runner.once('exit', (code, signal) => resolve(signal ? 1 : code)) })
    if (interrupted) throw new Error('Local dev stopped')
    if (gatewayFailed) throw new Error(`Gateway exited; inspect ${root}/gateway-process.log`)
    if (code !== 0) throw new Error(`${command} exited with ${code}`)
  }
  const log = fs.openSync(path.join(root, 'gateway-process.log'), 'a', 0o600)
  try {
    console.log('Preparing isolated checkout (first run can take several minutes).')
    await run('bash', [path.join(source, 'setup.sh'), '--non-interactive'])
    gateway = spawn(binary, ['gateway', 'run', '--port', String(settings.gatewayPort), '--bind', 'loopback'], { env, cwd: root, detached: true, stdio: ['ignore', log, log] })
    let spawnError
    gateway.once('error', error => { spawnError = error })
    const deadline = Date.now() + 120000
    while (true) {
      if (interrupted) throw new Error('Local dev stopped')
      if (spawnError) throw spawnError
      if (gateway.exitCode !== null || gateway.signalCode !== null) throw new Error(`Gateway exited; inspect ${root}/gateway-process.log`)
      try {
        const response = await fetch(`http://127.0.0.1:${settings.gatewayPort}/health`, { signal: AbortSignal.timeout(1000) })
        if (response.ok) {
          execFileSync(binary, ['gateway', 'call', 'health', '--json', '--timeout', '5000'], { env, timeout: 10000, stdio: 'pipe' })
          break
        }
      } catch { /* wait for authenticated readiness */ }
      if (Date.now() >= deadline) throw new Error(`Gateway readiness timed out; inspect ${root}/gateway-process.log`)
      await delay(1000)
    }
    gateway.once('exit', () => { gatewayFailed = true; void stop(runner) })
    console.log(`Isolated Gateway ready. Dashboard: http://localhost:${settings.clientPort}`)
    await run('bash', [path.join(source, 'SYSTEM', 'start.sh'), '--follow'])
  } finally {
    await stop(runner); await stop(gateway); fs.closeSync(log)
    process.removeListener('SIGINT', cancel); process.removeListener('SIGTERM', cancel)
    console.log(`Local dev stopped. Data retained in ${root}`)
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1 })
