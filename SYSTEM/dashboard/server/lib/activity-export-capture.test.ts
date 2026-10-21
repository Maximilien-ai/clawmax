import assert from 'node:assert/strict'
import fs from 'fs'
import path from 'path'
import { captureConsentedActivity } from './activity-export-capture'

const input = { source: 'agent-chat' as const, workspaceId: '/synthetic/workspace', userId: 'synthetic-user', occurredAt: '2026-09-29T00:00:00Z', content: 'synthetic-private-content' }
let observed: unknown
assert.deepEqual(captureConsentedActivity(input, value => { observed = value; return [] }), [])
assert.equal(observed, input, 'preserve the original turn identity, workspace and occurrence time')
const warnings: unknown[] = []
const warn = console.warn
try {
  console.warn = value => warnings.push(value)
  assert.deepEqual(captureConsentedActivity(input, () => { throw new Error(input.content) }), [])
  assert(!JSON.stringify(warnings).includes(input.content), 'do not leak content through error details')
} finally { console.warn = warn }
const chat = fs.readFileSync(path.join(__dirname, '../routes/chat.ts'), 'utf8')
assert.equal((chat.match(/occurredAt: new Date\(chatStartedAt\).toISOString\(\)/g) || []).length, 2, 'both runtimes bind capture to turn start, not completion')
assert(!chat.includes('const activityWorkspaceId = getWorkspacePath()'), 'do not capture against a later active workspace')
console.log('Activity capture failure, redaction and turn-boundary tests passed')
