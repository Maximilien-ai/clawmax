import assert from 'node:assert/strict'
import test from 'node:test'
import { getChatArchiveOpenMode } from './chatArchivePresentation'

void test('getChatArchiveOpenMode returns current for active conversations and current-prefixed rows', async (t) => {
  await t.test('active conversation row', () => {
    assert.equal(
      getChatArchiveOpenMode({
        filename: '1781888896343-agent-demo-dashboard-chat--abcd1234.jsonl',
        active: true,
      }),
      'current'
    )
  })

  await t.test('synthetic current row', () => {
    assert.equal(
      getChatArchiveOpenMode({
        filename: 'current:restore-agent',
        active: false,
      }),
      'current'
    )
  })

  await t.test('archived conversation row', () => {
    assert.equal(
      getChatArchiveOpenMode({
        filename: '1781888896343-agent-demo-dashboard-chat--abcd1234.jsonl',
        active: false,
      }),
      'archive'
    )
  })
})
