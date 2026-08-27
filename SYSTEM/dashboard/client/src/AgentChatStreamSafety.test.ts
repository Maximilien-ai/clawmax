import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { INCOMPLETE_AGENT_CHAT_MESSAGE, markIncompleteAgentReply } from './lib/agentChatStream'

assert.strictEqual(markIncompleteAgentReply(''), INCOMPLETE_AGENT_CHAT_MESSAGE)
const partial = markIncompleteAgentReply('Useful partial answer')
assert(partial.startsWith('Useful partial answer'), 'Incomplete replies must preserve partial output')
assert(partial.includes(INCOMPLETE_AGENT_CHAT_MESSAGE), 'Incomplete replies must visibly explain the truncation')

const panelSource = fs.readFileSync(path.join(__dirname, 'components', 'AgentChatPanel.tsx'), 'utf8')
assert(panelSource.includes('let sawTerminalEvent = false'), 'Agent chat must track whether the stream settled')
assert(panelSource.includes("data.type === 'complete'"), 'Agent chat must recognize completion events')
assert(panelSource.includes("data.type === 'error'"), 'Agent chat must recognize error events')
assert(panelSource.includes('if (!sawTerminalEvent)'), 'Agent chat must handle a clean close without a terminal event')
assert(panelSource.includes('markIncompleteAgentReply(m.content)'), 'Agent chat must mark the partial bubble itself')
assert(panelSource.includes('turnId: string; agentId: string'), 'Active-turn polling must retain the server turn id')
assert(panelSource.includes('activeTurnIdRef.current = mine.turnId'), 'A reloaded chat must adopt the turn id before offering Stop')

console.log('AgentChatStreamSafety.test.ts: 10 assertions passed')
