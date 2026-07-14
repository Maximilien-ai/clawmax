import assert from 'assert'
import { getAttachmentFilename } from './downloadFilename'

assert.strictEqual(getAttachmentFilename('attachment; filename="launch-planner.template.md"', 'export.md'), 'launch-planner.template.md')
assert.strictEqual(getAttachmentFilename("attachment; filename*=UTF-8''customer%20brief.md", 'export.md'), 'customer brief.md')
assert.strictEqual(getAttachmentFilename(null, 'agent.zip'), 'agent.zip')

console.log('downloadFilename.test.ts: 3 tests passed')
