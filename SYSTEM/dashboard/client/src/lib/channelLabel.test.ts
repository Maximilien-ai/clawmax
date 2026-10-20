import assert from 'assert'
import { channelLabel } from './channelLabel'
const group = { name: 'tr-stable-group-id', displayName: 'Daily Operations' }
assert.equal(channelLabel(group), 'Daily Operations')
assert.equal(group.name, 'tr-stable-group-id')
assert.equal(channelLabel({ name: 'Community', displayName: '  ' }), 'Community')
assert.equal(channelLabel({ name: 'Community', displayName: 1 }), 'Community')
assert.equal(channelLabel({ name: 'Community' }), 'Community')
console.log('Channel labels: readable names and stable IDs passed')
