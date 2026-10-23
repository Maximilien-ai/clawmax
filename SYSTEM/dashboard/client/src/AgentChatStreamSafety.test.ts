import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { INCOMPLETE_AGENT_CHAT_MESSAGE, applyAgentChatDelta, markIncompleteAgentReply } from './lib/agentChatStream'

assert.strictEqual(markIncompleteAgentReply(''), INCOMPLETE_AGENT_CHAT_MESSAGE)
const partial = markIncompleteAgentReply('Useful partial answer')
assert(partial.startsWith('Useful partial answer'), 'Incomplete replies must preserve partial output')
assert(partial.includes(INCOMPLETE_AGENT_CHAT_MESSAGE), 'Incomplete replies must visibly explain the truncation')
// An error after live Gateway text keeps that text and adds the error beneath it.
const interrupted = markIncompleteAgentReply('Streamed text', 'Gateway stopped')
assert(interrupted.startsWith('Streamed text') && interrupted.includes('Gateway stopped'), 'An error must not replace text already streamed')
assert.strictEqual(markIncompleteAgentReply('', 'Gateway stopped'), 'Gateway stopped', 'With no text streamed, the error is the whole bubble')

const panelSource = fs.readFileSync(path.join(__dirname, 'components', 'AgentChatPanel.tsx'), 'utf8')
assert(panelSource.includes('let sawTerminalEvent = false'), 'Agent chat must track whether the stream settled')
assert(panelSource.includes("data.type === 'complete'"), 'Agent chat must recognize completion events')
assert(panelSource.includes("data.type === 'error'"), 'Agent chat must recognize error events')
assert(panelSource.includes('if (!sawTerminalEvent)'), 'Agent chat must handle a clean close without a terminal event')
assert(panelSource.includes('markIncompleteAgentReply(m.content)'), 'Agent chat must mark the partial bubble itself')
assert(panelSource.includes('sawGatewayText ? markIncompleteAgentReply(m.content, friendly) : friendly'), 'An error after Gateway reply text must keep that text and add the error, not replace it')
assert(panelSource.includes('if (data.data?.live === true || data.data?.final === true) sawGatewayText = true'), 'The Gateway\'s final snapshot is reply text an error must keep, though it is not live streaming')
assert(/live === true && !sawLiveDelta\) \{\s*sawLiveDelta = true/.test(panelSource), 'Only live Gateway deltas count as streamed reply text')
assert(/content: '' \} : m\)\)\s*sawLiveDelta = false/.test(panelSource), 'A retried attempt starts without the abandoned attempt\'s live text')
// "Replies stream live" from an earlier turn must not stay up while this one has streamed nothing (a long tool phase).
assert(panelSource.includes('setLiveOutput(data.data?.liveOutput === false ? false : null)'), 'Each turn\'s start resets the streaming label to that turn\'s own state')
assert(panelSource.includes('turnId: string; agentId: string'), 'Active-turn polling must retain the server turn id')
assert(panelSource.includes('activeTurnIdRef.current = mine.turnId'), 'A reloaded chat must adopt the turn id before offering Stop')
assert(panelSource.includes("'X-ClawMax-Agent-Generation': agentGeneration"), 'Every agent chat request must identify its lifecycle generation')
assert(panelSource.includes("window.addEventListener('agent-deleted', handleDeleted)"), 'An open chat must react immediately to local deletion')
assert(panelSource.includes('r.status === 404 || r.status === 410'), 'History polling must close bounded stale agent routes')
assert(panelSource.includes('response.status === 404 || response.status === 410'), 'Sending must close instead of presenting a deleted agent as active')

// Live Gateway output appends, but may resend the whole reply when the runtime rewrites it.
assert.strictEqual(applyAgentChatDelta('Hel', { text: 'lo' }), 'Hello', 'Deltas append')
assert.strictEqual(applyAgentChatDelta('Hello wrld', { text: 'Hello world', replace: true }), 'Hello world', 'A replace delta resets the bubble')
assert.strictEqual(applyAgentChatDelta('Hi', { replace: 'yes', text: 7 }), 'Hi', 'A malformed delta changes nothing')
assert(panelSource.includes('if (sawTerminalEvent) continue'), 'No delta may be appended after the authoritative complete text')
assert(panelSource.includes("m.id === assistantId ? { ...m, content: '' } : m"), 'A retried attempt must not append to the abandoned partial reply')

console.log('AgentChatStreamSafety.test.ts: 26 assertions passed')
