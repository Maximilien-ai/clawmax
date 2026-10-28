import assert from 'assert'
import http from 'http'
import express from 'express'
import { aiGenerationRequestContext, getRequestByokKeys, setRequestByokKeys, withRequestByokKeys } from './ai-generation-context'
async function run() {
  const app = express()
  app.use(aiGenerationRequestContext)
  app.get('/', async (req, res) => {
    assert.equal(getRequestByokKeys(), undefined, 'A new request never inherits another credential')
    if (req.query.key) setRequestByokKeys({ openai: String(req.query.key) })
    await new Promise(resolve => setTimeout(resolve, Number(req.query.delay || 0)))
    res.json({ key: getRequestByokKeys()?.openai || null })
  })
  const server = http.createServer(app)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${(server.address() as any).port}`
  try {
    const results = await Promise.all(['?key=synthetic-a&delay=80', '?key=synthetic-b&delay=10', '?delay=30'].map(async query => (await fetch(base + '/' + query)).json()))
    assert.deepEqual(results.map(result => (result as { key: string | null }).key), ['synthetic-a', 'synthetic-b', null])
    assert.deepEqual(await (await fetch(base)).json(), { key: null }, 'Keep-alive requests remain empty')
    await assert.rejects(withRequestByokKeys({ openai: 'synthetic-rejected' }, async () => { await Promise.resolve(); throw new Error('fixture') }), /fixture/)
    assert.equal(getRequestByokKeys(), undefined, 'Rejected work restores its parent context')
    await withRequestByokKeys({ openai: 'synthetic-parent' }, async () => {
      await withRequestByokKeys({ openai: 'synthetic-child' }, async () => assert.equal(getRequestByokKeys()?.openai, 'synthetic-child'))
      assert.equal(getRequestByokKeys()?.openai, 'synthetic-parent')
    })
    console.log('AI generation request isolation tests passed')
  } finally { await new Promise<void>(resolve => server.close(() => resolve())) }
}
run().catch(error => { console.error(error); process.exitCode = 1 })
