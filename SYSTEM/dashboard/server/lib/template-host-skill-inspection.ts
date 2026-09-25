import fs from 'fs'
import path from 'path'
import { isDeepStrictEqual } from 'util'
import { sha256 } from './portable-template'
import { PortableTemplateError } from './portable-template-zip'
import { revalidateTemplateAuthority, TemplateAuthoritySource } from './template-authority'
import { TemplateRevisionStore } from './template-revisions'
import { templateStoragePath } from './template-storage-path'

/** Read-only evidence for a future authenticated Mac-host authority query.
 * This is never an execution grant and must not be exposed to a browser.
 * The host independently verifies its own installed Skill file before use.
 */
export function inspectTemplateHostSkill(input: {
  store: Pick<TemplateRevisionStore, 'workspaceId' | 'workspacePath' | 'verifyExecutionResources'>
  authority: TemplateAuthoritySource
  actorId: string
  revisionId: string
  agentId: string
  skillName: string
}) {
  const { store, authority, actorId, revisionId, agentId, skillName } = input
  const unavailable = () => new PortableTemplateError('template_skill_unavailable', 'Current Template Skill binding is unavailable', 409)
  if (!/^[a-z0-9][a-z0-9._-]{0,62}$/.test(skillName)) throw unavailable()
  const revision = store.verifyExecutionResources(actorId, revisionId, agentId)
  if (!revision.authority) throw unavailable()
  const artifactIds = Object.entries(revision.resources.agents).filter(([, id]) => id === agentId).map(([id]) => id)
  if (artifactIds.length !== 1) throw unavailable()
  const context = { workspaceId: store.workspaceId, actorId }
  const admitted = revalidateTemplateAuthority(revision.authority, revision.authorityDigest, context, authority)
  const bindings = admitted.bindings.filter(binding => binding.artifactId === artifactIds[0])
  if (bindings.length !== 1) throw unavailable()
  const skills = bindings[0].skills.filter(skill => skill.name === skillName)
  if (skills.length !== 1 || !/^[a-f0-9]{64}$/.test(skills[0].sha256)) throw unavailable()
  let fd: number | undefined
  try {
    const file = templateStoragePath(store.workspacePath, `SKILLS/custom/${skillName}/SKILL.md`)
    fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK)
    const stat = fs.fstatSync(fd)
    if (!stat.isFile() || stat.size < 1 || stat.size > 1024 * 1024 || sha256(fs.readFileSync(fd)) !== skills[0].sha256) throw unavailable()
  } catch { throw unavailable() } finally { if (fd !== undefined) fs.closeSync(fd) }
  // Revocation or a changed revision during inspection must fail closed.
  const fresh = store.verifyExecutionResources(actorId, revisionId, agentId)
  if (!isDeepStrictEqual(fresh, revision)) throw unavailable()
  revalidateTemplateAuthority(fresh.authority!, fresh.authorityDigest, context, authority)
  return {
    workspaceId: store.workspaceId,
    workspaceRevisionId: revisionId,
    agentId,
    actorId,
    skillName,
    skillDigest: `sha256:${skills[0].sha256}`,
    credentialNames: [...new Set(bindings[0].credentials.map(item => item.name))].sort(),
  }
}
