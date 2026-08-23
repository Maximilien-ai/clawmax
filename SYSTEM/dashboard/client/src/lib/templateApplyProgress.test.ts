import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { advanceTemplateApplyProgress, getTemplateApplyStagePercent } from './templateApplyProgress'

assert.strictEqual(getTemplateApplyStagePercent('Creating 4 agents...'), 8)
assert.strictEqual(getTemplateApplyStagePercent('Validating template customization...'), 35)
assert.strictEqual(getTemplateApplyStagePercent('Writing 4 agents, groups, and workflows...'), 60)
assert.strictEqual(getTemplateApplyStagePercent('Refreshing workspace state...'), 92)
assert.strictEqual(getTemplateApplyStagePercent('Done! Refreshing workspace...'), 100)
assert.strictEqual(advanceTemplateApplyProgress(94, 60), 95)
assert.strictEqual(advanceTemplateApplyProgress(95, 60), 95)
assert.strictEqual(advanceTemplateApplyProgress(24, 80), 80)

const orgModal = fs.readFileSync(path.join(__dirname, '..', 'components', 'ApplyOrgTemplateModal.tsx'), 'utf8')
const agentModal = fs.readFileSync(path.join(__dirname, '..', 'components', 'ApplyAgentTemplateModal.tsx'), 'utf8')
assert(orgModal.includes('<TemplateApplyProgress'), 'Organization template applies must render progress')
assert(agentModal.includes('<TemplateApplyProgress'), 'Agent template applies must render progress')

console.log('templateApplyProgress.test.ts: 10 tests passed')
