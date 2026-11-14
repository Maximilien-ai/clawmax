// Real Dashboard + pinned runtime; run only against the harness's disposable workspace.
const assert = require('node:assert/strict')
const { randomBytes } = require('node:crypto')

// Omit the value: the same question must distinguish fresh context from Continue
// without supplying the answer or inviting guesses from runtime session metadata.
const contextProbe = 'Look only at earlier user messages in this conversation, not this request or system/runtime metadata. Was a value explicitly assigned to CLAWMAX_CONTEXT_VERIFICATION_CODE? If so, reply with that exact value (CTX followed by 16 uppercase hexadecimal characters). Otherwise reply exactly UNKNOWN. Session IDs are not verification codes. Do not infer a value, use tools, or read files, saved memory, or other conversations. Reply with the value or UNKNOWN only.'

async function runLifecycle({ base, workspaceId, byok = {}, auth }) {
 const headers = { 'Content-Type': 'application/json', ...(auth ? { Authorization: 'Bearer ' + auth } : {}) }
 const agent = 'test-agent1'
 const api = '/api/agents/' + agent
 async function request(url, method = 'GET', body, timeout = 20000) {
  const response = await fetch(base + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(timeout) })
  assert(response.ok, method + ' lifecycle endpoint returned HTTP ' + response.status)
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
  const raw = await (await request(api + '/chat', 'POST', { message, sessionId: 'agent:' + agent + ':dashboard-chat', byok }, 190000)).text()
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
 const visible = messages => messages.map(({ role, content }) => ({ role, content }))
 assert(base && workspaceId, 'An explicitly selected disposable workspace is required')
 const { workspace } = await json('/api/workspaces/active')
 assert.equal(workspace.id, workspaceId, 'Refusing to modify a workspace outside the test harness')
 const nonce = 'CTX' + randomBytes(8).toString('hex').toUpperCase()
 assert.equal(await chat('For this conversation only, CLAWMAX_CONTEXT_VERIFICATION_CODE = ' + nonce + '. Keep this value only in this conversation; do not use tools or save it to files or memory. Reply with HELLO only.'), 'HELLO')
 const before = await json(api + '/chat/messages')
 assert(before.messages.some(message => message.role === 'user' && message.content.includes(nonce)), 'History must contain the original context')
 const original = (await json(api + '/chat/archives')).archives.find(archive => archive.active && archive.filename.startsWith('current:'))
 assert(original, 'The seeded conversation must have an active native session')
 const originalSession = original.filename.slice('current:'.length)
 const cleared = await json(api + '/chat/messages', 'DELETE')
 assert.equal(cleared.ok, true)
 for (let poll = 0; poll < 2; poll++) assert.deepEqual((await json(api + '/chat/messages')).messages, [], 'Clear must survive subsequent history reads')
 const freshReply = await chat(contextProbe)
 const { archives } = await json(api + '/chat/archives')
 const fresh = archives.find(archive => archive.active && archive.filename.startsWith('current:'))
 assert(fresh, 'The fresh conversation must have an active native session')
 assert.notEqual(fresh.filename, original.filename, 'Clear must start a different native session')
 assert(!(await json(api + '/chat/messages')).messages.some(message => message.content.includes(nonce)), 'The fresh transcript must not contain the ended conversation code')
 assert.equal(freshReply, 'UNKNOWN', 'The fresh chat must not use the ended conversation context')
 const ended = archives.find(archive => archive.filename === 'session:' + originalSession && !archive.active && archive.kind === 'conversation' && archive.resumable)
 assert(ended, 'The exact ended native conversation must remain available in History')
 const restored = await json(api + '/chat/archives/' + encodeURIComponent(ended.filename) + '/restore', 'POST', {})
 assert.equal(restored.ok, true)
 assert.deepEqual(visible((await json(api + '/chat/messages')).messages), visible(before.messages), 'Continue must reopen exactly the ended transcript')
 const resumed = (await json(api + '/chat/archives')).archives.find(archive => archive.active)
 assert.equal(resumed?.filename, original.filename, 'Continue must restore the original native session')
 assert.equal(await chat(contextProbe), nonce, 'Continue must restore the actual runtime context')
 console.log('PASS live chat Clear/History/Continue: fresh context, exact transcript, resumed context')
}

module.exports = { runLifecycle, contextProbe }
if (require.main === module) {
 runLifecycle({ base: process.argv[2], workspaceId: process.env.CLAWMAX_LIFECYCLE_TEST_WORKSPACE, byok: JSON.parse(process.env.CLAWMAX_LIFECYCLE_TEST_BYOK || '{}'), auth: process.env.CLAWMAX_LIFECYCLE_TEST_AUTH }).catch(error => { console.error(error.message); process.exitCode = 1 })
}
