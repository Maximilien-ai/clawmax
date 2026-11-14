import assert from 'assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFileSync } from 'child_process'
import { format } from 'util'
import * as messages from './messages'
import { messageStoragePath, MessageHistoryRecoveryError } from './message-storage-identity'
import { createGroup, deleteGroup } from './workspace'

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-message-identity-'))
  const previous = process.env.CLAWMAX_TEST_WORKSPACE
  const ai = require('./ai-generator')
  const originalTitle = ai.generateArchiveTitle
  ai.generateArchiveTitle = async () => 'Synthetic archive'
  let checks = 0
  function workspace(label: string) {
    const target = path.join(root, label)
    process.env.CLAWMAX_TEST_WORKSPACE = target
    fs.mkdirSync(path.join(target, 'ORG'), { recursive: true })
    return target
  }
  function catalog(target: string, type: 'group' | 'community', names: string[]) {
    const label = type === 'group' ? 'Groups' : 'Communities'
    fs.writeFileSync(path.join(target, 'ORG', `${label.toUpperCase()}.md`), `# ${label}\n\n## ${label}\n\n` + names.map(name => `### ${name}\n\n- **Description:** Synthetic\n`).join('\n'))
  }
  function freshProcess(target: string, type: string, expected: Record<string, string[]>) {
    execFileSync(process.execPath, ['-r', require.resolve('ts-node/register/transpile-only'), '-e', `
      const assert=require('assert/strict'); const {getMessages}=require(${JSON.stringify(require.resolve('./messages'))});
      for(const [name,contents] of Object.entries(${JSON.stringify(expected)})) assert.deepEqual(getMessages(${JSON.stringify(type)},name).map(m=>m.content),contents);
    `], { env: { ...process.env, CLAWMAX_TEST_WORKSPACE: target, TS_NODE_PROJECT: path.resolve('tsconfig.server.json') }, stdio: 'pipe' })
  }
  const payload = (content: string) => ({ from: 'User', content, mentions: [] as string[] })
  try {
    const store = path.join(root, 'contained')
    assert.equal(messageStoragePath(store, 'sales_team.json'), path.join(store, 'sales_team.json'))
    for (const filename of ['../outside.json', '../../outside.json', path.join(store, 'absolute.json'),
      'nested/file.json', '..\\outside.json', 'C:\\outside.json', 'bad\0.json', '.', '..', '']) {
      assert.throws(() => messageStoragePath(store, filename), /Invalid message storage filename|escapes its directory/)
    }
    assert(!fs.existsSync(store), 'path validation must not write anything')
    checks++
    for (const type of ['group', 'community'] as const) {
      const target = workspace(`fresh-${type}`)
      const names = ['Sales Team', 'Sales_Team', 'sales_team', 'Sales/Team', 'sales team', '研究']
      catalog(target, type, names)
      for (const [index, name] of names.entries()) {
        assert.deepEqual(messages.getMessages(type, name), [])
        messages.addMessage(type, name, payload(`only-${index}`))
      }
      freshProcess(target, type, Object.fromEntries(names.map((name, index) => [name, [`only-${index}`]])))
      assert.deepEqual(messages.getMessages(type === 'group' ? 'community' : 'group', names[0]), [])
      checks++

      // A uniquely declared legacy owner keeps its history, even when another
      // colliding channel is added later. Old bytes remain an untouched fallback.
      const legacyRoot = workspace(`legacy-${type}`)
      const owner = 'Sales Team', newcomer = 'Sales_Team'
      catalog(legacyRoot, type, [owner])
      const parent = path.join(legacyRoot, 'SYSTEM', 'messages', type === 'group' ? 'groups' : 'communities')
      const archiveDir = path.join(parent, 'archive')
      fs.mkdirSync(archiveDir, { recursive: true })
      const legacy = path.join(parent, 'sales_team.json')
      const old = JSON.stringify([{ id: 'old', timestamp: 1, ...payload('legacy-only') }])
      const archivedName = 'sales_team_2026-11-01_1.json'
      fs.writeFileSync(legacy, old)
      fs.writeFileSync(path.join(archiveDir, archivedName), old)
      assert.equal(messages.getMessages(type, owner)[0].content, 'legacy-only')
      catalog(legacyRoot, type, [owner, newcomer])
      assert.deepEqual(messages.getMessages(type, newcomer), [])
      messages.addMessage(type, newcomer, payload('newcomer-only'))
      const cleared = messages.clearMessages(type, owner)
      assert(cleared.archived && cleared.archiveFile)
      assert.deepEqual(messages.getMessages(type, owner), [])
      assert.equal(messages.getArchivedMessages(type, owner, cleared.archiveFile)[0].content, 'legacy-only')
      assert.deepEqual(messages.getArchivedMessages(type, newcomer, cleared.archiveFile), [])
      assert.equal(messages.deleteArchivedMessages(type, newcomer, archivedName), false)
      assert.deepEqual(await messages.getArchives(type, newcomer), [])
      assert.equal((await messages.getArchives(type, owner)).length, 2)
      assert.equal(messages.deleteArchivedMessages(type, owner, cleared.archiveFile), true)
      assert.equal(fs.readFileSync(legacy, 'utf8'), old)
      assert.equal(fs.readFileSync(path.join(archiveDir, archivedName), 'utf8'), old)
      freshProcess(legacyRoot, type, { [owner]: [], [newcomer]: ['newcomer-only'] })
      checks++

      const ambiguous = workspace(`ambiguous-${type}`)
      catalog(ambiguous, type, [owner, newcomer])
      const ambiguousParent = path.join(ambiguous, 'SYSTEM', 'messages', type === 'group' ? 'groups' : 'communities')
      fs.mkdirSync(path.join(ambiguousParent, 'archive'), { recursive: true })
      fs.writeFileSync(path.join(ambiguousParent, 'sales_team.json'), old)
      fs.writeFileSync(path.join(ambiguousParent, 'archive', archivedName), old)
      for (const name of [owner, newcomer]) {
        for (const attempt of [
          () => messages.getMessages(type, name),
          () => messages.addMessage(type, name, payload('must-not-write')),
          () => messages.clearMessages(type, name),
          () => messages.getArchivedMessages(type, name, archivedName),
          () => messages.deleteArchivedMessages(type, name, archivedName),
        ]) assert.throws(attempt, MessageHistoryRecoveryError)
        await assert.rejects(messages.getArchives(type, name), MessageHistoryRecoveryError)
      }
      assert.equal(fs.readFileSync(path.join(ambiguousParent, 'sales_team.json'), 'utf8'), old)
      assert.equal(fs.readFileSync(path.join(ambiguousParent, 'archive', archivedName), 'utf8'), old)
      const journalDirectory = path.join(ambiguousParent, '.v2')
      assert.equal(fs.readdirSync(journalDirectory).filter(name => name.endsWith('.json')).length, 0, 'no replacement history is created')
      const journalFiles = fs.readdirSync(path.join(journalDirectory, 'legacy-owners'))
      const journalFile = path.join(journalDirectory, 'legacy-owners', journalFiles[0])
      const journal = JSON.parse(fs.readFileSync(journalFile, 'utf8'))
      assert.equal(journal.blocked, true, 'ambiguity has a durable recovery record')
      fs.writeFileSync(journalFile, JSON.stringify({ ...journal, name: owner }))
      catalog(ambiguous, type, [owner])
      assert.throws(() => messages.getMessages(type, owner), MessageHistoryRecoveryError, 'removing a conflicting catalog entry must not assign mixed legacy history automatically')
      checks++

      const creating = workspace(`create-preserve-${type}`)
      catalog(creating, type, [owner])
      const creatingParent = path.join(creating, 'SYSTEM', 'messages', type === 'group' ? 'groups' : 'communities')
      fs.mkdirSync(creatingParent, { recursive: true })
      fs.writeFileSync(path.join(creatingParent, 'sales_team.json'), old)
      assert(createGroup(type, newcomer, { description: 'New isolated channel', members: [] }))
      assert.deepEqual(messages.getMessages(type, newcomer), [])
      assert.equal(messages.getMessages(type, owner)[0].content, 'legacy-only', 'creation preserves a proven previous owner')
      checks++

      const deleting = workspace(`delete-preserve-${type}`)
      catalog(deleting, type, [owner, newcomer])
      const deletingParent = path.join(deleting, 'SYSTEM', 'messages', type === 'group' ? 'groups' : 'communities')
      fs.mkdirSync(deletingParent, { recursive: true })
      fs.writeFileSync(path.join(deletingParent, 'sales_team.json'), old)
      assert(deleteGroup(type, newcomer))
      assert.throws(() => messages.getMessages(type, owner), MessageHistoryRecoveryError, 'deletion records ambiguity before changing the catalog')
      assert.equal(fs.readFileSync(path.join(deletingParent, 'sales_team.json'), 'utf8'), old)
      checks++

      process.env.CLAWMAX_TEST_WORKSPACE = legacyRoot
      const receiptDir = path.join(parent, '.v2', 'legacy-owners')
      const receipt = path.join(receiptDir, fs.readdirSync(receiptDir)[0])
      fs.writeFileSync(receipt, '{broken')
      assert.throws(() => messages.getMessages(type, owner), MessageHistoryRecoveryError, 'warm cache cannot bypass corrupt ownership')
      assert.equal(fs.readFileSync(legacy, 'utf8'), old)
      checks++
    }

    workspace('write-failure')
    messages.addMessage('group', 'safe', payload('persisted'))
    const rename = fs.renameSync
    try {
      fs.renameSync = () => { throw new Error('Synthetic write failure') }
      assert.throws(() => messages.addMessage('group', 'safe', payload('not-persisted')), /Synthetic write failure/)
    } finally { fs.renameSync = rename }
    assert.deepEqual(messages.getMessages('group', 'safe').map(message => message.content), ['persisted'], 'failed persistence does not update cache')
    checks++

    const formatRoot = workspace('log-format')
    const formatName = 'percent %s%d%j'
    messages.addMessage('group', formatName, payload('Synthetic'))
    const archive = path.join(formatRoot, 'SYSTEM', 'messages', 'groups', '.v2', 'archive')
    fs.mkdirSync(archive, { recursive: true })
    const readDirectory = fs.readdirSync
    const logError = console.error
    const logged: unknown[][] = []
    try {
      fs.readdirSync = ((directory: fs.PathLike) => {
        assert.equal(directory, archive, 'only the synthetic archive store is read')
        throw new Error('Synthetic archive failure')
      }) as typeof fs.readdirSync
      console.error = (...args: unknown[]) => { logged.push(args) }
      await assert.rejects(() => messages.getArchives('group', formatName), /Synthetic archive failure/)
      assert.equal(logged[0][0], 'Failed to read archives for %s:%s:')
      assert(format(...logged[0]).includes(`group:${formatName}:`), 'format tokens in a channel name remain literal data')
    } finally {
      fs.readdirSync = readDirectory
      console.error = logError
    }
    checks++
    console.log(`Message storage isolation: ${checks} scenarios passed (fresh processes, legacy ownership/recovery, archives, failed persistence)`)
  } finally {
    ai.generateArchiveTitle = originalTitle
    if (previous === undefined) delete process.env.CLAWMAX_TEST_WORKSPACE
    else process.env.CLAWMAX_TEST_WORKSPACE = previous
    fs.rmSync(root, { recursive: true, force: true })
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
