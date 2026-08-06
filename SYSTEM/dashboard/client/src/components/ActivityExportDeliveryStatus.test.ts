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

console.log('ActivityExportDeliveryStatus.test.ts: 6 assertions passed')
