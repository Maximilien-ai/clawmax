/** Operator-only local provisioning for an inert, imported Template revision. */
import fs from 'fs'
import path from 'path'
import { InstanceTemplateCatalog, writeAtomicJson } from './instance-template-catalog'
import { sha256 } from './portable-template'
import { noToolsTemplatePolicy } from './template-execution-policy'
import { resolveTemplateAuthority, TemplateAuthorityRegistry } from './template-authority'
import { describePackagedTemplateSkill } from './template-skill-package'
import { REPO_ROOT } from './paths'
import { getDashboardVersion } from './workspace'

const id = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
const model = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/
const digest = /^[a-f0-9]{64}$/

export async function provisionLocalStagingAuthority(input: {
  workspacePath: string; workspaceId: string; templateId: string; bundleSha256: string
  actorId: string; modelId: string; credentialAgentId: string; packagedSkillNames: string[]
  authorityDirectory: string; runtimeRevision: string; platform: 'linux/amd64' | 'linux/arm64'
  packagedSkillRoot?: string; packagedSkillVersion?: string
}) {
  if (![input.workspaceId, input.templateId, input.actorId, input.runtimeRevision].every(value => id.test(value))
    || !model.test(input.modelId) || !digest.test(input.bundleSha256)
    || !path.isAbsolute(input.workspacePath) || !path.isAbsolute(input.authorityDirectory)) throw new Error('Invalid staging authority input')
  const workspace = fs.realpathSync(input.workspacePath)
  const requestedAuthority = path.resolve(input.authorityDirectory)
  const requestedRelative = path.relative(workspace, requestedAuthority)
  if (!requestedRelative || (requestedRelative !== '..' && !requestedRelative.startsWith(`..${path.sep}`))) throw new Error('Authority must be outside the workspace')
  fs.mkdirSync(input.authorityDirectory, { recursive: true, mode: 0o700 })
  const authorityDirectory = fs.realpathSync(input.authorityDirectory)
  const relative = path.relative(workspace, authorityDirectory)
  if (!relative || (relative !== '..' && !relative.startsWith(`..${path.sep}`))) throw new Error('Authority must be outside the workspace')
  if (fs.statSync(authorityDirectory).mode & 0o077) throw new Error('Authority directory must be private')

  const catalog = new InstanceTemplateCatalog(workspace, input.workspaceId)
  const record = catalog.get(input.templateId)
  if (record.bundleSha256 !== input.bundleSha256) throw new Error('Imported Template digest changed')
  const bundle = await catalog.bundle(input.templateId)
  const agents = bundle.artifacts.filter(item => item.kind === 'agent')
  const requirements = bundle.manifest.secretRequirements
  if ((requirements.length && !agents.some(agent => agent.id === input.credentialAgentId))
    || (!requirements.length && input.credentialAgentId !== 'none')) throw new Error('Credential Agent selection is invalid')
  const approvedPackaged = new Set(input.packagedSkillNames)
  if (approvedPackaged.size !== input.packagedSkillNames.length) throw new Error('Packaged Skill approval is ambiguous')
  const packaged = { root: input.packagedSkillRoot || path.join(REPO_ROOT, 'SKILLS', 'custom'),
    version: input.packagedSkillVersion || getDashboardVersion() }
  const usedPackaged = new Set<string>()
  const policyId = 'no-tools'
  const registry: TemplateAuthorityRegistry = {
    apiVersion: 'clawmax.template-authority/v1alpha1', workspaceId: input.workspaceId,
    revision: input.runtimeRevision,
    bindings: agents.map(agent => ({
      id: `${agent.id}-binding`, revision: input.runtimeRevision,
      artifactId: agent.id, artifactDigest: agent.digest,
      actorIds: [input.actorId], disabled: false,
      model: { id: input.modelId, revision: input.runtimeRevision },
      policy: { id: policyId, sha256: sha256(JSON.stringify(noToolsTemplatePolicy(policyId))) },
      runtime: { platform: input.platform, revision: input.runtimeRevision },
      skills: agent.definition.skills.map((name: string) => {
        const embedded = agent.files?.get(`content/skills/${name}/SKILL.md`)
        if (embedded) {
          if (approvedPackaged.has(name)) throw new Error('Embedded Skill cannot also be approved as packaged')
          return { name, sha256: sha256(embedded), platform: input.platform }
        }
        if (!approvedPackaged.has(name)) throw new Error('Unapproved packaged Skill')
        usedPackaged.add(name)
        return { name, ...describePackagedTemplateSkill(packaged, name), source: 'packaged' as const,
          version: packaged.version, platform: input.platform }
      }),
      credentials: agent.id === input.credentialAgentId
        ? requirements.map((requirement: { name: string }) => ({ name: requirement.name, state: 'pending-host-login' as const })) : [],
    })),
  }
  if (usedPackaged.size !== approvedPackaged.size) throw new Error('Packaged Skill approval was unused')
  const selections = Object.fromEntries(agents.map(agent => [agent.id, `${agent.id}-binding`]))
  resolveTemplateAuthority(bundle, selections, { workspaceId: input.workspaceId, actorId: input.actorId },
    { runtime: { platform: input.platform, revision: input.runtimeRevision }, read: () => registry })
  const file = path.join(authorityDirectory, `${sha256(input.workspaceId)}.json`)
  if (fs.existsSync(file)) throw new Error('Authority registry already exists; refusing to overwrite it')
  writeAtomicJson(file, registry)
  return { file, workspaceId: input.workspaceId, templateId: input.templateId,
    agents: agents.length, packagedSkills: [...usedPackaged].sort(), pendingRequirements: requirements.map((item: { name: string }) => item.name) }
}

if (require.main === module) {
  const [workspacePath, workspaceId, templateId, bundleSha256, actorId, modelId, credentialAgentId,
    packagedSkills, authorityDirectory, runtimeRevision, platform] = process.argv.slice(2)
  if (!platform || !['linux/amd64', 'linux/arm64'].includes(platform)) throw new Error('Usage: ts-node template-local-staging-authority.ts <workspace-path> <workspace-id> <template-id> <bundle-sha256> <actor-id> <model-id> <credential-agent-id|none> <packaged-skill-names-comma-separated> <authority-dir> <runtime-revision> <linux/amd64|linux/arm64>')
  provisionLocalStagingAuthority({ workspacePath, workspaceId, templateId, bundleSha256, actorId, modelId,
    credentialAgentId, packagedSkillNames: packagedSkills ? packagedSkills.split(',').filter(Boolean) : [],
    authorityDirectory, runtimeRevision, platform: platform as 'linux/amd64' | 'linux/arm64' })
    .then(result => console.log(JSON.stringify(result)), error => { console.error(error.message); process.exitCode = 1 })
}
