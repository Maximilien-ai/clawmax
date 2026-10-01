// Read-only startup gate for the pinned OpenClaw 2026.9.5 agent schema.
// Maintenance stays offline/operator-owned; never repair or clear leases here.
const fs = require('node:fs')
const path = require('node:path')
const { DatabaseSync } = require('node:sqlite')
const EXPECTED_AGENT_SCHEMA = 21
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
module.exports = { checkSchemas, EXPECTED_AGENT_SCHEMA }
if (require.main === module) {
  const state = process.argv[2]
  const result = state ? checkSchemas(state) : { ready: false, code: 'state_directory_required' }
  console.log(JSON.stringify(result))
  process.exitCode = result.ready ? 0 : 1
}
