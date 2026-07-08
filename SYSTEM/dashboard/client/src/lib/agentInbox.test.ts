/**
 * Agent inbox helper tests
 *
 * Run with: npx ts-node --transpileOnly client/src/lib/agentInbox.test.ts
 */

import { appendAgentInboxAttachmentContext, buildAgentInboxDisplayMessage, buildAgentInboxTargetPath } from './agentInbox'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

const tests: Array<{ name: string; run: () => void }> = []

function test(name: string, run: () => void) {
  tests.push({ name, run })
}

test('builds the default agent inbox path', () => {
  assert(buildAgentInboxTargetPath('mango-lead') === 'AGENTS/mango-lead/INBOX', 'Expected default inbox path')
})

test('appends optional inbox subdirectories', () => {
  assert(
    buildAgentInboxTargetPath('mango-lead', 'follow-up/april') === 'AGENTS/mango-lead/INBOX/follow-up/april',
    'Expected nested inbox subdirectory path',
  )
})

test('builds a user-facing message with uploaded inbox paths', () => {
  const text = buildAgentInboxDisplayMessage('Please review these.', [
    { name: 'brief.md', isImage: false, uploadedPath: 'AGENTS/mango-lead/INBOX/brief.md' },
  ])
  assert(text.includes('Inbox files:'), 'Expected inbox files heading')
  assert(text.includes('AGENTS/mango-lead/INBOX/brief.md'), 'Expected uploaded path in display message')
})

test('builds an execution message with uploaded inbox paths and snippets', () => {
  const text = appendAgentInboxAttachmentContext('', [
    {
      name: 'brief.md',
      isImage: false,
      uploadedPath: 'AGENTS/mango-lead/INBOX/brief.md',
      contextSnippet: 'sales brief summary',
    },
  ])
  assert(text.startsWith('Please review the attached inbox files.'), 'Expected fallback instruction')
  assert(text.includes('Agent inbox files:'), 'Expected agent inbox section')
  assert(text.includes('Context: sales brief summary'), 'Expected inline text snippet')
})

let passed = 0
for (const entry of tests) {
  entry.run()
  passed += 1
  console.log(`✓ ${entry.name}`)
}

console.log(`agentInbox.test.ts: ${passed} tests passed`)
