import assert from 'assert'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { addMessage, getMessages } from './messages'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-message-isolation-'))
const previous = process.env.CLAWMAX_TEST_WORKSPACE
try {
  for (const type of ['group', 'community', 'direct'] as const) {
    process.env.CLAWMAX_TEST_WORKSPACE = path.join(root, 'alpha')
    const alpha = addMessage(type, 'shared-name', { from: 'producer', content: 'alpha-only', mentions: [] })
    process.env.CLAWMAX_TEST_WORKSPACE = path.join(root, 'beta')
    assert.deepEqual(getMessages(type, 'shared-name'), [], `${type} must not leak Alpha's cached history into Beta`)
    const beta = addMessage(type, 'shared-name', { from: 'reviewer', content: 'beta-only', mentions: [] })
    assert.deepEqual(getMessages(type, 'shared-name').map(message => message.id), [beta.id])
    process.env.CLAWMAX_TEST_WORKSPACE = path.join(root, 'alpha')
    assert.deepEqual(getMessages(type, 'shared-name').map(message => message.id), [alpha.id])
    const directory = type === 'group' ? 'groups' : type === 'community' ? 'communities' : 'direct'
    const alphaDisk = JSON.parse(fs.readFileSync(path.join(root, 'alpha', 'SYSTEM', 'messages', directory, 'shared-name.json'), 'utf8'))
    const betaDisk = JSON.parse(fs.readFileSync(path.join(root, 'beta', 'SYSTEM', 'messages', directory, 'shared-name.json'), 'utf8'))
    assert.deepEqual(alphaDisk.map((message: any) => message.content), ['alpha-only'])
    assert.deepEqual(betaDisk.map((message: any) => message.content), ['beta-only'])
  }
  console.log('messages-workspace-isolation.test.ts: passed')
} finally {
  if (previous === undefined) delete process.env.CLAWMAX_TEST_WORKSPACE
  else process.env.CLAWMAX_TEST_WORKSPACE = previous
  fs.rmSync(root, { recursive: true, force: true })
}
