import assert from 'node:assert/strict'
import express from 'express'
import { once } from 'node:events'
import { parseChatJsonBody, parseDefaultJsonBody } from './chat-request-body'
import chatRouter from '../routes/chat'

async function main() {
  const send = chatRouter.stack.find((layer: any) => layer.route?.path === '/:id/chat' && layer.route.methods.post)
  assert(send?.route)
  assert.equal(send.route.stack[0].handle, parseChatJsonBody, 'The real send route uses the bounded parser')
  const app = express()
  app.use(parseDefaultJsonBody)
  app.use('/api/agents', (req, res, next) => {
    if (req.headers.authorization !== 'Bearer test') { res.status(401).end(); return }
    next()
  })
  app.post('/api/agents/:id/chat', parseChatJsonBody, (req, res) => res.json({ length: req.body.context.length }))
  app.post('/api/other', (_req, res) => res.sendStatus(204))
  app.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => res.status(error.status || 500).end())
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address() as import('net').AddressInfo
  const post = (pathname: string, body: string, authenticated = true) => fetch(`http://127.0.0.1:${address.port}${pathname}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(authenticated ? { Authorization: 'Bearer test' } : {}) }, body,
  })
  try {
    const longReply = JSON.stringify({ context: 'x'.repeat(2 * 1024 * 1024) })
    for (const route of ['/api/agents/test/chat', '/api/agents/test/chat/']) {
      const response = await post(route, longReply)
      assert.equal(response.status, 200)
      assert.equal(((await response.json()) as { length: number }).length, 2 * 1024 * 1024)
      assert.equal((await post(route, '{', false)).status, 401, 'Auth rejects before JSON decoding')
      assert.equal((await post(route, JSON.stringify({ context: 'x'.repeat(17 * 1024 * 1024) }), false)).status, 401)
    }
    assert.equal((await post('/api/agents/test/chat', JSON.stringify({ context: 'x'.repeat(17 * 1024 * 1024) }))).status, 413)
    assert.equal((await post('/api/agents/test/chat', '{')).status, 400)
    assert.equal((await post('/api/other', longReply)).status, 413, 'Other routes retain the small default limit')
    assert.equal((await post('/api/other', '{}')).status, 204)
    console.log('chat-request-body.test.ts: passed (real HTTP, long context, auth before parsing, size and malformed limits)')
  } finally { await new Promise<void>(resolve => server.close(() => resolve())) }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
