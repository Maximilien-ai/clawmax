import assert from 'node:assert/strict'
import { parseAgentChatHistory, reconcileAgentChatHistory, type AgentChatMessage } from './agentChatHistory'

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`✓ ${name}`)
  } catch (error) {
    console.error(`✗ ${name}`)
    console.error(error)
    process.exitCode = 1
  }
}

const saved = (id: string, role: 'user' | 'assistant', content: string, timestamp = 1): AgentChatMessage => ({ id, role, content, timestamp })
const pending = (id: string, role: 'user' | 'assistant', content: string, sentContent?: string): AgentChatMessage => ({ id, role, content, timestamp: 99, pending: true, ...(sentContent ? { sentContent } : {}) })
const ids = (messages: AgentChatMessage[]) => messages.map((message) => message.id)

test('parses history, keeping server ids and assigning stable ones where missing', () => {
  const parsed = parseAgentChatHistory({ messages: [
    { id: 'evt-1', role: 'user', content: 'hi', timestamp: 10 },
    { role: 'assistant', content: 'hello', timestamp: 11 },
    { role: 'system', content: 'ignored', timestamp: 12 },
    { role: 'assistant', content: 42 },
  ] })
  assert.deepEqual(parsed, [
    { id: 'evt-1', role: 'user', content: 'hi', timestamp: 10 },
    { id: 'history-1-11', role: 'assistant', content: 'hello', timestamp: 11 },
  ])
  assert.deepEqual(ids(parseAgentChatHistory({ messages: [{ role: 'assistant', content: 'hello', timestamp: 11 }] })), ['history-0-11'], 'Ids must not depend on dropped rows elsewhere in the poll')
  assert.equal(parseAgentChatHistory({ messages: [{ id: 'e', role: 'user', content: 'x', timestamp: '2026-10-16T01:22:53.885Z' }] })[0].timestamp, Date.parse('2026-10-16T01:22:53.885Z'), 'ISO event timestamps must keep their time')
  assert.throws(() => parseAgentChatHistory({ error: 'Chat history index is not ready' }), /index is not ready/)
  assert.throws(() => parseAgentChatHistory(null), /unexpected/)
})

test('a reopened chat shows the transcript exactly, assistant replies included', () => {
  const server = [saved('u1', 'user', 'Design an API'), saved('a1', 'assistant', 'Plan:\n```json\n{"status": "ok"}\n```')]
  assert.deepEqual(reconcileAgentChatHistory([], server), server)
})

test('a finished turn is replaced by its persisted copy, never shown twice', () => {
  const local = [saved('u0', 'user', 'earlier'), pending('user-1', 'user', 'next question'), pending('assistant-1', 'assistant', 'streamed answer')]
  const server = [saved('u0', 'user', 'earlier'), saved('u1', 'user', 'next question'), saved('a1', 'assistant', 'final answer')]
  assert.deepEqual(reconcileAgentChatHistory(local, server), server)
})

test('a sent turn the transcript has not recorded yet stays visible', () => {
  const local = [saved('u0', 'user', 'earlier'), pending('user-1', 'user', 'next question'), pending('assistant-1', 'assistant', 'answer')]
  assert.deepEqual(ids(reconcileAgentChatHistory(local, [saved('u0', 'user', 'earlier')])), ['u0', 'user-1', 'assistant-1'])
  assert.deepEqual(
    ids(reconcileAgentChatHistory(local, [saved('u0', 'user', 'earlier'), saved('u1', 'user', 'next question')])),
    ['u0', 'u1', 'assistant-1'],
    'Until its reply is persisted the local reply stays, directly after its question',
  )
})

test('re-sending an identical prompt does not match the earlier copy', () => {
  // The reported transcript held the same prompt four times: matching must start after what this tab
  // has already seen, or a fresh send would be hidden behind an old identical one.
  const local = [saved('u1', 'user', 'same prompt'), saved('a1', 'assistant', 'reply'), pending('user-2', 'user', 'same prompt'), pending('assistant-2', 'assistant', '')]
  const before = [saved('u1', 'user', 'same prompt'), saved('a1', 'assistant', 'reply')]
  assert.deepEqual(ids(reconcileAgentChatHistory(local, before)), ['u1', 'a1', 'user-2', 'assistant-2'])
  const after = [...before, saved('u2', 'user', 'same prompt'), saved('a2', 'assistant', 'second reply')]
  assert.deepEqual(ids(reconcileAgentChatHistory(local, after)), ['u1', 'a1', 'u2', 'a2'])
})

test('a failed turn keeps its error in place even after later turns succeed', () => {
  const local = [pending('user-1', 'user', 'first'), pending('assistant-1', 'assistant', 'The model provider rejected this request.'), pending('user-2', 'user', 'second'), pending('assistant-2', 'assistant', 'ok')]
  const server = [saved('u1', 'user', 'first'), saved('u2', 'user', 'second'), saved('a2', 'assistant', 'ok')]
  assert.deepEqual(ids(reconcileAgentChatHistory(local, server)), ['u1', 'assistant-1', 'u2', 'a2'])
})

test('attachment context the agent received still matches the shown message', () => {
  const local = [
    pending('user-1', 'user', 'Review this\n\nInbox files:\n- AGENTS/writer/INBOX/spec.md', 'Review this\n\nAgent inbox files:\n- file: AGENTS/writer/INBOX/spec.md Context: # Spec'),
    pending('assistant-1', 'assistant', 'Reviewed'),
  ]
  const server = [saved('u1', 'user', 'Review this\n\nAgent inbox files:\n- file: AGENTS/writer/INBOX/spec.md Context: # Spec'), saved('a1', 'assistant', 'Reviewed')]
  assert.deepEqual(reconcileAgentChatHistory(local, server), server)
})

test('resending after a failed, unrecorded attempt shows each once, in order', () => {
  // The first send failed before the runtime recorded it; the resend succeeded. Matching oldest-first
  // let the failed attempt claim the resend's transcript copy and showed the resend a second time.
  const local = [saved('s0', 'assistant', 'earlier'), pending('user-1', 'user', 'X'), pending('assistant-1', 'assistant', 'Request failed'), pending('user-2', 'user', 'X'), pending('assistant-2', 'assistant', 'streamed')]
  const server = [saved('s0', 'assistant', 'earlier'), saved('u2', 'user', 'X'), saved('a2', 'assistant', 'reply')]
  assert.deepEqual(ids(reconcileAgentChatHistory(local, server)), ['s0', 'user-1', 'assistant-1', 'u2', 'a2'])
})

test('a failed, unrecorded turn stays where it happened instead of sinking below later turns', () => {
  const local = [saved('s0', 'user', 'hi'), pending('user-a', 'user', 'A'), pending('assistant-a', 'assistant', 'Failed'), pending('user-b', 'user', 'B'), pending('assistant-b', 'assistant', 'b')]
  const server = [saved('s0', 'user', 'hi'), saved('ub', 'user', 'B'), saved('ab', 'assistant', 'b')]
  assert.deepEqual(ids(reconcileAgentChatHistory(local, server)), ['s0', 'user-a', 'assistant-a', 'ub', 'ab'])
})

test('a prompt matches its transcript copy whether stored normalized or raw', () => {
  const prompt = 'Check this\n🕒 Time: noon'
  const local = [pending('user-1', 'user', prompt), pending('assistant-1', 'assistant', 'done')]
  // OpenClaw history is normalized on read; claude/droid runtime transcripts keep the raw prompt.
  for (const stored of ['Check this', prompt]) {
    const server = [saved('u1', 'user', stored), saved('a1', 'assistant', 'done')]
    assert.deepEqual(ids(reconcileAgentChatHistory(local, server)), ['u1', 'a1'], `stored as ${JSON.stringify(stored)}`)
  }
})

test('a short prompt does not claim a longer message that merely contains it', () => {
  const local = [saved('u0', 'user', 'start'), pending('user-1', 'user', 'ok')]
  const server = [saved('u0', 'user', 'start'), saved('u1', 'user', 'okay, thanks')]
  // Unclaimed, it stays right after the message that preceded it locally.
  assert.deepEqual(ids(reconcileAgentChatHistory(local, server)), ['u0', 'user-1', 'u1'])
})

test('history cleared elsewhere drops saved messages but keeps unsent local ones', () => {
  const local = [saved('u1', 'user', 'old'), saved('a1', 'assistant', 'old reply'), pending('user-2', 'user', 'new')]
  assert.deepEqual(ids(reconcileAgentChatHistory(local, [])), ['user-2'])
})

test('agent-initiated messages appear without disturbing local state', () => {
  const local = [saved('u1', 'user', 'hi'), saved('a1', 'assistant', 'hello')]
  const server = [...local, saved('a2', 'assistant', 'Scheduled report is ready.')]
  assert.deepEqual(reconcileAgentChatHistory(local, server), server)
})

test('a poll that changes nothing keeps the same array, so the panel neither re-renders nor scrolls', () => {
  const local = [saved('u1', 'user', 'hi'), saved('a1', 'assistant', 'hello')]
  const server = local.map((message) => ({ ...message }))
  assert.strictEqual(reconcileAgentChatHistory(local, server), local)
  // Any real difference is a new array.
  const edited = [server[0], { ...server[1], content: 'hello again' }]
  assert.notStrictEqual(reconcileAgentChatHistory(local, edited), local)
  const confirmed = [saved('u1', 'user', 'hi'), pending('assistant-1', 'assistant', 'streamed')]
  assert.notStrictEqual(reconcileAgentChatHistory(confirmed, [saved('u1', 'user', 'hi'), saved('a1', 'assistant', 'streamed')]), confirmed)
})
