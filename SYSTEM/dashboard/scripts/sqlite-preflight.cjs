// Read-only qualification for a stopped runtime. This does not stop services,
// migrate databases, delete leases, or authorize an image rollback.
const { spawnSync } = require('node:child_process')

function summarize(result) {
  if (result.error || result.signal || result.status !== 0) return { ready: false, code: 'sqlite_preflight_failed' }
  let report
  try { report = JSON.parse(result.stdout) } catch { return { ready: false, code: 'sqlite_preflight_invalid_report' } }
  const totals = report?.totals
  if (report?.mode !== 'validate' || !Array.isArray(report.targets) ||
      !Number.isSafeInteger(totals?.targets) || totals.targets < 0 ||
      !Number.isSafeInteger(totals?.issues) || totals.issues < 0 ||
      totals.targets !== report.targets.length) return { ready: false, code: 'sqlite_preflight_invalid_report' }
  return { ready: totals.issues === 0, code: totals.issues ? 'sqlite_preflight_requires_maintenance' : 'sqlite_preflight_validated',
    targets: totals.targets, issues: totals.issues }
}

function preflight(run = spawnSync, binary = process.env.OPENCLAW_BIN || 'openclaw') {
  return summarize(run(binary, ['doctor', '--session-sqlite', 'validate', '--session-sqlite-all-agents', '--json'], {
    encoding: 'utf8', timeout: 420000, maxBuffer: 8 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  }))
}

module.exports = { summarize, preflight }
if (require.main === module) {
  const result = preflight()
  console.log(JSON.stringify(result))
  process.exitCode = result.ready ? 0 : 1
}
