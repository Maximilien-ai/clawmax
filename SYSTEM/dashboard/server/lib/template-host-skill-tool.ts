import { executeHostAgentSkillRead, HostAgentSkillResult } from './host-agent-skill-client'
import { inspectTemplateHostSkill } from './template-host-skill-inspection'
import { TemplateAuthoritySource } from './template-authority'
import { TemplateRevisionStore } from './template-revisions'

/** Called only by a trusted, authenticated Agent tool owner. It is not an
 * HTTP/browser action and does not make staged Template chat executable. */
export async function runTemplateHostSkillRead(input: {
  instanceKey: string
  workspaceId: string
  actorId: string
  revisionId: string
  agentId: string
  skillName: string
  arguments: string[]
  hostKey: string
  store: Pick<TemplateRevisionStore, 'workspaceId' | 'workspacePath' | 'verifyExecutionResources'>
  authority: TemplateAuthoritySource
  assertAuthorized: () => void
  inspect?: typeof inspectTemplateHostSkill
  invoke?: typeof executeHostAgentSkillRead
}): Promise<HostAgentSkillResult> {
  input.assertAuthorized()
  if (input.store.workspaceId !== input.workspaceId || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(input.instanceKey)) {
    throw new Error('Agent Skill authority is unavailable')
  }
  const inspect = input.inspect || inspectTemplateHostSkill
  const evidence = inspect({ store: input.store, authority: input.authority, actorId: input.actorId,
    revisionId: input.revisionId, agentId: input.agentId, skillName: input.skillName })
  input.assertAuthorized()
  const result = await (input.invoke || executeHostAgentSkillRead)({
    scope: { instanceKey: input.instanceKey, ...evidence }, arguments: input.arguments, hostKey: input.hostKey,
  })
  input.assertAuthorized()
  if (result.status !== 'completed') return result
  // The host already rechecks authority before child spawn. The server-side
  // actor may have been revoked during the call; do not deliver business data.
  inspect({ store: input.store, authority: input.authority, actorId: input.actorId,
    revisionId: input.revisionId, agentId: input.agentId, skillName: input.skillName })
  input.assertAuthorized()
  return result
}
