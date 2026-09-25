import {
  buildBulkHistoryClearPlan,
  getChannelHistoryClearEndpoint,
  getCommunicationChannelKey,
  type CommunicationBulkChannel,
} from './communicationBulkActions'
import fs from 'fs'
import path from 'path'

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const RESET = '\x1b[0m'

let testsPassed = 0
let testsFailed = 0

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`${GREEN}✓${RESET} ${name}`)
    testsPassed++
  } catch (err: any) {
    console.log(`${RED}✗${RESET} ${name}`)
    console.log(`  Error: ${err.message}`)
    testsFailed++
  }
}

console.log(`\n${YELLOW}=== Communication Bulk Actions Test Suite ===${RESET}\n`)

const channels: CommunicationBulkChannel[] = [
  { type: 'community', name: 'CW Team' },
  { type: 'group', name: 'Content Creation' },
  { type: 'group', name: 'Quality Control' },
]

test('Communication shows authored Group names but keeps resource IDs for actions', () => {
  const source = fs.readFileSync(path.join(__dirname, '../pages/Communication.tsx'), 'utf8')
  assert(source.includes('displayName: group.displayName'), 'Workspace group labels must reach channel cards')
  assert(source.includes('{channel.displayName || channel.name}'), 'Cards and lists must prefer authored names')
  assert(source.includes('encodeURIComponent(channel.name)'), 'API actions must keep immutable group IDs')
})

test('temporary chat renders Agent names while retaining Agent IDs in messages', () => {
  const source = fs.readFileSync(path.join(__dirname, '../components/GroupChatPanel.tsx'), 'utf8')
  assert(source.includes('channel.members.find(agent => agent.id === msg.from)?.name || msg.from'), 'Replies should show the selected Agent name')
})

test('getCommunicationChannelKey returns stable type-prefixed keys', () => {
  assert(getCommunicationChannelKey(channels[0]) === 'community:CW Team', 'Expected community key')
  assert(getCommunicationChannelKey(channels[1]) === 'group:Content Creation', 'Expected group key')
})

test('buildBulkHistoryClearPlan only includes selected channels', () => {
  const selected = new Set(['community:CW Team', 'group:Quality Control'])
  const plan = buildBulkHistoryClearPlan(channels, selected)
  assert(plan.length === 2, 'Expected two selected channels in clear plan')
  assert(plan[0].name === 'CW Team', 'Expected CW Team first')
  assert(plan[1].name === 'Quality Control', 'Expected Quality Control second')
})

test('getChannelHistoryClearEndpoint targets the correct clear-history routes', () => {
  assert(
    getChannelHistoryClearEndpoint({ type: 'community', name: 'CW Team' }) === '/api/communities/CW%20Team/messages',
    'Expected community clear endpoint',
  )
  assert(
    getChannelHistoryClearEndpoint({ type: 'group', name: 'Content Creation' }) === '/api/groups/Content%20Creation/messages',
    'Expected group clear endpoint',
  )
})

console.log('\n========================================')
console.log(`Tests passed: ${testsPassed}`)
console.log(`Tests failed: ${testsFailed}`)
console.log('========================================\n')

if (testsFailed > 0) {
  console.log(`${RED}Some tests failed${RESET}`)
  process.exit(1)
} else {
  console.log(`${GREEN}All tests passed${RESET}`)
}
