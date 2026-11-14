// Native primitives used by persisted chat, streaming responses and owned runtimes.
const assert = require('node:assert/strict')
const { test } = require('node:test')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const http = require('node:http')
const { spawn } = require('node:child_process')
const { once } = require('node:events')
const { DatabaseSync } = require('node:sqlite')

test('runs on the selected runtime with required native APIs', () => {
 if (process.env.CLAWMAX_EXPECT_NODE_VERSION) assert.equal(process.versions.node, process.env.CLAWMAX_EXPECT_NODE_VERSION)
 if (process.env.CLAWMAX_EXPECT_NODE_PLATFORM) assert.equal(process.platform, process.env.CLAWMAX_EXPECT_NODE_PLATFORM)
 assert.equal(typeof DatabaseSync, 'function')
 assert.equal(typeof fetch, 'function')
 assert.equal(typeof AbortSignal.timeout, 'function')
 console.log(`Runtime: Node ${process.versions.node}, ${process.platform}/${process.arch}`)
})

test('native SQLite WAL transactions persist exactly across close and reopen', t => {
 const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-node-sqlite-'))
 t.after(() => fs.rmSync(root, { recursive: true, force: true }))
 const file = path.join(root, 'runtime.sqlite')
 let db = new DatabaseSync(file)
 try {
  assert.equal(db.prepare('PRAGMA journal_mode=WAL').get().journal_mode, 'wal')
  db.exec('CREATE TABLE messages (id TEXT PRIMARY KEY, body TEXT NOT NULL); BEGIN')
  db.prepare('INSERT INTO messages VALUES (?, ?)').run('synthetic', 'Persisted synthetic content')
  db.exec('COMMIT')
 } finally { db.close() }
 db = new DatabaseSync(file)
 try {
  assert.deepEqual({ ...db.prepare('SELECT * FROM messages WHERE id = ?').get('synthetic') }, { id: 'synthetic', body: 'Persisted synthetic content' })
  assert.equal(db.prepare('SELECT count(*) AS total FROM messages').get().total, 1)
 } finally { db.close() }
})

test('aborting a streamed fetch settles its reader and closes the server response', async t => {
 let closed
 const server = http.createServer((_req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  closed = once(res, 'close', { signal: AbortSignal.timeout(3000) })
  res.write('data: synthetic-stream\n\n')
 })
 await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
 t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections() }))
 const controller = new AbortController()
 t.after(() => controller.abort())
 const response = await fetch(`http://127.0.0.1:${server.address().port}`, { signal: controller.signal })
 const reader = response.body.getReader()
 const first = await reader.read()
 assert.equal(new TextDecoder().decode(first.value), 'data: synthetic-stream\n\n')
 controller.abort()
 await assert.rejects(reader.read(), error => error.name === 'AbortError')
 await closed
})

test('an owned child receives SIGTERM and reports a settled successful exit', async t => {
 const child = spawn(process.execPath, ['-e', 'process.on("SIGTERM",()=>process.exit(0)); console.log("READY"); setInterval(()=>{},1000)'], { stdio: ['ignore', 'pipe', 'pipe'] })
 t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL') })
 const [output] = await once(child.stdout, 'data', { signal: AbortSignal.timeout(3000) })
 assert.equal(output.toString().trim(), 'READY')
 const exit = once(child, 'exit', { signal: AbortSignal.timeout(3000) })
 assert(child.kill('SIGTERM'))
 assert.deepEqual(await exit, [0, null])
})
