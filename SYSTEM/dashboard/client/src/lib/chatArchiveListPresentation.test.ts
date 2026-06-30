import assert from 'node:assert/strict'
import {
  canRestoreChatArchive,
  getChatArchiveStatusLabel,
  getChatArchiveTitle,
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
  await test('getChatArchiveStatusLabel marks current conversations only', () => {
    assert.equal(getChatArchiveStatusLabel({
      active: true,
      filename: 'current:restore-agent',
    }), 'Current')
    assert.equal(getChatArchiveStatusLabel({
      active: false,
      filename: '1781888896343-agent-dashboard-chat.jsonl',
    }), null)
  })

  await test('archive list actions treat current conversations as non-restorable', () => {
    const currentArchive = {
      active: true,
      filename: 'current:restore-agent',
      title: 'Current conversation',
    }
    const archivedConversation = {
      active: false,
      filename: '1781888896343-agent-dashboard-chat.jsonl',
      title: 'Deployment follow-up',
    }

    assert.equal(canRestoreChatArchive(currentArchive), false)
    assert.equal(canRestoreChatArchive(archivedConversation), true)
    assert.equal(getChatArchiveTitle(currentArchive), 'Current conversation')
    assert.equal(getChatArchiveTitle(archivedConversation), 'Deployment follow-up')
  })
}

void main()
