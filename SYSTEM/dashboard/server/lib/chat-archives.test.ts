import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  getArchiveTitleMessages,
  isArchiveSessionFile,
  isMeaningfulArchiveTitleTurn,
  isUsableArchiveTitle,
  parseArchiveTimestamp,
  stripArchiveTitleNoise,
} from './chat-archives'

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
  await test('isArchiveSessionFile excludes trajectory artifacts and sessions index files', () => {
    assert.equal(isArchiveSessionFile('chat-session.jsonl'), true)
    assert.equal(isArchiveSessionFile('chat-session.trajectory.jsonl'), false)
    assert.equal(isArchiveSessionFile('sessions.json'), false)
  })

  await test('parseArchiveTimestamp prefers a valid suffixed timestamp', () => {
    assert.equal(parseArchiveTimestamp('agent_1781888896343.jsonl', '/tmp/missing.jsonl'), 1781888896343)
  })

  await test('parseArchiveTimestamp falls back to prefixed timestamps and then file metadata', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chat-archives-'))
    const filePath = path.join(tmpDir, '0-agent-dashboard-chat.jsonl')
    fs.writeFileSync(filePath, '[]', 'utf-8')
    const statTime = fs.statSync(filePath).mtimeMs
    const parsed = parseArchiveTimestamp(path.basename(filePath), filePath)
    assert(parsed >= statTime, 'Expected file metadata fallback for invalid timestamp prefixes')
  })

  await test('stripArchiveTitleNoise removes injected runtime prefixes', () => {
    assert.equal(stripArchiveTitleNoise('Conversation context for this single-turn execution: Please continue deployment work'), 'Please continue deployment work')
    assert.equal(stripArchiveTitleNoise('User: Summarize the repository history'), 'Summarize the repository history')
  })

  await test('isMeaningfulArchiveTitleTurn rejects runtime-only/archive-noise turns', () => {
    assert.equal(isMeaningfulArchiveTitleTurn({
      role: 'assistant',
      content: 'Conversation context for this single-turn execution:',
    }), false)
    assert.equal(isMeaningfulArchiveTitleTurn({
      role: 'user',
      content: 'Please continue the deployment checklist',
    }), true)
  })

  await test('getArchiveTitleMessages prefers real user intent over runtime noise', () => {
    const messages = getArchiveTitleMessages([
      { role: 'assistant', content: 'Conversation context for this single-turn execution:' },
      { role: 'user', content: 'User: Please continue the deployment checklist' },
    ])
    assert.deepStrictEqual(messages, [
      { role: 'user', content: 'Please continue the deployment checklist' },
    ])
  })

  await test('isUsableArchiveTitle rejects empty and noisy cached titles', () => {
    assert.equal(isUsableArchiveTitle(''), false)
    assert.equal(isUsableArchiveTitle('Empty conversation'), false)
    assert.equal(isUsableArchiveTitle('Conversation context for this single-turn execution:'), false)
    assert.equal(isUsableArchiveTitle('Please continue the deployment checklist'), true)
  })
}

void main()
