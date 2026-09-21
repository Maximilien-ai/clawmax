import assert from 'assert'
import fs from 'fs'
import os from 'os'
import path from 'path'
import http from 'http'
import express from 'express'
import { createInstanceGroupsRouter } from './instance-groups'
import type { CliTemplateExecution } from './instance-chat'

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-group-contract-'))
  const groupId = 'tr-0123456789abcdef-group-0123456789ab'
  fs.mkdirSync(path.join(root, 'ORG'))
  fs.writeFileSync(path.join(root, 'ORG/GROUPS.md'), `## Groups\n### ${groupId}\n- **Members:** producer, reviewer\n`)
  let calls = 0
  let authorized = true
  let fail = false
  let cleaned = false
  const service = {
    store: { workspaceId: 'test', workspacePath: root, history: () => [{ id: 'revision', actorId: 'alice', cleanedAt: cleaned ? 'now' : undefined, resources: { groups: { review: groupId } } }] },
    coordinator: { workspaceId: 'test', workspacePath: root, verifyStagedExecution: async () => {},
      executeNoToolsGroup: async () => { calls++; if (fail) throw new Error('secret-runtime-details'); return { text: JSON.stringify({ stopReason: 'turn_limit', turns: [
        { sequence: 1, agentId: 'producer', text: 'First reply' }, { sequence: 2, agentId: 'reviewer', text: 'Review reply' },
      ] }) } },
    }, authority: {}, policies: {}, runtime: {}, assertStopped() {},
  } as unknown as CliTemplateExecution
  const app = express()
  app.use(express.json())
  app.use('/workspaces/:workspaceId', createInstanceGroupsRouter({
    authorize(req, res) {
      const actorId = req.get('authorization')
      if (!actorId) { res.status(401).end(); return null }
      if (req.params.workspaceId !== 'test') { res.status(403).end(); return null }
      return { actorId, workspaceId: 'test', workspacePath: root, run: async fn => fn(), assertAuthorized() { if (!authorized) throw new Error('revoked') } }
    }, templateExecution: () => service,
  }))
  const server = http.createServer(app)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${(server.address() as import('net').AddressInfo).port}/workspaces/test/groups/${groupId}`
  const body = (key: string, extra = {}) => ({ apiVersion: 'clawmax.instance/v1', kind: 'GroupChatRequest', message: 'Private input', idempotencyKey: key, ...extra })
  const request = async (value?: unknown, actor = 'alice') => {
    const response = await fetch(base + (value ? '/chat/sessions' : '/messages'), { method: value ? 'POST' : 'GET',
      headers: { ...(actor ? { authorization: actor } : {}), 'content-type': 'application/json' }, ...(value ? { body: JSON.stringify(value) } : {}) })
    const text = await response.text()
    return { status: response.status, text, items: text.trim() ? text.trim().split('\n').map(line => JSON.parse(line)) : [] }
  }
  try {
    assert.equal((await request(body('unauth'), '')).status, 401)
    assert.equal((await request(body('other'), 'bob')).status, 404)
    assert.deepEqual((await request()).items[0].items, [])
    assert.equal((await request(body('invalid', { model: 'untrusted' }))).status, 400)
    assert.equal((await request(body('session', { sessionId: 'other' }))).status, 409)
    const first = await request(body('first'))
    assert.deepEqual(first.items.map(item => item.type), ['start', 'delta', 'delta', 'done'])
    first.items.forEach((item, index) => { assert.equal(item.sequence, index + 1); assert.equal(item.sessionId, first.items[0].sessionId); assert.equal(item.groupId, groupId) })
    assert.equal((await request(body('first'))).text, first.text)
    assert.equal(calls, 1)
    assert.equal((await request(body('first', { message: 'changed' }))).status, 409)
    const history = (await request()).items[0].items
    assert.equal(history.length, 3)
    assert.equal(history[1].senderId, 'reviewer')
    assert.equal(history[2].content, 'Group stopped: turn_limit')
    assert.equal(history[0].sessionId, first.items[0].sessionId)
    cleaned = true
    assert.equal((await request()).status, 404)
    cleaned = false
    authorized = false
    assert.equal((await request()).status, 503)
    authorized = true
    fail = true
    const unresolved = await request(body('uncertain'))
    assert.deepEqual(unresolved.items.map(item => item.type), ['start', 'error'])
    assert(!unresolved.text.includes('secret'))
    assert.equal((await request(body('uncertain'))).status, 409)
    assert.equal(calls, 2)
    for (const directory of fs.readdirSync(path.join(root, '.clawmax/cli-groups'))) {
      for (const file of fs.readdirSync(path.join(root, '.clawmax/cli-groups', directory))) {
        const full = path.join(root, '.clawmax/cli-groups', directory, file)
        assert.equal(fs.statSync(full).mode & 0o777, 0o600)
        assert(!fs.readFileSync(full, 'utf8').includes('Private input'))
      }
    }
    console.log('Public Group chat/history contract passed: ownership, correlation, replay, invalid input, cleanup, revocation, uncertain execution and private storage')
  } finally {
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
    fs.rmSync(root, { recursive: true, force: true })
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
