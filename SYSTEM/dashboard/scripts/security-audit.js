const { spawnSync } = require('node:child_process')

// gray-matter 4 uses js-yaml.safeLoad, which is removed in js-yaml 4. The
// OpenClaw skill parser must be upgraded before this transitive exception can
// be removed. All other high/critical advisories remain build blockers.
const allowed = new Set(['GHSA-5p4m-2wfm-xmqj'])
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
      if (!allowed.has(id)) blockers.push(`${name}: ${entry.severity} (${id})`)
    }
  }
}

if (blockers.length > 0) {
  console.error('High/critical dependency advisories:')
  blockers.forEach((item) => console.error(`- ${item}`))
  process.exit(1)
}

if (result.status !== 0) {
  console.warn('Known dependency advisory remains temporarily allowlisted: GHSA-5p4m-2wfm-xmqj (js-yaml via gray-matter).')
  console.warn('Remove this exception after the OpenClaw/gray-matter safeLoad compatibility fix.')
}

console.log('Dependency audit passed (with documented temporary exception, if present).')
