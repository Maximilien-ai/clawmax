const assert = require('node:assert/strict')
const fs = require('node:fs')
const http = require('node:http')
const path = require('node:path')
const { once } = require('node:events')
const { pathToFileURL } = require('node:url')
const { test } = require('node:test')

const bundle = path.join(__dirname, 'node_modules/@cognee/cognee-openclaw')
const transport = import(pathToFileURL(path.join(bundle, 'dist/src/client.js')).href)
const fixtureKey = 'synthetic-memory-test-key'

async function endpoint(t, handler) {
  const server = http.createServer(handler)
  server.listen(0, '127.0.0.1')
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections() }))
  await once(server, 'listening')
  return `http://127.0.0.1:${server.address().port}`
}

function client(CogneeHttpClient, base, key = fixtureKey) {
  return new CogneeHttpClient(base, key, undefined, undefined, 1000, 300000, 'cloud')
}

// These fixtures never register a plugin, read user state or contact a provider.
test('the installed bundle matches its pins without installing an alternate host', async () => {
  const declared = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'))
  const lock = JSON.parse(fs.readFileSync(path.join(__dirname, 'package-lock.json'), 'utf8'))
  const installed = JSON.parse(fs.readFileSync(path.join(bundle, 'package.json'), 'utf8'))
  const undici = JSON.parse(fs.readFileSync(path.join(__dirname, 'node_modules/undici/package.json'), 'utf8'))
  assert.equal(installed.version, declared.dependencies['@cognee/cognee-openclaw'])
  assert.equal(undici.version, declared.overrides['@cognee/cognee-openclaw'].undici)
  assert.equal(undici.version, '7.30.1')
  assert.deepEqual(Object.keys(lock.packages).filter(name => name), ['node_modules/@cognee/cognee-openclaw', 'node_modules/undici'])
  assert(!fs.existsSync(path.join(__dirname, 'node_modules/openclaw')))
  await transport
})

test('missing cloud credentials refuse execution before HTTP', { timeout: 5000 }, async t => {
  const { CogneeHttpClient } = await transport
  let requests = 0
  const base = await endpoint(t, (_req, res) => { requests++; res.end('{}') })
  await assert.rejects(client(CogneeHttpClient, base, null).fetchAPI('/fixture', { method: 'GET' }, 1000, undefined, 0), /requires an API key/)
  assert.equal(requests, 0)
})

test('patched package transport preserves multipart bytes and API-key authentication', { timeout: 5000 }, async t => {
  const { CogneeHttpClient } = await transport
  let received
  const base = await endpoint(t, async (req, res) => {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    received = { url: req.url, headers: req.headers, bytes: Buffer.concat(chunks).toString() }
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ accepted: true }))
  })
  const form = new FormData()
  form.append('dataset', 'synthetic-only')
  form.append('file', new Blob(['synthetic fixture\nretained bytes']), 'fixture.txt')
  // The plugin selects its npm Undici dispatcher at >=300 seconds; the test's
  // own deadline bounds the fixture while its server responds immediately.
  const result = await client(CogneeHttpClient, base).fetchAPI('/fixture-upload', { method: 'POST', body: form }, 300001, undefined, 0)
  assert.deepEqual(result, { accepted: true })
  assert.equal(received.url, '/fixture-upload')
  assert.equal(received.headers['x-api-key'], fixtureKey)
  assert.equal(received.headers.authorization, undefined)
  assert.match(received.headers['content-type'], /^multipart\/form-data; boundary=/)
  assert.match(received.bytes, /filename="fixture.txt"/)
  assert(received.bytes.includes('synthetic fixture\nretained bytes'))
  assert(!received.bytes.includes('[object FormData]'))
})

test('HTTP refusal retains its status and is not retried when retries are disabled', { timeout: 5000 }, async t => {
  const { CogneeHttpClient, requestErrorStatus } = await transport
  let requests = 0
  const base = await endpoint(t, (_req, res) => { requests++; res.writeHead(403); res.end('synthetic refusal') })
  await assert.rejects(client(CogneeHttpClient, base).fetchAPI('/fixture', { method: 'GET' }, 300001, undefined, 0), error => {
    assert.equal(requestErrorStatus(error), 403)
    return true
  })
  assert.equal(requests, 1)
})

test('a stalled request aborts within the configured budget', { timeout: 5000 }, async t => {
  const { CogneeHttpClient } = await transport
  let closed
  const disconnected = new Promise(resolve => { closed = resolve })
  const base = await endpoint(t, (_req, res) => res.on('close', closed))
  await assert.rejects(client(CogneeHttpClient, base).fetchAPI('/fixture', { method: 'GET' }, 200, undefined, 0), error => error.name === 'AbortError')
  await disconnected
})

test('a disconnected upstream settles the package transport without retrying', { timeout: 5000 }, async t => {
  const { CogneeHttpClient } = await transport
  let requests = 0
  const base = await endpoint(t, req => { requests++; req.socket.destroy() })
  await assert.rejects(client(CogneeHttpClient, base).fetchAPI('/fixture', { method: 'GET' }, 300001, undefined, 0))
  assert.equal(requests, 1)
})
