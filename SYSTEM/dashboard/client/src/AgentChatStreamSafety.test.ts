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
assert(panelSource.includes("'X-ClawMax-Agent-Generation': agentGeneration"), 'Every agent chat request must identify its lifecycle generation')
assert(panelSource.includes("window.addEventListener('agent-deleted', handleDeleted)"), 'An open chat must react immediately to local deletion')
assert(panelSource.includes('r.status === 404 || r.status === 410'), 'History polling must close bounded stale agent routes')
assert(panelSource.includes('response.status === 404 || response.status === 410'), 'Sending must close instead of presenting a deleted agent as active')

console.log('AgentChatStreamSafety.test.ts: 14 assertions passed')
