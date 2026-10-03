// Read-only qualification for a stopped runtime. This does not stop services,
// migrate databases, delete leases, or authorize an image rollback.
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')

function summarize(result, expectedAgents = []) {
  if (result.error || result.signal || result.status !== 0) return { ready: false, code: 'sqlite_preflight_failed' }
  let report
  try { report = JSON.parse(result.stdout) } catch { return { ready: false, code: 'sqlite_preflight_invalid_report' } }
  const totals = report?.totals
  if (report?.mode !== 'validate' || !Array.isArray(report.targets) ||
      !Number.isSafeInteger(totals?.targets) || totals.targets < 0 ||
      !Number.isSafeInteger(totals?.issues) || totals.issues < 0 ||
      totals.targets !== report.targets.length) return { ready: false, code: 'sqlite_preflight_invalid_report' }
  const inspected = new Set(report.targets.map(target => target?.agentId))
  if (expectedAgents.some(id => !inspected.has(id))) return { ready: false, code: 'sqlite_preflight_inventory_incomplete', expectedTargets: expectedAgents.length, targets: totals.targets }
  return { ready: totals.issues === 0, code: totals.issues ? 'sqlite_preflight_requires_maintenance' : 'sqlite_preflight_validated',
    targets: totals.targets, issues: totals.issues }
}

function discoverAgents(stateDir) {
  const agentsDir = path.join(stateDir, 'agents')
  if (!fs.existsSync(agentsDir)) return []
  if (fs.lstatSync(agentsDir).isSymbolicLink()) throw new Error('Unsupported inventory path')
  return fs.readdirSync(agentsDir, { withFileTypes: true }).flatMap(entry => {
    if (entry.isSymbolicLink()) throw new Error('Unsupported inventory path')
    if (!entry.isDirectory()) return []
    const agentDir = path.join(agentsDir, entry.name, 'agent')
    if (fs.existsSync(agentDir) && fs.lstatSync(agentDir).isSymbolicLink()) throw new Error('Unsupported inventory path')
    return fs.existsSync(path.join(agentDir, 'openclaw-agent.sqlite')) ? [entry.name] : []
  })
}

function preflight(run = spawnSync, binary = process.env.OPENCLAW_BIN || 'openclaw', stateDir = process.env.OPENCLAW_STATE_DIR || path.join(os.homedir(), '.openclaw')) {
  let expectedAgents
  try { expectedAgents = discoverAgents(stateDir) } catch { return { ready: false, code: 'sqlite_preflight_inventory_unreadable' } }
  return summarize(run(binary, ['doctor', '--session-sqlite', 'validate', '--session-sqlite-all-agents', '--json'], {
    encoding: 'utf8', timeout: 420000, maxBuffer: 8 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  }), expectedAgents)
}

module.exports = { summarize, preflight, discoverAgents }
if (require.main === module) {
  const result = preflight()
  console.log(JSON.stringify(result))
  process.exitCode = result.ready ? 0 : 1
}
