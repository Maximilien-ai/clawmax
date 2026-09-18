import assert from 'assert'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { templateFixture } from './portable-template.test'
import { validatePortableTemplate } from './portable-template'
import { InstanceTemplateCatalog } from './instance-template-catalog'
import { TemplateRevisionStore } from './template-revisions'
import { createTemplateResourceFileCompiler } from './template-resource-files'
import { readTemplateAuthorityRegistry, resolveTemplateAuthority, TemplateAuthorityRegistry } from './template-authority'
import { assertTemplateRuntimeAdmitted } from './template-runtime-admission'

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-authority-'))
  try {
    const bytes = await templateFixture()
    const bundle = await validatePortableTemplate(bytes)
    const registry: TemplateAuthorityRegistry = {
      apiVersion: 'clawmax.template-authority/v1alpha1', workspaceId: 'workspace', revision: 'registry-v1',
      bindings: bundle.artifacts.filter(item => item.kind === 'agent').map(agent => ({
        id: `${agent.id}-binding`, revision: 'v1', artifactId: agent.id, artifactDigest: agent.digest,
        actorIds: ['actor'], disabled: false,
        model: { id: 'openai/server-selected-model', revision: 'model-v1' },
        policy: { id: 'no-tools', sha256: 'a'.repeat(64) },
        runtime: { platform: 'darwin/arm64', revision: 'runtime-v1' }, skills: [], credentials: [],
      })),
    }
    const original = structuredClone(registry)
    const source = { read: () => registry, runtime: { platform: 'darwin/arm64', revision: 'runtime-v1' } }
    const context = { workspaceId: 'workspace', actorId: 'actor' }
    const selections = { producer: 'producer-binding', reviewer: 'reviewer-binding' }
    const resolved = resolveTemplateAuthority(bundle, selections, context, source)
    assert.equal(resolved.bindings[0].model.id, 'openai/server-selected-model')
    assert(!JSON.stringify(resolved).includes('actorIds'))
    assert.deepEqual(registry, original)
    registry.bindings.reverse()
    assert.equal(resolveTemplateAuthority(bundle, selections, context, source).digest, resolved.digest)
    registry.bindings.reverse()
    for (const change of [
      (value: TemplateAuthorityRegistry) => { value.revision = 'registry-v2' },
      (value: TemplateAuthorityRegistry) => { value.bindings[0].revision = 'binding-v2' },
      (value: TemplateAuthorityRegistry) => { value.bindings[0].model.id = 'openai/another-server-model' },
      (value: TemplateAuthorityRegistry) => { value.bindings[0].model.revision = 'model-v2' },
      (value: TemplateAuthorityRegistry) => { value.bindings[0].policy.sha256 = 'd'.repeat(64) },
    ]) {
      const changed = structuredClone(registry)
      change(changed)
      assert.notEqual(resolveTemplateAuthority(bundle, selections, context, { ...source, read: () => changed }).digest, resolved.digest)
    }
    assert.throws(() => resolveTemplateAuthority(bundle, selections, { ...context, actorId: 'other' }, source), /not authorized/)
    assert.throws(() => resolveTemplateAuthority(bundle, selections, { ...context, workspaceId: 'other' }, source), /another workspace/)
    assert.throws(() => resolveTemplateAuthority(bundle, { ...selections, reviewer: 'producer-binding' }, context, source), /not authorized/)
    assert.throws(() => resolveTemplateAuthority(bundle, { producer: 'producer-binding' }, context, source), /Exactly one/)
    assert.throws(() => resolveTemplateAuthority(bundle, { ...selections, group: 'producer-binding' }, context, source), /Exactly one/)
    assert.throws(() => resolveTemplateAuthority(bundle, { ...selections, producer: '/tmp/client-policy' }, context, source), /not authorized/)
    registry.bindings[0].disabled = true
    assert.throws(() => resolveTemplateAuthority(bundle, selections, context, source), /not authorized/)
    registry.bindings[0].disabled = false
    assert.throws(() => resolveTemplateAuthority(bundle, selections, context, { ...source, runtime: { ...source.runtime, revision: 'upgraded' } }), /different runtime/)
    assert.throws(() => resolveTemplateAuthority(bundle, selections, context, { ...source, read: () => ({ ...registry, password: 'sentinel-secret' }) }), /unsupported fields/)
    assert.throws(() => resolveTemplateAuthority(bundle, selections, context, { ...source, read: () => { throw new Error('/private/sentinel-secret') } }), error => !String(error).includes('sentinel-secret'))

    // Collector-only credential selection: Group membership does not distribute
    // the collector's named reference to the reviewer or other members.
    const governed = structuredClone(bundle)
    governed.artifacts[0].definition.skills = ['collector']
    governed.manifest.secretRequirements = [{ name: 'SERVICE_TOKEN', required: true }]
    const governedRegistry = structuredClone(registry)
    for (const binding of governedRegistry.bindings) binding.runtime.platform = 'linux/arm64'
    governedRegistry.bindings[0].skills = [{ name: 'collector', sha256: 'b'.repeat(64), platform: 'linux/arm64' }]
    governedRegistry.bindings[0].credentials = [{ name: 'SERVICE_TOKEN', reference: 'service-credential', revision: 'credential-v1' }]
    const governedSource = { read: () => governedRegistry, runtime: { platform: 'linux/arm64', revision: 'runtime-v1' } }
    const governedResult = resolveTemplateAuthority(governed, selections, context, governedSource)
    assert.equal(governedResult.bindings[0].credentials.length, 1)
    assert.deepEqual(governedResult.bindings[1].credentials, [])
    governedRegistry.bindings[0].credentials[0].revision = 'credential-v2'
    assert.notEqual(resolveTemplateAuthority(governed, selections, context, governedSource).digest, governedResult.digest)
    governedRegistry.bindings[0].skills.push({ name: 'extra', sha256: 'e'.repeat(64), platform: 'linux/arm64' })
    assert.throws(() => resolveTemplateAuthority(governed, selections, context, governedSource), /exact requested Skills/)
    governedRegistry.bindings[0].skills.pop()
    assert.throws(() => resolveTemplateAuthority(governed, { ...selections, reviewer: 'producer-binding' }, context, governedSource), /not authorized/)
    governedRegistry.bindings[0].credentials = []
    assert.throws(() => resolveTemplateAuthority(governed, selections, context, governedSource), /required named credential/)
    governedRegistry.bindings[0].credentials = [{ name: 'UNDECLARED_TOKEN', reference: 'service-credential', revision: 'v1' }]
    assert.throws(() => resolveTemplateAuthority(governed, selections, context, governedSource), /undeclared credential/)
    governedRegistry.bindings[0].skills[0].platform = 'linux/amd64'
    assert.throws(() => resolveTemplateAuthority(governed, selections, context, governedSource), /Skill platform/)

    // Read actual server-owned registry files; reject links and sanitize errors.
    const file = path.join(root, 'authority.json')
    const writeRegistry = () => fs.writeFileSync(file, JSON.stringify(registry), { mode: 0o600 })
    writeRegistry()
    assert.deepEqual(readTemplateAuthorityRegistry(file), registry)
    fs.symlinkSync(file, path.join(root, 'linked.json'))
    assert.throws(() => readTemplateAuthorityRegistry(path.join(root, 'linked.json')), /registry is unavailable/)
    fs.writeFileSync(file, '{broken')
    assert.throws(() => readTemplateAuthorityRegistry(file), /registry is unavailable/)
    writeRegistry()
    const workspace = path.join(root, 'workspace')
    const catalog = new InstanceTemplateCatalog(workspace, context.workspaceId)
    const template = catalog.import(bundle, bytes, context.actorId, 'import').template
    const compiler = createTemplateResourceFileCompiler(workspace, { ...source, read: () => readTemplateAuthorityRegistry(file) })
    const store = new TemplateRevisionStore(workspace, context.workspaceId, compiler)
    const request = { templateId: template.id, expectedRevision: null, idempotencyKey: 'apply', bindings: selections }
    assert.throws(() => compiler(bundle, request, 'tr-0123456789abcdef'), /context/)
    const plan = await store.plan(context.actorId, request)
    assert.equal(plan.authorityDigest, resolved.digest)
    assert.equal(plan.authority!.bindings[0].policy.id, 'no-tools')
    assert.equal(plan.authority!.bindings[0].bindingId, selections.producer)
    assert(!JSON.stringify(plan).includes('actorIds'))
    assert(!fs.existsSync(path.join(workspace, 'AGENTS')), 'Binding resolution must not write workspace resources')
    registry.bindings[0].policy.sha256 = 'c'.repeat(64); writeRegistry()
    await assert.rejects(store.apply(context.actorId, request, plan.planDigest), /authority changed/)
    assert.equal(store.history().length, 0)
    registry.bindings[0].policy.sha256 = 'a'.repeat(64); writeRegistry()
    registry.bindings[0].disabled = true; writeRegistry()
    await assert.rejects(store.apply(context.actorId, request, plan.planDigest), /not authorized/)
    registry.bindings[0].disabled = false; writeRegistry()
    const applied = await store.apply(context.actorId, request, plan.planDigest)
    assert.equal(applied.revision.authorityDigest, resolved.digest)
    assert.deepEqual(applied.revision.authority, plan.authority)
    const authorityFile = path.join(workspace, 'AGENTS', applied.revision.resources.agents.producer, 'TEMPLATE_AUTHORITY.json')
    assert.equal(JSON.parse(fs.readFileSync(authorityFile, 'utf8')).bindingId, selections.producer)
    assert.throws(() => assertTemplateRuntimeAdmitted(applied.revision.resources.agents.producer), /authority admission/)
    assert(!JSON.stringify(store.history()).includes('sentinel-secret'))
    store.cleanup(context.actorId, applied.revision.id, applied.revision.id, () => {})
    assert(!fs.existsSync(authorityFile))
    console.log('template-authority.test.ts: passed')
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
