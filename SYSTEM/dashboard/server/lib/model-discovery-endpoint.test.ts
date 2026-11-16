import assert from 'assert'
import http from 'http'
import { __test, clearModelCache, getCachedOpenAiCompatibleDefaultModel, resolveOpenAiCompatibleDefaultModel } from './model-discovery'
import { setOpenClawModelCatalogForTests } from './openclaw-model-catalog'
import { createAiGenerationClient, warmOpenAiCompatibleGenerationModel, withRequestByokScope } from './ai-generator'
import { getWorkspacePath } from './workspace'
import fs from 'fs'
import path from 'path'

async function run() {
  const priorOrigins = process.env.CLAWMAX_MODEL_ENDPOINT_ORIGINS
  const priorKind = process.env.DASHBOARD_DEPLOYMENT_KIND
  setOpenClawModelCatalogForTests(null)
  let stolen = 0, authorized = 0
  const other = http.createServer((_req, res) => { stolen++; res.end('{"data":[]}') })
  const service = http.createServer((_req, res) => {
    authorized++
    const target = other.address() as { port: number }
    res.writeHead(302, { Location: `http://127.0.0.1:${target.port}/models` })
    res.end()
  })
  const catalogs = new Map<string, number>()
  const completions: Array<{ key: string; model: string }> = []
  const provider = http.createServer(async (req, res) => {
    const key = String(req.headers.authorization || '')
    res.setHeader('Content-Type', 'application/json')
    if (req.url === '/v1/models') {
      catalogs.set(key, (catalogs.get(key) || 0) + 1)
      res.end(JSON.stringify({ data: [{ id: 'text-embedding-fixture' }, { id: key.endsWith('tenant-a') ? 'fixture-chat-a' : 'fixture-chat-b' }] }))
    } else if (req.url === '/v1/chat/completions') {
      const chunks: Buffer[] = []
      for await (const chunk of req) chunks.push(Buffer.from(chunk))
      const body = JSON.parse(Buffer.concat(chunks).toString())
      completions.push({ key, model: body.model })
      res.end(JSON.stringify({ id: 'synthetic-completion', object: 'chat.completion', model: body.model, choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: 'PONG' } }] }))
    } else { res.writeHead(404); res.end('{}') }
  })
  const integrationPath = path.join(getWorkspacePath(), 'SYSTEM/integrations.json')
  const previousIntegration = fs.existsSync(integrationPath) ? fs.readFileSync(integrationPath) : undefined
  try {
    await Promise.all([other, service, provider].map(server => new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))))
    const base = `http://127.0.0.1:${(service.address() as { port: number }).port}`
    const providerBase = `http://127.0.0.1:${(provider.address() as { port: number }).port}/v1`
    process.env.CLAWMAX_MODEL_ENDPOINT_ORIGINS = [base, providerBase].join(',')
    process.env.DASHBOARD_DEPLOYMENT_KIND = 'local'
    clearModelCache()
    const models = await __test.fetchOpenAICompatibleModels(base, 'disposable-test-key')
    assert.deepStrictEqual(models, [], 'Redirected discovery must fail closed')
    assert.equal(authorized, 1, 'Only the approved service receives the request')
    assert.equal(stolen, 0, 'A redirect must not receive a second request or credential')

    const discovered = await Promise.all(Array.from({ length: 8 }, (_, i) => resolveOpenAiCompatibleDefaultModel({ baseUrl: providerBase, apiKey: i % 2 ? 'tenant-a' : 'tenant-b' })))
    assert.deepEqual(discovered, ['fixture-chat-b', 'fixture-chat-a', 'fixture-chat-b', 'fixture-chat-a', 'fixture-chat-b', 'fixture-chat-a', 'fixture-chat-b', 'fixture-chat-a'])
    assert.equal(catalogs.get('Bearer tenant-a'), 1, 'Concurrent requests coalesce only within the same credential')
    assert.equal(catalogs.get('Bearer tenant-b'), 1)
    assert.equal(getCachedOpenAiCompatibleDefaultModel(providerBase, 'another-tenant'), undefined, 'Unknown credentials cannot read another tenant catalog')

    fs.mkdirSync(path.dirname(integrationPath), { recursive: true })
    fs.writeFileSync(integrationPath, JSON.stringify({ enabledRuntimes: [] }))
    await Promise.all(['tenant-a', 'tenant-b'].map(apiKey => withRequestByokScope(async () => {
      const keys = { openaiCompatibleBaseUrl: providerBase, openaiCompatibleApiKey: apiKey }
      await warmOpenAiCompatibleGenerationModel(keys)
      const { client, model } = createAiGenerationClient(keys)
      const result = await client.chat.completions.create({ model, messages: [{ role: 'user', content: 'Synthetic protocol check; return PONG' }], max_tokens: 8 })
      assert.equal(result.choices[0]?.message.content, 'PONG')
      assert.equal(model, apiKey === 'tenant-a' ? 'fixture-chat-a' : 'fixture-chat-b')
    })))
    assert.deepEqual(completions.sort((a, b) => a.key.localeCompare(b.key)), [
      { key: 'Bearer tenant-a', model: 'fixture-chat-a' }, { key: 'Bearer tenant-b', model: 'fixture-chat-b' },
    ], 'The real SDK must send each discovered model with its own credential')
    assert.equal(stolen, 0)
    console.log('model-discovery-endpoint.test.ts: redirect refusal, credential-scoped discovery/coalescing and real SDK generation passed')
  } finally {
    for (const server of [service, other, provider]) server.closeAllConnections()
    await Promise.all([service, other, provider].map(server => new Promise<void>(resolve => server.close(() => resolve()))))
    if (previousIntegration === undefined) fs.rmSync(integrationPath, { force: true })
    else fs.writeFileSync(integrationPath, previousIntegration)
    if (priorOrigins === undefined) delete process.env.CLAWMAX_MODEL_ENDPOINT_ORIGINS
    else process.env.CLAWMAX_MODEL_ENDPOINT_ORIGINS = priorOrigins
    if (priorKind === undefined) delete process.env.DASHBOARD_DEPLOYMENT_KIND
    else process.env.DASHBOARD_DEPLOYMENT_KIND = priorKind
    clearModelCache()
  }
}
run().catch(error => { console.error(error); process.exitCode = 1 })
