/** Disposable, offline Template staging rehearsal. Never points at a live workspace. */
import assert from 'assert'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { InstanceTemplateCatalog, writeAtomicJson } from './instance-template-catalog'
import { sha256, validatePortableTemplate } from './portable-template'
import { noToolsTemplatePolicy } from './template-execution-policy'
import { createConfiguredTemplateResolver } from './template-service'

async function main() {
  const zipPath = process.argv[2]
  const expectedZipSha256 = process.argv[3]
  const expectedSkillSha256 = process.argv[4]
  if (!zipPath || !/^[a-f0-9]{64}$/.test(expectedZipSha256 || '') || !/^[a-f0-9]{64}$/.test(expectedSkillSha256 || '')) throw new Error('Usage: ts-node template-local-rehearsal.ts <private-zip> <zip-sha256> <skill-md-sha256>')
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
    const bindings = Object.fromEntries(agents.map(agent => [agent.id, `${agent.id}-binding`]))
    const registry = {
      apiVersion: 'clawmax.template-authority/v1alpha1', workspaceId: 'isolated', revision: 'rehearsal-v1',
      bindings: agents.map(agent => ({
        id: bindings[agent.id], revision: 'rehearsal-v1', artifactId: agent.id, artifactDigest: agent.digest,
        actorIds: ['rehearsal-actor'], disabled: false, model: { id: 'openai/rehearsal', revision: 'rehearsal-v1' },
        policy: { id: 'no-tools', sha256: sha256(JSON.stringify(noToolsTemplatePolicy('no-tools'))) },
        runtime: { platform: 'linux/arm64', revision: 'rehearsal-v1' },
        skills: agent.definition.skills.map((name: string) => ({ name, sha256: expectedSkillSha256, platform: 'linux/arm64' })),
        credentials: agent.definition.skills.length ? [{ name: 'MAXIMILIEN_ACCESS_TOKEN', reference: 'host-broker-pending', revision: 'rehearsal-v1' }] : [],
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
    assert.deepEqual(Object.fromEntries(Object.entries(applied.revision.resources).map(([kind, ids]) => [kind, Object.keys(ids).length])), { agents: 4, communities: 1, groups: 3, workflows: 3 })
    assert.equal(Object.keys(gateway.entries).length, 4)
    assert(Object.values(gateway.entries).every((entry: any) => entry.skills.length === 0 && entry.tools.deny[0] === '*' && entry.heartbeat.every === '0m'))
    const installedSkill = path.join(workspace, 'SKILLS/custom/maximilien/SKILL.md')
    assert.equal(sha256(fs.readFileSync(installedSkill)), expectedSkillSha256)
    for (const id of Object.values(applied.revision.resources.workflows)) assert.equal(JSON.parse(fs.readFileSync(path.join(workspace, `WORKFLOWS/${id}.json`), 'utf8')).enabled, false)
    const collector = applied.revision.resources.agents.collector
    assert(collector)
    await assert.rejects(service.coordinator.verifyStagedExecution('rehearsal-actor', applied.revision.id, collector, service.authority, service.policies), /policy is unavailable/, 'Skill-bearing Agent must remain non-executable')
    const cleanupPlan = service.store.planCleanup('rehearsal-actor', applied.revision.id, applied.revision.id, () => {})
    const cleaned = await service.coordinator.cleanup('rehearsal-actor', applied.revision.id, applied.revision.id, cleanupPlan.planDigest, () => {})
    assert(cleaned.removed)
    assert(!fs.existsSync(installedSkill))
    assert.equal(Object.keys(gateway.entries).length, 0)
    console.log(JSON.stringify({ result: 'pass', templateSha256: expectedZipSha256, revisionId: applied.revision.id, resources: Object.fromEntries(Object.entries(applied.revision.resources).map(([kind, ids]) => [kind, Object.keys(ids).length])), skillInstalledThenCleaned: true, executionBlocked: true }))
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
