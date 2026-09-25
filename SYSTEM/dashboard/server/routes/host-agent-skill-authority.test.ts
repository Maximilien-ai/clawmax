import assert from 'assert'
import http from 'http'
import express from 'express'
import { createHostAgentSkillAuthorityRouter } from './host-agent-skill-authority'

async function main() {
  const app = express()
  app.use(express.json())
  let enabled = true
  let currentDigest = `sha256:${'b'.repeat(64)}`
  let calls = 0
  const key = 'a'.repeat(64)
  app.use('/api/dev/host-agent-skill', createHostAgentSkillAuthorityRouter({
    enabled: () => enabled, secret: () => key, instanceKey: () => 'dev-instance',
    actorId: () => 'owner', workspaceId: () => 'isolated', now: () => Date.parse('2026-09-25T12:00:15Z'),
    inspect: input => { calls++; return { ...input, skillDigest: currentDigest, credentialNames: ['MAXIMILIEN_ACCESS_TOKEN'] } },
  }))
  const server = http.createServer(app)
  try {
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
    const port = (server.address() as { port: number }).port
    const request = {
      apiVersion: 'clawmax.credential-broker-agent-skill/v1alpha1', kind: 'AgentSkillExecutionRequest', requestId: 'c'.repeat(64),
      instanceKey: 'dev-instance', workspaceId: 'isolated', workspaceRevisionId: 'revision-1', agentId: 'collector',
      skillName: 'maximilien', skillDigest: currentDigest, actorId: 'owner', operation: 'maximilien.snapshot.v1',
      credentialNames: ['MAXIMILIEN_ACCESS_TOKEN'], issuedAt: '2026-09-25T12:00:00Z', expiresAt: '2026-09-25T12:00:30Z',
    }
    const call = async (body: unknown = request, hostKey = key) => {
      const response = await fetch(`http://127.0.0.1:${port}/api/dev/host-agent-skill/authority`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-ClawMax-Host-Key': hostKey }, body: JSON.stringify(body),
      })
      return { status: response.status, body: await response.json() as any, cache: response.headers.get('cache-control') }
    }
    assert.equal((await call(request, '')).status, 401)
    assert.equal(calls, 0, 'Authentication must precede authority lookup')
    enabled = false
    assert.equal((await call()).status, 404)
    enabled = true
    const admitted = await call()
    assert.equal(admitted.status, 200)
    assert.equal(admitted.cache, 'no-store')
    assert.equal(admitted.body.skillDigest, currentDigest)
    assert.equal(admitted.body.ownerAuthorized, true)
    assert(!JSON.stringify(admitted.body).includes('skillPath'))
    assert(!JSON.stringify(admitted.body).includes('token'))
    for (const invalid of [{ ...request, extra: true }, { ...request, operation: 'maximilien.write.v1' },
      { ...request, credentialNames: [] }, { ...request, issuedAt: 1 }, { ...request, expiresAt: '2026-09-25T12:00:01Z' }]) {
      assert.notEqual((await call(invalid)).status, 200)
    }
    assert.equal((await call({ ...request, instanceKey: 'other' })).status, 403)
    currentDigest = `sha256:${'d'.repeat(64)}`
    assert.equal((await call()).body.code, 'authority_revoked')
    console.log('host-agent-skill-authority.test.ts: passed')
  } finally { await new Promise<void>(resolve => server.close(() => resolve())) }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
