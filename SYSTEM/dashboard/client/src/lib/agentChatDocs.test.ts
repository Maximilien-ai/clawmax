import assert from 'assert'
import { resolveAgentChatDocPath } from './agentChatDocs'

function run() {
  const docEntries = [
    { path: 'AGENTS/newsletter-summarizer/AIPositioningBrief.md' },
    { path: 'AGENTS/newsletter-summarizer/briefs/ScopedBrief.md' },
    { path: 'WORKFLOWS/outputs/final-review/AIPositioningBrief.md' },
    { path: 'AGENTS/archive/newsletter-summarizer/OldBrief.md' },
  ]

  assert.strictEqual(
    resolveAgentChatDocPath('AIPositioningBrief.md', 'newsletter-summarizer', docEntries),
    'AGENTS/newsletter-summarizer/AIPositioningBrief.md'
  )

  assert.strictEqual(
    resolveAgentChatDocPath('OldBrief.md', 'newsletter-summarizer', docEntries),
    'AGENTS/archive/newsletter-summarizer/OldBrief.md'
  )

  assert.strictEqual(
    resolveAgentChatDocPath('ScopedBrief.md', 'newsletter-summarizer', docEntries),
    'AGENTS/newsletter-summarizer/briefs/ScopedBrief.md'
  )

  assert.strictEqual(
    resolveAgentChatDocPath('WORKFLOWS/outputs/final-review/AIPositioningBrief.md', 'newsletter-summarizer', docEntries),
    'WORKFLOWS/outputs/final-review/AIPositioningBrief.md'
  )

  assert.strictEqual(
    resolveAgentChatDocPath('MissingBrief.md', 'newsletter-summarizer', docEntries),
    null
  )

  console.log('agentChatDocs.test.ts: 5 tests passed')
}

run()
