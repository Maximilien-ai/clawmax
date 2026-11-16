import assert from 'assert'
import { executeHostAgentSkillRead } from './host-agent-skill-client'

async function main() {
  const key = 'a'.repeat(64)
  const scope = { instanceKey: 'dev-instance', workspaceId: 'isolated', workspaceRevisionId: 'revision-1',
    agentId: 'collector', skillName: 'maximilien', skillDigest: `sha256:${'b'.repeat(64)}`,
    actorId: 'owner', credentialNames: ['MAXIMILIEN_ACCESS_TOKEN'] }
  let calls = 0
  const output = { apiVersion: 'maximilien.ai/v1alpha1', kind: 'ResourceList', resource: 'inquiries', items: [] }
  const fetcher = async (url: string | URL | Request, options?: RequestInit): Promise<Response> => {
    calls++
    assert.equal(String(url), 'http://127.0.0.1:43204/v1/agent-skill/execute')
    const headers = options?.headers as Record<string, string>
    assert.equal(headers['X-ClawMax-Host-Key'], key)
    assert.equal(headers.Origin, undefined)
    const invocation = JSON.parse(String(options?.body))
    assert.equal(invocation.apiVersion, 'clawmax.host-agent-skill-invocation/v1alpha1')
    assert.equal(invocation.scope.operation, 'maximilien.cli.v1')
    assert.equal(invocation.scope.workspaceRevisionId, 'revision-1')
    assert.deepEqual(invocation.arguments, ['inquiries', 'list', '--json'])
    assert.match(invocation.scope.requestId, /^[a-f0-9]{64}$/)
    assert.equal(Date.parse(invocation.scope.expiresAt) - Date.parse(invocation.scope.issuedAt), 30000)
    return Response.json({ apiVersion: 'clawmax.host-agent-skill/v1alpha1', kind: 'AgentSkillExecutionResult',
      requestId: invocation.scope.requestId, status: 'completed', resultDigest: `sha256:${'c'.repeat(64)}`, output })
  }
  const input = { scope, arguments: ['inquiries', 'list', '--json'], hostKey: key, fetcher: fetcher as typeof fetch,
    now: () => new Date('2026-09-25T12:00:00Z') }
  const result = await executeHostAgentSkillRead(input)
  assert.deepEqual(result.output, output)
  assert.equal(calls, 1)
  await assert.rejects(executeHostAgentSkillRead({ ...input, hostKey: 'bad' }), /Invalid host Skill invocation/)
  assert.equal(calls, 1, 'Invalid key cannot reach the host')
  await assert.rejects(executeHostAgentSkillRead({ ...input, fetcher: (async (_url: unknown, options: RequestInit) => {
    const invocation = JSON.parse(String(options.body))
    return Response.json({ apiVersion: 'clawmax.host-agent-skill/v1alpha1', kind: 'AgentSkillExecutionResult',
      requestId: invocation.scope.requestId, status: 'completed', resultDigest: `sha256:${'c'.repeat(64)}`,
      output: { ...output, accessToken: 'must-not-leak' } })
  }) as typeof fetch }), /Host Skill result is invalid/)
  const blocked = await executeHostAgentSkillRead({ ...input, fetcher: (async (_url: unknown, options: RequestInit) => {
    const invocation = JSON.parse(String(options.body))
    return Response.json({ apiVersion: 'clawmax.host-agent-skill/v1alpha1', kind: 'AgentSkillExecutionResult',
      requestId: invocation.scope.requestId, status: 'blocked', code: 'reauth_required' }, { status: 403 })
  }) as typeof fetch })
  assert.equal(blocked.code, 'reauth_required')
  console.log('host-agent-skill-client.test.ts: passed')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
