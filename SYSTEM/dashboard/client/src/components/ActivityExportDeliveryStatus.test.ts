import assert from 'assert'
import fs from 'fs'
import path from 'path'

const source = fs.readFileSync(path.join(__dirname, 'ByokWizard.tsx'), 'utf8')

assert(source.includes("fetch('/api/activity-export/status')"), 'activity export UI must read delivery status from the protected route')
assert(source.includes('setInterval(refreshActivityStatus, 15000)'), 'activity export status should refresh while the partner panel is open')
assert(source.includes('Activity delivery:'), 'activity export UI must show delivery state')
assert(source.includes('No pending activity is waiting in this runtime.'), 'empty activity queues must be explicitly identified')
assert(source.includes('Delivery credentials are not configured in this dashboard runtime.'), 'missing dashboard credentials must be actionable')
assert(source.includes('Latest delivery error:'), 'retry failures must be visible without exposing credentials')
assert(source.includes('AgentForge connection code'), 'AgentForge must use a participant-entered single-use connection code')
assert(source.includes('Identity is pseudonymous'), 'AgentForge consent must disclose pseudonymous mapping')
assert(source.includes('Read the privacy notice'), 'AgentForge consent must link the configured privacy notice')
assert(source.includes("['agent-chat', 'workflow', 'builder']"), 'AgentForge launch consent must exclude group and community scopes')
assert(source.includes('Deletion request pending:'), 'receipt-linked purge retries must remain visible')

console.log('ActivityExportDeliveryStatus.test.ts: 11 assertions passed')
