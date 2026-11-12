// Real Dashboard + pinned runtime; run only against the harness's disposable workspace.
const assert = require('node:assert/strict')
const { randomBytes } = require('node:crypto')
const base = process.argv[2]
const workspaceId = process.env.CLAWMAX_LIFECYCLE_TEST_WORKSPACE
const byok = JSON.parse(process.env.CLAWMAX_LIFECYCLE_TEST_BYOK || '{}')
const headers = { 'Content-Type': 'application/json', ...(process.env.CLAWMAX_LIFECYCLE_TEST_AUTH ? { Authorization: `Bearer ${process.env.CLAWMAX_LIFECYCLE_TEST_AUTH}` } : {}) }
const agent = 'test-agent1'
const api = `/api/agents/${agent}`
async function request(url, method = 'GET', body, timeout = 20000) {
 const response = await fetch(base + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(timeout) })
 assert(response.ok, `${method} lifecycle endpoint returned HTTP ${response.status}`)
 return response
}
async function json(url, method, body) { return (await request(url, method, body)).json() }
async function settle() {
 for (let attempt = 0; attempt < 50; attempt++) {
  const { turns } = await json('/api/agents/turns/active')
  assert(Array.isArray(turns), 'Expected a valid turn inventory')
  if (!turns.some(turn => turn.agentId === agent)) return
  await new Promise(resolve => setTimeout(resolve, 100))
 }
 throw new Error('Chat runtime did not settle before the context change')
}
async function chat(message) {
 const raw = await (await request(api + '/chat', 'POST', { message, sessionId: `agent:${agent}:dashboard-chat`, byok }, 190000)).text()
 let complete
 for (const line of raw.split('\n')) {
  if (!line.startsWith('data: ')) continue
  const event = JSON.parse(line.slice(6))
  assert(event.type !== 'error', 'Runtime returned a chat error during lifecycle validation')
  if (event.type === 'complete') complete = event.data?.text
 }
 assert(typeof complete === 'string' && complete.trim(), 'Chat ended without a nonempty completion')
 await settle()
 return complete.trim()
}
async function main() {
 assert(base && workspaceId, 'An explicitly selected disposable workspace is required')
 const { workspace } = await json('/api/workspaces/active')
 assert.equal(workspace.id, workspaceId, 'Refusing to modify a workspace outside the test harness')
 const nonce = 'CTX' + randomBytes(8).toString('hex').toUpperCase()
 assert.equal(await chat(`The opaque test code in this message is ${nonce}. Reply with HELLO only.`), 'HELLO')
 const before = await json(api + '/chat/messages')
 assert(before.messages.some(message => message.role === 'user' && message.content.includes(nonce)), 'History must contain the original context')
 const cleared = await json(api + '/chat/messages', 'DELETE')
 assert.equal(cleared.ok, true)
 for (let poll = 0; poll < 2; poll++) assert.deepEqual((await json(api + '/chat/messages')).messages, [], 'Clear must survive subsequent history reads')
 assert.equal(await chat('What opaque test code appeared earlier in this conversation? Reply with the code only, or UNKNOWN if none appeared.'), 'UNKNOWN', 'The fresh chat must not use the ended conversation context')
 const { archives } = await json(api + '/chat/archives')
 const ended = archives.find(archive => !archive.active && archive.kind === 'conversation' && archive.resumable)
 assert(ended, 'The ended native conversation must remain available in History')
 const restored = await json(api + '/chat/archives/' + encodeURIComponent(ended.filename) + '/restore', 'POST', {})
 assert.equal(restored.ok, true)
 const visible = messages => messages.map(({ role, content }) => ({ role, content }))
 assert.deepEqual(visible((await json(api + '/chat/messages')).messages), visible(before.messages), 'Continue must reopen exactly the ended transcript')
 assert.equal(await chat('What opaque test code appeared earlier in this conversation? Reply with the code only.'), nonce, 'Continue must restore the actual runtime context')
 console.log('PASS live chat Clear/History/Continue: fresh context, exact transcript, resumed context')
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
