import assert from 'assert'
import http from 'http'
import { __test, clearModelCache } from './model-discovery'

async function run() {
  const priorOrigins = process.env.CLAWMAX_MODEL_ENDPOINT_ORIGINS
  const priorKind = process.env.DASHBOARD_DEPLOYMENT_KIND
  let stolen = 0, authorized = 0
  const other = http.createServer((_req, res) => { stolen++; res.end('{"data":[]}') })
  const service = http.createServer((req, res) => {
    authorized++
    assert.equal(req.headers.authorization, 'Bearer disposable-test-key')
    const target = other.address() as { port: number }
    res.writeHead(302, { Location: `http://127.0.0.1:${target.port}/models` })
    res.end()
  })
  try {
    await new Promise<void>(resolve => other.listen(0, '127.0.0.1', resolve))
    await new Promise<void>(resolve => service.listen(0, '127.0.0.1', resolve))
    const base = `http://127.0.0.1:${(service.address() as { port: number }).port}`
    process.env.CLAWMAX_MODEL_ENDPOINT_ORIGINS = base
    process.env.DASHBOARD_DEPLOYMENT_KIND = 'local'
    clearModelCache()
    const models = await __test.fetchOpenAICompatibleModels(base, 'disposable-test-key')
    assert.deepStrictEqual(models, [], 'Redirected discovery must fail closed')
    assert.equal(authorized, 1, 'Only the approved service receives the request')
    assert.equal(stolen, 0, 'A redirect must not receive a second request or credential')
    console.log('model-discovery-endpoint.test.ts: 3 tests passed')
  } finally {
    service.closeAllConnections(); other.closeAllConnections()
    await Promise.all([new Promise<void>(resolve => service.close(() => resolve())), new Promise<void>(resolve => other.close(() => resolve()))])
    if (priorOrigins === undefined) delete process.env.CLAWMAX_MODEL_ENDPOINT_ORIGINS
    else process.env.CLAWMAX_MODEL_ENDPOINT_ORIGINS = priorOrigins
    if (priorKind === undefined) delete process.env.DASHBOARD_DEPLOYMENT_KIND
    else process.env.DASHBOARD_DEPLOYMENT_KIND = priorKind
    clearModelCache()
  }
}
run().catch(error => { console.error(error); process.exit(1) })
