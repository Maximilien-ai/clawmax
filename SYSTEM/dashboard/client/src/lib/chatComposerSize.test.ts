import assert from 'assert'
import { readChatComposerExpanded, saveChatComposerExpanded } from './chatComposerSize'

const values = new Map<string, string>()
const storage = {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => { values.set(key, value) },
}

assert.strictEqual(readChatComposerExpanded(storage), false, 'a first visit starts compact')
saveChatComposerExpanded(true, storage)
assert.strictEqual(readChatComposerExpanded(storage), true, 'expanding persists for the next chat panel')
saveChatComposerExpanded(false, storage)
assert.strictEqual(readChatComposerExpanded(storage), false, 'collapsing persists too')
assert.strictEqual(readChatComposerExpanded(null), false, 'unavailable storage starts compact')

const blockedStorage = {
  getItem: (_key: string): string | null => { throw new Error('storage blocked') },
  setItem: (_key: string, _value: string): void => { throw new Error('storage blocked') },
}
assert.strictEqual(readChatComposerExpanded(blockedStorage), false, 'blocked storage starts compact')
assert.doesNotThrow(() => saveChatComposerExpanded(true, blockedStorage), 'blocked storage must not prevent resizing')

console.log('Chat composer size preference tests passed')
