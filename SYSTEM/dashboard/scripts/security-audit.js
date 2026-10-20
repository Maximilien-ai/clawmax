const { spawnSync } = require('node:child_process')

const DEFERRED_DEV_ADVISORY = 'GHSA-vfj7-8cjw-p6xm'
const DEFERRAL_EXPIRES_AT = Date.parse('2026-10-17T00:00:00Z')

function audit(omitDev = false) {
  const result = spawnSync('npm', ['audit', ...(omitDev ? ['--omit=dev'] : []), '--audit-level=high', '--json'], {
    cwd: process.cwd(), encoding: 'utf8',
  })
  let report
  try { report = JSON.parse(result.stdout || '{}') } catch {
    throw new Error(result.stderr || result.stdout || 'npm audit returned invalid JSON')
  }
  if (!report.vulnerabilities || !report.metadata?.vulnerabilities) {
    throw new Error(result.stderr || 'npm audit returned an incomplete report')
  }
  return { report, status: result.status }
}

function blockingAdvisories(report, productionReport, now = Date.now()) {
  const productionCounts = productionReport.metadata.vulnerabilities
  if (productionCounts.high || productionCounts.critical) {
    return ['Production dependency graph has high or critical advisories']
  }
  const blockers = []
  const visited = new Set()
  const inspect = (name) => {
    if (visited.has(name)) return
    visited.add(name)
    const vulnerability = report.vulnerabilities[name]
    if (!vulnerability) {
      blockers.push(`${name}: missing transitive advisory details`)
      return
    }
    for (const entry of vulnerability.via || []) {
      if (typeof entry === 'string') { inspect(entry); continue }
      if (entry.severity !== 'high' && entry.severity !== 'critical') continue
      const id = entry.url?.split('/').pop()
      if (id !== DEFERRED_DEV_ADVISORY || now >= DEFERRAL_EXPIRES_AT || entry.name !== 'braces') {
        blockers.push(`${name}: ${entry.severity} (${id || entry.source || 'unknown'})`)
      }
    }
  }
  for (const [name, vulnerability] of Object.entries(report.vulnerabilities)) {
    if (vulnerability.severity === 'high' || vulnerability.severity === 'critical') inspect(name)
  }
  return blockers
}

if (require.main === module) {
  try {
    const production = audit(true)
    if (production.status !== 0) throw new Error('Production dependency audit failed')
    const full = audit()
    const blockers = blockingAdvisories(full.report, production.report)
    if (blockers.length) throw new Error(`High/critical dependency advisories:\n${blockers.map(item => `- ${item}`).join('\n')}`)
    if (full.status !== 0) {
      console.log(`Internal RC development dependency exception: ${DEFERRED_DEV_ADVISORY}; Dashboard team review by 2026-10-17 UTC. Production high/critical count: 0.`)
    } else {
      console.log('Dependency audit passed with zero High/Critical advisories.')
    }
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}

module.exports = { blockingAdvisories, DEFERRED_DEV_ADVISORY, DEFERRAL_EXPIRES_AT }
