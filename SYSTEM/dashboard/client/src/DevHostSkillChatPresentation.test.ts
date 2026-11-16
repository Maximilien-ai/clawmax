import assert from 'assert'
import fs from 'fs'
import path from 'path'

const panel = fs.readFileSync(path.join(__dirname, 'components', 'AgentChatPanel.tsx'), 'utf8')
assert(panel.includes('const stagedTemplateAgent = /^tr-[a-f0-9]{16}-agent-[a-f0-9]{12}$/.test(agentId)'))
assert(panel.includes('hasChatExecutionAccess(config) || stagedTemplateAgent'))
assert(panel.includes('useState(browserChatEnabled && !stagedTemplateAgent)'))
assert(panel.includes('setChatEnabled(browserChatEnabled && !stagedTemplateAgent)'))
assert(panel.includes("fetch(`/api/agents/${agentId}/chat/readiness`"))
console.log('DevHostSkillChatPresentation.test.ts: passed')
