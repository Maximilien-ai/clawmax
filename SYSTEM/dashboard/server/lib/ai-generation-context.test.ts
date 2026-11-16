import assert from 'assert'
import http from 'http'
import express from 'express'
import { aiGenerationRequestContext, getRequestByokKeys, setRequestByokKeys, withRequestByokKeys } from './ai-generation-context'
async function run() {
  await withRequestByokKeys(undefined, async () => {
    assert.equal(getRequestByokKeys(), undefined)
    const original = { openai: 'synthetic-snapshot' }
    await withRequestByokKeys(undefined, async () => {
      setRequestByokKeys(original)
      original.openai = 'mutated-input'
      await Promise.resolve()
      assert.equal(getRequestByokKeys()?.openai, 'synthetic-snapshot', 'Setter snapshots caller-owned key objects')
    })
    assert.equal(getRequestByokKeys(), undefined, 'Nested empty scopes restore their empty parent')
    await assert.rejects(withRequestByokKeys(undefined, async () => {
      setRequestByokKeys({ openai: 'synthetic-failed-child' })
      throw new Error('empty child failed')
    }), /empty child failed/)
    assert.equal(getRequestByokKeys(), undefined, 'Rejected empty children cannot alter their parent')
  })
  assert.equal(getRequestByokKeys(), undefined, 'An initially empty scope never leaks into its caller')
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
