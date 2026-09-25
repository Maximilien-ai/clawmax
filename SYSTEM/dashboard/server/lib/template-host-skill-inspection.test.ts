import assert from 'assert'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { templateFixture } from './portable-template.test'
import { sha256, validatePortableTemplate } from './portable-template'
import { noToolsTemplatePolicy } from './template-execution-policy'
import { resolveTemplateAuthority } from './template-authority'
import { inspectTemplateHostSkill } from './template-host-skill-inspection'
import type { TemplateRevisionStore } from './template-revisions'

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-host-skill-inspect-'))
  try {
    const bundle = await validatePortableTemplate(await templateFixture())
    const agent = bundle.artifacts.find(item => item.kind === 'agent')!
    agent.definition.skills = ['maximilien']
    bundle.manifest.secretRequirements = [{ name: 'MAXIMILIEN_ACCESS_TOKEN', required: true, sensitive: true } as any]
    const agentId = 'tr-0123456789abcdef-agent-0123456789ab'
    const skill = Buffer.from('# Maximilien\n')
    const skillFile = path.join(root, 'SKILLS/custom/maximilien/SKILL.md')
    fs.mkdirSync(path.dirname(skillFile), { recursive: true })
    fs.writeFileSync(skillFile, skill)
    const runtime = { platform: 'linux/arm64', revision: 'runtime-1' }
    const registry = {
      apiVersion: 'clawmax.template-authority/v1alpha1', workspaceId: 'isolated', revision: 'authority-1',
      bindings: bundle.artifacts.filter(item => item.kind === 'agent').map(item => ({
        id: `${item.id}-binding`, revision: 'authority-1', artifactId: item.id, artifactDigest: item.digest,
        actorIds: ['owner'], disabled: false, model: { id: 'openai/test', revision: 'model-1' },
        policy: { id: 'no-tools', sha256: sha256(JSON.stringify(noToolsTemplatePolicy('no-tools'))) }, runtime,
        skills: item.id === agent.id ? [{ name: 'maximilien', sha256: sha256(skill), platform: 'linux/arm64' }] : [],
        credentials: item.id === agent.id ? [{ name: 'MAXIMILIEN_ACCESS_TOKEN', reference: 'host-only', revision: 'v1' }] : [],
      })),
    }
    const authority = { runtime, read: () => registry }
    const selections = Object.fromEntries(registry.bindings.map(binding => [binding.artifactId, binding.id]))
    const resolved = resolveTemplateAuthority(bundle, selections, { workspaceId: 'isolated', actorId: 'owner' }, authority)
    const { digest, ...evidence } = resolved
    const revision = { authority: evidence, authorityDigest: digest, resources: { agents: { [agent.id]: agentId } } }
    const store = { workspaceId: 'isolated', workspacePath: root,
      verifyExecutionResources: (actor: string, id: string, resource: string) => {
        if (actor !== 'owner' || id !== 'revision-1' || resource !== agentId) throw new Error('not authorized')
        return structuredClone(revision)
      },
    } as unknown as TemplateRevisionStore
    const inspect = () => inspectTemplateHostSkill({ store, authority, actorId: 'owner', revisionId: 'revision-1', agentId, skillName: 'maximilien' })
    assert.deepEqual(inspect(), { workspaceId: 'isolated', workspaceRevisionId: 'revision-1', agentId, actorId: 'owner', skillName: 'maximilien', skillDigest: `sha256:${sha256(skill)}`, credentialNames: ['MAXIMILIEN_ACCESS_TOKEN'] })
    assert.throws(() => inspectTemplateHostSkill({ store, authority, actorId: 'other', revisionId: 'revision-1', agentId, skillName: 'maximilien' }), /not authorized/)
    assert.throws(() => inspectTemplateHostSkill({ store, authority, actorId: 'owner', revisionId: 'revision-1', agentId, skillName: '../maximilien' }), /unavailable/)
    registry.bindings[0].disabled = true
    assert.throws(inspect, /no longer authorized/)
    registry.bindings[0].disabled = false
    fs.writeFileSync(skillFile, 'tampered')
    assert.throws(inspect, /unavailable/)
    fs.unlinkSync(skillFile)
    fs.symlinkSync(path.join(root, 'target'), skillFile)
    assert.throws(inspect, /unavailable/)
    console.log('template-host-skill-inspection.test.ts: passed')
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
