import assert from 'node:assert/strict'
import { sortChatArchivesForDisplay } from './chatArchivePresentation'

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn()
    console.log(`✓ ${name}`)
  } catch (error) {
    console.error(`✗ ${name}`)
    throw error
  }
}

async function main() {
  await test('sortChatArchivesForDisplay keeps current conversation first even when its timestamp is older', () => {
    const ordered = sortChatArchivesForDisplay([
      { active: false, filename: '200-agent-dashboard-chat.jsonl', timestamp: 200 },
      { active: true, filename: 'current:restore-agent', timestamp: 100 },
      { active: false, filename: '150-agent-dashboard-chat.jsonl', timestamp: 150 },
    ])

    assert.deepStrictEqual(
      ordered.map((archive) => archive.filename),
      ['current:restore-agent', '200-agent-dashboard-chat.jsonl', '150-agent-dashboard-chat.jsonl']
    )
  })

  await test('sortChatArchivesForDisplay keeps archived rows newest-first after the current conversation', () => {
    const ordered = sortChatArchivesForDisplay([
      { active: false, filename: '100-agent-dashboard-chat.jsonl', timestamp: 100 },
      { active: false, filename: '300-agent-dashboard-chat.jsonl', timestamp: 300 },
      { active: false, filename: '200-agent-dashboard-chat.jsonl', timestamp: 200 },
    ])

    assert.deepStrictEqual(
      ordered.map((archive) => archive.filename),
      ['300-agent-dashboard-chat.jsonl', '200-agent-dashboard-chat.jsonl', '100-agent-dashboard-chat.jsonl']
    )
  })
}

void main()
