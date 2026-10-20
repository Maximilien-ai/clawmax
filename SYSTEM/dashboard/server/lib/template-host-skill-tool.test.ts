import assert from 'assert'
import { runTemplateHostSkillRead } from './template-host-skill-tool'
import type { TemplateRevisionStore } from './template-revisions'
import type { inspectTemplateHostSkill } from './template-host-skill-inspection'
import type { executeHostAgentSkillRead } from './host-agent-skill-client'

async function main() {
  let authorized = true
  let bindingCurrent = true
  let inspected = 0
  let invoked = 0
  const input = {
    instanceKey: 'dev-instance', workspaceId: 'isolated', actorId: 'owner', revisionId: 'revision-1',
    agentId: 'collector', skillName: 'maximilien', arguments: ['inquiries', 'list', '--json'], hostKey: 'a'.repeat(64),
    store: { workspaceId: 'isolated', workspacePath: '/private/isolated' } as TemplateRevisionStore,
    authority: { runtime: { platform: 'linux/arm64', revision: 'runtime-1' }, read: () => ({}) },
    assertAuthorized: () => { if (!authorized) throw new Error('revoked actor') },
    inspect: (() => {
      inspected++
      if (!bindingCurrent) throw new Error('revoked binding')
      return { workspaceId: 'isolated', workspaceRevisionId: 'revision-1', actorId: 'owner', agentId: 'collector',
        skillName: 'maximilien', skillDigest: `sha256:${'b'.repeat(64)}`, credentialNames: ['MAXIMILIEN_ACCESS_TOKEN'] }
    }) as typeof inspectTemplateHostSkill,
    invoke: (async invocation => {
      invoked++
      assert.equal(invocation.scope.skillDigest, `sha256:${'b'.repeat(64)}`)
      assert.deepEqual(invocation.arguments, ['inquiries', 'list', '--json'])
      return { apiVersion: 'clawmax.host-agent-skill/v1alpha1', kind: 'AgentSkillExecutionResult', requestId: 'c'.repeat(64),
        status: 'completed', resultDigest: `sha256:${'d'.repeat(64)}`, output: { apiVersion: 'maximilien.ai/v1alpha1', kind: 'ResourceList', items: [] } }
    }) as typeof executeHostAgentSkillRead,
  }
  assert.equal((await runTemplateHostSkillRead(input)).status, 'completed')
  assert.equal(inspected, 2, 'Authority must be checked before invocation and before delivering business data')
  assert.equal(invoked, 1)
  authorized = false
  await assert.rejects(runTemplateHostSkillRead(input), /revoked actor/)
  assert.equal(invoked, 1)
  authorized = true
  bindingCurrent = false
  await assert.rejects(runTemplateHostSkillRead(input), /revoked binding/)
  assert.equal(invoked, 1)
  bindingCurrent = true
  await assert.rejects(runTemplateHostSkillRead({ ...input, workspaceId: 'other' }), /authority is unavailable/)
  await assert.rejects(runTemplateHostSkillRead({ ...input, invoke: (async () => { bindingCurrent = false; return input.invoke({
    scope: { instanceKey: 'dev-instance', workspaceId: 'isolated', workspaceRevisionId: 'revision-1', actorId: 'owner', agentId: 'collector', skillName: 'maximilien', skillDigest: `sha256:${'b'.repeat(64)}`, credentialNames: ['MAXIMILIEN_ACCESS_TOKEN'] },
    arguments: ['inquiries', 'list', '--json'], hostKey: input.hostKey,
  }) }) as typeof executeHostAgentSkillRead }), /revoked binding/)
  console.log('template-host-skill-tool.test.ts: passed')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
