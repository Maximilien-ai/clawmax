import assert from 'assert'
import { buildAgentChatMarkdown } from './agentChatExport'

const now = new Date('2026-09-16T21:00:00Z')
const input = [
  { role: 'user' as const, content: 'Hello **GTM**', timestamp: 0 },
  { role: 'assistant' as const, content: '# Report\n\n```js\nconst x = 1\n```', timestamp: 'invalid' },
]
const result = buildAgentChatMarkdown('GTM', input, now)
assert.strictEqual(result.filename, 'GTM-chat-2026-09-16.md')
assert(result.markdown.includes('## You — 1970-01-01T00:00:00.000Z'))
assert(result.markdown.includes('## GTM\n\n# Report'))
assert(result.markdown.includes('```js\nconst x = 1\n```'))
assert(!result.markdown.includes('Invalid Date'))
assert.strictEqual(input[0].content, 'Hello **GTM**')
const redacted = buildAgentChatMarkdown('GTM', [{ role: 'user', content: 'api_key=private-value\nAuthorization: Bearer abc.def\nsk-abcdefghijklmno' }], now)
for (const secret of ['private-value', 'abc.def', 'sk-abcdefghijklmno']) assert(!redacted.markdown.includes(secret))
assert(redacted.markdown.includes('[REDACTED]'))
const longText = 'a'.repeat(12000)
assert(buildAgentChatMarkdown('GTM', [{ role: 'assistant', content: longText }], now).markdown.includes(longText))
const unsafe = buildAgentChatMarkdown('../GTM\n# heading', input, now)
assert(!unsafe.filename.includes('/'))
assert(!unsafe.filename.includes('\n'))
assert(unsafe.markdown.startsWith('# Conversation with ../GTM \\# heading'))
assert.throws(() => buildAgentChatMarkdown('GTM', [], now), /no messages/)
assert.throws(() => buildAgentChatMarkdown('GTM', [{ role: 'user', content: '  ' }], now), /no messages/)
console.log('agentChatExport.test.ts: 7 tests passed')
