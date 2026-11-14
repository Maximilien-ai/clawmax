// Scripted HTTP boundary tests for the live-test oracle; no runtime/provider calls.
const assert = require('node:assert/strict')
const http = require('node:http')
const { test } = require('node:test')
const { runLifecycle, contextProbe } = require('./test-chat-lifecycle.cjs')

async function fixture(t, options = {}) {
 const original = 'agent-test-agent1-dashboard-cha-original'
 const fresh = options.reuseSession ? original : 'agent-test-agent1-dashboard-cha-92ea0b01c2716e2e'
 let session = original, messages = [], saved, nonce, chats = 0, clears = 0
 const requests = [], prompts = []
 const server = http.createServer(async (req, res) => {
  let raw = ''
  for await (const chunk of req) raw += chunk
  const body = raw ? JSON.parse(raw) : undefined
  const path = decodeURIComponent(req.url)
  requests.push({ method: req.method, path, body })
  let result
  if (path === '/api/workspaces/active') result = { workspace: { id: options.wrongWorkspace ? 'personal' : 'disposable' } }
  else if (path === '/api/agents/turns/active') result = { turns: [] }
  else if (path.endsWith('/chat/messages') && req.method === 'DELETE') {
   clears++; saved = [...messages]; messages = []; session = fresh; result = { ok: true }
  } else if (path.endsWith('/chat/messages')) {
   result = { messages: options.reappears && clears && chats === 1 ? saved : messages }
  } else if (path.endsWith('/chat/archives')) {
   result = { archives: [
    // A prior run's resumable conversation sorts first: never restore it by accident.
    { filename: 'session:unrelated-old', active: false, kind: 'conversation', resumable: true },
    { filename: `current:${session}`, active: true },
    ...(saved && session !== original ? [{ filename: `session:${original}`, active: false, kind: 'conversation', resumable: true }] : []),
   ] }
  } else if (path.endsWith('/restore')) {
   session = options.wrongRestoredSession ? fresh : original
   messages = options.wrongTranscript ? [] : [...saved]
   result = { ok: true }
  } else if (path.endsWith('/chat') && req.method === 'POST') {
   chats++; prompts.push(body.message)
   let reply
   if (chats === 1) { nonce = body.message.match(/CTX[A-F0-9]{16}/)?.[0]; reply = 'HELLO' }
   else if (chats === 2) reply = options.freshReply === 'nonce' ? nonce : (options.freshReply ?? 'UNKNOWN')
   else reply = options.resumedReply ?? nonce
   messages.push({ role: 'user', content: body.message }, { role: 'assistant', content: reply })
   if (chats === 2 && options.leakedHistory) messages.unshift(...saved)
   res.setHeader('Content-Type', 'text/event-stream')
   return res.end(`data: ${JSON.stringify(options.streamError ? { type: 'error' } : { type: 'complete', data: { text: reply } })}\n\n`)
  } else { res.statusCode = 404; result = { error: 'Unknown fixture path' } }
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(result))
 })
 await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
 t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections() }))
 return { run: () => runLifecycle({ base: `http://127.0.0.1:${server.address().port}`, workspaceId: 'disposable' }), requests, prompts, original, get nonce() { return nonce } }
}

test('same value-free probe validates fresh context and restores the exact ended session', async t => {
 const f = await fixture(t)
 await f.run()
 assert.match(f.nonce, /^CTX[A-F0-9]{16}$/)
 assert.equal(f.prompts[1], contextProbe)
 assert.equal(f.prompts[2], contextProbe)
 assert(!contextProbe.includes(f.nonce))
 assert.match(contextProbe, /earlier user messages/)
 assert.match(contextProbe, /Session IDs are not verification codes/)
 assert.equal(f.requests.find(r => r.path.endsWith('/restore')).path, `/api/agents/test-agent1/chat/archives/session:${f.original}/restore`)
})
for (const [name, options, error] of [
 ['reported session-ID answer', { freshReply: 'cha-92ea0b01c2716e2e' }, /fresh chat must not use/],
 ['actual context leakage', { freshReply: 'nonce' }, /fresh transcript must not contain/],
 ['arbitrary fresh output', { freshReply: 'I do not know' }, /fresh chat must not use/],
 ['reused native session despite UNKNOWN', { reuseSession: true }, /different native session/],
 ['leaked visible transcript despite UNKNOWN', { leakedHistory: true }, /fresh transcript must not contain/],
 ['history repopulation after Clear', { reappears: true }, /Clear must survive/],
 ['wrong resumed context', { resumedReply: 'UNKNOWN' }, /Continue must restore the actual runtime context/],
 ['wrong restored transcript', { wrongTranscript: true }, /exactly the ended transcript/],
 ['wrong restored native session', { wrongRestoredSession: true }, /original native session/],
 ['runtime stream error', { streamError: true }, /Runtime returned a chat error/],
]) test(`fails closed for ${name}`, async t => {
 const f = await fixture(t, options)
 await assert.rejects(f.run, error)
})
test('refuses mutation outside the explicitly selected disposable workspace', async t => {
 const f = await fixture(t, { wrongWorkspace: true })
 await assert.rejects(f.run, /outside the test harness/)
 assert(f.requests.every(r => r.method === 'GET'))
})
