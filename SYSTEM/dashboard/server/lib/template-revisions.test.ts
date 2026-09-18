import assert from 'assert'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { InstanceTemplateCatalog } from './instance-template-catalog'
import { sha256, validatePortableTemplate } from './portable-template'
import { templateFixture } from './portable-template.test'
import { TemplateCompiler, TemplateRevisionStore } from './template-revisions'

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-revision-test-'))
  try {
    const bytes = await templateFixture()
    const catalog = new InstanceTemplateCatalog(root, 'workspace')
    const template = catalog.import(await validatePortableTemplate(bytes), bytes, 'actor', 'import').template
    let authorityDigest = sha256('server-policy-v1')
    const compiler: TemplateCompiler = (_bundle, _request, prefix) => ({
      resources: { agents: { producer: `${prefix}-producer` }, groups: {}, communities: {}, workflows: {} },
      authorityDigest,
      mutations: [{ path: `AGENTS/${prefix}-producer/IDENTITY.md`, expectedSha256: null, content: '# Synthetic producer' }],
    })
    const store = new TemplateRevisionStore(root, 'workspace', compiler)
    const request = { templateId: template.id, expectedRevision: null, idempotencyKey: 'apply-1', bindings: { producer: 'server-profile' } }
    const before = fs.readdirSync(root)
    const plan = await store.plan('actor', request)
    assert.deepEqual(fs.readdirSync(root), before, 'Planning must not write resources or state')
    assert.equal(store.history().length, 0)
    assert(!JSON.stringify(plan).includes('# Synthetic producer'), 'Plan evidence must not contain agent instructions')
    authorityDigest = sha256('server-policy-v2')
    await assert.rejects(store.apply('actor', request, plan.planDigest), /authority changed/)
    assert.equal(store.history().length, 0)
    authorityDigest = sha256('server-policy-v1')
    const results = await Promise.all([store.apply('actor', request, plan.planDigest), store.apply('actor', request, plan.planDigest)])
    assert.equal(results.filter(result => result.created).length, 1)
    assert.deepEqual(results[0].revision, results[1].revision)
    const revision = results[0].revision
    assert.equal(store.history().length, 1)
    const reopened = new TemplateRevisionStore(root, 'workspace', compiler)
    assert.equal(reopened.history()[0].id, revision.id)
    assert(!JSON.stringify(reopened.history()).includes('undo'))
    await assert.rejects(store.apply('other-actor', request, plan.planDigest), /revision changed/)
    await assert.rejects(store.apply('actor', { ...request, bindings: { producer: 'substitution' } }, plan.planDigest), /Apply key/)
    await assert.rejects(store.plan('actor', { ...request, idempotencyKey: 'apply-2' }), /revision changed/)
    fs.mkdirSync(path.join(root, 'AGENTS', 'unrelated'), { recursive: true })
    fs.writeFileSync(path.join(root, 'AGENTS', 'unrelated', 'IDENTITY.md'), 'preserve')
    assert.throws(() => store.cleanup('other-actor', revision.id, revision.id, () => {}), /not authorized/)
    assert.throws(() => store.cleanup('actor', revision.id, revision.id, () => { throw new Error('Group is active') }), /Group is active/)
    const file = path.join(root, plan.changes[0].path)
    fs.writeFileSync(file, 'external edit')
    assert.throws(() => store.cleanup('actor', revision.id, revision.id, () => {}), /changed after planning/)
    assert.equal(fs.readFileSync(file, 'utf8'), 'external edit')
    fs.writeFileSync(file, '# Synthetic producer')
    catalog.remove(template.id)
    assert(fs.existsSync(file), 'Catalog removal must not remove applied resources')
    const cleaned = store.cleanup('actor', revision.id, revision.id, () => {})
    assert(cleaned.removed)
    assert(!fs.existsSync(file))
    assert.equal(fs.readFileSync(path.join(root, 'AGENTS', 'unrelated', 'IDENTITY.md'), 'utf8'), 'preserve')
    assert(!store.cleanup('actor', revision.id, cleaned.currentRevision, () => {}).removed)
    assert.equal(store.history().length, 1, 'Cleanup preserves revision history')
    await assert.rejects(store.apply('actor', request, plan.planDigest), /cleaned revision/)
    console.log('template-revisions.test.ts: passed')
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
