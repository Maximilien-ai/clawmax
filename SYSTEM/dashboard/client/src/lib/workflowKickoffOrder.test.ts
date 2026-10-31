import assert from 'assert'
import { kickoffFirst } from './workflowKickoffOrder'
const rows = [
  { name: 'Build Playbooks', dependsOn: ['kickoff'] },
  { name: 'Assemble Cadence', dependsOn: [] },
  { name: 'Company · Team / Kickoff Personal Operations', dependsOn: [] },
  { name: 'Other · Team Kick Off', dependsOn: [] },
  { name: 'Review kickoff results', dependsOn: ['build'] },
]
const snapshot = JSON.stringify(rows)
const ordered = kickoffFirst(rows)
assert.deepStrictEqual(ordered.map(row => row.name), [rows[2].name, rows[3].name, rows[0].name, rows[1].name, rows[4].name])
assert.equal(JSON.stringify(rows), snapshot)
assert.strictEqual(ordered[2], rows[0])
assert.deepStrictEqual(kickoffFirst([]), [])
assert.deepStrictEqual(kickoffFirst(rows.slice(0, 2)), rows.slice(0, 2))
console.log('Kickoff ordering: stable grouping, prefixed names, dependency preservation and empty input passed')
