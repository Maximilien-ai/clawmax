import assert from 'assert'
import { templateFixture } from './portable-template.test'
import { validatePortableTemplate, sha256 } from './portable-template'
import { revalidateTemplateAuthority, resolveTemplateAuthority, type TemplateAuthorityRegistry } from './template-authority'
import { assertTemplateRuntimeAdmitted } from './template-runtime-admission'

async function main() {
  const bundle = await validatePortableTemplate(await templateFixture())
  const context = { workspaceId: 'workspace', actorId: 'operator' }
  const original: TemplateAuthorityRegistry = {
    apiVersion: 'clawmax.template-authority/v1alpha1', workspaceId: 'workspace', revision: 'v1',
    bindings: bundle.artifacts.filter(item => item.kind === 'agent').map(agent => ({
      id: `${agent.id}-binding`, revision: 'v1', artifactId: agent.id, artifactDigest: agent.digest,
      actorIds: ['operator'], disabled: false, model: { id: 'ollama/qwen', revision: 'v1' },
      policy: { id: 'no-tools', sha256: 'a'.repeat(64) },
      runtime: { platform: 'linux/arm64', revision: 'v1' }, skills: [], credentials: [],
    })),
  }
  let registry = structuredClone(original)
  let reads = 0
  const source = { read: () => { reads++; return registry }, runtime: { platform: 'linux/arm64', revision: 'v1' } }
  const selections = Object.fromEntries(original.bindings.map(binding => [binding.artifactId, binding.id]))
  const { digest, ...evidence } = resolveTemplateAuthority(bundle, selections, context, source)
  let passed = 0
  function test(name: string, run: () => void) {
    registry = structuredClone(original)
    run()
    passed++
    console.log(`✓ ${name}`)
  }
  const check = () => revalidateTemplateAuthority(evidence, digest, context, source)
  const denied = (fn: () => unknown) => assert.throws(fn, (error: any) => error.code === 'template_authority_unavailable' && error.status === 409)

  test('unchanged committed identities revalidate without granting runtime execution', () => {
    assert.deepStrictEqual(check(), evidence)
    assert.throws(() => assertTemplateRuntimeAdmitted('tr-0123456789abcdef-agent-0123456789ab'), /execution is unavailable/)
  })
  test('revalidation reads fresh authority and observes revocation without a revision bump', () => {
    const before = reads
    check()
    registry.bindings[0].actorIds = ['other']
    denied(check)
    registry.bindings[0].actorIds = ['operator']
    check()
    assert.strictEqual(reads, before + 3)
  })
  test('disabled or removed bindings fail closed', () => {
    registry.bindings[0].disabled = true
    denied(check)
    registry = structuredClone(original)
    registry.bindings.shift()
    denied(check)
  })
  test('binding, artifact, model and policy changes invalidate committed identities', () => {
    for (const mutate of [
      (binding: typeof registry.bindings[0]) => { binding.revision = 'v2' },
      (binding: typeof registry.bindings[0]) => { binding.artifactId = 'different' },
      (binding: typeof registry.bindings[0]) => { binding.artifactDigest = `sha256:${'b'.repeat(64)}` },
      (binding: typeof registry.bindings[0]) => { binding.model.id = 'ollama/different' },
      (binding: typeof registry.bindings[0]) => { binding.model.revision = 'v2' },
      (binding: typeof registry.bindings[0]) => { binding.policy.sha256 = 'b'.repeat(64) },
    ]) {
      registry = structuredClone(original)
      mutate(registry.bindings[0])
      denied(check)
    }
  })
  test('new Skill or credential authority cannot be inherited from current registry', () => {
    registry.bindings[0].skills.push({ name: 'collector', sha256: 'b'.repeat(64), platform: 'linux/arm64' })
    denied(check)
    registry = structuredClone(original)
    registry.bindings[1].credentials.push({ name: 'COLLECTOR_TOKEN', reference: 'collector-only', revision: 'v1' })
    denied(check)
  })
  test('workspace, actor, registry revision and runtime are checked independently', () => {
    denied(() => revalidateTemplateAuthority(evidence, digest, { ...context, workspaceId: 'other' }, source))
    denied(() => revalidateTemplateAuthority(evidence, digest, { ...context, actorId: 'other' }, source))
    registry.workspaceId = 'other'
    denied(check)
    registry = structuredClone(original)
    registry.revision = 'v2'
    denied(check)
    registry = structuredClone(original)
    denied(() => revalidateTemplateAuthority(evidence, digest, context, { ...source, runtime: { ...source.runtime, revision: 'v2' } }))
  })
  test('tampered evidence or digest never reaches the authority source', () => {
    const before = reads
    denied(() => revalidateTemplateAuthority(evidence, sha256('tampered'), context, source))
    const changed = structuredClone(evidence)
    changed.bindings[0].model.id = 'ollama/unapproved'
    denied(() => revalidateTemplateAuthority(changed, digest, context, source))
    assert.strictEqual(reads, before)
  })
  test('registry corruption, ambiguity and read failures are sanitized', () => {
    registry.bindings.push(structuredClone(registry.bindings[0]))
    denied(check)
    denied(() => revalidateTemplateAuthority(evidence, digest, context, { ...source, read: () => ({ sentinelSecret: 'never disclose' }) }))
    assert.throws(() => revalidateTemplateAuthority(evidence, digest, context, { ...source, read: () => { throw new Error('/private/sentinel-secret') } }), (error: any) => error.code === 'template_authority_unavailable' && !error.message.includes('sentinel-secret'))
  })
  test('malformed, empty or overbroad evidence is rejected before registry access', () => {
    const before = reads
    for (const value of [null, {}, { ...evidence, bindings: [] }, { ...evidence, extraSecret: 'sentinel' }]) {
      denied(() => revalidateTemplateAuthority(value as any, digest, context, source))
    }
    assert.strictEqual(reads, before)
  })
  test('return values are isolated and omit actor ACLs', () => {
    const result = check()
    assert(!JSON.stringify(result).includes('actorIds'))
    result.bindings[0].model.id = 'changed-after-check'
    assert.deepStrictEqual(check(), evidence)
    assert.deepStrictEqual(registry, original)
  })
  test('unrelated authorized actors do not expand the returned grant', () => {
    registry.bindings[0].actorIds.push('another-authorized-actor')
    assert.deepStrictEqual(check(), evidence)
  })
  console.log(`${passed} Template authority revalidation tests passed`)
}
main().catch(error => { console.error(error); process.exitCode = 1 })
