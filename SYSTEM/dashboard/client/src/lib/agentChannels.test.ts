import assert from 'assert'
import { agentChannelStatusLabel, parseTelegramOwnerIds, validateTelegramOwnerIds } from './agentChannels'

assert.deepStrictEqual(parseTelegramOwnerIds('123, 456\n123'), ['123', '456'])
assert.strictEqual(validateTelegramOwnerIds('123, 456'), null)
assert(validateTelegramOwnerIds('123, @owner')?.includes('@owner'))
assert.strictEqual(agentChannelStatusLabel({ configured: false, enabled: false, bound: false }), 'Not connected')
assert.strictEqual(agentChannelStatusLabel({ configured: false, enabled: false, bound: true }), 'Binding exists, account missing')
assert.strictEqual(agentChannelStatusLabel({ configured: true, enabled: false, bound: true }), 'Configured, disabled')
assert.strictEqual(agentChannelStatusLabel({ configured: true, enabled: true, bound: false }), 'Connected, not bound')
assert.strictEqual(agentChannelStatusLabel({ configured: true, enabled: true, bound: true }), 'Connected and bound')

console.log('Agent channel presentation tests passed')
