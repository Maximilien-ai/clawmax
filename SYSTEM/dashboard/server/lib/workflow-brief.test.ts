import assert from 'assert'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { saveWorkflowBrief } from './workflow-brief'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-brief-test-'))
try {
  const id = 'tr-1234567890abcdef-workflow-123456789abc'
  const run = '12345678-1234-1234-1234-123456789abc'
  const first = saveWorkflowBrief(root, id, 'Daily Site Health', run, '## Findings\nFirst report')
  assert(first.artifactPath.includes('daily-site-health'))
  assert.equal(fs.readFileSync(path.join(root, first.artifactPath), 'utf8'), first.content)
  const second = saveWorkflowBrief(root, id, 'Daily Site Health', run.replace('abc', 'def'), 'Second report')
  assert.equal(first.artifactPath, second.artifactPath)
  assert.equal(fs.readFileSync(path.join(root, first.artifactPath), 'utf8'), second.content)
  assert(first.content.includes('First report'), 'The previous run retains its own snapshot')
  for (const invalid of ['', ' ', 'x'.repeat(65537)]) {
    assert.throws(() => saveWorkflowBrief(root, id, 'Daily Site Health', run, invalid))
    assert.equal(fs.readFileSync(path.join(root, first.artifactPath), 'utf8'), second.content)
  }
  assert.throws(() => saveWorkflowBrief(root, '../escape', 'Daily', run, 'report'))
  const other = fs.mkdtempSync(path.join(root, 'other-'))
  fs.mkdirSync(path.join(other, 'ORG'))
  fs.symlinkSync(path.join(root, 'ORG/reports'), path.join(other, 'ORG/reports'))
  assert.throws(() => saveWorkflowBrief(other, id, 'Daily Site Health', run, 'tamper'))
  assert.equal(fs.readFileSync(path.join(root, first.artifactPath), 'utf8'), second.content)
  console.log('workflow-brief.test.ts: passed')
} finally { fs.rmSync(root, { recursive: true, force: true }) }
