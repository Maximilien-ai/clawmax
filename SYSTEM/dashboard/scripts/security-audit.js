const { spawnSync } = require('node:child_process')

const result = spawnSync('npm', ['audit', '--audit-level=high', '--json'], {
  cwd: process.cwd(),
  encoding: 'utf8',
})

let report
try {
  report = JSON.parse(result.stdout || '{}')
} catch {
  process.stderr.write(result.stderr || result.stdout || 'npm audit returned invalid JSON\n')
  process.exit(result.status || 1)
}

const blockers = []
for (const [name, advisory] of Object.entries(report.vulnerabilities || {})) {
  const entries = Array.isArray(advisory.via) ? advisory.via : []
  for (const entry of entries) {
    if (typeof entry === 'string') continue
    if (entry.severity === 'high' || entry.severity === 'critical') {
      const id = entry.url?.split('/').pop() || entry.source
      blockers.push(`${name}: ${entry.severity} (${id})`)
    }
  }
}

if (blockers.length > 0) {
  console.error('High/critical dependency advisories:')
  blockers.forEach((item) => console.error(`- ${item}`))
  process.exit(1)
}

if (result.status !== 0) {
  process.stderr.write(result.stderr || 'npm audit failed without a classified High/Critical advisory\n')
  process.exit(result.status || 1)
}

console.log('Dependency audit passed with zero High/Critical advisories.')
