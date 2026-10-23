import assert from 'node:assert/strict'
import { shouldSendChatOnKeyDown } from './chatComposer'

const enter = { key: 'Enter', shiftKey: false, altKey: false, ctrlKey: false, metaKey: false }
assert.equal(shouldSendChatOnKeyDown(enter), true)
for (const modifier of ['shiftKey', 'altKey', 'ctrlKey', 'metaKey'] as const) {
  assert.equal(shouldSendChatOnKeyDown({ ...enter, [modifier]: true }), false, `${modifier}+Enter must insert a new line`)
}
assert.equal(shouldSendChatOnKeyDown({ ...enter, key: 'a' }), false)
console.log('Chat composer keyboard tests passed')
