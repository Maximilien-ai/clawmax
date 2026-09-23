import assert from 'assert'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { deleteArchivedMessages, getArchivedMessages, getArchives } from './messages'

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-message-archive-boundary-'))
  const previous = process.env.CLAWMAX_TEST_WORKSPACE
  process.env.CLAWMAX_TEST_WORKSPACE = root
  try {
    for (const [type, subdir] of [
      ['group', 'groups'], ['community', 'communities'], ['direct', 'direct'],
    ] as const) {
      const parent = path.join(root, 'SYSTEM', 'messages', subdir)
      const archiveDir = path.join(parent, 'archive')
      fs.mkdirSync(archiveDir, { recursive: true })
      const own = 'team_2026-09-23_123.json'
      const other = 'teammate_2026-09-23_124.json'
      const neighbor = path.join(parent, 'neighbor.json')
      const ownMessage = [{ id: 'own', from: 'user', content: 'own archive', timestamp: 123, mentions: [] }]
      const otherMessage = [{ id: 'other', from: 'user', content: 'other archive', timestamp: 124, mentions: [] }]
      fs.writeFileSync(path.join(archiveDir, own), JSON.stringify(ownMessage))
      fs.writeFileSync(path.join(archiveDir, other), JSON.stringify(otherMessage))
      fs.writeFileSync(neighbor, JSON.stringify(otherMessage))
      fs.writeFileSync(path.join(archiveDir, '.titles.json'), JSON.stringify({ [own]: 'Own archive', [other]: 'Other archive' }))

      assert.deepEqual((await getArchives(type, 'team')).map(item => item.filename), [own], `${type}: prefix collision must not list another archive`)
      assert.deepEqual(getArchivedMessages(type, 'team', own).map(item => item.id), ['own'], `${type}: own archive must remain readable`)
      for (const filename of [other, '../neighbor.json', '..%2Fneighbor.json', 'team_2026-09-23_123.json/../neighbor.json']) {
        assert.deepEqual(getArchivedMessages(type, 'team', filename), [], `${type}: foreign/path archive must not be readable`)
        assert.equal(deleteArchivedMessages(type, 'team', filename), false, `${type}: foreign/path archive must not be deletable`)
      }
      assert(fs.existsSync(neighbor) && fs.existsSync(path.join(archiveDir, other)), `${type}: unrelated files must be preserved`)
      assert.equal(deleteArchivedMessages(type, 'team', own), true, `${type}: own archive must remain deletable`)
      assert(!fs.existsSync(path.join(archiveDir, own)), `${type}: own archive must be removed`)
      assert(fs.existsSync(path.join(archiveDir, other)), `${type}: another archive must remain`)
    }
    console.log('messages-archive-boundary.test.ts: passed')
  } finally {
    if (previous === undefined) delete process.env.CLAWMAX_TEST_WORKSPACE
    else process.env.CLAWMAX_TEST_WORKSPACE = previous
    fs.rmSync(root, { recursive: true, force: true })
  }
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
