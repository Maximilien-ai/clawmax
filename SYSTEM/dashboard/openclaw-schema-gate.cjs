// Read-only startup gate for the pinned OpenClaw agent schema.
// Maintenance stays offline/operator-owned; never repair or clear leases here.
const fs = require('node:fs')
const path = require('node:path')
const { DatabaseSync } = require('node:sqlite')
const EXPECTED_OPENCLAW_VERSION = '2026.9.7'
const EXPECTED_AGENT_SCHEMA = 24
function verifyRuntimeSchema(packageRoot) {
  const metadata = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'))
  if (metadata.version !== EXPECTED_OPENCLAW_VERSION) throw new Error('Runtime version does not match schema gate')
  const dist = path.join(packageRoot, 'dist')
  const identities = fs.readdirSync(dist).filter(name => /^openclaw-agent-db-identity-[\w-]+\.mjs$/.test(name))
  if (identities.length !== 1) throw new Error('Expected one runtime schema identity module')
  const source = fs.readFileSync(path.join(dist, identities[0]), 'utf8')
  const version = source.match(/const OPENCLAW_AGENT_SCHEMA_VERSION = (\d+);/)
  if (!version || Number(version[1]) !== EXPECTED_AGENT_SCHEMA) throw new Error('Runtime schema does not match schema gate')
}
function inspect(file) {
  try {
    const stat = fs.lstatSync(file)
    if (stat.isSymbolicLink()) throw new Error('linked inventory')
    return stat
  } catch (error) {
    if (error.code === 'ENOENT') return undefined
    throw error
  }
}

function checkSchemas(stateDir) {
  let checked = 0
  try {
    const agents = path.join(stateDir, 'agents')
    if (!inspect(agents)) return { ready: true, checked }
    for (const entry of fs.readdirSync(agents, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) throw new Error('linked agent')
      if (!entry.isDirectory()) continue
      const directory = path.join(agents, entry.name, 'agent')
      if (!inspect(directory)) continue
      const file = path.join(directory, 'openclaw-agent.sqlite')
      const stat = inspect(file)
      if (!stat) continue
      if (!stat.isFile()) throw new Error('invalid database path')
      const db = new DatabaseSync(file, { readOnly: true })
      try {
        const version = db.prepare('PRAGMA user_version').get().user_version
        const metadata = db.prepare("SELECT schema_version FROM schema_meta WHERE meta_key = 'primary'").get()
        if (version !== EXPECTED_AGENT_SCHEMA || metadata?.schema_version !== EXPECTED_AGENT_SCHEMA) {
          return { ready: false, checked, code: 'agent_schema_maintenance_required' }
        }
        checked++
      } finally { db.close() }
    }
    return { ready: true, checked }
  } catch { return { ready: false, checked, code: 'agent_schema_inspection_failed' } }
}
module.exports = { checkSchemas, verifyRuntimeSchema, EXPECTED_AGENT_SCHEMA, EXPECTED_OPENCLAW_VERSION }
if (require.main === module) {
  if (process.argv[2] === '--verify-runtime') {
    verifyRuntimeSchema(process.argv[3])
    console.log('Packaged OpenClaw schema matches startup gate')
    process.exit(0)
  }
  const state = process.argv[2]
  const result = state ? checkSchemas(state) : { ready: false, code: 'state_directory_required' }
  console.log(JSON.stringify(result))
  process.exitCode = result.ready ? 0 : 1
}
