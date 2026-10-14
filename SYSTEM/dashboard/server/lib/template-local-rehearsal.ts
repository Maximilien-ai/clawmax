/** Disposable, offline Template staging rehearsal. Never points at a live workspace. */
import assert from 'assert'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { InstanceTemplateCatalog, writeAtomicJson } from './instance-template-catalog'
import { sha256, validatePortableTemplate } from './portable-template'
import { noToolsTemplatePolicy } from './template-execution-policy'
import { createConfiguredTemplateResolver } from './template-service'
import { describePackagedTemplateSkill } from './template-skill-package'
import { REPO_ROOT } from './paths'
import { getDashboardVersion } from './workspace'

async function main() {
  const zipPath = process.argv[2]
  const expectedZipSha256 = process.argv[3]
  const credentialAgentId = process.argv[4]
  const keepPreview = process.argv[5] === '--keep-preview'
  if (!zipPath || !/^[a-f0-9]{64}$/.test(expectedZipSha256 || '') || !credentialAgentId) throw new Error('Usage: ts-node template-local-rehearsal.ts <private-zip> <zip-sha256> <credential-agent-id|none> [--keep-preview]')
  const bytes = fs.readFileSync(zipPath)
  assert.equal(sha256(bytes), expectedZipSha256, 'Private ZIP does not match the handoff digest')
  const bundle = await validatePortableTemplate(bytes)
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-template-rehearsal-'))
  const workspace = path.join(root, 'workspace')
  const authorityDirectory = path.join(root, 'operator-authority')
  fs.mkdirSync(workspace)
  fs.mkdirSync(authorityDirectory)
  const gateway = { hash: '1', entries: {} as Record<string, unknown> }
  try {
    const catalog = new InstanceTemplateCatalog(workspace, 'isolated')
    const template = catalog.import(bundle, bytes, 'rehearsal-actor', 'import').template
    const agents = bundle.artifacts.filter(item => item.kind === 'agent')
    if (bundle.manifest.secretRequirements.length && !agents.some(agent => agent.id === credentialAgentId)) throw new Error('Credential Agent is not in the Template')
    if (!bundle.manifest.secretRequirements.length && credentialAgentId !== 'none') throw new Error('A credential-free Template must use none')
    const packaged = { root: path.join(REPO_ROOT, 'SKILLS', 'custom'), version: getDashboardVersion() }
    const bindings = Object.fromEntries(agents.map(agent => [agent.id, `${agent.id}-binding`]))
    const registry = {
      apiVersion: 'clawmax.template-authority/v1alpha1', workspaceId: 'isolated', revision: 'rehearsal-v1',
      bindings: agents.map(agent => ({
        id: bindings[agent.id], revision: 'rehearsal-v1', artifactId: agent.id, artifactDigest: agent.digest,
        actorIds: ['rehearsal-actor'], disabled: false, model: { id: 'openai/rehearsal', revision: 'rehearsal-v1' },
        policy: { id: 'no-tools', sha256: sha256(JSON.stringify(noToolsTemplatePolicy('no-tools'))) },
        runtime: { platform: 'linux/arm64', revision: 'rehearsal-v1' },
        skills: agent.definition.skills.map((name: string) => {
          const embedded = agent.files?.get(`content/skills/${name}/SKILL.md`)
          return embedded
            ? { name, sha256: sha256(embedded), platform: 'linux/arm64' }
            : { name, ...describePackagedTemplateSkill(packaged, name), source: 'packaged', version: packaged.version, platform: 'linux/arm64' }
        }),
        credentials: agent.id === credentialAgentId
          ? bundle.manifest.secretRequirements.map((requirement: { name: string }) => ({ name: requirement.name, reference: 'isolated-rehearsal-placeholder', revision: 'rehearsal-v1' })) : [],
      })),
    }
    writeAtomicJson(path.join(authorityDirectory, `${sha256('isolated')}.json`), registry)
    const resolver = createConfiguredTemplateResolver({ authorityDirectory, agentStateRoot: path.join(root, 'agent-state'),
      runtime: { platform: 'linux/arm64', revision: 'rehearsal-v1' }, client: {
        getConfig: async () => ({ hash: gateway.hash, sourceConfig: { agents: { entries: structuredClone(gateway.entries) } } }),
        patchTemplateAgentEntriesAtRevision: async (entries, hash) => {
          assert.equal(hash, gateway.hash)
          for (const [id, entry] of Object.entries(entries)) { if (entry === null) delete gateway.entries[id]; else gateway.entries[id] = entry }
          gateway.hash = `${Number(gateway.hash) + 1}`
        },
        runNoToolsTemplateAgent: async () => { throw new Error('Rehearsal must not execute an Agent') },
      } })
    const service = resolver({ workspaceId: 'isolated', workspacePath: workspace, actorId: 'rehearsal-actor' })
    service.assertStagingAvailable!()
    const request = { templateId: template.id, expectedRevision: null, idempotencyKey: 'rehearsal-apply', bindings }
    const beforePlan = fs.readdirSync(workspace).sort()
    const plan = await service.store.plan('rehearsal-actor', request)
    assert.deepEqual(fs.readdirSync(workspace).sort(), beforePlan, 'Plan wrote workspace state')
    const applied = await service.coordinator.apply('rehearsal-actor', request, plan.planDigest)
    assert(applied.created)
    const expectedCounts = {
      agents: agents.length,
      communities: bundle.artifacts.filter(item => item.kind === 'community').length,
      groups: bundle.artifacts.filter(item => item.kind === 'group').length,
      workflows: bundle.artifacts.filter(item => item.kind === 'workflow').length,
    }
    assert.deepEqual(Object.fromEntries(Object.entries(applied.revision.resources).map(([kind, ids]) => [kind, Object.keys(ids).length])), expectedCounts)
    assert.equal(Object.keys(gateway.entries).length, agents.length)
    assert(Object.values(gateway.entries).every((entry: any) => entry.skills.length === 0 && entry.tools.deny[0] === '*' && entry.heartbeat.every === '0m'))
    const embeddedSkills = agents.flatMap(agent => agent.definition.skills.filter((name: string) => agent.files?.has(`content/skills/${name}/SKILL.md`)))
    for (const skillName of embeddedSkills) assert(fs.existsSync(path.join(workspace, `SKILLS/custom/${skillName}/SKILL.md`)))
    for (const agent of agents) for (const skillName of agent.definition.skills) {
      if (!agent.files?.has(`content/skills/${skillName}/SKILL.md`)) assert(!fs.existsSync(path.join(workspace, `SKILLS/custom/${skillName}`)), 'Packaged Skill must remain host-owned')
    }
    for (const id of Object.values(applied.revision.resources.workflows)) assert.equal(JSON.parse(fs.readFileSync(path.join(workspace, `WORKFLOWS/${id}.json`), 'utf8')).enabled, false)
    for (const id of Object.values(applied.revision.resources.groups)) assert.equal(JSON.parse(fs.readFileSync(path.join(workspace, `ORG/template-groups/${id}.json`), 'utf8')).state, 'stopped')
    const credentialAgent = applied.revision.resources.agents[credentialAgentId]
    if (credentialAgent) await assert.rejects(service.coordinator.verifyStagedExecution('rehearsal-actor', applied.revision.id, credentialAgent, service.authority, service.policies), /policy is unavailable/, 'Credential-bearing Agent must remain non-executable')
    if (!keepPreview) {
      const cleanupPlan = service.store.planCleanup('rehearsal-actor', applied.revision.id, applied.revision.id, () => {})
      const cleaned = await service.coordinator.cleanup('rehearsal-actor', applied.revision.id, applied.revision.id, cleanupPlan.planDigest, () => {})
      assert(cleaned.removed)
      for (const skillName of embeddedSkills) assert(!fs.existsSync(path.join(workspace, `SKILLS/custom/${skillName}/SKILL.md`)))
      assert.equal(Object.keys(gateway.entries).length, 0)
    }
    console.log(JSON.stringify({ result: 'pass', templateSha256: expectedZipSha256, revisionId: applied.revision.id, resources: Object.fromEntries(Object.entries(applied.revision.resources).map(([kind, ids]) => [kind, Object.keys(ids).length])), embeddedSkillsStaged: embeddedSkills.length, packagedSkillsPreserved: true, executionBlocked: true, ...(keepPreview ? { previewWorkspace: workspace } : { cleaned: true }) }))
  } finally {
    if (!keepPreview) fs.rmSync(root, { recursive: true, force: true })
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
