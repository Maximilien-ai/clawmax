import assert from 'assert'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { readDevWorkflowSettings, writeDevWorkflowSettings, validateDevWorkflowSettings } from './dev-workflow-settings'
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-settings-'))
const id = 'tr-1234567890abcdef-workflow-123456789abc'
const settings = { name: 'Daily report', description: 'Summary', content: 'Produce a brief', schedule: '0 9 * * *', timezone: 'America/Los_Angeles', enabled: true }
try {
  assert.equal(readDevWorkflowSettings(root, id, 'revision', 'actor'), null)
  writeDevWorkflowSettings(root, id, 'revision', 'actor', settings)
  assert.deepEqual(readDevWorkflowSettings(root, id, 'revision', 'actor'), settings)
  assert.throws(() => readDevWorkflowSettings(root, id, 'other', 'actor'))
  assert.throws(() => readDevWorkflowSettings(root, id, 'revision', 'other'))
  for (const change of [{ schedule: 'invalid' }, { timezone: 'invalid' }, { enabled: 'yes' }, { content: '' }]) {
    assert.throws(() => writeDevWorkflowSettings(root, id, 'revision', 'actor', { ...settings, ...change }))
    assert.deepEqual(readDevWorkflowSettings(root, id, 'revision', 'actor'), settings)
  }
  assert.equal(validateDevWorkflowSettings({ ...settings, schedule: 'manual' }).schedule, 'manual')
  const other = fs.mkdtempSync(path.join(root, 'isolated-'))
  assert.equal(readDevWorkflowSettings(other, id, 'revision', 'actor'), null)
  fs.mkdirSync(path.join(other, 'SYSTEM'))
  fs.symlinkSync(path.join(root, 'SYSTEM/dev-workflow-settings'), path.join(other, 'SYSTEM/dev-workflow-settings'))
  assert.throws(() => writeDevWorkflowSettings(other, id, 'revision', 'actor', settings))
  console.log('dev-workflow-settings.test.ts: passed')
} finally { fs.rmSync(root, { recursive: true, force: true }) }
