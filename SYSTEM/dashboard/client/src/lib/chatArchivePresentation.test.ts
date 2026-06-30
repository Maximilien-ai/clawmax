import assert from 'node:assert/strict'
import {
  canRestoreChatArchive,
  formatChatArchiveTimestamp,
  getChatArchiveTitle,
  isCurrentChatArchive,
} from './chatArchivePresentation'

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
  await test('isCurrentChatArchive detects active archives and current-prefixed filenames', () => {
    assert.equal(isCurrentChatArchive({
      active: true,
      filename: 'ignored.jsonl',
    }), true)
    assert.equal(isCurrentChatArchive({
      active: false,
      filename: 'current:agent-dashboard-session',
    }), true)
    assert.equal(isCurrentChatArchive({
      active: false,
      filename: '1781888896343-agent-dashboard.jsonl',
    }), false)
  })

  await test('canRestoreChatArchive rejects current conversations and allows archived sessions', () => {
    assert.equal(canRestoreChatArchive({
      active: true,
      filename: 'current:agent-dashboard-session',
    }), false)
    assert.equal(canRestoreChatArchive({
      active: false,
      filename: '1781888896343-agent-dashboard.jsonl',
    }), true)
  })

  await test('formatChatArchiveTimestamp guards invalid timestamps', () => {
    assert.equal(formatChatArchiveTimestamp(0), 'Unknown date')
    assert.equal(formatChatArchiveTimestamp(Number.NaN), 'Unknown date')
  })

  await test('getChatArchiveTitle falls back for blank titles', () => {
    assert.equal(getChatArchiveTitle({ title: '  ' }), 'Untitled conversation')
    assert.equal(getChatArchiveTitle({ title: 'Previous repo summary' }), 'Previous repo summary')
  })
}

void main()
